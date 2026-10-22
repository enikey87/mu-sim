import { SAVE_KEY, type Storage } from '../engine/state'
import { safeStorage } from './storage'

/** Метаданные синхронизации: время последней записи и устройство, которое её сделало. */
export const SYNC_KEY = 'alik-cloud-sync'
/** Сколько ждать облако на старте: дольше — играем локально, облако догонит следующей записью. */
const READ_MS = 3000

export interface CloudDeps {
  /** Прочитать облачную копию прогресса (SDK площадки). Отказ означает «облака нет». */
  load?: () => Promise<Record<string, unknown>>
  /** Записать облачную копию целиком. Отказ — прогресс остаётся в локальной копии. */
  save?: (data: Record<string, string>) => Promise<void>
  /** Локальная копия: прогресс пишется в неё всегда, облако — сверху. */
  local?: Storage | null
  /** Отметка устройства в метаданных — по ней видно, чья запись победила. */
  device?: string
  now?: () => number
  /** Журнал отладки: потеря одной из копий не молчит. */
  log?: (line: string) => void
  timeoutMs?: number
}

export interface Cloud {
  /** Прочитать облако и слить с локальным: из двух копий побеждает более новая (timestamp). */
  ready(): Promise<void>
  /** Синхронный фасад для игры: чтение из памяти, запись в память, локально и в облако. */
  storage(): Storage
  /** Дождаться отправки всех записей (тесты, выгрузка перед закрытием). */
  flush(): Promise<void>
}

interface Meta { at: number; device: string }

/**
 * Облачный сейв поверх синхронного `Storage` игры (п. 1.13.3 Требований Яндекса, #1240).
 *
 * Игра читает и пишет прогресс синхронно, облако — асинхронно, поэтому между ними копия в памяти:
 * `ready()` наполняет её облаком (локальная копия остаётся страховкой), каждая запись сначала ложится
 * в память и локально, потом уходит в облако. Отказ облака партию не роняет и прогресс не теряет —
 * теряется только синхронизация, и об этом пишется строка в журнал отладки.
 *
 * Конфликт двух устройств разрешается по времени последней записи: побеждает более новая копия,
 * проигравшая называется в журнале. Часы устройств — общее допущение этой семантики.
 */
export function cloudSaves(deps: CloudDeps = {}): Cloud {
  const local = deps.local === undefined ? safeStorage() : deps.local
  const now = deps.now ?? (() => Date.now())
  const device = deps.device ?? '?'
  const log = deps.log ?? ((line: string): void => console.info(`[alik] облачные сейвы: ${line}`))
  const timeoutMs = deps.timeoutMs ?? READ_MS
  const cache = new Map<string, string>()
  let started = false
  let pending: Promise<void> = Promise.resolve()
  let pushFailed = false

  const localGet = (k: string): string | null => {
    try { return local?.getItem(k) ?? null } catch { return null }
  }
  const localSet = (k: string, v: string): void => {
    try { local?.setItem(k, v) } catch { /* локальная копия запрещена — остаётся облако */ }
  }
  const localDel = (k: string): void => {
    try { local?.removeItem(k) } catch { /* то же */ }
  }

  const stamp = (): string => JSON.stringify({ at: now(), device } satisfies Meta)
  const metaOf = (raw: string | null): Meta | null => {
    if (!raw) return null
    try {
      const v = JSON.parse(raw) as { at?: unknown; device?: unknown }
      return typeof v?.at === 'number' && Number.isFinite(v.at) ? { at: v.at, device: String(v.device ?? '?') } : null
    } catch {
      return null
    }
  }
  const when = (m: Meta | null): string =>
    m ? `${new Date(m.at).toISOString()} (${m.device})` : 'время неизвестно'

  // Записи уходят по очереди: SDK не должен получать перекрывающиеся setData. Пока запись в пути,
  // следующие не копятся — отправляется последнее состояние (ходит игра раз в ход, а не пачкой).
  let sending = false
  let dirty = false
  const push = (): Promise<void> => {
    const save = deps.save
    if (!save) return pending
    if (sending) { dirty = true; return pending }
    sending = true
    pending = pending.then(async () => {
      try {
        for (;;) {
          const body = Object.fromEntries(cache) // снимок: всё, что игра записала до него, уже внутри
          dirty = false
          try {
            await save(body)
            pushFailed = false
          } catch {
            if (!pushFailed) log('облако не приняло запись — прогресс остался в локальной копии')
            pushFailed = true
          }
          if (!dirty) break // за время записи игра ничего не дописала — второй раз то же самое не шлём
        }
      } finally {
        sending = false
      }
    })
    return pending
  }

  const storage = (): Storage => ({
    getItem(k) {
      const v = cache.get(k)
      return v !== undefined ? v : localGet(k)
    },
    setItem(k, v) {
      // прогресс — единственное, что переезжает между устройствами: отметки устройства остаются локальными
      if (k !== SAVE_KEY) { localSet(k, v); return }
      cache.set(k, v)
      cache.set(SYNC_KEY, stamp())
      localSet(k, v)
      localSet(SYNC_KEY, cache.get(SYNC_KEY)!)
      void push()
    },
    removeItem(k) {
      if (k !== SAVE_KEY) { localDel(k); return }
      // «Начать заново» должно стирать прогресс и в облаке, иначе он вернётся со следующего устройства
      cache.delete(k)
      cache.set(SYNC_KEY, stamp())
      localSet(SYNC_KEY, cache.get(SYNC_KEY)!)
      localDel(k)
      void push()
    },
  })

  async function ready(): Promise<void> {
    if (started) return
    started = true
    if (!deps.load) { log('облака нет — прогресс локальный'); return }

    let remote: Record<string, unknown> | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const raw = await Promise.race([
        deps.load(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
        }),
      ])
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) remote = raw
    } catch {
      remote = null
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (!remote) { log('облака нет — прогресс локальный'); return }

    for (const [k, v] of Object.entries(remote)) if (typeof v === 'string') cache.set(k, v)

    const remoteSave = typeof remote[SAVE_KEY] === 'string' ? (remote[SAVE_KEY] as string) : null
    const localSave = localGet(SAVE_KEY)
    const remoteMeta = metaOf(typeof remote[SYNC_KEY] === 'string' ? (remote[SYNC_KEY] as string) : null)
    const localMeta = metaOf(localGet(SYNC_KEY))

    if (localSave && remoteSave && localSave !== remoteSave) {
      // две копии: побеждает более новая, проигравшая называется в журнале — потеря не молчит
      if ((localMeta?.at ?? 0) > (remoteMeta?.at ?? 0)) {
        cache.set(SAVE_KEY, localSave)
        log(`две копии прогресса: локальная ${when(localMeta)} новее облачной ${when(remoteMeta)} — продолжаю с локальной, отправляю её в облако`)
        void push()
      } else {
        cache.set(SAVE_KEY, remoteSave)
        log(`две копии прогресса: облачная ${when(remoteMeta)} новее локальной ${when(localMeta)} — продолжаю с облачной, локальная копия больше не используется`)
      }
    } else if (localSave && !remoteSave) {
      // первый запуск сборки с облаком: прежний прогресс уезжает в облако, а не ждёт следующего хода
      cache.set(SAVE_KEY, localSave)
      log('облако пустое — прогресс с этого устройства отправлен в облако')
      void push()
    } else if (!localSave && remoteSave) {
      log('прогресс загружен из облака')
    }
  }

  return { ready, storage, flush: () => pending }
}

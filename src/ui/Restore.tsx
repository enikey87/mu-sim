import { useState } from 'react'
import type { TransferChannel } from '../platform/transfer'

export interface RestoreProps {
  channel: TransferChannel
  token: string
  /** Сохранение с сервера — ровно та строка, что лежала в localStorage на старом устройстве. */
  onRestore(save: string): void
  /** Игрок отказался: игра начинается с чистого листа, как без ссылки. */
  onSkip(): void
}

/**
 * «Восстановить партию»: показывается только когда локально пусто, а по ссылке пришёл
 * одноразовый токен переноса (#1488). Своей партии тут нет, поэтому затирать нечего.
 */
export function Restore({ channel, token, onRestore, onSkip }: RestoreProps) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  const restore = async () => {
    setState('busy')
    const save = await channel.pull(token)
    if (save) {
      onRestore(save)
      return
    }
    setState('failed')
  }

  return (
    <div className="restore">
      <div className="restore-in" role="dialog" aria-modal="true" aria-labelledby="restore-title">
        <div className="restore-icon" aria-hidden="true">📱</div>
        <small>перенос партии</small>
        <h2 id="restore-title">Тут пусто, а партия — на сервере</h2>
        <p>Вы открыли ссылку переноса. Восстановить партию с другого устройства?</p>
        {state === 'failed' && (
          <p role="alert">Не получилось: ссылка одноразовая и живёт час. Попросите в боте новую — /load.</p>
        )}
        <div className="restore-btns">
          <button type="button" onClick={() => void restore()} disabled={state === 'busy'}>
            {state === 'busy' ? 'Восстанавливаем…' : 'Восстановить партию'}
          </button>
          <button type="button" className="secondary" onClick={onSkip} disabled={state === 'busy'}>
            Начать заново
          </button>
        </div>
      </div>
    </div>
  )
}

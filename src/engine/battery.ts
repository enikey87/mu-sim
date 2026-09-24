// Заряд телефона: единственное место, которое знает, что такое «телефон сел».
// Game отдаёт события (сообщение отправлено, простой, возвращение после паузы) и исполняет
// колбеки (уведомления, таймеры, ачивки, сохранение). Мёртвый Алик — это memkeys.alik_dead, другое.
import type { GameState } from './state'

/** Что Battery просит у хозяина; вся игра — за этими пятью вызовами. */
export interface BatteryHost {
  /** Заряд пересёк порог вниз — системное уведомление. */
  low(level: number): void
  /** Заряд 0 %: гасим таймеры, открываем оверлей, сохраняемся. */
  dead(): void
  /** Анимация зарядки завершена: пачка непрочитанных «пока телефон заряжался», возобновляем жизнь. */
  chargeDone(): void | Promise<void>
  sleep(ms: number): Promise<void>
  emit(): void
  isDisposed(): boolean
  rnd(n: number): number
}

export class Battery {
  /** Телефон сел: ничего не отправляется, Алик молчит. */
  dead = false
  /** Прогресс зарядки в процентах, null — не заряжается. */
  charging: number | null = null

  constructor(
    private readonly S: GameState,
    private readonly host: BatteryHost,
  ) {}

  get level(): number {
    return this.S.battery
  }

  /** Разряд за ход (сообщение или простой). */
  drain(n = 1): void {
    if (this.dead) return
    const before = this.S.battery
    this.S.battery = Math.max(0, this.S.battery - n)
    if (before > 15 && this.S.battery <= 15) this.host.low(this.S.battery)
    if (this.S.battery === 0) this.die()
    this.host.emit()
  }

  die(): void {
    if (this.dead) return
    this.dead = true
    this.host.dead()
  }

  /** Подзарядка за время отсутствия (checkAway). */
  restore(): void {
    this.S.battery = 100
  }

  async charge(): Promise<void> {
    if (!this.dead || this.charging !== null || this.host.isDisposed()) return
    try {
      for (let p = 1; p <= 100; p += 9) {
        if (this.host.isDisposed()) return
        this.charging = p
        this.host.emit()
        await this.host.sleep(120)
      }
      if (this.host.isDisposed()) return
      this.charging = null
      this.S.battery = 100
      this.dead = false
      this.host.emit()
      await this.host.chargeDone()
    } catch (e) {
      if (!(e instanceof Error) || e.name !== 'GameDisposed') throw e
    }
  }
}

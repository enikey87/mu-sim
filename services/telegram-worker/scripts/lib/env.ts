export class MissingEnvError extends Error {
  readonly names: string[]

  constructor(names: string[]) {
    super(`не заданы обязательные настройки: ${names.join(', ')}`)
    this.name = 'MissingEnvError'
    this.names = names
  }
}

/** Значения не показываем: сообщение называет только имена настроек. */
export function requireEnv(env: Record<string, string | undefined>, names: string[]): Record<string, string> {
  const missing: string[] = []
  const values: Record<string, string> = {}
  for (const name of names) {
    const value = (env[name] ?? '').trim()
    if (!value) missing.push(name)
    else values[name] = value
  }
  if (missing.length > 0) throw new MissingEnvError(missing)
  return values
}

/** Сумма Stars — положительное целое; 25 — стартовое значение, а не «25 рублей». */
export function parseStarsAmount(raw: string | undefined): number {
  const value = Number((raw ?? '').trim())
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw new Error('stars_amount должен быть целым числом Stars от 1 до 100000')
  }
  return value
}

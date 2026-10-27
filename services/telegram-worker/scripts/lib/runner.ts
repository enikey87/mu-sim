import { spawn } from 'node:child_process'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  stdin?: string
  env?: Record<string, string | undefined>
  cwd?: string
}

/** Запуск внешней команды. Тесты подменяют раннер, чтобы проверять порядок шагов без сети. */
export type Runner = (args: string[], options?: RunOptions) => Promise<RunResult>

export class CommandFailedError extends Error {
  readonly code: number
  readonly command: string

  constructor(command: string, code: number, detail: string) {
    super(`${command} завершилась с кодом ${code}${detail ? `: ${detail}` : ''}`)
    this.name = 'CommandFailedError'
    this.code = code
    this.command = command
  }
}

export function commandRunner(binary: string, baseCwd: string): Runner {
  return (args, options = {}) =>
    new Promise<RunResult>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: options.cwd ?? baseCwd,
        env: { ...process.env, NO_COLOR: '1', CI: '1', ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { stdout += chunk })
      child.stderr.on('data', (chunk: string) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
      if (options.stdin !== undefined) child.stdin.end(options.stdin)
      else child.stdin.end()
    })
}

/** Убирает из вывода и сообщений об ошибках значения, которые нельзя показывать. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let result = text
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue
    result = result.split(secret).join('[redacted]')
  }
  return result
}

export function lastLines(text: string, limit = 20): string {
  const lines = text.trim().split('\n').filter((line) => line.trim() !== '')
  return lines.slice(-limit).join('\n')
}

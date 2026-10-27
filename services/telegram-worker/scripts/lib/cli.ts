import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { commandRunner } from './runner.ts'
import type { InstallerContext } from './project.ts'

/** Корень подпроекта: scripts/lib/ → services/telegram-worker/. */
export function projectRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url))
}

export function createContext(): InstallerContext {
  const root = projectRoot()
  return {
    projectRoot: root,
    fetchImpl: fetch,
    // npx берёт локальный wrangler из devDependencies подпроекта
    run: commandRunner('npx', root),
    env: process.env,
    log: (message) => console.log(message),
    writeFile: (path, content) => writeFile(path, content, 'utf8'),
    readFile: (path) => readFile(path, 'utf8'),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  }
}

/** Выходы шага workflow: только публичные значения. */
export async function writeOutputs(values: Record<string, string>): Promise<void> {
  const path = process.env.GITHUB_OUTPUT
  if (!path) return
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')
  await appendFile(path, `${lines}\n`, 'utf8')
}

/** Summary запуска: только публичные значения, которые можно видеть в Actions. */
export async function writeSummary(markdown: string): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) {
    console.log(markdown)
    return
  }
  await appendFile(path, `${markdown}\n`, 'utf8')
}

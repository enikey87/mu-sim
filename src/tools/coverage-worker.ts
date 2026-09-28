import { parentPort, workerData } from 'node:worker_threads'
import { ruleCoverage, type SampleSpec } from './coverage'

const { sample, freeText } = workerData as { sample: SampleSpec; freeText: number }
Object.assign(globalThis, { window: globalThis })

void ruleCoverage(sample.seeds, sample.turns, undefined, sample.grumpy, {
  freeText,
  untilEnding: sample.kind === 'main',
})
  .then((report) => parentPort!.postMessage({ ...report, kind: sample.kind }))
  .catch((error: unknown) => parentPort!.postMessage({ error: error instanceof Error ? error.stack : String(error) }))

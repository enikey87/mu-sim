// Кредитная лестница, проданные вещи и мама-запаска (docs/design/money.md, MVP 3).
import type { Due } from '../engine/time'

export type LoanId = 'consumer' | 'refi' | 'micro'
export type ThingId = 'microwave' | 'guitar' | 'tile' | 'tires'
export type MomId = 'pension' | 'pickles' | 'dacha'

export interface Loan {
  id: LoanId
  /** Ступень после взятия (1…3). */
  stage: 1 | 2 | 3
  amount: number
  payment: number
  due: Due
  offer: string
  label: string
}

export interface Thing {
  id: ThingId
  amount: number
  choice: string
  done: string
}

export interface MomHelp {
  id: MomId
  amount: number
  text: string
}

/** Три займа по порядку; четвёртая ступень — отказ платежа по микрозайму (`credit.broke`). */
export const LOANS: readonly Loan[] = [
  {
    id: 'consumer', stage: 1, amount: 30000, payment: 18000, due: { week: true },
    label: 'Платёж по кредиту «Всё будет»',
    offer: 'Вам одобрен кредит «Всё будет» — 30 000 ₽ под 39,9%. Всё будет. Проценты — точно',
  },
  {
    id: 'refi', stage: 2, amount: 25000, payment: 20000, due: { week: true },
    label: 'Платёж по кредиту на погашение кредита',
    offer: 'Одобрен кредит на погашение кредита. Мгновенно — мы вас уже знаем',
  },
  {
    id: 'micro', stage: 3, amount: 12000, payment: 16000, due: { week: true },
    label: 'Платёж МФО «Деньги-Ара»',
    offer: 'МФО «Деньги-Ара»: одобрено! Ваш поручитель — Алик? Прекрасно, он у нас уже есть',
  },
]

export const THINGS: readonly Thing[] = [
  { id: 'microwave', amount: 4500, choice: 'Продать микроволновку', done: 'Микроволновку забрали. Разогревать больше нечего' },
  { id: 'guitar', amount: 7000, choice: 'Продать гитару', done: 'Гитару увезли. Струны ещё звучали в подъезде' },
  { id: 'tile', amount: 3500, choice: 'Продать плитку с объекта Алика', done: 'Плитку с объекта Алика продали. Он сказал «это была твоя»' },
  { id: 'tires', amount: 9000, choice: 'Продать зимнюю резину', done: 'Зимнюю резину продали. Летом. Машины у вас нет' },
]

export const MOM_HELPS: readonly MomHelp[] = [
  { id: 'pension', amount: 1500, text: 'перевела с пенсии 1 500 ₽. Не говори папе' },
  { id: 'pickles', amount: 4000, text: 'продала соседке закатки. Огурцы были хорошие, соседка плачет' },
  { id: 'dacha', amount: 45000, text: 'продала дачу. Помидоры всё равно не росли' },
]

export const MOM_DONE_TEXT = 'Сынок, я всё. Проси у Алика. Он же тебе должен?'

export const creditStage = 'credit.stage'
export const creditOffer = 'credit.offer'
export const creditBroke = 'credit.broke'
export const momDone = 'mom.done'

export const sold = (id: ThingId): string => `sold.${id}`
export const momHelp = (id: MomId): string => `mom.${id}`
export const loanTaken = (id: LoanId): string => `credit.${id}.taken`
export const loanDueAt = (id: LoanId): string => `credit.${id}.dueAt`

export const nextLoan = (stage: number): Loan | null =>
  LOANS.find((l) => l.stage === stage + 1) ?? null

export const nextThing = (mem: Record<string, unknown>): Thing | null =>
  THINGS.find((t) => !mem[sold(t.id)]) ?? null

export const allSold = (mem: Record<string, unknown>): boolean =>
  THINGS.every((t) => !!mem[sold(t.id)])

export const nextMom = (mem: Record<string, unknown>): MomHelp | null => {
  if (mem[momDone]) return null
  return MOM_HELPS.find((h) => !mem[momHelp(h.id)]) ?? null
}

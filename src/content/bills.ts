// Обязательные платежи по календарю (docs/design/money.md, MVP 2).
import type { Due } from '../engine/time'
import { evicted, lightOff, netRation, phoneWarn } from './memkeys'

export type BillId = 'rent' | 'phone' | 'transit'

export interface Bill {
  id: BillId
  label: string
  amount: number
  due: Due
  skip?: (mem: Record<string, unknown>) => boolean
}

export const BILLS: readonly Bill[] = [
  { id: 'rent', label: 'Коммуналка', amount: 2500, due: { monthEnd: 0 }, skip: (m) => !!m[evicted] },
  { id: 'phone', label: 'Связь', amount: 400, due: { weekday: 1 } },
  { id: 'transit', label: 'Проездной', amount: 500, due: { week: true } },
]

export const billDueAt = (id: BillId): string => `bills.${id}.dueAt`
export const billDue = (id: BillId): string => `bills.${id}.due`
export const billUnpaid = (id: BillId): string => `bills.${id}.unpaid`
export const billStreak = (id: BillId): string => `bills.${id}.streak`

export { lightOff, netRation, phoneWarn }

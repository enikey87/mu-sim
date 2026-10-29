// Классификация ачивок для досье (#1538): скрытая прячет неполученную плитку за «???»,
// видимая — цель-приманка с именем и условием. Классы — данные, сторож держит полноту реестра.
import { describe, it, expect } from 'vitest'
import { ACH, ACH_HIDDEN, ACH_VISIBLE, ACH_HIDDEN_PREFIX, achHidden } from './achievements'

describe('классификация ачивок досье', () => {
  it('каждая ачивка реестра — скрытая или видимая, без пропусков', () => {
    const listed = new Set<string>([...ACH_HIDDEN, ...ACH_VISIBLE])
    for (const id of Object.keys(ACH)) {
      const prefixed = ACH_HIDDEN_PREFIX.some((p) => id.startsWith(p))
      expect(listed.has(id) || prefixed, `unclassified achievement ${id}`).toBe(true)
    }
  })

  it('ни один ключ не в двух списках сразу, и оба списка — про существующие ачивки', () => {
    const hidden = new Set<string>(ACH_HIDDEN)
    for (const id of ACH_VISIBLE) {
      expect(hidden.has(id), id).toBe(false)
      expect(ACH[id], id).toBeDefined()
    }
    for (const id of ACH_HIDDEN) expect(ACH[id], id).toBeDefined()
  })

  it('динамические ключи скрыты, видимые — нет: спойлер держится префиксом, а не перечислением', () => {
    for (const id of ['arc_beton', 'fin_boris_any', 'end_family', 'q_hash']) expect(achHidden(id), id).toBe(true)
    for (const id of ACH_VISIBLE) expect(achHidden(id), id).toBe(false)
  })
})

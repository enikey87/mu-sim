// Сверка шпаргалки ENDINGS.md с кодом (#717): каждое условие в шпаргалке существует в коде,
// убранных условий в ней нет. Возврат старого условия — красный.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FINALES, ENDINGS } from './finales'

const DOC = readFileSync('ENDINGS.md', 'utf8')

describe('ENDINGS.md: условия шпаргалки — из кода (#717)', () => {
  it('не называет убранных условий', () => {
    // real больше не требует поимок и квестов (rules/payday.ts: Payday_real)
    expect(DOC).not.toMatch(/квесты|quests/)
    // notyou — любой финал Размика, без счётчика криков
    expect(DOC).not.toMatch(/8\+? криков/)
    // lavash — только крипта, поимка не нужна
    expect(DOC).not.toMatch(/поимка \+ крипта|поймать великую отмазку.*и.*крипт/)
    // ram — без трофеев, alik — без забора, honest — без трёх финалов и без 1 550
    expect(DOC).not.toMatch(/2\+ трофея|ни одного крика|три финала|1 550/)
    // вендетта — 15 криков, без жара и без 25
    expect(DOC).not.toMatch(/25\+? криков|жар[ае]?\s*≥|HEAT ≥ 5/)
  })

  it('называет действующие условия — по одному-двумя фактам', () => {
    // real: святость + суд
    expect(DOC).toMatch(/Святой.*(?:\*\*)?и(?:\*\*)?.*суд|Святой» .* заседание суда/)
    // vendetta: 15 криков без извинений
    expect(DOC).toMatch(/15 криков/)
    // notyou: любой финал Размика
    expect(DOC).toMatch(/любой\*\* финал сериала Размика|финал сериала Размика/)
    // honest: один финал Гранта, сумма из факта финала
    const pay = (FINALES.grant.find((f) => f.id === 'ally')!.fx!.pay as number).toLocaleString('ru-RU').replace(/\u00A0/g, ' ')
    expect(DOC).toContain(`Один финал — «Союзник» Гранта`)
    expect(DOC).toContain(`${pay} ₽`)
    // иерархия исходов бонусами — как в rules/payday.ts
    expect(DOC).toMatch(/real.*4.*lavash.*3.*coins.*2/)
  })

  it('каждая концовка упомянута шпаргалкой', () => {
    for (const e of ENDINGS) {
      const title = e.title.replace(/^День выплаты: /, '')
      expect(DOC, e.id).toContain(title)
    }
    // частные финалы, от которых зависят концовки, названы
    expect(DOC).toContain('«Жених»')
    expect(DOC).toContain('«Союзник»')
  })
})

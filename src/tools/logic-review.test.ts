// Постоянные логические плейтесты: журнал фактов игрока против каждой реплики и каждого
// варианта ответа (включая невыбранные). Метод — «факт-журнал» слепого рецензента
// (REVIEW_PROMPT.md, категории 1/3/6/12); здесь он работает на каждом PR, а не раз в цикл.
// Негативные контроли: каждая проверка доказана красной на подсаженном дефекте ниже.
import { describe, it, expect } from 'vitest'
import { playtest } from './playtest'
import { logicReview, logicFindings, PERSON_RE, sumsIn, type Ev, type OfferRec } from './logic-review'
import { P_VIA_MAMA } from '../content/rules/player-choice-pools'
import { CAST } from '../content/arcs'
import { EXTRAS } from '../content/ids'

const ev = (at: number, side: Ev['side'], text: string, who?: string, sys?: boolean): Ev => ({ at, side, text, who, sys })
const offer = (turn: number, at: number, texts: string[], scene?: (string | null)[]): OfferRec => ({ turn, at, texts, scene })

describe('логический разбор: самопроверка на подсаженных дефектах', () => {
  it('дубль в одном блоке ловится, разные строки — нет', () => {
    const t = 'Алик, где деньги? Они нужны мне на материалы'
    expect(logicReview([ev(0, 'game', 'Привет, брат')], [offer(0, 1, [t, t])])).toMatchObject([{ id: 'dup-block' }])
    expect(logicReview([ev(0, 'game', 'Привет, брат')], [offer(0, 1, [t, t + '!'])])).toEqual([])
  })

  it('дословный повтор < 20 ходов игрока ловится; ≥ 20, кнопка сцены, via и лейбл перевода — легальны', () => {
    const t = 'Алик, я услышал твою последнюю отмазку и хочу обсудить детали'
    const intro = [ev(0, 'game', 'Привет. Денег нет', 'alik')]
    expect(logicReview(intro, [offer(0, 1, [t]), offer(5, 2, [t])])).toMatchObject([{ id: 'repeat-window' }])
    expect(logicReview(intro, [offer(0, 1, [t]), ...Array.from({ length: 20 }, (_, k) => offer(k + 1, 2, ['Нет'])), offer(21, 3, [t])])).toEqual([])
    expect(logicReview(intro, [offer(0, 1, [t], [null]), offer(5, 2, [t], ['barter'])])).toEqual([])
    expect(logicReview([ev(0, 'game', 'Мама дома, Карине тоже', 'alik')], [offer(0, 1, [P_VIA_MAMA[0]]), offer(5, 2, [P_VIA_MAMA[0]])])).toEqual([])
    expect(logicReview(intro, [offer(0, 1, ['Спасибо за 50 ₽… А остальные?']), offer(5, 2, ['Спасибо за 51 ₽… А остальные?'])])).toEqual([])
    expect(logicReview(intro, [offer(0, 1, ['Нет']), offer(1, 2, ['Нет'])])).toEqual([])
  })

  it('интерполированный лейбл P_TRANSFER дословно в окне < 20 — легальный повтор r196+ (живой seed-16)', () => {
    const intro = [ev(0, 'game', 'Привет. Денег нет', 'alik')]
    // seed-16 r197: пул выгорел, лейбл старейшей строки повторён через 9 ходов игрока
    expect(logicReview(intro, [offer(0, 1, ['Те 50 ₽ получил. А остальные деньги когда?']), offer(5, 2, ['Те 50 ₽ получил. А остальные деньги когда?'])])).toEqual([])
    // другой лейбл того же пула — легален так же (шаблон не схлопывает разные строки в одну)
    expect(logicReview(intro, [offer(0, 1, ['Спасибо за 50 ₽… А остальные?']), offer(5, 2, ['Спасибо за 50 ₽… А остальные?'])])).toEqual([])
    // контроль: обычный текст пула по-прежнему ловится
    expect(logicReview(intro, [offer(0, 1, ['Алик, это шутка? Это не смешно']), offer(5, 2, ['Алик, это шутка? Это не смешно'])])).toMatchObject([{ id: 'repeat-window' }])
  })

  it('вариант-фантом: имя персонажа до знакомства ловится; после реплики/упоминания — нет; Алик известен всегда', () => {
    const t = 'Карине, передайте Алику, что плитка ждёт'
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, [t])])).toMatchObject([{ id: 'phantom-person', why: expect.stringContaining('karine') }])
    expect(logicReview([ev(0, 'game', 'Жена услышала и молчит', 'alik'), ev(1, 'game', 'Я всё передам', 'karine')], [offer(2, 2, [t])])).toEqual([])
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Алик, где деньги?'])])).toEqual([])
  })

  it('вариант-фантом: неведённая сумма ловится; названная игрой, годы и сроки — нет', () => {
    expect(sumsIn('60 000 у меня в фундаменте')).toEqual(new Set(['60000']))
    expect(sumsIn('до 2027, где-то через 30 дней')).toEqual(new Set())
    const t = '60 000 у меня в фундаменте, я всё понял'
    expect(logicReview([ev(0, 'game', 'Денег нет', 'alik')], [offer(0, 1, [t])])).toMatchObject([{ id: 'phantom-sum' }])
    expect(logicReview([ev(0, 'game', 'Твои 60 000 в фундаменте', 'alik')], [offer(1, 1, [t])])).toEqual([])
    expect(logicReview([ev(0, 'game', 'Денег нет', 'alik')], [offer(0, 1, ['Алик, где мои 240 000?'])])).toEqual([])
  })

  it('сумма словами — тот же факт журнала, что цифрами (живой seed-4: «Пятьдесят четыре тысячи» → «54 000»)', () => {
    const burned = [ev(0, 'game', 'Тиграна не существует. Наследства тоже. Пятьдесят четыре тысячи отдал за знакомство с двумя мошенниками.', 'alik')]
    expect(logicReview(burned, [offer(1, 2, ['Откуда у вас 54 000, если денег нет?'])])).toEqual([])
    // контроль: до этой строки сумма не называлась — вариант остаётся фантомом
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Откуда у вас 54 000, если денег нет?'])])).toMatchObject([{ id: 'phantom-sum' }])
    // слова в варианте не разбираются: «три тысячи» сокращает названное игрой «с мясом — три» (живой seed-1)
    expect(logicReview([ev(0, 'game', 'С картошкой — две тысячи, с мясом — три.', 'alik')], [offer(1, 2, ['Аванс пирожками — зачтено. С мясом — три тысячи, я запомнил.'])])).toEqual([])
  })

  it('названный долг виден игроку в шапке: суд-вариант «он мне должен N» не фантом (живой seed-5)', () => {
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Ваша честь, он мне должен 237 500!'])])).toEqual([])
    // контроль: та же сумма без опоры на счётчик долга — по-прежнему фантом
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Вы говорили про 237 500?'])])).toMatchObject([{ id: 'phantom-sum' }])
  })

  it('сцена choice: игрок выбирает отмазку Алика — проверяем его мир, а не знание игрока (живой seed-17:169)', () => {
    const intro = [ev(0, 'game', 'Привет', 'alik')]
    const deck = ['Подрядчик субподрядчика субподрядчика не заплатил, цепочка', 'Жена сказала, что ты хороший. А хорошие люди умеют ждать. Ты же не хочешь её разочаровать', 'Гидроизоляция не пропускает деньги']
    expect(logicReview(intro, [offer(0, 1, deck, ['choice', 'choice', 'choice'])])).toEqual([])
    // контроль: та же строка без сцены — вариант игрока, Карине до знакомства фантом
    expect(logicReview(intro, [offer(0, 1, [deck[1]])])).toMatchObject([{ id: 'phantom-person', why: expect.stringContaining('karine') }])
  })

  it('мама — премисса партии: вариант о ней с первого хода не фантом, чужая родня — фантом', () => {
    // живой seed-1/543117: «Мама спрашивает, почему я до сих пор ем у неё» — своя мама игрока
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Алик, извините, что беспокою. Мама спрашивает, почему я до сих пор ем у неё.'])])).toEqual([])
    // «твоя мама» — родовое родство (как «тётя»), а не знакомство с Мамой Алика
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Алик!! Я позвоню твоей маме!!!'])])).toEqual([])
    // контроль: любой другой персонаж до знакомства — по-прежнему фантом
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Передайте Самвелу, что плитка ждёт'])])).toMatchObject([{ id: 'phantom-person', why: expect.stringContaining('samvel') }])
  })

  it('«заложены» — не Карине: хвост «жен…» ловится только целым словом (живой seed-25)', () => {
    expect(PERSON_RE.karine.test('Раз мои деньги заложены в фундамент, дом отчасти мой.')).toBe(false)
    expect(PERSON_RE.karine.test('Жена услышала и молчит')).toBe(true)
    expect(PERSON_RE.karine.test('Отдай хотя бы жене')).toBe(true)
    const variant = 'Раз мои деньги заложены в фундамент, дом отчасти мой. Я попросил бы комнату. Угловую.'
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, [variant])])).toEqual([])
    // контроль: настоящая ссылка на Карине до знакомства — фантом
    expect(logicReview([ev(0, 'game', 'Привет', 'alik')], [offer(0, 1, ['Карине, передайте Алику, что плитка ждёт'])])).toMatchObject([{ id: 'phantom-person', why: expect.stringContaining('karine') }])
  })

  it('пишет незнакомец — ловится; представленный упоминанием, самопредставлением или сценой — нет', () => {
    expect(logicReview([ev(0, 'game', 'Я за плитку', 'samvel')], [])).toMatchObject([{ id: 'stranger-speaker' }])
    expect(logicReview([ev(0, 'game', 'Дядя Самвел передаёт привет', 'alik'), ev(1, 'game', 'Я за плитку', 'samvel')], [])).toEqual([])
    // самопредставление: «Это домофон» — реплика называет себя (домофон, дебют коллекторов)
    expect(logicReview([ev(0, 'game', 'Это домофон. Конец связи.', 'intercom')], [])).toEqual([])
    // открытая сцена: sys-строка группы открывает семейный суд — родня говорит легально
    expect(logicReview([ev(0, 'me', 'АЛИК, Я ИДУ В СУД'), ev(1, 'game', 'Дядя Самвел добавил вас в группу «Семья»', undefined, true), ev(2, 'game', 'Прикрепляю скрины', 'karine')], [])).toEqual([])
    // хор в ниоткуда: ни упоминания, ни самопредставления, ни сцены — класс SPEAKS-аудита
    expect(logicReview([ev(0, 'me', 'Где деньги?'), ev(1, 'game', 'Алик, ты меня не видел', 'garik')], [])).toMatchObject([{ id: 'stranger-speaker' }])
  })

  it('фото платёжки показывает барана — реакция «тут баран» не фантом', () => {
    const stream = [ev(0, 'game', 'Вот платёжка', 'alik'), { at: 1, side: 'game' as const, text: 'Вот, смотри, платёжка (на снимке — баран на фоне Арарата)', who: 'alik' }]
    // журнал строится из playerStream (визуал фото — там); здесь проверяем детектор baran на подписи
    expect(PERSON_RE.baran.test('на снимке — баран на фоне Арарата')).toBe(true)
    expect(logicReview(stream, [offer(0, 2, ['Алик, тут нет суммы, тут баран.'])])).toEqual([])
  })

  it('«опять/снова» о незнакомце — ловится; о знакомом и без пары в одном предложении — нет', () => {
    expect(logicReview([ev(0, 'game', 'Опять Гарик пишет со стройки', 'alik')], [])).toMatchObject([{ id: 'again-phantom' }])
    expect(logicReview([ev(0, 'game', 'Гарик приходил', 'alik'), ev(1, 'game', 'Опять Гарик пишет со стройки', 'alik')], [])).toEqual([])
    expect(logicReview([ev(0, 'game', 'Гарик ушёл. Опять дождь', 'alik')], [])).toEqual([])
  })

  it('после экрана концовки повтор кнопок эпилога — задумано, не находка', () => {
    const t = 'Где деньги? Я жду уже слишком долго'
    const stream = [ev(0, 'game', 'Денег нет', 'alik'), ev(1, 'game', '(экран концовки: «Вендетта». Игрок закрыл экран)')]
    expect(logicReview(stream, [offer(0, 1, [t]), offer(1, 2, [t])], 2)).toEqual([])
  })

  it('якоря: детекторы персонажей живы против текущего контента', () => {
    expect(PERSON_RE.karine.test('Карине')).toBe(true)
    expect(PERSON_RE.boris.test('баран')).toBe(true)
    expect(PERSON_RE.niva.test('Где «Нива»?')).toBe(true)
    expect(PERSON_RE.tamada.test('через тамаду')).toBe(true)
    // гипербола про «тётю» — НЕ Тётя Гоар (REVIEW_PROMPT: не нарушение)
    expect(PERSON_RE.goar.test('Я сам женюсь на твоей тёте, если не заплатишь')).toBe(false)
  })

  it('якорь полноты: у каждого персонажа CAST и EXTRAS есть детектор, и наоборот', () => {
    const ids = new Set([...Object.keys(CAST), ...EXTRAS])
    for (const id of Object.keys(PERSON_RE)) {
      if (id !== 'alik' && !ids.has(id)) throw new Error(`детектор без персонажа: ${id} — опечатка или реестр ушёл`)
    }
    for (const id of ids) {
      if (!PERSON_RE[id]) throw new Error(`персонаж без детектора: ${id} — проверка на него слепа`)
    }
  })
})

const party = async (seed: number, turns: number, profile: 'neutral' | 'agreeable' | 'rude') => {
  const p = await playtest(seed, turns, undefined, undefined, profile)
  return logicFindings(p)
}

describe('логический разбор живых партий: каждая реплика и каждый вариант против журнала фактов', () => {
  it('нейтральная партия — ноль несостыковок', async () => {
    const f = await party(71, 300, 'neutral')
    expect(f, f.map((x) => `${x.id}#${x.turn}: ${x.text} — ${x.why}`).join('\n')).toEqual([])
  }, 60_000)

  it('согласник (кластеры переводов, кнопки посредников) — ноль несостыковок', async () => {
    const f = await party(73, 300, 'agreeable')
    expect(f, f.map((x) => `${x.id}#${x.turn}: ${x.text} — ${x.why}`).join('\n')).toEqual([])
  }, 60_000)

  it('грубая партия (окно вражды, via-кнопки, терминал) — ноль несостыковок', async () => {
    const f = await party(72, 140, 'rude')
    expect(f, f.map((x) => `${x.id}#${x.turn}: ${x.text} — ${x.why}`).join('\n')).toEqual([])
  }, 60_000)
})

// Широкий свип для ручной калибровки (не CI): LOGIC_SWEEP=1 LOGIC_SEEDS=1-40 — печатает находки
// по всем профилям; каждая находка разбирается руками: дефект контента — правка/задача,
// ложное срабатывание — уточнение класса исключения с обоснованием (не сидом).
describe.runIf(process.env.LOGIC_SWEEP)('свит логического разбора (ручной)', () => {
  it('печатает находки по сидам', async () => {
    const [from, to] = (process.env.LOGIC_SEEDS ?? '1-40').split('-').map(Number)
    for (const profile of ['neutral', 'agreeable', 'rude'] as const) {
      for (let seed = from; seed <= to; seed++) {
        const f = await party(seed, profile === 'rude' ? 140 : 300, profile)
        for (const x of f) console.log(`seed ${seed} ${profile}: [${x.id} t${x.turn}] ${x.text} — ${x.why}`)
      }
    }
  }, 600_000)
})

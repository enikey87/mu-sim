// Зеркало: игрок отказывает в допработе отмазкой Алика (docs/design/mirror.md). Каждая отмазка правдива
// в этой партии — элемент открыт только под фактом, о котором говорит, и ответ Алика — под тем же фактом.
import { type Criterion, type Entry, gate, is, missing, named, of } from '../engine/rules'
import { needs } from './world'
import { alikDead, blocked, endgame, phoneKarine, sick, wedding } from './memkeys'

export interface Mirror { me: string; alik: string }

export const MIRROR: Entry<Mirror>[] = [
  gate(of('boris', is(sick)))(needs('boris')({ me: 'Не могу, брат. Борис болеет, я с ним сижу.', alik: 'Это МОЯ отмазка! У меня на Бориса авторское право.' })),
  needs('nivaAway', 'niva')({ me: 'Покрашу, как только «Нива» вернётся. Сама уехала — сама и привезёт.', alik: '…Ты учишься. Я горжусь и боюсь одновременно.' }),
  gate(is(wedding('samvel')))(needs('samvel')({ me: 'У Самвела свадьба, меня позвали. Без меня не начинают.', alik: 'Тебя позвали?! Я там тамада, а тебя — просто так позвали?' })),
  needs('razmikUp', 'razmik')({ me: 'Я в очереди на кран. За Размиком. Как спустится — сразу к вам.', alik: 'Размик там с весны. Ты это знаешь. Я это знаю. Кран это знает.' }),
  needs('dekretNow', 'nune')({ me: 'Бухгалтерия в декрете, провести некому. Как выйдет — сразу.', alik: 'Нуне — МОЯ бухгалтерия! Свою заведи, потом отмазывайся!' }),
]

/** Ответы без привязки к отмазке: возмущение, ревность к авторскому праву, восхищение. */
export const MIRROR_REPLY: Entry<string>[] = [
  'Ты где это взял? Это же мои слова! Слово в слово!',
  'Брат… не знаю, гордиться или обидеться. Обиделся. И горжусь.',
  'Так нельзя. Отмазки — это моё. Ты плитку клади.',
  'Записываю. Хорошая была. Верну тебе через месяц как свою.',
]

/** Алик читает и может возмутиться: не блок, не «умер», телефон не у Карине, не эндгейм. */
export const MIRROR_OPEN: Criterion = named('mirrorOpen', missing(blocked), missing(alikDead), missing(phoneKarine), missing(endgame.active))

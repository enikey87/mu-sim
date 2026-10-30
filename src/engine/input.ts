import type { InputCategory, Tone } from './state'

/** Смысл свободно введённого сообщения. Тон хранится отдельно: просьба тоже может быть грубой. */
export interface ClassifiedInput {
  category: InputCategory
  tone: Tone
  /** Категории, для которых уже есть содержательная ветка PlayerSays. */
  intent?: 'request' | 'sorry' | 'moo' | 'arc'
  /** Сериал вопроса «как там X». */
  arg?: string
  /** Текст просит денег или возврата: вежливое «извините, что беспокою» перед просьбой — не извинение (#1565). */
  request?: boolean
}

const normalize = (text: string): string => text.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
const LOOKALIKE: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', i: 'и', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', u: 'у', x: 'х', y: 'у',
  '0': 'о', '3': 'з', '4': 'а', '6': 'б', '@': 'а',
}
/** Сводит частые способы обхода фильтра к кириллице, не удаляя разделители между словами. */
const fold = (text: string): string => normalize(text)
  .replace(/[aceikmoptuxy0346@]/g, (char) => LOOKALIKE[char] ?? char)
  .replace(/([a-zа-я])\1{2,}/gu, '$1')
const words = (text: string): string[] => fold(text).match(/[a-zа-я0-9]+/giu) ?? []
const hasStem = (tokens: readonly string[], stems: readonly string[]): boolean =>
  tokens.some((word) => stems.some((stem) => word.startsWith(stem)))
const hasPhrase = (text: string, phrases: readonly string[]): boolean => phrases.some((phrase) => text.includes(phrase))
const matches = (text: string, patterns: readonly RegExp[]): boolean => patterns.some((pattern) => pattern.test(text))
/** Буквы слова с разделителями или `*`/`_` вместо буквы (х*й, п_и_д_о_р). */
const spelled = (text: string, word: string): boolean => {
  const body = [...word].map((ch, i) => (i === 0 ? ch : `(?:[^a-zа-я0-9]{0,2}${ch}|[*_])`)).join('')
  return new RegExp(`(?:^|[^a-zа-я0-9])${body}(?:$|[^a-zа-я0-9])`, 'u').test(text)
}

const LEGAL = ['судеб', 'полиц', 'прокур', 'заявлен', 'адвокат', 'юрист', 'коллектор', 'жалоб', 'участков', 'пристав', 'мент']
/** Канцелярия рядом с инстанцией — официальная форма обращения, а не крик (#1435). */
const FORMAL = ['официальн', 'претензи', 'досудебн', 'юридическ', 'документ', 'уведомл', 'заказн', 'регламент']
/** Глаголы рядом с «иск», без них «на иске» — не угроза. */
const ISK_ACT = new Set(['подам', 'подадим', 'подать', 'подашь', 'направлю', 'направим', 'отправлю', 'напишу', 'грожу'])
const VIOLENCE = ['убью', 'убить', 'приконч', 'зареж', 'застрел', 'задуш', 'побью', 'изобью', 'сломаю', 'разобью', 'сожгу', 'покалеч', 'закопаю', 'уничтож']
const VIOLENCE_PHRASES = [
  'тебе не жить', 'живым не уйдешь', 'кости переломаю', 'голову оторву', 'ноги переломаю', 'морду набью',
  'лицу набью', 'в больницу уложу', 'уложу в больницу',
]
const HARMLESS_VIOLENCE = ['убью время', 'убью минут', 'убить время', 'сожгу мосты']
const INTIMIDATION = [
  /(?:^|\s)(я\s+)?тебя\s+найду(?:$|[.!?,\s])/u,
  /(?:^|\s)найду\s+тебя(?:$|[.!?,\s])/u,
  /(?:^|\s)тебя\s+найд(?:ут|у|ешь)(?:$|[.!?,\s])/u,
  /(?:^|\s)знаю,?\s+(где\s+ты(\s+живешь)?|твой\s+адрес)(?:$|[.!?,\s])/u,
  /(?:^|\s)(адрес|где\s+живешь|где\s+работаешь)\s+(уже\s+)?(пробил|вычислил|узнал)(?:$|[.!?,\s])/u,
  /(?:^|\s)жди\s+(меня|гостей|пацанов|ребят)(?:$|[.!?,\s])/u,
  /(?:^|\s)(люди|пацаны|ребята)\s+(к\s+тебе\s+)?приедут(?:$|[.!?,\s])/u,
  /(?:^|\s)приеду\s+(к\s+тебе|разобраться|поговорить|и\s+разберусь)(?:$|[.!?,\s])/u,
  /(?:^|\s)сейчас\s+приеду(?:\s+и\s+разберусь)?(?:$|[.!?,\s])/u,
  /(?:^|\s)тебе\s+конец(?:$|[.!?,\s])/u,
  /(?:^|\s)еще\s+пожалеешь(?:$|[.!?,\s])/u,
  /(?:^|\s)оглядывайся(?:$|[.!?,\s])/u,
  /(?:^|\s)плохо\s+кончится(?:$|[.!?,\s])/u,
  /(?:^|\s)хуже\s+будет(?:$|[.!?,\s])/u,
  /(?:^|\s)последнее\s+предупреждение(?:$|[.!?,\s])/u,
]
const INSULT = [
  'идиот', 'дурак', 'дебил', 'мудак', 'мудил', 'кретин', 'долбоеб', 'долбаеб', 'тупиц', 'тупой', 'ничтожество',
  'урод', 'козел', 'сволоч', 'скотин', 'твар', 'мраз', 'гнид', 'ублюд', 'пидор', 'пидар', 'говно',
  'бляд', 'блят', 'сука', 'сучар', 'хуй', 'хуесос', 'еблан', 'уебок', 'заеб', 'охуе', 'нахуй', 'нахер',
  'лох', 'лошар', 'крыс', 'кончен', 'чмо', 'придур',
]
const OBSCURED_INSULT = ['мудак', 'дебил', 'идиот', 'сволочь', 'ублюдок', 'хуй', 'сука', 'пидор', 'блять', 'охуел']
const ACCUSATION = [
  'мошенник', 'аферист', 'жулик', 'кидала', 'разводила', 'обманщик', 'лжец', 'врун', 'врешь', 'врать',
  'обманул', 'обманываешь', 'кинул', 'кидаешь', 'украл', 'воруешь', 'наебщик',
]
const ANGER = ['бесишь', 'достал', 'задолбал', 'надоел', 'ненавижу']
const ANGER_PHRASES = [
  'заткнись', 'пошел ты', 'пошел вон', 'пошел нах', 'пошел на хуй',
  'иди к черту', 'иди нах', 'иди на хуй', 'отвали', 'хватит врать', 'катись',
]
const APOLOGY = ['извин', 'прости', 'прощен', 'виноват', 'погорячил', 'перегну', 'сорян']
/** Вежливое напоминание с «простите»: извинение за беспокойство, а не за ссору (#1594). */
const COURTESY_PING = [
  /(?:простите|извините)[^.!?]{0,30}что\s+(?:снова\s+|опять\s+|часто\s+)?(?:пишу|беспоко|напоминаю|тороп|дерга)/u,
  /(?:простите|извините)\s+за\s+(?:беспокойство|настойчивость|напоминание)/u,
  /(?:простите|извините),?\s+что\s+часто(?:$|[.!?,])/u,
]
const GRATITUDE = ['спасиб', 'благодар', 'спс']
const GREETING = ['привет', 'здравств', 'добр', 'здаров', 'салам']
const COURTESY = ['пожалуйст', 'пожалст', 'будьте', 'будь', 'плиз']
const MONEY = ['деньг', 'долг', 'оплат', 'зарплат', 'рассчет', 'расчет', 'выплат', 'бабк', 'аванс', 'перевод']
const QUESTION = ['где', 'когда', 'можно', 'можешь', 'можете', 'прошу', 'нужн', 'жду']
const REQUEST_VERBS = new Set([
  'верни', 'верните', 'вернуть', 'отдай', 'отдайте', 'отдать', 'заплати', 'заплатите', 'заплатить',
  'оплати', 'оплатите', 'оплатить', 'переведи', 'переведите', 'перевести', 'выплати', 'выплатите', 'выплатить',
  'рассчитайся', 'рассчитайтесь', 'рассчитаться', 'кинь', 'киньте', 'скинь', 'скиньте',
])

/** Текст реплики буквально кричит: капс от четырёх букв или «!!». Тон от этого не зависит (#583). */
export const isShouting = (text: string): boolean => /[A-ZА-ЯЁ]{4,}/u.test(text) || /!\s*!/u.test(text)

/** КАПС/`!!` на коротком окрике без просьбы о деньгах — не грубость. */
const isBenignShout = (tokens: readonly string[], shouting: boolean, askingMoney: boolean): boolean =>
  shouting && !askingMoney && tokens.length <= 2

/** Вопрос к сериалу: форма «как там / как дела у / что там» и первое имя в тексте. */
const ARC_QUESTION = /(?:^|[^a-zа-я0-9])(?:как там|как дела у|что там)(?:$|[^a-zа-я0-9])/u
const arcQuestion = (text: string, folded: string, mentions: ReadonlyArray<readonly [string, RegExp]>): string | undefined => {
  if (!ARC_QUESTION.test(folded)) return undefined
  let best: { id: string; at: number } | undefined
  for (const [id, re] of mentions) {
    const flags = re.flags.includes('i') ? re.flags : re.flags + 'i'
    const m = new RegExp(re.source, flags).exec(text)
    if (!m) continue
    if (!best || m.index < best.at) best = { id, at: m.index }
  }
  return best?.id
}

/** Детерминированная локальная классификация: без сети, модели и зависимости от состояния игры.
 *  `mentions` — имена сериалов; без них вопрос «как там X» остаётся нейтральным. */
export function classifyUserInput(text: string, mentions: ReadonlyArray<readonly [string, RegExp]> = []): ClassifiedInput {
  const normalized = normalize(text)
  const folded = fold(text)
  const tokens = words(text)
  // Короткие корни — по формам слова («судьба»/«искренне» не угрозы); «иск» — только с глаголом подачи.
  const courtWord = tokens.some((word) => /^(суд(а|е|ом|у|ы|ов)?)$/u.test(word))
  const iskWord = tokens.some((word) => /^(иск(а|е|ом|у|и|ов)?)$/u.test(word))
  const iskThreat = iskWord && (
    tokens.some((word) => ISK_ACT.has(word))
    || courtWord
    || hasPhrase(folded, ['в суд', 'через суд'])
  )
  const legalThreat = hasStem(tokens, LEGAL) || courtWord || iskThreat
  const violentThreat = (hasStem(tokens, VIOLENCE) || hasPhrase(folded, VIOLENCE_PHRASES))
    && !hasPhrase(folded, HARMLESS_VIOLENCE)
  const intimidation = matches(folded, INTIMIDATION)
  const insult = hasStem(tokens, INSULT) || OBSCURED_INSULT.some((word) => spelled(folded, word))
  const accusation = hasStem(tokens, ACCUSATION) || tokens.some((word) => /^(вор(а|ом|у|ы|ов|ье)?)$/u.test(word))
  const anger = hasStem(tokens, ANGER) || hasPhrase(folded, ANGER_PHRASES)
  const apology = hasStem(tokens, APOLOGY) || folded.includes('прошу прощения')
  const gratitude = hasStem(tokens, GRATITUDE)
  const request = tokens.some((word) => REQUEST_VERBS.has(word))
    || (hasStem(tokens, MONEY) && (text.includes('?') || hasStem(tokens, QUESTION)))
  const greeting = hasStem(tokens, GREETING) || tokens.includes('ку')
  // До fold: схлопывание повторов иначе съедает mooo/мууу.
  const cow = (normalized.match(/[a-zа-я0-9]+/giu) ?? []).some((word) =>
    /^mu{2,}$/u.test(word) || /^mo{2,}$/u.test(word) || /^му{2,}$/u.test(word) || /^мо{2,}$/u.test(word))
    || /(?:^|\s)(это|там)\s+коров[а-я]*(?:$|[.!?,\s])/u.test(folded)
    || /(?:^|\s)коров[а-я]*\s+мычит(?:$|[.!?,\s])/u.test(folded)
    || /(?:^|\s)кто\s+мычит(?:$|[.!?,\s])/u.test(folded)
  const shouting = isShouting(text)
  const benignShout = isBenignShout(tokens, shouting, request)
  const arc = arcQuestion(text, folded, mentions)

  let category: InputCategory = 'neutral'
  if (violentThreat) category = 'violent-threat'
  else if (intimidation) category = 'intimidation'
  else if (legalThreat) category = 'threat'
  else if (insult) category = 'insult'
  else if (accusation) category = 'accusation'
  else if (anger) category = 'anger'
  else if (apology) category = 'apology'
  else if (request) category = 'request'
  else if (gratitude) category = 'gratitude'
  else if (greeting) category = 'greeting'
  else if (cow) category = 'cow'
  else if (shouting && !benignShout) category = 'rude'

  const courteous = hasStem(tokens, COURTESY) || apology || gratitude || greeting
  const negative = ['violent-threat', 'intimidation', 'insult', 'accusation', 'anger', 'rude'].includes(category)
  // Официальное упоминание суда (#1435): канцелярская форма без крика, ругани и расправы. Такое обращение
  // двигает линию суда вежливым путём (court.ts) и не рвёт серию вежливости; устная угроза остаётся «threat».
  const formalCourt = legalThreat && !violentThreat && !intimidation && !insult && !accusation && !anger && !shouting
    && hasStem(tokens, FORMAL)
  const tone: Tone = category === 'threat' ? (formalCourt ? 'polite' : 'threat')
    : category === 'cow' ? 'cow'
    : negative || (shouting && !courteous && !benignShout) ? 'rude'
    : courteous ? 'polite'
    : 'neutral'
  // Просьба, извинение и «мууу» важнее вопроса к сериалу; сам вопрос тон не меняет.
  const arcId = arc && category === 'neutral' ? arc : undefined
  const intent = category === 'apology' ? 'sorry'
    : category === 'cow' ? 'moo'
    : request && !['violent-threat', 'intimidation', 'threat'].includes(category) ? 'request'
    : arcId ? 'arc'
    : undefined

  return { category, tone, ...(intent ? { intent } : {}), ...(arcId ? { arg: arcId } : {}), ...(request ? { request } : {}) }
}

/** Вежливое напоминание с «простите, что снова пишу/беспокою» (#1594): в живом сходе это вежливость,
 *  а не извинение — оно не платит цену выхода и не снимает вражду. Вне схода смысл прежний. */
export const courtesyApology = (text: string): boolean => matches(fold(text), COURTESY_PING)

export type LegalClaim = 'court' | 'police' | 'statement' | 'prosecutor' | 'lawyer' | 'collectors' | 'tax'
/** Порядок — приоритет: «заявление в прокуратуру» — угроза прокурором, а не бумагой; «жалоба/заявление» — форма, а не адресат. */
export const LEGAL_CLAIMS: ReadonlyArray<readonly [LegalClaim, readonly string[]]> = [
  ['court', ['судеб', 'повестк', 'страсбург']],
  ['police', ['полиц', 'участков']],
  ['prosecutor', ['прокур']],
  ['tax', ['налог']],
  ['lawyer', ['адвокат', 'юрист']],
  ['collectors', ['коллектор']],
  ['statement', ['заявлен', 'жалоб']],
]
/** Короткие корни — целым словом, иначе угрозой суду станут «судьба» и «искренне». */
const CLAIM_WORD: ReadonlyArray<readonly [LegalClaim, RegExp]> = [
  ['court', /^(суд(а|е|ом|у|ы|ов)?|иск(а|е|ом|у|и|ов)?)$/u],
  ['police', /^мент(а|у|ом|ы|ов|ам)?$/u],
]
/** Ни одной инстанции в угрозе — undefined: пул отвечает общим, а не чужим предметом. */
export function legalClaim(text: string): LegalClaim | undefined {
  const tokens = words(text)
  for (const [claim, word] of CLAIM_WORD) if (tokens.some((w) => word.test(w))) return claim
  return LEGAL_CLAIMS.find(([, stems]) => hasStem(tokens, stems))?.[0]
}

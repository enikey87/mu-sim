import type { InputCategory, Tone } from './state'

/** Смысл свободно введённого сообщения. Тон хранится отдельно: просьба тоже может быть грубой. */
export interface ClassifiedInput {
  category: InputCategory
  tone: Tone
  /** Категории, для которых уже есть содержательная ветка PlayerSays. */
  intent?: 'request' | 'sorry' | 'moo'
}

const normalize = (text: string): string => text.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
const LOOKALIKE: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
  '0': 'о', '3': 'з', '4': 'а', '6': 'б', '@': 'а',
}
/** Сводит частые способы обхода фильтра к кириллице, не удаляя разделители между словами. */
const fold = (text: string): string => normalize(text)
  .replace(/[acekmoptxy0346@]/g, (char) => LOOKALIKE[char] ?? char)
  .replace(/([a-zа-я])\1{2,}/gu, '$1')
const words = (text: string): string[] => fold(text).match(/[a-zа-я0-9]+/giu) ?? []
const hasStem = (tokens: readonly string[], stems: readonly string[]): boolean =>
  tokens.some((word) => stems.some((stem) => word.startsWith(stem)))
const hasPhrase = (text: string, phrases: readonly string[]): boolean => phrases.some((phrase) => text.includes(phrase))
const matches = (text: string, patterns: readonly RegExp[]): boolean => patterns.some((pattern) => pattern.test(text))
const spelled = (text: string, word: string): boolean => {
  const pattern = word.split('').join('[^a-zа-я0-9]{0,2}')
  return new RegExp(`(?:^|[^a-zа-я])${pattern}(?:$|[^a-zа-я])`, 'u').test(text)
}

const LEGAL = ['судеб', 'полиц', 'прокур', 'заявлен', 'адвокат', 'юрист', 'коллектор', 'жалоб']
const VIOLENCE = ['убью', 'приконч', 'зареж', 'застрел', 'задуш', 'побью', 'изобью', 'сломаю', 'разобью', 'сожгу', 'покалеч', 'закопаю']
const VIOLENCE_PHRASES = ['тебе не жить', 'живым не уйдешь', 'кости переломаю', 'голову оторву', 'ноги переломаю', 'морду набью']
const HARMLESS_VIOLENCE = ['убью время', 'убью минут', 'сожгу мосты']
const INTIMIDATION = [
  /(?:^|\s)(я\s+)?тебя\s+найду(?:$|[.!?,\s])/u,
  /(?:^|\s)найду\s+тебя(?:$|[.!?,\s])/u,
  /(?:^|\s)знаю,?\s+(где\s+ты\s+живешь|твой\s+адрес)(?:$|[.!?,\s])/u,
  /(?:^|\s)(адрес|где\s+живешь|где\s+работаешь)\s+(уже\s+)?(пробил|вычислил|узнал)(?:$|[.!?,\s])/u,
  /(?:^|\s)жди\s+(меня|гостей|пацанов|ребят)(?:$|[.!?,\s])/u,
  /(?:^|\s)(люди|пацаны|ребята)\s+(к\s+тебе\s+)?приедут(?:$|[.!?,\s])/u,
  /(?:^|\s)приеду\s+(к\s+тебе|разобраться|поговорить)(?:$|[.!?,\s])/u,
  /(?:^|\s)тебе\s+конец(?:$|[.!?,\s])/u,
  /(?:^|\s)еще\s+пожалеешь(?:$|[.!?,\s])/u,
  /(?:^|\s)оглядывайся(?:$|[.!?,\s])/u,
  /(?:^|\s)плохо\s+кончится(?:$|[.!?,\s])/u,
  /(?:^|\s)последнее\s+предупреждение(?:$|[.!?,\s])/u,
]
const INSULT = [
  'идиот', 'дурак', 'дебил', 'мудак', 'кретин', 'долбоеб', 'долбаеб', 'тупиц', 'тупой', 'ничтожество',
  'урод', 'козел', 'сволоч', 'скотин', 'твар', 'мраз', 'гнид', 'ублюд', 'пидор', 'пидар', 'говно',
  'бляд', 'сука', 'сучар', 'хуй', 'хуесос', 'еблан', 'уебок', 'заеб',
]
const OBSCURED_INSULT = ['мудак', 'дебил', 'идиот', 'сволочь', 'ублюдок']
const ACCUSATION = [
  'мошенник', 'аферист', 'жулик', 'кидала', 'разводила', 'обманщик', 'лжец', 'врун', 'врешь', 'врать',
  'обманул', 'обманываешь', 'кинул', 'кидаешь', 'украл', 'воруешь', 'наебщик',
]
const ANGER = ['бесишь', 'достал', 'задолбал', 'надоел', 'ненавижу']
const ANGER_PHRASES = ['заткнись', 'пошел ты', 'пошел вон', 'иди к черту', 'иди нах', 'отвали', 'хватит врать']
const APOLOGY = ['извин', 'прости', 'прощен', 'виноват', 'погорячил', 'сорян']
const GRATITUDE = ['спасиб', 'благодар', 'спс']
const GREETING = ['привет', 'здравств', 'добр', 'здаров', 'салам']
const COURTESY = ['пожалуйст', 'будьте', 'будь']
const MONEY = ['деньг', 'долг', 'оплат', 'зарплат', 'рассчет', 'расчет', 'выплат', 'бабк']
const QUESTION = ['где', 'когда', 'можно', 'можешь', 'можете', 'прошу', 'нужн']
const REQUEST_VERBS = new Set([
  'верни', 'верните', 'вернуть', 'отдай', 'отдайте', 'отдать', 'заплати', 'заплатите', 'заплатить',
  'оплати', 'оплатите', 'оплатить', 'переведи', 'переведите', 'перевести', 'выплати', 'выплатите', 'выплатить',
  'рассчитайся', 'рассчитайтесь', 'рассчитаться',
])

const isShouting = (text: string): boolean => /[A-ZА-ЯЁ]{4,}/u.test(text) || /!\s*!/u.test(text)

/** Детерминированная локальная классификация: без сети, модели и зависимости от состояния игры. */
export function classifyUserInput(text: string): ClassifiedInput {
  const normalized = normalize(text)
  const folded = fold(text)
  const tokens = words(text)
  // Короткие корни проверяем по формам слова, чтобы «судьба» и «искренне» не стали угрозами.
  const legalThreat = hasStem(tokens, LEGAL) || tokens.some((word) => /^(суд(а|е|ом|у|ы|ов)?|иск(а|е|ом|у|и|ов)?)$/u.test(word))
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
  const cow = (normalized.match(/[a-zа-я0-9]+/giu) ?? []).some((word) => /^mu{2,}$/u.test(word) || /^му{2,}$/u.test(word))
    || /(?:^|\s)(это|там)\s+коров[а-я]*(?:$|[.!?,\s])/u.test(folded)
    || /(?:^|\s)коров[а-я]*\s+мычит(?:$|[.!?,\s])/u.test(folded)
    || /(?:^|\s)кто\s+мычит(?:$|[.!?,\s])/u.test(folded)
  const shouting = isShouting(text)

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
  else if (shouting) category = 'rude'

  const courteous = hasStem(tokens, COURTESY) || apology || gratitude || greeting
  const negative = ['violent-threat', 'intimidation', 'insult', 'accusation', 'anger', 'rude'].includes(category)
  const tone: Tone = category === 'threat' ? 'threat'
    : category === 'cow' ? 'cow'
    : negative || (shouting && !courteous) ? 'rude'
    : courteous ? 'polite'
    : 'neutral'
  const intent = category === 'apology' ? 'sorry'
    : category === 'cow' ? 'moo'
    : category === 'request' && tone !== 'rude' ? 'request'
    : undefined

  return { category, tone, ...(intent ? { intent } : {}) }
}

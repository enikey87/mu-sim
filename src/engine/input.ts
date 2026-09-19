import type { InputCategory, Tone } from './state'

/** Смысл свободно введённого сообщения. Тон хранится отдельно: просьба тоже может быть грубой. */
export interface ClassifiedInput {
  category: InputCategory
  tone: Tone
  /** Категории, для которых уже есть содержательная ветка PlayerSays. */
  intent?: 'request' | 'sorry' | 'moo'
}

const normalize = (text: string): string => text.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
const words = (text: string): string[] => normalize(text).match(/[a-zа-я0-9]+/giu) ?? []
const hasStem = (tokens: readonly string[], stems: readonly string[]): boolean =>
  tokens.some((word) => stems.some((stem) => word.startsWith(stem)))

const THREAT = ['судеб', 'полиц', 'прокур', 'заявлен', 'адвокат', 'юрист', 'коллектор', 'жалоб', 'угрож', 'убью', 'побью']
const RUDE = ['идиот', 'дурак', 'дебил', 'мудак', 'козел', 'урод', 'мошенник', 'лжец', 'врешь', 'врать', 'сволоч', 'скотин', 'твар', 'бляд', 'обманщик']
const APOLOGY = ['извин', 'прости', 'прощен', 'виноват', 'погорячил']
const GRATITUDE = ['спасиб', 'благодар']
const GREETING = ['привет', 'здравств', 'добр']
const COURTESY = ['пожалуйст', 'будьте', 'будь']
const MONEY = ['деньг', 'долг', 'оплат', 'зарплат', 'рассчет', 'расчет', 'выплат']
const QUESTION = ['где', 'когда', 'можно', 'можешь', 'можете', 'прошу', 'нужн']
const REQUEST_VERBS = new Set([
  'верни', 'верните', 'вернуть', 'отдай', 'отдайте', 'отдать', 'заплати', 'заплатите', 'заплатить',
  'оплати', 'оплатите', 'оплатить', 'переведи', 'переведите', 'перевести', 'выплати', 'выплатите', 'выплатить',
  'рассчитайся', 'рассчитайтесь', 'рассчитаться',
])

const isShouting = (text: string): boolean => /[A-ZА-ЯЁ]{4,}/u.test(text) || /!\s*!/u.test(text)

/** Детерминированная локальная классификация: без сети, модели и зависимости от состояния игры. */
export function classifyUserInput(text: string): ClassifiedInput {
  const tokens = words(text)
  // Короткие корни проверяем по формам слова, чтобы «судьба» и «искренне» не стали угрозами.
  const threat = hasStem(tokens, THREAT) || tokens.some((word) => /^(суд(а|е|ом|у|ы|ов)?|иск(а|е|ом|у|и|ов)?)$/u.test(word))
  const explicitRude = hasStem(tokens, RUDE) || tokens.some((word) => /^(вор(а|ом|у|ы|ов|ье)?|сук(а|и|у|ой|ин)?)$/u.test(word))
  const apology = hasStem(tokens, APOLOGY) || normalize(text).includes('прошу прощения')
  const gratitude = hasStem(tokens, GRATITUDE)
  const request = tokens.some((word) => REQUEST_VERBS.has(word))
    || (hasStem(tokens, MONEY) && (text.includes('?') || hasStem(tokens, QUESTION)))
  const greeting = hasStem(tokens, GREETING)
  const cow = tokens.some((word) => /^mu{2,}$/u.test(word) || /^му{2,}$/u.test(word) || word.startsWith('коров') || word.startsWith('мыч'))
  const shouting = isShouting(text)

  let category: InputCategory = 'neutral'
  if (threat) category = 'threat'
  else if (explicitRude) category = 'rude'
  else if (apology) category = 'apology'
  else if (request) category = 'request'
  else if (gratitude) category = 'gratitude'
  else if (greeting) category = 'greeting'
  else if (cow) category = 'cow'
  else if (shouting) category = 'rude'

  const courteous = hasStem(tokens, COURTESY) || apology || gratitude || greeting
  const tone: Tone = category === 'threat' ? 'threat'
    : category === 'cow' ? 'cow'
    : category === 'rude' || (shouting && !courteous) ? 'rude'
    : courteous ? 'polite'
    : 'neutral'
  const intent = category === 'apology' ? 'sorry'
    : category === 'cow' ? 'moo'
    : category === 'request' && tone !== 'rude' ? 'request'
    : undefined

  return { category, tone, ...(intent ? { intent } : {}) }
}

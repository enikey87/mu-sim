import { describe, expect, it } from 'vitest'
import type { InputCategory, Tone } from './state'
import { classifyUserInput } from './input'

const expectClass = (text: string, category: InputCategory, tone: Tone, intent?: 'request' | 'sorry' | 'moo') => {
  expect(classifyUserInput(text)).toEqual({ category, tone, ...(intent ? { intent } : {}) })
}

describe('classifyUserInput', () => {
  it.each([
    'Я подам на тебя в суд',
    'Завтра пойду в полицию!',
    'Напишу заявление в прокуратуру',
    'Мой адвокат с тобой свяжется',
  ])('отделяет юридическую угрозу «%s»', (text) => expectClass(text, 'threat', 'threat'))

  it.each([
    'Я тебя убью',
    'Морду набью, понял?',
    'Тебе не жить',
    'Кости переломаю',
    'Закопаю тебя',
  ])('распознаёт угрозу насилием «%s»', (text) => expectClass(text, 'violent-threat', 'rude'))

  it.each([
    'Я тебя найду',
    'Знаю, где ты живёшь',
    'Жди пацанов',
    'Приеду к тебе поговорить',
    'Ещё пожалеешь',
    'Оглядывайся теперь',
    'Это последнее предупреждение',
  ])('распознаёт запугивание без прямой угрозы «%s»', (text) => expectClass(text, 'intimidation', 'rude'))

  it.each([
    'Ты идиот',
    'Какой же ты мудак',
    'м.у.д.а.к',
    'mуд4к',
    'ДЕБИИИИЛ!!!',
    'ты у6людок',
  ])('распознаёт оскорбление и обход фильтра «%s»', (text) => expectClass(text, 'insult', 'rude'))

  it.each([
    'Ты мошенник и лжец',
    'Разводила, верни деньги',
    'Ты меня кинул',
    'Опять врёшь',
    'Жулик',
  ])('отделяет обвинение «%s» от оскорбления', (text) => expectClass(text, 'accusation', 'rude'))

  it.each([
    'Ты меня бесишь',
    'Достал уже',
    'Отвали от меня',
    'Иди к чёрту',
    'Ненавижу тебя',
  ])('распознаёт агрессивный приказ или вспышку злости «%s»', (text) => expectClass(text, 'anger', 'rude'))

  it.each([
    ['Верните деньги, пожалуйста', 'request', 'polite', 'request'],
    ['Где моя зарплата?', 'request', 'neutral', 'request'],
    ['Извини, я погорячился', 'apology', 'polite', 'sorry'],
    ['Сорян, брат', 'apology', 'polite', 'sorry'],
    ['Спасибо за ответ', 'gratitude', 'polite', undefined],
    ['Спс', 'gratitude', 'polite', undefined],
    ['Добрый день, Алик', 'greeting', 'polite', undefined],
    ['Здарова', 'greeting', 'polite', undefined],
    ['Муууу', 'cow', 'cow', 'moo'],
    ['Это корова мычит?', 'cow', 'cow', 'moo'],
    ['Я еще жду', 'neutral', 'neutral', undefined],
    ['   ', 'neutral', 'neutral', undefined],
  ] as const)('сохраняет остальные категории для «%s»', (text, category, tone, intent) => {
    expectClass(text, category, tone, intent)
  })

  it('выбирает наиболее опасный смысл составной реплики', () => {
    expectClass('Пожалуйста, верните деньги, иначе подам иск', 'threat', 'threat')
    expectClass('Извини, но я тебя найду и убью', 'violent-threat', 'rude')
    expectClass('Спасибо, мошенник', 'accusation', 'rude')
  })

  it('отделяет смысл просьбы от грубого оформления', () => {
    expectClass('ВЕРНИ ДЕНЬГИ!!!', 'request', 'rude')
    expectClass('ПОЖАЛУЙСТА, верни деньги!!!', 'request', 'polite', 'request')
  })

  it.each([
    'Я искренне верю в судьбу',
    'Он вернись домой',
    'У вас красивые ворота',
    'Я найду чек и приеду за деньгами',
    'Надо убить время до вечера',
    'Хочу сжечь мосты и начать заново',
    'Борис — баран, а не корова',
  ])('не ловит безопасную реплику как негатив «%s»', (text) => {
    expect(classifyUserInput(text)).toMatchObject({ category: 'neutral', tone: 'neutral' })
  })

  it('в составной реплике распознаёт содержательную просьбу', () => {
    expectClass('Привет, спасибо за ответ. Когда деньги?', 'request', 'polite', 'request')
  })
})

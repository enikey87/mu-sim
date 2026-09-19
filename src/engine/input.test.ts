import { describe, expect, it } from 'vitest'
import { classifyUserInput } from './input'

describe('classifyUserInput', () => {
  it.each([
    ['Я подам на тебя в суд', 'threat', 'threat', undefined],
    ['Завтра пойду в полицию!', 'threat', 'threat', undefined],
    ['Верните деньги, пожалуйста', 'request', 'polite', 'request'],
    ['Где моя зарплата?', 'request', 'neutral', 'request'],
    ['Извини, я погорячился', 'apology', 'polite', 'sorry'],
    ['Спасибо за ответ', 'gratitude', 'polite', undefined],
    ['Добрый день, Алик', 'greeting', 'polite', undefined],
    ['Ты мошенник и лжец', 'rude', 'rude', undefined],
    ['Муууу', 'cow', 'cow', 'moo'],
    ['Это корова мычит?', 'cow', 'cow', 'moo'],
    ['Я еще жду', 'neutral', 'neutral', undefined],
    ['   ', 'neutral', 'neutral', undefined],
  ] as const)('классифицирует «%s»', (text, category, tone, intent) => {
    expect(classifyUserInput(text)).toEqual({ category, tone, ...(intent ? { intent } : {}) })
  })

  it('угроза важнее вежливой формы и просьбы', () => {
    expect(classifyUserInput('Пожалуйста, верните деньги, иначе подам иск')).toEqual({
      category: 'threat', tone: 'threat',
    })
  })

  it('отделяет смысл просьбы от грубого тона', () => {
    expect(classifyUserInput('ВЕРНИ ДЕНЬГИ!!!')).toEqual({ category: 'request', tone: 'rude' })
    expect(classifyUserInput('ПОЖАЛУЙСТА, верни деньги!!!')).toEqual({ category: 'request', tone: 'polite', intent: 'request' })
  })

  it('не ловит подстроки как угрозы и просьбы', () => {
    expect(classifyUserInput('Я искренне верю в судьбу')).toMatchObject({ category: 'neutral', tone: 'neutral' })
    expect(classifyUserInput('Он вернись домой')).toMatchObject({ category: 'neutral', tone: 'neutral' })
    expect(classifyUserInput('У вас красивые ворота')).toMatchObject({ category: 'neutral', tone: 'neutral' })
  })

  it('в составной реплике распознаёт содержательную просьбу', () => {
    expect(classifyUserInput('Привет, спасибо за ответ. Когда деньги?')).toEqual({
      category: 'request', tone: 'polite', intent: 'request',
    })
  })
})

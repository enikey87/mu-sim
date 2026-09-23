// Правила, до которых симуляция доходит не всегда: статистический гейт покрытия их не требует,
// каждое страхуется прямым тестом в src/content/rules/rare.test.ts.
//
// Список проверяется на дрейф: `npm run rules:stable` падает, если запись начинает срабатывать
// во всех выборках симуляции — значит исключение больше не нужно.
export const RARE = new Set([
  // ни в одной из трёх выборок (16 партий × 500 ходов каждая)
  'Tone_Cow', 'Says_catchLie_liekind_grandpa', 'Says_catchLie_liekind_customer', 'Says_catchLie_caught3',
  'Turn_WhileDead', 'Says_OtherArcWhileDead',
  // в одной-двух выборках из трёх: состояние складывается не каждый раз
  'Says_catchLie_caught2',
  'Turn_Wedding_Samvel', 'Turn_Wedding_Razmik', 'Turn_Wedding_Boris',
  'Turn_BorisSick', 'Chorus_garik_FedUp',
])

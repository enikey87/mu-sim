// RARE — правила, которые стенд покрытия (3 выборки × 16 партий в CI) достигает не каждый раз: гейт их
// сторожить не может, их сторожит прямой случай в src/content/rules/rare.test.ts.
//
// Кому место в списке, решает не гейт CI, а широкий замер (tools/coverage-measure.json, `npm run rules:stable`):
// граница — RARE_ZERO_SHARE в coverage.ts (allowed / required). Сверяет машина в обе стороны (tools.test.ts):
// запись, до которой стенд доходит почти всегда, — красная; редкое правило вне списка — тоже. Правка текста
// без перемера списки не двигает (#208): граница на снимке, не на трёх выборках CI.
export const RARE = new Set([
  // 0 срабатываний во всех пакетах: «Мууу» на слово игрока, ловля на лжи, смерть, пачка при пропаже, письмо Страсбурга
  'Tone_Cow', 'Says_catchLie_liekind_customer', 'Says_catchLie_caught3', 'Turn_WhileDead', 'Says_OtherArcWhileDead',
  'Away_Offline', 'Court_Verdict_Lettered',
  // окно состояния или счётчик, который складывается не в каждой партии
  'Opt_Cow', 'Says_catchLie_caught2', 'Says_catchLie_liekind_grandpa',
  'Turn_Wedding_Samvel', 'Turn_Wedding_Razmik', 'Turn_Wedding_Boris', 'Turn_BorisSick', 'Quest_q_niva',
  'Idle_Offline', 'Says_sorry_blocked_boris',
  // «держу слово» — только в хорошем настроении и не в самой партии из каждого пакета (4/5/0/5/4/10/0/3/6/0)
  'Due_Kept',
  // частные финалы и концовки по стилю партии (z ≥ required; нули в т.ч. вне CI — #230)
  'Finale_beton_opened', 'Finale_grant_ally',
  'Ending_alik',
])

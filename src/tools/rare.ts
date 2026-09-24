// RARE — правила, которые стенд покрытия (3 выборки × 16 партий в CI) достигает не каждый раз: гейт их
// сторожить не может, их сторожит прямой случай в src/content/rules/rare.test.ts.
//
// Кому место в списке, решает не гейт CI, а широкий замер (tools/coverage-measure.json, `npm run rules:stable`):
// правило молчит хотя бы в каждом пятом пакете замера (RARE_ZERO_SHARE в coverage.ts). Сверяет машина в обе
// стороны (tools.test.ts): запись, до которой стенд доходит почти всегда, — красная; редкое правило вне
// списка — тоже красное (его обнуление в трёх выборках CI — шум, а не поломка). Правка текста сдвигает
// розыгрыш, но не замер, поэтому CI от неё не краснеет.
export const RARE = new Set([
  // 0 срабатываний во всех пакетах: «Мууу» на слово игрока, ловля на лжи, смерть, пачка при пропаже, письмо Страсбурга
  'Tone_Cow', 'Says_catchLie_liekind_customer', 'Says_catchLie_caught3', 'Turn_WhileDead', 'Says_OtherArcWhileDead',
  'Away_Offline', 'Court_Verdict_Lettered',
  // окно состояния или счётчик, который складывается не в каждой партии
  'Opt_Cow', 'Says_catchLie_caught2', 'Says_catchLie_liekind_grandpa',
  'Turn_Wedding_Samvel', 'Turn_Wedding_Razmik', 'Turn_Wedding_Boris', 'Turn_BorisSick', 'Quest_q_niva', 'Scene_lend',
  'Idle_Offline', 'Says_condole_ctxrevived', 'Tone_Threat_Hot_Again', 'Says_sorry_blocked_karine', 'Says_via_boris',
  // частные финалы и концовки по стилю партии
  'Finale_beton_opened', 'Finale_beton_opened_or', 'Finale_grant_ally', 'Finale_razmik_union', 'Finale_razmik_shift_or',
  'Finale_garik_cutter', 'Ending_alik', 'Payday_strasbourg', 'Ending_payday_strasbourg',
])

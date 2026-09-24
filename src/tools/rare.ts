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
  'Says_sorry_blocked_boris',
  // частные финалы и концовки по стилю партии (z ≥ required; после #190 бот закрывает концовку)
  'Finale_grant_ally', 'Finale_alik_death_will', 'Finale_beton_corner', 'Finale_beton_opened_or',
  'Finale_garik_cutter', 'Finale_razmik_shift_or', 'Finale_rubik_bribe', 'Finale_tile_lost', 'Finale_samvel_tamada',
  'Ending_alik', 'Ending_heir',
  // ответы/тона, которые бот редко складывает
  'Says_condole_ctxrevived', 'Says_sorry_blocked_karine', 'Says_sorry_sorrySwing3',
  'Says_via_boris', 'Scene_lend', 'Scene_wife', 'Tone_Threat_Hot_Again', 'Turn_LightOff',
  // суд: после Страсбурга и повторный адвокат — не в каждой партии (#251 remasure)
  'Court_After', 'Court_Lawyer_Again',
  // экран концовки выплаты открыт мгновение — события успевают редко (#190 / #251)
  'Quiet_PaydayOpen_PromiseDue', 'Quiet_PaydayOpen_AlikIdle', 'Quiet_PaydayOpen_Mentioned',
])

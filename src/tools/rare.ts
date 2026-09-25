// RARE — правила, до которых стенд покрытия (3 полные выборки + 3 «до концовки», tools/coverage.ts) доходит
// не каждый раз: гейт их сторожить не может, их сторожит прямой случай в src/content/rules/rare.test.ts.
//
// Кому место в списке, решают те же живые выборки (tools.test.ts, полоса COMMON_GAMES в coverage.ts): запись,
// которую стенд видит в COMMON_GAMES партиях из 120, — красная. Правило, до которого стенд в широком замере
// не дошёл ни разу, — в PROVEN. Снимка, правимого руками, нет (#269).
export const RARE = new Set([
  // стенд не видел ни в одной выборке: «Мууу» на слово игрока, ловля на лжи, смерть, пачка при пропаже, письмо Страсбурга
  'Tone_Cow', 'Says_catchLie_liekind_customer', 'Says_catchLie_caught3', 'Turn_WhileDead', 'Says_OtherArcWhileDead',
  'Away_Offline', 'Court_Verdict_Lettered',
  // окно состояния или счётчик, который складывается не в каждой партии
  'Opt_Cow', 'Says_catchLie_caught2', 'Says_catchLie_liekind_grandpa',
  'Turn_Wedding_Samvel', 'Turn_Wedding_Razmik', 'Turn_Wedding_Boris', 'Turn_Wedding_Anush', 'Turn_BorisSick', 'Quest_q_niva',
  'Says_sorry_blocked_boris',
  // частные финалы и концовки по стилю партии (z ≥ required; после #190 бот закрывает концовку)
  'Finale_grant_ally', 'Finale_alik_death_will', 'Finale_beton_corner', 'Finale_beton_opened_or',
  'Finale_garik_cutter', 'Finale_razmik_shift_or', 'Finale_rubik_bribe', 'Finale_samvel_tamada',
  'Ending_alik', 'Ending_heir',
  // ответы/тона, которые бот редко складывает
  'Says_condole_ctxrevived', 'Says_sorry_sorrySwing3',
  'Says_via_boris', 'Tone_Threat_Hot_Again', // суд: после Страсбурга и повторный адвокат — не в каждой партии (#251 remasure)
  // экран концовки выплаты открыт мгновение — события успевают редко (#190 / #251)
  'Quiet_PaydayOpen_PromiseDue', 'Quiet_PaydayOpen_Mentioned',
  // суд после Страсбурга — в одной партии из двадцати (#269)
  'Court_After',
  // бывшие PROVEN: живой стенд до них всё же доходит, хоть и не в каждой выборке (#269)
  'Quiet_Dead_AlikAway', 'Quiet_Blocked_PromiseDue', 'Says_sorry_blocked_hinted', 'Says_via_mama',
  'Finale_rubik_karine', 'Finale_grandpa_revoke', 'Finale_razmik_swap', 'Finale_razmik_union', 'Finale_beton_ledger',
  'Finale_nune_ledger', 'Payday_notyou', 'Payday_strasbourg', 'Ending_payday_notyou', 'Ending_payday_strasbourg', 'Scene_amnesty',
  'Ending_payday_lavash', 'Payday_lavash', 'Ending_ram', 'Finale_boris_toyou', 'Finale_niva_chose', 'Quiet_Blocked_AlikAway',
  'Phone_Karine_PlayerMessage', 'Quiet_PhoneKarine_AlikIdle', 'Quiet_PhoneKarine_StoryBeat',
])

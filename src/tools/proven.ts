// Правила, которые статистический бот покрытия не достигает, но у которых есть доказательство
// вне симуляции: прямой случай в proven.test.ts. Имя → короткая причина.
// Новое правило сюда — только с причиной и случаем в proven.test.ts; иначе гейт coverage
// поставит unexplained. Модуль / префикс больше не освобождают (issue #102).

const reason = 'direct: tools/proven.test.ts'

export const PROVEN: Record<string, string> = Object.fromEntries([
  'Quiet_Dead_AlikIdle', 'Quiet_Dead_AlikAway', 'Quiet_Dead_StoryBeat', 'Quiet_Dead_PeriodLine', 'Quiet_Dead_PromiseDue',
  'Quiet_Blocked_AlikAway', 'Quiet_Blocked_StoryBeat', 'Quiet_Blocked_PeriodLine', 'Quiet_Blocked_PromiseDue',
  'Quiet_PhoneKarine_AlikIdle', 'Quiet_PhoneKarine_AlikAway', 'Quiet_PhoneKarine_StoryBeat',
  'Quiet_PhoneKarine_PeriodLine', 'Quiet_PhoneKarine_PromiseDue',
  'Phone_Karine_AlikTurn', 'Phone_Karine_PlayerMessage', 'Phone_Karine_PlayerSays',
  'Turn_Blocked', 'Turn_Vendetta', 'Rude_Vendetta',
  'Says_sorry_blocked', 'Says_sorry_blocked_hinted',
  'Finale_boris_brigadir', 'Finale_boris_toyou', 'Finale_samvel_groom',
  'Finale_niva_chose', 'Finale_niva_chose_or', 'Finale_rubik_karine', 'Finale_alik_death_sulk', 'Finale_grandpa_revoke',
  'Ending_family', 'Ending_ram', 'Ending_honest', 'Ending_vendetta',
  'Ending_payday_real', 'Ending_payday_niva',
  'Payday_real', 'Payday_niva',
  'Endgame_Money', 'Endgame_Mute', 'Endgame_Leave', 'Endgame_Request',
  'Endgame_Turn', 'Endgame_Idle', 'Endgame_Away', 'Endgame_Formality', 'Endgame_NoEnding',
  'Turn_LightOff', 'Turn_NetRation', 'Idle_PhoneWarn', 'Bill_Warn', 'Bill_Due',
  // финалы, до которых бот доходил только после выплаты — а там теперь тишина (#136); обиженный + пачка — редкое совпадение
  'Finale_beton_ledger', 'Finale_nune_ledger', 'Finale_razmik_swap', 'Says_via_mama',
  'Away_ColdWar', 'Quiet_Offended_AlikAway',
].map((name) => [name, reason]))

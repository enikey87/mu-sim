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
  // бот покрытия свободным текстом «спасибо»/«привет» не пишет (FREE в bot.ts); расширить FREE — сдвинуть все траектории
  'Tone_Thanks', 'Tone_Greeting',
  'Says_sorry_blocked', 'Says_sorry_blocked_hinted', 'Says_via_mama',
  'Finale_boris_brigadir', 'Finale_boris_toyou', 'Finale_samvel_groom',
  'Finale_niva_chose', 'Finale_niva_chose_or', 'Finale_rubik_karine', 'Finale_alik_death_sulk', 'Finale_grandpa_revoke', 'Finale_razmik_swap', 'Finale_razmik_union',
  'Ending_family', 'Ending_ram', 'Ending_honest', 'Ending_vendetta',
  'Ending_payday_real', 'Ending_payday_niva', 'Ending_payday_notyou', 'Ending_payday_lavash', 'Ending_payday_strasbourg',
  'Payday_real', 'Payday_niva', 'Payday_notyou', 'Payday_lavash', 'Payday_strasbourg',
  'Endgame_Money', 'Endgame_Mute', 'Endgame_Leave', 'Endgame_Request',
  'Endgame_Turn', 'Endgame_Idle', 'Endgame_Away', 'Endgame_Formality', 'Endgame_NoEnding',
  'Turn_LightOff', 'Turn_NetRation', 'Idle_PhoneWarn', 'Bill_Warn', 'Bill_Due',
  'Credit_Due', 'Says_creditTake', 'Says_creditSell',
  // финалы, до которых бот доходил только после выплаты — а там теперь тишина (#136); обиженный + пачка — редкое совпадение
  'Finale_beton_ledger', 'Finale_nune_ledger',
  'Away_ColdWar', 'Quiet_Offended_AlikAway',
  // бот копит не больше 3 просрочек к Дню выплаты: 60 % обещаний — «когда-нибудь», датированные он припоминает кнопкой (#149)
  'Scene_amnesty',
].map((name) => [name, reason]))

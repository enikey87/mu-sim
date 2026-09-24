// Правила, которые статистический бот покрытия не достигает, но у которых есть доказательство
// вне симуляции: прямой случай в proven.test.ts. Имя → причина, уникальная для записи
// (имя теста/случая). Общая константа на всех — мёртвая метаданная (#130/#208): проверка
// «причины непустые» не краснеет. Новое правило сюда — только с случаем в proven.test.ts.

const NAMES = [
  'Quiet_Dead_AlikAway', 'Quiet_Dead_PeriodLine', 'Quiet_Dead_PromiseDue',
  'Quiet_Blocked_AlikAway', 'Quiet_Blocked_PeriodLine', 'Quiet_Blocked_PromiseDue',
  'Quiet_PhoneKarine_AlikIdle', 'Quiet_PhoneKarine_AlikAway', 'Quiet_PhoneKarine_StoryBeat',
  'Quiet_PhoneKarine_PeriodLine', 'Quiet_PhoneKarine_PromiseDue',
  'Phone_Karine_AlikTurn', 'Phone_Karine_PlayerMessage', 'Phone_Karine_PlayerSays',
  'Turn_Blocked', 'Turn_Vendetta', 'Rude_Vendetta',
  // бот покрытия свободным текстом «спасибо»/«привет» не пишет (FREE в bot.ts); расширить FREE — сдвинуть все траектории
  'Tone_Thanks', 'Tone_Greeting',
  'Says_sorry_blocked', 'Says_sorry_blocked_hinted', 'Says_via_mama', 'Says_via_boris',
  'Finale_boris_brigadir', 'Finale_boris_toyou', 'Finale_samvel_groom',
  'Finale_niva_chose', 'Finale_niva_chose_or', 'Finale_rubik_karine', 'Finale_alik_death_sulk', 'Finale_grandpa_revoke', 'Finale_razmik_swap', 'Finale_razmik_union',
  'Ending_family', 'Ending_ram', 'Ending_honest', 'Ending_vendetta',
  'Ending_payday_real', 'Ending_payday_niva', 'Ending_payday_notyou', 'Ending_payday_lavash', 'Ending_payday_strasbourg',
  // бот покрытия экран концовки не закрывает — в эндгейм не входит, а «Параллельная вселенная» теперь только там (#172); #190 вернёт под гейт
  'Ending_multiverse',
  'Payday_real', 'Payday_niva', 'Payday_notyou', 'Payday_lavash', 'Payday_strasbourg',
  'Endgame_Money', 'Endgame_Mute', 'Endgame_Leave', 'Endgame_Request',
  'Endgame_Turn', 'Endgame_Idle', 'Endgame_Away', 'Endgame_Formality', 'Endgame_NoEnding',
  'Lend50_yes', 'Lend50_no', 'Lend50_serious',
  // финалы, до которых бот доходил только после выплаты — а там теперь тишина (#136); обиженный + пачка — редкое совпадение
  'Finale_beton_ledger', 'Finale_nune_ledger',
  'Away_ColdWar', 'Quiet_Offended_AlikAway',
  // бот копит не больше 3 просрочек к Дню выплаты: 60 % обещаний — «когда-нибудь», датированные он припоминает кнопкой (#149)
  'Scene_amnesty',
] as const

export const PROVEN: Record<string, string> = Object.fromEntries(
  NAMES.map((name) => [name, `proven.test.ts CASES.${name}`]),
)

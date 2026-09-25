// PROVEN — правила, до которых стенд покрытия в широком замере не дошёл ни разу: их сторожит прямой случай
// в proven.test.ts, и он краснеет, если правило сломать. Дошёл хоть раз — место в RARE; живой гейт (tools.test.ts)
// краснеет от COMMON_GAMES партий. Новое правило сюда — только со случаем в proven.test.ts.

export const PROVEN = new Set([
  'Quiet_Dead_PeriodLine',
  'Quiet_Blocked_PeriodLine',
  'Quiet_PhoneKarine_AlikAway',
  'Quiet_PhoneKarine_PeriodLine',
  'Quiet_PhoneKarine_PromiseDue',
  'Phone_Karine_AlikTurn',
  'Phone_Karine_PlayerSays',
  'Turn_Blocked',
  'Turn_Vendetta',
  'Rude_Vendetta',
  // бот покрытия свободным текстом «спасибо»/«привет» не пишет (FREE в bot.ts)
  'Tone_Thanks',
  'Tone_Greeting',
  'Says_sorry_blocked',
  'Finale_boris_brigadir',
  'Finale_samvel_groom',
  'Finale_niva_chose_or',
  'Finale_alik_death_sulk',
  'Ending_family',
  'Ending_honest',
  'Ending_vendetta',
  'Ending_payday_real',
  'Ending_payday_niva',
  'Payday_real',
  'Payday_niva',
  // бот закрывает экран концовки сразу (#190) — AlikTurn в эндгейме всё ещё не видит
  'Endgame_Turn',
  // пока экран концовки открыт, бот его сразу закрывает — эти события не успевают (#190)
  'Quiet_PaydayOpen_AlikAway',
  'Quiet_PaydayOpen_PeriodLine',
  'Quiet_PaydayOpen_StoryBeat',
  'Away_ColdWar',
  'Quiet_Offended_AlikAway',
  // ставка «усы» сдержана: mood+odds; бот почти не копит срок со stake (#285)
  'Due_StakeKept',
])

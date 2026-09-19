// Правила, которые в симуляции срабатывают редко: статистический тест покрытия их не ждёт,
// каждое проверяется напрямую в src/content/rules/rare.test.ts.
export const RARE = new Set(['Due_Cosmic', 'Tone_Cow', 'Says_catchLie_liekind_grandpa', 'Says_catchLie_caught3', 'Says_catchLie_caught2', 'Says_condole_ctxrevived', 'Says_catchLie_liekind_customer', 'Turn_BorisSick',
  // «Мууу» в симуляции без таймеров не звучит; пропажа Алика теперь короткая — редко совпадает с тишиной игрока
  'Opt_Cow', 'Idle_Offline', 'Says_catchLie_liekind_sent',
  // первый сериал обычно запускает ход Алика раньше сюжетного хода; пропажа Алика короткая
  'Beat_FirstArc', 'Says_WhileOffline',
  // ручного ввода нет в симуляции бота
  'Says_request', 'Tone_ViolentThreat', 'Tone_Intimidation',
  // «толкни „Ниву“» — эпизод сериала «Нива», только пока она «не заводится»
  'Quest_q_niva',
  // сцен много, каждая с перерывом 25 дней: «займи 5000» (хорошее настроение) и «налоговая» (после угроз) могут не выпасть
  'Scene_lend', 'Scene_tax',
  // «умер»: сообщения игрока перехватывает Tone_WhileDead, обычный ход Алика во время похорон — редкость
  'Turn_WhileDead',
  // «Вы кто такой?» от Карине — только если она ещё ни разу не писала сама, а хор и родня пишут часто
  'Scene_wife'])

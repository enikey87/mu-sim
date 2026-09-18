(function () {
  const $ = (s) => document.querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);
  const Q = new URLSearchParams(location.search);
  const SPEED = Q.has('fast') ? 0.03 : 1; // ?fast — паузы в ~30 раз короче (для тестов)
  const HOUR = Q.has('hour') ? +Q.get('hour') : null; // ?hour=3 — подменить реальный час
  const AWAY = Q.has('away') ? +Q.get('away') : null; // ?away=90 — будто игрока не было 90 минут
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));

  const HANDOVER = new Date(2026, 2, 18); // дата сдачи объекта
  const DEBT0 = 240000;
  const SAVE_KEY = 'alik-save-v3';
  const MAX_PATIENCE = 5;

  const ACH = {
    first: ['Первый шаг', 'Написал Алику'],
    brat: ['Брат джан', 'Алик назвал тебя «брат джан»'],
    night: ['Прочитано в 3:14', 'Алик прочитал и промолчал'],
    moo10: ['Мууу×10', 'Услышал «Мууу» 10 раз'],
    fifty5: ['Капитал', 'Получил 50 ₽ пять раз'],
    fence: ['Покрасил тёте забор', 'Согласился на доп. работу'],
    legend: ['Легенда', 'Получил легендарную отмазку'],
    rude: ['Сорвался', 'Нагрубил Алику'],
    saint: ['Святой', '10 вежливых сообщений подряд'],
    floor: ['Полежал на полу', 'Терпение кончилось'],
    year: ['Год ожидания', 'Прошло 365 дней после сдачи'],
    cow: ['Это корова?', 'Спросил про корову'],
    ram: ['Новая аватарка', 'Алик поставил на аватарку барана'],
    promises20: ['Коллекционер', '20 обещаний в журнале'],
    meet: ['Свидание у объекта', 'Прождал Алика 3 часа'],
    cafe: ['Хачапури за свой счёт', 'Сходил на встречу в кафе'],
    hash: ['Хаш вместо денег', 'Съездил к Алику домой'],
    card: ['Номер карты', 'Отправил номер карты ещё раз'],
    barter: ['Бартер', 'Взял долг натурой'],
    customer: ['Прямой контакт', 'Позвонил заказчику'],
    nephew: ['Разоблачитель', 'Раскусил «племянника»'],
    lend: ['Инвестор', 'Занял Алику денег'],
    redo: ['Проверка объекта', 'Съездил проверить плитку'],
    toast: ['Почётный армянин', 'Сказал тост «За маму!»'],
    newjob: ['Новый объект', 'Пошёл работать на ещё один объект'],
    wife: ['Карине всё знает', 'Рассказал жене Алика'],
    choice: ['Демократия', 'Сам выбрал отмазку'],
    sorry: ['Мир', 'Помирился с Аликом'],
    arc_boris: ['Бее', 'Досмотрел сагу о баране Борисе'],
    arc_beton: ['Санта-Барбара', 'Досмотрел роман бетона и крана'],
    arc_samvel: ['Горько!', 'Пережил свадьбу дяди Самвела'],
    arc_niva: ['Беглянка', 'Проследил путь «Нивы»'],
    arc_nune: ['Декрет', 'Узнал всё о бухгалтерии Алика'],
    arc_grant: ['Близнецы', 'Разобрался с заказчиком Грантом'],
    group: ['Семья', 'Побывал в семейном чате'],
    wrong: ['Не тот чат', 'Получил чужое сообщение'],
    tier1: ['Международный уровень', 'Отмазки вышли за границу'],
    tier2: ['Исторический уровень', 'Отмазки ушли в древность'],
    tier3: ['Космический уровень', 'Отмазки покинули Землю'],
    idle: ['Он скучает', 'Алик написал первым'],
    deleted: ['Я успел прочитать', 'Увидел удалённое сообщение'],
    edited: ['Изменено', 'Алик отредактировал обещание'],
    typo: ['Автозамена', 'Алик опечатался'],
    sticker: ['Стикерпак', 'Получил стикер вместо ответа'],
    fwd: ['Дзен-открытка', 'Алик переслал мудрость'],
    react: ['👍', 'Алик ответил только реакцией'],
    dead: ['Телефон сел', 'Разрядил телефон на Алика'],
    away: ['Непрочитанные', 'Вернулся к пачке сообщений от Алика'],
    nightowl: ['Сова', 'Писал Алику ночью'],
    forgive: ['Прощение', 'Простил умирающего Алика'],
    invoice: ['Взаимозачёт', 'Получил счёт от Алика'],
    loan: ['Кредитная история', 'Узнал о кредите на своё имя'],
    heir: ['Наследство', 'Теперь тебе должен баран'],
    threat: ['Правосудие', 'Пригрозил Алику судом'],
    arc_death: ['Воскрешение', 'Пережил похороны Алика'],
    arc_garik: ['Фундамент', 'Досмотрел сагу о Гарике в фундаменте'],
    arc_tile: ['Орудие преступления', 'Твоя плитка прошла суд'],
    arc_grandpa: ['Бессмертный', 'Дедушка Грачик всё ещё жив'],
  };
  const TIERS = [
    [250, '📈 Отмазки Алика вышли на международный уровень'],
    [330, '🏛 Отмазки Алика вышли на исторический уровень'],
    [450, '🌌 Отмазки Алика вышли на космический уровень'],
  ];
  const AR = window.Arcs;
  const L = window.Life;

  // ---------- state ----------
  function fresh() {
    return {
      day: 184, clock: 9 * 60 + 41, debt: DEBT0, patience: MAX_PATIENCE, politeStreak: 0, mood: 5,
      msgs: [], ach: {}, promises: [], seen: [], bags: {}, items: [],
      stats: { moo: 0, fifty: 0, sent: 0 },
      offlineDays: 0, ram: false, muted: false, scene: null, ctx: null, choices: null, arcs: {}, tier: 0,
      battery: 100, money: 12400, lastSeen: 0,
    };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.msgs ? { ...fresh(), ...s } : null; } catch { return null; }
  }
  let resetting = false;
  function save() {
    if (resetting) return;
    try {
      S.msgs = S.msgs.slice(-150);
      S.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch { /* нет storage — играем без сохранения */ }
  }
  let S = load() || fresh();
  let seen = new Set(S.seen);
  let busy = false;
  let dead = false;

  // ---------- колоды без повторов ----------
  function draw(key, arr, noRefill) {
    let b = S.bags[key];
    if (!b || b.n !== arr.length) b = S.bags[key] = { n: arr.length, left: null, last: -1 };
    if (!b.left || !b.left.length) {
      if (noRefill && b.left) return null;
      const idx = shuffle(arr.map((_, i) => i));
      // на стыке циклов не выдаём тот же элемент дважды подряд
      const end = idx.length - 1;
      if (end > 0 && idx[end] === b.last) [idx[0], idx[end]] = [idx[end], idx[0]];
      b.left = idx;
    }
    const i = b.left.pop();
    b.last = i;
    return arr[i];
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  // Тексты, которых ещё не было в этой игре. decorate — перефразирование, если варианты кончились.
  const keyOf = (t) => (typeof t === 'string' ? t : t.texts ? t.texts.join('|') : t.text ?? t.t ?? JSON.stringify(t));
  const isSeen = (t) => seen.has(hash(keyOf(t)));
  function markSeen(t) { const h = hash(keyOf(t)); if (!seen.has(h)) { seen.add(h); S.seen.push(h); } }
  function pickFresh(gen, decorate) {
    let t;
    for (let i = 0; i < 40; i++) { t = gen(); if (!isSeen(t)) return t; }
    for (let i = 0; i < 40; i++) { const d = decorate(t); if (!isSeen(d)) return d; }
    return t;
  }
  function alikDecor(t) {
    const f = (s) => `${X.g('ADDR')}, ${X.low(s)}`;
    if (typeof t === 'string') return f(t);
    if (t.texts) return { ...t, texts: [f(t.texts[0]), ...t.texts.slice(1)] };
    return { ...t, text: f(t.text) };
  }
  function playerDecor(t) {
    if (/^Алик/.test(t)) return t + draw('PSUF', [' 🙏', ' 🤔', ' 😐', ' Серьёзно.', ' Жду ответа.', ' Очень жду.', ' 🥲', ' Пожалуйста.']);
    const pre = draw('PPRE', ['Алик, ', 'Слушайте, ', 'Так, ', 'Эм… ', 'Алик-джан, ', 'Секунду. ']);
    return pre + (pre.endsWith(', ') ? X.low(t) : t);
  }
  function uniq(gen) { const t = pickFresh(gen, alikDecor); markSeen(t); return t; }
  const addrLine = (key, arr) => uniq(() => `${X.g('ADDR')}, ${draw(key, arr)}`);

  const X = window.Excuses.make(draw, () => S.tier);
  const SC = window.Scenes.make(X);
  const { D, cap, low, fill } = X;

  // ---------- игровое время ----------
  const dateOf = (day) => new Date(HANDOVER.getTime() + day * 864e5);
  const fmtDate = (day) => dateOf(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function tick(min) {
    S.clock += min;
    if (S.clock >= 23 * 60 + 50) nextDay(1);
  }
  function nextDay(n) {
    S.day += n;
    S.clock = 8 * 60 + rnd(180);
    push({ kind: 'sep', text: fmtDate(S.day) });
    const t = TIERS.filter(([d]) => S.day >= d).length;
    if (t > S.tier) {
      S.tier = t;
      push({ kind: 'sys', text: TIERS[t - 1][1] });
      unlock('tier' + t);
    }
  }

  // ---------- реальное время: режим дня Алика ----------
  function realHour() { return HOUR ?? new Date().getHours(); }
  function period() {
    const h = realHour(), dow = new Date().getDay();
    if (h < 6) return 'night';
    if (h < 10) return 'morning';
    if (h >= 12 && h < 15) return 'lunch';
    if (h >= 18 && dow === 5) return 'friday';
    if (h >= 18) return 'evening';
    return 'day';
  }
  const isNight = () => period() === 'night';
  const realHHMM = () => { const d = new Date(); return `${String(HOUR ?? d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // ---------- audio ----------
  // звук и вибрация — только после первого касания (иначе браузер блокирует)
  let ac, gestured = false;
  const audio = () => {
    if (!gestured) throw new Error('no gesture');
    return (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  };
  function tone(freq, dur, vol, type = 'sine', at = 0) {
    const c = audio(), t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; o.type = type;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function beep() {
    if (S.muted) return;
    try { tone(1320, 0.1, 0.15, 'sine', 0); tone(1320, 0.1, 0.15, 'sine', 0.12); } catch { /* ignore */ }
  }
  function cowSynth(vol) {
    const c = audio(), t = c.currentTime, dur = 1.4 + Math.random() * 1.2;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.25);
    out.gain.setValueAtTime(vol, t + dur - 0.4);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(c.destination);
    const f0 = 95 + Math.random() * 30;
    [1, 1.005].forEach((k) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * k, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.25 * k, t + dur * 0.35);
      o.frequency.linearRampToValueAtTime(f0 * 0.8 * k, t + dur);
      [[320, 4], [800, 6]].forEach(([freq, q]) => {
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
        o.connect(f).connect(out);
      });
      o.start(t); o.stop(t + dur);
    });
  }
  function speak(text, { pitch = 1, rate = 1, volume = 0.5 } = {}) {
    if (S.muted || !gestured) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.pitch = pitch; u.rate = rate; u.volume = volume;
      speechSynthesis.speak(u);
    } catch { /* нет синтеза речи */ }
  }
  function moo() {
    S.stats.moo++;
    if (S.stats.moo >= 10) unlock('moo10');
    const el = document.createElement('div');
    el.className = 'moo';
    el.textContent = 'М' + 'у'.repeat(4 + rnd(8));
    el.style.left = 5 + rnd(45) + '%';
    el.style.top = 15 + rnd(60) + '%';
    $('#mooLayer').appendChild(el);
    setTimeout(() => el.remove(), 3100);
    if (S.muted) return;
    try { cowSynth(0.25); } catch { /* ignore */ }
    speak('М' + 'у'.repeat(5 + rnd(6)), { pitch: 0.1, rate: 0.55, volume: 0.35 });
  }
  function feast() {
    speak(draw('FEAST', ['Ну, за объект!', 'Вай, какой хаш!', 'Алик, иди сюда, тост!', 'За маму!', 'Алик, кто там пишет? Положи телефон!', 'Ещё по одной!']), { rate: 1.2 });
  }
  function alikVoice() {
    speak(draw('VOICE', L.VOICE), { pitch: 0.55, rate: 0.8, volume: 0.6 });
    if (Math.random() < 0.3) setTimeout(moo, 2500);
  }
  const mooChance = () => (S.stats.sent > 50 ? 0.15 : 0.07) * (period() === 'friday' ? 1.5 : 1);
  function vibrate(p) { if (!S.muted && gestured) try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignore */ } }

  // фоновая атмосфера: днём стройка, вечером дудук, ночью сверчки
  const DUDUK = [293.66, 311.13, 369.99, 392, 440, 466.16];
  function hammer() { const c = audio(); for (let i = 0; i < 3 + rnd(3); i++) noiseHit(c, i * 0.35); }
  function noiseHit(c, at) {
    const t = c.currentTime + at, len = 0.06;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.value = 0.05;
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  function duduk() {
    const c = audio(); let t = c.currentTime;
    for (let i = 0; i < 4 + rnd(3); i++) {
      const dur = 0.6 + Math.random() * 0.9, f0 = DUDUK[rnd(DUDUK.length)];
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = f0; lfo.frequency.value = 5; lg.gain.value = 4;
      lfo.connect(lg).connect(o.frequency);
      lp.type = 'lowpass'; lp.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.15);
      g.gain.setValueAtTime(0.035, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(c.destination);
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
      t += dur;
    }
  }
  function crickets() { for (let i = 0; i < 6; i++) tone(4200 + rnd(300), 0.04, 0.012, 'sine', i * 0.09); }
  let ambientOn = false;
  function startAmbient() {
    if (ambientOn) return;
    ambientOn = true;
    setInterval(() => {
      if (S.muted || document.hidden || dead) return;
      try {
        const p = period();
        if (p === 'night') { if (Math.random() < 0.25) crickets(); }
        else if (p === 'evening' || p === 'friday') { if (Math.random() < 0.12) duduk(); }
        else if (Math.random() < 0.15) hammer();
      } catch { /* ignore */ }
    }, 6000);
  }
  const onGesture = () => {
    if (gestured) return;
    gestured = true;
    try { audio().resume(); } catch { /* ignore */ }
    startAmbient();
  };
  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);

  // ---------- render ----------
  const chat = $('#chat');
  const els = new WeakMap();
  function push(m) {
    S.msgs.push(m);
    const el = build(m);
    els.set(m, el);
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return m;
  }
  function rerender(m) {
    const old = els.get(m);
    if (!old) return;
    const el = build(m);
    els.set(m, el);
    old.replaceWith(el);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function build(m) {
    const el = document.createElement('div');
    if (m.kind === 'sep') { el.className = 'sep'; el.textContent = m.text; return el; }
    if (m.kind === 'sys') { el.className = 'sys' + (m.unread ? ' unread' : ''); el.textContent = m.text; return el; }

    el.className = `msg ${m.from}` + (m.legend ? ' legend' : '');
    if (m.who && AR.CAST[m.who]) {
      const c = AR.CAST[m.who], n = document.createElement('div');
      n.className = 'who-name'; n.textContent = c.name; n.style.color = c.color;
      el.appendChild(n);
    }
    const body = document.createElement('div');
    el.appendChild(body);
    if (m.deleted) {
      el.classList.add('deleted');
      body.textContent = '🚫 Сообщение удалено';
    } else if (m.kind === 'text') {
      body.textContent = m.text;
    } else if (m.kind === 'transfer') {
      el.classList.add('transfer');
      body.innerHTML = `<div>💸 Вам перевод</div><div class="sum">50 ₽</div><div>«${esc(m.text)}»</div>`;
    } else if (m.kind === 'voice') {
      body.innerHTML = `<div class="voice"><div class="play">▶</div><div class="wave">▂▃▅▂▇▃▂▅▆▃▂▅▃▇▂</div><div>0:${m.len}</div></div>`;
      body.querySelector('.voice').onclick = () => (m.feast ? feast() : Math.random() < 0.5 ? alikVoice() : moo());
    } else if (m.kind === 'photo') {
      el.classList.add('photo');
      body.innerHTML = `${esc(m.text)}${PHOTO}<div class="cap">платёжка.jpg</div>`;
    } else if (m.kind === 'sticker') {
      el.classList.add('sticker');
      body.innerHTML = `<div class="st-e">${m.e}</div><div class="st-c">${esc(m.c)}</div>`;
    } else if (m.kind === 'fwd') {
      el.classList.add('fwd');
      body.innerHTML = `<div class="fwd-from">↪ Переслано от: ${esc(m.f)}</div><div>${esc(m.text)}</div>`;
    } else if (m.kind === 'doc') {
      el.classList.add('doc');
      body.innerHTML = `<div class="doc-title">📄 ${esc(m.title)}</div>` +
        m.rows.map(([n, v]) => `<div class="doc-row"><span>${esc(n)}</span><b>−${v.toLocaleString('ru-RU')} ₽</b></div>`).join('') +
        `<div class="doc-row doc-total"><span>Итого в пользу Алика</span><b>${m.total.toLocaleString('ru-RU')} ₽</b></div>` +
        '<div class="doc-stamp">🐏 УТВЕРЖДАЮ</div>';
    } else if (m.kind === 'job') {
      body.textContent = m.text;
      if (!m.answered) {
        const b = document.createElement('div'); b.className = 'job-btns';
        b.innerHTML = '<button>Ладно, сделаю</button><button>Нет, сначала деньги</button>';
        const [yes, no] = b.querySelectorAll('button');
        yes.onclick = () => answerJob(m, true, b);
        no.onclick = () => answerJob(m, false, b);
        body.appendChild(b);
      }
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (m.edited ? 'изменено ' : '') + m.time + (m.from === 'me' ? ' ✓✓' : '');
    el.appendChild(meta);
    if (m.react) {
      const r = document.createElement('div');
      r.className = 'react'; r.textContent = m.react;
      el.appendChild(r);
    }
    return el;
  }

  const PHOTO = `<svg viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg">
    <rect width="220" height="150" fill="#9fd3f5"/>
    <polygon points="0,110 70,35 125,110" fill="#8b7aa8"/><polygon points="55,51 70,35 86,52 75,49 66,55" fill="#fff"/>
    <polygon points="90,110 160,20 220,110" fill="#7a6a98"/><polygon points="143,42 160,20 178,43 166,39 155,46" fill="#fff"/>
    <rect y="108" width="220" height="42" fill="#8cc265"/>
    <g transform="translate(70,82)">
      <rect x="12" y="30" width="5" height="16" fill="#333"/><rect x="40" y="30" width="5" height="16" fill="#333"/>
      <circle cx="15" cy="22" r="12" fill="#fff"/><circle cx="30" cy="16" r="14" fill="#fff"/><circle cx="44" cy="22" r="12" fill="#fff"/>
      <circle cx="28" cy="28" r="12" fill="#fff"/>
      <ellipse cx="58" cy="14" rx="9" ry="11" fill="#333"/><circle cx="61" cy="11" r="1.6" fill="#fff"/>
      <path d="M51 7 q-8 -2 -6 7" stroke="#b58b4c" stroke-width="3" fill="none"/>
    </g>
    <text x="110" y="143" font-size="11" text-anchor="middle" fill="#2d4a1e" font-family="sans-serif">ОПЛАЧЕНО ✅ (честно)</text>
  </svg>`;

  const MOODS = ['😡', '😠', '😒', '😐', '😐', '🙂', '🙂', '😊', '😄', '🥰', '🥰'];
  function renderHud() {
    $('#debt').textContent = S.debt.toLocaleString('ru-RU') + ' ₽';
    $('#days').textContent = S.day;
    $('#patience').textContent = '❤️'.repeat(S.patience) + '🖤'.repeat(MAX_PATIENCE - S.patience);
    $('#mood').textContent = MOODS[S.mood];
    $('#gameDate').textContent = dateOf(S.day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    $('#clock').textContent = fmtTime(S.clock);
    $('#muteBtn').textContent = S.muted ? '🔇' : '🔊';
    const bat = $('#bat');
    bat.textContent = `${S.battery}% ${S.battery <= 15 ? '🪫' : '🔋'}`;
    bat.classList.toggle('low', S.battery <= 15);
    const av = $('#avatar');
    av.textContent = S.ram ? '🐏' : 'А';
    av.classList.toggle('ram', S.ram);
    if (S.day >= 365) unlock('year');
  }
  function setStatus(text, cls = '') {
    const s = $('#status'); s.textContent = text; s.className = 'status ' + cls;
  }
  // статус «после ответа»: ночью — «был(а) в 03:14»
  function restStatus() {
    if (S.offlineDays > 0) setStatus('был давно');
    else if (isNight()) setStatus(`был(а) в ${realHHMM()}`);
    else setStatus(Math.random() < 0.5 ? 'был недавно' : 'в сети', 'online');
  }

  let toastT;
  function unlock(key) {
    if (!ACH[key] || S.ach[key]) return;
    S.ach[key] = S.day;
    const t = $('#toast');
    t.textContent = `🏆 ${ACH[key][0]}`;
    t.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  const mood = (d) => { S.mood = Math.max(0, Math.min(10, S.mood + d)); };

  // ---------- уведомления телефона ----------
  let notifT;
  function notify(icon, app, text) {
    const n = $('#notif');
    n.innerHTML = `<div class="n-icon">${icon}</div><div class="n-body"><div class="n-head"><b>${esc(app)}</b><span>сейчас</span></div><div>${esc(text)}</div></div>`;
    n.classList.remove('hidden');
    n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
    clearTimeout(notifT);
    notifT = setTimeout(() => n.classList.remove('show'), 4200 * Math.max(SPEED, 0.3));
    vibrate(30);
  }
  function randomNotif() {
    const [icon, app, t] = draw('NOTIF', L.NOTIF);
    let text = t;
    if (typeof t === 'function') {
      const spend = 90 + rnd(40) * 10;
      S.money = Math.max(0, S.money - spend);
      text = t({ spend, what: draw('SPEND', L.SPEND), money: S.money });
    }
    notify(icon, app, text);
  }

  // ---------- батарея ----------
  function drain(n = 1) {
    if (dead) return;
    const before = S.battery;
    S.battery = Math.max(0, S.battery - n);
    if (before > 15 && S.battery <= 15) notify('🪫', 'Система', `Низкий заряд батареи: ${S.battery}%`);
    renderHud();
    if (S.battery === 0) die();
  }
  function die() {
    dead = true;
    clearTimeout(idleT); clearTimeout(statusT);
    unlock('dead');
    save();
    $('#deadScreen').classList.remove('hidden');
    $('#deadScreen').innerHTML = '<div class="dead-in"><div class="dead-icon">🔌</div><div>Телефон сел</div><button id="chargeBtn">Поставить на зарядку</button></div>';
    $('#chargeBtn').onclick = charge;
  }
  async function charge() {
    const ds = $('#deadScreen');
    ds.innerHTML = '<div class="dead-in"><div class="dead-icon">⚡</div><div id="chg">1%</div></div>';
    for (let p = 1; p <= 100; p += 9) { $('#chg').textContent = p + '%'; await sleep(120); }
    S.battery = 100;
    ds.classList.add('hidden');
    dead = false;
    setBusy(false);
    renderHud();
    await awayBurst(2 + rnd(3), 1 + rnd(2), 'Пока телефон заряжался');
    armIdle(); armStatus();
  }

  // ---------- выбор реплик игрока ----------
  // Опция: { text, tone, act?, arg?, scene?, go? }
  function buildChoices() {
    if (S.scene) {
      const sc = SC[S.scene.id], n = sc.nodes[S.scene.node];
      return n.opts.map((o, i) => {
        const gen = () => (typeof o.t === 'function' ? o.t(S.scene.vars) : Array.isArray(o.t) ? draw(`${S.scene.id}.${S.scene.node}.o${i}`, o.t) : o.t);
        const t = gen().length > 8 ? pickFresh(gen, playerDecor) : gen();
        return { text: t, tone: o.tone || 'polite', scene: S.scene.id, go: o.go };
      });
    }
    const ctx = S.ctx || {};
    const P = (k, map) => pickFresh(() => fill(draw(k, D[k]), map || {}), playerDecor);
    const P2 = (a, b) => pickFresh(() => `${draw(a, D[a])} ${draw(b, D[b])}`, playerDecor);
    const PL = (key, arr) => pickFresh(() => draw(key, arr), playerDecor);
    const out = [];
    const add = (o) => out.length < 2 && out.push(o);

    if (ctx.offended) add({ text: P('P_SORRY'), tone: 'polite', act: 'sorry' });
    if (ctx.type === 'photo') add({ text: P('P_PHOTO'), tone: 'neutral', act: 'photo' });
    if (ctx.type === 'voice') add({ text: P('P_VOICE'), tone: 'neutral', act: 'voice' });
    if (ctx.type === 'transfer') add({ text: P('P_TRANSFER'), tone: 'neutral', act: 'transferQ' });
    if (ctx.type === 'readonly') add({ text: P('P_PING'), tone: 'neutral', act: 'ping' });
    if (ctx.type === 'short') add({ text: P('P_SHORT', { s: ctx.s.replace(/[.!…,].*$/, '') }), tone: 'neutral', act: 'shortQ', arg: ctx.s });
    if (ctx.type === 'idle') add({ text: PL('IDLE_Q', L.IDLE_Q), tone: 'polite', act: 'idleReply' });
    if (ctx.type === 'sticker') add({ text: PL('STICKER_Q', L.STICKER_Q), tone: 'neutral', act: 'stickerQ' });
    if (ctx.type === 'fwd') add({ text: PL('FWD_Q', L.FWD_Q), tone: 'neutral', act: 'fwdQ' });
    if (ctx.type === 'reactOnly') add({ text: PL('REACT_Q', L.REACT_Q), tone: 'neutral', act: 'reactQ' });
    if (ctx.deleted) add({ text: PL('DEL_Q', L.DEL_Q), tone: 'neutral', act: 'deletedQ' });
    if (ctx.legendary) add({ text: P('P_LEGEND'), tone: 'polite', act: 'legendQ' });
    if (ctx.when) add({ text: P('P_WHEN', { t: ctx.when, T: cap(ctx.when) }), tone: 'neutral', act: 'promiseCheck', arg: ctx.when });
    if (ctx.rel) {
      if (draw('RELQ', [0, 1])) add({ text: P('P_WHY_REL', { n: ctx.rel.n }), tone: 'neutral', act: 'whyRel', arg: ctx.rel });
      else add({ text: P('P_CONGRATS'), tone: 'polite', act: 'congrats', arg: ctx.rel });
    }
    if (ctx.constr) add({ text: P('P_DOUBT'), tone: 'neutral', act: 'defend' });
    const late = S.promises.filter((p) => p.due != null && p.due < S.day && !p.asked);
    if (late.length && Math.random() < 0.35) {
      const i = S.promises.indexOf(late[rnd(late.length)]);
      add({ text: P('P_PREV', { t: S.promises[i].t, date: fmtDate(S.promises[i].made) }), tone: 'neutral', act: 'prev', arg: i });
    }
    if (ctx.group) add({ text: PL('GQ', ['Алик, я всё видел.', 'Алик, что это было?!', 'Я там всё прочитал.', '«Пусть закаляется»?!', 'Алик, это был семейный чат?']), tone: 'neutral', act: 'group' });
    if (ctx.wrong) add({ text: PL('WQ', AR.WRONG_Q), tone: 'neutral', act: 'wrong' });
    const arcId = ctx.arc || (Math.random() < 0.2 && Object.keys(S.arcs).find((id) => S.arcs[id].i < AR.ARCS[id].eps.length));
    if (arcId) add({ text: PL('F_' + arcId, AR.ARCS[arcId].follow), tone: 'polite', act: 'arc', arg: arcId });
    if (S.stats.moo > 0 && Math.random() < 0.2) add({ text: P('P_COW'), tone: 'cow' });

    out.push({ text: P2('P_POL_A', 'P_POL_B'), tone: 'polite' });
    if (out.length < 3) out.push({ text: P2('P_NEU_A', 'P_NEU_B'), tone: 'neutral' });
    out.push({ text: P2('P_RUDE_A', 'P_RUDE_B'), tone: 'rude' });
    return out.slice(0, 4);
  }

  function renderChoices() {
    const box = $('#choices');
    box.innerHTML = '';
    if (!S.choices) S.choices = buildChoices();
    S.choices.forEach((o) => {
      const b = document.createElement('button');
      b.textContent = o.text;
      if (o.tone === 'rude') b.classList.add('rude');
      if (o.scene || o.act) b.classList.add('ctx');
      b.disabled = busy;
      b.onclick = () => send(o);
      box.appendChild(b);
    });
    $('#input').placeholder = S.scene ? 'Выберите ответ выше или напишите своё…' : 'Сообщение…';
  }
  function setBusy(v) {
    busy = v;
    document.querySelectorAll('.choices button, .job-btns button, #sendBtn').forEach((b) => (b.disabled = v));
  }

  // ---------- gameplay ----------
  const THREAT_RE = /суд|полиц|заявлен|прокур|юрист|адвокат|коллектор/i;
  function classify(text) {
    if (/коров|му{2,}|мыч/i.test(text)) return 'cow';
    if (/[А-ЯЁA-Z]{4,}/.test(text) || /!!|верни|обман|врать|врёшь|суд|полиц|заявлен|приеду/i.test(text)) return 'rude';
    if (/пожалуйста|извин|прост|добр|здравств|спасибо|🙏/i.test(text)) return 'polite';
    return 'neutral';
  }

  async function send(opt) {
    if (busy || dead || !opt.text.trim()) return;
    setBusy(true);
    clearTimeout(idleT);
    idleCount = 0;
    clearUnread();
    let tone = opt.tone || classify(opt.text);
    if (tone === 'rude' && !opt.scene && THREAT_RE.test(opt.text)) tone = 'threat';
    tick(1 + rnd(5));
    const mine = push({ from: 'me', kind: 'text', text: opt.text, time: fmtTime(S.clock) });
    markSeen(opt.text);
    S.stats.sent++;
    unlock('first');
    if (isNight()) unlock('nightowl');
    if (tone === 'polite') { if (++S.politeStreak >= 10) unlock('saint'); } else S.politeStreak = 0;
    if ((tone === 'rude' || tone === 'threat') && !opt.scene) { unlock(tone); shake(); }
    if (tone === 'cow') unlock('cow');
    S.choices = null;
    drain(1);
    renderHud(); save();
    if (dead) return;

    await sleep((500 + rnd(700)) * (isNight() ? 2 : 1));
    setStatus('прочитано');

    // реакция на сообщение игрока; иногда — вместо ответа
    let reactOnly = false;
    if (!opt.scene && Math.random() < 0.18) {
      await sleep(600);
      mine.react = draw('R_' + tone, L.REACT[tone] || L.REACT.neutral);
      rerender(mine);
      vibrate(20);
      reactOnly = !opt.act && tone !== 'rude' && !S.scene && Math.random() < 0.3;
    }

    if (reactOnly) {
      unlock('react');
      S.ctx = { type: 'reactOnly' };
    } else if (opt.scene) {
      await enterNode(opt.scene, opt.go);
    } else if (S.scene) {
      // свой текст посреди сцены — сцена прерывается
      S.scene = null;
      await alikTurn(tone);
    } else if (opt.act) {
      await contextual(opt.act, opt.arg);
    } else {
      await alikTurn(tone);
    }

    S.patience = Math.max(0, S.patience - 1);
    if (S.patience === 0) {
      await sleep(600);
      push({ kind: 'sys', text: draw('FLOOR', [
        'Вы полежали на полу 15 минут. Терпение восстановлено.', 'Вы вышли на балкон и посчитали голубей. Терпение восстановлено.',
        'Вы съели целую пачку гречки. Терпение восстановлено.', 'Вы посмотрели видео с котиками. Терпение восстановлено.',
        'Вы поорали в подушку. Терпение восстановлено.', 'Вы открыли сайт вакансий и закрыли. Терпение восстановлено.',
        'Вы продали микроволновку. Терпение восстановлено.', 'Вы написали завещание: всё — Алику, пусть подавится. Терпение восстановлено.',
        'Вы сдали кровь за деньги. Терпение восстановлено, гемоглобин — нет.', 'Вы подрались с голубем за хлеб и победили. Терпение восстановлено.',
        'Вы съели доширак без специй — специи на чёрный день. Терпение восстановлено.', 'Вы примерили гроб в ритуальном салоне. Удобно. Терпение восстановлено.',
        'Вы позвонили маме. Мама спросила про Алика. Терпение восстановлено не полностью.',
      ]) });
      S.patience = MAX_PATIENCE;
      unlock('floor');
    }
    if (!S.ram && S.stats.sent >= 25) {
      S.ram = true;
      push({ kind: 'sys', text: 'Алик Воздухонесян сменил фото профиля' });
      unlock('ram');
    }
    if (Math.random() < 0.12) randomNotif();
    renderHud(); save();
    restStatus();
    setBusy(false);
    renderChoices();
    save();
    armIdle();
  }

  function shake() {
    const p = $('.phone');
    p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
    vibrate([80, 40, 80]);
  }

  function recordPromise(p) {
    if (!p) return;
    S.promises.push({ t: p.text, made: S.day, due: p.d == null ? null : S.day + p.d });
    if (S.promises.length >= 20) unlock('promises20');
  }

  const pair = (ka, a, kb, b) => uniq(() => `${draw(ka, a)} ${draw(kb, b)}`);

  // Ответы на контекстные реплики
  async function contextual(act, arg) {
    if (S.offlineDays > 0 && act !== 'sorry') return alikTurn('neutral');
    switch (act) {
      case 'sorry': {
        mood(3); unlock('sorry');
        const wasOff = S.offlineDays;
        S.offlineDays = Math.floor(S.offlineDays / 3);
        if (wasOff && S.offlineDays) nextDay(S.offlineDays);
        S.offlineDays = 0;
        await say([uniq(X.sorry)]);
        S.ctx = null;
        return;
      }
      case 'photo': await say([uniq(X.photo)]); S.ctx = null; return;
      case 'voice': await say([uniq(X.cow)]); S.ctx = null; return;
      case 'transferQ': await say([uniq(X.transferQ)]); S.ctx = null; return;
      case 'legendQ': mood(1); await say([uniq(X.legendQ)]); S.ctx = null; return;
      case 'shortQ': await say([uniq(() => X.shortQ(arg))]); S.ctx = null; return;
      case 'promiseCheck': await say([uniq(() => X.promiseCheck(arg))]); S.ctx = null; return;
      case 'congrats': {
        mood(2);
        await say([uniq(() => X.congrats(arg))]);
        if (Math.random() < 0.25 + S.mood * 0.03) await transfer();
        else { const r = uniq(X.ping); recordPromise(r.p); await say([`Про деньги — ${low(r.p.text)}.`]); S.ctx = { when: r.p.t }; return; }
        S.ctx = { type: 'transfer' };
        return;
      }
      case 'whyRel': { const r = uniq(() => X.whyRel(arg)); recordPromise(r.p); await say([r.text]); S.ctx = { when: r.p.t, constr: true }; return; }
      case 'defend': { const r = uniq(X.defend); recordPromise(r.p); await say([r.text]); S.ctx = { when: r.p.t }; return; }
      case 'ping': { const r = uniq(X.ping); recordPromise(r.p); await say([r.text]); S.ctx = { when: r.p.t }; return; }
      case 'arc': {
        const st = S.arcs[arg];
        if (st && st.i < AR.ARCS[arg].eps.length) return playArc(arg);
        await say([pair('NN_A', AR.NO_NEWS_A, 'NN_B', AR.NO_NEWS_B)]);
        S.ctx = null;
        return;
      }
      case 'group': mood(-1); await say([pair('GS_A', AR.GROUP_SEEN_A, 'GS_B', AR.GROUP_SEEN_B)]); S.ctx = null; return;
      case 'wrong': await say([pair('WA', AR.WRONG_A, 'WB', AR.WRONG_B)]); S.ctx = null; return;
      case 'prev': {
        if (S.promises[arg]) S.promises[arg].asked = true;
        const r = uniq(X.prev); recordPromise(r.p); await say([r.text]); S.ctx = { when: r.p.t }; return;
      }
      case 'idleReply': S.ctx = null; await say([uniq(() => draw('IDLE_A', L.IDLE_A))]); await promiseLine(); return;
      case 'stickerQ': S.ctx = null; await say([uniq(() => draw('STICKER_A', L.STICKER_A))]); return;
      case 'fwdQ': S.ctx = null; await say([uniq(() => draw('FWD_A', L.FWD_A))]); return;
      case 'reactQ': S.ctx = null; await say([uniq(() => draw('REACT_A', L.REACT_A))]); await promiseLine(); return;
      case 'deletedQ': S.ctx = null; await say([uniq(() => draw('DEL_A', L.DEL_A))]); return;
    }
  }

  // Сцены
  async function enterNode(sid, nid) {
    if (nid === null) { S.scene = null; S.ctx = null; await closingLine(); return; }
    if (nid.includes(':')) [sid, nid] = nid.split(':');
    const sc = SC[sid];
    if (!S.scene || S.scene.id !== sid) S.scene = { id: sid, vars: sc.init ? sc.init() : {} };
    S.scene.node = nid;
    const n = sc.nodes[nid], v = S.scene.vars;
    const res = (x) => (typeof x === 'function' ? x(v) : x);
    const gen = (key, arr) => () => res(Array.isArray(arr) ? draw(`${sid}.${nid}.${key}`, arr) : arr);
    const variant = (key, arr) => uniq(gen(key, arr));

    const fx = n.fx || {};
    if (fx.days) nextDay(fx.days);
    if (fx.debt) S.debt += fx.debt;
    if (fx.mood) mood(fx.mood);
    if (fx.barter) { S.debt -= v.v; S.items.push(v.n); }
    if (fx.invoice) S.debt -= v.total;
    if (fx.ach) unlock(fx.ach);
    if (n.sys) { await sleep(700); push({ kind: 'sys', text: gen('sys', n.sys)() }); }
    if (n.a) await say([variant('a', n.a)], false, n.who);
    if (n.doc) {
      await typing(2000, 'отправляет документ…');
      alikMsg({ kind: 'doc', title: `АКТ ВЗАИМОЗАЧЁТА № ${100 + rnd(900)}`, rows: v.rows, total: v.total });
      await sleep(600);
      push({ kind: 'sys', text: `Алик вычел из долга ${v.total.toLocaleString('ru-RU')} ₽ по акту.` });
    }
    if (n.a2) await say([variant('a2', n.a2)], false, n.who2);
    if (n.then === 'moo') { await sleep(400); moo(); }
    if (n.then === 'transfer') await transfer();
    if (n.then === 'promise') await promiseLine();
    renderHud();
    if (!n.opts) { S.scene = null; if (n.then !== 'promise') S.ctx = null; }
  }
  async function promiseLine() {
    const p = uniq(() => { const q = X.promise(); return { text: `${X.g('OATH')}, ${q.text}.`, q }; });
    recordPromise(p.q);
    await say([p.text]);
    S.ctx = { ...(S.ctx || {}), when: p.q.t };
  }

  // Сквозные сюжеты
  function nextArc() {
    const ids = Object.keys(AR.ARCS).filter((id) => {
      const st = S.arcs[id];
      return st ? st.i < AR.ARCS[id].eps.length && S.day - st.last >= 6 : S.day >= (AR.ARCS[id].minDay || 0);
    });
    return ids.length ? ids[rnd(ids.length)] : null;
  }
  async function playArc(id) {
    const st = (S.arcs[id] = S.arcs[id] || { i: 0, last: -99 });
    const ep = AR.ARCS[id].eps[st.i];
    st.i++; st.last = S.day;
    S.ctx = { arc: id };
    await say(ep.m);
    if (ep.fx && ep.fx.debt) S.debt += ep.fx.debt;
    if (ep.sys) { await sleep(500); push({ kind: 'sys', text: ep.sys }); }
    if (ep.fx && ep.fx.ach) unlock(ep.fx.ach);
    if (ep.then === 'promise') await promiseLine();
  }

  // Семейный чат, куда тебя «случайно» добавили
  async function groupChat() {
    await sleep(600);
    push({ kind: 'sys', text: 'Алик добавил вас в группу «Стройка под ключ 🏗️ Семья»' });
    const members = shuffle(Object.keys(AR.GROUP)).slice(0, 4 + rnd(3));
    for (const w of members) {
      const t = pickFresh(() => draw('G_' + w, AR.GROUP[w]), (x) => x);
      markSeen(t);
      await say([{ w, t }]);
    }
    await say([uniq(() => draw('GOOPS', AR.GROUP_OOPS))]);
    push({ kind: 'sys', text: 'Алик удалил вас из группы' });
    unlock('group');
    S.ctx = { group: true };
  }

  // Сообщение не тому адресату
  async function wrongChat() {
    await say([uniq(() => `${draw('WTO', AR.WRONG_TO)}, ${draw('WWHAT', AR.WRONG_WHAT)}.`)]);
    await sleep(900);
    await say([uniq(() => draw('WOOPS', AR.WRONG_OOPS))]);
    unlock('wrong');
    S.ctx = { wrong: true };
  }

  // Стикер, пересылка, удалённое сообщение
  async function sticker() {
    await typing(900, 'выбирает стикер…');
    const s = draw('STICKERS', L.STICKERS);
    alikMsg({ kind: 'sticker', e: s.e, c: s.c });
    unlock('sticker');
    S.ctx = { type: 'sticker' };
  }
  async function forward() {
    await typing(700);
    const f = pickFresh(() => draw('FWD', L.FWD), (x) => x);
    markSeen(f.t);
    alikMsg({ kind: 'fwd', f: f.f, text: f.t });
    unlock('fwd');
    if (Math.random() < 0.5) await say([uniq(() => draw('FWD_NOTE', L.FWD_NOTE))]);
    S.ctx = { type: 'fwd' };
  }
  async function deletedMsg() {
    await typing(700);
    const m = alikMsg({ kind: 'text', text: pickFresh(() => draw('DELETED', L.DELETED), (x) => x) });
    markSeen(m.text);
    await sleep(1300);
    m.deleted = true;
    rerender(m);
    unlock('deleted');
    S.ctx = { ...(S.ctx || {}), deleted: true };
  }

  async function closingLine() {
    await say([uniq(X.short)]);
  }

  // Реплика по времени суток (реальному)
  async function periodLine() {
    const p = period();
    if (p === 'day' || !L.PERIOD[p]) return;
    await say([addrLine('PER_' + p, L.PERIOD[p])]);
    if (p === 'friday' && Math.random() < 0.5) feast();
  }

  async function alikTurn(tone) {
    S.ctx = null;
    if (S.offlineDays > 0) {
      setStatus('был давно');
      await sleep(1500);
      nextDay(S.offlineDays);
      S.offlineDays = 0;
      await say([uniq(X.back)]);
    } else if (Math.random() < 0.65) {
      nextDay(1 + rnd(3));
    }

    if (tone === 'rude') {
      mood(-2);
      if (Math.random() < 0.3) {
        await typing(900, 'выбирает стикер…');
        alikMsg({ kind: 'sticker', e: '🏠🔥', c: 'Всё горит' });
      }
      await say([uniq(X.offended)]);
      S.offlineDays = Math.max(2, 3 + rnd(8) - Math.floor(S.mood / 3));
      setStatus('был давно');
      S.ctx = { offended: true };
      return;
    }
    if (tone === 'cow') { await say([uniq(X.cow)]); return; }
    if (tone === 'threat') {
      mood(-1);
      await say([uniq(X.threat)]);
      S.offlineDays = 1 + rnd(3);
      S.ctx = { offended: true };
      return;
    }

    if (Math.random() < 0.04) {
      await sleep(1200);
      push({ kind: 'sys', text: `Прочитано в ${draw('READ_ONLY_TIMES', D.READ_ONLY_TIMES)}` });
      unlock('night');
      S.ctx = { type: 'readonly' };
      return;
    }

    if (Math.random() < 0.22) await periodLine();

    const r = Math.random();
    const trChance = 0.02 + S.mood * 0.006;
    const arc = S.stats.sent >= 2 ? nextArc() : null;
    let c = 0;
    const at = (p) => r < (c += p);
    if (S.stats.sent >= 3 && at(0.13)) {
      const sid = draw('SCENES', Object.keys(SC));
      await enterNode(sid, SC[sid].start);
    } else if (arc && at(0.15)) {
      await playArc(arc);
    } else if (S.stats.sent >= 8 && at(0.03)) {
      await groupChat();
    } else if (S.stats.sent >= 5 && at(0.035)) {
      await wrongChat();
    } else if (at(0.04)) {
      await sticker();
    } else if (at(0.04)) {
      await forward();
    } else if (at(trChance)) {
      await transfer();
    } else if (at(0.06)) {
      const text = uniq(() => draw('JOBS', D.JOBS));
      await typing(text.length * 20);
      alikMsg({ kind: 'job', text });
    } else if (at(0.03)) {
      await typing(2500);
      alikMsg({ kind: 'photo', text: uniq(() => `${draw('PHOTOTXT', ['Вот, смотри, платёжка.', 'Держи скрин.', 'Смотри, всё отправлено.', 'Вот доказательство.', 'Фото из банка.'])} ${draw('PHOTOTX2', ['Всё отправил!', 'Проверяй!', 'Жди, дойдёт.', 'Банк подтвердил.', 'Идёт через Грузию.', 'Видишь? Честно.'])}`) });
      S.ctx = { type: 'photo' };
    } else if (at(0.04)) {
      await typing(3000, 'записывает голосовое…');
      alikMsg({ kind: 'voice', len: 10 + rnd(50), feast: period() === 'friday' || Math.random() < 0.25 });
      S.ctx = { type: 'voice' };
    } else if (at(0.06)) {
      const s = uniq(X.short);
      await say([s]);
      S.patience = Math.max(0, S.patience - 1);
      S.ctx = { type: 'short', s };
    } else {
      const ex = uniq(() => X.excuse({ preferLong: S.politeStreak >= 3 }));
      if (ex.legendary) unlock('legend');
      recordPromise(ex.p);
      const msgs = await say(ex.texts, ex.legendary);
      S.ctx = { when: ex.p && ex.p.t, rel: ex.r, constr: ex.constr, legendary: ex.legendary };
      if (Math.random() < 0.09) await editLast(msgs[msgs.length - 1], ex.p);
    }
    if (Math.random() < 0.04) await deletedMsg();
  }

  // Правка: «переведу завтра» → «переведу завтрашней весной»
  async function editLast(m, p) {
    if (!m || m.kind !== 'text') return;
    await sleep(1800);
    const w = draw('EDIT_WHEN', L.EDIT_WHEN);
    if (p && m.text.includes(p.t)) {
      m.text = m.text.replace(p.t, w);
      const rec = S.promises[S.promises.length - 1];
      if (rec && rec.t.includes(p.t)) { rec.t = rec.t.replace(p.t, w); rec.due = null; }
      S.ctx = { ...S.ctx, when: w };
    } else {
      m.text = m.text.replace(/[.!]?$/, draw('EDIT_SUFFIX', L.EDIT_SUFFIX) + '.');
    }
    m.edited = true;
    rerender(m);
    unlock('edited');
  }

  async function transfer() {
    await typing(1200);
    S.debt -= 50;
    S.money += 50;
    if (++S.stats.fifty >= 5) unlock('fifty5');
    alikMsg({ kind: 'transfer', text: draw('TRANSFER_NOTE', D.TRANSFER_NOTE) });
    S.ctx = { type: 'transfer' };
  }

  async function typing(ms, label = 'печатает…') {
    const bubble = document.createElement('div');
    bubble.className = 'typing-bubble';
    bubble.innerHTML = '<span></span><span></span><span></span>';
    const show = () => { setStatus(label, 'typing'); chat.appendChild(bubble); chat.scrollTop = chat.scrollHeight; };
    const hide = () => { bubble.remove(); setStatus('в сети', 'online'); };
    ms = Math.min(5000, Math.max(800, ms)) * (isNight() ? 1.5 : 1);
    show();
    if (Math.random() < 0.2) {
      await sleep(ms * 0.6); hide(); await sleep(1000 + rnd(1200)); show();
    }
    await sleep(ms);
    hide();
  }

  // Опечатка или автозамена: { text, fix } или null
  function typo(text) {
    const auto = shuffle(L.AUTO.slice()).find(([w]) => new RegExp(`(^|[^а-яё])${w}([^а-яё]|$)`, 'i').test(text));
    if (auto && Math.random() < 0.7) {
      const [w, bad] = auto;
      let orig = w, badCased = bad;
      const out = text.replace(new RegExp(`(^|[^а-яё])(${w})(?=[^а-яё]|$)`, 'i'), (_, pre, word) => {
        const upper = word[0] !== word[0].toLowerCase();
        orig = upper ? cap(w) : w; badCased = upper ? cap(bad) : bad;
        return pre + badCased;
      });
      return { text: out, fix: draw('FIX', L.FIX_FMT).replace('{w}', orig).replace('{b}', badCased) };
    }
    const words = text.match(/[а-яё]{6,}/gi);
    if (!words) return null;
    const w = words[rnd(words.length)], i = 1 + rnd(w.length - 3);
    const bad = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    return { text: text.replace(w, bad), fix: draw('FIX', L.FIX_FMT).replace('{w}', w).replace('{b}', bad) };
  }

  // texts: строки (от Алика или who) или { w, t } — от другого участника. Возвращает сообщения.
  async function say(texts, legend = false, who) {
    const out = [];
    for (const x of texts) {
      let text = typeof x === 'string' ? x : x.t;
      const from = typeof x === 'string' ? who : x.w;
      let fix = null;
      if (!from && Math.random() < (isNight() ? 0.2 : 0.06)) {
        const t = typo(text);
        if (t) ({ text, fix } = t);
      }
      await typing(600 + text.length * 22);
      out.push(alikMsg({ kind: 'text', text, legend, who: from }));
      if (fix) { await typing(500); alikMsg({ kind: 'text', text: fix }); unlock('typo'); }
      await sleep(250);
    }
    return out;
  }

  function alikMsg(m) {
    tick(1 + rnd(3));
    const msg = push({ from: 'alik', time: fmtTime(S.clock), ...m });
    if (m.kind === 'text' && /брат джан/i.test(m.text)) unlock('brat');
    beep();
    vibrate(40);
    if (Math.random() < mooChance()) setTimeout(moo, 300 + rnd(900));
    renderHud();
    return msg;
  }

  async function answerJob(m, yes, btns) {
    if (busy || dead || m.answered) return;
    m.answered = true;
    btns.remove();
    setBusy(true);
    clearTimeout(idleT);
    const reply = pickFresh(() => (yes
      ? draw('JY', ['Ладно, сделаю', 'Хорошо, сделаю', 'Ну ладно…', 'Сделаю. Но это последний раз.', 'Ладно. Ради тёти.', 'Эх… Хорошо.'])
      : draw('JN', ['Нет, сначала деньги', 'Сначала оплата, Алик', 'Нет. Хватит.', 'Не-а. Деньги вперёд.', 'Алик, нет.'])), playerDecor);
    markSeen(reply);
    push({ from: 'me', kind: 'text', text: reply, time: fmtTime(S.clock) });
    if (yes) {
      const add = 5000 + rnd(16) * 1000;
      nextDay(2 + rnd(3));
      push({ kind: 'sys', text: `Вы сделали работу. Долг Алика вырос на ${add.toLocaleString('ru-RU')} ₽` });
      S.debt += add;
      mood(2);
      unlock('fence');
      await say([uniq(X.jobYes)]);
    } else {
      mood(-1);
      await say([uniq(X.jobNo)]);
    }
    S.ctx = null; S.choices = null;
    renderHud(); save();
    setBusy(false);
    renderChoices();
    armIdle();
  }

  // ---------- Алик живёт сам: пишет первым, меняет статус ----------
  let idleT, statusT, idleCount = 0;
  function armIdle() {
    clearTimeout(idleT);
    if (dead || idleCount >= 3) return;
    idleT = setTimeout(onIdle, (20000 + rnd(40000)) * (idleCount + 1) * SPEED);
  }
  async function onIdle() {
    if (busy || dead || document.hidden || !$('#sheet').classList.contains('hidden')) return armIdle();
    idleCount++;
    setBusy(true);
    drain(1);
    if (!dead) {
      await idleAction();
      S.choices = null;
      save();
    }
    setBusy(false);
    if (!dead) { restStatus(); renderChoices(); armIdle(); }
  }
  async function idleAction() {
    const r = Math.random();
    // посреди сцены (Алик «умирает», торгуется…) не перебиваем её — только уведомления телефона
    if (S.offlineDays > 0 || S.scene || r < 0.15) { randomNotif(); return; }
    await sleep(300);
    if (r < 0.5) {
      const text = addrLine('IDLE', L.IDLE);
      await say([text]);
      unlock('idle');
      S.ctx = { type: 'idle' };
    } else if (r < 0.62) await sticker();
    else if (r < 0.76) await forward();
    else if (r < 0.86) { S.ctx = null; await deletedMsg(); }
    else if (r < 0.94) {
      await typing(3000, 'записывает голосовое…');
      alikMsg({ kind: 'voice', len: 10 + rnd(50), feast: period() === 'friday' });
      S.ctx = { type: 'voice' };
    } else await periodLine();
  }
  function armStatus() {
    clearTimeout(statusT);
    if (dead) return;
    statusT = setTimeout(async () => {
      if (!busy && !dead && S.offlineDays === 0 && !document.hidden) {
        const r = Math.random();
        if (r < 0.2) {
          // «печатает…» — и ничего не приходит
          const b = document.createElement('div');
          b.className = 'typing-bubble'; b.innerHTML = '<span></span><span></span><span></span>';
          setStatus('печатает…', 'typing'); chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
          await sleep(1500 + rnd(2500));
          b.remove();
          if (!busy) setStatus('в сети', 'online');
        } else if (isNight()) setStatus(`был(а) в ${realHHMM()}`);
        else setStatus(draw('WANDER', ['в сети', 'был(а) только что', 'был недавно', 'в сети', 'был(а) 5 минут назад']), 'online');
      }
      armStatus();
    }, (7000 + rnd(9000)) * SPEED);
  }

  // ---------- возвращение после паузы: непрочитанные ----------
  let unread = 0;
  function clearUnread() {
    unread = 0;
    document.title = 'Алик, где деньги?';
  }
  // Сообщения, которые «пришли, пока тебя не было» — без печатания, пачкой
  function awayMsg() {
    const r = Math.random();
    tick(20 + rnd(200));
    const base = { from: 'alik', time: fmtTime(S.clock) };
    if (r < 0.35) return push({ ...base, kind: 'text', text: addrLine('IDLE', L.IDLE) });
    if (r < 0.5) { const s = draw('STICKERS', L.STICKERS); return push({ ...base, kind: 'sticker', e: s.e, c: s.c }); }
    if (r < 0.65) { const f = pickFresh(() => draw('FWD', L.FWD), (x) => x); markSeen(f.t); return push({ ...base, kind: 'fwd', f: f.f, text: f.t }); }
    if (r < 0.75) return push({ ...base, kind: 'text', text: '', deleted: true });
    if (r < 0.85) return push({ ...base, kind: 'voice', len: 10 + rnd(50) });
    if (r < 0.92) { S.debt -= 50; S.money += 50; S.stats.fifty++; return push({ ...base, kind: 'transfer', text: draw('TRANSFER_NOTE', D.TRANSFER_NOTE) }); }
    const ex = uniq(() => X.excuse());
    recordPromise(ex.p);
    return push({ ...base, kind: 'text', text: ex.texts.join(' ') });
  }
  async function awayBurst(n, days, why) {
    nextDay(days);
    push({ kind: 'sys', text: `${why ? why + ' — ' : ''}непрочитанные сообщения`, unread: true });
    for (let i = 0; i < n; i++) awayMsg();
    unread = n;
    document.title = `(${n}) Алик, где деньги?`;
    unlock('away');
    notify('💬', 'Алик Воздухонесян', `${n} ${n < 5 ? 'новых сообщения' : 'новых сообщений'}`);
    beep();
    S.ctx = { type: 'idle' };
    S.choices = null;
    renderHud(); renderChoices(); save();
  }
  function checkAway() {
    const gapMin = AWAY ?? (S.lastSeen ? (Date.now() - S.lastSeen) / 60000 : 0);
    if (gapMin < 15 || !S.stats.sent) return;
    if (gapMin > 120) S.battery = 100; // телефон заряжался
    awayBurst(Math.min(5, 1 + Math.floor(gapMin / 30)), Math.min(10, 1 + Math.floor(gapMin / 120)));
  }
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(); return; }
    const gapMin = (Date.now() - hiddenAt) / 60000;
    if (hiddenAt && gapMin >= 3 && !busy && !dead && S.stats.sent) awayBurst(Math.min(4, 1 + Math.floor(gapMin / 10)), 1);
  });

  // ---------- sheet ----------
  function openSheet() {
    const pl = $('#promises');
    pl.innerHTML = S.promises.length ? '' : '<li class="locked">Пока пусто. Напиши Алику.</li>';
    for (const p of S.promises.slice().reverse()) {
      const li = document.createElement('li');
      const late = p.due != null && p.due < S.day;
      const due = p.due == null ? '∞ когда-нибудь' : fmtDate(p.due);
      li.innerHTML = `«${esc(p.t)}» <br><small>${late ? '<span class="late">❌ просрочено</span>' : '⏳'} срок: ${due}</small>`;
      pl.appendChild(li);
    }
    const sl = $('#arcs');
    sl.innerHTML = Object.entries(AR.ARCS).map(([id, a]) => {
      const i = S.arcs[id] ? S.arcs[id].i : 0, n = a.eps.length;
      return i ? `<li>${i >= n ? '✅' : '📺'} <b>${a.title}</b> — серия ${i}/${n}</li>` : '<li class="locked">🔒 ???</li>';
    }).join('');
    const il = $('#items');
    il.innerHTML = S.items.length ? S.items.map((i) => `<li>📦 ${esc(i)}</li>`).join('') : '<li class="locked">Ничего. Даже барана.</li>';
    const al = $('#achList');
    al.innerHTML = '';
    const got = Object.keys(S.ach).length;
    $('#achCount').textContent = `${got}/${Object.keys(ACH).length}`;
    for (const [k, [title, desc]] of Object.entries(ACH)) {
      const li = document.createElement('li');
      li.className = S.ach[k] ? '' : 'locked';
      li.innerHTML = `${S.ach[k] ? '🏆' : '🔒'} <b>${title}</b> — ${desc}`;
      al.appendChild(li);
    }
    $('#sheet').classList.remove('hidden');
  }

  // ---------- init ----------
  function seed() {
    push({ kind: 'sep', text: fmtDate(0) });
    push({ from: 'alik', kind: 'text', time: '18:02', text: 'Сынок, объект принят, заказчик доволен! Ты молодец, плитка — как зеркало. Деньги в пятницу.' });
    push({ from: 'me', kind: 'text', time: '18:05', text: 'Спасибо, Алик! Жду 🙏' });
    push({ kind: 'sys', text: '…прошло 184 дня…' });
    push({ kind: 'sep', text: fmtDate(S.day) });
  }

  $('#composer').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#input');
    const v = inp.value.trim();
    if (!v || busy) return;
    inp.value = '';
    send({ text: v });
  };
  $('#muteBtn').onclick = () => {
    S.muted = !S.muted;
    if (S.muted) try { speechSynthesis.cancel(); } catch { /* ignore */ }
    renderHud(); save();
  };
  $('#infoBtn').onclick = openSheet;
  $('#closeSheet').onclick = () => $('#sheet').classList.add('hidden');
  $('#sheet').onclick = (e) => { if (e.target.id === 'sheet') $('#sheet').classList.add('hidden'); };
  $('#notif').onclick = () => $('#notif').classList.remove('show');
  $('#resetBtn').onclick = () => {
    if (!confirm('Стереть всё и начать заново?')) return;
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    location.reload();
  };

  if (!S.msgs.length) { seed(); save(); } else S.msgs.forEach((m) => { const el = build(m); els.set(m, el); chat.appendChild(el); });
  chat.scrollTop = chat.scrollHeight;
  renderHud();
  checkAway();
  renderChoices();
  restStatus();
  if (S.battery === 0) die(); else { armIdle(); armStatus(); }
  save();
  window.__alik = { S, moo, SC, notify, awayBurst, reset: () => { resetting = true; localStorage.removeItem(SAVE_KEY); location.reload(); } }; // для отладки
})();

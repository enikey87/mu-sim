(function () {
  const $ = (s) => document.querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);
  const SPEED = /[?&]fast/.test(location.search) ? 0.03 : 1; // ?fast — для тестов
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
  };
  const TIERS = [
    [250, '📈 Отмазки Алика вышли на международный уровень'],
    [330, '🏛 Отмазки Алика вышли на исторический уровень'],
    [450, '🌌 Отмазки Алика вышли на космический уровень'],
  ];
  const AR = window.Arcs;

  // ---------- state ----------
  function fresh() {
    return {
      day: 184, clock: 9 * 60 + 41, debt: DEBT0, patience: MAX_PATIENCE, politeStreak: 0, mood: 5,
      msgs: [], ach: {}, promises: [], seen: [], bags: {}, items: [],
      stats: { moo: 0, fifty: 0, sent: 0 },
      offlineDays: 0, ram: false, muted: false, scene: null, ctx: null, choices: null, arcs: {}, tier: 0,
    };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.msgs ? s : null; } catch { return null; }
  }
  function save() {
    try {
      S.msgs = S.msgs.slice(-150);
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch { /* нет storage — играем без сохранения */ }
  }
  let S = load() || fresh();
  let seen = new Set(S.seen);
  let busy = false;

  // ---------- колоды без повторов ----------
  // Каждый элемент выпадает один раз за цикл; после исчерпания колода тасуется заново (или null, если noRefill).
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
  const keyOf = (t) => (typeof t === 'string' ? t : t.texts ? t.texts.join('|') : t.text);
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

  const X = window.Excuses.make(draw, () => S.tier);
  const SC = window.Scenes.make(X);
  const { D, cap, low, fill } = X;

  // ---------- time ----------
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

  // ---------- audio ----------
  let ac;
  const audio = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  function beep() {
    if (S.muted) return;
    try {
      const c = audio(), t = c.currentTime;
      [0, 0.12].forEach((d) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = 1320; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1);
        o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + 0.12);
      });
    } catch { /* ignore */ }
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
    try {
      const u = new SpeechSynthesisUtterance('М' + 'у'.repeat(5 + rnd(6)));
      u.lang = 'ru-RU'; u.pitch = 0.1; u.rate = 0.55; u.volume = 0.35;
      speechSynthesis.speak(u);
    } catch { /* нет синтеза речи */ }
  }
  function feast() {
    if (S.muted) return;
    try {
      const u = new SpeechSynthesisUtterance(draw('FEAST', ['Ну, за объект!', 'Вай, какой хаш!', 'Алик, иди сюда, тост!', 'За маму!', 'Алик, кто там пишет? Положи телефон!', 'Ещё по одной!']));
      u.lang = 'ru-RU'; u.rate = 1.2; u.volume = 0.5;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
  const mooChance = () => (S.stats.sent > 50 ? 0.15 : 0.07);

  // ---------- render ----------
  const chat = $('#chat');
  function push(m) {
    S.msgs.push(m);
    render(m);
    return m;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render(m) {
    const el = document.createElement('div');
    if (m.kind === 'sep') { el.className = 'sep'; el.textContent = m.text; }
    else if (m.kind === 'sys') { el.className = 'sys'; el.textContent = m.text; }
    else {
      el.className = `msg ${m.from}` + (m.legend ? ' legend' : '');
      if (m.kind === 'text') el.textContent = m.text;
      if (m.who && AR.CAST[m.who]) {
        const c = AR.CAST[m.who], n = document.createElement('div');
        n.className = 'who-name'; n.textContent = c.name; n.style.color = c.color;
        el.prepend(n);
      }
      else if (m.kind === 'transfer') {
        el.classList.add('transfer');
        el.innerHTML = `<div>💸 Вам перевод</div><div class="sum">50 ₽</div><div>«${esc(m.text)}»</div>`;
      } else if (m.kind === 'voice') {
        el.innerHTML = `<div class="voice"><div class="play">▶</div><div class="wave">▂▃▅▂▇▃▂▅▆▃▂▅▃▇▂</div><div>0:${m.len}</div></div>`;
        el.querySelector('.voice').onclick = () => (m.feast ? feast() : moo());
      } else if (m.kind === 'photo') {
        el.classList.add('photo');
        el.innerHTML = `${esc(m.text)}${PHOTO}<div class="cap">платёжка.jpg</div>`;
      } else if (m.kind === 'job') {
        el.textContent = m.text;
        if (!m.answered) {
          const b = document.createElement('div'); b.className = 'job-btns';
          b.innerHTML = '<button>Ладно, сделаю</button><button>Нет, сначала деньги</button>';
          const [yes, no] = b.querySelectorAll('button');
          yes.onclick = () => answerJob(m, true, b);
          no.onclick = () => answerJob(m, false, b);
          el.appendChild(b);
        }
      }
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = m.time + (m.from === 'me' ? ' ✓✓' : '');
      el.appendChild(meta);
    }
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
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
    const av = $('#avatar');
    av.textContent = S.ram ? '🐏' : 'А';
    av.classList.toggle('ram', S.ram);
    if (S.day >= 365) unlock('year');
  }
  function setStatus(text, cls = '') {
    const s = $('#status'); s.textContent = text; s.className = 'status ' + cls;
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
    const out = [];
    const add = (o) => out.length < 2 && out.push(o);

    if (ctx.offended) add({ text: P('P_SORRY'), tone: 'polite', act: 'sorry' });
    if (ctx.type === 'photo') add({ text: P('P_PHOTO'), tone: 'neutral', act: 'photo' });
    if (ctx.type === 'voice') add({ text: P('P_VOICE'), tone: 'neutral', act: 'voice' });
    if (ctx.type === 'transfer') add({ text: P('P_TRANSFER'), tone: 'neutral', act: 'transferQ' });
    if (ctx.type === 'readonly') add({ text: P('P_PING'), tone: 'neutral', act: 'ping' });
    if (ctx.type === 'short') add({ text: P('P_SHORT', { s: ctx.s.replace(/[.!…,].*$/, '') }), tone: 'neutral', act: 'shortQ', arg: ctx.s });
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
    const PL = (key, arr) => pickFresh(() => draw(key, arr), playerDecor);
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
  function classify(text) {
    if (/коров|му{2,}|мыч/i.test(text)) return 'cow';
    if (/[А-ЯЁA-Z]{4,}/.test(text) || /!!|верни|обман|врать|врёшь|суд|полиц|заявлен|приеду/i.test(text)) return 'rude';
    if (/пожалуйста|извин|прост|добр|здравств|спасибо|🙏/i.test(text)) return 'polite';
    return 'neutral';
  }

  async function send(opt) {
    if (busy || !opt.text.trim()) return;
    setBusy(true);
    const tone = opt.tone || classify(opt.text);
    tick(1 + rnd(5));
    push({ from: 'me', kind: 'text', text: opt.text, time: fmtTime(S.clock) });
    markSeen(opt.text);
    S.stats.sent++;
    unlock('first');
    if (tone === 'polite') { if (++S.politeStreak >= 10) unlock('saint'); } else S.politeStreak = 0;
    if (tone === 'rude' && !opt.scene) unlock('rude');
    if (tone === 'cow') unlock('cow');
    S.choices = null;
    renderHud(); save();

    await sleep(500 + rnd(700));
    setStatus('прочитано');
    if (opt.scene) {
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
      ]) });
      S.patience = MAX_PATIENCE;
      unlock('floor');
    }
    if (!S.ram && S.stats.sent >= 25) {
      S.ram = true;
      push({ kind: 'sys', text: 'Алик Воздухонесян сменил фото профиля' });
      unlock('ram');
    }
    renderHud(); save();
    if (S.offlineDays > 0) setStatus('был давно');
    else setStatus(Math.random() < 0.5 ? 'был недавно' : 'в сети', 'online');
    setBusy(false);
    renderChoices();
    save();
  }

  function recordPromise(p) {
    if (!p) return;
    S.promises.push({ t: p.text, made: S.day, due: p.d == null ? null : S.day + p.d });
    if (S.promises.length >= 20) unlock('promises20');
  }

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
        await say([uniq(() => `${draw('NN_A', AR.NO_NEWS_A)} ${draw('NN_B', AR.NO_NEWS_B)}`)]);
        S.ctx = null;
        return;
      }
      case 'group': mood(-1); await say([uniq(() => `${draw('GS_A', AR.GROUP_SEEN_A)} ${draw('GS_B', AR.GROUP_SEEN_B)}`)]); S.ctx = null; return;
      case 'wrong': await say([uniq(() => `${draw('WA', AR.WRONG_A)} ${draw('WB', AR.WRONG_B)}`)]); S.ctx = null; return;
      case 'prev': {
        if (S.promises[arg]) S.promises[arg].asked = true; const r = uniq(X.prev); recordPromise(r.p); await say([r.text]); S.ctx = { when: r.p.t }; return; }
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
    if (fx.ach) unlock(fx.ach);
    if (n.sys) { await sleep(700); push({ kind: 'sys', text: gen('sys', n.sys)() }); }
    if (n.a) await say([variant('a', n.a)], false, n.who);
    if (n.a2) await say([variant('a2', n.a2)], false, n.who);
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
      return !st || (st.i < AR.ARCS[id].eps.length && S.day - st.last >= 6);
    });
    return ids.length ? ids[rnd(ids.length)] : null;
  }
  async function playArc(id) {
    const st = (S.arcs[id] = S.arcs[id] || { i: 0, last: -99 });
    const ep = AR.ARCS[id].eps[st.i];
    st.i++; st.last = S.day;
    S.ctx = { arc: id };
    await say(ep.m);
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

  async function closingLine() {
    await say([uniq(X.short)]);
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
      await say([uniq(X.offended)]);
      S.offlineDays = Math.max(2, 3 + rnd(8) - Math.floor(S.mood / 3));
      setStatus('был давно');
      S.ctx = { offended: true };
      return;
    }
    if (tone === 'cow') { await say([uniq(X.cow)]); return; }

    if (Math.random() < 0.04) {
      await sleep(1200);
      push({ kind: 'sys', text: `Прочитано в ${draw('READ_ONLY_TIMES', D.READ_ONLY_TIMES)}` });
      unlock('night');
      S.ctx = { type: 'readonly' };
      return;
    }

    const r = Math.random();
    const trChance = 0.02 + S.mood * 0.006;
    const arc = S.stats.sent >= 2 ? nextArc() : null;
    let c = 0;
    const at = (p) => r < (c += p);
    if (S.stats.sent >= 3 && at(0.14)) {
      const sid = draw('SCENES', Object.keys(SC));
      await enterNode(sid, SC[sid].start);
    } else if (arc && at(0.16)) {
      await playArc(arc);
    } else if (S.stats.sent >= 8 && at(0.03)) {
      await groupChat();
    } else if (S.stats.sent >= 5 && at(0.035)) {
      await wrongChat();
    } else if (at(trChance)) {
      await transfer();
    } else if (at(0.07)) {
      const text = uniq(() => draw('JOBS', D.JOBS));
      await typing(text.length * 20);
      alikMsg({ kind: 'job', text });
    } else if (at(0.03)) {
      await typing(2500);
      alikMsg({ kind: 'photo', text: uniq(() => `${draw('PHOTOTXT', ['Вот, смотри, платёжка.', 'Держи скрин.', 'Смотри, всё отправлено.', 'Вот доказательство.', 'Фото из банка.'])} ${draw('PHOTOTX2', ['Всё отправил!', 'Проверяй!', 'Жди, дойдёт.', 'Банк подтвердил.', 'Идёт через Грузию.', 'Видишь? Честно.'])}`) });
      S.ctx = { type: 'photo' };
    } else if (at(0.04)) {
      await typing(3000, 'записывает голосовое…');
      alikMsg({ kind: 'voice', len: 10 + rnd(50), feast: Math.random() < 0.3 });
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
      await say(ex.texts, ex.legendary);
      S.ctx = { when: ex.p && ex.p.t, rel: ex.r, constr: ex.constr, legendary: ex.legendary };
    }
  }

  async function transfer() {
    await typing(1200);
    S.debt -= 50;
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
    ms = Math.min(5000, Math.max(800, ms));
    show();
    if (Math.random() < 0.2) {
      await sleep(ms * 0.6); hide(); await sleep(1000 + rnd(1200)); show();
    }
    await sleep(ms);
    hide();
  }

  // texts: строки (от Алика или who) или { w, t } — от другого участника
  async function say(texts, legend = false, who) {
    for (const x of texts) {
      const text = typeof x === 'string' ? x : x.t;
      await typing(600 + text.length * 22);
      alikMsg({ kind: 'text', text, legend, who: typeof x === 'string' ? who : x.w });
      await sleep(250);
    }
  }

  function alikMsg(m) {
    tick(1 + rnd(3));
    push({ from: 'alik', time: fmtTime(S.clock), ...m });
    if (m.kind === 'text' && /брат джан/i.test(m.text)) unlock('brat');
    beep();
    if (Math.random() < mooChance()) setTimeout(moo, 300 + rnd(900));
    renderHud();
  }

  async function answerJob(m, yes, btns) {
    if (busy || m.answered) return;
    m.answered = true;
    btns.remove();
    setBusy(true);
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
  }

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
  $('#resetBtn').onclick = () => {
    if (!confirm('Стереть всё и начать заново?')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    location.reload();
  };

  if (!S.msgs.length) { seed(); save(); } else S.msgs.forEach(render);
  renderHud();
  renderChoices();
  window.__alik = { S, moo, SC }; // для отладки
})();

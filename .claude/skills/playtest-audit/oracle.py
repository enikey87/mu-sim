# Объективные проверки партий: классы состояний мира (seed-*.world.json) + опорные фразы (seed-*.txt).
# python3 .claude/skills/playtest-audit/oracle.py <каталог с seed-*.txt>
#
# Факты пишет npm run playtest рядом с расшифровкой. Без .world.json проверки состояний
# пропускаются с пометкой в coverage — иначе «0 нарушений» врало бы о пустом окне.
#
# Проверка — это класс, а не строка: где можно, признак берётся из факта (окно серии, шаг
# сериала, гейт правила), а не из текста реплики. Опорные фразы, которые из факта не выведешь,
# объявлены в MARKERS, а тест src/tools/oracle.test.ts проверяет, что каждая ещё есть в игре.
import re, sys, glob, collections, json, os

# Опорные фразы: у каждой — класс, который она ловит, и почему её нельзя заменить фактом.
MARKERS = {
    'greet_morning': r'Доброе утро',
    'greet_evening': r'Добрый вечер',
    'boris_meet': r'новый баран\. Борис зовут',
    'arsen_meet': r'это арсен|пишет арсен|племянник арсен|юрист алика',
    'nune_meet': r'Здравствуйте\. Я Нуне',
    'grant_meet': r'вы плиточник\?',
    'razmik_meet': r'Это плиточник\? Алик сказал',
    'boris_writes': r'Это Борис тебе написал\. Сам!',
    'friday_claim': r'обещали в пятницу|Сегодня пятница — день, когда',
    'read_before_send': r'\[система\] Прочитано в (\d\d):(\d\d)',
    'mute_first': r'Вы отключили уведомления',
    'mute_again': r'Вы отключили их ещё раз',
    'evicted': r'Выселяю',
    'landlord_after': r'Когда за квартиру|Жду до пятницы',
}
# Куски тех же фраз, что обязаны остаться в исходниках игры: пропала фраза — проверка осиротела молча.
ANCHORS = {
    'greet_morning': 'Доброе утро',
    'greet_evening': 'Добрый вечер',
    'boris_meet': 'новый баран. Борис зовут',
    'arsen_meet': 'племянник Арсен',
    'nune_meet': 'Здравствуйте. Я Нуне',
    'grant_meet': 'вы плиточник?',
    'razmik_meet': 'Это плиточник? Алик сказал',
    'boris_writes': 'Это Борис тебе написал. Сам!',
    'friday_claim': 'обещали в пятницу',
    'read_before_send': 'Прочитано в',
    'mute_first': 'Вы отключили уведомления',
    'mute_again': 'Вы отключили их ещё раз',
    'evicted': 'Выселяю',
    'landlord_after': 'Жду до пятницы',
}
ONCE_SCENES = [
    'Займи 5000 до пятницы', 'радостная новость! Я взял кредит', 'есть новый объект!',
    'если позвонят и спросят — ты у меня не работал', 'Теперь мы кровные братья',
]
# Повторяемые события телефона: повтор — механика (календарь банка, батарея, непрочитанные), не находка.
# Судим по событию из выгрузки плейтеста (`notif[].event`), а не по подстроке текста: причина в начале
# карточки предложения кредита («Остаток критический…») прятала повтор предложения (#304).
REPEATABLE_EVENTS = {'bank.summary', 'bank.refusal', 'bank.level', 'bank.warn', 'battery', 'unread'}
# Телефон вне переписки: баннер сверху (батарея, непрочитанные) или карточка в ленте (банк, мама, Авито, #287).
PHONE_RE = r'\((?:уведомление телефона|карточка в ленте): (.*)\)$'
# Недельная сводка банка: у каждой недели — одна (#287). Неделя — по датам в самом тексте.
SUMMARY_RE = r'Сводка за неделю (.+?): баланс'

# Кто знакомится сам: подпись отправителя → фраза знакомства.
MEETS = [('Нуне', 'nune_meet', 'nune'), ('Заказчик Грант', 'grant_meet', 'grant'), ('Крановщик Размик', 'razmik_meet', 'razmik')]


def msg_lines(path):
    """Строки расшифровки, каждая из которых — одно сообщение, с его номером в партии.

    Разделитель дня приходит в расшифровку с ведущим переводом строки, варианты и ответ на
    допработу — с отступом: это не сообщения. Асайды (со скобки: баннер телефона, экран
    концовки; кроме карточки в ленте — она сообщение) отдаются с номером соседнего сообщения, но сами не нумеруются — по ним судят
    уведомления и хозяина квартиры.
    """
    out = []
    i = 0
    for ln in open(path).read().split('\n'):
        if not ln or ln.startswith('    '):
            continue
        if ln.startswith('Партия '):  # заголовок расшифровки
            continue
        out.append((i, ln))
        # карточка в ленте — сообщение S.msgs (#287), в отличие от асайдов
        if not ln.startswith('(') or ln.startswith('(карточка в ленте:'):
            i += 1
    return out


def facts_at(frames, i):
    """Факты на момент сообщения i: кадр, в чей ход оно попало, отдаёт своё «до»."""
    prev = None
    for f in frames:
        if f.get('at', 0) > i:
            return (prev or f).get('before') or {}
        prev = f
    return (prev or {}).get('mem') or {}


def arc_stepped(b, m, arc):
    """Сериал шагнул этим ходом."""
    return b.get('arc.' + arc) != m.get('arc.' + arc)


def death_states(frames):
    """Состояние линии смерти по кадрам: 'dead' — факт стоит, 'lost' — факт пропал без шага серии.

    Окно закрывает только сама серия: ход, снявший факт и шагнувший по сериалу. Факт, пропавший
    без этого шага (ветка ed718f8: состояние на 6 дней), оставляет линию открытой — именно там
    Алик и говорил обычно, а траурные варианты шли месяцами.
    """
    st = [None] * len(frames)
    lost = False
    v = collections.Counter()
    for i, f in enumerate(frames):
        b, m = f.get('before') or {}, f.get('mem') or {}
        if m.get('alik_dead'):
            st[i] = 'dead'
        elif b.get('alik_dead'):
            if arc_stepped(b, m, 'alik_death'):
                st[i] = None
            else:
                st[i] = 'lost'
                lost = True
                v['dead_fact_lost'] += 1
        elif lost:
            st[i] = 'lost'
    return st, v


def check_dead(frames, st, gated):
    """Смерть: речь, пачка непрочитанных и День выплаты — пока стоит факт смерти.

    Речь судится по правилу, которое её произнесло (said[].r): оправдано только сообщение,
    чьё правило гейтнуто на смерть. «В ходе выбрано хоть одно гейтнутое правило» не считается —
    кнопка игрока и молчащее Quiet_* есть в каждом мёртвом ходе. Сообщения игрока — не речь Алика.
    """
    v = collections.Counter()
    cov = collections.Counter()
    for i, f in enumerate(frames):
        if st[i] is None:
            continue
        b, m = f.get('before') or {}, f.get('mem') or {}
        stepped = arc_stepped(b, m, 'alik_death')
        dead = bool(b.get('alik_dead'))
        # без списка гейтов (старый дамп) судить нечем: проверка молчит, и об этом сказано в coverage
        if dead and not stepped and gated:
            spoken = [s for s in (f.get('said') or []) if s.get('w') != 'me']
            if spoken and any('r' not in s for s in spoken):
                cov['frames_without_speech_rules'] += 1  # старый дамп: кто произнёс — неизвестно
            else:
                loud = sum(1 for s in spoken if s.get('r') not in gated)
                if loud:
                    v['dead_speech'] += loud
        if dead and f.get('away'):
            v['dead_away_loud'] += len(f['away'])
        if st[i] == 'dead' and 'payday.at' not in b and 'payday.at' in m:
            v['dead_payday'] += 1
    return v, cov


def check_mute(frames):
    """Мьют: «первый раз» не звучит повторно, окно — из факта.

    Строка мьюта опознаётся фразой: в том же ходу лежат переименование группы и прочий системный
    текст, и «текст повторился» на них ложно. Фразу стережёт src/tools/oracle.test.ts.
    """
    v = collections.Counter()
    cov = collections.Counter()
    for f in frames:
        b, m = f.get('before') or {}, f.get('mem') or {}
        n1 = int(m.get('endgame.mutes') or 0)
        if n1 <= int(b.get('endgame.mutes') or 0):
            continue
        cov['mute_events'] += 1
        lines = [s for s in f.get('sys') or [] if s]
        first = [s for s in lines if re.search(MARKERS['mute_first'], s) and not re.search(MARKERS['mute_again'], s)]
        again = [s for s in lines if re.search(MARKERS['mute_again'], s)]
        if not first and not again:
            cov['mute_event_without_line'] += 1
            continue
        if n1 >= 2 and first:
            v['mute_as_first_repeat'] += 1
        if n1 == 1 and again and not first:
            v['mute_second_as_first'] += 1
    return v, cov


def check_notifications(frames):
    """Уведомления по кадрам: ложное собственное условие; повтор разового события; две сводки одной недели.

    Разовое — по событию: мама, строка пула без `repeat`. Ключ повтора — событие и текст без цифр
    («…Баланс: 9 700» и «…9 150» — одно событие). Предложение кредита повторяется законно, когда прежнее
    закрыто (продажа, «не сейчас», кредит взят, #287): находка — то же предложение, пока прежнее ещё висит
    (`credit.offer` на начало хода). Выгрузка без событий (старый формат) не судится — coverage.notif_without_event.
    """
    v = collections.Counter()
    cov = collections.Counter()
    seen = collections.Counter()
    weeks = collections.Counter()
    pending = None  # текст открытого предложения кредита
    for f in frames:
        if not (f.get('before') or {}).get('credit.offer'):
            pending = None
        for n in f.get('notif') or []:
            if n.get('fails'):
                v['notif_gate_false'] += 1
            ev = n.get('event')
            if not ev:
                cov['notif_without_event'] += 1
                continue
            text = n.get('text') or ''
            if ev == 'bank.summary':
                w = re.search(SUMMARY_RE, text)
                if w:
                    weeks[w.group(1)] += 1
                    if weeks[w.group(1)] > 1:
                        v['bank_week_repeat'] += 1
            if ev in REPEATABLE_EVENTS or (ev == 'life' and n.get('repeat')):
                continue
            key = ev + ':' + re.sub(r'\d[\d\s]*', '#', text)
            if ev == 'bank.offer':
                if pending == key:
                    v['notif_event_repeat'] += 1
                pending = key
                continue
            seen[key] += 1
            if seen[key] > 1:
                v['notif_event_repeat'] += 1
    return v, cov


def check_transcript(path, frames):
    """Опорные фразы расшифровки: знакомство, повтор разовой истории, «Прочитано», хозяин, пятница."""
    v = collections.Counter()
    lines = msg_lines(path)
    last_me = None
    meets = {k: False for k in ('boris', 'arsen', 'nune', 'grant', 'razmik')}
    boris_msgs = 0
    seen_once = collections.Counter()
    evicted = False
    for i, ln in lines:
        # «Прочитано» и время отправки сверяются внутри дня: иначе вчерашние 09:30 «раньше» сегодняшних 09:03
        if ln.startswith('—— '):
            last_me = None
        m = re.match(r'\[(\d\d):(\d\d)\] (.+?): (.*)', ln)
        if m:
            hh, mm, who, text = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
            if who == 'Я':
                last_me = hh * 60 + mm
                if re.search(MARKERS['greet_evening'], text) and hh < 16:
                    v['greet_off_hours'] += 1
                if re.search(MARKERS['greet_morning'], text) and hh >= 12:
                    v['greet_off_hours'] += 1
            else:
                if re.search(r'Борис', text) and not meets['boris'] and not re.search(MARKERS['boris_meet'], text):
                    v['boris_before_meet'] += 1
                if re.search(MARKERS['arsen_meet'], text, re.I):
                    meets['arsen'] = True
                elif re.search(r'Арсен', text) and not meets['arsen']:
                    v['arsen_before_meet'] += 1
                for prefix, key, meet in MEETS:
                    if not who.startswith(prefix):
                        continue
                    if meets[meet] and re.search(MARKERS[key], text):
                        v['meet_repeat'] += 1
                    meets[meet] = True
                if re.search(MARKERS['boris_meet'], text):
                    meets['boris'] = True
                if who.startswith('Борис'):
                    boris_msgs += 1
                if re.search(MARKERS['boris_writes'], text) and boris_msgs > 1:
                    v['boris_writes_again'] += 1
                for s in ONCE_SCENES:
                    if s in text:
                        seen_once[s] += 1
                        if seen_once[s] > 1:
                            v['once_scene_repeat'] += 1
        r = re.match(MARKERS['read_before_send'], ln)
        if r and last_me is not None and int(r.group(1)) * 60 + int(r.group(2)) < last_me:
            v['read_before_send'] += 1
        if re.search(MARKERS['evicted'], ln):
            evicted = True
        if evicted and re.search(MARKERS['landlord_after'], ln):
            v['landlord_after_evict'] += 1
        # утверждение об обещании — по кадру, где оно сказано, а не «где-то в партии»
        if frames and re.search(MARKERS['friday_claim'], ln):
            if not facts_at(frames, i).get('said.friday'):
                v['friday_without_fact'] += 1
    return v


# Частоты. Слепой рецензент по своему промпту не судит однообразие, поэтому повтор и затопление
# ленты видит только оракул (аудит 2026-09-24: 527 СМС банка на 574 сообщения Алика, сид 7).
# Повтор внутри дня, который и есть механика: счётчик Дня выплаты растёт строка за строкой.
SAME_DAY_OK = ['К выплате']
# Уведомлений не больше этой доли от реплик персонажей: до платежей по календарю было 0,05–0,08.
NOTIF_SHARE = float(os.environ.get('ORACLE_NOTIF_SHARE') or 0.25)


def check_frequency(path):
    """Одна и та же системная строка или уведомление дважды за игровой день; доля уведомлений в ленте.

    Числа в тексте не различают строки: «Списание 550 ₽. Баланс: 9 700» и «…9 150» — одно событие дважды.
    """
    v = collections.Counter()
    cov = collections.Counter()
    day = collections.Counter()
    for _, ln in msg_lines(path):
        if ln.startswith('—— '):
            day = collections.Counter()
            continue
        n = re.match(PHONE_RE, ln)
        s = re.match(r'\[система\] (.*)', ln)
        m = re.match(r'\[\d\d:\d\d\] (.+?): ', ln)
        if n:
            cov['notif_lines'] += 1
        elif m and m.group(1) != 'Я':
            cov['npc_lines'] += 1
        text = n.group(1) if n else s.group(1) if s else None
        if text is None or any(x in text for x in SAME_DAY_OK):
            continue
        key = ('n:' if n else 's:') + re.sub(r'\d[\d\s]*', '#', text)
        day[key] += 1
        if day[key] > 1:
            v['same_day_repeat'] += 1
    if cov['notif_lines'] > NOTIF_SHARE * cov['npc_lines']:
        v['notif_flood'] += 1
    return v, cov


def check_text_mute(path):
    """Мьют без дампа фактов: остаётся счёт повторов текста «в первый раз»."""
    v = collections.Counter()
    first = sum(
        1 for ln in open(path).read().split('\n')
        if ln.startswith('[система] ') and MARKERS['mute_first'] in ln and MARKERS['mute_again'] not in ln
    )
    if first > 1:
        v['mute_as_first_repeat'] += first - 1
    return v


def coverage(was, cov):
    """Пустое окно не выглядит нулём: у каждой проверки — счётчик наблюдений. Считает дамп."""
    c = was.get('coverage') or {}
    cov['dead_frames'] += int(c.get('dead_frames') or 0)
    cov['notifications'] += int(c.get('notifications') or 0)
    cov['away_messages'] += int(c.get('away_messages') or 0)
    cov['away_events'] += int(c.get('away_events') or 0)
    cov['games_with_dead'] += 1 if c.get('dead_frames') else 0
    cov['games_with_mute'] += 1 if c.get('had_mute') else 0
    cov['games_with_blood'] += 1 if c.get('had_blood') else 0
    cov['games_with_friday'] += 1 if c.get('had_friday') else 0
    cov['games_with_arc'] += 1 if c.get('frames_with_arc') else 0
    if not c.get('notifications'):
        cov['notif_unexercised'] += 1
    # пачка при мёртвом Алике молчит по правилу: окно — события пачки, а не её сообщения (старый дамп — сообщения)
    if not (c.get('away_events') or c.get('away_messages')):
        cov['away_unexercised'] += 1
    return cov


# Окна, которые можно потребовать через ORACLE_REQUIRE: опечатка — ошибка, а не тихий ноль.
WINDOWS = ('dead', 'mute', 'blood', 'friday', 'arc', 'notif', 'away')


def empty_windows(cov):
    """Окна, которых в выборке не было: молчащий ноль — не «чисто», а «не проверено»."""
    out = []
    for name, seen in (('dead', cov['games_with_dead']), ('mute', cov['games_with_mute']),
                       ('blood', cov['games_with_blood']), ('friday', cov['games_with_friday']),
                       ('arc', cov['games_with_arc']), ('notif', cov['notifications'])):
        if not seen:
            out.append(name)
    return out


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == '--markers':
        print(json.dumps({'markers': MARKERS, 'anchors': ANCHORS}, ensure_ascii=False, indent=2))
        sys.exit(0)
    if len(sys.argv) < 2:
        sys.exit('usage: oracle.py <dir with seed-*.txt>')
    root = sys.argv[1]
    tot = collections.Counter()
    cov = collections.Counter()
    affected = collections.defaultdict(set)
    n = world_n = 0
    share = []
    for p in sorted(glob.glob(root + '/seed-*.txt')):
        n += 1
        fv, fc = check_frequency(p)
        cov.update(fc)
        share.append(round(fc['notif_lines'] / max(fc['npc_lines'], 1), 2))
        for k in fv:
            affected[k].add(p)
        tot.update(fv)
        wp = p.replace('.txt', '.world.json')
        if not os.path.isfile(wp):
            cov['games_without_world'] += 1
            after = check_text_mute(p)
            tot.update(after)
            for k in after:
                affected[k].add(p)
            continue
        world_n += 1
        data = json.load(open(wp))
        frames = data.get('frames') or []
        gated = ((data.get('rules') or {}).get('deathGated')) or []
        if not gated:
            cov['games_without_rule_gates'] += 1
        st, dv = death_states(frames)
        after, dc = check_dead(frames, st, gated)
        after.update(dv)
        cov.update(dc)
        if dc.get('frames_without_speech_rules'):
            cov['games_without_speech_rules'] += 1
        # сколько кадров линия смерти остаётся открытой без факта — мера длины сломанного окна
        cov['dead_lost_frames'] += sum(1 for x in st if x == 'lost')
        nv, nc = check_notifications(frames)
        after.update(nv)
        cov.update(nc)
        mv, mc = check_mute(frames)
        after.update(mv)
        after.update(check_transcript(p, frames))
        cov.update(mc)
        tot.update(after)
        for k in after:
            affected[k].add(p)
        cov = coverage(data, cov)
    if n == 0:
        sys.exit(f'нет партий в {root} — проверять нечего')
    violations = {k: tot[k] for k in sorted(tot)}
    for name in empty_windows(cov):
        cov[name + '_unexercised'] = 1
    out = {
        'games': n,
        'games_with_world': world_n,
        'games_affected': {k: len(affected[k]) for k in sorted(violations)},
        'coverage': {k: cov[k] for k in sorted(cov)},
        # доля уведомлений от реплик персонажей по партиям: порог NOTIF_SHARE, находка — notif_flood
        'notif_share': {'max': max(share), 'limit': NOTIF_SHARE},
        'violations': violations,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    require = [x for x in (os.environ.get('ORACLE_REQUIRE') or '').split(',') if x]
    if os.environ.get('ORACLE_REQUIRE_DEAD'):
        require.append('dead')
    unknown = sorted(set(x for x in require if x not in WINDOWS))
    if unknown:
        sys.exit('ORACLE_REQUIRE: неизвестное окно — ' + ', '.join(unknown) + '; есть: ' + ', '.join(WINDOWS))
    empty = sorted(set(x for x in require if cov.get(x + '_unexercised')))
    if empty:
        sys.exit('coverage: окно не наблюдалось — ' + ', '.join(empty) + ': проверка пуста')

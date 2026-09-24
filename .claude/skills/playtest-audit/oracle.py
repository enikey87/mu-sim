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
# Повторяемые уведомления: у них повтор — не находка.
REPEATABLE_NOTIF = [
    'Списание', 'Сынок, ты поел', 'Когда за квартиру', 'Сынок, Алик заплатил',
    'позвони маме', 'заплатил твой армянин', 'Система', 'новых сообщ',
]
# Кто знакомится сам: подпись отправителя → фраза знакомства.
MEETS = [('Нуне', 'nune_meet', 'nune'), ('Заказчик Грант', 'grant_meet', 'grant'), ('Крановщик Размик', 'razmik_meet', 'razmik')]


def msg_lines(path):
    """Строки расшифровки, каждая из которых — одно сообщение, с его номером в партии.

    Разделитель дня приходит в расшифровку с ведущим переводом строки, варианты и ответ на
    допработу — с отступом: это не сообщения. Асайды (со скобки: уведомления телефона, экран
    концовки) отдаются с номером соседнего сообщения, но сами не нумеруются — по ним судят
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
        if not ln.startswith('('):
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
    """Уведомление при ложном собственном условии: класс, а не имя приложения."""
    v = collections.Counter()
    for f in frames:
        for n in f.get('notif') or []:
            if n.get('fails'):
                v['notif_gate_false'] += 1
    return v


def check_transcript(path, frames):
    """Опорные фразы расшифровки: знакомство, повтор разовой истории, «Прочитано», хозяин, пятница."""
    v = collections.Counter()
    lines = msg_lines(path)
    last_me = None
    notifs = collections.Counter()
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
        n = re.match(r'\(уведомление телефона: (.*)\)$', ln)
        if n:
            txt = re.sub(r'\d[\d\s]*', '#', n.group(1))
            if not any(x in txt for x in REPEATABLE_NOTIF):
                notifs[txt] += 1
                if notifs[txt] > 1:
                    v['notif_event_repeat'] += 1
        if re.search(MARKERS['evicted'], ln):
            evicted = True
        if evicted and re.search(MARKERS['landlord_after'], ln):
            v['landlord_after_evict'] += 1
        # утверждение об обещании — по кадру, где оно сказано, а не «где-то в партии»
        if frames and re.search(MARKERS['friday_claim'], ln):
            if not facts_at(frames, i).get('said.friday'):
                v['friday_without_fact'] += 1
    return v


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
    for p in sorted(glob.glob(root + '/seed-*.txt')):
        n += 1
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
        after.update(check_notifications(frames))
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

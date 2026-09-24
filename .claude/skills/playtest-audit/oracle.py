# Объективные проверки партий: текст (опорные фразы) + факты мира (seed-*.world.json).
# python3 .claude/skills/playtest-audit/oracle.py <каталог с seed-*.txt>
#
# Факты пишет npm run playtest рядом с расшифровкой. Без .world.json проверки состояний
# пропускаются с пометкой в coverage — иначе «0 нарушений» врало бы о пустом окне.
import re, sys, glob, collections, json, os

MUTE_FIRST = 'Вы отключили уведомления'
MUTE_AGAIN = 'Вы отключили их ещё раз'
DONOR_MARK = 'Донорский центр'


def check_text(path):
    """Старые проверки по расшифровке — ортогональны классам раундов 16–23."""
    lines = open(path).read().split('\n')
    v = collections.Counter()
    last_me_time = None
    notifs = collections.Counter()
    boris_intro = arsen_intro = False
    nune_wrote = grant_wrote = razmik_wrote = False
    boris_msgs = 0
    once_scenes = [
        'Займи 5000 до пятницы', 'радостная новость! Я взял кредит', 'есть новый объект!',
        'если позвонят и спросят — ты у меня не работал', 'Теперь мы кровные братья',
    ]
    seen_once = collections.Counter()
    seen_text = set()
    for ln in lines:
        m = re.match(r'\[(\d\d):(\d\d)\] (.+?): (.*)', ln)
        if ln.startswith('—— '):
            last_me_time = None
        if m:
            hh, mm, who, text = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
            t = hh * 60 + mm
            if who == 'Я':
                last_me_time = t
                if re.search(r'Добрый вечер', text) and hh < 16:
                    v['приветствие не по часам'] += 1
                if re.search(r'Доброе утро', text) and hh >= 12:
                    v['приветствие не по часам'] += 1
            else:
                if re.search(r'Борис', text) and not boris_intro and 'новый баран. Борис зовут' not in text:
                    v['Борис до знакомства'] += 1
                if 'новый баран. Борис зовут' in text:
                    boris_intro = True
                arsen_meet = re.search(r'это арсен|пишет арсен|племянник арсен|юрист алика', text, re.I)
                if re.search(r'Арсен', text) and not arsen_intro and not arsen_meet:
                    v['Арсен до знакомства'] += 1
                if arsen_meet:
                    arsen_intro = True
                if who.startswith('Борис'):
                    boris_msgs += 1
                if 'Это Борис тебе написал. Сам!' in text and boris_msgs > 1:
                    v['повторное «Борис научился писать»'] += 1
                if who.startswith('Нуне') and 'Здравствуйте. Я Нуне' in text and nune_wrote:
                    v['повторное знакомство'] += 1
                if who.startswith('Нуне'):
                    nune_wrote = True
                if who.startswith('Заказчик Грант') and 'вы плиточник?' in text and grant_wrote:
                    v['повторное знакомство'] += 1
                if who.startswith('Заказчик Грант'):
                    grant_wrote = True
                if who.startswith('Крановщик Размик') and 'Это плиточник? Алик сказал' in text and razmik_wrote:
                    v['повторное знакомство'] += 1
                if who.startswith('Крановщик Размик'):
                    razmik_wrote = True
                for s in once_scenes:
                    if s in text:
                        seen_once[s] += 1
                        if seen_once[s] > 1:
                            v['повтор разовой истории'] += 1
        m2 = re.match(r'\[система\] Прочитано в (\d\d):(\d\d)', ln)
        if m2 and last_me_time is not None and int(m2.group(1)) * 60 + int(m2.group(2)) < last_me_time:
            v['«Прочитано» раньше отправки'] += 1
        m3 = re.match(r'\(уведомление телефона: (.*)\)$', ln)
        if m3:
            txt = re.sub(r'\d[\d\s]*', '#', m3.group(1))
            repeatable = [
                'Списание', 'Сынок, ты поел', 'Когда за квартиру', 'Сынок, Алик заплатил',
                'позвони маме', 'заплатил твой армянин', 'Система', 'новых сообщ',
            ]
            if not any(r in txt for r in repeatable):
                notifs[txt] += 1
                if notifs[txt] > 1:
                    v['повтор уведомления-события'] += 1
        if 'Выселяю' in ln:
            seen_text.add('evicted')
        if 'evicted' in seen_text and ('Когда за квартиру' in ln or 'Жду до пятницы' in ln):
            v['хозяин после выселения'] += 1
    # Системное «отключили» как впервые — только без world-дампа (иначе считает check_world).
    return v


def check_text_mute(path):
    lines = open(path).read().split('\n')
    v = collections.Counter()
    mute_first = sum(
        1 for ln in lines
        if ln.startswith('[система] ') and MUTE_FIRST in ln and MUTE_AGAIN not in ln
    )
    if mute_first > 1:
        v['mute_as_first_repeat'] += mute_first - 1
    return v


def check_world(data):
    """Нарушения состояний мира по кадрам фактов."""
    v = collections.Counter()
    cov = collections.Counter()
    had_dead = False
    blood_ever = False
    friday_ever = False
    for fr in data.get('frames', []):
        mem = fr.get('mem') or {}
        if mem.get('alik_dead'):
            had_dead = True
            cov['dead_frames'] += 1
        if mem.get('blood.given'):
            blood_ever = True
        if mem.get('said.friday'):
            friday_ever = True
        dead = bool(mem.get('alik_dead'))
        for hit in fr.get('fired') or []:
            if not dead:
                continue
            ev = hit.get('event')
            for name in hit.get('chosen') or []:
                # День выплаты при смерти — класс раунда 20 (специфичность Beat_Payday > Quiet_Dead).
                if name.startswith('Beat_Payday'):
                    v['dead_payday'] += 1
                # Обычный ход Алика: не «с того света».
                elif ev == 'AlikTurn' and name != 'Turn_WhileDead':
                    v['dead_loud_turn'] += 1
                elif ev in ('AlikIdle', 'PeriodLine', 'PromiseDue', 'PromiseConditionMet') and not name.startswith('Quiet_Dead_'):
                    v['dead_loud_rule'] += 1
        for s in fr.get('sys') or []:
            mutes = int(mem.get('endgame.mutes') or 0)
            if MUTE_FIRST in s and MUTE_AGAIN not in s and mutes >= 2:
                v['mute_as_first_repeat'] += 1
        for a in fr.get('asides') or []:
            if DONOR_MARK in a and not blood_ever and not mem.get('blood.given'):
                v['donor_without_blood'] += 1
    c = data.get('coverage') or {}
    if c.get('dead_frames') or had_dead:
        cov['game_had_dead'] = 1
    if c.get('had_mute'):
        cov['game_had_mute'] = 1
    if c.get('had_blood') or blood_ever:
        cov['game_had_blood'] = 1
    if c.get('had_friday') or friday_ever:
        cov['game_had_friday'] = 1
    if c.get('had_razmik_finale'):
        cov['game_had_razmik_finale'] = 1
    return v, cov


def check_friday_text(path, world):
    """«Обещали в пятницу» без said.friday — класс утверждения без факта."""
    v = collections.Counter()
    if not world:
        return v
    friday = any((fr.get('mem') or {}).get('said.friday') for fr in world.get('frames') or [])
    if friday:
        return v
    text = open(path).read()
    if re.search(r'обещали в пятницу|Сегодня пятница — день, когда', text):
        v['friday_without_fact'] += 1
    return v


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage: oracle.py <dir with seed-*.txt>')
    root = sys.argv[1]
    tot = collections.Counter()
    cov = collections.Counter()
    n = 0
    world_n = 0
    for p in sorted(glob.glob(root + '/seed-*.txt')):
        n += 1
        tot.update(check_text(p))
        wp = p.replace('.txt', '.world.json')
        if os.path.isfile(wp):
            world_n += 1
            data = json.load(open(wp))
            wv, wc = check_world(data)
            tot.update(wv)
            tot.update(check_friday_text(p, data))
            cov.update(wc)
        else:
            cov['games_without_world'] += 1
            tot.update(check_text_mute(p))
    if n == 0:
        sys.exit(f'нет партий в {root} — проверять нечего')
    out = {
        'games': n,
        'games_with_world': world_n,
        'coverage': {k: cov[k] for k in sorted(cov)},
        'violations': {k: tot[k] for k in sorted(tot)},
    }
    if world_n and not cov.get('game_had_dead'):
        out['coverage']['dead_unexercised'] = True
    if world_n and not cov.get('game_had_mute'):
        out['coverage']['mute_unexercised'] = True
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if os.environ.get('ORACLE_REQUIRE_DEAD') and world_n and not cov.get('game_had_dead'):
        sys.exit('coverage: ни в одной партии не было окна alik_dead — dead_* проверки пусты')

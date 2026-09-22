# Объективные проверки по расшифровке партии (одинаково для любой версии игры).
# python3 .claude/skills/playtest-audit/oracle.py <каталог с seed-*.txt>
import re, sys, glob, collections, json
def check(path):
    lines = open(path).read().split('\n')
    v = collections.Counter()
    last_me_time = None
    notifs = collections.Counter(); seen_text = set()
    boris_intro = arsen_intro = False
    nune_wrote = grant_wrote = razmik_wrote = False
    boris_msgs = 0
    once_scenes = ['Займи 5000 до пятницы', 'радостная новость! Я взял кредит', 'есть новый объект!', 'если позвонят и спросят — ты у меня не работал', 'Теперь мы кровные братья']
    seen_once = collections.Counter()
    for ln in lines:
        m = re.match(r'\[(\d\d):(\d\d)\] (.+?): (.*)', ln)
        if ln.startswith('—— '): last_me_time = None
        if m:
            hh, mm, who, text = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
            t = hh * 60 + mm
            if who == 'Я':
                last_me_time = t
                if re.search(r'Добрый вечер', text) and hh < 16: v['приветствие не по часам'] += 1
                if re.search(r'Доброе утро', text) and hh >= 12: v['приветствие не по часам'] += 1
            else:
                if re.search(r'Борис', text) and not boris_intro and 'новый баран. Борис зовут' not in text: v['Борис до знакомства'] += 1
                if 'новый баран. Борис зовут' in text: boris_intro = True
                arsen_meet = re.search(r'это арсен|пишет арсен|племянник арсен|юрист алика', text, re.I)
                if re.search(r'Арсен', text) and not arsen_intro and not arsen_meet: v['Арсен до знакомства'] += 1
                if arsen_meet: arsen_intro = True
                if who.startswith('Борис'): boris_msgs += 1
                # серия «Это Борис тебе написал. Сам!» сама начинается с его «Бее.» — повтор, если он писал и раньше
                if 'Это Борис тебе написал. Сам!' in text and boris_msgs > 1: v['повторное «Борис научился писать»'] += 1
                if who.startswith('Нуне') and 'Здравствуйте. Я Нуне' in text and nune_wrote: v['повторное знакомство'] += 1
                if who.startswith('Нуне'): nune_wrote = True
                if who.startswith('Заказчик Грант') and 'вы плиточник?' in text and grant_wrote: v['повторное знакомство'] += 1
                if who.startswith('Заказчик Грант'): grant_wrote = True
                if who.startswith('Крановщик Размик') and 'Это плиточник? Алик сказал' in text and razmik_wrote: v['повторное знакомство'] += 1
                if who.startswith('Крановщик Размик'): razmik_wrote = True
                for s in once_scenes:
                    if s in text:
                        seen_once[s] += 1
                        if seen_once[s] > 1: v['повтор разовой истории'] += 1
        m2 = re.match(r'\[система\] Прочитано в (\d\d):(\d\d)', ln)
        if m2 and last_me_time is not None and int(m2.group(1)) * 60 + int(m2.group(2)) < last_me_time: v['«Прочитано» раньше отправки'] += 1
        m3 = re.match(r'\(уведомление телефона: (.*)\)$', ln)
        if m3:
            txt = re.sub(r'\d[\d\s]*', '#', m3.group(1))
            repeatable = ['Списание', 'Сынок, ты поел', 'Когда за квартиру', 'Сынок, Алик заплатил', 'позвони маме', 'заплатил твой армянин', 'Система', 'новых сообщ']
            if not any(r in txt for r in repeatable):
                notifs[txt] += 1
                if notifs[txt] > 1: v['повтор уведомления-события'] += 1
        if 'Выселяю' in ln: seen_text.add('evicted')
        if 'evicted' in seen_text and ('Когда за квартиру' in ln or 'Жду до пятницы' in ln): v['хозяин после выселения'] += 1
    return v
if __name__ == '__main__':
    tot = collections.Counter(); n = 0
    for p in sorted(glob.glob(sys.argv[1] + '/seed-*.txt')):
        n += 1
        tot.update(check(p))
    if n == 0: sys.exit(f'нет партий в {sys.argv[1]} — проверять нечего')
    print(json.dumps({'games': n, **{k: tot[k] for k in sorted(tot)}}, ensure_ascii=False, indent=0))

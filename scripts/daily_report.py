#!/usr/bin/env python3
"""日次報告（読み取り専用）。日付の区切りは JST。

標準の出力は「総ユーザー数・新規登録・有料人数（ライト/プロ）・無料人数（組織図の人数帯別）」だけ。
総ユーザー数＝有料＋無料（集計した時点の値）。
--detail を付けると、アクティブ・メンバー追加・プラン変更・アラート・直近7日も出す。

使い方（Cloud Shell）:
    TOKEN=$(gcloud auth print-access-token) python3 scripts/daily_report.py
    TOKEN=... python3 scripts/daily_report.py 2026-10-02   # 過去日を指定
    TOKEN=... python3 scripts/daily_report.py --detail     # 詳細つき

無料人数の人数帯は、そのユーザーの組織図のうち一番人数が多いもので分ける
（無料プランの上限は組織図1つあたり100人）。組織図が無い人は 0〜50未満 に入る。
人数帯は今の時点の値で、過去日を指定しても当時の値にはならない。
各人数帯のアクティブ（当日・直近7日・直近30日に使った人数）も今の時点から数える。
当日の列は、今日を集計するときだけ出す（Auth には最終利用時刻しか無いため）。

認証と TREEVIA_EXCLUDE（集計から外すユーザー）は user_stats.py と同じ。

データの制約:
- アクティブ（その日に使った人）は Auth の最終利用時刻しか無いため、当日分しか出せない。
- 編集はメンバーごとの最終更新時刻で数えるので「その日に編集されたメンバー数」になる。
  削除されたメンバーは数えられない。
"""
import datetime as dt
import math
import sys

from chart_stats import chart_path, fetch_charts, mask, parse_ts, run_collection_group
from user_stats import DOCS, TOKEN, excluded_uids, fetch_auth_users, req

JST = dt.timezone(dt.timedelta(hours=9))
DAY = 86400
PRICE = {'light': 380, 'pro': 980}
LIMIT = {'free': 100, 'light': 500}
WARN_RATIO = 0.8          # 上限の80%でアラート
PAID_IDLE_DAYS = 14       # 有料なのにこの日数使っていない
EMPTY_AFTER_DAYS = 3      # 登録からこの日数たっても組織図が空
EMPTY_WITHIN_DAYS = 14    # 古い放置アカウントは毎日出さない
WEEKDAYS = '月火水木金土日'
FREE_BANDS = [(0, 50), (50, 70), (70, 90), (90, 100)]
BARS = '▁▂▃▄▅▆▇█'


def fetch_user_docs():
    # users/{uid} の plan と更新時刻（プラン変更の検知に使う）
    docs, tok = {}, None
    while True:
        d = req(f'{DOCS}/users?pageSize=300' + (f'&pageToken={tok}' if tok else ''))
        for doc in d.get('documents', []):
            f = doc.get('fields', {})
            docs[doc['name'].rsplit('/', 1)[-1]] = {
                'plan': f.get('plan', {}).get('stringValue', 'free'),
                'updated': parse_ts(f.get('updatedAt', {}).get('timestampValue')),
            }
        tok = d.get('nextPageToken')
        if not tok:
            return docs


def fetch_members():
    members = []
    for row in run_collection_group('members', ['createdAt', 'updatedAt']):
        doc = row.get('document')
        if not doc:
            continue
        uid, key = chart_path(doc['name'])
        if not key:
            continue
        f = doc.get('fields', {})
        members.append({'uid': uid, 'chart': key,
                        'created': parse_ts(f.get('createdAt', {}).get('timestampValue')),
                        'updated': parse_ts(f.get('updatedAt', {}).get('timestampValue'))})
    return members


def day_start(d):
    return dt.datetime.combine(d, dt.time(), JST).timestamp()


def in_day(t, d):
    return t is not None and day_start(d) <= t < day_start(d) + DAY


def last_used(u):
    return parse_ts(u.get('lastRefreshAt')) or (int(u['lastLoginAt']) / 1000 if u.get('lastLoginAt') else None)


def spark(xs):
    # 0 は「·」、1以上は必ず棒を出す（大きい日に埋もれて消えないように）
    top = max(xs) or 1
    return ' '.join(BARS[math.ceil(x / top * len(BARS)) - 1] if x else '·' for x in xs)


def daily_counts(users, members, d):
    return {
        'new': sum(1 for u in users if in_day(int(u['createdAt']) / 1000, d)),
        'added': sum(1 for m in members if in_day(m['created'], d)),
        'adders': len({m['uid'] for m in members if in_day(m['created'], d)}),
    }


def diff(a, b):
    return f'{a - b:+d}' if a != b else '±0'


def summary(day, users, user_docs, members, charts, now):
    emails = {u['localId']: u.get('email') for u in users}
    plan_of = lambda uid: user_docs.get(uid, {}).get('plan', 'free')
    new = daily_counts(users, members, day)['new']
    prev = daily_counts(users, members, day - dt.timedelta(days=1))['new']
    paid = {p: sum(1 for uid in emails if plan_of(uid) == p) for p in PRICE}
    largest = {}
    for c in charts.values():
        largest[c['uid']] = max(largest.get(c['uid'], 0), c['count'])
    free = [(largest.get(u['localId'], 0), last_used(u)) for u in users if plan_of(u['localId']) not in PRICE]
    is_today = day == dt.datetime.fromtimestamp(now, JST).date()
    within = lambda t, days: t is not None and now - t <= days * DAY

    def band_row(name, rows):
        # 当日のアクティブは Auth の最終利用時刻しか無いため、今日を集計するときだけ出す
        today = f'{sum(1 for _, t in rows if in_day(t, day)):>4}' if is_today else '   -'
        return (f'   {name:<10} {len(rows):>4}人  {today}  {sum(1 for _, t in rows if within(t, 7)):>4}'
                f'  {sum(1 for _, t in rows if within(t, 30)):>4}')
    out = [f'━━ Treevia 日次報告 {day}（{WEEKDAYS[day.weekday()]}）━━━━━━━━━━━━━━━']
    out.append(f' 総ユーザー数   {len(users):>4}人')
    out.append(f' 新規登録       {new:>4}人   （前日比 {diff(new, prev)}）')
    out.append(f' 有料           {sum(paid.values()):>4}人   ライト  プロ')
    out.append(f'{"":<25}{paid["light"]:>6}{paid["pro"]:>6}')
    out.append(f' 無料人数       {len(free):>4}人   アクティブ→ 当日  7日  30日')
    for lo, hi in FREE_BANDS:
        out.append(band_row(f'{lo}〜{hi}未満', [r for r in free if lo <= r[0] < hi]))
    over = [r for r in free if r[0] >= FREE_BANDS[-1][1]]
    if over:  # 上限を超えている人（旧データなど）がいるときだけ出す
        out.append(band_row(f'{FREE_BANDS[-1][1]}以上', over))
    out.append('━' * 46)
    return '\n'.join(out)


def report(day, users, user_docs, members, charts, now):
    emails = {u['localId']: u.get('email') for u in users}
    plans = {uid: v['plan'] for uid, v in user_docs.items()}
    plan_of = lambda uid: plans.get(uid, 'free')
    label = {'free': '無料', 'light': 'ライト', 'pro': 'プロ'}
    is_today = day == dt.datetime.fromtimestamp(now, JST).date()

    week = [day - dt.timedelta(days=i) for i in range(6, -1, -1)]
    counts = [daily_counts(users, members, d) for d in week]
    cur, prev = counts[-1], counts[-2]
    avg = lambda k: sum(c[k] for c in counts[:-1]) / 6

    out = [f'━━ Treevia 日次報告 {day}（{WEEKDAYS[day.weekday()]}）━━━━━━━━━━━━━━━']
    out.append('                当日   前日比   前6日平均')
    out.append(f' 新規登録     {cur["new"]:>4}人   {diff(cur["new"], prev["new"]):>4}   {avg("new"):>6.1f}人')
    if is_today:
        active = sum(1 for u in users if in_day(last_used(u), day))
        out.append(f' アクティブ   {active:>4}人   （当日分のみ集計可）')
    out.append(f' メンバー追加 {cur["added"]:>4}人   {diff(cur["added"], prev["added"]):>4}   {avg("added"):>6.1f}人')
    out.append(f'  └追加した人 {cur["adders"]:>4}人   {diff(cur["adders"], prev["adders"]):>4}   {avg("adders"):>6.1f}人')
    paid = {p: sum(1 for uid in emails if plan_of(uid) == p) for p in PRICE}
    out.append(f' 有料         ライト{paid["light"]} / プロ{paid["pro"]}   '
               f'月¥{sum(PRICE[p] * n for p, n in paid.items()):,}（アプリの記録上）')

    total = {}
    for m in members:
        total[m['uid']] = total.get(m['uid'], 0) + 1

    out.append('')
    out.append('■ 新規登録')
    new_users = sorted((u for u in users if in_day(int(u['createdAt']) / 1000, day)),
                       key=lambda u: int(u['createdAt']))
    for u in new_users:
        t = dt.datetime.fromtimestamp(int(u['createdAt']) / 1000, JST).strftime('%H:%M')
        n = total.get(u['localId'], 0)
        out.append(f'  {t} {mask(u.get("email")):<26} 現在{n}人 ' + ('✓' if n else '（まだ空）'))
    if not new_users:
        out.append('  なし')

    out.append('')
    out.append('■ よく使った人（メンバーの追加・編集）')
    added, edited = {}, {}
    for m in members:
        if in_day(m['created'], day):
            added[m['uid']] = added.get(m['uid'], 0) + 1
        elif in_day(m['updated'], day):
            edited[m['uid']] = edited.get(m['uid'], 0) + 1
    busy = sorted(set(added) | set(edited), key=lambda k: -(added.get(k, 0) + edited.get(k, 0)))[:5]
    for uid in busy:
        out.append(f'  {mask(emails.get(uid)):<26} {label[plan_of(uid)]:<3} '
                   f'+{added.get(uid, 0)}人 / 編集{edited.get(uid, 0)}  （計{total.get(uid, 0)}人）')
    if not busy:
        out.append('  なし')

    out.append('')
    changed = [uid for uid, v in user_docs.items() if uid in emails and in_day(v['updated'], day)]
    out.append('■ プラン変更   ' + ('なし' if not changed else ''))
    for uid in changed:
        out.append(f'  {mask(emails.get(uid)):<26} → {label.get(plan_of(uid), plan_of(uid))}')

    out.append('')
    alerts = []
    for c in sorted(charts.values(), key=lambda c: -c['count']):
        limit = LIMIT.get(plan_of(c['uid']))
        if limit and c['count'] >= limit * WARN_RATIO:
            alerts.append(f'⚠ {label[plan_of(c["uid"])]}の上限{limit}人に近い: '
                          f'{mask(emails.get(c["uid"]))}（{c["count"]}人）')
    for u in users:
        uid = u['localId']
        if plan_of(uid) in PRICE:
            last = last_used(u)
            idle = int((now - last) // DAY) if last else None
            if idle is None or idle >= PAID_IDLE_DAYS:
                alerts.append(f'⚠ 有料なのに使っていない: {mask(u.get("email"))}（{idle}日）')
    for u in users:
        age = (now - int(u['createdAt']) / 1000) / DAY
        if EMPTY_AFTER_DAYS <= age <= EMPTY_WITHIN_DAYS and not total.get(u['localId']):
            alerts.append(f'⚠ 組織図が空のまま{int(age)}日: {mask(u.get("email"))}')
    out.append('■ アラート   ' + ('なし' if not alerts else ''))
    out += [f'  {a}' for a in alerts]

    out.append('')
    out.append('■ 直近7日     ' + '  '.join(WEEKDAYS[d.weekday()] for d in week))
    for key, name in (('new', '新規登録    '), ('added', 'メンバー追加'), ('adders', '追加した人  ')):
        xs = [c[key] for c in counts]
        out.append(f'  {name} {spark(xs).replace(" ", "  ")}   ' + ' '.join(str(x) for x in xs))
    out.append('━' * 46)
    return '\n'.join(out)


if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('TOKEN か TREEVIA_GCP_SA_B64 を環境変数で渡してください（user_stats.py の docstring 参照）')
    args = [a for a in sys.argv[1:] if a != '--detail']
    detail = '--detail' in sys.argv[1:]
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    day = dt.date.fromisoformat(args[0]) if args else dt.datetime.fromtimestamp(now, JST).date()
    all_users = fetch_auth_users()
    ex = excluded_uids(all_users)
    users = [u for u in all_users if u['localId'] not in ex]
    members = [m for m in fetch_members() if m['uid'] not in ex]
    charts = {k: c for k, c in fetch_charts().items() if c['uid'] not in ex}
    for m in members:
        if m['chart'] in charts:
            charts[m['chart']]['count'] += 1
    user_docs = fetch_user_docs()
    print(summary(day, users, user_docs, members, charts, now))
    if detail:
        print(report(day, users, user_docs, members, charts, now))

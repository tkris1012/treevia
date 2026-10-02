#!/usr/bin/env python3
"""組織図ごとのメンバー数を集計する（読み取り専用）。

無料プランは組織図1つあたり100人まで。人数の分布と、無料プランで上限に
近づいている組織図（直近30日の増え方から到達見込みも出す）を確認する。

使い方（Cloud Shell）:
    TOKEN=$(gcloud auth print-access-token) python3 scripts/chart_stats.py
"""
import datetime as dt
import statistics

from user_stats import DOCS, TOKEN, fetch_auth_users, fetch_plans, req

FREE_LIMIT = 100
WATCH_FROM = 50
BUCKETS = [(1, 9), (10, 29), (30, 49), (50, 79), (80, 99), (100, None)]


def run_collection_group(collection_id, fields):
    return req(f'{DOCS}:runQuery', {'structuredQuery': {
        'from': [{'collectionId': collection_id, 'allDescendants': True}],
        'select': {'fields': [{'fieldPath': f} for f in fields]},
    }})


def chart_path(name):
    # projects/.../documents/users/{uid}/charts/{chartId}[/members/{id}]
    rel = name.split('/documents/', 1)[1].split('/')
    if len(rel) < 4 or rel[0] != 'users' or rel[2] != 'charts':
        return None, None
    return rel[1], f'{rel[1]}/{rel[3]}'


def parse_ts(v):
    return dt.datetime.fromisoformat(v.replace('Z', '+00:00')).timestamp() if v else None


def fetch_charts():
    charts = {}
    for row in run_collection_group('charts', ['isSample']):
        doc = row.get('document')
        if not doc:
            continue
        uid, key = chart_path(doc['name'])
        if key and not doc.get('fields', {}).get('isSample', {}).get('booleanValue'):
            charts[key] = {'uid': uid, 'count': 0, 'recent': 0}
    return charts


def count_members(charts, now):
    for row in run_collection_group('members', ['createdAt']):
        doc = row.get('document')
        if not doc:
            continue
        _, key = chart_path(doc['name'])  # 旧スキーマ users/{uid}/members は None になり除外
        if key not in charts:
            continue
        charts[key]['count'] += 1
        created = parse_ts(doc.get('fields', {}).get('createdAt', {}).get('timestampValue'))
        if created and now - created <= 30 * 86400:
            charts[key]['recent'] += 1


def mask(email):
    if not email or '@' not in email:
        return '(メール不明)'
    local, domain = email.split('@', 1)
    return f'{local[:2]}***@{domain}'


def eta(count, recent):
    if count >= FREE_LIMIT:
        return '上限に到達済み'
    if recent <= 0:
        return 'ここ30日は増えていない'
    days = (FREE_LIMIT - count) / (recent / 30)
    if days <= 31:
        return f'このペースだと約{max(1, round(days))}日で100人'
    if days <= 365:
        return f'このペースだと約{round(days / 30)}ヶ月で100人'
    return 'このペースだと1年以上先'


def report(charts, plans, emails):
    out = []
    counts = [c['count'] for c in charts.values()]
    if not counts:
        return '組織図がありません'
    out.append(f'■ 組織図（サンプル除く）: {len(counts)}個 / メンバー合計 {sum(counts)}人')
    out.append(f'   1組織図あたり  平均 {statistics.mean(counts):.1f}人 / '
               f'中央値 {statistics.median(counts):g}人 / 最大 {max(counts)}人')

    out.append('■ 人数の分布')
    for lo, hi in BUCKETS:
        n = sum(1 for c in counts if c >= lo and (hi is None or c <= hi))
        label = f'{lo}〜{hi}人' if hi else f'{lo}人以上'
        out.append(f'   {label:<8}: {n:>3}個 ' + '█' * n)
    empty = sum(1 for c in counts if c == 0)
    if empty:
        out.append(f'   （メンバー0人の組織図: {empty}個）')

    out.append('■ プラン別の平均人数（組織図あたり）')
    for plan, label in (('free', '無料'), ('light', 'ライト'), ('pro', 'プロ')):
        xs = [c['count'] for c in charts.values() if plans.get(c['uid'], 'free') == plan]
        if xs:
            out.append(f'   {label}: {statistics.mean(xs):.1f}人（{len(xs)}個）')

    near = sorted(
        (c for c in charts.values() if plans.get(c['uid'], 'free') == 'free' and c['count'] >= WATCH_FROM),
        key=lambda c: -c['count'],
    )
    out.append(f'■ 無料プランで{WATCH_FROM}人以上の組織図: {len(near)}個')
    for c in near:
        out.append(f'   {mask(emails.get(c["uid"])):<24} {c["count"]:>3}人'
                   f'（直近30日 +{c["recent"]}人）→ {eta(c["count"], c["recent"])}')
    return '\n'.join(out)


if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('TOKEN を環境変数で渡してください（docstring 参照）')
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    charts = fetch_charts()
    count_members(charts, now)
    emails = {u['localId']: u.get('email') for u in fetch_auth_users()}
    print(report(charts, fetch_plans(), emails))

#!/usr/bin/env python3
"""ユーザー数の集計（読み取り専用）。

総ユーザー数は Firestore の users コレクションでは数えられない（決済した人の
ドキュメントしか無い）ため、Firebase Authentication のアカウントを数える。

使い方（Cloud Shell）:
    TOKEN=$(gcloud auth print-access-token) python3 scripts/user_stats.py

TOKEN が無い場合は、環境変数 TREEVIA_GCP_SA_B64（読み取り専用サービスアカウントの
鍵JSONを base64 にしたもの）から認証する（要 pip install google-auth requests）。

運営者自身などを集計から外すときは、環境変数 TREEVIA_EXCLUDE にメールアドレスか
uid をカンマ（または空白）区切りで渡す。例: TREEVIA_EXCLUDE=me@example.com

出力: 総ユーザー数 / 直近7日・30日の新規登録と利用 / 組織図を作った人 /
      有料プランの人数 / 月別の新規登録
"""
import base64
import datetime as dt
import json
import os
import urllib.parse
import urllib.request


def resolve_token():
    if os.environ.get('TOKEN'):
        return os.environ['TOKEN']
    key_b64 = os.environ.get('TREEVIA_GCP_SA_B64')
    if not key_b64:
        return ''
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError:
        raise SystemExit('google-auth が必要です: pip install google-auth requests')
    info = json.loads(base64.b64decode(key_b64))
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=['https://www.googleapis.com/auth/cloud-platform'])
    creds.refresh(Request())
    return creds.token


TOKEN, P = resolve_token(), 'mlm-org-chart'
DOCS = f'https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents'


def req(url, body=None):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                               method='POST' if body else 'GET')
    r.add_header('Authorization', 'Bearer ' + TOKEN)
    r.add_header('x-goog-user-project', P)
    r.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(r) as res:
        return json.load(res)


def fetch_auth_users():
    users, tok = [], None
    while True:
        q = {'maxResults': 1000, **({'nextPageToken': tok} if tok else {})}
        d = req(f'https://identitytoolkit.googleapis.com/v1/projects/{P}/accounts:batchGet?' + urllib.parse.urlencode(q))
        users += d.get('users', [])
        tok = d.get('nextPageToken')
        if not tok:
            return users


def fetch_plans():
    plans, tok = {}, None
    while True:
        q = {'pageSize': 300, **({'pageToken': tok} if tok else {})}
        d = req(f'{DOCS}/users?' + urllib.parse.urlencode(q))
        for doc in d.get('documents', []):
            plans[doc['name'].rsplit('/', 1)[-1]] = doc.get('fields', {}).get('plan', {}).get('stringValue', 'free')
        tok = d.get('nextPageToken')
        if not tok:
            return plans


def fetch_chart_owners():
    # charts サブコレクションを横断して、組織図を1つ以上作った uid を集める（サンプルは除外）
    rows = req(f'{DOCS}:runQuery', {'structuredQuery': {
        'from': [{'collectionId': 'charts', 'allDescendants': True}],
        'select': {'fields': [{'fieldPath': 'isSample'}]},
    }})
    owners = {}
    for row in rows:
        doc = row.get('document')
        if not doc or doc.get('fields', {}).get('isSample', {}).get('booleanValue'):
            continue
        uid = doc['name'].split('/users/')[1].split('/')[0]
        owners[uid] = owners.get(uid, 0) + 1
    return owners


def excluded_uids(users):
    # TREEVIA_EXCLUDE のメールアドレス / uid に一致するユーザーの uid を返す
    keys = {k.lower() for k in os.environ.get('TREEVIA_EXCLUDE', '').replace(',', ' ').split()}
    return {u['localId'] for u in users if u['localId'].lower() in keys or (u.get('email') or '').lower() in keys}


def drop_excluded(users, plans, owners):
    ex = excluded_uids(users)
    return ([u for u in users if u['localId'] not in ex],
            {k: v for k, v in plans.items() if k not in ex},
            {k: v for k, v in owners.items() if k not in ex}, len(ex))


def ms(v):
    return int(v) / 1000 if v else None


def rfc(v):
    return dt.datetime.fromisoformat(v.replace('Z', '+00:00')).timestamp() if v else None


def report(users, plans, owners, now=None, excluded=0):
    now = now or dt.datetime.now(dt.timezone.utc).timestamp()
    day = 86400
    created = [ms(u.get('createdAt')) for u in users]
    # 自動ログインのままだと lastLoginAt は更新されないので、トークン更新時刻(lastRefreshAt)で利用を判定する
    used = [rfc(u.get('lastRefreshAt')) or ms(u.get('lastLoginAt')) for u in users]
    n = len(users)
    within = lambda xs, d: sum(1 for x in xs if x and now - x <= d * day)
    uids = {u['localId'] for u in users}
    made = sum(1 for uid in owners if uid in uids)
    paid = {k: v for k, v in plans.items() if v in ('light', 'pro')}

    out = []
    note = f'（TREEVIA_EXCLUDE で{excluded}人を除外）' if excluded else ''
    out.append(f'■ 総ユーザー数（Googleログイン済み）: {n}人{note}')
    out.append(f'   新規登録  直近7日: {within(created, 7)}人 / 直近30日: {within(created, 30)}人')
    out.append(f'   利用      直近7日: {within(used, 7)}人 / 直近30日: {within(used, 30)}人')
    pct = f'（{made / n * 100:.0f}%）' if n else ''
    out.append(f'■ 組織図を1つ以上作った人: {made}人{pct}')
    out.append(f'■ 有料プラン: ライト {sum(1 for v in paid.values() if v == "light")}人 / '
               f'プロ {sum(1 for v in paid.values() if v == "pro")}人')
    months = {}
    for c in created:
        if c:
            k = dt.datetime.fromtimestamp(c, dt.timezone(dt.timedelta(hours=9))).strftime('%Y-%m')
            months[k] = months.get(k, 0) + 1
    out.append('■ 月別の新規登録（JST）')
    for k in sorted(months)[-6:]:
        out.append(f'   {k}: {months[k]:>3}人 ' + '█' * months[k])
    return '\n'.join(out)


if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('TOKEN か TREEVIA_GCP_SA_B64 を環境変数で渡してください（user_stats.py の docstring 参照）')
    users, plans, owners, excluded = drop_excluded(fetch_auth_users(), fetch_plans(), fetch_chart_owners())
    print(report(users, plans, owners, excluded=excluded))

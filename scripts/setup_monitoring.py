#!/usr/bin/env python3
"""Cloud Functions の死活監視（稼働チェック＋メール通知）を作成する。

2026-09 に GCP 無料トライアル終了で Cloud Functions が約4日間停止し、その間の
決済がプランに反映されなかった。既存ユーザーの更新課金は Webhook を通らないため
アプリも収益も正常に見えてしまい、誰も気づけなかった。その再発防止。

GET に対して関数は 405 を返すので、それを「正常」とみなして監視する。

使い方（Cloud Shell）:
    TOKEN=$(gcloud auth print-access-token) \
    python3 scripts/setup_monitoring.py you@example.com

同じ表示名のものがあれば作成をスキップするので、何度実行してもよい。
"""
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT = os.environ.get('GCP_PROJECT', 'mlm-org-chart')
HOST = f'asia-northeast1-{PROJECT}.cloudfunctions.net'
BASE = f'https://monitoring.googleapis.com/v3/projects/{PROJECT}'

FUNCTIONS = [
    ('stripeWebhook', 'Stripe決済の反映。落ちると購入者にプランが付与されない'),
    ('createPortalSession', 'お客様の解約・カード変更。落ちると解約できない'),
]
CHANNEL_NAME = 'Treevia 運用通知'
POLICY_NAME = 'Treevia: Cloud Functions ダウン検知'


def api(token, method, path, body=None):
    req = urllib.request.Request(
        f'{BASE}/{path}',
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
    )
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def find_existing(token, path, key, display_name):
    got = api(token, 'GET', path)
    for item in got.get(key, []):
        if item.get('displayName') == display_name:
            return item
    return None


def ensure_channel(token, email):
    found = find_existing(token, 'notificationChannels', 'notificationChannels', CHANNEL_NAME)
    if found:
        print(f'  通知チャンネル: 既存を使用 ({found["name"]})')
        return found['name']
    created = api(token, 'POST', 'notificationChannels', {
        'type': 'email',
        'displayName': CHANNEL_NAME,
        'labels': {'email_address': email},
    })
    print(f'  通知チャンネル: 作成 ({email})')
    return created['name']


def ensure_uptime_check(token, fn_name):
    display = f'Treevia {fn_name} 稼働監視'
    found = find_existing(token, 'uptimeCheckConfigs', 'uptimeCheckConfigs', display)
    if found:
        print(f'  稼働チェック[{fn_name}]: 既存を使用')
        return found['name']
    created = api(token, 'POST', 'uptimeCheckConfigs', {
        'displayName': display,
        'monitoredResource': {
            'type': 'uptime_url',
            'labels': {'project_id': PROJECT, 'host': HOST},
        },
        'httpCheck': {
            'requestMethod': 'GET',
            'path': f'/{fn_name}',
            'port': 443,
            'useSsl': True,
            'validateSsl': True,
            # 関数は GET に 405 を返すのが正常。2xx ではない点に注意
            'acceptedResponseStatusCodes': [{'statusValue': 405}],
        },
        'period': '300s',
        'timeout': '10s',
    })
    print(f'  稼働チェック[{fn_name}]: 作成')
    return created['name']


def ensure_alert_policy(token, channel, check_names):
    found = find_existing(token, 'alertPolicies', 'alertPolicies', POLICY_NAME)
    if found:
        print(f'  アラートポリシー: 既存あり（更新しません）')
        return found['name']

    conditions = []
    for (fn_name, why), check in zip(FUNCTIONS, check_names):
        check_id = check.rsplit('/', 1)[-1]
        conditions.append({
            'displayName': f'{fn_name} が応答しない',
            'conditionThreshold': {
                'filter': (
                    'metric.type="monitoring.googleapis.com/uptime_check/check_passed" '
                    'AND resource.type="uptime_url" '
                    f'AND metric.label.check_id="{check_id}"'
                ),
                'aggregations': [{
                    'alignmentPeriod': '300s',
                    'perSeriesAligner': 'ALIGN_NEXT_OLDER',
                    'crossSeriesReducer': 'REDUCE_COUNT_FALSE',
                    'groupByFields': ['resource.label.host'],
                }],
                'comparison': 'COMPARISON_GT',
                'thresholdValue': 1,
                'duration': '600s',
                'trigger': {'count': 1},
            },
        })

    created = api(token, 'POST', 'alertPolicies', {
        'displayName': POLICY_NAME,
        'combiner': 'OR',
        'conditions': conditions,
        'notificationChannels': [channel],
        'enabled': True,
        'documentation': {
            'content': (
                '## Cloud Functions が応答していません\n\n'
                + '\n'.join(f'- `{n}`: {w}' for n, w in FUNCTIONS)
                + '\n\n### 確認手順\n'
                '1. `curl -i https://' + HOST + '/stripeWebhook` → 405 以外なら異常\n'
                '2. 請求が有効か: `gcloud billing projects describe ' + PROJECT + '`\n'
                '3. 復旧後、取りこぼした決済がないか `python3 scripts/reconcile.py` で照合\n'
                '4. Stripe の Webhook 画面から失敗イベントを再送\n'
            ),
            'mimeType': 'text/markdown',
        },
    })
    print('  アラートポリシー: 作成')
    return created['name']


def main():
    token = os.environ.get('TOKEN')
    if not token or len(sys.argv) < 2:
        print('使い方: TOKEN=$(gcloud auth print-access-token) '
              'python3 scripts/setup_monitoring.py you@example.com')
        return 2
    email = sys.argv[1]

    print(f'プロジェクト: {PROJECT}')
    print(f'監視対象ホスト: {HOST}\n')
    channel = ensure_channel(token, email)
    checks = [ensure_uptime_check(token, fn) for fn, _ in FUNCTIONS]
    ensure_alert_policy(token, channel, checks)

    print('\n完了。5分間隔でチェックし、10分以上失敗が続くとメールが飛びます。')
    print(f'{email} 宛に届く確認メールのリンクを踏むまで通知は有効になりません。')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print(f'APIエラー: HTTP {e.code}\n{e.read().decode()[:600]}')
        print('\nMonitoring API が未有効の場合は次を実行:')
        print(f'  gcloud services enable monitoring.googleapis.com --project={PROJECT}')
        sys.exit(2)

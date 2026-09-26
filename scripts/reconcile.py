#!/usr/bin/env python3
"""Stripe の有効サブスクと Firestore の users/{uid}.plan を突き合わせる（読み取り専用）。

Webhook が落ちていた期間の決済は Firestore に反映されない。アプリも収益も
正常に見えてしまい気づけないため、定期的にこれで照合する。

使い方（Cloud Shell）:
    SK=$(gcloud secrets versions access latest --secret=STRIPE_SECRET_KEY --project=mlm-org-chart) \
    TOKEN=$(gcloud auth print-access-token) \
    python3 scripts/reconcile.py

終了コード: 0=全件一致 / 1=要対応あり / 2=実行エラー
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = os.environ.get('GCP_PROJECT', 'mlm-org-chart')
PLAN_BY_PRICE = {
    os.environ.get('STRIPE_PRICE_LIGHT', 'price_1TmORgQK593ARBKT1Sl8k6U6'): 'light',
    os.environ.get('STRIPE_PRICE_PRO', 'price_1TllsyQK593ARBKT9fSPykQQ'): 'pro',
}


def stripe_get(sk, path, params):
    url = f'https://api.stripe.com/v1/{path}?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url)
    req.add_header('Authorization', 'Basic ' + base64.b64encode((sk + ':').encode()).decode())
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def firestore_user(token, uid):
    url = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}'
           f'/databases/(default)/documents/users/{urllib.parse.quote(uid)}')
    req = urllib.request.Request(url)
    req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {'__http': e.code, '__body': e.read().decode()[:200]}


def main():
    sk, token = os.environ.get('SK'), os.environ.get('TOKEN')
    if not sk or not token:
        print('SK と TOKEN を環境変数で渡してください（docstring 参照）')
        return 2

    # サブスク自体は client_reference_id を持たないので、Checkout セッションから引く
    sessions = stripe_get(sk, 'checkout/sessions', {'limit': 100})
    sub_to_uid, sub_to_email = {}, {}
    for s in sessions['data']:
        if s.get('subscription') and s.get('client_reference_id'):
            sub_to_uid[s['subscription']] = s['client_reference_id']
            sub_to_email[s['subscription']] = (s.get('customer_details') or {}).get('email')

    subs = stripe_get(sk, 'subscriptions',
                      {'status': 'active', 'limit': 100, 'expand[]': 'data.customer'})
    print(f'Stripe の有効サブスク: {len(subs["data"])}件\n')

    matched, issues = 0, []
    for s in subs['data']:
        customer = s.get('customer') or {}
        if isinstance(customer, str):
            customer = {'id': customer}
        email = sub_to_email.get(s['id']) or customer.get('email')
        uid = sub_to_uid.get(s['id'])
        expected = PLAN_BY_PRICE.get(s['items']['data'][0]['price']['id'], '(未知のprice)')

        print(f'■ {email}')
        print(f'   sub={s["id"]} / 期待プラン={expected}')

        if not uid:
            print('   ⚠️ Checkout セッションに client_reference_id が無い\n')
            issues.append((email, s['id'], customer.get('id'), None, 'uid不明'))
            continue
        print(f'   uid={uid}')

        doc = firestore_user(token, uid)
        if '__http' in doc:
            if doc['__http'] == 404:
                print('   ❌ Firestore に存在しない\n')
                issues.append((email, s['id'], customer.get('id'), uid, '未作成'))
            else:
                print(f'   !! HTTP {doc["__http"]}: {doc["__body"]}\n')
                issues.append((email, s['id'], customer.get('id'), uid, f'HTTP {doc["__http"]}'))
            continue

        fields = doc.get('fields', {})
        plan = fields.get('plan', {}).get('stringValue', '(未設定)')
        saved_sub = fields.get('stripeSubscriptionId', {}).get('stringValue', '(未設定)')
        if plan != expected:
            print(f'   ❌ plan={plan}（期待: {expected}）\n')
            issues.append((email, s['id'], customer.get('id'), uid, f'plan={plan}'))
            continue

        # サブスクIDがずれていると、解約時に handleSubscriptionEnded が対象を引けない
        if saved_sub != s['id']:
            print(f'   ⚠️ plan={plan} だが stripeSubscriptionId がずれている: DB={saved_sub}\n')
            issues.append((email, s['id'], customer.get('id'), uid, 'subIDずれ'))
            continue

        print(f'   ✅ plan={plan}\n')
        matched += 1

    print('=' * 60)
    print(f'一致: {matched}件 / 要対応: {len(issues)}件')
    for email, sub, cus, uid, reason in issues:
        print(f'\n  - {email}  [{reason}]')
        print(f'      uid={uid}')
        print(f'      sub={sub}')
        print(f'      cus={cus}')
    if issues:
        print('\n復旧方法は BILLING_SETUP.md の「取りこぼした決済の救済」を参照。')
    return 1 if issues else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print(f'APIエラー: HTTP {e.code} {e.read().decode()[:300]}')
        sys.exit(2)

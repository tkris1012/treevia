# 決済セットアップ手順（Stripe Payment Link + Cloud Functions Webhook）

無料 / ライト(¥480) / プロ(¥980) のプラン課金を、Stripe の Payment Link と
Firebase Cloud Functions の Webhook で実現する。支払いが完了すると Webhook が
Firestore の `users/{uid}.plan` を書き換え、アプリ側は `onSnapshot` で即反映する。

## 全体の流れ

```
ユーザー → UpgradeModal の「アップグレード」ボタン
        → Stripe Payment Link (?client_reference_id=<uid> 付き)
        → 決済完了
        → Stripe が Webhook (Cloud Functions) に通知
        → Webhook が署名検証 → users/{uid}.plan を更新
        → アプリが onSnapshot で検知してプラン反映
```

## ステップ 1: Stripe アカウント作成（テストモード）

1. https://dashboard.stripe.com/register で登録
2. 国は「日本」、まずは **テストモード** のまま進める
3. 本人確認・銀行口座登録は本番化のときでよい

## ステップ 2: 商品と料金を作成

Stripe ダッシュボード（テストモード）→「商品」→「商品を追加」

- **ライトプラン**: 料金 ¥480 / 月（継続）→ 作成後の `price_...` を控える
- **プロプラン**: 料金 ¥980 / 月（継続）→ 作成後の `price_...` を控える

## ステップ 3: Payment Link を作成

「Payment Links」→「新規作成」を 2 つ（ライト用・プロ用）

- それぞれ対応する商品/料金を選択
- 「支払い後」のリダイレクト先をアプリの URL に設定（任意）
- 作成された URL（`https://buy.stripe.com/test_...`）を控える

控えた 2 つの URL を `src/constants/billing.js` の `PAYMENT_LINKS` に貼る:

```js
export const PAYMENT_LINKS = {
  light: 'https://buy.stripe.com/test_xxxxxxxx',
  pro:   'https://buy.stripe.com/test_yyyyyyyy',
}
```

## ステップ 4: Firebase を Blaze プランにする + 予算アラート

1. Firebase コンソール → 対象プロジェクト → 「アップグレード」で Blaze に変更
2. **必須: 予算アラート設定**（大量課金対策）
   - Google Cloud Console → 「お支払い」→「予算とアラート」→「予算を作成」
   - 予算額（例: ¥1,000）、しきい値 50% / 90% / 100% でメール通知
   - これで万一リクエストが急増しても即気づける
3. Webhook 関数側にも `maxInstances: 3` を設定済み（同時実行数の頭打ち）

## ステップ 5: 環境変数とシークレットを登録

```bash
# price ID（機密ではない）を functions/.env に
cp functions/.env.example functions/.env
# → STRIPE_PRICE_LIGHT, STRIPE_PRICE_PRO を実際の値に

# シークレットキー類を登録
firebase functions:secrets:set STRIPE_SECRET_KEY      # sk_test_...
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  # ステップ7で取得する whsec_...
```

## ステップ 6: Cloud Functions をデプロイ

```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

デプロイ後に表示される関数 URL を控える（例:
`https://asia-northeast1-<project>.cloudfunctions.net/stripeWebhook`）。

> 注: `STRIPE_WEBHOOK_SECRET` はステップ 7 で取得するため、初回は仮値でデプロイ →
> 取得後に `secrets:set` で更新して再デプロイ、の順でもよい。

## ステップ 7: Stripe に Webhook を登録

Stripe ダッシュボード →「開発者」→「Webhook」→「エンドポイントを追加」

- エンドポイント URL: ステップ 6 の関数 URL
- リッスンするイベント:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
- 作成後に表示される「署名シークレット」(`whsec_...`) を控え、
  `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` で登録 → 再デプロイ

## ステップ 8: テスト決済

1. アプリでアップグレードボタンを押す
2. Stripe のテストカード `4242 4242 4242 4242`（有効期限は未来、CVC 任意）で決済
3. Firestore の `users/{uid}.plan` が `light` / `pro` に変わることを確認
4. アプリのプラン制限が解除されることを確認

## ステップ 9: 本番化

1. Stripe で本人確認・銀行口座登録を済ませ、本番モードへ
2. 本番モードで商品 / Payment Link / Webhook を作り直す（テストとは別物）
3. `PAYMENT_LINKS` を本番 URL に、シークレットを本番キーに差し替えて再デプロイ・再ビルド

## セキュリティ / 課金面のポイント

- **署名検証**: Stripe 以外からの偽リクエストは `constructEvent` で拒否
- **maxInstances: 3**: 大量リクエストでも同時実行を制限し課金の暴走を防ぐ
- **予算アラート**: 異常があればメールで即通知
- **Firestore ルール**: `users/{uid}` の書き込みはクライアント禁止（Webhook=Admin SDK のみ）

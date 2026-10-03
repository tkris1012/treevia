# 決済セットアップ手順（Stripe Payment Link + Cloud Functions Webhook）

無料 / ライト(¥380) / プロ(¥980) のプラン課金を、Stripe の Payment Link と
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

- **ライトプラン**: 料金 ¥380 / 月（継続）→ 作成後の `price_...` を控える
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

> ⚠️ **`firebase deploy --only functions` は使わないこと。**
> ローカルの `functions/.env`（gitignore 対象・端末ごとにバラバラになりがち）を
> 読み込むため、古い値のまま再デプロイして本番の price ID が巻き戻る事故が
> 過去に実際に発生した（購入者のプランが反映されない、という実害が出た）。
>
> 本番デプロイは必ず **`functions/deploy.sh`** を使う。price ID・シークレット・
> ランタイムがスクリプトに固定されているため、手動コピペによる事故が起きない。
>
> GitHub Actions による関数の自動デプロイ（旧 `deploy-functions.yml`）は廃止した。
> 過去に事故を起こした古い price ID がハードコードされたまま、`functions/` を変更して
> push するたびに本番を上書きしていたため。関数のデプロイは `deploy.sh` だけで行う。

```bash
cd functions && npm install && cd ..
bash functions/deploy.sh
```

デプロイ後に表示される関数 URL を控える（例:
`https://asia-northeast1-<project>.cloudfunctions.net/stripeWebhook`）。
スクリプトの最後に現在の環境変数が表示されるので、price ID が正しいか必ず目視確認する。

> 注: `STRIPE_WEBHOOK_SECRET` はステップ 7 で取得するため、初回は仮値でデプロイ →
> 取得後に `secrets:set` で更新して再度 `bash functions/deploy.sh`、の順でもよい。

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
3. `PAYMENT_LINKS` を本番 URL に、シークレットを本番キーに差し替えて再ビルド
4. **`functions/deploy.sh` の `STRIPE_PRICE_LIGHT` / `STRIPE_PRICE_PRO` を本番 price ID に更新**してから
   `bash functions/deploy.sh` を実行（手動コマンドは使わない）

## 運用: 死活監視

Webhook が停止しても、**既存ユーザーの更新課金は Webhook を通らない**ため
売上は普通に立ち続け、アプリも正常に見える。壊れているのは「新規決済のプラン付与」
だけなので、監視を入れておかないと気づけない（2026-09 に約4日間気づけなかった）。

```bash
gcloud services enable monitoring.googleapis.com --project=mlm-org-chart

TOKEN=$(gcloud auth print-access-token) \
python3 scripts/setup_monitoring.py you@example.com
```

作られるものは2つ。何度実行しても既存分は作り直さない。

1. **稼働監視** — `stripeWebhook` と `createPortalSession` に3リージョンから
   10分間隔で GET し、**405 以外**が続くと約20分でメール通知

   実行回数は「間隔 × リージョン数 × チェック数」で決まる（約26,000回/月。
   無料枠100万回に対して数%）。調整する場合は `CHECK_PERIOD` /
   `CHECK_REGIONS` を変える。リージョンは API の制約で**最低3つ**必要。

   > ⚠️ 稼働チェックを削除して作り直すと `check_id` が変わり、アラートポリシーが
   > 古い ID を参照したまま**無言で機能しなくなる**。スクリプトは既存を
   > その場で更新するので、設定変更時も作り直さずに再実行すること。
2. **ログアラート** — 関数は 200 を返しているのに購入者にプランが付かなかった
   ケースを検知する。以下のログが出た時点で通知される

   | ログ | 状態 |
   |---|---|
   | `未知の price` | price ID が設定と不一致。プランが付与されていない |
   | `client_reference_id の無いセッション` | uid 無しで決済され、購入者を特定できていない |
   | `該当ユーザーが見つからないサブスク` | 解約を検知したが対象を引けず、有料のまま残っている |

> ⚠️ ログアラートは `functions/index.js` の**ログ文言と完全に連動**している。
> メッセージを変更する場合は `scripts/setup_monitoring.py` の
> `SILENT_FAILURE_LOGS` も必ず更新すること（無言で検知漏れになる）。

> 初回のみ、指定アドレスに届く Google Cloud の確認メールのリンクを踏むこと。
> 踏むまで通知は有効にならない。

あわせて **Stripe 側の Webhook 失敗通知**も有効にしておく
（Stripe → 開発者 → Webhook → エンドポイント → 通知設定）。
Stripe の自動リトライは約3日で尽きるため、それまでに気づく必要がある。

## 運用: Stripe と Firestore の定期照合

Stripe の有効サブスクと Firestore の `users/{uid}.plan` がずれていないか照合する。
月1回程度、または障害復旧後に実行する。**読み取り専用**。

```bash
SK=$(gcloud secrets versions access latest --secret=STRIPE_SECRET_KEY --project=mlm-org-chart) \
TOKEN=$(gcloud auth print-access-token) \
python3 scripts/reconcile.py
```

検出できるずれ:

| 表示 | 意味 |
|---|---|
| `未作成` | 課金されているのに Firestore にユーザーが無い（Webhook 取りこぼし） |
| `plan=free` | 課金されているのにプランが付いていない |
| `subIDずれ` | 解約時に `handleSubscriptionEnded` が対象を引けない状態 |
| `uid不明` | `client_reference_id` 無しで決済された（決済リンクの直接共有など） |

終了コードは 0=全件一致 / 1=要対応あり。

## 取りこぼした決済の救済

照合で要対応が出た場合、**まず Stripe からの再送を試す**。Webhook が正規ルートで
処理するので、`stripeSubscriptionId` まで正しく入る。

1. 関数が生きているか確認（`405` が返ること）
   ```bash
   curl -i https://asia-northeast1-mlm-org-chart.cloudfunctions.net/stripeWebhook
   ```
2. Stripe → 開発者 → Webhook → エンドポイント
   - 失敗が続くと**自動で無効化**されることがある。無効なら再有効化
   - 「最近の配信」から失敗した `checkout.session.completed` を**再送**
3. 反映を確認
   ```bash
   gcloud functions logs read stripeWebhook \
     --region=asia-northeast1 --gen2 --project=mlm-org-chart --limit=30
   ```
   `プラン更新: <uid> → light` が出れば成功

再送しても解決しない場合のみ、Firestore の `users/{uid}` を手動で更新する
（`plan` / `stripeCustomerId` / `stripeSubscriptionId` の3つ。`stripeSubscriptionId`
を入れ忘れると解約時に無料へ戻らなくなる）。必要な値は `reconcile.py` の出力に出る。

## トラブルシュート: Cloud Functions が 500 / 429 を返す

| 症状 | 原因と対処 |
|---|---|
| Google Frontend の **500**（HTMLのエラーページ） | リクエストが関数に届いていない。`gcloud billing projects describe mlm-org-chart` で `billingEnabled` を確認。無料トライアル終了で停止しているケースがある |
| **429** `Rate exceeded.` | Cloud Run がインスタンスを起動できていない。請求を有効化した直後は反映に**30分〜1時間**かかることがあるので、まず時間を置く。ログに `no available instance` が出る |
| **405** が返る | **正常**。関数は GET を受け付けない設計（`index.js` 冒頭） |

請求停止から復旧したときは、`deploy.sh` での再デプロイが必要になることがある。
復旧後は必ず `scripts/reconcile.py` で取りこぼしを確認すること。

## セキュリティ / 課金面のポイント

- **署名検証**: Stripe 以外からの偽リクエストは `constructEvent` で拒否
- **maxInstances: 3**: 大量リクエストでも同時実行を制限し課金の暴走を防ぐ
- **予算アラート**: 異常があればメールで即通知
- **Firestore ルール**: `users/{uid}` の書き込みはクライアント禁止（Webhook=Admin SDK のみ）

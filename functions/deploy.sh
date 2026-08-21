#!/usr/bin/env bash
# === 本番デプロイ台本（唯一の正・これ以外のコマンドを打たないこと） =========
#
# 過去に「チャットの古いコマンド例」や「ローカルの古い functions/.env」を
# 使って再デプロイした結果、本番の price ID がテスト用の仮値に巻き戻り、
# 実際の購入者がプラン反映されない事故が起きた。
# 再発防止のため、正しい値をこのスクリプトに固定し、
# 「bash functions/deploy.sh」以外でデプロイしないことを徹底する。
#
# 使い方: リポジトリルートで `bash functions/deploy.sh`
set -euo pipefail

PROJECT=mlm-org-chart
REGION=asia-northeast1
RUNTIME=nodejs22

# 本番 price ID（Stripeダッシュボード「本番モード」の商品と一致していること）
STRIPE_PRICE_LIGHT=price_1TmORgQK593ARBKT1Sl8k6U6
STRIPE_PRICE_PRO=price_1TllsyQK593ARBKT9fSPykQQ

echo "=== stripeWebhook をデプロイ ==="
gcloud functions deploy stripeWebhook \
  --region="$REGION" --gen2 --project="$PROJECT" \
  --runtime="$RUNTIME" --source=functions --entry-point=stripeWebhook \
  --trigger-http --allow-unauthenticated --max-instances=3 \
  --set-env-vars="STRIPE_PRICE_LIGHT=${STRIPE_PRICE_LIGHT},STRIPE_PRICE_PRO=${STRIPE_PRICE_PRO}" \
  --set-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest

echo "=== createPortalSession をデプロイ ==="
gcloud functions deploy createPortalSession \
  --region="$REGION" --gen2 --project="$PROJECT" \
  --runtime="$RUNTIME" --source=functions --entry-point=createPortalSession \
  --trigger-http --allow-unauthenticated --max-instances=3 \
  --set-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest

echo "=== デプロイ後の設定確認（price IDが正しいか目視で確認） ==="
gcloud functions describe stripeWebhook \
  --region="$REGION" --gen2 --project="$PROJECT" \
  --format="yaml(serviceConfig.environmentVariables)"

echo ""
echo "✅ デプロイ完了。上の STRIPE_PRICE_LIGHT / STRIPE_PRICE_PRO が"
echo "   ${STRIPE_PRICE_LIGHT} / ${STRIPE_PRICE_PRO} と一致しているか確認してください。"

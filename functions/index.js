// === Stripe 決済 Webhook ======================================
// Stripe の Payment Link で支払いが完了すると、このエンドポイントに
// 通知が届く。署名を検証したうえで Firestore の users/{uid}.plan を
// 書き換える。クライアントは onSnapshot で即座にプランが反映される。
//
// 大量課金対策:
//   - maxInstances: 3       … 攻撃で大量リクエストが来ても同時実行を頭打ちにする
//   - 署名検証 (constructEvent) … Stripe 以外からの偽リクエストを即拒否
//   - POST 以外は 405 で早期リターン
//
// 必要な設定:
//   シークレット (firebase functions:secrets:set で登録):
//     STRIPE_SECRET_KEY      … Stripe のシークレットキー (sk_test_... / sk_live_...)
//     STRIPE_WEBHOOK_SECRET  … Webhook 署名シークレット (whsec_...)
//   環境変数 (functions/.env):
//     STRIPE_PRICE_LIGHT     … ライトプランの price ID (price_...)
//     STRIPE_PRICE_PRO       … プロプランの price ID (price_...)

const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const logger = require('firebase-functions/logger')
const admin = require('firebase-admin')
const Stripe = require('stripe')

admin.initializeApp()
const db = admin.firestore()

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')

// 購入された price ID からプラン名を判定する。
// price ID は機密ではないので .env (process.env) から読む。
function planForPrice(priceId) {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_LIGHT) return 'light'
  return null
}

exports.stripeWebhook = onRequest(
  {
    region: 'asia-northeast1',
    maxInstances: 3, // 大量課金防止: 同時実行数を制限
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    cors: false,
  },
  async (req, res) => {
    // POST 以外は処理せず即拒否 (無駄な起動・課金を避ける)
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value())
    const sig = req.headers['stripe-signature']

    // 署名検証: Stripe 以外からの偽リクエストはここで弾く
    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value(),
      )
    } catch (err) {
      logger.warn('Webhook 署名検証に失敗', err.message)
      res.status(400).send(`Webhook Error: ${err.message}`)
      return
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(stripe, event.data.object)
          break
        case 'customer.subscription.deleted':
          await handleSubscriptionEnded(event.data.object)
          break
        default:
          // 関心の無いイベントは無視 (200 を返して再送を止める)
          break
      }
      res.status(200).json({ received: true })
    } catch (err) {
      logger.error('Webhook 処理中にエラー', err)
      res.status(500).send('Internal error')
    }
  },
)

// 支払い完了 → プランを付与
async function handleCheckoutCompleted(stripe, session) {
  const uid = session.client_reference_id
  if (!uid) {
    logger.warn('client_reference_id の無いセッション', session.id)
    return
  }

  // 購入された price からプランを判定
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 1,
  })
  const priceId = lineItems.data[0]?.price?.id
  const plan = planForPrice(priceId)
  if (!plan) {
    logger.warn('未知の price のため無視', priceId)
    return
  }

  await db.collection('users').doc(uid).set(
    {
      plan,
      stripeCustomerId: session.customer || null,
      stripeSubscriptionId: session.subscription || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  logger.info(`プラン更新: ${uid} → ${plan}`)
}

// サブスク終了 (解約・支払い失敗による失効) → 無料に戻す
async function handleSubscriptionEnded(subscription) {
  const snap = await db
    .collection('users')
    .where('stripeSubscriptionId', '==', subscription.id)
    .limit(1)
    .get()
  if (snap.empty) {
    logger.warn('該当ユーザーが見つからないサブスク', subscription.id)
    return
  }
  await snap.docs[0].ref.set(
    { plan: 'free', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  )
  logger.info(`プラン解約: ${snap.docs[0].id} → free`)
}

// === Stripe 決済 Webhook (Cloud Functions gen2 / Functions Framework) =====
// Stripe の Payment Link で支払いが完了すると、このエンドポイントに通知が届く。
// 署名を検証したうえで Firestore の users/{uid}.plan を書き換える。
// クライアントは onSnapshot で即座にプランが反映される。
//
// 大量課金対策:
//   - --max-instances=3      … デプロイ時に指定（攻撃で大量リクエストが来ても頭打ち）
//   - 署名検証 (constructEvent) … Stripe 以外からの偽リクエストを即拒否
//   - POST 以外は 405 で早期リターン
//
// 環境変数 (デプロイ時に注入):
//   STRIPE_SECRET_KEY      … Secret Manager から (--set-secrets)
//   STRIPE_WEBHOOK_SECRET  … Secret Manager から (--set-secrets)
//   STRIPE_PRICE_LIGHT     … 通常の環境変数から (--set-env-vars)
//   STRIPE_PRICE_PRO       … 通常の環境変数から (--set-env-vars)

const functions = require('@google-cloud/functions-framework')
const admin = require('firebase-admin')
const Stripe = require('stripe')

admin.initializeApp()
const db = admin.firestore()

// 過去に事故を起こした「テンプレの仮値」。誤って本番デプロイに紛れ込んでいたら
// 起動時に必ず気づけるよう明示的にブロックリスト化する。
const KNOWN_STALE_PRICE_IDS = new Set([
  'price_1TlLpN3PcHAXuuwfmxX3hsWD', // 旧 .env.example の仮ライト
  'price_1TlLq33PcHAXuuwfa52GYCKj', // 旧 .env.example の仮プロ
])

// 起動時（コールドスタート時）に設定を必ずログへ出す。price ID は機密ではないので
// そのまま出力してよい。デプロイ直後にログを見るだけで正誤を確認できる。
;(function checkPriceConfigOnStartup() {
  const light = process.env.STRIPE_PRICE_LIGHT
  const pro = process.env.STRIPE_PRICE_PRO
  console.log(`起動時設定: STRIPE_PRICE_LIGHT=${light} / STRIPE_PRICE_PRO=${pro}`)
  if (!light || !pro) {
    console.error('起動時エラー: STRIPE_PRICE_LIGHT/PRO が未設定です。functions/deploy.sh で正しくデプロイしてください。')
    return
  }
  if (KNOWN_STALE_PRICE_IDS.has(light) || KNOWN_STALE_PRICE_IDS.has(pro)) {
    console.error(
      '起動時エラー: 過去に事故を起こした古いテンプレの price ID が設定されています。' +
      '本番の購入が正しく処理されません。functions/deploy.sh で正しい値に再デプロイしてください。'
    )
  }
})()

// 購入された price ID からプラン名を判定する
function planForPrice(priceId) {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_LIGHT) return 'light'
  return null
}

functions.http('stripeWebhook', async (req, res) => {
  // POST 以外は処理せず即拒否
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = req.headers['stripe-signature']

  // 署名検証: Stripe 以外からの偽リクエストはここで弾く
  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.warn('Webhook 署名検証に失敗:', err.message)
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
        break // 関心の無いイベントは 200 を返して再送を止める
    }
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook 処理中にエラー:', err)
    res.status(500).send('Internal error')
  }
})

// 支払い完了 → プランを付与
async function handleCheckoutCompleted(stripe, session) {
  const uid = session.client_reference_id
  if (!uid) {
    console.warn('client_reference_id の無いセッション:', session.id)
    return
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 1,
  })
  const priceId = lineItems.data[0]?.price?.id
  const plan = planForPrice(priceId)
  if (!plan) {
    // これは「購入されたのにプランが有効化されない」実害に直結するため error 扱いにする
    // （warn だと見落としやすい。前回の事故はこれの見落としが一因）
    console.error(`未知の price のため無視（購入者が救済されていません！要対応）: uid=${uid} price=${priceId}`)
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
  console.log(`プラン更新: ${uid} → ${plan}`)
}

// サブスク終了 (解約・支払い失敗による失効) → 無料に戻す
async function handleSubscriptionEnded(subscription) {
  const snap = await db
    .collection('users')
    .where('stripeSubscriptionId', '==', subscription.id)
    .limit(1)
    .get()
  if (snap.empty) {
    console.warn('該当ユーザーが見つからないサブスク:', subscription.id)
    return
  }
  await snap.docs[0].ref.set(
    { plan: 'free', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  )
  console.log(`プラン解約: ${snap.docs[0].id} → free`)
}

// === 顧客ポータル（プラン管理・解約） ============================
// アプリにログイン中のユーザーが、自分の Stripe サブスクを管理/解約できる。
// Firebase ID トークンで本人確認し、保存済みの stripeCustomerId から
// Billing Portal セッションを発行して URL を返す。
// 解約自体は Stripe 側で行われ、最終的に customer.subscription.deleted が
// 上の Webhook に届いて plan が free に戻る。
functions.http('createPortalSession', async (req, res) => {
  // CORS（ブラウザから直接呼ぶため）
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  // Firebase ID トークンで本人確認
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) {
    console.warn('ポータル: 認証トークンなし')
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  let uid
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch (err) {
    console.warn('ポータル: トークン検証に失敗:', err.message)
    res.status(401).json({ error: 'invalid_token' })
    return
  }

  // 保存済みの Stripe 顧客 ID を取得（支払い時に Webhook が書き込む）
  const snap = await db.collection('users').doc(uid).get()
  const customerId = snap.exists ? snap.data().stripeCustomerId : null
  if (!customerId) {
    console.warn(`ポータル: stripeCustomerId なし（未決済アカウント） uid=${uid}`)
    res.status(404).json({ error: 'no_customer' })
    return
  }
  console.log(`ポータル発行: uid=${uid} customer=${customerId}`)

  // 戻り先 URL（アプリ）。リクエストで受け取り、無ければ既定値。
  const returnUrl =
    (req.body && typeof req.body.returnUrl === 'string' && req.body.returnUrl) ||
    'https://tkris1012.github.io/treevia/'

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('ポータルセッション発行に失敗:', err)
    res.status(500).json({ error: 'portal_failed' })
  }
})

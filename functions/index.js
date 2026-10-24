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
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const Stripe = require('stripe')

initializeApp()
const db = getFirestore()

// Stripe クライアント。STRIPE_TEST_API_HOST はローカル検証用の偽 Stripe サーバーを
// 指すためのもので、Cloud Run 上（K_SERVICE がある本番）では絶対に使わない。
function stripeClient() {
  const testHost = !process.env.K_SERVICE && process.env.STRIPE_TEST_API_HOST
  if (testHost) {
    const [host, port] = testHost.split(':')
    return new Stripe(process.env.STRIPE_SECRET_KEY, { host, port: Number(port), protocol: 'http' })
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

// ポータルからの戻り先として許可する URL（それ以外は既定値に置き換える）
const APP_URL = 'https://tkris1012.github.io/treevia/'
function safeReturnUrl(url) {
  return typeof url === 'string' && url.startsWith(APP_URL) ? url : APP_URL
}

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

  const stripe = stripeClient()
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
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object)
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
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  console.log(`プラン更新: ${uid} → ${plan}`)
}

// サブスクの内容が変わった（ポータルでのライト⇔プロの切り替えなど） → プランを合わせる
// 解約予約（cancel_at_period_end）などでも届くが、その場合は価格が同じなので何もしない。
// 支払いが止まった状態。Stripe の「再試行がすべて失敗した場合」の設定が
// 「未払いとしてマーク」でも、有料のまま使えてしまわないよう無料に戻す
// （あとで支払われて active に戻れば、下の処理でプランも元に戻る）
const ENDED_STATUSES = ['unpaid', 'canceled', 'incomplete_expired', 'paused']

async function handleSubscriptionUpdated(subscription) {
  if (ENDED_STATUSES.includes(subscription.status)) {
    console.log(`サブスク更新 status=${subscription.status} のため無料に戻す: sub=${subscription.id}`)
    await handleSubscriptionEnded(subscription)
    return
  }
  const priceId = subscription.items?.data?.[0]?.price?.id
  const plan = planForPrice(priceId)
  if (!plan) {
    console.error(`未知の price のサブスク更新（プランが正しく切り替わっていない可能性。要対応）: sub=${subscription.id} price=${priceId}`)
    return
  }
  if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
    console.log(`サブスク更新 status=${subscription.status} のためプランは変更しない: sub=${subscription.id}`)
    return
  }
  const snap = await db
    .collection('users')
    .where('stripeSubscriptionId', '==', subscription.id)
    .limit(1)
    .get()
  if (snap.empty) {
    // 新規購入の直後は checkout.session.completed より先に届くことがあるので、ここでは警告にしない
    console.log(`サブスク更新: 対象ユーザーなし（新規購入の直後など） sub=${subscription.id}`)
    return
  }
  const ref = snap.docs[0].ref
  if (snap.docs[0].data().plan === plan) return
  await ref.set({ plan, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  console.log(`プラン切り替え: ${ref.id} → ${plan}`)
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
  // 同じ状態の通知が何度来ても、すでに無料なら書き換えない（日次報告の「プラン変更」に何度も出ないように）
  if ((snap.docs[0].data().plan || 'free') === 'free') return
  await snap.docs[0].ref.set(
    { plan: 'free', updatedAt: FieldValue.serverTimestamp() },
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
    const decoded = await getAuth().verifyIdToken(idToken)
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

  // 戻り先 URL（アプリ）。リクエストで受け取るが、アプリ以外の URL は既定値に置き換える。
  const returnUrl = safeReturnUrl(req.body && req.body.returnUrl)

  try {
    const stripe = stripeClient()

    // ライト → プロの切り替え：新しく購入させず（二重課金になる）、今のサブスクの
    // 価格をプロに変える確認画面を開く。差額は Stripe が日割りで計算する。
    // 切り替え後は customer.subscription.updated が Webhook に届き、plan が pro になる。
    if (req.body && req.body.flow === 'upgrade_pro') {
      const subId = snap.data().stripeSubscriptionId
      if (!subId) {
        console.warn(`切り替え: stripeSubscriptionId なし uid=${uid}`)
        res.status(404).json({ error: 'no_subscription' })
        return
      }
      const sub = await stripe.subscriptions.retrieve(subId)
      const item = sub.items?.data?.[0]
      if (!item || sub.customer !== customerId) {
        console.error(`切り替え: サブスクの内容が保存済みの情報と一致しない uid=${uid} sub=${subId}`)
        res.status(409).json({ error: 'subscription_mismatch' })
        return
      }
      if (planForPrice(item.price?.id) === 'pro') {
        res.status(409).json({ error: 'already_pro' })
        return
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: subId,
            items: [{ id: item.id, price: process.env.STRIPE_PRICE_PRO, quantity: item.quantity || 1 }],
          },
          after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
        },
      })
      console.log(`切り替え画面を発行: uid=${uid} sub=${subId}`)
      res.status(200).json({ url: session.url })
      return
    }

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

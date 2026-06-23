// === Stripe Payment Link 設定 ================================
// Stripe ダッシュボードで作成した Payment Link の URL をここに貼る。
// (商品作成 → Payment Link 作成 後に書き換える)
//
//   テスト用: https://buy.stripe.com/test_xxxxxxxx
//   本番用:   https://buy.stripe.com/xxxxxxxx
//
// リンクを開くとき末尾に ?client_reference_id=<uid> を付けることで、
// Webhook 側で「どのユーザーの支払いか」を判別できる。
export const PAYMENT_LINKS = {
  light: '', // ライトプラン (¥480) の Payment Link
  pro: '',   // プロプラン (¥980) の Payment Link
}

// 指定プランの決済 URL を組み立てる。リンク未設定なら null。
export function buildCheckoutUrl(plan, user) {
  const base = PAYMENT_LINKS[plan]
  if (!base) return null
  try {
    const url = new URL(base)
    if (user?.uid) url.searchParams.set('client_reference_id', user.uid)
    if (user?.email) url.searchParams.set('prefilled_email', user.email)
    return url.toString()
  } catch {
    return null
  }
}

export function isBillingConfigured() {
  return Boolean(PAYMENT_LINKS.light || PAYMENT_LINKS.pro)
}

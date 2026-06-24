// === 料金プラン定義 ==========================================
// 無料 / ライト(¥480) / プロ(¥980)
export const PLANS = {
  free:  { id: 'free',  name: '無料',   price: 0 },
  light: { id: 'light', name: 'ライト', price: 480 },
  pro:   { id: 'pro',   name: 'プロ',   price: 980 },
}

export const PLAN_ORDER = ['free', 'light', 'pro']

// 制限値
export const FREE_MEMBER_LIMIT = 25 // 無料：組織図あたりのメンバー上限
export const CHART_LIMIT = { free: 1, light: 2, pro: Infinity } // 組織図の数
export const UNDO_LIMIT = { free: 5, light: 20, pro: 20 }

// === 機能ごとの利用可否 ======================================
export function isPaid(plan) {
  return plan === 'light' || plan === 'pro'
}

// 共有リンク：全プランで利用可（成長ループのため開放）
export function canUseShare(plan) {
  return true
}

// 共有ページの透かし（Treevia の獲得CTA）を消せるのはプロのみ
export function canRemoveShareBranding(plan) {
  return plan === 'pro'
}

// 組織図の数：無料1・ライト2・プロ無制限
export function canCreateMoreCharts(plan, currentCount) {
  return currentCount < (CHART_LIMIT[plan] ?? 1)
}

// メンバー追加：無料は25人まで、有料は無制限
export function canAddMoreMembers(plan, currentCount) {
  if (plan === 'free') return currentCount < FREE_MEMBER_LIMIT
  return true
}

// エクスポート：プロのみ（機能は後日実装）
export function canExport(plan) {
  return plan === 'pro'
}

export function undoLimit(plan) {
  return UNDO_LIMIT[plan] ?? 5
}

// === 役職（カスタム可能・アカウント共通・最大10個）==========
export const MAX_ROLES = 10

// 既存アカウントの初期値として引き継ぐデフォルト役職。
// id を旧役職名と一致させることで、既存メンバー（role="PDCM"等）を無変更で色付け維持。
export const DEFAULT_ROLES = [
  { id: 'PDCM', name: 'PDCM', color: '#8B5CF6' },
  { id: 'DCM',  name: 'DCM',  color: '#3B82F6' },
  { id: 'ECM',  name: 'ECM',  color: '#10B981' },
  { id: 'PM',   name: 'PM',   color: '#64748B' },
  { id: 'GM',   name: 'GM',   color: '#D97706' },
]

// 役職なし（プレーン）スタイル
const PLAIN = { fill: '#FFFFFF', border: '#D4D4D4', text: '#1F1F1F', sub: '#6B6B6B' }

function hexToRgba(hex, a) {
  const h = (hex || '').replace('#', '')
  if (h.length !== 3 && h.length !== 6) return `rgba(0,0,0,${a})`
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

// 1色から表示スタイルを生成
export function roleStyleFromColor(color) {
  if (!color) return PLAIN
  return {
    fill: hexToRgba(color, 0.16),
    border: color,
    text: '#1F2937',
    sub: color,
  }
}

// 役職ID → 表示スタイル
export function getRoleStyle(roleId, roles = []) {
  if (!roleId) return PLAIN
  const r = roles.find((x) => x.id === roleId)
  return r ? roleStyleFromColor(r.color) : PLAIN
}

// 役職ID → 表示名
export function roleName(roleId, roles = []) {
  const r = roles.find((x) => x.id === roleId)
  return r ? r.name : ''
}

// 役職ID → 階級（リスト先頭が最上位）。フィルタ用。
export function buildRoleRank(roles = []) {
  const rank = {}
  const n = roles.length
  roles.forEach((r, i) => { rank[r.id] = n - i })
  return rank
}

// フィルタ選択肢（「○○以上」）。リスト順＝階級。
export function buildFilterOptions(roles = []) {
  return [
    { value: 'ALL', label: '全表示' },
    ...roles.map((r) => ({ value: r.id, label: `${r.name} 以上` })),
  ]
}

export function genRoleId() {
  return 'r_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)
}

// 役職用のおすすめカラーパレット
export const ROLE_COLOR_PRESETS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#14B8A6', '#6366F1', '#64748B', '#D97706',
]

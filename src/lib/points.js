// 左右ポイントの計算。
// 会員種別（組織図ごとの設定 { id, name, points }）をメンバーに選んでおくと、
// 各メンバーの左の系列・右の系列それぞれの「人数」と「合計ポイント」を出す。
// 計算はその場で行い、保存はしない（設定を変えれば全員分がすぐ再計算される）。
import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'

export const MAX_POINT_TYPES = 50

// 0.1 + 0.2 のような誤差を出さないよう、小数第2位までに丸めて表示する
export function formatPoints(n) {
  return `${Math.round((Number(n) || 0) * 100) / 100}p`
}

export function pointOf(member, typePoints, def) {
  const p = member?.pointType != null ? typePoints[member.pointType] : undefined
  return p != null ? p : def
}

/**
 * @returns {{ [id]: { left: { count, points }, right: { count, points } } }}
 * 折りたたみ・フィルターに関係なく、配下の全員を数える。
 */
export function computeLegPoints(members, types = [], def = 0) {
  const typePoints = {}
  for (const t of types || []) typePoints[t.id] = Number(t.points) || 0
  const defPoints = Number(def) || 0

  const kids = {}
  for (const m of Object.values(members)) {
    if (m.parentId && members[m.parentId] && (m.position === 'left' || m.position === 'right')) {
      (kids[m.parentId] ||= {})[m.position] = m.id
    }
  }
  // 深い系列でも再帰の上限に当たらないよう、スタックで後順に処理する
  const total = {} // id -> 自分を含む配下全体 { count, points }
  const result = {}
  const empty = () => ({ count: 0, points: 0 })
  const roots = Object.values(members).filter((m) => !m.parentId || !members[m.parentId]).map((m) => m.id)
  for (const root of roots) {
    const stack = [[root, false]]
    while (stack.length) {
      const [id, done] = stack.pop()
      const { left, right } = kids[id] || {}
      if (!done) {
        stack.push([id, true])
        if (right) stack.push([right, false])
        if (left) stack.push([left, false])
        continue
      }
      const l = left ? total[left] : empty()
      const r = right ? total[right] : empty()
      result[id] = { left: { ...l }, right: { ...r } }
      total[id] = { count: l.count + r.count + 1, points: l.points + r.points + pointOf(members[id], typePoints, defPoints) }
    }
  }
  return result
}

// 今見ている組織図のポイント設定。種別が1つも無ければ機能はオフ（null）
export function usePointConfig() {
  const viewMode = useStore((s) => s.viewMode)
  const charts = useStore((s) => s.charts)
  const currentChartId = useStore((s) => s.currentChartId)
  const viewerPointConfig = useStore((s) => s.viewerPointConfig)
  const shareConfig = useStore((s) => s.shareConfig)
  return useMemo(() => {
    if (viewMode === 'view') {
      // オーナーが共有ページでの表示をオフにしていたら見せない
      if (!viewerPointConfig || shareConfig?.showPoints === false) return null
      return viewerPointConfig.types?.length ? viewerPointConfig : null
    }
    const chart = charts.find((c) => c.id === currentChartId)
    const types = Array.isArray(chart?.pointTypes) ? chart.pointTypes : []
    return types.length ? { types, def: Number(chart.pointDefault) || 0 } : null
  }, [viewMode, charts, currentChartId, viewerPointConfig, shareConfig])
}

// メンバーごとの左右ポイント。機能オフなら null
export function useLegPoints() {
  const members = useStore((s) => s.members)
  const config = usePointConfig()
  return useMemo(() => (config ? computeLegPoints(members, config.types, config.def) : null), [members, config])
}

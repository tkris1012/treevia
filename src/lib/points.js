// 左右ポイントの計算。方式は組織図ごとに2つ:
// - 自動計算（auto）: 種別（{ id, name, points }）をメンバーに選んでおくと、
//   各メンバーの左の系列・右の系列それぞれの合計ポイントを出す（保存はしない）
// - 手動入力（manual）: メンバーごとに左右の数字（legLeft / legRight）を直接入力し、そのまま出す
// どちらの方式でも、左右の「人数」は組織図の形から数える。
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
export function computeLegPoints(members, types = [], def = 0, mode = 'auto') {
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
      result[id] = mode === 'manual'
        // 手動入力：人数は組織図から、ポイントは入力した数字（未入力は null＝表示しない）
        ? { left: { count: l.count, points: manualPoints(members[id].legLeft) }, right: { count: r.count, points: manualPoints(members[id].legRight) } }
        : { left: { ...l }, right: { ...r } }
      total[id] = { count: l.count + r.count + 1, points: l.points + r.points + pointOf(members[id], typePoints, defPoints) }
    }
  }
  return result
}

function manualPoints(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// 組織図の設定から { mode, types, def } を作る。機能オフなら null
// （自動計算は種別が1つも無ければオフ、手動入力は選んだ時点でオン）
export function pointConfigOf(c) {
  if (!c) return null
  const mode = c.pointMode === 'manual' ? 'manual' : 'auto'
  const types = Array.isArray(c.pointTypes) ? c.pointTypes : []
  if (mode === 'auto' && !types.length) return null
  return { mode, types, def: Number(c.pointDefault) || 0 }
}

// 今見ている組織図のポイント設定。機能オフなら null
export function usePointConfig() {
  const viewMode = useStore((s) => s.viewMode)
  const charts = useStore((s) => s.charts)
  const currentChartId = useStore((s) => s.currentChartId)
  const viewerPointConfig = useStore((s) => s.viewerPointConfig)
  const shareConfig = useStore((s) => s.shareConfig)
  return useMemo(() => {
    if (viewMode === 'view') {
      // オーナーが共有ページでの表示をオフにしていたら見せない
      if (shareConfig?.showPoints === false) return null
      return pointConfigOf(viewerPointConfig)
    }
    return pointConfigOf(charts.find((c) => c.id === currentChartId))
  }, [viewMode, charts, currentChartId, viewerPointConfig, shareConfig])
}

// メンバーごとの左右ポイント。機能オフなら null
export function useLegPoints() {
  const members = useStore((s) => s.members)
  const config = usePointConfig()
  return useMemo(() => (config ? computeLegPoints(members, config.types, config.def, config.mode) : null), [members, config])
}

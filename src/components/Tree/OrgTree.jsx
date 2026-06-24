import { useState, useRef, useEffect, useMemo, useReducer } from 'react'
import { useStore } from '../../store/useStore.js'
import { navigateToList } from '../../store/useSync.js'
import { useTreeLayout, NODE_W, collectDescendants, getSlotPos } from './useTreeLayout.js'
import { buildFilterOptions } from '../../constants/roles.js'
import { canUseShare } from '../../constants/plans.js'
import ShareModal from '../UI/ShareModal.jsx'
import TreeNode from './TreeNode.jsx'
import DropZone from './DropZone.jsx'

const MIN_SCALE = 0.15
const MAX_SCALE = 3

// トップバー用スタイル
const BAR_BTN = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: 'white', border: '1px solid #D1D5DB', borderRadius: 8,
  padding: '6px 10px', boxShadow: '0 1px 4px rgba(0,0,0,.10)',
  cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600,
  pointerEvents: 'auto', whiteSpace: 'nowrap', flexShrink: 0,
}
const BAR_CHIP = {
  background: 'white', border: '1px solid #D1D5DB', borderRadius: 8,
  padding: '6px 10px', boxShadow: '0 1px 4px rgba(0,0,0,.10)',
  fontSize: 13, color: '#1F2937', fontWeight: 700,
}
const ICON_BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, background: 'white', border: '1px solid #D1D5DB',
  borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.10)', cursor: 'pointer',
  fontSize: 15, color: '#374151', padding: 0, pointerEvents: 'auto', flexShrink: 0,
}
const DRAG_THRESHOLD = 6
const LONG_PRESS_MS = 500
const DROP_SNAP_DIST = NODE_W * 0.7

function isRootNode(member, members) {
  return !member.parentId || !members[member.parentId]
}

export default function OrgTree() {
  const members       = useStore((s) => s.members)
  const setSelectedId = useStore((s) => s.setSelectedId)
  const setPanelOpen  = useStore((s) => s.setPanelOpen)
  const addNode       = useStore((s) => s.addNode)
  const deleteNode    = useStore((s) => s.deleteNode)
  const moveNode      = useStore((s) => s.moveNode)
  const addRootNode   = useStore((s) => s.addRootNode)
  const undo            = useStore((s) => s.undo)
  const toggleCollapsed = useStore((s) => s.toggleCollapsed)
  const roleFilter      = useStore((s) => s.roleFilter)
  const setRoleFilter   = useStore((s) => s.setRoleFilter)
  const roles           = useStore((s) => s.roles)
  const openRoleManager = useStore((s) => s.openRoleManager)
  const undoStack       = useStore((s) => s.undoStack)
  const syncStatus      = useStore((s) => s.syncStatus)
  const shareConfig     = useStore((s) => s.shareConfig)
  const plan            = useStore((s) => s.plan)
  const showUpgrade     = useStore((s) => s.showUpgrade)
  const viewMode        = useStore((s) => s.viewMode)
  const isReadOnly      = viewMode === 'view'
  const charts          = useStore((s) => s.charts)
  const currentChartId  = useStore((s) => s.currentChartId)
  const viewerChartTitle = useStore((s) => s.viewerChartTitle)
  const currentChart    = charts.find((c) => c.id === currentChartId)
  const chartTitle      = isReadOnly ? (viewerChartTitle || '') : (currentChart?.title || '')

  const filterOptions   = buildFilterOptions(roles)

  const [shareOpen, setShareOpen] = useState(false)
  const shareAllowed = canUseShare(plan)
  const isShared     = !!shareConfig?.enabled
  const isSyncing    = syncStatus === 'syncing'
  function handleShareClick() {
    if (shareAllowed) setShareOpen(true)
    else showUpgrade('share')
  }

  const { positions, childMap, hiddenChildrenMap } = useTreeLayout()
  const containerRef = useRef(null)
  const svgRef       = useRef(null)

  // Pan/zoom
  const [tfm, setTfm] = useState({ x: 80, y: 80, scale: 1 })
  const tfmRef = useRef(tfm)
  useEffect(() => { tfmRef.current = tfm }, [tfm])

  // Hover
  const [hoveredId, setHoveredId]   = useState(null)
  const hoverTimer                   = useRef(null)

  // Mobile long press
  const [longPressId, setLongPressId] = useState(null)
  const longPressTimer                 = useRef(null)

  // Drag — ref + forceUpdate で stale closure を回避
  const dragRef = useRef(null)
  const [, forceUpdate] = useReducer((x) => x + 1, 0)
  function setDrag(valOrFn) {
    dragRef.current = typeof valOrFn === 'function' ? valOrFn(dragRef.current) : valOrFn
    forceUpdate()
  }

  // Click vs drag
  const pointerRef = useRef(null) // { id, startX, startY, moved }

  // ノード上にいるかフラグ（パンとの排他制御）
  const onNodeRef = useRef(false)

  // Touch pinch
  const touchRef = useRef({ touches: [] })

  // Touch 1-finger pan（Phase 1: スマホ対応）
  const touchPanRef = useRef(null) // { startX, startY, startTx, startTy }

  // ── キーボードショートカット ───────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      if (e.key === 'Escape') { setDrag(null); setHoveredId(null); setLongPressId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  // ── ホイールズーム（passive: false）────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.09
      const rect = svgRef.current.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      setTfm((t) => {
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor))
        const r = s / t.scale
        return { scale: s, x: cx - (cx - t.x) * r, y: cy - (cy - t.y) * r }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── iOS Safari の慣性スワイプを防ぐ（passive: false の native touchmove）─
  // React の onTouchMove は passive なので preventDefault が効かない
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onTouchMove = (e) => { e.preventDefault() }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  // ── パン操作（ネイティブ mousedown でブラッグゴースト完全防止）─
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseDown = (e) => {
      if (e.button !== 0) return
      if (onNodeRef.current) { onNodeRef.current = false; return }
      // フォーム要素（select / input / button / textarea / option）はパン対象外
      if (e.target.closest('select, input, button, textarea, option, label')) return
      e.preventDefault() // ブラウザのドラッグ幽霊画像・テキスト選択を防ぐ
      const start = { x: e.clientX, y: e.clientY, tx: tfmRef.current.x, ty: tfmRef.current.y }

      const onMouseMove = (ev) => {
        if (pointerRef.current?.moved) return // ノードドラッグ中はパンしない
        setTfm((t) => ({
          ...t,
          x: start.tx + (ev.clientX - start.x),
          y: start.ty + (ev.clientY - start.y),
        }))
      }
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [])

  // ── 初回データ読み込み時に全体表示 ────────────────────────
  const centeredRef = useRef(false)
  useEffect(() => {
    if (!centeredRef.current && Object.keys(positions).length && svgRef.current) {
      centeredRef.current = true
      fitView()
    }
  }, [positions]) // eslint-disable-line

  function fitView() {
    if (!svgRef.current || !Object.keys(positions).length) return
    const xs = Object.values(positions).map((p) => p.x)
    const ys = Object.values(positions).map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W
    const minY = Math.min(...ys), maxY = Math.max(...ys) + 72
    const svgW = svgRef.current.clientWidth
    const svgH = svgRef.current.clientHeight
    const treeW = maxX - minX || 1
    const treeH = maxY - minY || 1
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
      Math.min((svgW - 120) / treeW, (svgH - 120) / treeH)
    ))
    setTfm({
      scale,
      x: (svgW - treeW * scale) / 2 - minX * scale,
      y: (svgH - treeH * scale) / 2 - minY * scale,
    })
  }

  // SVG座標変換
  function toSVG(cx, cy) {
    const t = tfmRef.current
    const rect = svgRef.current.getBoundingClientRect()
    return { x: (cx - rect.left - t.x) / t.scale, y: (cy - rect.top - t.y) / t.scale }
  }

  // ── ホバーヘルパー ─────────────────────────────────────────
  const clearHover   = () => clearTimeout(hoverTimer.current)
  const scheduleHide = () => { hoverTimer.current = setTimeout(() => setHoveredId(null), 400) }

  // ── ドロップゾーン計算 ────────────────────────────────────
  const draggedDescendants = useMemo(() => {
    const d = dragRef.current
    if (!d) return new Set()
    return new Set([d.id, ...collectDescendants(childMap, d.id)])
  }, [dragRef.current, childMap]) // eslint-disable-line

  const dropZones = useMemo(() => {
    const d = dragRef.current
    if (!d) return []
    const zones = []
    Object.keys(members).forEach((parentId) => {
      if (draggedDescendants.has(parentId)) return
      ;['left', 'right'].forEach((pos) => {
        const cm = childMap[parentId] || {}
        if (cm[pos]) return
        const slotPos = getSlotPos(positions, childMap, parentId, pos)
        if (!slotPos) return
        zones.push({ parentId, position: pos, x: slotPos.x, y: slotPos.y })
      })
    })
    return zones
  }, [dragRef.current, members, childMap, positions, draggedDescendants]) // eslint-disable-line

  const dropZonesRef = useRef([])
  dropZonesRef.current = dropZones

  function findOverZone(svgX, svgY) {
    const cx = svgX + NODE_W / 2, cy = svgY + 36
    let best = null, bestDist = DROP_SNAP_DIST
    dropZonesRef.current.forEach((z) => {
      const d = Math.hypot(cx - (z.x + NODE_W / 2), cy - (z.y + 36))
      if (d < bestDist) { bestDist = d; best = z }
    })
    return best
  }

  // ── ノードポインターイベント ──────────────────────────────
  function handleNodePointerDown(e, id) {
    e.preventDefault()        // ブラウザのドラッグ幽霊画像を防ぐ
    e.stopPropagation()       // mousedown がコンテナに届かないようにする
    onNodeRef.current = true
    setLongPressId(null)
    pointerRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false }

    if (e.pointerType === 'touch') {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = setTimeout(() => {
        setLongPressId(id)
        if (navigator.vibrate) navigator.vibrate(50)
      }, LONG_PRESS_MS)
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleNodePointerMove(e) {
    if (!pointerRef.current) return
    const dx = e.clientX - pointerRef.current.startX
    const dy = e.clientY - pointerRef.current.startY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (!pointerRef.current.moved && dist > DRAG_THRESHOLD) {
      clearTimeout(longPressTimer.current)
      const id = pointerRef.current.id
      // 閲覧モードではドラッグ移動できない
      if (!isReadOnly && !isRootNode(members[id] ?? {}, members)) {
        pointerRef.current.moved = true
        const sv = toSVG(e.clientX, e.clientY)
        setDrag({ id, ghostX: sv.x - NODE_W / 2, ghostY: sv.y - 36, overParentId: null, overPosition: null })
        return
      }
    }

    if (pointerRef.current.moved && dragRef.current) {
      const sv = toSVG(e.clientX, e.clientY)
      const ghostX = sv.x - NODE_W / 2
      const ghostY = sv.y - 36
      const over = findOverZone(ghostX, ghostY)
      setDrag({ ...dragRef.current, ghostX, ghostY,
        overParentId: over?.parentId ?? null,
        overPosition: over?.position ?? null,
      })
    }
  }

  function handleNodePointerUp(e, id) {
    clearTimeout(longPressTimer.current)
    onNodeRef.current = false
    if (!pointerRef.current) return
    const wasDragging = pointerRef.current.moved
    pointerRef.current = null

    if (!wasDragging) {
      // 閲覧モードでは編集パネルを開かない
      if (!isReadOnly && longPressId !== id) {
        setSelectedId(id)
        setPanelOpen(true)
        setLongPressId(null)
      }
    } else {
      const d = dragRef.current
      if (d?.overParentId && d?.overPosition) {
        moveNode(d.id, d.overParentId, d.overPosition)
      }
      setDrag(null)
    }
  }

  // ── タッチピンチズーム ＋ 1本指パン（Phase 1）────────────
  function handleTouchStart(e) {
    touchRef.current.touches = Array.from(e.touches)
    // 1本指 → パン基準を記録
    if (e.touches.length === 1) {
      touchPanRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: tfmRef.current.x,
        startTy: tfmRef.current.y,
      }
    } else {
      touchPanRef.current = null
    }
  }
  function handleTouchMove(e) {
    const cur = Array.from(e.touches), prev = touchRef.current.touches

    // 1本指パン
    if (cur.length === 1 && touchPanRef.current) {
      // ノードドラッグ中はパンしない
      if (!pointerRef.current?.moved) {
        // ref をローカル変数にキャプチャ（setTfm callback 実行時に null になっていてもクラッシュしないように）
        const pan = touchPanRef.current
        const dx = cur[0].clientX - pan.startX
        const dy = cur[0].clientY - pan.startY
        setTfm((t) => ({
          ...t,
          x: pan.startTx + dx,
          y: pan.startTy + dy,
        }))
      }
    }
    // 2本指ピンチズーム（既存）
    else if (cur.length === 2 && prev.length === 2) {
      const prevDist = Math.hypot(prev[0].clientX - prev[1].clientX, prev[0].clientY - prev[1].clientY)
      const curDist  = Math.hypot(cur[0].clientX  - cur[1].clientX,  cur[0].clientY  - cur[1].clientY)
      const factor = curDist / (prevDist || 1)
      const rect = svgRef.current.getBoundingClientRect()
      const midX = (cur[0].clientX + cur[1].clientX) / 2 - rect.left
      const midY = (cur[0].clientY + cur[1].clientY) / 2 - rect.top
      setTfm((t) => {
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor))
        const r = s / t.scale
        return { scale: s, x: midX - (midX - t.x) * r, y: midY - (midY - t.y) * r }
      })
    }
    touchRef.current.touches = cur
  }
  function handleTouchEnd(e) {
    touchRef.current.touches = Array.from(e.touches)
    if (e.touches.length === 0) {
      touchPanRef.current = null
    } else if (e.touches.length === 1) {
      // 2本→1本に戻った時、パン基準を残った指でリセット
      touchPanRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: tfmRef.current.x,
        startTy: tfmRef.current.y,
      }
    }
  }

  // ── ＋ / 🗑️ / 折りたたみトグル ボタン ────────────────────
  function handleAddClick(e, parentId, position) {
    e.stopPropagation()
    clearHover(); setHoveredId(null); setLongPressId(null)
    addNode(parentId, position)
  }
  function handleDeleteClick(e, id) {
    e.stopPropagation()
    clearHover(); setHoveredId(null); setLongPressId(null)
    deleteNode(id)
  }
  function handleToggleCollapsed(e, id) {
    e.stopPropagation()
    clearHover(); setHoveredId(null); setLongPressId(null)
    toggleCollapsed(id)
  }

  // ── エッジ ────────────────────────────────────────────────
  const edges = useMemo(() => {
    const lines = []
    Object.values(members).forEach((m) => {
      if (!m.parentId || !positions[m.parentId] || !positions[m.id]) return
      const pp = positions[m.parentId], cp = positions[m.id]
      const x1 = pp.x + NODE_W / 2, y1 = pp.y + 72
      const x2 = cp.x + NODE_W / 2, y2 = cp.y
      const midY = (y1 + y2) / 2

      // 親が単一子（このノードのみ）の場合は、左右どちらか側に屈曲を入れる
      const parentChildren = childMap[m.parentId] || {}
      const onlyChild = !!parentChildren.left !== !!parentChildren.right

      let d
      if (onlyChild) {
        // 子の上端の左寄り or 右寄りに侵入させて、左右どちらに付いてるかを線で表現
        const isLeftSlot = m.position === 'left'
        const entryX = isLeftSlot ? cp.x + NODE_W * 0.25 : cp.x + NODE_W * 0.75
        d = `M${x1},${y1} L${x1},${midY} L${entryX},${midY} L${entryX},${y2}`
      } else {
        d = `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`
      }
      lines.push({ id: m.id, d })
    })
    return lines
  }, [members, positions, childMap])

  const drag            = dragRef.current
  const activeControlId = hoveredId || longPressId
  const isEmpty         = Object.keys(members).length === 0

  // ── レンダー ──────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%', position: 'relative',
        overflow: 'hidden', background: '#EBEBEB',
        userSelect: 'none',
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* ツールバー（左下） — 閲覧モードでは非表示 */}
      {!isReadOnly && (
        <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10 }}>
          <button
            onClick={addRootNode}
            style={{
              background: '#7C3AED', color: 'white', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
              boxShadow: '0 2px 6px rgba(124,58,237,0.35)',
            }}
          >
            ＋ ルート追加
          </button>
        </div>
      )}

      {/* トップバー（全幅・2段構成。縦画面でも重ならない） */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {/* 1段目：戻る＋タイトル ｜ 操作 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isReadOnly && (
            <button onClick={navigateToList} title="一覧へ戻る"
              style={{ ...ICON_BTN, fontWeight: 700 }}>←</button>
          )}
          {chartTitle ? (
            <div style={{
              ...BAR_CHIP, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>🌳 {chartTitle}</div>
          ) : <div style={{ flex: 1 }} />}

          {!isReadOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button onClick={undo} disabled={undoStack.length === 0} title="元に戻す"
                style={{ ...ICON_BTN, opacity: undoStack.length ? 1 : 0.4,
                  cursor: undoStack.length ? 'pointer' : 'not-allowed' }}>↩</button>
              <button onClick={handleShareClick}
                title={shareAllowed ? '共有リンク' : '共有リンク（プロ）'}
                style={{ ...ICON_BTN, ...(isShared ? { background: '#ECFDF5', borderColor: '#A7F3D0' } : {}) }}>
                {shareAllowed ? '🔗' : '🔒'}
              </button>
              <span title={isSyncing ? '同期中' : '同期済み'}
                style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: isSyncing ? '#FBBF24' : '#22C55E' }} />
            </div>
          )}
        </div>

        {/* 2段目：フィルタ ＋ 役職 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...BAR_CHIP, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, pointerEvents: 'auto' }}>
            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>フィルタ</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                fontSize: 13, padding: '3px 6px', border: '1px solid #E5E7EB',
                borderRadius: 6, background: 'white', cursor: 'pointer', outline: 'none',
              }}
            >
              {filterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {!isReadOnly && (
            <button onClick={openRoleManager} title="役職を管理" style={BAR_BTN}>🎨 役職</button>
          )}
        </div>
      </div>

      {/* 全体表示（右下） */}
      <button
        onClick={fitView}
        style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 10,
          background: 'white', border: '1px solid #D1D5DB', borderRadius: 8,
          padding: '6px 12px', fontSize: 13, color: '#374151', cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0,0,0,.12)',
        }}
      >
        ⊞ 全体表示
      </button>

      {/* メンバーゼロガイド */}
      {isEmpty && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 5,
          pointerEvents: 'none', padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🌳</div>
          {isReadOnly ? (
            <div style={{ fontSize: 15, color: '#9CA3AF', fontWeight: 500 }}>
              まだメンバーがいません
            </div>
          ) : (
            <>
              <div style={{ fontSize: 16, color: '#6B7280', fontWeight: 600 }}>
                さっそく組織図を作りましょう
              </div>
              <button
                onClick={addRootNode}
                style={{
                  pointerEvents: 'auto',
                  background: '#7C3AED', color: 'white', border: 'none', borderRadius: 10,
                  padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
                }}
              >
                ＋ 最初のメンバーを追加
              </button>
              <div style={{ fontSize: 12.5, color: '#9CA3AF', fontWeight: 500, lineHeight: 1.6 }}>
                追加後、ノードにカーソルを乗せると<br />左右に「＋」が出て下の人を増やせます
              </div>
            </>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onDragStart={(e) => e.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* SVG背景（明示的に塗る） */}
        <rect width="100%" height="100%" fill="#EBEBEB" />

        <g transform={`translate(${tfm.x},${tfm.y}) scale(${tfm.scale})`}>

          {/* エッジ */}
          {edges.map((e) => (
            <path key={e.id} d={e.d} fill="none" stroke="#C4C4C4" strokeWidth={2} />
          ))}

          {/* ドロップゾーン */}
          {drag && dropZones.map((z) => {
            const isOver = z.parentId === drag.overParentId && z.position === drag.overPosition
            return (
              <DropZone key={`dz-${z.parentId}-${z.position}`}
                x={z.x} y={z.y} isOver={isOver} isValid={true} />
            )
          })}

          {/* ノードは SVG 外の HTML オーバーレイで描画（iOS Safari foreignObject バグ回避） */}

          {/* オーバーレイ rect（全インタラクション） */}
          {Object.values(members).map((m) => {
            const pos = positions[m.id]
            if (!pos) return null
            const isRoot = isRootNode(m, members)
            return (
              <rect key={`r-${m.id}`}
                x={pos.x} y={pos.y} width={NODE_W} height={72} rx={10}
                fill="transparent" pointerEvents="all"
                style={{ cursor: isRoot ? 'default' : 'grab' }}
                onPointerEnter={() => { clearHover(); setHoveredId(m.id) }}
                onPointerLeave={scheduleHide}
                onPointerDown={(e) => handleNodePointerDown(e, m.id)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={(e) => handleNodePointerUp(e, m.id)}
                onTouchStart={(e) => e.stopPropagation()}
              />
            )
          })}

          {/* ホバー／長押しコントロール */}
          {activeControlId && positions[activeControlId] && !drag && (() => {
            const id  = activeControlId
            const m   = members[id]
            const pos = positions[id]
            const cm  = childMap[id] || {}
            const collapsible = true  // 全ノードで折りたたみ可
            const isCollapsed = !!m?.collapsed
            // 折りたたみ中 or 閲覧モードでは子追加・削除できない
            const showAddButtons = !isCollapsed && !isReadOnly
            const showDeleteButton = !isReadOnly
            return (
              <g
                onPointerEnter={clearHover}
                onPointerLeave={scheduleHide}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {/* ＋左 */}
                {showAddButtons && !cm.left && (
                  <g style={{ cursor: 'pointer' }} onClick={(e) => handleAddClick(e, id, 'left')}>
                    <circle cx={pos.x + NODE_W * 0.28} cy={pos.y + 72 + 22} r={14}
                      fill="white" stroke="#10B981" strokeWidth={2} />
                    <text x={pos.x + NODE_W * 0.28} y={pos.y + 72 + 27}
                      textAnchor="middle" fontSize={20} fill="#10B981"
                      style={{ pointerEvents: 'none' }}>+</text>
                  </g>
                )}
                {/* ＋右 */}
                {showAddButtons && !cm.right && (
                  <g style={{ cursor: 'pointer' }} onClick={(e) => handleAddClick(e, id, 'right')}>
                    <circle cx={pos.x + NODE_W * 0.72} cy={pos.y + 72 + 22} r={14}
                      fill="white" stroke="#10B981" strokeWidth={2} />
                    <text x={pos.x + NODE_W * 0.72} y={pos.y + 72 + 27}
                      textAnchor="middle" fontSize={20} fill="#10B981"
                      style={{ pointerEvents: 'none' }}>+</text>
                  </g>
                )}
                {/* 🗑️ */}
                {showDeleteButton && (
                  <g style={{ cursor: 'pointer' }} onClick={(e) => handleDeleteClick(e, id)}>
                    <circle cx={pos.x + NODE_W + 8} cy={pos.y - 8} r={13}
                      fill="white" stroke="#EF4444" strokeWidth={2} />
                    <text x={pos.x + NODE_W + 8} y={pos.y - 3}
                      textAnchor="middle" fontSize={13}
                      style={{ pointerEvents: 'none' }}>🗑️</text>
                  </g>
                )}
                {/* 折りたたみトグル（PDCM/DCM/ECM のみ、配下が存在する場合） */}
                {collapsible && (cm.left || cm.right || isCollapsed) && (
                  <g style={{ cursor: 'pointer' }} onClick={(e) => handleToggleCollapsed(e, id)}>
                    <circle cx={pos.x - 8} cy={pos.y - 8} r={13}
                      fill="white" stroke="#6B7280" strokeWidth={2} />
                    <text x={pos.x - 8} y={pos.y - 4}
                      textAnchor="middle" fontSize={12} fill="#374151"
                      style={{ pointerEvents: 'none' }}>{isCollapsed ? '▶' : '▼'}</text>
                  </g>
                )}
              </g>
            )
          })()}

          {/* 折りたたみ中の常時表示 ▼ バッジ（ノード下中央） */}
          {Object.values(members).map((m) => {
            const pos = positions[m.id]
            if (!pos) return null
            const hiddenCount = hiddenChildrenMap[m.id]
            if (!hiddenCount) return null
            return (
              <g key={`badge-${m.id}`} style={{ cursor: 'pointer' }}
                onClick={(e) => handleToggleCollapsed(e, m.id)}
                onPointerDown={(e) => e.stopPropagation()}>
                <rect
                  x={pos.x + NODE_W / 2 - 22} y={pos.y + 72 + 4}
                  width={44} height={20} rx={10}
                  fill="white" stroke="#6B7280" strokeWidth={1.5}
                />
                <text
                  x={pos.x + NODE_W / 2} y={pos.y + 72 + 18}
                  textAnchor="middle" fontSize={11} fill="#374151" fontWeight={600}
                  style={{ pointerEvents: 'none' }}
                >▼ {hiddenCount}</text>
              </g>
            )
          })}

          {/* ドラッグゴーストも HTML オーバーレイで描画 */}

        </g>
      </svg>

      {/* HTML ノードオーバーレイ（foreignObject の代替 — iOS Safari 対応）*/}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          transform: `translate3d(${tfm.x}px, ${tfm.y}px, 0) scale(${tfm.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
        }}>
          {Object.values(members).map((m) => {
            const pos = positions[m.id]
            if (!pos) return null
            return (
              <div key={m.id} style={{ position: 'absolute', left: pos.x, top: pos.y, pointerEvents: 'none' }}>
                <TreeNode
                  member={m}
                  isRoot={isRootNode(m, members)}
                  isDragging={draggedDescendants.has(m.id) && !!drag}
                />
              </div>
            )
          })}
          {/* ドラッグゴースト */}
          {drag && (
            <div style={{ position: 'absolute', left: drag.ghostX, top: drag.ghostY, opacity: 0.75, pointerEvents: 'none' }}>
              <TreeNode member={members[drag.id]} isRoot={false} isDragging={false} />
            </div>
          )}
        </div>
      </div>

      {/* 共有モーダル */}
      {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
    </div>
  )
}

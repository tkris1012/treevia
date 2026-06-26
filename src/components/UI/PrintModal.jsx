import { useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore.js'
import { computeLayout, NODE_W, NODE_H } from '../../components/Tree/useTreeLayout.js'
import TreeNode from '../../components/Tree/TreeNode.jsx'
import { estimatePages, generateChartPdf } from '../../lib/printChart.js'

const PAD = 48 // 図の周囲の余白(px)

export default function PrintModal({ onClose }) {
  const members = useStore((s) => s.members)
  const charts = useStore((s) => s.charts)
  const currentChartId = useStore((s) => s.currentChartId)
  const chartTitle = charts.find((c) => c.id === currentChartId)?.title || '組織図'

  const [mode, setMode] = useState('poster')        // 'fit' | 'poster'
  const [paper, setPaper] = useState('a4')           // 'a4' | 'a3'
  const [orientation, setOrientation] = useState('landscape') // 'portrait' | 'landscape'
  const [busy, setBusy] = useState(false)

  const printRef = useRef(null)

  // 折りたたみを全部展開した全体レイアウト
  const expanded = useMemo(() => {
    const r = {}
    Object.keys(members).forEach((id) => { r[id] = { ...members[id], collapsed: false } })
    return r
  }, [members])

  const { positions, childMap } = useMemo(
    () => computeLayout(expanded, 'ALL', {}),
    [expanded],
  )

  // 全体の描画サイズと、原点合わせのオフセット
  const { contentW, contentH, ox, oy } = useMemo(() => {
    const pts = Object.values(positions)
    if (!pts.length) return { contentW: 0, contentH: 0, ox: 0, oy: 0 }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H
    return {
      contentW: (maxX - minX) + PAD * 2,
      contentH: (maxY - minY) + PAD * 2,
      ox: -minX + PAD,
      oy: -minY + PAD,
    }
  }, [positions])

  // エッジ（OrgTree と同じ屈曲ロジック）
  const edges = useMemo(() => {
    const lines = []
    Object.values(expanded).forEach((m) => {
      if (!m.parentId || !positions[m.parentId] || !positions[m.id]) return
      const pp = positions[m.parentId], cp = positions[m.id]
      const x1 = pp.x + ox + NODE_W / 2, y1 = pp.y + oy + 72
      const x2 = cp.x + ox + NODE_W / 2, y2 = cp.y + oy
      const midY = (y1 + y2) / 2
      const pc = childMap[m.parentId] || {}
      const onlyChild = !!pc.left !== !!pc.right
      let d
      if (onlyChild) {
        const entryX = m.position === 'left' ? cp.x + ox + NODE_W * 0.25 : cp.x + ox + NODE_W * 0.75
        d = `M${x1},${y1} L${x1},${midY} L${entryX},${midY} L${entryX},${y2}`
      } else {
        d = `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`
      }
      lines.push({ id: m.id, d })
    })
    return lines
  }, [expanded, positions, childMap, ox, oy])

  const memberCount = Object.keys(members).length
  const pages = contentW ? estimatePages(contentW, contentH, { mode, paper, orientation }) : 0

  async function handleGenerate() {
    if (busy || !printRef.current || !contentW) return
    setBusy(true)
    try {
      await generateChartPdf({
        element: printRef.current,
        contentWidth: contentW,
        contentHeight: contentH,
        options: { mode, paper, orientation },
        fileName: `${chartTitle}.pdf`,
      })
      onClose()
    } catch (e) {
      console.error('PDF生成に失敗', e)
      alert('PDFの生成に失敗しました。メンバー数が多い場合は「1枚に収める」をお試しください。')
    } finally {
      setBusy(false)
    }
  }

  function isRoot(m) {
    return !m.parentId || !members[m.parentId]
  }

  return (
    <>
      {/* 設定モーダル */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(440px, 92vw)', background: 'white', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.30)', zIndex: 51, padding: 24,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: '#1F2937' }}>🖨 印刷・PDF出力</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', padding: 0 }}>✕</button>
        </div>

        {/* 出力方法 */}
        <Field label="出力方法">
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { v: 'poster', label: 'ポスター分割', sub: '全体を複数ページに分けて出力' },
              { v: 'fit', label: '1枚に収める', sub: '全体を1ページに縮小' },
            ]}
          />
        </Field>

        {/* 用紙・向き */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="用紙" style={{ flex: 1 }}>
            <Seg value={paper} onChange={setPaper} options={[{ v: 'a4', label: 'A4' }, { v: 'a3', label: 'A3' }]} />
          </Field>
          <Field label="向き" style={{ flex: 1 }}>
            <Seg value={orientation} onChange={setOrientation} options={[{ v: 'landscape', label: '横' }, { v: 'portrait', label: '縦' }]} />
          </Field>
        </div>

        {/* 見積り */}
        <div style={{
          fontSize: 13, color: '#374151', background: '#F9FAFB',
          border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px',
        }}>
          メンバー {memberCount}人 ／ <strong>{mode === 'fit' ? '1' : pages}ページ</strong>
          {mode === 'poster' && pages > 1 && (
            <span style={{ color: '#6B7280' }}>（1枚目は全体図、以降を貼り合わせ）</span>
          )}
          {mode === 'poster' && pages > 30 && (
            <div style={{ color: '#B45309', marginTop: 4 }}>⚠️ ページが多めです。A3や「1枚に収める」も検討してください。</div>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={busy || memberCount === 0}
          style={{
            width: '100%', padding: '13px', borderRadius: 10, border: 'none',
            background: '#7C3AED', color: 'white', fontSize: 15, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', opacity: (busy || memberCount === 0) ? 0.6 : 1,
          }}
        >
          {busy ? 'PDFを作成中…' : 'PDFを作成'}
        </button>
        <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
          折りたたみ中のメンバーも全て展開して出力します
        </div>
      </div>

      {/* 非表示の全体描画（html2canvas でキャプチャ対象） */}
      <div
        ref={printRef}
        style={{
          position: 'fixed', left: -100000, top: 0,
          width: contentW, height: contentH,
          background: '#ffffff',
        }}
        aria-hidden
      >
        <svg
          width={contentW} height={contentH}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
          {edges.map((e) => (
            <path key={e.id} d={e.d} stroke="#9CA3AF" strokeWidth={2} fill="none" />
          ))}
        </svg>
        {Object.keys(positions).map((id) => {
          const p = positions[id]
          const m = members[id]
          if (!m) return null
          return (
            <div key={id} style={{ position: 'absolute', left: p.x + ox, top: p.y + oy, width: NODE_W }}>
              <TreeNode member={m} isRoot={isRoot(m)} />
            </div>
          )
        })}
      </div>
    </>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Seg({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o) => {
        const active = value === o.v
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${active ? '#7C3AED' : '#E5E7EB'}`,
              background: active ? '#FAF5FF' : 'white',
              color: active ? '#7C3AED' : '#374151',
              fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
            }}
          >
            {o.label}
            {o.sub && <div style={{ fontSize: 10, fontWeight: 400, color: '#9CA3AF', marginTop: 2 }}>{o.sub}</div>}
          </button>
        )
      })}
    </div>
  )
}

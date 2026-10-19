import { useState } from 'react'
import { X, Plus, Trash2, Coins } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { saveChartPointSettings } from '../../lib/firestore.js'
import { MAX_POINT_TYPES } from '../../lib/points.js'

// 左右ポイントの設定（組織図ごと）。会員種別とポイントを登録し、メンバーには種別を選ぶ。
const newId = () => 'pt_' + Math.random().toString(36).slice(2, 10)
const EXAMPLE = [
  { id: 'pt_business', name: 'ビジネス会員', points: '1' },
  { id: 'pt_user', name: 'ユーザー', points: '0.5' },
]

function toNumber(v) {
  const n = Number(String(v).trim())
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null
}

export default function PointSettingsModal({ onClose }) {
  const user = useStore((s) => s.user)
  const currentChartId = useStore((s) => s.currentChartId)
  const chart = useStore((s) => s.charts.find((c) => c.id === s.currentChartId))
  const showAllPoints = useStore((s) => s.showAllPoints)
  const setShowAllPoints = useStore((s) => s.setShowAllPoints)

  const saved = Array.isArray(chart?.pointTypes) ? chart.pointTypes : []
  const [rows, setRows] = useState(() => saved.length
    ? saved.map((t) => ({ id: t.id, name: t.name, points: String(t.points) }))
    : EXAMPLE.map((t) => ({ ...t, id: newId() })))
  const [def, setDef] = useState(() => String(Number(chart?.pointDefault) || 0))
  const [busy, setBusy] = useState(false)

  const update = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const errors = rows.map((r) => (!r.name.trim() ? '名前を入力' : toNumber(r.points) == null ? '0以上の数字' : ''))
  const defError = toNumber(def) == null
  const canSave = !busy && !defError && errors.every((e) => !e)

  async function handleSave() {
    if (!canSave || !user || !currentChartId) return
    setBusy(true)
    try {
      const types = rows.map((r) => ({ id: r.id, name: r.name.trim().slice(0, 50), points: toNumber(r.points) }))
      await saveChartPointSettings(user.uid, currentChartId, types, toNumber(def))
      onClose()
    } catch (e) {
      console.error('ポイント設定の保存に失敗', e)
      alert('ポイント設定を保存できませんでした。時間をおいて再度お試しください。')
      setBusy(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(440px, 92vw)', maxHeight: '90vh', overflowY: 'auto',
        background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.30)',
        zIndex: 51, padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: '#1F2937', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Coins size={19} /> 左右ポイントの設定
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex' }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, margin: 0 }}>
          会員種別ごとのポイントを決めて、各メンバーに種別を選ぶと、左右の系列の合計ポイントを自動で計算します。
          ポイントを変えると全員分がすぐ再計算されます（この組織図だけの設定です）。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
            <div style={{ flex: 1 }}>会員種別</div>
            <div style={{ width: 88 }}>ポイント</div>
            <div style={{ width: 30 }} />
          </div>
          {rows.map((r, i) => (
            <div key={r.id}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={50}
                  placeholder="例：ビジネス会員" aria-label="会員種別の名前"
                  style={{ ...INPUT, flex: 1, minWidth: 0, borderColor: errors[i] && !r.name.trim() ? '#F87171' : '#D1D5DB' }} />
                <div style={{ width: 88, position: 'relative' }}>
                  <input value={r.points} onChange={(e) => update(i, { points: e.target.value })} inputMode="decimal"
                    aria-label="ポイント"
                    style={{ ...INPUT, width: '100%', paddingRight: 22, boxSizing: 'border-box', borderColor: toNumber(r.points) == null ? '#F87171' : '#D1D5DB' }} />
                  <span style={{ position: 'absolute', right: 8, top: 8, fontSize: 13, color: '#9CA3AF' }}>p</span>
                </div>
                <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} title="この種別を削除"
                  style={{ width: 30, height: 34, border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={16} />
                </button>
              </div>
              {errors[i] && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>{errors[i]}</div>}
            </div>
          ))}
          {rows.length < MAX_POINT_TYPES && (
            <button onClick={() => setRows((rs) => [...rs, { id: newId(), name: '', points: '1' }])}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              <Plus size={15} /> 種別を追加
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
          <div style={{ flex: 1 }}>種別が未設定のメンバー</div>
          <div style={{ width: 88, position: 'relative' }}>
            <input value={def} onChange={(e) => setDef(e.target.value)} inputMode="decimal" aria-label="未設定のメンバーのポイント"
              style={{ ...INPUT, width: '100%', paddingRight: 22, boxSizing: 'border-box', borderColor: defError ? '#F87171' : '#D1D5DB' }} />
            <span style={{ position: 'absolute', right: 8, top: 8, fontSize: 13, color: '#9CA3AF' }}>p</span>
          </div>
          <div style={{ width: 30 }} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAllPoints} onChange={(e) => setShowAllPoints(e.target.checked)} />
          全員のノードに左右ポイントを表示する（オフのときはルートのみ）
        </label>

        {rows.length === 0 && (
          <div style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', borderRadius: 8, padding: '8px 10px' }}>
            種別が1つもないと、ポイントは表示されません。
          </div>
        )}

        <button onClick={handleSave} disabled={!canSave}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            background: '#7C3AED', color: 'white', fontSize: 15, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', opacity: canSave ? 1 : 0.6,
          }}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </>
  )
}

const INPUT = {
  fontSize: 14, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', color: '#1F2937',
}

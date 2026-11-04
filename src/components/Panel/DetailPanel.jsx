import { useState, useEffect, useRef } from 'react'
import { X, Camera, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { getRoleStyle, roleStyleFromColor } from '../../constants/roles.js'
import PhotoCropModal from '../UI/PhotoCropModal.jsx'
import DanBadge from '../Tree/DanBadge.jsx'
import { DAN_OPTIONS, normalizeDan } from '../../constants/dan.js'
import { usePointConfig, useLegPoints, formatPoints } from '../../lib/points.js'

export default function DetailPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const panelOpen = useStore((s) => s.panelOpen)
  const setPanelOpen = useStore((s) => s.setPanelOpen)
  const members = useStore((s) => s.members)
  const saveNode = useStore((s) => s.saveNode)
  const addNode = useStore((s) => s.addNode)
  const deleteNode = useStore((s) => s.deleteNode)
  const roles = useStore((s) => s.roles)
  const openRoleManager = useStore((s) => s.openRoleManager)
  const pointConfig = usePointConfig()
  const legPoints = useLegPoints()

  const member = selectedId ? members[selectedId] : null
  const isRoot = !!member && (!member.parentId || !members[member.parentId])

  // 子枠の埋まり具合（追加ボタンの有効/無効判定）
  const children = selectedId
    ? Object.values(members).filter((m) => m.parentId === selectedId)
    : []
  const hasLeft = children.some((m) => m.position === 'left')
  const hasRight = children.some((m) => m.position === 'right')

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [job, setJob]   = useState('')
  const [dan, setDan]   = useState('')
  const [pointType, setPointType] = useState('')
  const [legL, setLegL] = useState('') // 手動入力の左右ポイント（入力中は文字列）
  const [legR, setLegR] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState(null) // クロップ待ちの選択画像（object URL）

  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)

  // Sync form when member changes
  useEffect(() => {
    if (member) {
      setName(member.name || '')
      setRole(member.role || '')
      setJob(member.job || '')
      setDan(normalizeDan(member.dan) ? String(member.dan) : '')
      setPointType(member.pointType || '')
      setLegL(typeof member.legLeft === 'number' ? String(member.legLeft) : '')
      setLegR(typeof member.legRight === 'number' ? String(member.legRight) : '')
      setPhoto(null)
      setPhotoPreview(member.photo || null)
    }
  }, [selectedId, member])

  // 追加直後（デフォルト名のまま）は、すぐ入力できるよう名前欄にフォーカスする。
  // selectedId のみに依存させ、Firestoreの再同期のたびに再フォーカスしないようにする。
  useEffect(() => {
    if (member?.name === '新メンバー') {
      const t = setTimeout(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      }, 0)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  if (!panelOpen || !member) return null

  const style = getRoleStyle(role, roles)

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルを選び直しても onChange が発火するようにリセット
    if (!file) return
    setCropSrc(URL.createObjectURL(file))
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function handleCropConfirm(base64) {
    setPhoto(base64)
    setPhotoPreview(base64)
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function handleRemovePhoto() {
    setPhoto('')
    setPhotoPreview(null)
  }

  async function handleSave() {
    if (!name.trim()) { alert('名前を入力してください'); return }
    setSaving(true)
    try {
      const updates = { name: name.trim(), role, job: job.trim() }
      if (!isRoot) updates.dan = normalizeDan(dan)
      if (photo !== null) updates.photo = photo || null
      if (pointConfig?.mode === 'manual') {
        const l = parseLeg(legL), r = parseLeg(legR)
        if (l === undefined || r === undefined) { alert('左右のポイントは0以上の数字で入力してください（空欄にすると表示しません）'); return }
        if (l !== (member.legLeft ?? null) || r !== (member.legRight ?? null)) {
          updates.legLeft = l
          updates.legRight = r
          updates.legUpdatedAt = new Date() // 最終更新日（詳細画面に表示）
        }
      } else if (pointConfig) {
        updates.pointType = pointType || null
      }
      await saveNode(selectedId, updates)
      setPanelOpen(false)
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setPanelOpen(false)
  }

  // 子メンバーを追加（追加後は新メンバーが選択され、このパネルがそのまま開く）
  function handleAddChild(position) {
    if (!selectedId) return
    addNode(selectedId, position)
  }

  // このメンバーを削除（確認ダイアログ経由。既定は繰り上げ、チェックで配下ごと削除も可）
  function handleDeleteMember() {
    if (!selectedId) return
    deleteNode(selectedId)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 30 }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 31,
          width: 320, background: 'white',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#1F1F1F' }}>メンバー編集</div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body（ノートPCやスマホでもスクロールせずに全部見えるよう、項目名は左に置いて縦を詰める） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

          {/* 写真 ＋ 名前 */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <div
              style={{
                width: 72, height: 72, minWidth: 72, borderRadius: 10,
                border: `2px solid ${style.border}`,
                overflow: 'hidden', background: '#F0F0F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => fileInputRef.current?.click()}
              title="クリックして写真を選択"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ textAlign: 'center', fontSize: 10, color: '#9CA3AF', lineHeight: 1.3 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Camera size={22} strokeWidth={1.5} /></div>
                  <div>写真</div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ display: 'block' }}>
                <div style={LABEL}>名前 *</div>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
                  placeholder="名前を入力"
                  style={INPUT}
                  onFocus={(e) => e.target.style.borderColor = '#7C3AED'}
                  onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={LINK_BTN}>写真を選択</button>
                {photoPreview && (
                  <button type="button" onClick={handleRemovePhoto} style={{ ...LINK_BTN, color: '#EF4444' }}>写真を削除</button>
                )}
              </div>
            </div>
          </div>

          {/* 職業 */}
          <Row label="職業">
            <input
              type="text"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="職業を入力（任意）"
              style={INPUT}
              onFocus={(e) => e.target.style.borderColor = '#7C3AED'}
              onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
            />
          </Row>

          {/* 段数（ルート以外） */}
          {!isRoot && (
            <Row label="段数">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={dan}
                  onChange={(e) => setDan(e.target.value)}
                  style={{ ...INPUT, flex: 1, background: 'white', color: dan ? '#1F2937' : '#9CA3AF', cursor: 'pointer' }}
                >
                  <option value="">未設定</option>
                  {DAN_OPTIONS.map((n) => (
                    <option key={n} value={String(n)}>{n}段</option>
                  ))}
                </select>
                <div style={{ width: 40, display: 'flex', justifyContent: 'center' }}>
                  <DanBadge dan={dan} />
                </div>
              </div>
            </Row>
          )}

          {/* 左右ポイントの手動入力（方式が「手動入力」の組織図だけ） */}
          {pointConfig?.mode === 'manual' && (
            <>
              <Row label="ポイント">
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['左', legL, setLegL], ['右', legR, setLegR]].map(([side, v, set]) => (
                    <div key={side} style={{ flex: 1, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 9, top: 8, fontSize: 13, fontWeight: 700, color: '#92400E' }}>{side}</span>
                      <input value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder="未入力"
                        aria-label={`${side}のポイント`}
                        style={{ ...INPUT, paddingLeft: 26, paddingRight: 20, borderColor: parseLeg(v) === undefined ? '#F87171' : '#D1D5DB' }} />
                      <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 13, color: '#9CA3AF' }}>p</span>
                    </div>
                  ))}
                </div>
              </Row>
              <div style={{ margin: '-4px 0 10px 62px', fontSize: 11, color: '#6B7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {legPoints?.[member.id] && (
                  <span>左 {legPoints[member.id].left.count}人 ／ 右 {legPoints[member.id].right.count}人</span>
                )}
                <span>最終更新：{formatDate(member.legUpdatedAt) || '未入力'}</span>
              </div>
            </>
          )}

          {/* 種別（左右ポイントの設定がある組織図だけ） */}
          {pointConfig && pointConfig.mode !== 'manual' && (
            <>
              <Row label="種別">
                <select value={pointType} onChange={(e) => setPointType(e.target.value)}
                  style={{ ...INPUT, background: 'white', color: '#1F2937', cursor: 'pointer' }}>
                  <option value="">未設定（{formatPoints(pointConfig.def)}）</option>
                  {pointConfig.types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{formatPoints(t.points)}）</option>
                  ))}
                  {pointType && !pointConfig.types.some((t) => t.id === pointType) && (
                    <option value={pointType}>削除された種別（{formatPoints(pointConfig.def)}として計算）</option>
                  )}
                </select>
              </Row>
              {legPoints?.[member.id] && (
                <div style={{ display: 'flex', gap: 6, margin: '-2px 0 10px 62px' }}>
                  {['left', 'right'].map((side) => (
                    <div key={side} style={{
                      flex: 1, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
                      padding: '3px 8px', fontSize: 12, color: '#92400E', whiteSpace: 'nowrap',
                    }}>
                      {side === 'left' ? '左' : '右'}{' '}
                      <b style={{ fontSize: 13, color: '#78350F' }}>{formatPoints(legPoints[member.id][side].points)}</b>
                      <span style={{ marginLeft: 4 }}>{legPoints[member.id][side].count}人</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 役職 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ ...LABEL, flex: 1, marginBottom: 0 }}>役職</div>
              <button
                type="button"
                onClick={openRoleManager}
                style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                役職を管理
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <RoleChip label="なし" active={!role} onClick={() => setRole('')} />
              {roles.map((r) => (
                <RoleChip
                  key={r.id}
                  label={r.name}
                  color={r.color}
                  active={role === r.id}
                  onClick={() => setRole(r.id)}
                />
              ))}
              {/* 既存の値がリストに無い場合も選択を保持 */}
              {role && !roles.some((r) => r.id === role) && (
                <RoleChip label={`${role}（削除済み）`} active onClick={() => {}} />
              )}
            </div>
          </div>

          {/* 操作（スマホでの追加・削除導線） */}
          <div style={{ paddingTop: 12, borderTop: '1px solid #F0F0F0', display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleAddChild('left')}
              disabled={hasLeft}
              style={addBtnStyle(hasLeft)}
            >
              ＋ 左に追加
            </button>
            <button
              onClick={() => handleAddChild('right')}
              disabled={hasRight}
              style={addBtnStyle(hasRight)}
            >
              ＋ 右に追加
            </button>
            <button
              onClick={handleDeleteMember}
              title="このメンバーを削除"
              aria-label="このメンバーを削除"
              style={{
                width: 42, flexShrink: 0, borderRadius: 8,
                border: '1px solid #FCA5A5', background: 'white',
                cursor: 'pointer', color: '#EF4444',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Footer (編集の保存/キャンセル) */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #F0F0F0', display: 'flex', gap: 10 }}>
          <button
            onClick={handleClose}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: '1px solid #D1D5DB', background: 'white',
              fontSize: 14, cursor: 'pointer', color: '#374151',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: 'none', background: '#7C3AED',
              fontSize: 14, cursor: 'pointer', color: 'white',
              fontWeight: 600, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {cropSrc && (
        <PhotoCropModal
          imageSrc={cropSrc}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  )
}

function RoleChip({ label, color, active, onClick }) {
  const style = roleStyleFromColor(color)
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
        border: `2px solid ${active ? style.border : '#E5E7EB'}`,
        background: active ? style.fill : 'white',
        color: active ? style.text : '#6B7280',
      }}
    >
      {label}
    </button>
  )
}

// 手動入力の左右ポイント：空欄は null（表示しない）、不正な値は undefined
function parseLeg(v) {
  const t = String(v).trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  if (t === '') return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : undefined
}

// Firestore の Timestamp / Date を「2026/11/04」に
function formatDate(t) {
  const d = t?.toDate ? t.toDate() : t instanceof Date ? t : null
  return d ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : ''
}

// 項目名を左に置いた1行（縦を詰めるため）
function Row({ label, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ ...LABEL, width: 52, flexShrink: 0, marginBottom: 0 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </label>
  )
}

const LABEL = { fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }
const INPUT = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid #D1D5DB', fontSize: 15, outline: 'none',
  boxSizing: 'border-box',
}
const LINK_BTN = { fontSize: 12, color: '#6B7280', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }

function addBtnStyle(disabled) {
  return {
    flex: 1, padding: '9px 6px', borderRadius: 8,
    border: '1px solid #A7F3D0',
    background: disabled ? '#F3F4F6' : 'white',
    fontSize: 14, fontWeight: 600,
    color: disabled ? '#9CA3AF' : '#059669',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

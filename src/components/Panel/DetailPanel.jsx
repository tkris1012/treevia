import { useState, useEffect, useRef } from 'react'
import { X, Camera, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { getRoleStyle, roleStyleFromColor } from '../../constants/roles.js'
import { resizeToBase64 } from '../../lib/imageUtils.js'

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

  const member = selectedId ? members[selectedId] : null

  // 子枠の埋まり具合（追加ボタンの有効/無効判定）
  const children = selectedId
    ? Object.values(members).filter((m) => m.parentId === selectedId)
    : []
  const hasLeft = children.some((m) => m.position === 'left')
  const hasRight = children.some((m) => m.position === 'right')

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [job, setJob]   = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)

  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)

  // Sync form when member changes
  useEffect(() => {
    if (member) {
      setName(member.name || '')
      setRole(member.role || '')
      setJob(member.job || '')
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

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoLoading(true)
    try {
      const base64 = await resizeToBase64(file)
      setPhoto(base64)
      setPhotoPreview(base64)
    } catch {
      alert('写真の処理に失敗しました')
    } finally {
      setPhotoLoading(false)
    }
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
      if (photo !== null) updates.photo = photo || null
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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#1F1F1F' }}>メンバー編集</div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Photo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div
              style={{
                width: 100, height: 100, borderRadius: 10,
                border: `2px solid ${style.border}`,
                overflow: 'hidden', background: '#F0F0F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => fileInputRef.current?.click()}
              title="クリックして写真を選択"
            >
              {photoLoading ? (
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>処理中...</div>
              ) : photoPreview ? (
                <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Camera size={28} strokeWidth={1.5} /></div>
                  <div>タップして追加</div>
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

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', background: 'white', color: '#374151' }}
              >
                写真を選択
              </button>
              {photoPreview && (
                <button
                  onClick={handleRemovePhoto}
                  style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #FCA5A5', borderRadius: 6, cursor: 'pointer', background: 'white', color: '#EF4444' }}
                >
                  削除
                </button>
              )}
            </div>
          </div>

          {/* Name */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>名前 *</div>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
              placeholder="名前を入力"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #D1D5DB', fontSize: 15, outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#7C3AED'}
              onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
            />
          </label>

          {/* Job */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>職業</div>
            <input
              type="text"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="職業を入力（任意）"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #D1D5DB', fontSize: 15, outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => e.target.style.borderColor = '#7C3AED'}
              onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
            />
          </label>

          {/* 役職 */}
          <label style={{ display: 'block', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', flex: 1 }}>役職</div>
              <button
                type="button"
                onClick={openRoleManager}
                style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                役職を管理
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
          </label>

          {/* 操作（スマホでの追加・削除導線） */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #F0F0F0' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>操作</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
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
            </div>
            <button
              onClick={handleDeleteMember}
              style={{
                width: '100%', padding: '10px', borderRadius: 8,
                border: '1px solid #FCA5A5', background: 'white',
                fontSize: 14, cursor: 'pointer', color: '#EF4444', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Trash2 size={15} /> このメンバーを削除
            </button>
          </div>
        </div>

        {/* Footer (編集の保存/キャンセル) */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #F0F0F0', display: 'flex', gap: 10 }}>
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
        padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
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

function addBtnStyle(disabled) {
  return {
    flex: 1, padding: '10px', borderRadius: 8,
    border: '1px solid #A7F3D0',
    background: disabled ? '#F3F4F6' : 'white',
    fontSize: 14, fontWeight: 600,
    color: disabled ? '#9CA3AF' : '#059669',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store/useStore.js'

export default function RenameBookmarkModal({ bookmarkId, initialLabel, onClose }) {
  const renameBookmarkAction = useStore((s) => s.renameBookmarkAction)
  const [label, setLabel] = useState(initialLabel || '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleSubmit(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await renameBookmarkAction(bookmarkId, label.trim() || '無題')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
      />
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(380px, 92vw)',
          background: 'white', borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.30)',
          zIndex: 41, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: '#1F2937' }}>
          ブックマークの名前を変更
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>表示名</label>
        <input
          ref={inputRef}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{
            padding: '10px 12px', borderRadius: 8,
            border: '1px solid #D1D5DB', fontSize: 15, outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => e.target.style.borderColor = '#7C3AED'}
          onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: '1px solid #D1D5DB', background: 'white',
              cursor: 'pointer', fontSize: 14, color: '#374151',
            }}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: 'none', background: '#7C3AED', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </>
  )
}

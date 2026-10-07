import { useState, useRef, useEffect } from 'react'

export default function CreateChartModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onCreate(title.trim() || '新しい組織図')
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
          新しい組織図
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>タイトル</label>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 山田チーム"
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
            {busy ? '作成中...' : '作成'}
          </button>
        </div>
      </form>
    </>
  )
}

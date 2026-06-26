import { useState } from 'react'
import { useStore } from '../../store/useStore.js'
import { auth } from '../../lib/firebase.js'
import { navigateToChart, navigateToList } from '../../store/useSync.js'

// 複製待ちトークンの退避先（未ログイン→ログイン後に複製を再開するため）
export const PENDING_COPY_KEY = 'treevia_pending_copy'

// 複製結果に応じたメッセージ/遷移（ボタンとログイン後再開で共通利用）
export function handleImportResult(res, setPostCopyPrompt) {
  if (res?.ok) {
    setPostCopyPrompt(true)
    navigateToChart(res.newId)
    return
  }
  switch (res?.reason) {
    case 'chart_limit':
      alert('無料プランで持てる組織図は1つまでです。プランをアップグレードすると、もっと作成・複製できます。')
      break
    case 'too_many':
      alert(`この組織図はメンバーが${res.total}人います。無料プランは50人までです。ライト以上のプランにアップグレードすると取り込めます。`)
      break
    case 'not_allowed':
      alert('この組織図は複製が許可されていないか、共有が終了しています。')
      break
    default:
      alert('複製に失敗しました。時間をおいて再度お試しください。')
  }
}

export default function CopySharedChartButton() {
  const importSharedChart = useStore((s) => s.importSharedChart)
  const setPostCopyPrompt = useStore((s) => s.setPostCopyPrompt)
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    const token = new URLSearchParams(window.location.search).get('s')
    if (!token) return
    setBusy(true)
    try {
      const user = auth.currentUser
      if (user) {
        // ログイン済み → そのまま複製
        const res = await importSharedChart(token, user)
        handleImportResult(res, setPostCopyPrompt)
      } else {
        // 未ログイン → トークンを退避してログインへ（認証後に自動で複製を再開）
        try { localStorage.setItem(PENDING_COPY_KEY, token) } catch (_) { /* noop */ }
        navigateToList()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 52, left: 0, right: 0, zIndex: 25,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#7C3AED', color: 'white',
          border: 'none', borderRadius: 999,
          padding: '11px 20px', fontSize: 14, fontWeight: 700,
          boxShadow: '0 6px 20px rgba(124,58,237,0.40)',
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? '複製中…' : '📋 自分用に複製して編集'}
      </button>
    </div>
  )
}

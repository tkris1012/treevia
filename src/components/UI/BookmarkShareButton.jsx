import { useEffect, useState } from 'react'
import { Bookmark, BookmarkCheck, LogIn, X } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { useAuthUser } from '../../lib/useAuthUser.js'
import { navigateToList } from '../../store/useSync.js'
import { getBookmark, addBookmark, getUserPlan, getBookmarkCount } from '../../lib/firestore.js'
import { canAddMoreBookmarks } from '../../constants/plans.js'

const ICON_BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, background: 'white', border: '1px solid #D1D5DB',
  borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.10)', cursor: 'pointer',
  fontSize: 15, color: '#374151', padding: 0, pointerEvents: 'auto', flexShrink: 0,
}

// 初めてブックマークアイコンを見せるときだけ、機能に気づいてもらうための吹き出し。
// 一度閉じる/使うと二度と出さない。
const HINT_SEEN_KEY = 'treevia_bookmark_hint_seen'

function HintBubble({ onDismiss }) {
  return (
    <div style={{
      position: 'absolute', top: '120%', right: 0, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 6,
      background: '#1F2937', color: 'white', fontSize: 12, fontWeight: 600,
      padding: '8px 10px', borderRadius: 8, whiteSpace: 'nowrap',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)', pointerEvents: 'auto',
    }}>
      <div style={{
        position: 'absolute', top: -5, right: 12,
        width: 0, height: 0, borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent', borderBottom: '5px solid #1F2937',
      }} />
      ここでブックマークできます
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, display: 'flex' }}
      >
        <X size={13} />
      </button>
    </div>
  )
}

// 共有（閲覧）ページの組織図ツールバーに表示する、ブックマーク状態のアイコン。
// 未保存なら押して追加できる。保存済みは表示のみ（削除は組織図一覧からのみ行う）。
export default function BookmarkShareButton() {
  const viewerOwnerUid   = useStore((s) => s.viewerOwnerUid)
  const viewerChartId    = useStore((s) => s.viewerChartId)
  const viewerChartTitle = useStore((s) => s.viewerChartTitle)
  const authUser = useAuthUser()

  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!authUser || !viewerOwnerUid || !viewerChartId) { setSaved(false); return }
      try {
        const existing = await getBookmark(authUser.uid, viewerOwnerUid, viewerChartId)
        if (!cancelled) setSaved(!!existing)
      } catch (_) { /* noop */ }
    }
    check()
    return () => { cancelled = true }
  }, [authUser, viewerOwnerUid, viewerChartId])

  // ログイン済み・未保存のときだけ、初回訪問者に機能を気づかせる吹き出しを出す
  useEffect(() => {
    if (!authUser || saved) { setShowHint(false); return }
    try {
      if (!localStorage.getItem(HINT_SEEN_KEY)) setShowHint(true)
    } catch (_) { /* noop */ }
  }, [authUser, saved])

  function dismissHint() {
    setShowHint(false)
    try { localStorage.setItem(HINT_SEEN_KEY, '1') } catch (_) { /* noop */ }
  }

  if (!viewerOwnerUid || !viewerChartId) return null

  if (!authUser) {
    return (
      <button onClick={() => navigateToList()} title="ログインしてブックマーク" style={ICON_BTN}>
        <LogIn size={16} />
      </button>
    )
  }

  if (saved) {
    return (
      <div title="ブックマーク済み（削除は組織図一覧から）"
        style={{ ...ICON_BTN, cursor: 'default', color: '#F59E0B' }}>
        <BookmarkCheck size={17} />
      </div>
    )
  }

  async function handleSave() {
    if (busy) return
    dismissHint()
    setBusy(true)
    try {
      const plan = await getUserPlan(authUser.uid)
      const count = await getBookmarkCount(authUser.uid)
      if (!canAddMoreBookmarks(plan, count)) {
        alert('ブックマークできる件数が上限に達しています。プランをアップグレードすると、もっと保存できます。')
        return
      }
      const token = new URLSearchParams(window.location.search).get('s')
      await addBookmark(authUser.uid, {
        token, ownerUid: viewerOwnerUid, chartId: viewerChartId, label: viewerChartTitle,
      })
      setSaved(true)
    } catch (e) {
      console.error('addBookmark failed', e)
      alert('ブックマークに失敗しました。時間をおいて再度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={handleSave} disabled={busy} title="ブックマークに追加"
        style={{ ...ICON_BTN, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
        <Bookmark size={16} />
      </button>
      {showHint && <HintBubble onDismiss={dismissHint} />}
    </div>
  )
}

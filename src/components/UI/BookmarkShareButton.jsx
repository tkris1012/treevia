import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Bookmark, BookmarkCheck, LogIn } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { auth } from '../../lib/firebase.js'
import { navigateToList } from '../../store/useSync.js'
import {
  getBookmark, addBookmark, removeBookmark,
  getUserPlan, getBookmarkCount,
} from '../../lib/firestore.js'
import { canAddMoreBookmarks } from '../../constants/plans.js'

// 共有（閲覧）ページで、この組織図を自分のアカウントにブックマーク保存するボタン。
// ログインが必要（保存先が自分の users/{uid}/bookmarks のため）。
export default function BookmarkShareButton() {
  const shareConfig       = useStore((s) => s.shareConfig)
  const viewerOwnerUid    = useStore((s) => s.viewerOwnerUid)
  const viewerChartId     = useStore((s) => s.viewerChartId)
  const viewerChartTitle  = useStore((s) => s.viewerChartTitle)

  const [authUser, setAuthUser] = useState(auth.currentUser)
  const [saved, setSaved] = useState(false)
  const [bookmarkDocId, setBookmarkDocId] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => onAuthStateChanged(auth, setAuthUser), [])

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!authUser || !viewerOwnerUid || !viewerChartId) { setSaved(false); setBookmarkDocId(null); return }
      try {
        const existing = await getBookmark(authUser.uid, viewerOwnerUid, viewerChartId)
        if (!cancelled) {
          setSaved(!!existing)
          setBookmarkDocId(existing?.id ?? null)
        }
      } catch (_) { /* noop */ }
    }
    check()
    return () => { cancelled = true }
  }, [authUser, viewerOwnerUid, viewerChartId])

  if (!viewerOwnerUid || !viewerChartId) return null

  const token = new URLSearchParams(window.location.search).get('s')
  const topOffset = shareConfig?.allowCopy ? 108 : 52

  async function handleSave() {
    if (busy || !authUser) return
    setBusy(true)
    try {
      const plan = await getUserPlan(authUser.uid)
      const count = await getBookmarkCount(authUser.uid)
      if (!canAddMoreBookmarks(plan, count)) {
        alert('ブックマークできる件数が上限に達しています。プランをアップグレードすると、もっと保存できます。')
        return
      }
      const id = await addBookmark(authUser.uid, {
        token, ownerUid: viewerOwnerUid, chartId: viewerChartId, label: viewerChartTitle,
      })
      setSaved(true)
      setBookmarkDocId(id)
    } catch (e) {
      console.error('addBookmark failed', e)
      alert('ブックマークに失敗しました。時間をおいて再度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (busy || !authUser || !bookmarkDocId) return
    setBusy(true)
    try {
      await removeBookmark(authUser.uid, bookmarkDocId)
      setSaved(false)
      setBookmarkDocId(null)
    } catch (e) {
      console.error('removeBookmark failed', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: topOffset, left: 0, right: 0, zIndex: 25,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      {!authUser ? (
        <button
          onClick={() => navigateToList()}
          style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'white', color: '#374151',
            border: '1px solid #E5E7EB', borderRadius: 999,
            padding: '10px 18px', fontSize: 13, fontWeight: 700,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)', cursor: 'pointer',
          }}
        >
          <LogIn size={15} /> ログインしてブックマーク
        </button>
      ) : (
        <button
          onClick={saved ? handleRemove : handleSave}
          disabled={busy}
          title={saved ? 'ブックマーク済み（押すと解除）' : 'ブックマークに追加'}
          style={saved ? {
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 999,
            background: 'white', color: '#F59E0B', border: '1px solid #E5E7EB',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          } : {
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#F59E0B', color: 'white', border: 'none',
            borderRadius: 999, padding: '10px 18px', fontSize: 13, fontWeight: 700,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {saved
            ? <BookmarkCheck size={18} />
            : (<><Bookmark size={15} /> ブックマークに追加</>)}
        </button>
      )}
    </div>
  )
}

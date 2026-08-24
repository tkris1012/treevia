import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { useStore } from './store/useStore.js'
import { useSync } from './store/useSync.js'
import { auth } from './lib/firebase.js'
import LoginPage from './components/Auth/LoginPage.jsx'
import OrgTree from './components/Tree/OrgTree.jsx'
import DetailPanel from './components/Panel/DetailPanel.jsx'
import ConfirmDialog from './components/UI/ConfirmDialog.jsx'
import ViewModeBanner from './components/UI/ViewModeBanner.jsx'
import ShareFooterCTA from './components/UI/ShareFooterCTA.jsx'
import UpgradeModal from './components/UI/UpgradeModal.jsx'
import RoleManager from './components/UI/RoleManager.jsx'
import ChartListPage from './components/ChartList/ChartListPage.jsx'
import CopySharedChartButton from './components/UI/CopySharedChartButton.jsx'
import PostCopyShareModal from './components/UI/PostCopyShareModal.jsx'
import BookmarkShareButton from './components/UI/BookmarkShareButton.jsx'

export default function App() {
  const user           = useStore((s) => s.user)
  const viewMode       = useStore((s) => s.viewMode)
  const currentChartId = useStore((s) => s.currentChartId)
  const confirm        = useStore((s) => s.confirm)
  const shareConfig    = useStore((s) => s.shareConfig)

  useSync()

  // 閲覧モード中は useSync() が store.user を更新しないため、ここだけは
  // auth.currentUser を直接購読して「閲覧者自身がログイン済みか」を判定する。
  const [viewerAuthUser, setViewerAuthUser] = useState(auth.currentUser)
  useEffect(() => onAuthStateChanged(auth, setViewerAuthUser), [])

  // 閲覧モード（共有リンクからのアクセス）
  if (viewMode === 'view') {
    // shareConfig は非同期で読み込まれる。読み込み中（null）に true 扱いすると
    // Pro共有（branding:false が届く）で「一瞬表示→消える」チラつきが起きるため、
    // 読み込み完了後（shareConfig が確定してから）だけ判定する。
    // すでにログイン済みの閲覧者（ブックマークで開いた等）には登録誘導のCTAは不要。
    const showCTA = !viewerAuthUser && shareConfig != null && shareConfig.branding !== false
    return (
      <div className="relative w-full h-full">
        <OrgTree />
        <ViewModeBanner />
        {shareConfig?.allowCopy && <CopySharedChartButton />}
        <BookmarkShareButton />
        {showCTA && <ShareFooterCTA />}
        {confirm && <ConfirmDialog />}
      </div>
    )
  }

  // 未ログイン
  if (!user) return <LoginPage />

  // ログイン済み・組織図未選択 → 親画面（リスト）
  if (!currentChartId) {
    return (
      <>
        <ChartListPage />
        {confirm && <ConfirmDialog />}
        <UpgradeModal />
        <RoleManager />
      </>
    )
  }

  // ログイン済み・組織図選択中 → 組織図画面
  return (
    <div className="relative w-full h-full">
      <OrgTree />
      <DetailPanel />
      {confirm && <ConfirmDialog />}
      <UpgradeModal />
      <RoleManager />
      <PostCopyShareModal />
    </div>
  )
}

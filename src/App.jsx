import { useStore } from './store/useStore.js'
import { useSync } from './store/useSync.js'
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

export default function App() {
  const user           = useStore((s) => s.user)
  const viewMode       = useStore((s) => s.viewMode)
  const currentChartId = useStore((s) => s.currentChartId)
  const confirm        = useStore((s) => s.confirm)
  const shareConfig    = useStore((s) => s.shareConfig)

  useSync()

  // 閲覧モード（共有リンクからのアクセス）
  if (viewMode === 'view') {
    // branding が明示的に false（=Pro）のときだけ CTA を隠す
    const showCTA = shareConfig?.branding !== false
    return (
      <div className="relative w-full h-full">
        <OrgTree />
        <ViewModeBanner />
        {shareConfig?.allowCopy && <CopySharedChartButton />}
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

import { useStore } from './store/useStore.js'
import { useSync } from './store/useSync.js'
import LoginPage from './components/Auth/LoginPage.jsx'
import OrgTree from './components/Tree/OrgTree.jsx'
import DetailPanel from './components/Panel/DetailPanel.jsx'
import ConfirmDialog from './components/UI/ConfirmDialog.jsx'
import SyncStatus from './components/UI/SyncStatus.jsx'
import ViewModeBanner from './components/UI/ViewModeBanner.jsx'
import UpgradeModal from './components/UI/UpgradeModal.jsx'
import ChartListPage from './components/ChartList/ChartListPage.jsx'

export default function App() {
  const user           = useStore((s) => s.user)
  const viewMode       = useStore((s) => s.viewMode)
  const currentChartId = useStore((s) => s.currentChartId)
  const confirm        = useStore((s) => s.confirm)

  useSync()

  // 閲覧モード（共有リンクからのアクセス）
  if (viewMode === 'view') {
    return (
      <div className="relative w-full h-full">
        <OrgTree />
        <ViewModeBanner />
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
      </>
    )
  }

  // ログイン済み・組織図選択中 → 組織図画面
  return (
    <div className="relative w-full h-full">
      <OrgTree />
      <DetailPanel />
      <SyncStatus />
      {confirm && <ConfirmDialog />}
      <UpgradeModal />
    </div>
  )
}

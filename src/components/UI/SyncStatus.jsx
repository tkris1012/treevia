import { useState } from 'react'
import { useStore } from '../../store/useStore.js'
import { auth } from '../../lib/firebase.js'
import { signOut } from 'firebase/auth'
import { canUseShare } from '../../constants/plans.js'
import ShareModal from './ShareModal.jsx'

export default function SyncStatus() {
  const syncStatus = useStore((s) => s.syncStatus)
  const user = useStore((s) => s.user)
  const undo = useStore((s) => s.undo)
  const undoStack = useStore((s) => s.undoStack)
  const shareConfig = useStore((s) => s.shareConfig)
  const plan = useStore((s) => s.plan)
  const showUpgrade = useStore((s) => s.showUpgrade)

  const [shareOpen, setShareOpen] = useState(false)

  const isSyncing = syncStatus === 'syncing'
  const isShared  = !!shareConfig?.enabled
  const shareAllowed = canUseShare(plan)

  function handleShareClick() {
    if (shareAllowed) setShareOpen(true)
    else showUpgrade('share')
  }

  return (
    <>
      <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
        {/* Undo */}
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="元に戻す"
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 shadow-sm text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6M3 13C4.5 7.5 9.5 4 15 4c5.5 0 9 4 9 9s-3.5 9-9 9c-3 0-5.5-1-7.5-3"/>
          </svg>
          元に戻す
        </button>

        {/* Share */}
        <button
          onClick={handleShareClick}
          title={shareAllowed ? '共有リンク' : '共有リンク（プロプラン）'}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg shadow-sm text-xs transition border ${
            isShared
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {shareAllowed ? '🔗' : '🔒'} {isShared ? '共有中' : '共有'}
        </button>

        {/* Sync status */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-gray-200 shadow-sm text-xs">
          <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`} />
          <span className="text-gray-600">{isSyncing ? '同期中...' : '同期済み'}</span>
        </div>

        {/* User avatar + logout */}
        {user?.photoURL && (
          <button
            onClick={() => signOut(auth)}
            title="ログアウト"
            className="w-7 h-7 rounded-full overflow-hidden border border-gray-200 shadow-sm hover:opacity-80 transition"
          >
            <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" />
          </button>
        )}
      </div>

      {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
    </>
  )
}

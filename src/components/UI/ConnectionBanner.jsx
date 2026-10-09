import { useStore } from '../../store/useStore.js'
import { retryAllNow } from '../../lib/resilientSubscribe.js'

// 通信が途切れて自動で再接続しているあいだ、画面下部に小さく知らせる（下部ボタンの少し上）
export default function ConnectionBanner() {
  const connState = useStore((s) => s.connState)
  if (connState === 'ok') return null
  const failed = connState === 'failed'
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 52px)', left: '50%', transform: 'translateX(-50%)',
      zIndex: 60, display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
      background: failed ? '#FEF2F2' : 'white', color: failed ? '#B91C1C' : '#374151',
      border: `1px solid ${failed ? '#FECACA' : '#E5E7EB'}`,
      boxShadow: '0 4px 14px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
    }}>
      {!failed && (
        <span style={{
          width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(21,162,74,0.2)',
          borderTopColor: '#15A24A', animation: 'treevia-spin 0.8s linear infinite', flexShrink: 0,
        }} />
      )}
      <style>{'@keyframes treevia-spin { to { transform: rotate(360deg) } }'}</style>
      {failed ? '読み込みに失敗しました（自動で再試行中）' : '再接続中…'}
      {failed && (
        <button
          onClick={() => { retryAllNow(); setTimeout(() => { if (useStore.getState().connState !== 'ok') window.location.reload() }, 4000) }}
          style={{
            border: 'none', background: '#DC2626', color: 'white', borderRadius: 999,
            padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >再読み込み</button>
      )}
    </div>
  )
}

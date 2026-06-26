import { useState } from 'react'
import { useStore } from '../../store/useStore.js'
import ShareModal from './ShareModal.jsx'

// 複製完了直後に「あなたのチームにも共有しよう」と促すナビ。
// 受け取った人を次の発信者にして、バイラルループを下へ伝播させる。
export default function PostCopyShareModal() {
  const postCopyPrompt = useStore((s) => s.postCopyPrompt)
  const setPostCopyPrompt = useStore((s) => s.setPostCopyPrompt)
  const [shareOpen, setShareOpen] = useState(false)

  if (!postCopyPrompt) return null

  // 共有設定を開いたら、このナビ自体は閉じる（ShareModalに引き継ぐ）
  if (shareOpen) {
    return <ShareModal onClose={() => { setShareOpen(false); setPostCopyPrompt(false) }} />
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div
        onClick={() => setPostCopyPrompt(false)}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
      />
      <div style={{
        position: 'relative', background: 'white', borderRadius: 16,
        width: 'min(420px, 94vw)', padding: 28, textAlign: 'center',
        boxShadow: '0 24px 70px rgba(0,0,0,0.30)',
      }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', margin: '8px 0' }}>
          組織図を複製しました！
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7, margin: '0 0 20px' }}>
          自分用にコピーできました。自由に編集できます。<br />
          あなたのチームにも共有して、みんなで使いましょう。
        </p>
        <button
          onClick={() => setShareOpen(true)}
          style={{
            width: '100%', padding: '13px', borderRadius: 10, border: 'none',
            background: '#7C3AED', color: 'white', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
          }}
        >
          🔗 チームに共有する
        </button>
        <button
          onClick={() => setPostCopyPrompt(false)}
          style={{
            width: '100%', padding: '11px', borderRadius: 10, marginTop: 8,
            border: '1px solid #E5E7EB', background: 'white',
            color: '#6B7280', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          あとで
        </button>
      </div>
    </div>
  )
}

import { TreeDeciduous, ArrowRight } from 'lucide-react'

// 共有（閲覧）ページの下部に表示する獲得CTA。
// ダウンライン等の閲覧者が「自分も作りたい」と感じたらそのまま登録できる導線。
// これが Treevia のバイラル成長ループの起点になる。
export default function ShareFooterCTA() {
  // ?s=<token> を除いたアプリのトップ（ログイン/ホーム）へ誘導
  const homeUrl = `${window.location.origin}${window.location.pathname}`

  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
        display: 'flex', justifyContent: 'center',
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: '94vw',
          background: 'white', border: '1px solid #E5E7EB', borderRadius: 999,
          boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
          padding: '8px 8px 8px 16px',
        }}
      >
        <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          <TreeDeciduous size={16} style={{ flexShrink: 0, color: '#15A24A' }} /> この組織図は <strong style={{ color: '#7C3AED' }}>Treevia</strong> で作成
        </span>
        <a
          href={homeUrl}
          style={{
            textDecoration: 'none', whiteSpace: 'nowrap',
            background: '#7C3AED', color: 'white',
            fontSize: 13, fontWeight: 700, borderRadius: 999,
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          無料で作る <ArrowRight size={14} />
        </a>
      </div>
    </div>
  )
}

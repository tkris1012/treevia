import { useStore } from '../../store/useStore.js'
import { PLANS, FREE_MEMBER_LIMIT } from '../../constants/plans.js'

const FEATURE_COPY = {
  members: {
    title: 'メンバー数の上限に達しました',
    body: `無料プランは1組織図あたり${FREE_MEMBER_LIMIT}人までです。ライトプラン以上で人数無制限になります。`,
  },
  charts: {
    title: '組織図をもっと作るには',
    body: '複数の組織図はプロプランでご利用いただけます。',
  },
  share: {
    title: '共有リンクを使うには',
    body: '読み取り専用の共有リンクはプロプランでご利用いただけます。',
  },
  export: {
    title: 'エクスポートを使うには',
    body: 'PDF / 画像でのエクスポートはプロプランでご利用いただけます。',
  },
}

export default function UpgradeModal() {
  const upgrade = useStore((s) => s.upgrade)
  const closeUpgrade = useStore((s) => s.closeUpgrade)
  const plan = useStore((s) => s.plan)

  if (!upgrade) return null
  const copy = FEATURE_COPY[upgrade.feature] || {
    title: 'アップグレードのご案内',
    body: 'この機能は有料プランでご利用いただけます。',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={closeUpgrade}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

      <div style={{
        position: 'relative', background: 'white', borderRadius: 16,
        width: 'min(460px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 70px rgba(0,0,0,0.30)', padding: 28,
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1F2937', margin: '0 0 8px' }}>
          {copy.title}
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7, margin: '0 0 18px' }}>
          {copy.body}
        </p>

        {/* プラン比較 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          <PlanRow name={PLANS.free.name}  price="¥0"    note="1組織図・30人まで" current={plan === 'free'} />
          <PlanRow name={PLANS.light.name} price="¥480"  note="メンバー無制限・写真" current={plan === 'light'} highlight />
          <PlanRow name={PLANS.pro.name}   price="¥980"  note="複数組織図・共有・エクスポート" current={plan === 'pro'} highlight />
        </div>

        <div style={{
          fontSize: 11, color: '#9CA3AF', textAlign: 'center',
          background: '#F9FAFB', borderRadius: 8, padding: '8px 10px', marginBottom: 16,
        }}>
          💳 オンライン決済は準備中です（まもなく開始）
        </div>

        <button
          onClick={closeUpgrade}
          style={{
            width: '100%', padding: '11px', borderRadius: 10, border: 'none',
            background: '#7C3AED', color: 'white', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

function PlanRow({ name, price, note, current, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 10,
      border: `1px solid ${highlight ? '#C4B5FD' : '#E5E7EB'}`,
      background: highlight ? '#FAF5FF' : 'white',
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1F2937', minWidth: 56 }}>{name}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#7C3AED', minWidth: 48 }}>{price}</div>
      <div style={{ flex: 1, fontSize: 11, color: '#6B7280' }}>{note}</div>
      {current && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#059669',
          background: '#ECFDF5', borderRadius: 6, padding: '2px 6px',
        }}>
          利用中
        </span>
      )}
    </div>
  )
}

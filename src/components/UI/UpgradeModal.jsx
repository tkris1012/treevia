import { useState } from 'react'
import { Star, Check, CreditCard } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { auth } from '../../lib/firebase.js'
import { PLANS, PLAN_ORDER, FREE_MEMBER_LIMIT } from '../../constants/plans.js'
import { buildCheckoutUrl, isBillingLive, openBillingPortal } from '../../constants/billing.js'
import Spinner from './Spinner.jsx'

const FEATURE_COPY = {
  members: {
    title: 'メンバー数の上限に達しました',
    body: `無料プランは1組織図あたり${FREE_MEMBER_LIMIT}人までです。ライトは500人、プロは無制限でご利用いただけます。`,
  },
  charts: {
    title: '組織図をもっと作るには',
    body: '作成できる組織図は、無料1つ・ライト5つ・プロ無制限です。上位プランで増やせます。',
  },
  share: {
    title: '共有リンクを使うには',
    body: '読み取り専用の共有リンクは、すべてのプランでご利用いただけます。',
  },
  branding: {
    title: '共有ページの透かしを消すには',
    body: '無料・ライトの共有ページには「Treevia で作成」の案内が表示されます。プロプランにすると非表示にできます。',
  },
  export: {
    title: 'エクスポートを使うには',
    body: 'PDF / 画像でのエクスポートはプロプランでご利用いただけます。',
  },
  print: {
    title: '印刷・PDF出力を使うには',
    body: '自分の組織図の印刷・PDF出力（1枚に収める／大きな組織はポスター分割）は、ライトプラン以上でご利用いただけます。ブックマークした組織図の印刷・PDF出力はプロプランのみです。',
  },
  printBookmark: {
    title: 'ブックマークした組織図を印刷するには',
    body: 'ブックマーク・共有リンクで開いた組織図の印刷・PDF出力は、プロプランでご利用いただけます。',
  },
}

export default function UpgradeModal() {
  const upgrade = useStore((s) => s.upgrade)
  const closeUpgrade = useStore((s) => s.closeUpgrade)
  const plan = useStore((s) => s.plan)
  const planLoaded = useStore((s) => s.planLoaded)
  const user = useStore((s) => s.user)

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
        <div style={{ marginBottom: 8, color: '#F59E0B' }}><Star size={28} fill="#F59E0B" strokeWidth={1} /></div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1F2937', margin: '0 0 8px' }}>
          {copy.title}
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7, margin: '0 0 18px' }}>
          {copy.body}
        </p>

        {/* プラン比較 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          <PlanRow name={PLANS.free.name}  price="¥0"    note="組織図1つ・100人・写真OK・共有可" current={planLoaded && plan === 'free'} />
          <PlanRow name={PLANS.light.name} price="¥380"  note="組織図5つ・500人まで・共有・印刷/PDF（自分の組織図）" current={planLoaded && plan === 'light'} highlight />
          <PlanRow name={PLANS.pro.name}   price="¥980"  note="組織図無制限・人数無制限・透かしなし共有・印刷/PDF（ブックマークも）" current={planLoaded && plan === 'pro'} highlight />
        </div>

        {/* アップグレードボタン（現プランより上のプランのみ）。今のプランが分かるまでは出さない */}
        {planLoaded
          ? <UpgradeButtons plan={plan} user={user} />
          : <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}><Spinner size={22} label="ご利用中のプランを確認しています…" /></div>}

        <button
          onClick={closeUpgrade}
          style={{
            width: '100%', padding: '11px', borderRadius: 10,
            border: '1px solid #E5E7EB', background: 'white',
            color: '#6B7280', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', marginTop: 8,
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

// 現在のプランより上位の有料プランへのアップグレードボタンを並べる
function UpgradeButtons({ plan, user }) {
  const [busy, setBusy] = useState(false)
  const currentIdx = PLAN_ORDER.indexOf(plan)
  const targets = PLAN_ORDER.filter(
    (p, i) => i > currentIdx && p !== 'free',
  )

  if (targets.length === 0) {
    return (
      <div style={{
        fontSize: 12, color: '#059669', textAlign: 'center',
        background: '#ECFDF5', borderRadius: 8, padding: '10px', marginBottom: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}>
        <Check size={14} /> 最上位プランをご利用中です
      </div>
    )
  }

  // 本番決済が未開放の間は「準備中」表示にする
  if (!isBillingLive()) {
    return (
      <div style={{
        fontSize: 12, color: '#9CA3AF', textAlign: 'center',
        background: '#F9FAFB', borderRadius: 8, padding: '10px', marginBottom: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}>
        <CreditCard size={14} /> オンライン決済は準備中です（まもなく開始）
      </div>
    )
  }

  function startCheckout(target) {
    const url = buildCheckoutUrl(target, user)
    if (!url) {
      alert('オンライン決済は準備中です。もう少々お待ちください。')
      return
    }
    // Stripe のホスト型決済ページへ遷移
    window.location.href = url
  }

  // ライト → プロは、新しく購入すると今のライトと二重に課金されてしまうため、
  // 今のサブスクをプロに切り替える確認画面（Stripe）を開く
  async function switchToPro() {
    setBusy(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      await openBillingPortal(idToken, { flow: 'upgrade_pro' }) // 成功時は確認画面へ遷移
    } catch (e) {
      console.error('プロへの切り替え画面を開けませんでした:', e)
      const code = e?.message || ''
      if (code.includes('no_customer') || code.includes('no_subscription')) {
        // オンライン決済のサブスクがない（手動で付与されたライトなど）→ 通常の購入へ
        startCheckout('pro')
        return
      }
      if (code.includes('already_pro')) {
        alert('すでにプロプランへの切り替えが完了しています。反映まで少しお待ちいただき、画面を再読み込みしてください。')
      } else if (code.includes('unauthenticated') || code.includes('invalid_token')) {
        alert('ログイン情報の有効期限が切れている可能性があります。一度ログアウトして再ログイン後にお試しください。')
      } else {
        alert('プロへの切り替え画面を開けませんでした。時間をおいて再度お試しいただくか、メニューの「プラン管理」からお手続きください。')
      }
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
      {targets.map((target) => {
        const isSwitch = plan === 'light' && target === 'pro'
        return (
          <button
            key={target}
            disabled={busy}
            onClick={() => (isSwitch ? switchToPro() : startCheckout(target))}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: target === 'pro' ? '#7C3AED' : '#8B5CF6',
              color: 'white', fontSize: 14, fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {isSwitch && busy
              ? '切り替え画面を開いています…'
              : `${PLANS[target].name}にアップグレード（¥${PLANS[target].price}/月）`}
          </button>
        )
      })}
      {plan === 'light' && targets.includes('pro') && (
        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6, textAlign: 'center' }}>
          今のライトプランがプロに切り替わります（二重に請求されません）。<br />
          今月の残り日数分の差額は日割りで精算されます。
        </div>
      )}
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

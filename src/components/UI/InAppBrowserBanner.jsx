import { AlertTriangle } from 'lucide-react'
import { getInAppBrowserName } from '../../lib/inAppBrowser.js'

// LINEなどのアプリ内ブラウザから開いた場合、ログイン・複製が失敗しがちなので
// Safari/Chromeで開き直すよう案内する。該当しない場合は何も表示しない。
export default function InAppBrowserBanner() {
  const name = getInAppBrowserName()
  if (!name) return null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
        padding: '10px 12px', fontSize: 12.5, color: '#92400E', lineHeight: 1.6,
        width: '100%', boxSizing: 'border-box',
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <strong>{name}のアプリ内ブラウザ</strong>ではログイン・複製がうまくいかない場合があります。
        メニューから「他のブラウザで開く」を選んで、Safari／Chromeで開き直してください。
      </div>
    </div>
  )
}

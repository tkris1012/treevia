// LINE・Instagram・Facebook・X(旧Twitter)・KakaoTalk などの「アプリ内ブラウザ」を検知する。
// これらはGoogleログインのポップアップがブロックされたり、ストレージ制限で
// 複製フロー（未ログイン時にlocalStorageへ一時保存する仕組み）が失敗したりすることがある。
const PATTERNS = [
  { name: 'LINE', re: /\bLine\// },
  { name: 'Instagram', re: /\bInstagram\b/ },
  { name: 'Facebook', re: /FBAN|FBAV/ },
  { name: 'X(旧Twitter)', re: /\bTwitter\b/ },
  { name: 'KakaoTalk', re: /KAKAOTALK/i },
]

export function getInAppBrowserName(ua) {
  const target = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  const hit = PATTERNS.find((p) => p.re.test(target))
  return hit ? hit.name : null
}

export function isInAppBrowser(ua) {
  return !!getInAppBrowserName(ua)
}

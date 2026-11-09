import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// デプロイ更新で古いJSチャンクが消え、動的importが失敗した場合は一度だけ自動リロード。
// （キャッシュ由来の白画面対策。無限ループ防止にセッション内で1回だけ）
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('reloadedOnChunkError')) {
    sessionStorage.setItem('reloadedOnChunkError', '1')
    window.location.reload()
  }
})

// iPhone の Safari はビューポートの拡大禁止を無視してピンチで画面ごと拡大できてしまう。
// 組織図の拡大縮小はアプリ側（タッチ操作）で行うので、ブラウザの画面拡大は止めておく
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

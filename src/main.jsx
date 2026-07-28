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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

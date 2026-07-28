import { Component } from 'react'

// 描画中に例外が起きても真っ白にせず、再読み込み導線を出す受け皿。
// 併せてエラーをコンソールへ出し、原因調査を可能にする。
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 原因調査用（ブラウザのコンソールに残る）
    console.error('App crashed:', error, info?.componentStack)
  }

  handleReload = () => {
    // キャッシュ由来の場合も考慮してリロード
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center', gap: 14,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif',
          background: '#F9FAFB', color: '#1F2937',
        }}>
          <div style={{ fontSize: 40 }}>🌳</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            画面の読み込みでエラーが発生しました
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7, maxWidth: 320 }}>
            一時的な問題の可能性があります。<br />
            下のボタンで再読み込みしてください。
          </div>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: 6, padding: '11px 22px', borderRadius: 10, border: 'none',
              background: '#7C3AED', color: 'white', fontSize: 15, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            再読み込み
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

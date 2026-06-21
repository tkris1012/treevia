import { useState } from 'react'
import { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword } from '../../lib/auth.js'
import logoUrl from '../../../CB331C5D-F5CD-452E-BD4F-02F8A307A4C7.png'

function authErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':        return 'メールアドレスの形式が正しくありません。'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':   return 'メールアドレスまたはパスワードが違います。'
    case 'auth/email-already-in-use': return 'このメールアドレスは既に登録されています。'
    case 'auth/weak-password':        return 'パスワードは6文字以上にしてください。'
    case 'auth/too-many-requests':    return '試行回数が多すぎます。しばらく待ってからお試しください。'
    case 'auth/operation-not-allowed':return 'メール認証が有効になっていません（管理者に連絡してください）。'
    default:                          return 'エラーが発生しました。時間をおいて再度お試しください。'
  }
}

export default function LoginPage() {
  const [mode, setMode]       = useState('login') // 'login' | 'register'
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [notice, setNotice]   = useState('')
  const [loading, setLoading] = useState(false)

  const isRegister = mode === 'register'

  const handleGoogle = async () => {
    setError(''); setNotice('')
    try {
      await signInWithGoogle()
    } catch (e) {
      console.error('Googleログイン失敗:', e)
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        setError('Googleログインに失敗しました。')
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setNotice('')
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。')
      return
    }
    if (isRegister && password.length < 6) {
      setError('パスワードは6文字以上にしてください。')
      return
    }
    setLoading(true)
    try {
      if (isRegister) {
        await registerWithEmail({ email, password, displayName: name })
      } else {
        await signInWithEmail(email, password)
      }
      // 成功すると onAuthStateChanged で自動的に画面が切り替わる
    } catch (err) {
      console.error('メール認証失敗:', err)
      setError(authErrorMessage(err?.code))
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    setError(''); setNotice('')
    if (!email.trim()) {
      setError('パスワード再設定にはメールアドレスを入力してください。')
      return
    }
    try {
      await resetPassword(email)
      setNotice('パスワード再設定用のメールを送信しました。受信箱をご確認ください。')
    } catch (err) {
      console.error('パスワード再設定失敗:', err)
      setError(authErrorMessage(err?.code))
    }
  }

  const switchMode = (next) => {
    setMode(next); setError(''); setNotice('')
  }

  return (
    <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-violet-50 to-violet-100 p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-5 w-full max-w-sm my-auto">
        {/* Logo */}
        <img src={logoUrl} alt="Treevia" className="w-full max-w-[260px] h-auto" />

        {/* Google */}
        <button
          onClick={handleGoogle}
          className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm w-full justify-center"
        >
          <GoogleIcon />
          Googleでログイン
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">または メールアドレスで</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Tabs */}
        <div className="flex w-full bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isRegister ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isRegister ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}
          >
            新規登録
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
          {isRegister && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="お名前（任意）"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-violet-500"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            autoComplete="email"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-violet-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'パスワード（6文字以上）' : 'パスワード'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-violet-500"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}
          {notice && <p className="text-xs text-green-600">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-all disabled:opacity-60"
          >
            {loading ? '処理中...' : isRegister ? '登録してログイン' : 'ログイン'}
          </button>
        </form>

        {!isRegister && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-violet-600 transition-colors"
          >
            パスワードを忘れた方
          </button>
        )}

        <p className="text-xs text-gray-400 text-center">
          ログインすることで、複数端末から<br />同じデータにアクセスできます。
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

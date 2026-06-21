import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from './firebase.js'
import { useStore } from '../store/useStore.js'

// === ログイン履歴（この端末/ブラウザのみ・localStorage）=====
const RECENT_KEY = 'mlm_recent_accounts'
const MAX_RECENT = 5

export function getRecentAccounts() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function recordAccount(user) {
  if (!user) return
  const entry = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    lastLogin: Date.now(),
  }
  const list = [entry, ...getRecentAccounts().filter((a) => a.uid !== user.uid)]
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
  } catch { /* localStorage 不可環境は無視 */ }
}

export function removeRecentAccount(uid) {
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(getRecentAccounts().filter((a) => a.uid !== uid)),
    )
  } catch { /* noop */ }
}

// === Google 認証 =============================================
// Firebase Web SDK は同時に1アカウントしか保持できないため、
// 「切替」は signOut → signIn の再認証で実現する。
function buildProvider({ loginHint, forceSelect } = {}) {
  const provider = new GoogleAuthProvider()
  const params = {}
  if (loginHint) params.login_hint = loginHint
  // ヒントが無い（＝アカウント追加）場合はアカウント選択画面を強制
  if (forceSelect || !loginHint) params.prompt = 'select_account'
  provider.setCustomParameters(params)
  return provider
}

export async function signInWithGoogle(opts) {
  return signInWithPopup(auth, buildProvider(opts))
}

export async function logout() {
  return signOut(auth)
}

// email を渡すとそのアカウントを Google 側で自動選択（セッションが生きていれば無入力で切替）
// email 省略時はアカウント選択画面を出して別アカウントを追加
export async function switchAccount(email) {
  await signOut(auth)
  return signInWithPopup(auth, buildProvider({ loginHint: email, forceSelect: !email }))
}

// === メールアドレス認証（Gmail を持たないユーザー向け）=========
export async function registerWithEmail({ email, password, displayName }) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  const name = displayName?.trim()
  if (name) {
    await updateProfile(cred.user, { displayName: name })
    // updateProfile では onAuthStateChanged が再発火しないため、表示用に手動反映
    const u = auth.currentUser
    useStore.getState().setUser({
      uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL,
    })
    recordAccount(u)
  }
  return cred
}

export async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim())
}

import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase.js'

// 閲覧モード中は useSync() が store.user を更新しないため、
// 「今ブラウザでログインしている本人」を直接知りたい場面で使う。
export function useAuthUser() {
  const [user, setUser] = useState(auth.currentUser)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

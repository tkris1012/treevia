import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Eye, ArrowLeft } from 'lucide-react'
import { auth } from '../../lib/firebase.js'
import { navigateToList } from '../../store/useSync.js'

export default function ViewModeBanner() {
  const [authUser, setAuthUser] = useState(auth.currentUser)
  useEffect(() => onAuthStateChanged(auth, setAuthUser), [])

  return (
    <>
      {authUser && (
        <button
          onClick={() => navigateToList()}
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            background: 'white', color: '#374151',
            border: '1px solid #E5E7EB',
            fontSize: 12, fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} /> 一覧に戻る
        </button>
      )}
      <div
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(31, 41, 55, 0.85)', color: 'white',
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.20)',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}
      >
        <Eye size={14} /> 閲覧モード
      </div>
    </>
  )
}

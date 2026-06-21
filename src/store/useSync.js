import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'
import { useStore } from './useStore.js'
import {
  migrateLegacyDataIfNeeded,
  subscribeCharts,
  subscribeUserPlan,
  getShareTokenInfo,
  getShareConfig,
  subscribePublicMembers,
  subscribeShareConfig,
} from '../lib/firestore.js'
import { recordAccount } from '../lib/auth.js'

function readURL() {
  const params = new URLSearchParams(window.location.search)
  return {
    shareToken: params.get('s'),
    chartId:    params.get('c'),
  }
}

// URLを書き換える（履歴を追加）
export function navigateToChart(chartId) {
  const url = new URL(window.location.href)
  url.searchParams.set('c', chartId)
  url.searchParams.delete('s')
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToList() {
  const url = new URL(window.location.href)
  url.searchParams.delete('c')
  url.searchParams.delete('s')
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useSync() {
  const setUser            = useStore((s) => s.setUser)
  const setMembers         = useStore((s) => s.setMembers)
  const setCharts          = useStore((s) => s.setCharts)
  const setCurrentChartId  = useStore((s) => s.setCurrentChartId)
  const setViewMode        = useStore((s) => s.setViewMode)
  const setShareConfig     = useStore((s) => s.setShareConfig)
  const setViewerChartTitle = useStore((s) => s.setViewerChartTitle)
  const setPlan            = useStore((s) => s.setPlan)

  // ----- 1. 認証 + 組織図リストの購読、URL 解釈 -----
  useEffect(() => {
    let unsubCharts = null
    let unsubPlan = null
    let viewerCleanup = null

    async function startShareView(token) {
      setViewMode('view')
      try {
        const tokenInfo = await getShareTokenInfo(token)
        if (!tokenInfo) { setMembers({}); console.warn('Share token not found'); return }
        const { uid, chartId } = tokenInfo
        if (!chartId) { setMembers({}); console.warn('Token has no chartId'); return }
        const cfg = await getShareConfig(uid, chartId)
        if (!cfg?.enabled) { setMembers({}); console.warn('Share is disabled'); return }
        // chart のタイトルも取得（公開設定が有効ならルール上 chart 本体は読めない場合もあるので失敗OK）
        try {
          const chartSnap = await getDoc(doc(db, 'users', uid, 'charts', chartId))
          if (chartSnap.exists()) setViewerChartTitle(chartSnap.data().title || null)
        } catch (_) { setViewerChartTitle(null) }
        const unsubMembers = subscribePublicMembers(uid, chartId, setMembers)
        viewerCleanup = () => unsubMembers()
      } catch (e) {
        console.error('Share view init failed', e)
      }
    }

    function startOwnerMode() {
      setViewMode('owner')
      // auth subscription
      const unsubAuth = onAuthStateChanged(auth, async (user) => {
        setUser(user)
        if (unsubCharts) { unsubCharts(); unsubCharts = null }
        if (unsubPlan)   { unsubPlan();   unsubPlan = null }
        if (!user) {
          setCharts([])
          setMembers({})
          setPlan('free')
          return
        }
        // ログイン履歴に記録（この端末のみ・アカウント切替メニュー用）
        recordAccount(user)
        // 自動移行（旧スキーマ → 新スキーマ）
        try { await migrateLegacyDataIfNeeded(user.uid) } catch (e) { console.warn('migrate skipped', e) }
        // 組織図リストとプランを購読
        unsubCharts = subscribeCharts(user.uid, setCharts)
        unsubPlan   = subscribeUserPlan(user.uid, setPlan)
      })
      return unsubAuth
    }

    let unsubAuth = null

    function applyURL() {
      const { shareToken } = readURL()
      // 切替時はクリーンアップ
      if (viewerCleanup) { viewerCleanup(); viewerCleanup = null }
      if (unsubAuth)     { unsubAuth();     unsubAuth = null }
      if (unsubCharts)   { unsubCharts();   unsubCharts = null }
      if (unsubPlan)     { unsubPlan();     unsubPlan = null }

      if (shareToken) {
        startShareView(shareToken)
      } else {
        unsubAuth = startOwnerMode()
      }
    }

    applyURL()
    window.addEventListener('popstate', applyURL)

    return () => {
      window.removeEventListener('popstate', applyURL)
      if (viewerCleanup) viewerCleanup()
      if (unsubAuth)     unsubAuth()
      if (unsubCharts)   unsubCharts()
      if (unsubPlan)     unsubPlan()
    }
  }, [setUser, setMembers, setCharts, setViewMode, setViewerChartTitle, setPlan])

  // ----- 2. URLの ?c=<chartId> を store の currentChartId に反映 -----
  useEffect(() => {
    function applyChartId() {
      const { chartId, shareToken } = readURL()
      if (shareToken) return // share view では currentChartId は使わない
      setCurrentChartId(chartId || null)
    }
    applyChartId()
    window.addEventListener('popstate', applyChartId)
    return () => window.removeEventListener('popstate', applyChartId)
  }, [setCurrentChartId])

  // ----- 3. currentChartId が決まったら、その chart のメンバー＆共有設定を購読 -----
  const user = useStore((s) => s.user)
  const currentChartId = useStore((s) => s.currentChartId)
  const viewMode = useStore((s) => s.viewMode)
  useEffect(() => {
    if (viewMode === 'view') return
    if (!user || !currentChartId) {
      setMembers({})
      setShareConfig(null)
      return
    }
    const unsubMembers = onSnapshot(
      collection(db, 'users', user.uid, 'charts', currentChartId, 'members'),
      (snap) => {
        const map = {}
        snap.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } })
        setMembers(map)
      }
    )
    const unsubShare = subscribeShareConfig(user.uid, currentChartId, (cfg) => {
      setShareConfig(cfg ?? { enabled: false, token: null })
    })
    return () => {
      unsubMembers()
      unsubShare()
    }
  }, [user, currentChartId, viewMode, setMembers, setShareConfig])
}

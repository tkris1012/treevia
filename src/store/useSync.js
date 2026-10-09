import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'
import { useStore } from './useStore.js'
import {
  migrateLegacyDataIfNeeded,
  subscribeCharts,
  subscribeUserPlan,
  subscribeUserRoles,
  seedDefaultRolesIfNeeded,
  getShareTokenInfo,
  getShareConfig,
  getUserRoles,
  subscribePublicMembers,
  subscribeShareConfig,
  subscribeBookmarks,
  subscribeMembers,
} from '../lib/firestore.js'
import { resilientSubscribe, retryingTask } from '../lib/resilientSubscribe.js'
import { recordAccount } from '../lib/auth.js'
import { DEFAULT_ROLES } from '../constants/roles.js'
import { FREE_MEMBER_LIMIT } from '../constants/plans.js'

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

// ブックマークした共有リンクを開く
export function navigateToSharedView(token) {
  const url = new URL(window.location.href)
  url.searchParams.set('s', token)
  url.searchParams.delete('c')
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// 「端末に保存したデータだけ・しかも0件」のときは、サーバーの返事を待つ（まだ読み込み中）
const loadedFrom = (size, meta) => !meta?.fromCache || size > 0

// 旧データの移行と標準役職の登録は、ログインしたユーザーごとに1回だけ確認する
const setupDone = new Set()

export function useSync() {
  const setUser            = useStore((s) => s.setUser)
  const setAuthReady       = useStore((s) => s.setAuthReady)
  const setMembers         = useStore((s) => s.setMembers)
  const setMembersLoaded   = useStore((s) => s.setMembersLoaded)
  const setCharts          = useStore((s) => s.setCharts)
  const setChartsLoaded    = useStore((s) => s.setChartsLoaded)
  const setCurrentChartId  = useStore((s) => s.setCurrentChartId)
  const setViewMode        = useStore((s) => s.setViewMode)
  const setShareConfig     = useStore((s) => s.setShareConfig)
  const setViewerChartTitle = useStore((s) => s.setViewerChartTitle)
  const setViewerOwnerUid  = useStore((s) => s.setViewerOwnerUid)
  const setViewerChartId   = useStore((s) => s.setViewerChartId)
  const setPlan            = useStore((s) => s.setPlan)
  const setRoles           = useStore((s) => s.setRoles)
  const setBookmarks       = useStore((s) => s.setBookmarks)
  const setBookmarksLoaded = useStore((s) => s.setBookmarksLoaded)

  // ----- 1. 認証 + 組織図リストの購読、URL 解釈 -----
  // 画面遷移（?c= の付け外し）では購読をやり直さない。やり直すのは
  // 「共有リンクの閲覧」と「自分の組織図」を行き来したときだけ。
  useEffect(() => {
    let mode = null          // 'owner' | 'view:<token>'
    let ownerSubs = []       // ログイン中ユーザーの購読
    let viewerSubs = []      // 共有閲覧の購読・初期化処理
    let unsubAuth = null
    let authGen = 0          // ログイン状態が変わるたびに増やし、古い非同期処理を無効にする

    const stopAll = (list) => { list.forEach((x) => x.stop()); list.length = 0 }

    function startShareView(token) {
      setViewMode('view')
      setMembers({})
      setMembersLoaded(false)
      const task = retryingTask('share-view', async (isStopped) => {
        const tokenInfo = await getShareTokenInfo(token)
        if (isStopped()) return
        if (!tokenInfo?.chartId) {
          setMembers({}); setMembersLoaded(true); console.warn('Share token not found'); return
        }
        const { uid, chartId } = tokenInfo
        const cfg = await getShareConfig(uid, chartId)
        if (isStopped()) return
        if (!cfg?.enabled) { setMembers({}); setMembersLoaded(true); console.warn('Share is disabled'); return }
        setShareConfig(cfg) // 閲覧モードでも branding 判定に使う
        setViewerOwnerUid(uid)
        setViewerChartId(chartId)
        // オーナーの役職定義を読み込み、共有閲覧ページでも色・名称を正しく表示する
        try { setRoles(await getUserRoles(uid)) } catch (_) { setRoles([]) }
        // chart のタイトルも取得（公開設定が有効ならルール上 chart 本体は読めない場合もあるので失敗OK）
        try {
          const chartSnap = await getDoc(doc(db, 'users', uid, 'charts', chartId))
          if (chartSnap.exists()) setViewerChartTitle(chartSnap.data().title || null)
        } catch (_) { setViewerChartTitle(null) }
        if (isStopped()) return
        viewerSubs.push(resilientSubscribe({
          name: 'shared-members',
          subscribe: (ok, err) => subscribePublicMembers(uid, chartId, ok, err),
          onData: (map, meta) => {
            setMembers(map)
            if (loadedFrom(Object.keys(map).length, meta)) setMembersLoaded(true)
          },
          isReady: (map, meta) => loadedFrom(Object.keys(map).length, meta),
        }))
      })
      viewerSubs.push(task)
    }

    async function setupAccount(user, gen) {
      if (setupDone.has(user.uid)) return
      setupDone.add(user.uid)
      // 自動移行（旧スキーマ → 新スキーマ）。移行で作られた組織図は購読中のリストに自動で出る
      try { await migrateLegacyDataIfNeeded(user.uid) } catch (e) { console.warn('migrate skipped', e); setupDone.delete(user.uid) }
      // 既存アカウントにデフォルト役職をseed（新規は空のまま）
      try { await seedDefaultRolesIfNeeded(user.uid, DEFAULT_ROLES) } catch (e) { console.warn('role seed skipped', e) }
      if (gen !== authGen) return
      // 未ログイン状態で共有ページの「自分用に複製」を押した場合、
      // ログイン後にここで複製を自動再開する。
      try {
        const pending = localStorage.getItem('treevia_pending_copy')
        if (pending) {
          localStorage.removeItem('treevia_pending_copy')
          const store = useStore.getState()
          const res = await store.importSharedChart(pending, user)
          if (res?.ok) {
            store.setPostCopyPrompt(true)
            navigateToChart(res.newId)
          } else if (res?.reason === 'chart_limit') {
            alert('無料プランで持てる組織図は1つまでです。プランをアップグレードすると、もっと作成・複製できます。')
          } else if (res?.reason === 'too_many') {
            alert(`この組織図はメンバーが${res.total}人います。無料プランは${FREE_MEMBER_LIMIT}人までです。ライト以上のプランにアップグレードすると取り込めます。`)
          } else if (res?.reason === 'not_allowed') {
            alert('この組織図は複製が許可されていないか、共有が終了しています。')
          } else {
            alert('複製に失敗しました。時間をおいて再度お試しください。')
          }
        }
      } catch (e) { console.warn('pending copy resume failed', e) }
    }

    function startOwnerMode() {
      setViewMode('owner')
      unsubAuth = onAuthStateChanged(auth, (user) => {
        const gen = ++authGen
        stopAll(ownerSubs)
        setUser(user)
        setAuthReady(true)
        if (!user) {
          setCharts([])
          setMembers({})
          setPlan('free')
          setRoles([])
          setBookmarks([])
          setChartsLoaded(true)
          setBookmarksLoaded(true)
          return
        }
        // ログイン履歴に記録（この端末のみ・アカウント切替メニュー用）
        recordAccount(user)
        setChartsLoaded(false)
        setBookmarksLoaded(false)
        // 組織図リスト・プラン・役職・ブックマークをすぐ購読する（移行の確認は待たない）
        ownerSubs.push(resilientSubscribe({
          name: 'charts',
          subscribe: (ok, err) => subscribeCharts(user.uid, ok, err),
          onData: (list, meta) => { setCharts(list); if (loadedFrom(list.length, meta)) setChartsLoaded(true) },
          isReady: (list, meta) => loadedFrom(list.length, meta),
        }))
        ownerSubs.push(resilientSubscribe({
          name: 'bookmarks',
          subscribe: (ok, err) => subscribeBookmarks(user.uid, ok, err),
          onData: (list, meta) => { setBookmarks(list); if (loadedFrom(list.length, meta)) setBookmarksLoaded(true) },
          isReady: (list, meta) => loadedFrom(list.length, meta),
        }))
        ownerSubs.push(resilientSubscribe({
          name: 'plan',
          subscribe: (ok, err) => subscribeUserPlan(user.uid, ok, err),
          onData: setPlan,
        }))
        ownerSubs.push(resilientSubscribe({
          name: 'roles',
          subscribe: (ok, err) => subscribeUserRoles(user.uid, ok, err),
          onData: setRoles,
        }))
        setupAccount(user, gen)
      })
    }

    function applyURL() {
      const { shareToken } = readURL()
      const next = shareToken ? `view:${shareToken}` : 'owner'
      if (next === mode) return // 同じモード内の画面遷移では購読を維持する
      mode = next
      stopAll(viewerSubs)
      stopAll(ownerSubs)
      if (unsubAuth) { unsubAuth(); unsubAuth = null }
      authGen++
      if (shareToken) startShareView(shareToken)
      else startOwnerMode()
    }

    applyURL()
    window.addEventListener('popstate', applyURL)

    return () => {
      window.removeEventListener('popstate', applyURL)
      stopAll(viewerSubs)
      stopAll(ownerSubs)
      if (unsubAuth) unsubAuth()
      authGen++
    }
  }, [setUser, setAuthReady, setMembers, setMembersLoaded, setCharts, setChartsLoaded, setViewMode, setShareConfig,
    setViewerChartTitle, setViewerOwnerUid, setViewerChartId, setPlan, setRoles, setBookmarks, setBookmarksLoaded])

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
  const uid = useStore((s) => s.user?.uid)
  const currentChartId = useStore((s) => s.currentChartId)
  const viewMode = useStore((s) => s.viewMode)
  useEffect(() => {
    if (viewMode === 'view') return
    if (!uid || !currentChartId) {
      setMembers({})
      setShareConfig(null)
      return
    }
    // 前の組織図のメンバーが一瞬残らないように、切り替えた時点で空にして読み込み中にする
    setMembers({})
    setMembersLoaded(false)
    const members = resilientSubscribe({
      name: 'members',
      subscribe: (ok, err) => subscribeMembers(uid, currentChartId, ok, err),
      onData: (map, meta) => {
        setMembers(map)
        if (loadedFrom(Object.keys(map).length, meta)) setMembersLoaded(true)
      },
      isReady: (map, meta) => loadedFrom(Object.keys(map).length, meta),
    })
    const share = resilientSubscribe({
      name: 'share-config',
      subscribe: (ok, err) => subscribeShareConfig(uid, currentChartId, ok, err),
      onData: (cfg) => setShareConfig(cfg ?? { enabled: false, token: null }),
    })
    return () => {
      members.stop()
      share.stop()
    }
  }, [uid, currentChartId, viewMode, setMembers, setMembersLoaded, setShareConfig])
}

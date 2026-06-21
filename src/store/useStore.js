import { create } from 'zustand'
import {
  addMember, updateMember, deleteMember, deleteMembers, restoreMember,
  createChart, renameChart, deleteChart,
} from '../lib/firestore.js'
import { undoLimit, canAddMoreMembers } from '../constants/plans.js'

// 子孫IDを全取得
function collectDescendants(members, rootId) {
  const result = []
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()
    const children = Object.values(members).filter((m) => m.parentId === id)
    for (const c of children) {
      result.push(c.id)
      queue.push(c.id)
    }
  }
  return result
}

export const useStore = create((set, get) => ({
  // --- Auth ---
  user: null,
  setUser: (user) => set({ user }),

  // --- Plan（料金プラン） ---
  plan: 'free',                        // 'free' | 'light' | 'pro'
  setPlan: (plan) => set({ plan: plan || 'free' }),

  // --- Upgrade Prompt（有料機能のロック表示） ---
  upgrade: null,                       // { feature } | null
  showUpgrade: (feature) => set({ upgrade: { feature } }),
  closeUpgrade: () => set({ upgrade: null }),

  // --- Charts (組織図リスト) ---
  charts: [],                          // [{ id, title, createdAt, updatedAt }]
  setCharts: (charts) => set({ charts }),
  currentChartId: null,                // 表示中の組織図ID（null = リスト画面）
  setCurrentChartId: (id) => set({ currentChartId: id, undoStack: [] }),

  // --- Members（現在の組織図のメンバー） ---
  members: {},
  setMembers: (members) => set({ members }),

  // --- UI State ---
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),

  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),

  dragState: null,
  setDragState: (s) => set({ dragState: s }),

  // --- Sync Status ---
  syncStatus: 'synced',
  setSyncStatus: (s) => set({ syncStatus: s }),

  // --- Filter ---
  roleFilter: 'ALL',
  setRoleFilter: (f) => set({ roleFilter: f }),

  // --- View Mode ---
  viewMode: 'owner',                   // 'owner' | 'view'
  setViewMode: (m) => set({ viewMode: m }),
  viewerName: null,
  setViewerName: (n) => set({ viewerName: n }),
  viewerChartTitle: null,              // 閲覧モード時の組織図タイトル
  setViewerChartTitle: (t) => set({ viewerChartTitle: t }),

  // --- Share ---
  shareConfig: null,                   // { enabled, token } | null
  setShareConfig: (c) => set({ shareConfig: c }),

  viewerCollapse: {},
  setViewerCollapse: (id, v) => set((s) => ({
    viewerCollapse: { ...s.viewerCollapse, [id]: v },
  })),

  // --- Confirm Dialog ---
  confirm: null,
  showConfirm: (message, onOk) => set({ confirm: { message, onOk } }),
  closeConfirm: () => set({ confirm: null }),

  // --- Undo Stack ---
  undoStack: [],
  pushUndo: () => {
    const { members, undoStack, plan } = get()
    const snapshot = JSON.parse(JSON.stringify(members))
    const next = [snapshot, ...undoStack].slice(0, undoLimit(plan))
    set({ undoStack: next })
  },
  undo: async () => {
    const { undoStack, user, currentChartId, setSyncStatus } = get()
    if (!undoStack.length || !user || !currentChartId) return

    const [prev, ...rest] = undoStack
    const current = get().members

    set({ undoStack: rest, members: prev })

    setSyncStatus('syncing')
    try {
      const prevIds = new Set(Object.keys(prev))
      const curIds  = new Set(Object.keys(current))

      const toAdd    = [...prevIds].filter((id) => !curIds.has(id))
      const toDelete = [...curIds].filter((id) => !prevIds.has(id))
      const toUpdate = [...prevIds].filter((id) => curIds.has(id))

      await Promise.all([
        ...toAdd.map((id) => {
          const { id: _id, ...data } = prev[id]
          return restoreMember(user.uid, currentChartId, id, data)
        }),
        ...toDelete.map((id) => deleteMember(user.uid, currentChartId, id)),
        ...toUpdate.map((id) => {
          const { id: _id, ...data } = prev[id]
          return updateMember(user.uid, currentChartId, id, data)
        }),
      ])
    } catch (e) {
      console.error('undo failed', e)
    } finally {
      setSyncStatus('synced')
    }
  },

  // --- Chart Actions ---

  createNewChart: async (title) => {
    const { user, setSyncStatus } = get()
    if (!user) return null
    setSyncStatus('syncing')
    try {
      const id = await createChart(user.uid, title?.trim() || '新しい組織図')
      return id
    } catch (e) {
      console.error('createChart failed', e)
      return null
    } finally {
      setSyncStatus('synced')
    }
  },

  renameCurrentChart: async (chartId, title) => {
    const { user, setSyncStatus } = get()
    if (!user) return
    setSyncStatus('syncing')
    try {
      await renameChart(user.uid, chartId, title.trim() || '無題')
    } catch (e) {
      console.error('renameChart failed', e)
    } finally {
      setSyncStatus('synced')
    }
  },

  deleteChartById: async (chartId) => {
    const { user, setSyncStatus, closeConfirm, charts, currentChartId } = get()
    if (!user) return
    const chart = charts.find((c) => c.id === chartId)
    if (!chart) return
    get().showConfirm(
      `「${chart.title}」を削除します。中身のメンバーも全て消えます。よろしいですか？`,
      async () => {
        closeConfirm()
        setSyncStatus('syncing')
        try {
          await deleteChart(user.uid, chartId)
          if (currentChartId === chartId) {
            set({ currentChartId: null, members: {} })
          }
        } catch (e) {
          console.error('deleteChart failed', e)
        } finally {
          setSyncStatus('synced')
        }
      }
    )
  },

  // --- Member Actions ---

  addNode: async (parentId, position) => {
    const { user, currentChartId, plan, members, pushUndo, setSyncStatus } = get()
    if (!user || !currentChartId) return

    // 無料プランのメンバー上限チェック
    if (!canAddMoreMembers(plan, Object.keys(members).length)) {
      get().showUpgrade('members')
      return
    }

    pushUndo()
    setSyncStatus('syncing')

    const data = {
      name: '新メンバー',
      role: '',
      job: '',
      photo: null,
      parentId: parentId ?? null,
      position: position ?? null,
      collapsed: false,
    }

    try {
      const newId = await addMember(user.uid, currentChartId, data)
      set({ selectedId: newId, panelOpen: true })
    } catch (e) {
      console.error('addNode failed', e)
    } finally {
      setSyncStatus('synced')
    }
  },

  toggleCollapsed: async (memberId) => {
    const { user, viewMode, currentChartId, members, viewerCollapse, setSyncStatus } = get()
    const cur = members[memberId]
    if (!cur) return

    if (viewMode === 'view') {
      const curOverride = memberId in viewerCollapse ? viewerCollapse[memberId] : !!cur.collapsed
      set((s) => ({
        viewerCollapse: { ...s.viewerCollapse, [memberId]: !curOverride },
      }))
      return
    }

    if (!user || !currentChartId) return
    const next = !cur.collapsed
    set((s) => ({
      members: { ...s.members, [memberId]: { ...s.members[memberId], collapsed: next } },
    }))
    setSyncStatus('syncing')
    try {
      await updateMember(user.uid, currentChartId, memberId, { collapsed: next })
    } catch (e) {
      console.error('toggleCollapsed failed', e)
      set((s) => ({
        members: { ...s.members, [memberId]: { ...s.members[memberId], collapsed: cur.collapsed } },
      }))
    } finally {
      setSyncStatus('synced')
    }
  },

  deleteNode: async (targetId) => {
    const { user, currentChartId, members, pushUndo, setSyncStatus, closeConfirm } = get()
    if (!user || !currentChartId) return

    const descendants = collectDescendants(members, targetId)
    const allIds = [targetId, ...descendants]
    const count = descendants.length

    const memberName = members[targetId]?.name ?? ''

    get().showConfirm(
      `「${memberName}」と配下${count}人を削除します。よろしいですか？（元に戻すで復活可能）`,
      async () => {
        closeConfirm()
        pushUndo()
        setSyncStatus('syncing')
        try {
          await deleteMembers(user.uid, currentChartId, allIds)
          set((s) => {
            const next = { ...s.members }
            allIds.forEach((id) => delete next[id])
            return {
              members: next,
              selectedId: s.selectedId === targetId ? null : s.selectedId,
              panelOpen: s.selectedId === targetId ? false : s.panelOpen,
            }
          })
        } catch (e) {
          console.error('deleteNode failed', e)
        } finally {
          setSyncStatus('synced')
        }
      }
    )
  },

  saveNode: async (memberId, data) => {
    const { user, currentChartId, pushUndo, setSyncStatus } = get()
    if (!user || !currentChartId) return

    pushUndo()
    setSyncStatus('syncing')
    try {
      await updateMember(user.uid, currentChartId, memberId, data)
      set((s) => ({
        members: {
          ...s.members,
          [memberId]: { ...s.members[memberId], ...data },
        },
      }))
    } catch (e) {
      console.error('saveNode failed', e)
    } finally {
      setSyncStatus('synced')
    }
  },

  moveNode: async (dragId, newParentId, newPosition) => {
    const { user, currentChartId, members, pushUndo, setSyncStatus, closeConfirm } = get()
    if (!user || !currentChartId) return

    if (newParentId === null) return

    const descendants = new Set(collectDescendants(members, dragId))
    if (descendants.has(newParentId)) return

    const siblings = Object.values(members).filter((m) => m.parentId === newParentId)
    const occupied = siblings.some((m) => m.id !== dragId && m.position === newPosition)
    if (occupied) return

    const dragName = members[dragId]?.name ?? ''
    const parentName = members[newParentId]?.name ?? ''
    const posLabel = newPosition === 'left' ? '左' : '右'
    const descCount = collectDescendants(members, dragId).length

    const subLabel = descCount > 0 ? `（配下${descCount}人と共に）` : ''

    get().showConfirm(
      `「${dragName}」${subLabel}を、「${parentName}」の${posLabel}に移動します。よろしいですか？`,
      async () => {
        closeConfirm()
        pushUndo()
        setSyncStatus('syncing')
        try {
          await updateMember(user.uid, currentChartId, dragId, {
            parentId: newParentId,
            position: newPosition,
          })
          set((s) => ({
            members: {
              ...s.members,
              [dragId]: { ...s.members[dragId], parentId: newParentId, position: newPosition },
            },
          }))
        } catch (e) {
          console.error('moveNode failed', e)
        } finally {
          setSyncStatus('synced')
        }
      }
    )
  },

  addRootNode: async () => {
    const { user, currentChartId, plan, members, pushUndo, setSyncStatus } = get()
    if (!user || !currentChartId) return

    // 無料プランのメンバー上限チェック
    if (!canAddMoreMembers(plan, Object.keys(members).length)) {
      get().showUpgrade('members')
      return
    }

    pushUndo()
    setSyncStatus('syncing')
    try {
      const newId = await addMember(user.uid, currentChartId, {
        name: '新メンバー',
        role: '',
        job: '',
        photo: null,
        parentId: null,
        position: null,
        collapsed: false,
      })
      set({ selectedId: newId, panelOpen: true })
    } catch (e) {
      console.error('addRootNode failed', e)
    } finally {
      setSyncStatus('synced')
    }
  },
}))

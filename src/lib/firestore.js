import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'

// === パスヘルパー ============================================
const chartsCol  = (uid) => collection(db, 'users', uid, 'charts')
const chartDoc   = (uid, chartId) => doc(db, 'users', uid, 'charts', chartId)
const membersCol = (uid, chartId) => collection(db, 'users', uid, 'charts', chartId, 'members')
const memberDoc  = (uid, chartId, memberId) => doc(db, 'users', uid, 'charts', chartId, 'members', memberId)
const shareConfigDoc = (uid, chartId) => doc(db, 'users', uid, 'charts', chartId, '_meta', 'share')
const shareTokenDoc  = (token) => doc(db, 'shareTokens', token)

// === ユーティリティ ==========================================
function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let token = ''
  for (let i = 0; i < 12; i++) token += chars[Math.floor(Math.random() * chars.length)]
  return token
}

// === 役職（アカウント共通・users/{uid}/_meta/roles）=========
const rolesDoc = (uid) => doc(db, 'users', uid, '_meta', 'roles')

export function subscribeUserRoles(uid, callback) {
  return onSnapshot(
    rolesDoc(uid),
    (snap) => callback(snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : []),
    (err) => { console.warn('roles subscribe failed', err); callback([]) },
  )
}

export async function saveUserRoles(uid, list) {
  await setDoc(rolesDoc(uid), { list, updatedAt: serverTimestamp() })
}

// 既存アカウント（組織図を持つ）には初回のみデフォルト役職をseed。新規は空のまま。
export async function seedDefaultRolesIfNeeded(uid, defaultRoles) {
  const snap = await getDoc(rolesDoc(uid))
  if (snap.exists()) return
  const chartsSnap = await getDocs(chartsCol(uid))
  if (chartsSnap.empty) return
  await setDoc(rolesDoc(uid), { list: defaultRoles, updatedAt: serverTimestamp() })
}

// === ユーザープラン購読 =====================================
// users/{uid} ドキュメントの plan フィールドを購読（無ければ 'free'）
export function subscribeUserPlan(uid, callback) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => callback(snap.exists() ? (snap.data().plan || 'free') : 'free'),
    (err) => { console.warn('plan subscribe failed', err); callback('free') },
  )
}

// === 組織図（Chart）操作 ====================================

export async function createChart(uid, title) {
  const ref = await addDoc(chartsCol(uid), {
    title: title || '新しい組織図',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function renameChart(uid, chartId, title) {
  await updateDoc(chartDoc(uid, chartId), {
    title,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteChart(uid, chartId) {
  // メンバーを全削除
  const memSnap = await getDocs(membersCol(uid, chartId))
  const batch = writeBatch(db)
  memSnap.forEach((m) => batch.delete(m.ref))
  // 共有設定削除
  batch.delete(shareConfigDoc(uid, chartId))
  // 共有トークン削除
  try {
    const shareSnap = await getDoc(shareConfigDoc(uid, chartId))
    if (shareSnap.exists() && shareSnap.data().token) {
      batch.delete(shareTokenDoc(shareSnap.data().token))
    }
  } catch (_) { /* noop */ }
  // chart 本体削除
  batch.delete(chartDoc(uid, chartId))
  await batch.commit()
}

export function subscribeCharts(uid, callback) {
  const q = query(chartsCol(uid), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snap) => {
    const list = []
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }))
    callback(list)
  })
}

async function touchChart(uid, chartId) {
  // メンバー編集時に chart の updatedAt を更新
  try {
    await updateDoc(chartDoc(uid, chartId), { updatedAt: serverTimestamp() })
  } catch (_) { /* noop */ }
}

// === メンバー操作（既存とAPI互換、引数に chartId 追加） =====

export async function addMember(uid, chartId, data) {
  const ref = await addDoc(membersCol(uid, chartId), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  touchChart(uid, chartId)
  return ref.id
}

export async function updateMember(uid, chartId, memberId, data) {
  await updateDoc(memberDoc(uid, chartId, memberId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
  touchChart(uid, chartId)
}

export async function deleteMember(uid, chartId, memberId) {
  await deleteDoc(memberDoc(uid, chartId, memberId))
  touchChart(uid, chartId)
}

export async function deleteMembers(uid, chartId, memberIds) {
  await Promise.all(memberIds.map((id) => deleteDoc(memberDoc(uid, chartId, id))))
  touchChart(uid, chartId)
}

export async function restoreMember(uid, chartId, memberId, data) {
  await setDoc(memberDoc(uid, chartId, memberId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
  touchChart(uid, chartId)
}

// === 共有関連（chartId スコープ）===========================

export async function getShareConfig(uid, chartId) {
  const snap = await getDoc(shareConfigDoc(uid, chartId))
  return snap.exists() ? snap.data() : null
}

export async function setShareEnabled(uid, chartId, enabled) {
  const cur = await getShareConfig(uid, chartId)
  let token = cur?.token
  if (!token) {
    token = generateToken()
    await setDoc(shareTokenDoc(token), { uid, chartId, createdAt: serverTimestamp() })
  }
  await setDoc(shareConfigDoc(uid, chartId), {
    enabled,
    token,
    updatedAt: serverTimestamp(),
  })
  return { enabled, token }
}

export async function regenerateShareToken(uid, chartId) {
  const cur = await getShareConfig(uid, chartId)
  if (cur?.token) {
    try { await deleteDoc(shareTokenDoc(cur.token)) } catch (_) { /* noop */ }
  }
  const token = generateToken()
  await setDoc(shareTokenDoc(token), { uid, chartId, createdAt: serverTimestamp() })
  await setDoc(shareConfigDoc(uid, chartId), {
    enabled: true,
    token,
    updatedAt: serverTimestamp(),
  })
  return { enabled: true, token }
}

export async function getShareTokenInfo(token) {
  const snap = await getDoc(shareTokenDoc(token))
  return snap.exists() ? snap.data() : null
}

export function subscribePublicMembers(uid, chartId, callback) {
  return onSnapshot(membersCol(uid, chartId), (snap) => {
    const map = {}
    snap.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } })
    callback(map)
  })
}

export function subscribeShareConfig(uid, chartId, callback) {
  return onSnapshot(shareConfigDoc(uid, chartId), (snap) => {
    callback(snap.exists() ? snap.data() : null)
  })
}

// === 旧データからの自動移行 =================================
// users/{uid}/members → users/{uid}/charts/<newId>/members
// 完了後、旧 members と旧 _meta/share を削除する。
export async function migrateLegacyDataIfNeeded(uid) {
  // 既に charts があれば何もしない
  const chartsSnap = await getDocs(chartsCol(uid))
  if (!chartsSnap.empty) return null

  // 旧 members の存在チェック
  const legacySnap = await getDocs(collection(db, 'users', uid, 'members'))
  if (legacySnap.empty) return null

  // 新 chart 作成
  const newChartRef = doc(chartsCol(uid))
  const newChartId  = newChartRef.id

  // バッチで chart 本体 + 全メンバーをコピー
  const batch1 = writeBatch(db)
  batch1.set(newChartRef, {
    title: '全国組織図',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  legacySnap.forEach((m) => {
    batch1.set(memberDoc(uid, newChartId, m.id), m.data())
  })
  await batch1.commit()

  // 旧 members 削除
  const batch2 = writeBatch(db)
  legacySnap.forEach((m) => batch2.delete(m.ref))
  // 旧 _meta/share 削除（共有トークンも）
  try {
    const oldShare = await getDoc(doc(db, 'users', uid, '_meta', 'share'))
    if (oldShare.exists()) {
      if (oldShare.data().token) {
        try { await deleteDoc(shareTokenDoc(oldShare.data().token)) } catch (_) {}
      }
      batch2.delete(doc(db, 'users', uid, '_meta', 'share'))
    }
  } catch (_) { /* noop */ }
  await batch2.commit()

  return newChartId
}

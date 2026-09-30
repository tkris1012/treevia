// Firestore の Timestamp / Date / ミリ秒 を ミリ秒 に揃える
export function toMillis(t) {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (t instanceof Date) return t.getTime()
  return null
}

// 最後に開いたあとに中身が更新されていれば true。
// 機能追加前のブックマークは lastViewedAt を持たないので、追加日時を基準にする。
export function hasUnseenUpdate(contentUpdatedAt, lastViewedAt, addedAt) {
  const updated = toMillis(contentUpdatedAt)
  if (updated == null) return false
  const seen = toMillis(lastViewedAt) ?? toMillis(addedAt)
  if (seen == null) return false
  return updated > seen
}

export function formatRelative(t, now = Date.now()) {
  const ms = toMillis(t)
  if (ms == null) return ''
  const min = Math.floor(Math.max(0, now - ms) / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}日前`
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

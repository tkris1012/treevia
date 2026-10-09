// Firestore の購読（onSnapshot）を、失敗・停滞したときに自動で再接続するラッパー。
//
// onSnapshot はエラーが起きるとその場で購読が終了し、二度と再開しない。何もしないと
// 画面は空のまま止まり、画面遷移などで購読をやり直すまで直らない。ここでは
//   - エラーが来たら、間隔を延ばしながら購読し直す（1→2→4→8→16秒、以降は30秒ごと）
//   - 一定時間「準備完了」のデータが届かなければ、停滞とみなして購読し直す
//   - 電波が戻ったとき・アプリに戻ってきたときは、待たずにすぐ購読し直す
// を行い、全体の状態（ok / retrying / failed）を store.connState に反映する。
import { useStore } from '../store/useStore.js'

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]
const SLOW_RETRY_MS = 30000
const STALL_MS = 15000

const active = new Map() // id -> { status, retryNow }
let seq = 0

function publish() {
  let state = 'ok'
  for (const s of active.values()) {
    if (s.status === 'failed') { state = 'failed'; break }
    if (s.status === 'retrying') state = 'retrying'
  }
  if (useStore.getState().connState !== state) useStore.getState().setConnState(state)
}

// 失敗中・再接続待ちの購読を、待たずにすぐやり直す
export function retryAllNow() {
  for (const s of active.values()) if (s.status !== 'ok') s.retryNow()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', retryAllNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retryAllNow()
  })
}

/**
 * @param {object} o
 * @param {string} o.name           ログ用の名前
 * @param {(onNext, onError) => Function} o.subscribe  購読を開始し、解除関数を返す
 * @param {(data, meta) => void} o.onData
 * @param {(data, meta) => boolean} [o.isReady]  このデータで「読み込み完了」とみなせるか
 * @returns {{ stop: () => void, retryNow: () => void }}
 */
export function resilientSubscribe({ name, subscribe, onData, isReady = () => true }) {
  const id = ++seq
  let unsub = null
  let retryTimer = null
  let stallTimer = null
  let attempt = 0
  let ready = false
  let stopped = false
  const entry = { status: 'ok', retryNow }
  active.set(id, entry)

  function setStatus(status) {
    if (entry.status === status) return
    entry.status = status
    publish()
  }

  function detach() {
    clearTimeout(stallTimer)
    if (unsub) { try { unsub() } catch (_) { /* noop */ } unsub = null }
  }

  function start() {
    if (stopped) return
    detach()
    ready = false
    stallTimer = setTimeout(() => { if (!ready) fail(new Error('stalled')) }, STALL_MS)
    try {
      unsub = subscribe(
        (data, meta = {}) => {
          if (stopped) return
          onData(data, meta)
          if (!ready && isReady(data, meta)) {
            ready = true
            attempt = 0
            clearTimeout(stallTimer)
            setStatus('ok')
          }
        },
        (err) => fail(err),
      )
    } catch (e) {
      fail(e)
    }
  }

  function fail(err) {
    if (stopped) return
    console.warn(`[sync] ${name} の読み込みに失敗。再接続します`, err?.code || err?.message || err)
    detach()
    clearTimeout(retryTimer)
    const delay = attempt < RETRY_DELAYS.length ? RETRY_DELAYS[attempt] : SLOW_RETRY_MS
    setStatus(attempt < RETRY_DELAYS.length ? 'retrying' : 'failed')
    attempt++
    retryTimer = setTimeout(start, delay)
  }

  function retryNow() {
    if (stopped) return
    clearTimeout(retryTimer)
    start()
  }

  start()

  return {
    retryNow,
    stop() {
      stopped = true
      clearTimeout(retryTimer)
      detach()
      active.delete(id)
      publish()
    },
  }
}

/**
 * 一度きりの非同期処理（共有リンクの解決など）を、通信エラーのときだけ再試行する。
 * 状態は購読と同じく connState に反映する。
 */
export function retryingTask(name, task) {
  const id = ++seq
  let attempt = 0
  let timer = null
  let stopped = false
  const entry = { status: 'ok', retryNow: run }
  active.set(id, entry)
  const setStatus = (s) => { if (entry.status !== s) { entry.status = s; publish() } }

  async function run() {
    if (stopped) return
    clearTimeout(timer)
    try {
      await task(() => stopped)
      if (!stopped) setStatus('ok')
    } catch (err) {
      if (stopped) return
      console.warn(`[sync] ${name} に失敗。再試行します`, err?.code || err?.message || err)
      const delay = attempt < RETRY_DELAYS.length ? RETRY_DELAYS[attempt] : SLOW_RETRY_MS
      setStatus(attempt < RETRY_DELAYS.length ? 'retrying' : 'failed')
      attempt++
      timer = setTimeout(run, delay)
    }
  }

  run()
  return {
    stop() { stopped = true; clearTimeout(timer); active.delete(id); publish() },
  }
}

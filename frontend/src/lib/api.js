// Shared fetch cache. Each endpoint is fetched once no matter how many panels use it,
// polled at its own cadence, paused in hidden tabs, and never cleared on failure:
// a failed refresh keeps the last good payload and records the error beside it.
import { useEffect, useSyncExternalStore } from 'react'

const TIMEOUT = 25_000
const QUICK = 6_000     // re-ask delay after a response that was still refreshing
const entries = new Map()      // path -> { data, error, at, loading, interval }
const listeners = new Set()
const sources = {}             // merged per-source metadata from every response
let version = 0

const emit = () => { version++; listeners.forEach(fn => fn()) }
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
const getVersion = () => version

function entry(path) {
  if (!entries.has(path)) entries.set(path, { data: undefined, error: null, at: 0, loading: false, users: 0, interval: 0, quick: 0 })
  return entries.get(path)
}

export async function load(path) {
  const e = entry(path)
  if (e.loading) return
  e.loading = true
  emit()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    // Responses can come from different server instances; keep the fresher record.
    for (const [name, meta] of Object.entries(data.sources || {})) {
      const known = sources[name]
      if (!known || (meta.fetched_at || '') >= (known.fetched_at || '')) sources[name] = meta
    }
    Object.assign(e, { data, error: null, at: Date.now() })
    // A response built while the server was still refreshing: ask again soon, at most twice in a row.
    e.quick = data.refreshing ? e.quick + 1 : 0
    if (data.refreshing && e.quick <= 2) setTimeout(() => load(path), QUICK)
  } catch (err) {
    e.error = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error')
    e.at = e.at || 0
  } finally {
    clearTimeout(timer)
    e.loading = false
    emit()
  }
}

const due = e => Date.now() - e.at >= e.interval

export function useResource(path, interval) {
  useSyncExternalStore(subscribe, getVersion)
  useEffect(() => {
    const e = entry(path)
    e.users++
    e.interval = e.interval ? Math.min(e.interval, interval) : interval
    if (due(e) || e.error) load(path)
    const tick = setInterval(() => { if (!document.hidden && due(e)) load(path) }, Math.min(interval, 30_000))
    const wake = () => { if (!document.hidden && due(e)) load(path) }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      e.users--
      clearInterval(tick)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [path, interval])
  const e = entry(path)
  return { data: e.data, error: e.error, loading: e.loading, at: e.at }
}

/** Reload every endpoint a mounted panel is using. */
export function reloadAll() {
  for (const [path, e] of entries) if (e.users > 0) load(path)
}

export function useActivity() {
  useSyncExternalStore(subscribe, getVersion)
  let loading = false, last = 0, failed = 0
  for (const e of entries.values()) {
    if (!e.users) continue
    loading ||= e.loading
    last = Math.max(last, e.at)
    if (e.error) failed++
  }
  return { loading, last, failed }
}

export function useSources() {
  useSyncExternalStore(subscribe, getVersion)
  return sources
}

// Polling cadences, matched to how often each upstream publishes.
export const EVERY = {
  live: 60_000,
  grid: 5 * 60_000,
  feed: 5 * 60_000,
  reactors: 15 * 60_000,
  prices: 60 * 60_000,
  world: 6 * 60 * 60_000,
  status: 60_000,
}

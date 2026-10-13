import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { setParam } from './router'

// One shared clock so relative times tick together without per-component timers.
let now = Date.now()
const clockListeners = new Set()
setInterval(() => { now = Date.now(); clockListeners.forEach(fn => fn()) }, 1000)
export const useNow = () => useSyncExternalStore(fn => { clockListeners.add(fn); return () => clockListeners.delete(fn) }, () => now)

// Re-render charts when the color scheme flips.
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
export function useScheme() {
  return useSyncExternalStore(
    fn => { media?.addEventListener('change', fn); return () => media?.removeEventListener('change', fn) },
    () => (media?.matches ? 'dark' : 'light'),
  )
}

export function useSort(rows, initialKey, initialDir = 'desc') {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir })
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key]
    const missing = (x === null || x === undefined) - (y === null || y === undefined)
    if (missing) return missing                       // missing values always last
    const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y
    return sort.dir === 'asc' ? cmp : -cmp
  })
  const toggle = key => setSort(s => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : (typeof rows[0]?.[key] === 'string' ? 'asc' : 'desc') }))
  return { sorted, sort, toggle }
}

export function useDebounced(value, ms = 120) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** Search text mirrored to ?q= (debounced) without clobbering what the user is typing. */
export function useQueryText(params) {
  const urlQ = params.get('q') || ''
  const [q, setQ] = useState(urlQ)
  const written = useRef(urlQ)
  const dq = useDebounced(q)
  useEffect(() => { if (dq !== written.current) { written.current = dq; setParam('q', dq) } }, [dq])
  useEffect(() => { if (urlQ !== written.current) { written.current = urlQ; setQ(urlQ) } }, [urlQ])
  return [q, setQ, dq]
}

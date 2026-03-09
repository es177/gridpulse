import { useEffect, useRef } from 'react'
import useStore from '../store/useStore'

/**
 * Grid data live connection.
 * - In dev (localhost): tries WebSocket, falls back to polling
 * - In production (Vercel): uses REST polling (no persistent WS)
 */
export default function useGridWebSocket() {
  const setGridData = useStore((s) => s.setGridData)
  const setWsConnected = useStore((s) => s.setWsConnected)
  const fetchGridCurrent = useStore((s) => s.fetchGridCurrent)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const pollTimer = useRef(null)
  const usingPolling = useRef(false)

  useEffect(() => {
    function startPolling() {
      if (usingPolling.current) return
      usingPolling.current = true
      setWsConnected(true) // Show as "LIVE" — polling is working

      fetchGridCurrent()
      pollTimer.current = setInterval(fetchGridCurrent, 30000)
    }

    function connect() {
      // Skip WebSocket in production (Vercel can't do persistent WS)
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (!isLocal) {
        startPolling()
        return
      }

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        const ws = new WebSocket(`${protocol}//${host}/ws/grid`)
        wsRef.current = ws

        ws.onopen = () => {
          setWsConnected(true)
        }

        ws.onmessage = (event) => {
          if (event.data === 'pong') return
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'heartbeat') return
            if (data.timestamp) setGridData(data)
          } catch { /* ignore non-JSON */ }
        }

        ws.onclose = () => {
          setWsConnected(false)
          startPolling() // Fall back to polling
        }

        ws.onerror = () => ws.close()

        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, 30000)

        ws.addEventListener('close', () => clearInterval(pingInterval))
      } catch {
        startPolling()
      }
    }

    connect()

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pollTimer.current) clearInterval(pollTimer.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [setGridData, setWsConnected, fetchGridCurrent])
}

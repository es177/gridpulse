import { create } from 'zustand'

const API = ''

const useStore = create((set, get) => ({
  // Active view
  activeView: 'dashboard',
  setActiveView: (view) => set({ activeView: view }),

  // WebSocket
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // Grid data
  gridData: null,
  gridHistory: [],
  setGridData: (data) => set({ gridData: data }),

  // Summary KPIs
  summary: null,

  // Reactors
  reactors: [],
  reactorLoading: false,

  // Enrichment entities
  enrichmentEntities: [],

  // Policy events
  policyEvents: [],
  policyTotal: 0,

  // Investments
  investments: [],
  investmentTotal: 0,

  // Timeline filters
  timelineFilters: {
    categories: ['policy', 'investment', 'nuclear'],
    search: '',
    dateRange: null,
  },
  setTimelineFilters: (filters) =>
    set({ timelineFilters: { ...get().timelineFilters, ...filters } }),

  // Map layers
  mapLayers: {
    reactors: true,
    enrichment: true,
    investments: true,
    policy: false,
  },
  toggleMapLayer: (layer) =>
    set({
      mapLayers: { ...get().mapLayers, [layer]: !get().mapLayers[layer] },
    }),

  // Refresh state
  refreshing: false,
  lastRefreshed: null,

  // Modal
  selectedEvent: null,
  setSelectedEvent: (event) => set({ selectedEvent: event }),

  // Fetch functions
  fetchSummary: async () => {
    try {
      const res = await fetch(`${API}/api/stats/summary`)
      const data = await res.json()
      set({ summary: data })
    } catch (e) {
      console.error('Failed to fetch summary:', e)
    }
  },

  fetchGridCurrent: async () => {
    try {
      const res = await fetch(`${API}/api/grid/current`)
      const data = await res.json()
      set({ gridData: data })
    } catch (e) {
      console.error('Failed to fetch grid:', e)
    }
  },

  fetchGridHistory: async (hours = 24) => {
    try {
      const res = await fetch(`${API}/api/grid/history?hours=${hours}`)
      const data = await res.json()
      set({ gridHistory: data.data || [] })
    } catch (e) {
      console.error('Failed to fetch grid history:', e)
    }
  },

  fetchReactors: async () => {
    set({ reactorLoading: true })
    try {
      const res = await fetch(`${API}/api/reactors`)
      const data = await res.json()
      set({ reactors: data.reactors || [], reactorLoading: false })
    } catch (e) {
      console.error('Failed to fetch reactors:', e)
      set({ reactorLoading: false })
    }
  },

  fetchEnrichment: async () => {
    try {
      const res = await fetch(`${API}/api/enrichment`)
      const data = await res.json()
      set({ enrichmentEntities: data.entities || [] })
    } catch (e) {
      console.error('Failed to fetch enrichment:', e)
    }
  },

  fetchPolicy: async (limit = 50) => {
    try {
      const res = await fetch(`${API}/api/policy?limit=${limit}`)
      const data = await res.json()
      set({ policyEvents: data.events || [], policyTotal: data.total || 0 })
    } catch (e) {
      console.error('Failed to fetch policy:', e)
    }
  },

  fetchInvestments: async (limit = 50) => {
    try {
      const res = await fetch(`${API}/api/investments?limit=${limit}`)
      const data = await res.json()
      set({
        investments: data.investments || [],
        investmentTotal: data.total || 0,
      })
    } catch (e) {
      console.error('Failed to fetch investments:', e)
    }
  },

  // Fetch all data
  fetchAll: async () => {
    set({ refreshing: true })
    const state = get()
    await Promise.all([
      state.fetchSummary(),
      state.fetchGridCurrent(),
      state.fetchReactors(),
      state.fetchEnrichment(),
      state.fetchPolicy(),
      state.fetchInvestments(),
    ])
    set({ refreshing: false, lastRefreshed: Date.now() })
  },
}))

export default useStore

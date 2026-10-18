import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { inferColumns } from '../utils/dataTypes'
import {
  loadCharts,
  saveCharts,
  loadDataset,
  saveDataset,
  clearStoredDataset,
} from '../utils/storage'

const THEME_KEY = 'datapilot:theme'
const PREFS_KEY = 'datapilot:prefs'
const CHARTS_KEY = 'datapilot:charts'

const DEFAULT_PREFS = { persistCharts: true, persistDataset: false }

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const DataContext = createContext(null)

export function DataProvider({ children }) {
  // ---- Dataset -----------------------------------------------------------
  const [dataset, setDatasetState] = useState(null)
  const [originalDataset, setOriginalDataset] = useState(null)

  /** Replace the active dataset; also becomes the reset baseline. */
  const setDataset = useCallback((ds) => {
    setDatasetState(ds ?? null)
    setOriginalDataset(ds ?? null)
  }, [])

  /**
   * Update rows (e.g. after cleaning). Re-infers columns, keeps the dataset
   * name and meta, and records an optional note in meta.
   */
  const updateDataset = useCallback((rows, note) => {
    setDatasetState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        columns: inferColumns(rows),
        rows,
        meta: { ...prev.meta, ...(note ? { note } : {}) },
      }
    })
  }, [])

  /** Restore the dataset as it was when last loaded/imported. */
  const resetDataset = useCallback(() => {
    setDatasetState(originalDataset)
  }, [originalDataset])

  // ---- Loading flag ------------------------------------------------------
  const [isLoading, setIsLoading] = useState(false)

  // ---- Theme -------------------------------------------------------------
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark'
    } catch {
      return 'dark'
    }
  })

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // storage unavailable — theme still applies to the DOM
    }
  }, [theme])

  // ---- UI state ----------------------------------------------------------
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => !c)
  }, [])

  const [page, setPage] = useState('overview')

  // ---- Preferences -------------------------------------------------------
  const [prefs, setPrefs] = useState(() => ({
    ...DEFAULT_PREFS,
    ...readJSON(PREFS_KEY, {}),
  }))

  const updatePrefs = useCallback((patch) => {
    setPrefs((p) => ({ ...p, ...patch }))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // quota / privacy mode — prefs simply won't survive reloads
    }
  }, [prefs])

  // ---- Saved charts ------------------------------------------------------
  const [savedCharts, setSavedCharts] = useState([])
  const chartsHydrated = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadCharts().then((stored) => {
      if (cancelled) return
      if (Array.isArray(stored)) setSavedCharts(stored)
      chartsHydrated.current = true
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!chartsHydrated.current) return
    if (prefs.persistCharts) saveCharts(savedCharts)
  }, [savedCharts, prefs.persistCharts])

  const addChart = useCallback((cfg) => {
    const id = cfg?.id ?? `chart-${Date.now().toString(36)}`
    setSavedCharts((charts) => [...charts, { ...cfg, id }])
    return id
  }, [])

  const updateChart = useCallback((id, patch) => {
    setSavedCharts((charts) =>
      charts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
  }, [])

  const deleteChart = useCallback((id) => {
    setSavedCharts((charts) => charts.filter((c) => c.id !== id))
  }, [])

  // ---- Persisted dataset -------------------------------------------------
  // On mount, restore a previously persisted dataset when the user opted in.
  useEffect(() => {
    let cancelled = false
    const { persistDataset } = readJSON(PREFS_KEY, DEFAULT_PREFS)
    if (!persistDataset) return
    loadDataset().then((stored) => {
      if (!cancelled && stored) setDataset(stored)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch for dataset changes and persist when opted in.
  useEffect(() => {
    if (prefs.persistDataset && dataset) saveDataset(dataset)
  }, [dataset, prefs.persistDataset])

  // ---- Danger zone -------------------------------------------------------
  const clearLocalData = useCallback(async () => {
    const ok = window.confirm(
      'Clear all locally stored DataPilot data?\n\n' +
        'This removes saved charts, preferences, the theme choice, and any ' +
        'persisted dataset from this browser. It cannot be undone.',
    )
    if (!ok) return
    try {
      localStorage.removeItem(THEME_KEY)
      localStorage.removeItem(PREFS_KEY)
      localStorage.removeItem(CHARTS_KEY)
    } catch {
      // ignore
    }
    await clearStoredDataset()
    setSavedCharts([])
    setPrefs(DEFAULT_PREFS)
    setDatasetState(null)
    setOriginalDataset(null)
  }, [])

  const value = useMemo(
    () => ({
      dataset,
      originalDataset,
      setDataset,
      updateDataset,
      resetDataset,
      isLoading,
      setIsLoading,
      theme,
      toggleTheme,
      sidebarCollapsed,
      toggleSidebar,
      page,
      setPage,
      savedCharts,
      addChart,
      updateChart,
      deleteChart,
      prefs,
      updatePrefs,
      clearLocalData,
    }),
    [
      dataset,
      originalDataset,
      setDataset,
      updateDataset,
      resetDataset,
      isLoading,
      theme,
      toggleTheme,
      sidebarCollapsed,
      toggleSidebar,
      page,
      savedCharts,
      addChart,
      updateChart,
      deleteChart,
      prefs,
      updatePrefs,
      clearLocalData,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}

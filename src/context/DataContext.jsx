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
  classifyStorageError,
  storageErrorMessage,
} from '../utils/storage'

const THEME_KEY = 'datapilot:theme'
const PREFS_KEY = 'datapilot:prefs'
const CHARTS_KEY = 'datapilot:charts'

const DEFAULT_PREFS = { persistCharts: true, persistDataset: false }

/**
 * Per-target persistence status exposed to the UI so the Settings toggles
 * reflect real save outcomes: { state: 'idle'|'saving'|'ok'|'failed',
 * message: string|null }.
 */
const IDLE_PERSISTENCE = { state: 'idle', message: null }
const OK_PERSISTENCE = { state: 'ok', message: null }
const failedPersistence = (error) => ({
  state: 'failed',
  message: storageErrorMessage(error),
})

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
  // ---- Dashboard business filters ----------------------------------------
  // Stored in context (not Dashboard-local state) so other pages such as
  // Reports can read the active dashboard filters later. Replace semantics:
  // pass the full next filter object; pass {} to clear all filters.
  // Keys: { dateFrom, dateTo, region, category, channel, segment }.
  const [dashboardFilters, setDashboardFiltersState] = useState({})

  /**
   * Replace the dashboard filter object. Values reference the *values* of
   * the dataset's semantic columns (detected in Dashboard.jsx); Dashboard
   * maps each key to the detected column for the active dataset.
   */
  const setDashboardFilters = useCallback((next) => {
    setDashboardFiltersState(
      next && typeof next === 'object' ? { ...next } : {},
    )
  }, [])

  // ---- Dataset -----------------------------------------------------------
  const [dataset, setDatasetState] = useState(null)
  const [originalDataset, setOriginalDataset] = useState(null)

  /** Replace the active dataset; also becomes the reset baseline. */
  const setDataset = useCallback((ds) => {
    setDatasetState(ds ?? null)
    setOriginalDataset(ds ?? null)
    // A new dataset has different columns/values, so stale filters must go.
    setDashboardFiltersState({})
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
    setPrefs((p) => {
      const next = { ...p, ...patch }
      // Toggle-off deletes the previously stored copy immediately so stale
      // data never lingers after the user revokes consent. Both calls are
      // idempotent, so a double-invoked updater is harmless.
      if (p.persistDataset && !next.persistDataset) void clearStoredDataset()
      if (p.persistCharts && !next.persistCharts) {
        try {
          localStorage.removeItem(CHARTS_KEY)
        } catch {
          // storage unavailable — nothing stored anyway
        }
      }
      return next
    })
  }, [])

  // Honest persistence bookkeeping: each target records whether its last
  // save actually succeeded, so the UI never claims "saved" on a failure.
  const [persistenceStatus, setPersistenceStatus] = useState({
    prefs: OK_PERSISTENCE,
    charts: IDLE_PERSISTENCE,
    dataset: IDLE_PERSISTENCE,
  })

  useEffect(() => {
    let result
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
      result = OK_PERSISTENCE
    } catch (e) {
      // quota / privacy mode — prefs simply won't survive reloads, and the
      // UI must say so instead of silently pretending otherwise
      result = failedPersistence(classifyStorageError(e))
    }
    setPersistenceStatus((s) => (s.prefs === result ? s : { ...s, prefs: result }))
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
    if (!prefs.persistCharts) {
      setPersistenceStatus((s) =>
        s.charts === IDLE_PERSISTENCE ? s : { ...s, charts: IDLE_PERSISTENCE },
      )
      return
    }
    let cancelled = false
    saveCharts(savedCharts).then((res) => {
      if (cancelled) return
      setPersistenceStatus((s) => ({
        ...s,
        charts: res.ok ? OK_PERSISTENCE : failedPersistence(res.error),
      }))
    })
    return () => {
      cancelled = true
    }
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
  // Uploads are never persisted silently: this is the only restore path and
  // it runs solely under the explicit persistDataset opt-in.
  useEffect(() => {
    let cancelled = false
    const { persistDataset } = readJSON(PREFS_KEY, DEFAULT_PREFS)
    if (!persistDataset) return
    loadDataset().then((res) => {
      if (cancelled) return
      if (res.found) {
        setDataset(res.dataset)
      } else if (res.error) {
        // Opted in but the restore itself failed — say so, don't pretend.
        setPersistenceStatus((s) => ({
          ...s,
          dataset: failedPersistence(res.error),
        }))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch for dataset changes and persist when opted in. The outcome is
  // recorded in persistenceStatus so the toggle reflects real
  // success/failure instead of assuming the write worked.
  useEffect(() => {
    if (!prefs.persistDataset || !dataset) {
      setPersistenceStatus((s) =>
        s.dataset === IDLE_PERSISTENCE ? s : { ...s, dataset: IDLE_PERSISTENCE },
      )
      return
    }
    let cancelled = false
    setPersistenceStatus((s) => ({
      ...s,
      dataset: { state: 'saving', message: null },
    }))
    saveDataset(dataset).then((res) => {
      if (cancelled) return
      setPersistenceStatus((s) => ({
        ...s,
        dataset: res.ok ? OK_PERSISTENCE : failedPersistence(res.error),
      }))
    })
    return () => {
      cancelled = true
    }
  }, [dataset, prefs.persistDataset])

  // ---- Danger zone -------------------------------------------------------
  // Note: confirmation is handled by callers (Settings page) before invoking.
  const clearLocalData = useCallback(async () => {
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
    setDashboardFiltersState({})
    setPersistenceStatus({
      prefs: OK_PERSISTENCE,
      charts: IDLE_PERSISTENCE,
      dataset: IDLE_PERSISTENCE,
    })
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
      dashboardFilters,
      setDashboardFilters,
      savedCharts,
      addChart,
      updateChart,
      deleteChart,
      prefs,
      updatePrefs,
      persistenceStatus,
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
      dashboardFilters,
      setDashboardFilters,
      prefs,
      updatePrefs,
      persistenceStatus,
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

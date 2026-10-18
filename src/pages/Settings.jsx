import { useEffect, useRef, useState } from 'react'
import {
  Palette,
  Database,
  AlertTriangle,
  ShieldCheck,
  Info,
  Trash2,
  Loader2,
} from 'lucide-react'
import { useData } from '../context/DataContext.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useToast } from '../components/Toast.jsx'
import { version } from '../../package.json'

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        <Icon size={18} className="text-indigo-600 dark:text-indigo-400" />
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Row({ title, description, control }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {control}
    </div>
  )
}

const STACK = [
  'React 18 + Vite',
  'Tailwind CSS 4 (class-based dark mode)',
  'Recharts',
  'PapaParse + SheetJS (xlsx)',
  'TanStack Table',
  'Lucide icons',
  'IndexedDB via idb',
]

export default function Settings() {
  const { theme, toggleTheme, prefs, updatePrefs, clearLocalData, persistenceStatus, dataset, savedCharts } =
    useData()
  const toast = useToast()
  const [clearing, setClearing] = useState(false)
  const clearWatchRef = useRef(false)

  const handleClearData = async () => {
    if (clearing) return
    setClearing(true)
    // Watch for the state to actually empty: clearLocalData shows its own
    // built-in confirmation, so if the user cancels there, nothing changes
    // and no misleading "cleared" toast is shown.
    clearWatchRef.current = true
    try {
      await clearLocalData()
    } finally {
      setClearing(false)
    }
  }

  // Fires only when a clear actually landed (charts and dataset emptied).
  useEffect(() => {
    if (!clearWatchRef.current) return
    if (savedCharts.length === 0 && dataset === null) {
      clearWatchRef.current = false
      toast.success('Local data cleared.')
    }
  }, [savedCharts, dataset, toast])

  const statusNote = (s, okText) => {
    if (!s) return null
    if (s.state === 'failed' && s.message) {
      return <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{s.message}</p>
    }
    if (s.state === 'saving') {
      return <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Saving…</p>
    }
    if (s.state === 'ok' && okText) {
      return <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{okText}</p>
    }
    return null
  }

  return (
    <div className="space-y-6">
      <Section icon={Palette} title="Appearance">
        <Row
          title="Theme"
          description={`Currently using ${theme} mode.`}
          control={
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Switch to {theme === 'dark' ? 'light' : 'dark'}
              </button>
            </div>
          }
        />
      </Section>

      <Section icon={Database} title="Data persistence">
        <Row
          title="Remember saved charts"
          description="Saved chart configurations are stored in this browser's local storage."
          control={
            <div className="text-right">
              <Toggle
                label="Remember saved charts"
                checked={prefs.persistCharts}
                onChange={(v) => updatePrefs({ persistCharts: v })}
              />
              {statusNote(persistenceStatus?.charts, 'Saved locally.')}
            </div>
          }
        />
        <Row
          title="Persist current dataset"
          description="Store the current dataset in this browser (IndexedDB) so it reloads on your next visit."
          control={
            <div className="text-right">
              <Toggle
                label="Persist current dataset"
                checked={prefs.persistDataset}
                onChange={(v) => updatePrefs({ persistDataset: v })}
              />
              {statusNote(persistenceStatus?.dataset, 'Dataset stored locally.')}
            </div>
          }
        />
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200/90">
          Browser storage can be cleared at any time by the browser or the user,
          and large datasets can exceed the storage quota. Datasets are only
          stored locally with your explicit consent (the toggle above) — nothing
          is ever uploaded to a server.
        </p>
      </Section>

      <Section icon={AlertTriangle} title="Danger zone">
        <Row
          title="Clear local data"
          description="Removes all saved charts, preferences, theme choice, and any persisted dataset from this browser. This cannot be undone."
          control={
            <button
              type="button"
              onClick={handleClearData}
              disabled={clearing}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-500 disabled:opacity-60"
            >
              {clearing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              {clearing ? 'Clearing…' : 'Clear local data'}
            </button>
          }
        />
      </Section>

      <Section icon={ShieldCheck} title="Privacy">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>
            DataPilot Analytics runs 100% client-side in your browser — there is
            no backend server.
          </li>
          <li>
            Your files, charts, and preferences never leave your device; nothing
            is uploaded, tracked, or shared.
          </li>
          <li>There is no authentication or account in this version.</li>
        </ul>
      </Section>

      <Section icon={Info} title="About">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-white">
            DataPilot Analytics <span className="font-normal">v{version}</span>
          </p>
          <p className="mt-1">
            A browser-only, self-service data analytics platform. No backend, no
            API keys.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Built with
          </p>
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {STACK.map((item) => (
              <li key={item} className="text-sm">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  )
}

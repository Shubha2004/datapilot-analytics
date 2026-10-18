import { Menu, Upload } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'
import { NAV_ITEMS } from './Sidebar.jsx'
import ThemeToggle from './ThemeToggle.jsx'

export default function Header({ onMenuClick, mobileOpen = false }) {
  const { page, setPage, dataset } = useData()
  const current = NAV_ITEMS.find((n) => n.id === page)

  return (
    <header className="no-print flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav-drawer"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors motion-reduce:transition-none hover:bg-slate-200 hover:text-slate-900 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <Menu size={20} />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
        {current?.label ?? 'Overview'}
      </h1>

      {/* Dataset status chip — shown only when a dataset is loaded */}
      {dataset && (
        <button
          type="button"
          onClick={() => setPage('explorer')}
          title="View dataset in Dataset Explorer"
          className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:border-indigo-300 hover:text-slate-900 sm:flex dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-slate-100"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="max-w-40 truncate">{dataset.name}</span>
          <span className="text-slate-500 dark:text-slate-400">
            {dataset.rows.length.toLocaleString()} rows
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setPage('overview')}
        title="Go to Overview to upload a file"
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors motion-reduce:transition-none hover:bg-indigo-500"
      >
        <Upload size={16} />
        <span className="hidden sm:inline">Upload data</span>
      </button>

      <ThemeToggle />
    </header>
  )
}

import {
  X,
  ChevronLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  Table2,
  ShieldCheck,
  BarChart3,
  Sigma,
  FileText,
  Settings,
} from 'lucide-react'
import { useData } from '../context/DataContext.jsx'

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'explorer', label: 'Dataset Explorer', icon: Table2 },
  { id: 'quality', label: 'Data Quality', icon: ShieldCheck },
  { id: 'charts', label: 'Chart Builder', icon: BarChart3 },
  { id: 'stats', label: 'Statistical Analysis', icon: Sigma },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function NavContent({ collapsed, onNavigate }) {
  const { page, setPage, dataset } = useData()

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={`flex h-16 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800 ${
          collapsed ? 'justify-center px-0' : ''
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Database size={20} strokeWidth={2.25} />
        </span>
        {!collapsed && (
          <span className="truncate text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            DataPilot
          </span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPage(item.id)
                onNavigate?.()
              }}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-0' : ''
              } ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Icon size={19} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer: active dataset */}
      <div
        className={`border-t border-slate-200 p-3 dark:border-slate-800 ${
          collapsed ? 'text-center' : ''
        }`}
      >
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Dataset
            </p>
            <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
              {dataset?.name ?? 'No dataset'}
            </p>
            {dataset && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {dataset.rows.length.toLocaleString()} rows
              </p>
            )}
          </div>
        ) : (
          <span
            className={`mx-auto block h-2.5 w-2.5 rounded-full ${
              dataset ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
            }`}
            title={dataset?.name ?? 'No dataset'}
          />
        )}
      </div>
    </div>
  )
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { sidebarCollapsed, toggleSidebar } = useData()

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`relative hidden shrink-0 border-r border-slate-200 bg-white transition-all duration-200 md:block dark:border-slate-800 dark:bg-slate-900 ${
          sidebarCollapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        <NavContent collapsed={sidebarCollapsed} />
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="no-print absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          {sidebarCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronLeft size={14} />
          )}
        </button>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${
          mobileOpen ? '' : 'pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-slate-950/60 transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onCloseMobile}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 bg-white shadow-xl transition-transform duration-200 dark:bg-slate-900 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-label="Navigation"
        >
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
          <NavContent collapsed={false} onNavigate={onCloseMobile} />
        </aside>
      </div>
    </>
  )
}

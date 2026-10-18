import { Info } from 'lucide-react'

/**
 * MetricCard — a single KPI tile.
 * Props: { icon: LucideIcon, label, value, sub, tooltip }
 * `tooltip` renders a small info affordance with a native `title` tooltip so
 * unfamiliar metrics are explained without cluttering the layout.
 */
export default function MetricCard({ icon: Icon, label, value, sub, tooltip }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow motion-reduce:transition-none hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
              <Icon size={20} />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {label}
            </p>
            <p
              className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white"
              title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
            >
              {value}
            </p>
          </div>
        </div>
        {tooltip && (
          <span
            title={tooltip}
            aria-label={tooltip}
            className="cursor-help text-slate-300 transition-colors hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
          >
            <Info size={14} />
          </span>
        )}
      </div>
      {sub && (
        <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
          {sub}
        </p>
      )}
    </div>
  )
}

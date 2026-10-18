export default function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
            <Icon size={20} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {label}
          </p>
          <p className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
      {sub && (
        <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
          {sub}
        </p>
      )}
    </div>
  )
}

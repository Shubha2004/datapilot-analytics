export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Icon size={24} />
        </span>
      )}
      <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      {message && (
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {message}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

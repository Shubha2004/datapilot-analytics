/**
 * DatasetPreview.jsx — compact preview of the active dataset: column names
 * with inferred types and per-column missing counts, plus the first few
 * sample rows. Links out to the full Dataset Explorer.
 */
import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { isMissing } from '../utils/dataTypes'

const TYPE_BADGE = {
  numeric: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  categorical: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  date: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  boolean: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
}

function formatCell(v) {
  if (isMissing(v)) return { text: '—', missing: true }
  const s = String(v)
  return { text: s.length > 40 ? s.slice(0, 39) + '…' : s, missing: false }
}

export default function DatasetPreview({ dataset, quality }) {
  const { setPage } = useData()

  const missingByCol = useMemo(() => {
    const map = new Map()
    for (const d of quality?.missingByColumn ?? []) map.set(d.column, d)
    return map
  }, [quality])

  const sampleRows = useMemo(
    () => (dataset ? dataset.rows.slice(0, 8) : []),
    [dataset],
  )

  if (!dataset) return null

  return (
    <section
      aria-label="Dataset preview"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800/60">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Dataset preview
        </h2>
        <button
          type="button"
          onClick={() => setPage('explorer')}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Open full explorer
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Column directory: names, inferred types, missing counts */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800/60 dark:text-slate-500">
              <th scope="col" className="px-4 py-2 font-medium">Column</th>
              <th scope="col" className="px-4 py-2 font-medium">Inferred type</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Missing</th>
            </tr>
          </thead>
          <tbody>
            {dataset.columns.map((c) => {
              const m = missingByCol.get(c.name)
              const missing = m?.missing ?? 0
              return (
                <tr
                  key={c.name}
                  className="border-b border-slate-50 last:border-0 dark:border-slate-800/40"
                >
                  <td className="max-w-[220px] truncate px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                    {c.name}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        TYPE_BADGE[c.type] || TYPE_BADGE.categorical
                      }`}
                    >
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    {missing > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {missing.toLocaleString()} ({(m?.pct ?? 0).toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">0</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* First ~8 sample rows */}
      <div className="border-t border-slate-100 dark:border-slate-800/60">
        <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
          First {sampleRows.length} row{sampleRows.length === 1 ? '' : 's'}
        </p>
        <div className="overflow-x-auto px-4 py-3">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500">
                {dataset.columns.map((c) => (
                  <th
                    key={c.name}
                    scope="col"
                    className="max-w-[160px] truncate px-2 py-1 font-medium"
                    title={c.name}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-slate-50 text-slate-600 dark:border-slate-800/40 dark:text-slate-400"
                >
                  {dataset.columns.map((c) => {
                    const cell = formatCell(row[c.name])
                    return (
                      <td
                        key={c.name}
                        className={`max-w-[160px] truncate px-2 py-1 ${
                          cell.missing ? 'text-slate-300 dark:text-slate-600' : ''
                        }`}
                        title={cell.text}
                      >
                        {cell.text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

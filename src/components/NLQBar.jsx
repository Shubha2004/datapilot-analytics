/**
 * NLQBar.jsx — natural-language query bar for DataPilot Analytics.
 * No props. Renders nothing when no dataset is loaded.
 */
import { useState } from 'react'
import {
  Search,
  Sparkles,
  Save,
  TriangleAlert,
  Lightbulb,
  LoaderCircle,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import ChartRenderer from './ChartRenderer'
import { parseNLQ, NLQ_EXAMPLES } from '../utils/nlq'
import { validateChartConfig } from '../utils/chartData'

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now())
}

const fmtCell = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—'
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return String(v)
}

/**
 * Build a ChartRenderer-ready { dataset, config } pair from the NLQ result
 * table. Rendering from the computed table (rather than the raw
 * chartConfig) keeps the chart faithful to the result: it preserves top-N
 * slicing and derived time columns (e.g. monthly buckets) that don't
 * exist in the source dataset.
 */
function previewFromTable(table, chartConfig) {
  const columns = (table && Array.isArray(table.columns)) ? table.columns : []
  const rows = (table && Array.isArray(table.rows)) ? table.rows : []
  const series = columns.slice(1)
  const type = chartConfig && chartConfig.type ? chartConfig.type : 'bar'

  if (type === 'pie' || series.length <= 1) {
    const yName = series[0] || 'value'
    return {
      dataset: {
        name: 'nlq-preview',
        columns: [
          { name: 'x', type: 'categorical' },
          { name: yName, type: 'numeric' },
        ],
        rows,
      },
      config: {
        id: 'nlq-preview',
        title: '',
        type,
        xKey: 'x',
        yKey: yName,
        aggregation: 'sum',
        groupKey: null,
        sort: 'none',
        filters: [],
      },
    }
  }

  const long = []
  for (const r of rows) {
    for (const s of series) {
      const v = r[s]
      long.push({ x: r.x, series: s, value: typeof v === 'number' ? v : null })
    }
  }
  return {
    dataset: {
      name: 'nlq-preview',
      columns: [
        { name: 'x', type: 'categorical' },
        { name: 'series', type: 'categorical' },
        { name: 'value', type: 'numeric' },
      ],
      rows: long,
    },
    config: {
      id: 'nlq-preview',
      title: '',
      type,
      xKey: 'x',
      yKey: 'value',
      aggregation: 'sum',
      groupKey: 'series',
      sort: 'none',
      filters: [],
    },
  }
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-11 pr-24 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500'

export default function NLQBar() {
  const { dataset, addChart } = useData()
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showAllExamples, setShowAllExamples] = useState(false)

  if (!dataset) return null

  const visibleExamples = showAllExamples ? NLQ_EXAMPLES : NLQ_EXAMPLES.slice(0, 6)

  const runQuery = (raw) => {
    const q = String(raw || '').trim()
    if (!q || thinking) return
    setThinking(true)
    setResult(null)
    setSavedFlash(false)
    window.setTimeout(() => {
      try {
        setResult(parseNLQ(q, dataset))
      } catch (e) {
        setResult({
          sql: null,
          chartConfig: null,
          table: null,
          error: e && e.message ? e.message : 'Something went wrong while answering.',
          suggestions: NLQ_EXAMPLES.slice(0, 3),
        })
      } finally {
        setThinking(false)
      }
    }, 350)
  }

  const submit = (e) => {
    if (e) e.preventDefault()
    runQuery(question)
  }

  const res = result
  const chartConfig = res && res.chartConfig ? res.chartConfig : null
  const table = res && res.table ? res.table : null
  const canSave =
    chartConfig && validateChartConfig(dataset, chartConfig).length === 0

  const handleSave = () => {
    if (!chartConfig) return
    addChart({ ...chartConfig, id: newId(), title: question.trim() || chartConfig.title })
    setSavedFlash(true)
  }

  let preview = null
  if (chartConfig && table) preview = previewFromTable(table, chartConfig)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <form onSubmit={submit} className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your data — e.g. “Top 5 products by revenue”"
          aria-label="Ask a question about your data"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={thinking || question.trim().length === 0}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {thinking ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
          Ask
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {visibleExamples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuestion(ex)
              runQuery(ex)
            }}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-950 dark:hover:text-indigo-300"
          >
            {ex}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAllExamples((s) => !s)}
          className="rounded-full px-3 py-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAllExamples ? 'Show fewer' : 'Show more'}
        </button>
      </div>

      {thinking && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <LoaderCircle size={16} className="animate-spin" />
          Thinking…
        </div>
      )}

      {res && !thinking && (
        <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          {res.error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                {res.error}
              </p>
              {Array.isArray(res.suggestions) && res.suggestions.length > 0 && (
                <div className="mt-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <Lightbulb size={13} /> Try one of these instead:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {res.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setQuestion(s)
                          runQuery(s)
                        }}
                        className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {res.sql && (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Generated SQL — illustrative, computed in-browser (read-only)
                  </p>
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-700">
                    {res.sql}
                  </pre>
                </div>
              )}

              {preview && (
                <div>
                  <ChartRenderer
                    config={{ ...preview.config, title: question.trim() }}
                    dataset={preview.dataset}
                    height={320}
                  />
                </div>
              )}

              {table && Array.isArray(table.columns) && table.columns.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                        {table.columns.map((c) => (
                          <th
                            key={c}
                            className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(table.rows || []).slice(0, 50).map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                        >
                          {table.columns.map((c) => (
                            <td key={c} className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                              {fmtCell(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(table.rows || []).length > 50 && (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      Showing first 50 of {table.rows.length.toLocaleString('en-US')} rows.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                {chartConfig && canSave && (
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                  >
                    <Save size={15} />
                    Save as chart
                  </button>
                )}
                {chartConfig && !canSave && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    This answer uses a derived column and can’t be saved as a chart directly.
                  </p>
                )}
                {savedFlash && (
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Saved — find it in the Chart Builder gallery.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

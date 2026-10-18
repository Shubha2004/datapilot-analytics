/**
 * Reports.jsx — printable analytics report for DataPilot Analytics.
 * Toolbar actions are wrapped in .no-print (hidden by the print stylesheet).
 */
import { useMemo, useRef } from 'react'
import {
  Download,
  Printer,
  FileText,
  Lightbulb,
  ChartColumn,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import ChartRenderer from '../components/ChartRenderer'
import EmptyState from '../components/EmptyState'
import { exportDatasetCSV, downloadChartPNG, triggerPrint } from '../utils/exportUtils'
import { useToast } from '../components/Toast'
import { analyzeQuality } from '../utils/cleaning'
import { generateInsights } from '../utils/insights'
import { describeColumn } from '../utils/statistics'

const sectionCls =
  'rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none'
const metaRowCls =
  'border-b border-slate-100 last:border-0 dark:border-slate-800/60'

function Section({ icon: Icon, number, title, children }) {
  return (
    <section className={sectionCls}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        {number && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600/10 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            {number}
          </span>
        )}
        {Icon && <Icon size={18} className="text-indigo-600 dark:text-indigo-400" />}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

const KIND_STYLE = {
  info: {
    border: 'border-blue-200 dark:border-blue-900/60',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />,
    title: 'text-blue-900 dark:text-blue-100',
    body: 'text-blue-800 dark:text-blue-200',
  },
  warning: {
    border: 'border-amber-200 dark:border-amber-900/60',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    icon: <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />,
    title: 'text-amber-900 dark:text-amber-100',
    body: 'text-amber-800 dark:text-amber-200',
  },
  success: {
    border: 'border-emerald-200 dark:border-emerald-900/60',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    icon: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />,
    title: 'text-emerald-900 dark:text-emerald-100',
    body: 'text-emerald-800 dark:text-emerald-200',
  },
}

export default function Reports() {
  const { dataset, savedCharts, setPage } = useData()
  const toast = useToast()
  const chartRefs = useRef({})

  const quality = useMemo(() => (dataset ? analyzeQuality(dataset) : null), [dataset])
  const insights = useMemo(() => (dataset ? generateInsights(dataset) : []), [dataset])

  if (!dataset) {
    return (
      <EmptyState
        icon={FileText}
        title="Upload a dataset to generate a report"
        message="Import a CSV or spreadsheet file first — the report summarizes metadata, statistics, quality findings and your saved charts."
      />
    )
  }

  const rowCount = dataset.rows.length
  const colCount = dataset.columns.length
  const totalMissing = quality.missingByColumn.reduce((s, m) => s + m.missing, 0)
  const totalCells = rowCount * colCount
  const completeness = totalCells > 0 ? ((1 - totalMissing / totalCells) * 100).toFixed(1) : '—'

  const meta = dataset.meta || {}
  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const uploadedAt = meta.uploadedAt ? new Date(meta.uploadedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) : '—'

  const metaRows = [
    ['Dataset name', dataset.name || '—'],
    ['Source', meta.source || '—'],
    ['Rows', rowCount.toLocaleString('en-US')],
    ['Columns', colCount.toLocaleString('en-US')],
    ['Uploaded', uploadedAt],
    ['Completeness', `${completeness}%`],
  ]

  const numericCols = dataset.columns.filter((c) => c.type === 'numeric')
  const summaryRows = numericCols.map((c) => ({
    name: c.name,
    ...describeColumn(dataset.rows.map((r) => r[c.name])),
  }))

  const fmt = (v) =>
    v === null || v === undefined || Number.isNaN(v)
      ? '—'
      : Number(v.toFixed(2)).toLocaleString('en-US')

  const qualityFindings = []
  if (totalMissing > 0) {
    const worst = [...quality.missingByColumn]
      .filter((m) => m.missing > 0)
      .sort((a, b) => b.missing - a.missing)
      .slice(0, 5)
    qualityFindings.push({
      id: 'missing',
      text: `${totalMissing.toLocaleString('en-US')} missing values across the dataset. Most affected: ${worst.map((w) => `${w.column} (${w.missing.toLocaleString('en-US')})`).join(', ')}.`,
    })
  } else {
    qualityFindings.push({ id: 'missing', text: 'No missing values — every cell is populated.' })
  }
  qualityFindings.push({
    id: 'duplicates',
    text:
      quality.duplicateRows > 0
        ? `${quality.duplicateRows.toLocaleString('en-US')} duplicate row(s) detected.`
        : 'No duplicate rows detected.',
  })
  if (quality.outliers.length > 0) {
    qualityFindings.push({
      id: 'outliers',
      text: `Outliers found in: ${quality.outliers.map((o) => `${o.column} (${o.count})`).join(', ')} (1.5 × IQR rule).`,
    })
  } else {
    qualityFindings.push({ id: 'outliers', text: 'No outliers detected in numeric columns.' })
  }
  if (quality.singleValueColumns.length > 0) {
    qualityFindings.push({
      id: 'single',
      text: `Single-value columns (no analytical variance): ${quality.singleValueColumns.join(', ')}.`,
    })
  }

  const exportPNG = async (chart) => {
    try {
      const svg = chartRefs.current[chart.id]
        ? chartRefs.current[chart.id].querySelector('svg')
        : null
      await downloadChartPNG(svg, `${chart.title || 'chart'}.png`)
      toast.success(`Chart exported: ${chart.title || 'chart'}.png`)
    } catch (e) {
      toast.error(`PNG export failed: ${e && e.message ? e.message : e}`)
    }
  }

  const exportFullCSV = () => {
    try {
      exportDatasetCSV(dataset)
      toast.success('Full dataset exported to CSV.')
    } catch (e) {
      toast.error(`CSV export failed: ${e && e.message ? e.message : e}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar — hidden when printing */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={exportFullCSV}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <Download size={15} />
          Export full dataset (CSV)
        </button>
        <button
          type="button"
          onClick={triggerPrint}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
        >
          <Printer size={15} />
          Print / Save as PDF
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tip: use your browser’s Print dialog → “Save as PDF”.
        </p>
      </div>

      {/* Report preview */}
      <div id="report-print" className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none">
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            DataPilot Analytics Report
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {dataset.name || 'Untitled dataset'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Generated {generatedAt} · {rowCount.toLocaleString('en-US')} rows ·{' '}
            {colCount.toLocaleString('en-US')} columns
          </p>
        </div>

        <Section number="1" title="Dataset metadata">
          <table className="w-full text-left text-sm">
            <tbody>
              {metaRows.map(([k, v]) => (
                <tr key={k} className={metaRowCls}>
                  <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                    {k}
                  </td>
                  <td className="py-2 text-slate-600 dark:text-slate-300">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section number="2" title="Summary statistics">
          {summaryRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No numeric columns to summarize.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Column', 'Mean', 'Median', 'Min', 'Max', 'Count'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.name} className={metaRowCls}>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{fmt(r.mean)}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{fmt(r.median)}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{fmt(r.min)}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{fmt(r.max)}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">
                        {r.count.toLocaleString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section number="3" title="Data quality findings">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
            {qualityFindings.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </Section>

        <Section icon={Lightbulb} number="4" title="Key insights">
          {insights.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No automatic insights were generated for this dataset.
            </p>
          ) : (
            <div className="space-y-3">
              {insights.map((ins) => {
                const style = KIND_STYLE[ins.kind] || KIND_STYLE.info
                return (
                  <div
                    key={ins.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-3.5 ${style.border} ${style.bg}`}
                  >
                    {style.icon}
                    <div>
                      <p className={`text-sm font-semibold ${style.title}`}>{ins.title}</p>
                      <p className={`mt-0.5 text-sm ${style.body}`}>{ins.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section number="5" title="Saved charts">
          {savedCharts.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <ChartColumn size={20} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  No saved charts yet
                </p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Head to the Chart Builder to design charts — anything you save will
                  appear here and in the printed report.
                </p>
                <button
                  type="button"
                  onClick={() => setPage('charts')}
                  className="no-print mt-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                >
                  Open Chart Builder
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {savedCharts.map((chart) => (
                <div
                  key={chart.id}
                  ref={(el) => {
                    chartRefs.current[chart.id] = el
                  }}
                  className="break-inside-avoid rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {chart.title || 'Untitled chart'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => exportPNG(chart)}
                      className="no-print flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
                    >
                      <Download size={13} />
                      Download PNG
                    </button>
                  </div>
                  <ChartRenderer config={chart} dataset={dataset} height={280} />
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

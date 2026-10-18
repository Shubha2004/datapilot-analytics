/**
 * Reports.jsx — printable analytics report for DataPilot Analytics.
 * Toolbar actions are wrapped in .no-print (hidden by the print stylesheet).
 *
 * Key insights render as rich InsightCard components (rule-based findings).
 * The Consolidated report section is powered by buildReportData
 * from ../utils/reportBuilder.js. "Export KPI summary (CSV)" and "Export
 * quality report (CSV)" toolbar buttons render when exportUtils exposes
 * those functions.
 */
import { useMemo, useRef } from 'react'
import {
  Download,
  Printer,
  FileText,
  Lightbulb,
  ChartColumn,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import ChartRenderer from '../components/ChartRenderer'
import EmptyState from '../components/EmptyState'
import InsightCard from '../components/InsightCard'
import {
  exportDatasetCSV,
  downloadChartPNG,
  triggerPrint,
} from '../utils/exportUtils'
import * as exportUtilsNS from '../utils/exportUtils'
import { useToast } from '../components/Toast'
import { analyzeQuality } from '../utils/cleaning'
import { buildReportData } from '../utils/reportBuilder'
import { generateInsights } from '../utils/insights'
import { describeColumn } from '../utils/statistics'
import { computeKPIs } from '../utils/kpis'

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

const fmtMoneyCell = (v) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : '$' +
      Number(v.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 })
const fmtIntCell = (v) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : Math.round(Number(v)).toLocaleString('en-US')
const fmtDateCell = (v) => {
  const d = new Date(v)
  return Number.isNaN(+d)
    ? String(v)
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function asList(v) {
  if (v === null || v === undefined) return []
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(String)
  if (typeof v === 'object')
    return Object.entries(v).map(([k, val]) => `${k}: ${val === null || val === undefined ? '—' : String(val)}`)
  return [String(v)]
}

export default function Reports() {
  // dashboardFilters is added by a parallel worker — read defensively.
  const { dataset, savedCharts, setPage, dashboardFilters } = useData()
  const toast = useToast()
  const chartRefs = useRef({})

  const filters = dashboardFilters ?? {}

  const quality = useMemo(() => (dataset ? analyzeQuality(dataset) : null), [dataset])
  const insights = useMemo(() => (dataset ? generateInsights(dataset) : []), [dataset])
  const kpis = useMemo(() => {
    if (!dataset) return null
    try {
      return computeKPIs(dataset, { filters })
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, dashboardFilters])

  const analysisPeriod = useMemo(() => {
    if (!dataset) return null
    const dateCol = dataset.columns.find((c) => c.type === 'date')
    if (!dateCol) return null
    const dates = dataset.rows
      .map((r) => r[dateCol.name])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(String)
      .sort()
    if (dates.length === 0) return null
    return `${fmtDateCell(dates[0])} → ${fmtDateCell(dates[dates.length - 1])}`
  }, [dataset])

  // Consolidated report builder (statically imported; module is part of the build).
  const consolidated = useMemo(() => {
    if (!dataset) return null
    try {
      return (
        buildReportData({
          dataset,
          kpis,
          quality,
          insights,
          filters,
          savedCharts,
        }) || null
      )
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildReportData, dataset, kpis, quality, insights, dashboardFilters, savedCharts])

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

  // Optional Worker-C export helpers — buttons only render when present.
  const canExportKPI = typeof exportUtilsNS.exportKPISummaryCSV === 'function'
  const canExportDQ = typeof exportUtilsNS.exportDQReportCSV === 'function'

  const exportKPISummary = () => {
    try {
      exportUtilsNS.exportKPISummaryCSV(kpis, dataset.name)
      toast.success('KPI summary exported to CSV.')
    } catch (e) {
      toast.error(`KPI export failed: ${e && e.message ? e.message : e}`)
    }
  }

  const exportDQReport = () => {
    try {
      // auditLog lives on dataset.meta once the Data Quality page records it.
      const auditLog =
        dataset.meta && Array.isArray(dataset.meta.auditLog) ? dataset.meta.auditLog : []
      exportUtilsNS.exportDQReportCSV(dataset.name, quality, auditLog)
      toast.success('Data-quality report exported to CSV.')
    } catch (e) {
      toast.error(`Quality export failed: ${e && e.message ? e.message : e}`)
    }
  }

  /* ---------------- Consolidated report (optional) ---------------- */
  const reportName = (consolidated && consolidated.datasetName) || dataset.name || '—'
  const reportGeneratedAt = (() => {
    const g = consolidated && consolidated.generatedAt
    if (!g) return generatedAt
    const d = new Date(g)
    return Number.isNaN(+d)
      ? String(g)
      : d.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
  })()
  const reportPeriod = (() => {
    const ap = consolidated && consolidated.analysisPeriod
    if (ap && typeof ap === 'object') {
      if (ap.from && ap.to) return `${fmtDateCell(ap.from)} → ${fmtDateCell(ap.to)}`
      return '—'
    }
    return ap || analysisPeriod || '—'
  })()
  const reportFilters =
    (consolidated && consolidated.filters !== undefined && consolidated.filters !== null
      ? consolidated.filters
      : filters) || {}
  const filterEntries =
    reportFilters && typeof reportFilters === 'object'
      ? Object.entries(reportFilters).filter(([, v]) => v !== null && v !== undefined && v !== '')
      : []
  const reportKpis = (consolidated && consolidated.kpis) || kpis
  const kpiTableRows = reportKpis
    ? [
        ['Total revenue', fmtMoneyCell(reportKpis.totalRevenue)],
        ['Total orders', fmtIntCell(reportKpis.totalOrders)],
        ['Units sold', fmtIntCell(reportKpis.unitsSold)],
        ['Average order value', fmtMoneyCell(reportKpis.avgOrderValue)],
        [
          'Revenue growth (MoM)',
          reportKpis.revenueGrowthPct === null || reportKpis.revenueGrowthPct === undefined
            ? reportKpis.growthNote || '—'
            : `${reportKpis.revenueGrowthPct >= 0 ? '+' : ''}${Number(reportKpis.revenueGrowthPct).toFixed(1)}%`,
        ],
        [
          'Data completeness',
          reportKpis.dataCompleteness === null || reportKpis.dataCompleteness === undefined
            ? '—'
            : `${Number(reportKpis.dataCompleteness).toFixed(1)}%`,
        ],
      ]
    : []
  const reportQuality =
    (consolidated && consolidated.qualitySummary) ||
    qualityFindings.map((f) => f.text)
  const reportInsights = (consolidated && consolidated.insights) || insights
  const reportChartSummaries =
    (consolidated && consolidated.chartSummaries) ||
    savedCharts.map((c) => ({
      title: c.title || 'Untitled chart',
      type: c.type || c.chartType || 'chart',
    }))
  const reportLimitations =
    (consolidated && consolidated.limitations) ||
    (reportKpis && reportKpis.warnings) ||
    []
  const reportAssumptions =
    (consolidated && consolidated.assumptions) ||
    (reportKpis && reportKpis.assumptions) ||
    []

  const toolbarBtnCls =
    'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400'

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
        {canExportKPI && (
          <button type="button" onClick={exportKPISummary} className={toolbarBtnCls}>
            <Download size={15} />
            Export KPI summary (CSV)
          </button>
        )}
        {canExportDQ && (
          <button type="button" onClick={exportDQReport} className={toolbarBtnCls}>
            <Download size={15} />
            Export quality report (CSV)
          </button>
        )}
        <button
          type="button"
          onClick={triggerPrint}
          className={toolbarBtnCls}
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
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Automatically generated by rule-based checks — no AI involved.
          </p>
          {insights.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No automatic insights were generated for this dataset.
            </p>
          ) : (
            <div className="space-y-3">
              {insights.map((ins) => (
                <InsightCard key={ins.id} insight={ins} />
              ))}
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

        {consolidated && (
          <Section icon={FileText} number="6" title="Consolidated report">
            <div className="space-y-5 text-sm">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {reportName}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Generated {reportGeneratedAt}
                  {reportPeriod !== '—' && ` · Analysis period: ${reportPeriod}`}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Applied filters
                </h4>
                {filterEntries.length === 0 ? (
                  <p className="mt-1 text-slate-600 dark:text-slate-300">None — full dataset analyzed.</p>
                ) : (
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {filterEntries.map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <dt className="font-medium text-slate-700 dark:text-slate-300">{k}:</dt>
                        <dd className="text-slate-600 dark:text-slate-400">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {kpiTableRows.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    KPI summary
                  </h4>
                  <table className="mt-1 w-full max-w-xl text-left text-sm">
                    <tbody>
                      {kpiTableRows.map(([k, v]) => (
                        <tr key={k} className={metaRowCls}>
                          <td className="py-1.5 pr-4 font-medium text-slate-800 dark:text-slate-200">
                            {k}
                          </td>
                          <td className="py-1.5 font-mono text-slate-600 dark:text-slate-300">
                            {v}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Data quality summary
                </h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-200">
                  {asList(reportQuality).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Insights
                </h4>
                <div className="mt-2 space-y-3">
                  {reportInsights.map((ins) => (
                    <InsightCard key={ins.id || ins.title} insight={ins} />
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Chart summaries
                </h4>
                {reportChartSummaries.length === 0 ? (
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    No charts saved for this dataset.
                  </p>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-200">
                    {reportChartSummaries.map((c, i) => (
                      <li key={i}>
                        {typeof c === 'string' ? c : `${c.title || 'Untitled chart'} (${c.type || 'chart'})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {asList(reportAssumptions).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Assumptions
                  </h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-200">
                    {asList(reportAssumptions).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {asList(reportLimitations).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Limitations
                  </h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-200">
                    {asList(reportLimitations).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

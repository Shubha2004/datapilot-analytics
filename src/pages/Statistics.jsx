/**
 * Statistics.jsx — descriptive statistics, correlation, distribution,
 * confidence intervals and a one-sample t-test for DataPilot Analytics.
 */
import { useMemo, useState } from 'react'
import { Sigma, FlaskConical, Info, Table2, ChartColumn, TrendingUp, Hash, GitCompareArrows } from 'lucide-react'
import { useData } from '../context/DataContext'
import ChartRenderer from '../components/ChartRenderer'
import MetricCard from '../components/MetricCard'
import EmptyState from '../components/EmptyState'
import {
  describeColumn,
  correlationMatrix,
  meanCI,
  tTestOneSample,
} from '../utils/statistics'

const fmt = (v, digits = 4) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v)
  return Number(v.toFixed(digits)).toLocaleString('en-US')
}

const sectionCls =
  'rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900'
const selectCls =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const inputCls =
  'w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

function Section({ icon: Icon, title, children }) {
  return (
    <section className={sectionCls}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        <Icon size={18} className="text-indigo-600 dark:text-indigo-400" />
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function Statistics() {
  const { dataset } = useData()

  const numericCols = useMemo(
    () =>
      dataset && Array.isArray(dataset.columns)
        ? dataset.columns.filter((c) => c.type === 'numeric')
        : [],
    [dataset],
  )

  const [selected, setSelected] = useState(null)
  const [mu0Text, setMu0Text] = useState(null)

  if (!dataset) {
    return (
      <EmptyState
        icon={Sigma}
        title="Upload a dataset to explore statistics"
        message="Import a CSV or spreadsheet file first — descriptive stats, correlations and inference live here."
      />
    )
  }

  if (numericCols.length === 0) {
    return (
      <EmptyState
        icon={Table2}
        title="No numeric columns found"
        message="This dataset has no columns that look numeric, so there is nothing to describe yet."
      />
    )
  }

  const col = selected && numericCols.some((c) => c.name === selected)
    ? selected
    : numericCols[0].name

  const values = useMemo(
    () => dataset.rows.map((r) => r[col]),
    [dataset, col],
  )
  const stats = useMemo(() => describeColumn(values), [values])

  if (stats.count === 0) {
    return (
      <EmptyState
        icon={Table2}
        title="No numeric values in this column"
        message={`Column “${col}” has no non-missing numeric values to summarize.`}
      />
    )
  }

  if (mu0Text === null) {
    setMu0Text(stats.mean === null ? '' : String(Math.round(stats.mean * 100) / 100))
  }

  const ci = meanCI(values)
  const ciAssumptions = ci.method ? ci.method.split(';').map((s) => s.trim()).filter(Boolean) : []
  const mu0 = parseFloat(mu0Text)
  const test = tTestOneSample(values, Number.isFinite(mu0) ? mu0 : NaN)

  const corrCols = numericCols.slice(0, 8).map((c) => c.name)
  const corr = correlationMatrix(dataset.rows, corrCols)

  const statRows = [
    { label: 'Count', value: stats.count.toLocaleString('en-US'), def: 'Number of non-missing numeric values.' },
    { label: 'Missing', value: stats.missing.toLocaleString('en-US'), def: 'Number of missing values in this column.' },
    { label: 'Sum', value: fmt(stats.sum), def: 'Total of all non-missing values.' },
    { label: 'Mean', value: fmt(stats.mean), def: 'Arithmetic average of the non-missing values.' },
    { label: 'Median', value: fmt(stats.median), def: 'Middle value — half the values lie below it.' },
    {
      label: 'Mode(s)',
      value: stats.mode.length > 0 ? stats.mode.map((m) => fmt(m)).join(', ') : '—',
      def: 'Most frequent value(s); none when every value is unique.',
    },
    { label: 'Min', value: fmt(stats.min), def: 'Smallest non-missing value.' },
    { label: 'Max', value: fmt(stats.max), def: 'Largest non-missing value.' },
    { label: 'Range', value: fmt(stats.range), def: 'Max minus min.' },
    { label: 'Variance (sample)', value: fmt(stats.varSample), def: 'Spread computed with n−1; estimates the population variance.' },
    { label: 'Variance (population)', value: fmt(stats.varPop), def: 'Spread computed with n; describes only this dataset.' },
    { label: 'Std dev (sample)', value: fmt(stats.stdSample), def: 'Square root of the sample variance.' },
    { label: 'Std dev (population)', value: fmt(stats.stdPop), def: 'Square root of the population variance.' },
    { label: 'Q1', value: fmt(stats.q1), def: '25th percentile — a quarter of values lie below it.' },
    { label: 'Q3', value: fmt(stats.q3), def: '75th percentile — three quarters of values lie below it.' },
    { label: 'IQR', value: fmt(stats.iqr), def: 'Interquartile range (Q3 − Q1): spread of the middle half.' },
    { label: 'P5', value: fmt(stats.p5), def: '5th percentile — 95% of values lie above it.' },
    { label: 'P95', value: fmt(stats.p95), def: '95th percentile — 95% of values lie below it.' },
    { label: 'Outlier count', value: stats.outlierCount.toLocaleString('en-US'), def: 'Values beyond 1.5 × IQR from Q1 or Q3.' },
  ]

  const histConfig = {
    id: 'stats-dist',
    title: '',
    type: 'histogram',
    xKey: col,
    yKey: null,
    aggregation: 'count',
    groupKey: null,
    sort: 'none',
    filters: [],
  }

  const cellColor = (r) => {
    if (r === null) return {}
    const a = Math.min(1, Math.abs(r))
    return {
      backgroundColor: `rgba(99, 102, 241, ${0.08 + 0.72 * a})`,
      color: a > 0.45 ? '#ffffff' : undefined,
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Statistics
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Descriptive summaries, correlations and quick inference.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Column
          </span>
          <select
            value={col}
            onChange={(e) => setSelected(e.target.value)}
            className={selectCls}
          >
            {numericCols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Sigma} label="Mean" value={fmt(stats.mean)} sub={col} />
        <MetricCard icon={TrendingUp} label="Median" value={fmt(stats.median)} sub={col} />
        <MetricCard icon={GitCompareArrows} label="Std dev (sample)" value={fmt(stats.stdSample)} sub={col} />
        <MetricCard icon={Hash} label="Count" value={stats.count.toLocaleString('en-US')} sub={`${stats.missing.toLocaleString('en-US')} missing`} />
      </div>

      <Section icon={Table2} title={`Descriptive statistics — ${col}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody>
              {statRows.map((r) => (
                <tr
                  key={r.label}
                  title={r.def}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                    {r.label}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-400 dark:text-slate-500">
                    {r.def}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-900 dark:text-slate-100">
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section icon={ChartColumn} title="Distribution">
        <ChartRenderer config={histConfig} dataset={dataset} height={260} />
      </Section>

      <Section icon={GitCompareArrows} title="Correlation matrix">
        {numericCols.length > 8 && (
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Showing the first 8 of {numericCols.length} numeric columns.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-1" />
                {corr.columns.map((c) => (
                  <th
                    key={c}
                    className="max-w-[96px] truncate p-1.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                    title={c}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corr.columns.map((row, i) => (
                <tr key={row}>
                  <th
                    className="max-w-[96px] truncate p-1.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                    title={row}
                  >
                    {row}
                  </th>
                  {corr.matrix[i].map((r, j) => (
                    <td key={j} className="p-0.5">
                      <div
                        style={cellColor(r)}
                        title={r === null ? 'Insufficient data' : `r = ${r.toFixed(3)}`}
                        className="flex h-10 min-w-[64px] items-center justify-center rounded-md border border-slate-200 font-mono text-xs text-slate-700 dark:border-slate-800 dark:text-slate-200"
                      >
                        {r === null ? '—' : r.toFixed(2)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs italic text-slate-500 dark:text-slate-400">
          Correlation measures association, not causation.
        </p>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={Info} title="Confidence interval for the mean">
          {ci.lower === null ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not enough data — at least 2 non-missing values are needed.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                We are 95% confident the true mean lies in{' '}
                <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  [{fmt(ci.lower)}, {fmt(ci.upper)}]
                </span>
                .
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sample mean {fmt(ci.mean)} · n = {ci.n.toLocaleString('en-US')} · standard
                error {fmt(ci.se)}
              </p>
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Assumptions
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                  {ciAssumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Section>

        <Section icon={FlaskConical} title="One-sample t-test">
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            Population mean = H₀
            <input
              type="number"
              value={mu0Text === null ? '' : mu0Text}
              onChange={(e) => setMu0Text(e.target.value)}
              className={inputCls}
              aria-label="Hypothesized population mean"
            />
          </label>
          {!Number.isFinite(mu0) ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Enter a numeric hypothesized mean to run the test.
            </p>
          ) : test.t === null ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Not enough data — at least 2 non-missing values with non-zero spread are needed.
            </p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">t-statistic</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{fmt(test.t)}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Degrees of freedom</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{test.df}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Critical value (α = {test.alpha})</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{fmt(test.criticalValue)}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Approx. p-value</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{fmt(test.pApprox)}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Verdict</dt>
                <dd
                  className={`font-semibold ${
                    test.reject
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {test.reject ? 'Reject H₀' : 'Fail to reject H₀'}
                </dd>
              </dl>
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Assumptions
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                  {test.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
              <p className="mt-3 text-xs italic text-slate-500 dark:text-slate-400">
                Approximate; for exploratory use.
              </p>
            </>
          )}
        </Section>
      </div>
    </div>
  )
}

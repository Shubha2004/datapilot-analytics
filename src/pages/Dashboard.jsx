/**
 * Dashboard.jsx — page id 'overview'.
 * Hero + FileUploader when no dataset; KPI grid, summary cards, suggested
 * charts and insights when a dataset is loaded.
 */
import { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle,
  ChevronDown,
  Copy,
  Database,
  Hash,
  LayoutGrid,
  Sparkles,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { isMissing } from '../utils/dataTypes';
import { generateInsights } from '../utils/insights';
import { suggestCharts } from '../utils/chartData';
import { analyzeQuality } from '../utils/cleaning';
import FileUploader from '../components/FileUploader';
import NLQBar from '../components/NLQBar';
import MetricCard from '../components/MetricCard';
import EmptyState from '../components/EmptyState';
import ChartRenderer from '../components/ChartRenderer';
import InsightCard from '../components/InsightCard';

function formatBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Card({ title, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      {children}
    </div>
  );
}

const TYPE_BADGE = {
  numeric:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  categorical:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  date: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  boolean:
    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
};

export default function Dashboard() {
  const { dataset, savedCharts } = useData();
  const [changeOpen, setChangeOpen] = useState(false);

  /* ---------------- KPI stats ---------------- */
  const stats = useMemo(() => {
    if (!dataset) return null;
    const rows = dataset.rows;
    const columns = dataset.columns;
    const nCols = columns.length;
    const nRows = rows.length;
    const numericCols = columns.filter((c) => c.type === 'numeric');
    const categoricalCols = columns.filter((c) => c.type === 'categorical');

    let missingCells = 0;
    const seen = new Set();
    let dupRows = 0;
    for (const row of rows) {
      for (const c of columns) {
        if (isMissing(row[c.name])) missingCells++;
      }
      const key = JSON.stringify(row, Object.keys(row).sort());
      if (seen.has(key)) dupRows++;
      else seen.add(key);
    }
    const totalCells = nRows * nCols;
    const completeness = totalCells === 0 ? 100 : (1 - missingCells / totalCells) * 100;

    return {
      nRows,
      nCols,
      numericCols: numericCols.length,
      categoricalCols: categoricalCols.length,
      missingCells,
      dupRows,
      completeness,
      charts: savedCharts.length,
    };
  }, [dataset, savedCharts.length]);

  /* ---------------- quality + suggestions ---------------- */
  const quality = useMemo(
    () => (dataset ? analyzeQuality(dataset) : null),
    [dataset],
  );
  const missingTop5 = useMemo(() => {
    if (!quality) return [];
    return [...quality.missingByColumn]
      .sort((a, b) => b.pct - a.pct)
      .filter((d) => d.missing > 0)
      .slice(0, 5);
  }, [quality]);

  const suggestions = useMemo(
    () => (dataset ? suggestCharts(dataset) : []),
    [dataset],
  );
  const insights = useMemo(
    () => (dataset ? generateInsights(dataset) : []),
    [dataset],
  );

  const firstNumeric = dataset?.columns.find((c) => c.type === 'numeric');
  const firstCategorical = dataset?.columns.find(
    (c) => c.type === 'categorical',
  );

  const histConfig = useMemo(
    () =>
      firstNumeric
        ? {
            id: 'dash-histogram',
            title: `${firstNumeric.name} distribution`,
            type: 'histogram',
            xKey: firstNumeric.name,
          }
        : null,
    [firstNumeric],
  );

  /* Category frequency, limited to top 8: build a view dataset that only
     contains rows from the top-8 categories so ChartRenderer renders 8 bars. */
  const { top8View, catFreqConfig } = useMemo(() => {
    if (!dataset || !firstCategorical) return { top8View: null, catFreqConfig: null };
    const rows = dataset.rows;
    const counts = new Map();
    for (const r of rows) {
      const v = r[firstCategorical.name];
      if (isMissing(v)) continue;
      const k = String(v);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const top8 = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
    const keep = new Set(top8);
    return {
      top8View: {
        ...dataset,
        rows: rows.filter((r) => keep.has(String(r[firstCategorical.name]))),
      },
      catFreqConfig: {
        id: 'dash-catfreq',
        title: `Top 8 ${firstCategorical.name} by count`,
        type: 'bar',
        xKey: firstCategorical.name,
        yKey: null,
        aggregation: 'count',
        groupKey: null,
        sort: 'desc',
        filters: [],
      },
    };
  }, [dataset, firstCategorical]);

  /* ---------------- no dataset: hero ---------------- */
  if (!dataset) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
            <Sparkles size={28} />
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Turn raw files into insights
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            Upload a CSV or Excel file to get an instant dashboard — clean data,
            auto-generated charts, and plain-English insights. Everything runs
            in your browser; your data never leaves this device.
          </p>
        </div>
        <FileUploader />
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Prefer to explore first? Load the sample dataset — it is generated
          locally in your browser and clearly marked SAMPLE.
        </p>
      </div>
    );
  }

  /* ---------------- dataset loaded ---------------- */
  const s = stats;
  const source = dataset.meta?.source;
  const fileSize = formatBytes(dataset.meta?.fileSize);

  return (
    <div className="space-y-6">
      <NLQBar />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={Database}
          label="Total rows"
          value={s.nRows.toLocaleString()}
          sub={`${s.nCols} columns`}
        />
        <MetricCard
          icon={LayoutGrid}
          label="Columns"
          value={s.nCols}
          sub={`${s.numericCols} numeric · ${s.categoricalCols} categorical`}
        />
        <MetricCard
          icon={Hash}
          label="Numeric columns"
          value={s.numericCols}
          sub={s.numericCols === 1 ? '1 numeric column' : `${s.numericCols} columns`}
        />
        <MetricCard
          icon={Tag}
          label="Categorical columns"
          value={s.categoricalCols}
          sub={s.categoricalCols === 1 ? '1 categorical column' : `${s.categoricalCols} columns`}
        />
        <MetricCard
          icon={AlertCircle}
          label="Missing cells"
          value={s.missingCells.toLocaleString()}
          sub={`${(100 - s.completeness).toFixed(1)}% of all cells`}
        />
        <MetricCard
          icon={Copy}
          label="Duplicate rows"
          value={s.dupRows.toLocaleString()}
          sub={s.dupRows > 0 ? 'review in Data Quality' : 'no duplicates found'}
        />
        <MetricCard
          icon={CheckCircle}
          label="Completeness"
          value={`${s.completeness.toFixed(1)}%`}
          sub="share of non-missing cells"
        />
        <MetricCard
          icon={BarChart3}
          label="Charts created"
          value={s.charts}
          sub={s.charts === 1 ? '1 saved chart' : `${s.charts} saved charts`}
        />
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Dataset summary">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                {dataset.name}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  source === 'sample'
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {source === 'sample' ? 'SAMPLE DATA' : source || 'UPLOAD'}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              {s.nRows.toLocaleString()} rows × {s.nCols} columns
            </p>
            <p className="text-slate-500 dark:text-slate-400">
              Uploaded {formatDate(dataset.meta?.uploadedAt)}
            </p>
            {fileSize && (
              <p className="text-slate-500 dark:text-slate-400">
                File size {fileSize}
              </p>
            )}
            {dataset.meta?.note && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {dataset.meta.note}
              </p>
            )}
          </div>
        </Card>

        <Card title="Column types">
          <ul className="max-h-44 space-y-1.5 overflow-y-auto">
            {dataset.columns.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate text-slate-700 dark:text-slate-300">
                  {c.name}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    TYPE_BADGE[c.type] || TYPE_BADGE.categorical
                  }`}
                >
                  {c.type}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Missing values — top columns">
          {missingTop5.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No missing values in any column.
            </p>
          ) : (
            <ul className="space-y-2">
              {missingTop5.map((d) => (
                <li key={d.column} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                      {d.column}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {d.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(100, d.pct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Distributions */}
      {(histConfig || catFreqConfig) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {histConfig && (
            <Card title="Numeric distribution">
              <ChartRenderer config={histConfig} dataset={dataset} height={220} />
            </Card>
          )}
          {catFreqConfig && top8View && (
            <Card title="Category frequency">
              <ChartRenderer config={catFreqConfig} dataset={top8View} height={220} />
            </Card>
          )}
        </div>
      )}

      {/* Auto-suggested charts */}
      {suggestions.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
            Suggested charts
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {suggestions.map((cfg) => (
              <Card key={cfg.id} title={cfg.title}>
                <ChartRenderer config={cfg} dataset={dataset} height={240} />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
          Insights
        </h2>
        {insights.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No insights yet"
            message="Insights will appear here once the dataset has enough structure to analyze."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {insights.map((ins) => (
              <InsightCard key={ins.id} insight={ins} />
            ))}
          </div>
        )}
      </div>

      {/* Change dataset */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setChangeOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white"
          aria-expanded={changeOpen}
        >
          Change dataset
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${changeOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {changeOpen && (
          <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
            <FileUploader compact />
          </div>
        )}
      </div>
    </div>
  );
}

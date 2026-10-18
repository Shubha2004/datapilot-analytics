/**
 * Dashboard.jsx — page id 'overview'.
 * Premium SaaS-style overview: header with dataset status + actions, business
 * filters, business-performance KPIs (via utils/kpis.js when available),
 * data-quality KPIs, visualization grid (trend / category / quality /
 * composition / recent charts), dataset preview, quick actions, and the
 * upload flow. All values are computed from the real loaded dataset;
 * empty states are honest when nothing is loaded.
 *
 * Business KPIs are defensive: `computeKPIs` is only called when the import
 * resolves to a function, its result is shape-validated, and any throw
 * becomes an error banner instead of a crash. If the KPI module is missing
 * or returns an unexpected shape, the business section is hidden (the
 * data-quality section and charts below keep working).
 */
import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Columns3,
  Copy,
  Database,
  DollarSign,
  FileText,
  Filter,
  Gauge,
  Hash,
  Minus,
  Package,
  Printer,
  Receipt,
  Rows3,
  ShieldCheck,
  ShoppingCart,
  Sigma,
  Sparkles,
  Table2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { isMissing } from '../utils/dataTypes';
import { analyzeQuality } from '../utils/cleaning';
import { validateChartConfig } from '../utils/chartData';
import { computeKPIs } from '../utils/kpis.js';
import FileUploader from '../components/FileUploader';
import NLQBar from '../components/NLQBar';
import MetricCard from '../components/MetricCard';
import EmptyState from '../components/EmptyState';
import ChartRenderer from '../components/ChartRenderer';
import DatasetPreview from '../components/DatasetPreview';

/* Shared dashboard palette — indigo primary with semantic accents.
   ChartRenderer keeps its own internal palette; this constant drives the
   custom (non-recharts) indicators below so everything stays consistent. */
const DASH_PALETTE = {
  numeric: '#6366f1',
  categorical: '#10b981',
  date: '#f59e0b',
  boolean: '#a855f7',
  missing: '#f59e0b',
  duplicates: '#8b5cf6',
  outliers: '#f43f5e',
};

const TYPE_BADGE = {
  numeric: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  categorical: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  date: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  boolean: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
};

const FILTER_INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

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

function formatMoney(v, decimals = 0) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function formatInt(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';
}

/** "unit_price" -> "Unit price". Used for honest, column-aware labels. */
function prettyName(name) {
  const s = String(name || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Value';
}

/** Top-`limit` category values by frequency in `colName`. Pure helper. */
function topCategories(dataset, colName, limit = 8) {
  const counts = new Map();
  for (const r of dataset.rows) {
    const v = r[colName];
    if (isMissing(v)) continue;
    const k = String(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const names = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
  const keep = new Set(names);
  return {
    names,
    view: { ...dataset, rows: dataset.rows.filter((r) => keep.has(String(r[colName]))) },
  };
}

/* ------------------------------------------------------------------ */
/* Semantic column detection                                           */
/* ------------------------------------------------------------------ */

/**
 * Map dataset columns to business roles by name pattern + column type.
 * Only columns that actually exist are returned; everything else is null.
 * revenueCol falls back to the first numeric column so business KPIs work
 * on datasets without an explicit revenue-like name (the KPI cards always
 * name the source column, so nothing is mislabeled).
 */
function detectSemanticColumns(columns) {
  const cols = Array.isArray(columns) ? columns : [];
  const ofType = (t) => cols.filter((c) => c && c.type === t);
  const numerics = ofType('numeric');
  const categoricals = ofType('categorical');
  const dates = ofType('date');
  const byName = (list, re) => list.find((c) => re.test(c.name)) || null;

  const orderIdCol =
    byName(cols, /order.?id/i)?.name ||
    cols.find((c) => c.type !== 'numeric' && /id$/i.test(c.name))?.name ||
    null;
  const dateCol = dates.length > 0 ? dates[0].name : null;
  const revenueCol =
    byName(numerics, /revenue|sales|amount|total/i)?.name ||
    (numerics.length > 0 ? numerics[0].name : null);
  const quantityCol = byName(numerics, /qty|quantity|units/i)?.name || null;
  const categoryCol =
    byName(categoricals, /categor|product.?type/i)?.name ||
    (categoricals.length > 0 ? categoricals[0].name : null);
  const regionCol = byName(categoricals, /region/i)?.name || null;
  const channelCol = byName(categoricals, /channel/i)?.name || null;
  const segmentCol = byName(categoricals, /segment/i)?.name || null;
  const productCol = byName(categoricals, /product/i)?.name || null;

  return {
    orderIdCol,
    dateCol,
    revenueCol,
    quantityCol,
    categoryCol,
    regionCol,
    channelCol,
    segmentCol,
    productCol,
  };
}

/* ------------------------------------------------------------------ */
/* Filter helpers (pure)                                               */
/* ------------------------------------------------------------------ */

/** Sorted distinct non-missing string values of a column. */
function distinctValues(rows, colName, limit = 500) {
  const set = new Set();
  for (const r of rows) {
    const v = r[colName];
    if (isMissing(v)) continue;
    set.add(String(v));
    if (set.size >= limit) break;
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Normalize any parseable date-ish cell to 'YYYY-MM-DD', else null. */
function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(+v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** Min/max 'YYYY-MM-DD' across a date column's parseable values. */
function dateBounds(rows, colName) {
  let min = null;
  let max = null;
  for (const r of rows) {
    const d = toISODate(r[colName]);
    if (!d) continue;
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  }
  return { min, max };
}

/**
 * Filter rows by the dashboard filters, mapped through the detected
 * semantic columns. String comparison on ISO dates keeps the range
 * timezone-safe for any parseable date format. Pure.
 */
function applyDashboardFilters(rows, sem, filters) {
  const f = filters || {};
  const wantDate = Boolean((f.dateFrom || f.dateTo) && sem.dateCol);
  const want = {
    region: f.region && sem.regionCol ? { col: sem.regionCol, val: f.region } : null,
    category: f.category && sem.categoryCol ? { col: sem.categoryCol, val: f.category } : null,
    channel: f.channel && sem.channelCol ? { col: sem.channelCol, val: f.channel } : null,
    segment: f.segment && sem.segmentCol ? { col: sem.segmentCol, val: f.segment } : null,
  };
  const active = wantDate || Object.values(want).some(Boolean);
  if (!active) return rows;
  return rows.filter((row) => {
    if (wantDate) {
      const d = toISODate(row[sem.dateCol]);
      if (!d) return false;
      if (f.dateFrom && d < f.dateFrom) return false;
      if (f.dateTo && d > f.dateTo) return false;
    }
    for (const w of Object.values(want)) {
      if (!w) continue;
      if (String(row[w.col] ?? '') !== w.val) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* KPI result helpers (pure, defensive against shape drift)             */
/* ------------------------------------------------------------------ */

function validKpis(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  for (const k of ['totalRevenue', 'totalOrders', 'unitsSold', 'avgOrderValue']) {
    if (!Number.isFinite(Number(r[k]))) return false;
  }
  for (const k of [
    'byMonth',
    'byCategory',
    'byRegion',
    'byChannel',
    'bySegment',
    'topProducts',
    'warnings',
  ]) {
    if (r[k] !== undefined && r[k] !== null && !Array.isArray(r[k])) return false;
  }
  const g = r.revenueGrowthPct;
  if (g !== undefined && g !== null && !Number.isFinite(Number(g))) return false;
  return true;
}

const PAIR_LABEL_KEYS = [
  'month',
  'label',
  'key',
  'period',
  'name',
  'x',
  'category',
  'region',
  'channel',
  'segment',
  'product',
];
const PAIR_VALUE_KEYS = ['revenue', 'value', 'total', 'y', 'amount', 'sum'];

function firstPresent(entry, keys) {
  for (const k of keys) {
    const v = entry[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Normalize KPI breakdown arrays to [{ label, value, extra }], tolerating
 * several plausible element shapes ({month,revenue}, {label,value},
 * {category,total}, …). Non-numeric values become 0 rather than NaN.
 */
function normPairs(arr, extraKeys = []) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const label = firstPresent(e, PAIR_LABEL_KEYS);
    if (label === undefined) continue;
    const num = Number(firstPresent(e, PAIR_VALUE_KEYS));
    const extraRaw =
      extraKeys.length > 0 ? firstPresent(e, extraKeys) : undefined;
    const extraNum = Number(extraRaw);
    out.push({
      label: String(label),
      value: Number.isFinite(num) ? num : 0,
      extra:
        extraRaw === undefined
          ? null
          : Number.isFinite(extraNum)
            ? extraNum
            : null,
    });
  }
  return out;
}

function pairsToDataset(pairs) {
  return {
    name: 'kpi-breakdown',
    columns: [
      { name: 'label', type: 'categorical' },
      { name: 'value', type: 'numeric' },
    ],
    rows: (pairs || []).map((p) => ({ label: p.label, value: p.value })),
  };
}

/* ------------------------------------------------------------------ */
/* Small presentational components (module-level, hooks unconditional)  */
/* ------------------------------------------------------------------ */

function Card({ title, action, children, className = '' }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/40 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function QualityRow({ label, value, color, sub }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </p>
        {sub && (
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
            {sub}
          </p>
        )}
      </div>
      <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function FilterLabel({ htmlFor, label, column }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      {label}{' '}
      <span className="font-normal text-slate-400 dark:text-slate-500">
        · {column}
      </span>
    </label>
  );
}

/** Dropdown for ≤50 distinct values, datalist search above that. */
function FilterField({ id, label, column, values, value, onChange }) {
  if (values.length > 50) {
    return (
      <SearchFilterField
        key={`${id}-${value ?? 'all'}`}
        id={id}
        label={label}
        column={column}
        values={values}
        value={value}
        onChange={onChange}
      />
    );
  }
  return (
    <div>
      <FilterLabel htmlFor={id} label={label} column={column} />
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={FILTER_INPUT}
      >
        <option value="">All</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Free-text search over many distinct values. Only commits when the typed
 * text exactly matches a known value, so the KPI engine (exact match) and
 * the chart row-filtering never disagree. The parent remounts this field
 * (via key) whenever the committed value changes, so no sync effect is
 * needed to reset the text on "Clear filters".
 */
function SearchFilterField({ id, label, column, values, value, onChange }) {
  const [text, setText] = useState(value ?? '');
  return (
    <div>
      <FilterLabel htmlFor={id} label={label} column={column} />
      <input
        id={id}
        type="search"
        list={`${id}-options`}
        value={text}
        placeholder="Type to search…"
        autoComplete="off"
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          onChange(values.includes(t) ? t : null);
        }}
        className={FILTER_INPUT}
      />
      <datalist id={`${id}-options`}>
        {values.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}

function DateRangeField({ label, column, min, max, from, to, onFrom, onTo }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}{' '}
        <span className="font-normal text-slate-400 dark:text-slate-500">
          · {column}
        </span>
      </span>
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label={`${label} from`}
          min={min || undefined}
          max={max || undefined}
          value={from ?? ''}
          onChange={(e) => onFrom(e.target.value || null)}
          className={FILTER_INPUT}
        />
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
          to
        </span>
        <input
          type="date"
          aria-label={`${label} to`}
          min={min || undefined}
          max={max || undefined}
          value={to ?? ''}
          onChange={(e) => onTo(e.target.value || null)}
          className={FILTER_INPUT}
        />
      </div>
    </div>
  );
}

/**
 * ChartRenderer wrapper for KPI-breakdown charts: builds a synthetic
 * {label,value} dataset, validates the config first, and renders an honest
 * empty state when filters leave no data.
 */
function BizChart({ pairs, config, height = 240, emptyMessage }) {
  const ds = useMemo(() => pairsToDataset(pairs), [pairs]);
  const errors = useMemo(() => validateChartConfig(ds, config), [ds, config]);
  if (!pairs || pairs.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No data for these filters"
        message={
          emptyMessage ||
          'Nothing matches the active filters — widen the date range or clear a filter.'
        }
      />
    );
  }
  if (errors.length > 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Chart unavailable"
        message={errors.join(' ')}
      />
    );
  }
  return <ChartRenderer config={config} dataset={ds} height={height} />;
}

export default function Dashboard() {
  const {
    dataset,
    savedCharts,
    setPage,
    isLoading,
    dashboardFilters,
    setDashboardFilters,
  } = useData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadRef = useRef(null);

  /* ---------------- quality + KPI stats (real dataset only) ---------------- */
  const quality = useMemo(
    () => (dataset ? analyzeQuality(dataset) : null),
    [dataset],
  );

  const stats = useMemo(() => {
    if (!dataset || !quality) return null;
    const nRows = dataset.rows.length;
    const nCols = dataset.columns.length;
    const numericCount = dataset.columns.filter((c) => c.type === 'numeric').length;
    const missingCells = quality.missingByColumn.reduce((a, d) => a + d.missing, 0);
    const totalCells = nRows * nCols;
    const completeness = totalCells === 0 ? 100 : (1 - missingCells / totalCells) * 100;
    const outlierCount = quality.outliers.reduce((a, o) => a + o.count, 0);
    return {
      nRows,
      nCols,
      numericCount,
      missingCells,
      dupRows: quality.duplicateRows,
      completeness,
      outlierCount,
      missingPct: totalCells === 0 ? 0 : (missingCells / totalCells) * 100,
    };
  }, [dataset, quality]);

  /* ---------------- column lookups ---------------- */
  const lookups = useMemo(() => {
    const cols = dataset?.columns ?? [];
    return {
      date: cols.find((c) => c.type === 'date') ?? null,
      firstNumeric: cols.find((c) => c.type === 'numeric') ?? null,
      firstCategorical: cols.find((c) => c.type === 'categorical') ?? null,
    };
  }, [dataset]);

  /* ---------------- semantic columns (business roles) ---------------- */
  const sem = useMemo(
    () => detectSemanticColumns(dataset?.columns),
    [dataset],
  );

  /* ---------------- filtered rows: every chart below respects filters ---------------- */
  const filteredRows = useMemo(
    () => (dataset ? applyDashboardFilters(dataset.rows, sem, dashboardFilters) : []),
    [dataset, sem, dashboardFilters],
  );
  const filteredView = useMemo(
    () => (dataset ? { ...dataset, rows: filteredRows } : null),
    [dataset, filteredRows],
  );

  /* ---------------- filter option lists ---------------- */
  const filterOptions = useMemo(() => {
    if (!dataset) return { region: [], category: [], channel: [], segment: [] };
    const rows = dataset.rows;
    return {
      region: sem.regionCol ? distinctValues(rows, sem.regionCol) : [],
      category: sem.categoryCol ? distinctValues(rows, sem.categoryCol) : [],
      channel: sem.channelCol ? distinctValues(rows, sem.channelCol) : [],
      segment: sem.segmentCol ? distinctValues(rows, sem.segmentCol) : [],
    };
  }, [dataset, sem]);

  const dateRange = useMemo(
    () =>
      dataset && sem.dateCol
        ? dateBounds(dataset.rows, sem.dateCol)
        : { min: null, max: null },
    [dataset, sem],
  );

  const showDateFilter = Boolean(sem.dateCol && dateRange.min && dateRange.max);
  const hasFilterFields =
    showDateFilter ||
    filterOptions.region.length > 0 ||
    filterOptions.category.length > 0 ||
    filterOptions.channel.length > 0 ||
    filterOptions.segment.length > 0;
  const hasActiveFilters = Boolean(
    dashboardFilters.dateFrom ||
      dashboardFilters.dateTo ||
      dashboardFilters.region ||
      dashboardFilters.category ||
      dashboardFilters.channel ||
      dashboardFilters.segment,
  );

  const updateFilter = (key, value) => {
    setDashboardFilters({ ...dashboardFilters, [key]: value ?? null });
  };

  /* ---------------- business KPIs (defensive) ---------------- */
  const kpiState = useMemo(() => {
    if (!dataset) return { status: 'empty', k: null, message: null };
    if (typeof computeKPIs !== 'function')
      return { status: 'unavailable', k: null, message: null };
    if (!sem.revenueCol)
      return { status: 'no-revenue', k: null, message: null };
    try {
      const k = computeKPIs(dataset, {
        orderIdCol: sem.orderIdCol,
        dateCol: sem.dateCol,
        revenueCol: sem.revenueCol,
        quantityCol: sem.quantityCol,
        categoryCol: sem.categoryCol,
        regionCol: sem.regionCol,
        channelCol: sem.channelCol,
        segmentCol: sem.segmentCol,
        productCol: sem.productCol,
        filters: {
          dateFrom: dashboardFilters.dateFrom || null,
          dateTo: dashboardFilters.dateTo || null,
          region: dashboardFilters.region || null,
          category: dashboardFilters.category || null,
          channel: dashboardFilters.channel || null,
          segment: dashboardFilters.segment || null,
        },
      });
      if (!validKpis(k)) return { status: 'unavailable', k: null, message: null };
      return { status: 'ok', k, message: null };
    } catch (err) {
      return {
        status: 'error',
        k: null,
        message: err && err.message ? err.message : String(err),
      };
    }
  }, [dataset, sem, dashboardFilters]);

  const biz = useMemo(() => {
    if (kpiState.status !== 'ok' || !kpiState.k) return null;
    const k = kpiState.k;
    const bySegment = normPairs(k.bySegment);
    return {
      byMonth: normPairs(k.byMonth),
      byCategory: normPairs(k.byCategory),
      byRegion: normPairs(k.byRegion),
      byChannel: normPairs(k.byChannel),
      bySegment,
      topProducts: normPairs(k.topProducts, [
        'units',
        'unitsSold',
        'quantity',
        'qty',
        'orders',
      ]).slice(0, 10),
      bottomSegments: [...bySegment]
        .sort((a, b) => a.value - b.value)
        .slice(0, 3),
      warnings: Array.isArray(k.warnings) ? k.warnings : [],
    };
  }, [kpiState]);

  const bizConfigs = useMemo(() => {
    const rev = sem.revenueCol ? prettyName(sem.revenueCol) : 'Revenue';
    const base = { groupKey: null, filters: [] };
    return {
      trend: {
        id: 'biz-monthly-revenue',
        title: 'Monthly revenue',
        type: 'line',
        xKey: 'label',
        yKey: 'value',
        aggregation: 'sum',
        sort: 'asc',
        ...base,
      },
      byCategory: {
        id: 'biz-revenue-category',
        title: `${rev} by category`,
        type: 'bar',
        xKey: 'label',
        yKey: 'value',
        aggregation: 'sum',
        sort: 'desc',
        ...base,
      },
      byRegion: {
        id: 'biz-revenue-region',
        title: `${rev} by region`,
        type: 'bar',
        xKey: 'label',
        yKey: 'value',
        aggregation: 'sum',
        sort: 'desc',
        ...base,
      },
      byChannel: {
        id: 'biz-revenue-channel',
        title: `${rev} by channel`,
        type: 'donut',
        xKey: 'label',
        yKey: 'value',
        aggregation: 'sum',
        sort: 'none',
        ...base,
      },
    };
  }, [sem.revenueCol]);

  /* ---------------- primary chart: trend, else category frequency ---------------- */
  const trendConfig = useMemo(() => {
    if (!dataset || !lookups.date || !lookups.firstNumeric) return null;
    return {
      id: 'dash-trend',
      title: `${lookups.firstNumeric.name} over time`,
      type: 'line',
      xKey: lookups.date.name,
      yKey: lookups.firstNumeric.name,
      aggregation: 'sum',
      groupKey: null,
      sort: 'asc',
      filters: [],
    };
  }, [dataset, lookups]);

  const { view: freqView, config: freqConfig } = useMemo(() => {
    if (!filteredView || !lookups.firstCategorical) return { view: null, config: null };
    const { view, names } = topCategories(filteredView, lookups.firstCategorical.name);
    if (names.length === 0) return { view: null, config: null };
    return {
      view,
      config: {
        id: 'dash-catfreq',
        title: `Top ${names.length} ${lookups.firstCategorical.name} by count`,
        type: 'bar',
        xKey: lookups.firstCategorical.name,
        yKey: null,
        aggregation: 'count',
        groupKey: null,
        sort: 'desc',
        filters: [],
      },
    };
  }, [filteredView, lookups]);

  /* ---------------- category comparison: numeric sum, else pie breakdown ---------------- */
  const { view: sumView, config: sumConfig } = useMemo(() => {
    if (!filteredView || !lookups.firstCategorical || !lookups.firstNumeric)
      return { view: null, config: null };
    const { view, names } = topCategories(filteredView, lookups.firstCategorical.name);
    if (names.length === 0) return { view: null, config: null };
    return {
      view,
      config: {
        id: 'dash-catsum',
        title: `Total ${lookups.firstNumeric.name} by ${lookups.firstCategorical.name}`,
        type: 'bar',
        xKey: lookups.firstCategorical.name,
        yKey: lookups.firstNumeric.name,
        aggregation: 'sum',
        groupKey: null,
        sort: 'desc',
        filters: [],
      },
    };
  }, [filteredView, lookups]);

  const pieConfig = useMemo(() => {
    if (!dataset || !lookups.firstCategorical || lookups.firstNumeric) return null;
    return {
      id: 'dash-catpie',
      title: `${lookups.firstCategorical.name} breakdown`,
      type: 'pie',
      xKey: lookups.firstCategorical.name,
      yKey: null,
      aggregation: 'count',
      groupKey: null,
      sort: 'none',
      filters: [],
    };
  }, [dataset, lookups]);

  /* ---------------- column composition ---------------- */
  const composition = useMemo(() => {
    if (!dataset) return [];
    const counts = { numeric: 0, categorical: 0, date: 0, boolean: 0 };
    for (const c of dataset.columns) {
      if (counts[c.type] !== undefined) counts[c.type] += 1;
      else counts.categorical += 1;
    }
    const total = dataset.columns.length;
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => ({
        type,
        n,
        pct: total === 0 ? 0 : (n / total) * 100,
        color: DASH_PALETTE[type] || DASH_PALETTE.categorical,
      }));
  }, [dataset]);

  /* ---------------- recently saved charts ---------------- */
  const recentCharts = useMemo(
    () => savedCharts.slice(-3).reverse(),
    [savedCharts],
  );

  /* ---------------- upload flow ---------------- */
  const openUpload = () => {
    setUploadOpen(true);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      uploadRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  /* ---------------- loading ---------------- */
  if (isLoading) {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center gap-3"
        role="status"
        aria-live="polite"
      >
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600 dark:border-slate-700 dark:border-t-indigo-400"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading dataset…
        </p>
      </div>
    );
  }

  /* ---------------- no dataset: honest hero + upload ---------------- */
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
            Upload a CSV or Excel file to get an instant dashboard — KPIs,
            trends, data quality checks, and a live preview of your data.
            Everything runs in your browser; your data never leaves this
            device.
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
  const primaryTitle = trendConfig
    ? `${lookups.firstNumeric.name} over time`
    : freqConfig?.title;

  const k = kpiState.k;
  const growthNum =
    k && k.revenueGrowthPct !== null && k.revenueGrowthPct !== undefined
      ? Number(k.revenueGrowthPct)
      : null;
  const growthValid = growthNum !== null && Number.isFinite(growthNum);
  const GrowthIcon = !growthValid ? Minus : growthNum >= 0 ? TrendingUp : TrendingDown;
  const growthLabel = growthValid
    ? `${growthNum >= 0 ? '+' : ''}${growthNum.toFixed(1)}%`
    : '—';
  const revName = sem.revenueCol ? prettyName(sem.revenueCol) : 'Revenue';
  const emptyBizMessage =
    'Nothing matches the active filters — widen the date range or clear a filter.';
  const showUnits =
    biz !== null && biz.topProducts.some((p) => p.extra !== null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Overview
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            Your data at a glance — key metrics, trends, quality checks, and a
            live preview of the active dataset.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <Database size={14} className="text-indigo-600 dark:text-indigo-400" />
              <span className="max-w-[240px] truncate" title={dataset.name}>
                {dataset.name}
              </span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                source === 'sample'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              }`}
            >
              {source === 'sample' ? 'Sample data' : 'Active dataset'}
            </span>
            <span className="text-slate-400 dark:text-slate-500">
              {s.nRows.toLocaleString()} rows × {s.nCols} cols
              {fileSize ? ` · ${fileSize}` : ''}
              {dataset.meta?.uploadedAt ? ` · updated ${formatDate(dataset.meta.uploadedAt)}` : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openUpload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <Upload size={16} />
            Upload Data
          </button>
          <button
            type="button"
            onClick={() => setPage('explorer')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Table2 size={16} />
            Explore Dataset
          </button>
          <button
            type="button"
            onClick={() => setPage('reports')}
            title="Open the Reports page to print or export this dashboard's report"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Printer size={16} />
            Export Report
          </button>
        </div>
      </header>

      <NLQBar />

      {/* Business filters — one control per detected semantic column */}
      {hasFilterFields && (
        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <Filter size={14} className="text-slate-400" />
              Filters
            </span>
          }
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={() => setDashboardFilters({})}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={14} />
                Clear filters
              </button>
            ) : null
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {showDateFilter && (
              <DateRangeField
                label="Date range"
                column={sem.dateCol}
                min={dateRange.min}
                max={dateRange.max}
                from={dashboardFilters.dateFrom}
                to={dashboardFilters.dateTo}
                onFrom={(v) => updateFilter('dateFrom', v)}
                onTo={(v) => updateFilter('dateTo', v)}
              />
            )}
            {sem.regionCol && filterOptions.region.length > 0 && (
              <FilterField
                id="flt-region"
                label="Region"
                column={sem.regionCol}
                values={filterOptions.region}
                value={dashboardFilters.region}
                onChange={(v) => updateFilter('region', v)}
              />
            )}
            {sem.categoryCol && filterOptions.category.length > 0 && (
              <FilterField
                id="flt-category"
                label="Category"
                column={sem.categoryCol}
                values={filterOptions.category}
                value={dashboardFilters.category}
                onChange={(v) => updateFilter('category', v)}
              />
            )}
            {sem.channelCol && filterOptions.channel.length > 0 && (
              <FilterField
                id="flt-channel"
                label="Channel"
                column={sem.channelCol}
                values={filterOptions.channel}
                value={dashboardFilters.channel}
                onChange={(v) => updateFilter('channel', v)}
              />
            )}
            {sem.segmentCol && filterOptions.segment.length > 0 && (
              <FilterField
                id="flt-segment"
                label="Customer segment"
                column={sem.segmentCol}
                values={filterOptions.segment}
                value={dashboardFilters.segment}
                onChange={(v) => updateFilter('segment', v)}
              />
            )}
          </div>
          {hasActiveFilters && (
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Filters apply to the business KPIs, the breakdown charts, and
              the trend / category views below.
            </p>
          )}
        </Card>
      )}

      {/* Business performance KPIs */}
      {kpiState.status === 'ok' && k && biz && (
        <section aria-label="Business performance" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Business performance
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              From “{sem.revenueCol}”
              {hasActiveFilters ? ' · filtered' : ''} — every number and chart
              in this section respects the filters above.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              icon={DollarSign}
              label="Total revenue"
              value={formatMoney(k.totalRevenue)}
              sub={`${formatInt(k.totalOrders)} orders · from “${sem.revenueCol}”`}
              tooltip={`Sum of “${sem.revenueCol}” across rows matching the active filters.`}
            />
            <MetricCard
              icon={ShoppingCart}
              label="Total orders"
              value={formatInt(k.totalOrders)}
              sub={
                sem.orderIdCol
                  ? `unique “${sem.orderIdCol}”`
                  : 'rows counted'
              }
              tooltip={
                sem.orderIdCol
                  ? `Distinct values of “${sem.orderIdCol}” matching the active filters.`
                  : 'Rows matching the active filters (no order-id column detected).'
              }
            />
            <MetricCard
              icon={Package}
              label="Units sold"
              value={formatInt(k.unitsSold)}
              sub={
                sem.quantityCol
                  ? `sum of “${sem.quantityCol}”`
                  : 'quantity column not detected'
              }
              tooltip="Total units across rows matching the active filters."
            />
            <MetricCard
              icon={Receipt}
              label="Average order value"
              value={formatMoney(k.avgOrderValue, 2)}
              sub={k.aovNote || 'revenue ÷ orders'}
              tooltip={k.aovNote || 'Total revenue divided by total orders.'}
            />
            <MetricCard
              icon={GrowthIcon}
              label="Revenue growth MoM"
              value={growthLabel}
              sub={
                k.latestMonth && k.previousMonth
                  ? `${k.latestMonth} vs ${k.previousMonth}`
                  : undefined
              }
              tooltip={
                k.growthNote ||
                'Month-over-month change in total revenue.'
              }
            />
          </div>

          {biz.warnings.length > 0 && (
            <div
              role="note"
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
            >
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Data notes
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-200/80">
                {biz.warnings.map((w, i) => (
                  <li key={i}>{String(w)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Monthly revenue">
              <BizChart
                pairs={biz.byMonth}
                config={bizConfigs.trend}
                height={240}
                emptyMessage={emptyBizMessage}
              />
            </Card>
            <Card title={bizConfigs.byCategory.title}>
              <BizChart
                pairs={biz.byCategory}
                config={bizConfigs.byCategory}
                height={240}
                emptyMessage={emptyBizMessage}
              />
            </Card>
            <Card title={bizConfigs.byRegion.title}>
              <BizChart
                pairs={biz.byRegion}
                config={bizConfigs.byRegion}
                height={240}
                emptyMessage={emptyBizMessage}
              />
            </Card>
            <Card title={bizConfigs.byChannel.title}>
              <BizChart
                pairs={biz.byChannel}
                config={bizConfigs.byChannel}
                height={240}
                emptyMessage={emptyBizMessage}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={`Top 10 products by ${revName.toLowerCase()}`}>
              {biz.topProducts.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No products to rank"
                  message={emptyBizMessage}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                        <th className="py-2 pr-2 font-medium">#</th>
                        <th className="py-2 pr-2 font-medium">Product</th>
                        {showUnits && (
                          <th className="py-2 pr-2 text-right font-medium">
                            Units
                          </th>
                        )}
                        <th className="py-2 text-right font-medium">
                          {revName}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {biz.topProducts.map((p, i) => (
                        <tr key={`${p.label}-${i}`}>
                          <td className="py-2 pr-2 text-xs text-slate-400 dark:text-slate-500">
                            {i + 1}
                          </td>
                          <td className="max-w-[180px] truncate py-2 pr-2 font-medium text-slate-700 dark:text-slate-300" title={p.label}>
                            {p.label}
                          </td>
                          {showUnits && (
                            <td className="py-2 pr-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                              {p.extra !== null ? formatInt(p.extra) : '—'}
                            </td>
                          )}
                          <td className="py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(p.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Underperforming segments">
              {biz.bottomSegments.length === 0 ? (
                <EmptyState
                  icon={TrendingDown}
                  title="No segments to rank"
                  message={emptyBizMessage}
                />
              ) : (
                <div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {biz.bottomSegments.map((sg, i) => (
                      <li
                        key={`${sg.label}-${i}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-xs font-bold text-rose-600 dark:text-rose-400">
                            {i + 1}
                          </span>
                          <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300" title={sg.label}>
                            {sg.label}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatMoney(sg.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    Lowest-{revName.toLowerCase()} segments for the active
                    filters
                    {sem.segmentCol ? ` (“${sem.segmentCol}”)` : ''}.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </section>
      )}

      {/* Business KPI states: honest, never fake numbers, never a crash */}
      {kpiState.status === 'no-revenue' && (
        <EmptyState
          icon={DollarSign}
          title="No revenue-like numeric column detected"
          message="Business KPIs need a numeric revenue, sales, amount, or total column. The data-quality section below still works."
        />
      )}
      {kpiState.status === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
              Couldn't compute business KPIs
            </p>
            <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-200/70">
              {kpiState.message || 'The KPI engine reported an error.'} The
              rest of the dashboard is unaffected.
            </p>
          </div>
        </div>
      )}

      {/* Data quality KPI grid (existing — kept as-is, now under a subsection) */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
          Data quality
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            icon={Rows3}
            label="Total rows"
            value={s.nRows.toLocaleString()}
            sub={`${s.nCols} columns`}
            tooltip="Number of data rows in the active dataset."
          />
          <MetricCard
            icon={Columns3}
            label="Total columns"
            value={s.nCols}
            sub={`${s.numericCount} numeric`}
            tooltip="Number of columns; how many are numeric."
          />
          <MetricCard
            icon={Hash}
            label="Numeric columns"
            value={s.numericCount}
            sub={s.numericCount === 1 ? '1 numeric column' : `${s.numericCount} numeric columns`}
            tooltip="Columns whose values are mostly numbers, safe for charts and statistics."
          />
          <MetricCard
            icon={AlertTriangle}
            label="Missing values"
            value={s.missingCells.toLocaleString()}
            sub={`${s.missingPct.toFixed(1)}% of all cells`}
            tooltip="Empty or blank cells across the whole dataset."
          />
          <MetricCard
            icon={Copy}
            label="Duplicate rows"
            value={s.dupRows.toLocaleString()}
            sub={s.dupRows > 0 ? 'review in Data Quality' : 'no duplicates found'}
            tooltip="Rows that are identical to an earlier row."
          />
          <MetricCard
            icon={Gauge}
            label="Data completeness"
            value={`${s.completeness.toFixed(1)}%`}
            sub="share of non-missing cells"
            tooltip="Percentage of cells that contain a value (100% − missing %)."
          />
        </div>
      </div>

      {/* Visualizations grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* (a) Primary: trend when a date column exists, else category frequency */}
        <Card
          title={primaryTitle ?? 'Data at a glance'}
          action={
            <button
              type="button"
              onClick={() => setPage('charts')}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Open Chart Builder
            </button>
          }
        >
          {trendConfig ? (
            <ChartRenderer config={trendConfig} dataset={filteredView} height={240} />
          ) : freqConfig && freqView ? (
            <ChartRenderer config={freqConfig} dataset={freqView} height={240} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No chartable columns"
              message="Add a date column for a trend, or a categorical column for a frequency chart."
            />
          )}
        </Card>

        {/* (b) Category comparison */}
        <Card
          title="Category comparison"
          action={
            <button
              type="button"
              onClick={() => setPage('charts')}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Open Chart Builder
            </button>
          }
        >
          {sumConfig && sumView ? (
            <ChartRenderer config={sumConfig} dataset={sumView} height={240} />
          ) : pieConfig ? (
            <ChartRenderer config={pieConfig} dataset={filteredView} height={240} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Nothing to compare yet"
              message="A categorical column (and optionally a numeric one) unlocks category comparisons."
            />
          )}
        </Card>

        {/* (c) Data quality summary */}
        <Card
          title="Data quality summary"
          action={
            <button
              type="button"
              onClick={() => setPage('quality')}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Open Data Quality
            </button>
          }
        >
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            <QualityRow
              label="Missing cells"
              value={`${s.missingPct.toFixed(1)}%`}
              color={DASH_PALETTE.missing}
              sub={`${s.missingCells.toLocaleString()} of ${(s.nRows * s.nCols).toLocaleString()} cells`}
            />
            <QualityRow
              label="Duplicate rows"
              value={s.dupRows.toLocaleString()}
              color={DASH_PALETTE.duplicates}
              sub={s.dupRows > 0 ? 'safe to remove in Data Quality' : 'no duplicates found'}
            />
            <QualityRow
              label="Outlier values"
              value={s.outlierCount.toLocaleString()}
              color={DASH_PALETTE.outliers}
              sub="values outside 1.5× the interquartile range"
            />
          </div>
        </Card>

        {/* (d) Column composition */}
        <Card title="Column composition">
          {composition.length === 0 ? (
            <EmptyState
              icon={Columns3}
              title="No columns"
              message="This dataset has no columns to summarize."
            />
          ) : (
            <div className="space-y-4">
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="img"
                aria-label={`Column types: ${composition
                  .map((d) => `${d.n} ${d.type}`)
                  .join(', ')}`}
              >
                {composition.map((d) => (
                  <div
                    key={d.type}
                    style={{ width: `${d.pct}%`, backgroundColor: d.color }}
                    title={`${d.type}: ${d.n} (${d.pct.toFixed(1)}%)`}
                  />
                ))}
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {composition.map((d) => (
                  <li
                    key={d.type}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800/60"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: d.color }}
                      aria-hidden="true"
                    />
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        TYPE_BADGE[d.type] || TYPE_BADGE.categorical
                      }`}
                    >
                      {d.type}
                    </span>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                      {d.n}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* (e) Recently saved charts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Recently saved charts
          </h2>
          <button
            type="button"
            onClick={() => setPage('charts')}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Open Chart Builder
          </button>
        </div>
        {recentCharts.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No saved charts yet"
            message="Build a chart and save it — the latest ones will appear here."
            action={
              <button
                type="button"
                onClick={() => setPage('charts')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <BarChart3 size={16} />
                Open Chart Builder
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentCharts.map((cfg) => (
              <Card key={cfg.id} title={cfg.title}>
                <ChartRenderer config={cfg} dataset={dataset} height={200} />
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dataset preview */}
      <DatasetPreview dataset={dataset} quality={quality} />

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { icon: Upload, label: 'Import dataset', hint: 'Upload a new file', onClick: openUpload },
            { icon: ShieldCheck, label: 'Clean data', hint: 'Fix quality issues', onClick: () => setPage('quality') },
            { icon: BarChart3, label: 'Build chart', hint: 'Visualize columns', onClick: () => setPage('charts') },
            { icon: Sigma, label: 'Run statistics', hint: 'Describe & test data', onClick: () => setPage('stats') },
            { icon: FileText, label: 'Generate report', hint: 'Printable summary', onClick: () => setPage('reports') },
          ].map(({ icon: Icon, label, hint, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all motion-reduce:transition-none hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/40 dark:hover:border-indigo-500/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:text-indigo-400 dark:group-hover:bg-indigo-500">
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                  {label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Change dataset / upload flow */}
      <section
        ref={uploadRef}
        aria-label="Upload dataset"
        className="scroll-mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <button
          type="button"
          onClick={() => setUploadOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white"
          aria-expanded={uploadOpen}
        >
          <span className="inline-flex items-center gap-2">
            <Upload size={16} className="text-indigo-600 dark:text-indigo-400" />
            {uploadOpen ? 'Upload dataset' : 'Change dataset'}
          </span>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform motion-reduce:transition-none ${
              uploadOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        {uploadOpen && (
          <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
            <FileUploader compact />
          </div>
        )}
      </section>
    </div>
  );
}

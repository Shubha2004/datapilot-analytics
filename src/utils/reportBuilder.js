/**
 * reportBuilder.js — assemble a single report-data object that downstream
 * report renderers (e.g. Worker E's printable HTML/PDF report) consume.
 *
 * Pure functions: no I/O, no mutation of the inputs, no side effects.
 * All limits and provenance are stated honestly in `limitations`.
 */

import { isMissing } from './dataTypes.js';

/**
 * Normalise the computeKPIs() return object into [{ metric, value, note }].
 * Tolerates null, partial objects, or an already-normalised array.
 */
function normalizeKpiSummary(kpis) {
  if (kpis === null || kpis === undefined) return [];
  if (Array.isArray(kpis)) {
    return kpis
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({
        metric: String(i.metric ?? ''),
        value: i.value === undefined ? '' : i.value,
        note: i.note === undefined || i.note === null ? '' : String(i.note),
      }));
  }
  if (typeof kpis !== 'object') return [];
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  const num = (v) =>
    v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
      ? ''
      : v;
  return [
    { metric: 'totalRevenue', value: num(kpis.totalRevenue), note: 'Sum of valid revenue cells (after filters).' },
    { metric: 'totalOrders', value: num(kpis.totalOrders), note: 'DISTINCT order_id values (not the row count).' },
    { metric: 'unitsSold', value: num(kpis.unitsSold), note: 'Sum of valid quantity cells.' },
    { metric: 'avgOrderValue', value: num(kpis.avgOrderValue), note: str(kpis.aovNote) },
    { metric: 'revenueGrowthPct', value: num(kpis.revenueGrowthPct), note: str(kpis.growthNote) },
    { metric: 'latestMonth', value: num(kpis.latestMonth), note: 'Latest YYYY-MM present in the data.' },
    { metric: 'dataCompleteness', value: num(kpis.dataCompleteness), note: 'Share of non-missing KPI fields per filtered row.' },
    { metric: 'duplicateRows', value: num(kpis.duplicateRows), note: 'Duplicate rows (sorted-key JSON.stringify convention).' },
    { metric: 'grain', value: str(kpis.grain), note: 'Level of detail the KPIs were computed at.' },
  ];
}

/**
 * Condense an analyzeQuality() result into headline numbers.
 * Returns null when no quality report was provided.
 */
function summarizeQuality(quality) {
  if (quality === null || quality === undefined || typeof quality !== 'object') {
    return null;
  }
  const byCol = Array.isArray(quality.missingByColumn)
    ? quality.missingByColumn
    : [];
  const sum = (arr, key) =>
    arr.reduce((a, d) => a + (Number(d?.[key]) || 0), 0);
  return {
    columnsChecked: byCol.length,
    totalMissingCells: sum(byCol, 'missing'),
    duplicateRows: quality.duplicateRows ?? 0,
    invalidNumericCount: sum(quality.invalidNumeric || [], 'count'),
    outlierCount: sum(quality.outliers || [], 'count'),
    singleValueColumns: Array.isArray(quality.singleValueColumns)
      ? [...quality.singleValueColumns]
      : [],
    possibleDateColumns: Array.isArray(quality.possibleDateColumns)
      ? [...quality.possibleDateColumns]
      : [],
  };
}

const DATE_NAME_RE = /date|time/i;

/** Best-effort ISO 'YYYY-MM-DD' from a raw cell value; null if unparseable. */
function isoDate(v) {
  if (isMissing(v)) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (s === '') return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Derive the analysis period: filters.dateFrom/dateTo win; otherwise use the
 * min/max of the dataset's date column (a 'date'-typed column first, else a
 * column whose name mentions date/time with mostly parseable values).
 * Returns { from, to } ('YYYY-MM-DD') or null when nothing can be found.
 */
function deriveAnalysisPeriod(dataset, filters) {
  const f = filters && typeof filters === 'object' ? filters : {};
  if (f.dateFrom != null || f.dateTo != null) {
    return { from: f.dateFrom ?? null, to: f.dateTo ?? null };
  }
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  if (rows.length === 0) return null;

  let candidate = columns.find((c) => c.type === 'date')?.name;
  if (!candidate) {
    for (const c of columns) {
      if (c.type !== 'categorical' && c.type !== 'string') continue;
      if (!DATE_NAME_RE.test(c.name)) continue;
      const present = rows
        .map((r) => r[c.name])
        .filter((v) => !isMissing(v));
      if (
        present.length > 0 &&
        present.filter((v) => isoDate(v) !== null).length / present.length >= 0.8
      ) {
        candidate = c.name;
        break;
      }
    }
  }
  if (!candidate) return null;

  const dates = rows
    .map((r) => isoDate(r[candidate]))
    .filter((d) => d !== null)
    .sort();
  if (dates.length === 0) return null;
  return { from: dates[0], to: dates[dates.length - 1] };
}

/** Find the audit log wherever it may be attached; [] when absent. */
function findAuditLog(dataset, quality) {
  for (const holder of [quality, dataset?.meta]) {
    if (holder && Array.isArray(holder.auditLog) && holder.auditLog.length > 0) {
      return holder.auditLog;
    }
  }
  return [];
}

/**
 * Build the canonical report-data object for DataPilot's generated reports.
 *
 * @param {Object} args
 * @param {Object} args.dataset canonical dataset { name, columns, rows, meta }
 * @param {Object|null} [args.kpis] computeKPIs() return object
 * @param {Object|null} [args.quality] analyzeQuality() return object
 * @param {Array} [args.insights] insight objects (passed through)
 * @param {Object} [args.filters] active filters (passed through)
 * @param {Array} [args.savedCharts] chart configs (summarised)
 * @returns {Object} report data with generatedAt, datasetName, datasetMeta,
 *   analysisPeriod, filters, kpiSummary, qualitySummary, insights,
 *   chartSummaries, limitations, assumptions
 */
export function buildReportData({
  dataset,
  kpis = null,
  quality = null,
  insights = [],
  filters = {},
  savedCharts = [],
}) {
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const source = dataset?.meta?.source ?? null;
  const auditLog = findAuditLog(dataset, quality);

  const limitations = [];
  if (source === 'sample') {
    limitations.push(
      'The dataset is synthetic sample data (labelled SAMPLE DATA in the app) — all figures are illustrative, not real business metrics.'
    );
  }
  limitations.push(
    'Insights are produced by deterministic, rule-based heuristics — not an AI model. Review them before acting on them.'
  );
  limitations.push(
    'Correlation does not imply causation; apparent relationships in the data may be coincidental.'
  );
  limitations.push(
    'Cleaning operations (dedupe, fills, drops, conversions) change the underlying data and therefore every downstream result.'
  );
  if (auditLog.length > 0) {
    limitations.push(
      `${auditLog.length} cleaning operation(s) were applied to this dataset; the audit log in the quality report documents exactly what changed.`
    );
  }
  limitations.push(
    'Exports reflect the data and filters current at generation time; reloading or re-filtering can change the numbers.'
  );

  const assumptions = [];
  if (kpis && Array.isArray(kpis.assumptions)) {
    for (const a of kpis.assumptions) {
      if (a !== null && a !== undefined) assumptions.push(String(a));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    datasetName: dataset?.name || 'dataset',
    datasetMeta: { rows: rows.length, cols: columns.length, source },
    analysisPeriod: deriveAnalysisPeriod(dataset, filters),
    filters: filters && typeof filters === 'object' ? { ...filters } : {},
    kpiSummary: normalizeKpiSummary(kpis),
    qualitySummary: summarizeQuality(quality),
    insights: Array.isArray(insights) ? insights : [],
    chartSummaries: (Array.isArray(savedCharts) ? savedCharts : [])
      .filter((c) => c && typeof c === 'object')
      .map((c) => ({
        title: c.title || 'Untitled chart',
        type: c.type || null,
        xKey: c.xKey || null,
        yKey: c.yKey ?? null,
        aggregation: c.aggregation || null,
      })),
    limitations,
    assumptions,
  };
}

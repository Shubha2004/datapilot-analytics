/**
 * chartData.js — filtering, aggregation and chart-data builders for
 * DataPilot Analytics. Turns a Dataset + ChartConfig into recharts-ready
 * { data, seriesKeys } (or { error }).
 */
import { isMissing, toNumber } from './dataTypes';
import { histogram as buildHistogram, describeColumn } from './statistics';

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

function asNum(v) {
  const n = toNumber(v);
  return n === null || n === undefined || Number.isNaN(n) ? null : n;
}

function matchFilter(cell, f) {
  const op = f.op;
  const val = f.value;
  switch (op) {
    case 'isNull':
      return isMissing(cell);
    case 'notNull':
      return !isMissing(cell);
    case 'contains':
      if (isMissing(cell)) return false;
      return String(cell).toLowerCase().includes(String(val === null || val === undefined ? '' : val).toLowerCase());
    case 'eq': {
      if (isMissing(cell)) return false;
      const a = asNum(cell);
      const b = asNum(val);
      return a !== null && b !== null ? a === b : String(cell) === String(val);
    }
    case 'neq': {
      if (isMissing(cell)) return true;
      const a = asNum(cell);
      const b = asNum(val);
      return a !== null && b !== null ? a !== b : String(cell) !== String(val);
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (isMissing(cell) || isMissing(val)) return false;
      const a = asNum(cell);
      const b = asNum(val);
      if (a !== null && b !== null) {
        if (op === 'gt') return a > b;
        if (op === 'gte') return a >= b;
        if (op === 'lt') return a < b;
        return a <= b;
      }
      const sa = String(cell);
      const sb = String(val);
      if (op === 'gt') return sa > sb;
      if (op === 'gte') return sa >= sb;
      if (op === 'lt') return sa < sb;
      return sa <= sb;
    }
    default:
      return true;
  }
}

/** Apply all ChartConfig filters (AND semantics) to rows. */
export function applyFilters(rows, filters) {
  const data = Array.isArray(rows) ? rows : [];
  if (!Array.isArray(filters) || filters.length === 0) return data;
  return data.filter((row) => filters.every((f) => matchFilter(row[f.column], f)));
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/** Numeric-aware comparison of x values for sorting. */
function cmpX(a, b) {
  const na = asNum(a);
  const nb = asNum(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b));
}

/**
 * Group rows by xKey (optionally sub-grouped by groupKey) and aggregate.
 * Returns { data, seriesKeys }.
 */
export function aggregate({ rows, xKey, yKey, aggregation, groupKey, sort = 'none' }) {
  const xGroups = new Map(); // String(x) -> rows[] | Map(String(group) -> rows[])
  const groupOrder = new Map(); // insertion-ordered series keys when grouped

  for (const row of Array.isArray(rows) ? rows : []) {
    const xv = row[xKey];
    if (isMissing(xv)) continue;
    const xk = String(xv);
    let g = xGroups.get(xk);
    if (!g) {
      g = groupKey ? new Map() : [];
      xGroups.set(xk, g);
    }
    if (groupKey) {
      const gv = row[groupKey];
      if (isMissing(gv)) continue;
      const gk = String(gv);
      if (!groupOrder.has(gk)) groupOrder.set(gk, true);
      let arr = g.get(gk);
      if (!arr) {
        arr = [];
        g.set(gk, arr);
      }
      arr.push(row);
    } else {
      g.push(row);
    }
  }

  const aggVals = (arr) => {
    if (aggregation === 'count') return arr.length;
    const nums = [];
    for (const r of arr) {
      if (yKey == null) continue;
      const n = asNum(r[yKey]);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0) return null;
    switch (aggregation) {
      case 'sum':
        return nums.reduce((a, b) => a + b, 0);
      case 'avg':
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      case 'min':
        return Math.min(...nums);
      case 'max':
        return Math.max(...nums);
      default:
        return nums.reduce((a, b) => a + b, 0);
    }
  };

  const data = [];
  for (const [xk, g] of xGroups) {
    if (groupKey) {
      const row = { x: xk };
      for (const gk of groupOrder.keys()) row[gk] = aggVals(g.get(gk) || []);
      data.push(row);
    } else {
      data.push({ x: xk, value: aggVals(g) });
    }
  }
  const seriesKeys = groupKey ? [...groupOrder.keys()] : ['value'];

  if (sort === 'asc' || sort === 'desc') {
    const dir = sort === 'asc' ? 1 : -1;
    data.sort((a, b) => dir * cmpX(a.x, b.x));
  }
  return { data, seriesKeys };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const CHART_TYPES = ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'scatter', 'histogram', 'box'];

function colTypeOf(dataset, name) {
  const c = dataset.columns.find((c) => c.name === name);
  return c ? c.type : null;
}

/** Human-readable config errors (also used live in the chart builder). */
export function validateChartConfig(dataset, config) {
  const errors = [];
  if (!dataset || !Array.isArray(dataset.columns)) {
    errors.push('Dataset is missing column metadata.');
    return errors;
  }
  if (!config) {
    errors.push('Chart configuration is missing.');
    return errors;
  }
  const colNames = new Set(dataset.columns.map((c) => c.name));

  if (!CHART_TYPES.includes(config.type)) {
    errors.push(`Unknown chart type "${config.type}".`);
    return errors;
  }

  if (!config.xKey) {
    errors.push('Choose an X column for this chart.');
  } else if (!colNames.has(config.xKey)) {
    errors.push(`X column "${config.xKey}" does not exist in the dataset.`);
  }

  if (config.yKey != null && !colNames.has(config.yKey)) {
    errors.push(`Y column "${config.yKey}" does not exist in the dataset.`);
  }
  if (config.groupKey != null && !colNames.has(config.groupKey)) {
    errors.push(`Group column "${config.groupKey}" does not exist in the dataset.`);
  }

  if (config.yKey == null && config.aggregation !== 'count' && config.type !== 'histogram') {
    errors.push('Choose a Y column (or switch the aggregation to Count).');
  }
  if (
    config.yKey != null &&
    ['sum', 'avg', 'min', 'max'].includes(config.aggregation) &&
    colTypeOf(dataset, config.yKey) !== 'numeric'
  ) {
    errors.push(`Aggregation "${config.aggregation}" needs a numeric Y column.`);
  }

  switch (config.type) {
    case 'histogram':
      if (config.xKey && colTypeOf(dataset, config.xKey) !== 'numeric') {
        errors.push('Histograms need a numeric X column.');
      }
      break;
    case 'scatter':
      if (config.xKey && colTypeOf(dataset, config.xKey) !== 'numeric') {
        errors.push('Scatter plots need a numeric X column.');
      }
      if (config.yKey && colTypeOf(dataset, config.yKey) !== 'numeric') {
        errors.push('Scatter plots need a numeric Y column.');
      }
      break;
    case 'box':
      if (config.yKey && colTypeOf(dataset, config.yKey) !== 'numeric') {
        errors.push('Box plots need a numeric Y column.');
      }
      break;
    case 'pie':
    case 'donut':
      if (config.groupKey != null) {
        errors.push('Pie/donut charts do not support a group column — remove it.');
      }
      break;
    default:
      break;
  }

  (Array.isArray(config.filters) ? config.filters : []).forEach((f, i) => {
    if (f && f.column && !colNames.has(f.column)) {
      errors.push(`Filter ${i + 1} references unknown column "${f.column}".`);
    }
  });

  return errors;
}

/* ------------------------------------------------------------------ */
/* Chart suggestions                                                   */
/* ------------------------------------------------------------------ */

/** Up to 3 starter chart configs derived from the dataset's columns. */
export function suggestCharts(dataset) {
  const out = [];
  const cols = dataset && Array.isArray(dataset.columns) ? dataset.columns : [];
  const firstCat = cols.find((c) => c.type === 'categorical');
  const firstNum = cols.find((c) => c.type === 'numeric');
  const dateCol = cols.find((c) => c.type === 'date');

  if (firstCat && firstNum) {
    out.push({
      id: 'suggest-1',
      title: `Total ${firstNum.name} by ${firstCat.name}`,
      type: 'bar',
      xKey: firstCat.name,
      yKey: firstNum.name,
      aggregation: 'sum',
      groupKey: null,
      sort: 'desc',
      filters: [],
    });
  }
  if (dateCol && firstNum) {
    out.push({
      id: 'suggest-2',
      title: 'Monthly trend',
      type: 'line',
      xKey: dateCol.name,
      yKey: firstNum.name,
      aggregation: 'sum',
      groupKey: null,
      sort: 'asc',
      filters: [],
    });
  }
  if (firstCat) {
    out.push({
      id: 'suggest-3',
      title: `${firstCat.name} breakdown`,
      type: 'pie',
      xKey: firstCat.name,
      yKey: null,
      aggregation: 'count',
      groupKey: null,
      sort: 'none',
      filters: [],
    });
  }
  return out.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* buildChartData                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build recharts-ready data for a ChartConfig.
 * Returns { data, seriesKeys } or { data: [], seriesKeys: [], error }.
 */
export function buildChartData(dataset, config) {
  const fail = (error) => ({ data: [], seriesKeys: [], error });

  if (!dataset || !Array.isArray(dataset.rows)) {
    return fail('Dataset has no rows to chart.');
  }
  const errs = validateChartConfig(dataset, config);
  if (errs.length > 0) return fail(errs.join(' '));

  const type = config.type;
  const rows = applyFilters(dataset.rows, config.filters);

  // --- histogram ----------------------------------------------------
  if (type === 'histogram') {
    const bins = buildHistogram(
      rows.map((r) => r[config.xKey]),
      10
    );
    return {
      data: bins.map((b) => ({ label: b.label, count: b.count })),
      seriesKeys: ['count'],
    };
  }

  // --- scatter ------------------------------------------------------
  if (type === 'scatter') {
    let pts = [];
    for (const r of rows) {
      const x = asNum(r[config.xKey]);
      const y = config.yKey == null ? null : asNum(r[config.yKey]);
      if (x === null || y === null) continue;
      const pt = { x, y };
      if (config.groupKey) pt.group = String(r[config.groupKey]);
      pts.push(pt);
    }
    if (pts.length > 2000) {
      const stride = Math.ceil(pts.length / 2000);
      pts = pts.filter((_, i) => i % stride === 0);
    }
    const seriesKeys = config.groupKey
      ? [...new Set(pts.map((p) => p.group))]
      : ['points'];
    return { data: pts, seriesKeys };
  }

  // --- box ----------------------------------------------------------
  if (type === 'box') {
    const groups = new Map();
    for (const r of rows) {
      const xv = r[config.xKey];
      if (isMissing(xv)) continue;
      const k = String(xv);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r[config.yKey]);
    }
    const data = [];
    for (const [k, vals] of groups) {
      const d = describeColumn(vals);
      if (d.count === 0) continue;
      data.push({
        group: k,
        min: d.min,
        q1: d.q1,
        median: d.median,
        q3: d.q3,
        max: d.max,
        count: d.count,
      });
    }
    return { data, seriesKeys: ['box'] };
  }

  // --- pie / donut --------------------------------------------------
  if (type === 'pie' || type === 'donut') {
    const agg = aggregate({
      rows,
      xKey: config.xKey,
      yKey: config.yKey,
      aggregation: config.aggregation,
      groupKey: null,
      sort: 'none',
    });
    const ranked = [...agg.data].sort((a, b) => {
      const va = typeof a.value === 'number' ? a.value : -Infinity;
      const vb = typeof b.value === 'number' ? b.value : -Infinity;
      return vb - va;
    });
    let data = ranked;
    if (ranked.length > 12) {
      const top = ranked.slice(0, 12);
      const rest = ranked.slice(12);
      const otherTotal = rest.reduce(
        (s, r) => s + (typeof r.value === 'number' ? r.value : 0),
        0
      );
      data = [...top, { x: 'Other', value: otherTotal }];
    }
    return { data, seriesKeys: ['value'] };
  }

  // --- bar / hbar / line / area -------------------------------------
  let sort = config.sort || 'none';
  if (
    sort === 'none' &&
    (type === 'line' || type === 'area') &&
    colTypeOf(dataset, config.xKey) === 'date'
  ) {
    sort = 'asc';
  }
  return aggregate({
    rows,
    xKey: config.xKey,
    yKey: config.yKey,
    aggregation: config.aggregation,
    groupKey: config.groupKey,
    sort,
  });
}

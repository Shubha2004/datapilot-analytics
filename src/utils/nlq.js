/**
 * nlq.js — natural-language to chart/table for DataPilot Analytics.
 *
 * parseNLQ(question, dataset) matches metrics, time grains and column
 * names in plain English, builds a ChartConfig, computes it in-browser
 * via buildChartData, and returns an illustrative (non-executed) SQL
 * string alongside the result.
 */
import { buildChartData } from './chartData';

export const NLQ_EXAMPLES = [
  'Show monthly revenue by region',
  'Top 5 products by revenue',
  'Average order value by channel',
  'Total quantity sold per category',
  'Revenue trend over time',
  'Bottom 3 categories by revenue',
  'Orders by customer segment',
  'Monthly quantity by channel',
  'Top 10 products by quantity',
  'Average unit price by category',
  'Revenue by region',
  'Count of orders per month',
];

/* ------------------------------------------------------------------ */
/* Matchers                                                            */
/* ------------------------------------------------------------------ */

const METRICS = [
  { re: /order value|\baov\b/, col: 'revenue', agg: 'avg', label: 'order value' },
  { re: /\brevenue\b|\bsales\b/, col: 'revenue', agg: 'sum', label: 'revenue' },
  { re: /\bquantity\b|\bqty\b/, col: 'quantity', agg: 'sum', label: 'quantity' },
  { re: /\borders\b/, col: null, agg: 'count', label: 'orders' },
  { re: /\bprice\b/, col: 'unit_price', agg: 'avg', label: 'unit price' },
];

const GRAINS = [
  { re: /quarterly|\bquarters?\b/, grain: 'quarterly', title: 'Quarterly', trunc: 'quarter', alias: 'quarter' },
  { re: /weekly|\bweeks?\b/, grain: 'weekly', title: 'Weekly', trunc: 'week', alias: 'week' },
  { re: /yearly|\byearly\b|\bannual(?:ly)?\b/, grain: 'yearly', title: 'Yearly', trunc: 'year', alias: 'year' },
  { re: /monthly|\bmonths?\b/, grain: 'monthly', title: 'Monthly', trunc: 'month', alias: 'month' },
];

const AGG_FNS = { sum: 'SUM', avg: 'AVG', count: 'COUNT', min: 'MIN', max: 'MAX' };
const AGG_WORDS = { sum: 'Total', avg: 'Average', count: 'Count of', min: 'Min', max: 'Max' };

/** Column-name mention with underscore/space and plural tolerance
 *  (customer_segment matches "customer segment"; category -> categories). */
function mentionsQuestion(q, name) {
  const n = String(name).toLowerCase();
  const variants = [n, n.replace(/_/g, ' ')];
  for (const v of variants) {
    if (q.includes(v)) return true;
    const plural = v.endsWith('y') ? v.slice(0, -1) + 'ies' : v + 's';
    if (q.includes(plural)) return true;
  }
  return false;
}

function cap(s) {
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pretty(s) {
  return String(s).replace(/_/g, ' ');
}

/* ------------------------------------------------------------------ */
/* Period derivation                                                   */
/* ------------------------------------------------------------------ */

function periodKey(dateVal, grain) {
  const d = new Date(dateVal);
  if (Number.isNaN(+d)) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  switch (grain) {
    case 'yearly':
      return `${y}`;
    case 'quarterly':
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case 'weekly': {
      const tmp = new Date(Date.UTC(y, m, day));
      const dayNum = (tmp.getUTCDay() + 6) % 7; // Monday = 0
      tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3); // shift to Thursday
      const isoYear = tmp.getUTCFullYear();
      const jan4 = new Date(Date.UTC(isoYear, 0, 4));
      const jan4Day = (jan4.getUTCDay() + 6) % 7;
      jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
      const week = 1 + Math.round((tmp - jan4) / 604800000);
      return `${isoYear}-W${pad(week)}`;
    }
    default:
      return `${y}-${pad(m + 1)}`;
  }
}

/** Shallow-copied dataset with a derived '__period' categorical column. */
function withPeriod(dataset, dateColName, grain) {
  const rows = (dataset.rows || [])
    .map((r) => ({ ...r, __period: periodKey(r[dateColName], grain) }))
    .filter((r) => r.__period !== null);
  return {
    ...dataset,
    columns: [...dataset.columns, { name: '__period', type: 'categorical' }],
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* SQL (illustrative only)                                             */
/* ------------------------------------------------------------------ */

function buildSQL({ datasetName, xExpr, xAlias, groupKey, yKey, aggregation, sortDir, topN }) {
  const table =
    String(datasetName || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'dataset';
  const aggFn = AGG_FNS[aggregation] || 'SUM';
  const metricAlias = `${aggregation}_${yKey || 'rows'}`;
  const metricExpr =
    aggregation === 'count' ? (yKey ? `COUNT(${yKey})` : 'COUNT(*)') : `${aggFn}(${yKey})`;
  const selectCols = [`${xExpr} AS ${xAlias}`];
  if (groupKey) selectCols.push(groupKey);
  selectCols.push(`${metricExpr} AS ${metricAlias}`);

  const lines = ['-- Illustrative SQL (not executed; computed in-browser)'];
  lines.push(`SELECT ${selectCols.join(', ')}`);
  lines.push(`FROM ${table}`);
  lines.push(groupKey ? 'GROUP BY 1, 2' : 'GROUP BY 1');
  if (topN) {
    lines.push(`ORDER BY ${metricAlias} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`);
  } else {
    lines.push(groupKey ? 'ORDER BY 1, 2' : 'ORDER BY 1');
  }
  if (topN) lines.push(`LIMIT ${topN}`);
  return lines.join('\n') + ';';
}

/* ------------------------------------------------------------------ */
/* parseNLQ                                                            */
/* ------------------------------------------------------------------ */

function noMatch() {
  return {
    sql: null,
    chartConfig: null,
    table: null,
    error: "I couldn't map that to the dataset.",
    suggestions: NLQ_EXAMPLES.slice(0, 3),
  };
}

function metricTotal(row, seriesKeys) {
  let total = 0;
  let any = false;
  for (const k of seriesKeys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

/**
 * Parse a natural-language question into { sql, chartConfig, table }.
 * On no match: { error, suggestions } with sql/chartConfig/table null.
 */
export function parseNLQ(question, dataset) {
  const q = String(question === null || question === undefined ? '' : question)
    .toLowerCase()
    .trim();
  if (!q || !dataset || !Array.isArray(dataset.columns) || dataset.columns.length === 0) {
    return noMatch();
  }
  const cols = dataset.columns;
  const exists = (name) => cols.some((c) => c.name === name);

  // 1. Metric ---------------------------------------------------------
  let yKey = null;
  let aggregation = 'count';
  let metricLabel = 'records';
  for (const m of METRICS) {
    if (m.re.test(q)) {
      metricLabel = m.label;
      aggregation = m.agg;
      if (m.col && exists(m.col)) {
        yKey = m.col;
      } else if (m.agg !== 'count') {
        const numCol = cols.find((c) => c.type === 'numeric');
        yKey = numCol ? numCol.name : null;
      }
      break;
    }
  }
  if (yKey && /\baverage\b|\bavg\b|\bmean\b/.test(q)) aggregation = 'avg';
  else if (yKey && /\btotal\b|\bsum\b/.test(q)) aggregation = 'sum';

  // 2. Time grain + date column ---------------------------------------
  const dateCol =
    cols.find((c) => c.type === 'date' && mentionsQuestion(q, c.name)) ||
    cols.find((c) => c.type === 'date');
  let grainInfo = null;
  for (const g of GRAINS) {
    if (g.re.test(q)) {
      grainInfo = g;
      break;
    }
  }

  // 3. Mentioned categorical columns -----------------------------------
  const catCols = cols.filter((c) => c.type === 'categorical');
  const mentioned = catCols.filter((c) => mentionsQuestion(q, c.name));

  // 4. Patterns ---------------------------------------------------------
  const topM = q.match(/\btop (\d+)\b/);
  const botM = q.match(/\bbottom (\d+)\b/);
  const topN = topM ? parseInt(topM[1], 10) : botM ? parseInt(botM[1], 10) : null;
  const sortDir = topM ? 'desc' : botM ? 'asc' : 'none';
  const isTrend = /\btrend\b|over time/.test(q);
  const distM = q.match(/(?:distribution|breakdown) of (?:the )?([a-z][a-z_ ]*)/);

  // 5. Assemble chart ----------------------------------------------------
  let type = null;
  let xKey = null;
  let groupKey = null;
  let workingDataset = dataset;
  let periodGrain = null;

  if (distM) {
    const phrase = distM[1];
    const target =
      catCols.find(
        (c) => phrase.includes(c.name.toLowerCase()) || mentionsQuestion(phrase, c.name)
      ) || mentioned[0];
    if (!target) return noMatch();
    type = 'pie';
    xKey = target.name;
    yKey = null;
    aggregation = 'count';
    metricLabel = 'records';
  } else if (isTrend || grainInfo) {
    if (!dateCol) return noMatch();
    type = 'line';
    if (grainInfo) {
      workingDataset = withPeriod(dataset, dateCol.name, grainInfo.grain);
      xKey = '__period';
      periodGrain = grainInfo;
    } else {
      xKey = dateCol.name;
    }
    if (mentioned.length > 0) groupKey = mentioned[0].name;
  } else if (mentioned.length > 0) {
    type = 'bar';
    xKey = mentioned[0].name;
    if (mentioned.length > 1) groupKey = mentioned[1].name;
  } else {
    return noMatch();
  }

  const aggWord = AGG_WORDS[aggregation] || 'Total';
  let title;
  if (type === 'pie') {
    title = `${cap(pretty(xKey))} breakdown`;
  } else if (type === 'line') {
    title = periodGrain
      ? `${periodGrain.title} ${metricLabel}${groupKey ? ' by ' + pretty(groupKey) : ''}`
      : `${cap(metricLabel)} trend over time`;
  } else {
    title = `${aggWord} ${metricLabel} by ${pretty(xKey)}`;
  }

  const chartConfig = {
    id: 'nlq-chart',
    title,
    type,
    xKey,
    yKey,
    aggregation,
    groupKey,
    sort: sortDir !== 'none' ? sortDir : type === 'line' ? 'asc' : 'none',
    filters: [],
  };

  // 6. Illustrative SQL ---------------------------------------------------
  const sql = buildSQL({
    datasetName: dataset.name,
    xExpr: periodGrain ? `DATE_TRUNC('${periodGrain.trunc}', ${dateCol.name})` : xKey,
    xAlias: periodGrain ? periodGrain.alias : xKey,
    groupKey,
    yKey,
    aggregation,
    sortDir,
    topN,
  });

  // 7. Compute in-browser --------------------------------------------------
  const built = buildChartData(workingDataset, chartConfig);
  if (built.error) {
    return {
      sql,
      chartConfig: null,
      table: null,
      error: `I couldn't build that chart: ${built.error}`,
      suggestions: NLQ_EXAMPLES.slice(0, 3),
    };
  }

  let data = built.data;
  if (topN) {
    const dir = sortDir === 'asc' ? 1 : -1;
    data = [...data]
      .sort((a, b) => {
        const va = metricTotal(a, built.seriesKeys);
        const vb = metricTotal(b, built.seriesKeys);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return dir * (va - vb);
      })
      .slice(0, topN);
  }

  return {
    sql,
    chartConfig,
    table: { columns: ['x', ...built.seriesKeys], rows: data },
  };
}

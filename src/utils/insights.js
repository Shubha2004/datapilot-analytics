/**
 * insights.js — auto-generated data insights for DataPilot Analytics.
 * Each insight: { id, title, body, kind } with kind in
 * 'info' | 'warning' | 'success'. Only emitted when the data supports it.
 */
import { describeColumn, correlationMatrix, linearTrend } from './statistics';
import { isMissing, toNumber } from './dataTypes';

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function fmtNum(v) {
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return 'n/a';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtMoney(v) {
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return 'n/a';
  return '$' + fmtNum(n);
}

export function fmtPct(v, digits = 1) {
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return 'n/a';
  return (n * 100).toFixed(digits) + '%';
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthName(yyyymm) {
  const m = parseInt(String(yyyymm).slice(5, 7), 10);
  return MONTHS[m - 1] || String(yyyymm);
}

function cap(s) {
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function fmtDate(v) {
  const d = new Date(v);
  if (Number.isNaN(+d)) return String(v);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function numOrNull(v) {
  const n = toNumber(v);
  return n === null || n === undefined || Number.isNaN(n) ? null : n;
}

/* ------------------------------------------------------------------ */
/* Insight generation                                                  */
/* ------------------------------------------------------------------ */

const MAX_INSIGHTS = 8;

/**
 * Generate up to ~8 insights for the dataset. Returns
 * [{ id, title, body, kind }].
 */
export function generateInsights(dataset) {
  const out = [];
  const push = (id, title, body, kind) => {
    if (out.length < MAX_INSIGHTS) out.push({ id, title, body, kind });
  };

  if (!dataset || !Array.isArray(dataset.rows) || dataset.rows.length === 0) {
    return out;
  }
  const rows = dataset.rows;
  const cols = Array.isArray(dataset.columns) ? dataset.columns : [];
  const firstCat = cols.find((c) => c.type === 'categorical');
  const firstNum = cols.find((c) => c.type === 'numeric');
  const dateCol = cols.find((c) => c.type === 'date');
  const numericCols = cols.filter((c) => c.type === 'numeric');

  // 6. Dataset summary ------------------------------------------------
  let summary = `Dataset spans ${fmtNum(rows.length)} rows and ${cols.length} columns.`;
  if (dateCol) {
    const dates = rows
      .map((r) => r[dateCol.name])
      .filter((v) => !isMissing(v))
      .map(String)
      .sort();
    if (dates.length > 0) {
      summary += ` Data runs from ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}.`;
    }
  }
  push('ins-summary', 'Dataset overview', summary, 'info');

  // 1. Top & bottom category ------------------------------------------
  if (firstCat && firstNum) {
    const sums = new Map();
    for (const r of rows) {
      const c = r[firstCat.name];
      if (isMissing(c)) continue;
      const n = numOrNull(r[firstNum.name]);
      if (n === null) continue;
      const k = String(c);
      sums.set(k, (sums.get(k) || 0) + n);
    }
    const entries = [...sums.entries()].sort((a, b) => b[1] - a[1]);
    if (entries.length >= 2) {
      const [topK, topV] = entries[0];
      const [botK, botV] = entries[entries.length - 1];
      const ratio = botV > 0 ? topV / botV : null;
      push(
        'ins-topcat',
        `${topK} leads ${firstNum.name}`,
        `${topK} leads ${firstNum.name} at ${fmtMoney(topV)}` +
          (ratio !== null ? `, ${ratio.toFixed(1)}× ${botK} (${fmtMoney(botV)}).` : '.'),
        'success'
      );
    }
  }

  // 2. Monthly trend ---------------------------------------------------
  if (dateCol && firstNum) {
    const buckets = new Map();
    for (const r of rows) {
      const dv = r[dateCol.name];
      if (isMissing(dv)) continue;
      const d = new Date(dv);
      if (Number.isNaN(+d)) continue;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const n = numOrNull(r[firstNum.name]);
      if (n === null) continue;
      buckets.set(key, (buckets.get(key) || 0) + n);
    }
    const keys = [...buckets.keys()].sort();
    if (keys.length >= 3) {
      const pts = keys.map((k, i) => ({ x: i, y: buckets.get(k) }));
      const t = linearTrend(pts);
      const startName = monthName(keys[0]);
      const endName = monthName(keys[keys.length - 1]);
      const year = String(keys[keys.length - 1]).slice(0, 4);
      const verb =
        t.direction === 'increasing'
          ? 'trends upward'
          : t.direction === 'decreasing'
            ? 'trends downward'
            : 'is roughly flat';
      const slopeTxt =
        t.slope !== null && t.direction !== 'flat'
          ? ` (about ${fmtMoney(Math.abs(t.slope))} per month)`
          : '';
      push(
        'ins-trend',
        `${cap(firstNum.name)} trend`,
        `${cap(firstNum.name)} ${verb} from ${startName} to ${endName} ${year}${slopeTxt}.`,
        t.direction === 'increasing' ? 'success' : t.direction === 'decreasing' ? 'warning' : 'info'
      );
    }
  }

  // 5. Strong correlations ---------------------------------------------
  if (numericCols.length >= 2) {
    const names = numericCols.map((c) => c.name);
    const { matrix } = correlationMatrix(rows, names);
    const pairs = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const r = matrix[i][j];
        if (r !== null && Math.abs(r) >= 0.7) pairs.push({ a: names[i], b: names[j], r });
      }
    }
    pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
    for (const p of pairs.slice(0, 2)) {
      push(
        `ins-corr-${p.a}-${p.b}`,
        `Strong correlation: ${p.a} and ${p.b}`,
        `${p.a} and ${p.b} move together (r=${p.r.toFixed(2)}). Correlation does not imply causation.`,
        'info'
      );
    }
  }

  // 4. Outlier extremes -------------------------------------------------
  for (const c of numericCols) {
    const d = describeColumn(rows.map((r) => r[c.name]));
    if (d.outlierCount > 0 && d.median !== null) {
      push(
        'ins-outliers',
        `Unusual values in ${c.name}`,
        `Unusually large values in ${c.name}: max ${fmtMoney(d.max)} vs median ${fmtMoney(d.median)} ` +
          `(${d.outlierCount} outlier${d.outlierCount === 1 ? '' : 's'} detected).`,
        'warning'
      );
      break;
    }
  }

  // 3. Missing data ----------------------------------------------------
  for (const c of cols) {
    const miss = rows.reduce((acc, r) => acc + (isMissing(r[c.name]) ? 1 : 0), 0);
    const pct = rows.length > 0 ? miss / rows.length : 0;
    if (pct > 0.2) {
      push(
        `ins-missing-${c.name}`,
        `Missing data in ${c.name}`,
        `${fmtPct(pct)} of values in "${c.name}" are missing ` +
          `(${fmtNum(miss)} of ${fmtNum(rows.length)} rows). Consider checking the source or excluding this column.`,
        'warning'
      );
    }
  }

  return out;
}

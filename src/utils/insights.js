/**
 * insights.js — auto-generated data insights for DataPilot Analytics.
 *
 * Each insight carries the legacy shape { id, title, body, kind } with kind in
 * 'info' | 'warning' | 'success' (kept for backwards compatibility), plus a
 * rich additive layer rendered by InsightCard:
 *
 *   headline      — short headline (often mirrors title)
 *   finding       — the one-sentence finding
 *   values        — object of the actual supporting numbers
 *   calculation   — string describing the computation performed
 *   whyItMatters  — business relevance of the finding
 *   nextStep      — recommended follow-up action
 *   caveat        — confidence / data-quality caveat
 *
 * Only insights the data supports are emitted (existing data-gating kept).
 * All detection is rule-based — nothing here is described as AI.
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
 * [{ id, title, body, kind, headline, finding, values, calculation,
 *    whyItMatters, nextStep, caveat }].
 */
export function generateInsights(dataset) {
  const out = [];
  const push = (id, title, body, kind, extra = {}) => {
    if (out.length < MAX_INSIGHTS) out.push({ id, title, body, kind, ...extra });
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

  const isSample = !!(dataset.meta && dataset.meta.source === 'sample');
  const sampleCaveat =
    `n=${rows.length.toLocaleString('en-US')} synthetic rows generated locally for demonstration ` +
    `— patterns are illustrative, not real business evidence.`;

  // 6. Dataset summary ------------------------------------------------
  let summary = `Dataset spans ${fmtNum(rows.length)} rows and ${cols.length} columns.`;
  let rangeStart = null;
  let rangeEnd = null;
  if (dateCol) {
    const dates = rows
      .map((r) => r[dateCol.name])
      .filter((v) => !isMissing(v))
      .map(String)
      .sort();
    if (dates.length > 0) {
      rangeStart = dates[0];
      rangeEnd = dates[dates.length - 1];
      summary += ` Data runs from ${fmtDate(rangeStart)} to ${fmtDate(rangeEnd)}.`;
    }
  }
  push('ins-summary', 'Dataset overview', summary, 'info', {
    headline: 'Dataset overview',
    finding: summary,
    values: {
      rows: rows.length,
      columns: cols.length,
      ...(rangeStart ? { startDate: rangeStart, endDate: rangeEnd } : {}),
    },
    calculation: rangeStart
      ? `COUNT(rows), COUNT(columns); MIN/MAX(${dateCol.name}) for the date range`
      : 'COUNT(rows), COUNT(columns)',
    whyItMatters:
      'Every chart and statistic in this report describes exactly this data window — ' +
      'conclusions do not extend beyond it.',
    nextStep: 'Confirm this is the complete dataset you intended to analyze before sharing the report.',
    caveat: isSample ? sampleCaveat : 'Counts reflect the uploaded file as-is.',
  });

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
      const body =
        `${topK} leads ${firstNum.name} at ${fmtMoney(topV)}` +
        (ratio !== null ? `, ${ratio.toFixed(1)}× ${botK} (${fmtMoney(botV)}).` : '.');
      push('ins-topcat', `${topK} leads ${firstNum.name}`, body, 'success', {
        headline: `${topK} leads ${firstNum.name}`,
        finding: body,
        values: {
          topCategory: topK,
          [`top${cap(firstNum.name)}`]: topV,
          bottomCategory: botK,
          [`bottom${cap(firstNum.name)}`]: botV,
          distinctCategories: entries.length,
          ...(ratio !== null ? { leadRatio: Math.round(ratio * 10) / 10 } : {}),
        },
        calculation: `SUM(${firstNum.name}) GROUP BY ${firstCat.name}, ranked descending`,
        whyItMatters:
          `Concentration in ${topK} is both a growth lever and a risk — a slip there moves the total.`,
        nextStep:
          `Dig into what drives ${topK}'s lead (volume, pricing, or region) before reallocating budget.`,
        caveat:
          (isSample ? sampleCaveat + ' ' : '') +
          `Rows with missing ${firstCat.name} or non-numeric ${firstNum.name} are excluded.`,
      });
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
      const body = `${cap(firstNum.name)} ${verb} from ${startName} to ${endName} ${year}${slopeTxt}.`;
      push('ins-trend', `${cap(firstNum.name)} trend`, body, t.direction === 'increasing' ? 'success' : t.direction === 'decreasing' ? 'warning' : 'info', {
        headline: `${cap(firstNum.name)} trend`,
        finding: body,
        values: {
          direction: t.direction,
          slopePerMonth: t.slope,
          startMonth: keys[0],
          endMonth: keys[keys.length - 1],
          months: keys.length,
        },
        calculation:
          `SUM(${firstNum.name}) per calendar month; ordinary least-squares fit ` +
          `on the ${keys.length} monthly totals`,
        whyItMatters:
          'Trend direction shapes forecasts and resourcing — know whether the metric is accelerating or cooling.',
        nextStep:
          'Check the chart for one-off spikes, then re-run excluding the most extreme month to test robustness.',
        caveat:
          'Linear fit only — seasonality and one-off events are not modelled; ' +
          'small month counts make the slope fragile.' +
          (isSample ? ' ' + sampleCaveat : ''),
      });
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
      const body =
        `${p.a} and ${p.b} move together (r=${p.r.toFixed(2)}). Correlation does not imply causation.`;
      push(`ins-corr-${p.a}-${p.b}`, `Strong correlation: ${p.a} and ${p.b}`, body, 'info', {
        headline: `Strong correlation: ${p.a} and ${p.b}`,
        finding: body,
        values: {
          columnA: p.a,
          columnB: p.b,
          pearsonR: Math.round(p.r * 100) / 100,
        },
        calculation: 'Pearson correlation on pairwise-complete numeric rows; |r| ≥ 0.7 flagged',
        whyItMatters:
          'Highly correlated columns carry overlapping information — useful for prediction, redundant for dashboards.',
        nextStep: `Plot ${p.a} against ${p.b} as a scatter chart to inspect the relationship visually.`,
        caveat:
          'Rule-based flag (|r| ≥ 0.7) on this dataset only; correlation does not imply causation.' +
          (isSample ? ' ' + sampleCaveat : ''),
      });
    }
  }

  // 4. Outlier extremes -------------------------------------------------
  for (const c of numericCols) {
    const d = describeColumn(rows.map((r) => r[c.name]));
    if (d.outlierCount > 0 && d.median !== null) {
      const body =
        `Unusually large values in ${c.name}: max ${fmtMoney(d.max)} vs median ${fmtMoney(d.median)} ` +
        `(${d.outlierCount} outlier${d.outlierCount === 1 ? '' : 's'} detected).`;
      push('ins-outliers', `Unusual values in ${c.name}`, body, 'warning', {
        headline: `Unusual values in ${c.name}`,
        finding: body,
        values: {
          column: c.name,
          max: d.max,
          median: d.median,
          outlierCount: d.outlierCount,
        },
        calculation: `1.5 × IQR (Tukey) fences on ${c.name}`,
        whyItMatters:
          'Outliers can dominate sums and averages — decide whether they are errors or genuine extremes before trusting totals.',
        nextStep:
          `Validate the flagged ${c.name} rows at the source; exclude and re-run if they are data-entry errors.`,
        caveat: 'The IQR rule is a heuristic — skewed distributions and small samples trigger it easily.',
      });
      break;
    }
  }

  // 3. Missing data ----------------------------------------------------
  for (const c of cols) {
    const miss = rows.reduce((acc, r) => acc + (isMissing(r[c.name]) ? 1 : 0), 0);
    const pct = rows.length > 0 ? miss / rows.length : 0;
    if (pct > 0.2) {
      const body =
        `${fmtPct(pct)} of values in "${c.name}" are missing ` +
        `(${fmtNum(miss)} of ${fmtNum(rows.length)} rows). Consider checking the source or excluding this column.`;
      push(`ins-missing-${c.name}`, `Missing data in ${c.name}`, body, 'warning', {
        headline: `Missing data in ${c.name}`,
        finding: body,
        values: {
          column: c.name,
          missingCount: miss,
          missingPct: Math.round(pct * 1000) / 1000,
          totalRows: rows.length,
        },
        calculation: `COUNT(missing) / COUNT(rows) for ${c.name}`,
        whyItMatters: 'Missing values silently shrink every statistic and chart that uses this column.',
        nextStep:
          `Check the source system for ${c.name}; consider excluding the column or filling gaps before analysis.`,
        caveat: 'The >20% bar is a rule of thumb — domain knowledge may justify a different threshold.',
      });
    }
  }

  return out;
}

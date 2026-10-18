/**
 * statistics.js — null-safe descriptive statistics, inference helpers,
 * histograms and trend estimation for DataPilot Analytics.
 *
 * Every function is null-safe: when there is insufficient data the
 * computed fields come back as null (counts stay numeric, mode stays []).
 */
import { isMissing, toNumber } from './dataTypes';

/* ------------------------------------------------------------------ */
/* Numeric helpers                                                     */
/* ------------------------------------------------------------------ */

/** Keep finite numbers from toNumber(), drop missing, return sorted asc. */
export function sortedNumeric(values) {
  const out = [];
  const arr = Array.isArray(values) ? values : [];
  for (const v of arr) {
    if (isMissing(v)) continue;
    const n = toNumber(v);
    if (n === null || n === undefined || Number.isNaN(n)) continue;
    out.push(n);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Percentile of a pre-sorted numeric array (linear interpolation).
 * p is in [0, 100]. Returns null for empty input.
 */
export function percentile(sortedArr, p) {
  if (!Array.isArray(sortedArr) || sortedArr.length === 0) return null;
  const n = sortedArr.length;
  const pc = Math.min(100, Math.max(0, p));
  const rank = (pc / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedArr[lo];
  const frac = rank - lo;
  return sortedArr[lo] + frac * (sortedArr[hi] - sortedArr[lo]);
}

/** Median of a pre-sorted numeric array. Null for empty input. */
export function medianOf(sortedArr) {
  return percentile(sortedArr, 50);
}

/* ------------------------------------------------------------------ */
/* Normal distribution helpers (Acklam inverse CDF)                     */
/* ------------------------------------------------------------------ */

/** Inverse standard normal CDF (Acklam's approximation). */
function invNormCDF(p) {
  if (!(p > 0 && p < 1)) return null;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  let x;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
  }
  return x;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, ~1e-7 accuracy). */
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  let prob =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

/* ------------------------------------------------------------------ */
/* Descriptive statistics                                              */
/* ------------------------------------------------------------------ */

/**
 * Full descriptive summary of a column's values.
 * Outliers use the 1.5 × IQR rule.
 */
export function describeColumn(values) {
  const arr = Array.isArray(values) ? values : [];
  const s = sortedNumeric(arr);
  const n = s.length;
  const missing = arr.reduce((c, v) => c + (isMissing(v) ? 1 : 0), 0);

  const empty = {
    count: n,
    missing,
    sum: null,
    mean: null,
    median: null,
    mode: [],
    min: null,
    max: null,
    range: null,
    varPop: null,
    varSample: null,
    stdPop: null,
    stdSample: null,
    q1: null,
    q3: null,
    iqr: null,
    p5: null,
    p10: null,
    p90: null,
    p95: null,
    outlierCount: 0,
    lowerBound: null,
    upperBound: null,
  };
  if (n === 0) return empty;

  const sum = s.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = percentile(s, 50);

  const freq = new Map();
  for (const v of s) freq.set(v, (freq.get(v) || 0) + 1);
  let maxFreq = 0;
  for (const f of freq.values()) if (f > maxFreq) maxFreq = f;
  const mode =
    maxFreq > 1 || n === 1
      ? [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v)
      : [];

  const min = s[0];
  const max = s[n - 1];
  let ss = 0;
  for (const v of s) ss += (v - mean) * (v - mean);
  const varPop = ss / n;
  const varSample = n > 1 ? ss / (n - 1) : null;

  const q1 = percentile(s, 25);
  const q3 = percentile(s, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outlierCount = s.filter((v) => v < lowerBound || v > upperBound).length;

  return {
    count: n,
    missing,
    sum,
    mean,
    median,
    mode,
    min,
    max,
    range: max - min,
    varPop,
    varSample,
    stdPop: Math.sqrt(varPop),
    stdSample: varSample === null ? null : Math.sqrt(varSample),
    q1,
    q3,
    iqr,
    p5: percentile(s, 5),
    p10: percentile(s, 10),
    p90: percentile(s, 90),
    p95: percentile(s, 95),
    outlierCount,
    lowerBound,
    upperBound,
  };
}

/* ------------------------------------------------------------------ */
/* Correlation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Pearson correlation coefficient, pairwise-complete.
 * Returns null when fewer than 3 complete pairs or zero variance.
 */
export function pearson(xs, ys) {
  const pairs = [];
  const n = Math.min(
    Array.isArray(xs) ? xs.length : 0,
    Array.isArray(ys) ? ys.length : 0
  );
  for (let i = 0; i < n; i++) {
    const a = toNumber(xs[i]);
    const b = toNumber(ys[i]);
    if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) continue;
    pairs.push([a, b]);
  }
  const m = pairs.length;
  if (m < 3) return null;
  let sx = 0;
  let sy = 0;
  for (const [a, b] of pairs) {
    sx += a;
    sy += b;
  }
  const mx = sx / m;
  const my = sy / m;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [a, b] of pairs) {
    const da = a - mx;
    const db = b - my;
    num += da * db;
    dx += da * da;
    dy += db * db;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return null;
  return num / den;
}

/**
 * Correlation matrix over the given numeric column names.
 * Returns { columns, matrix } with matrix[i][j] a number or null,
 * and 1 on the diagonal.
 */
export function correlationMatrix(rows, numericColNames) {
  const columns = (numericColNames || []).filter(Boolean);
  const data = Array.isArray(rows) ? rows : [];
  const matrix = columns.map((c1, i) =>
    columns.map((c2, j) => {
      if (i === j) return 1;
      const xs = [];
      const ys = [];
      for (const r of data) {
        const a = toNumber(r[c1]);
        const b = toNumber(r[c2]);
        if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) continue;
        xs.push(a);
        ys.push(b);
      }
      return pearson(xs, ys);
    })
  );
  return { columns, matrix };
}

/* ------------------------------------------------------------------ */
/* Inference                                                           */
/* ------------------------------------------------------------------ */

/** Confidence interval for the mean (normal approximation / CLT). */
export function meanCI(values, conf = 0.95) {
  const s = sortedNumeric(values);
  const n = s.length;
  const result = {
    mean: null,
    n,
    stdSample: null,
    se: null,
    lower: null,
    upper: null,
    conf,
    method:
      'Normal approximation (CLT); assumes independent observations and roughly normal sampling distribution (n≥30 preferred)',
  };
  if (n < 2) return result;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (const v of s) ss += (v - mean) * (v - mean);
  const stdSample = Math.sqrt(ss / (n - 1));
  const se = stdSample / Math.sqrt(n);
  const z = invNormCDF(1 - (1 - conf) / 2);
  if (z === null) return { ...result, mean, stdSample, se };
  const margin = z * se;
  return { ...result, mean, stdSample, se, lower: mean - margin, upper: mean + margin };
}

/**
 * One-sample t-test (two-sided). The critical value uses the inverse
 * standard normal CDF (normal approximation); the p-value is approximate.
 */
export function tTestOneSample(values, mu0, alpha = 0.05) {
  const assumptions = [
    'Independent observations',
    'Approximately normally distributed (or n≥30)',
    'Two-sided test',
  ];
  const s = sortedNumeric(values);
  const n = s.length;
  const base = {
    n,
    mean: null,
    stdSample: null,
    t: null,
    df: n > 0 ? n - 1 : null,
    criticalValue: null,
    reject: false,
    alpha,
    pApprox: null,
    assumptions,
  };
  if (n < 2 || !Number.isFinite(mu0)) return base;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (const v of s) ss += (v - mean) * (v - mean);
  const stdSample = Math.sqrt(ss / (n - 1));
  const se = stdSample / Math.sqrt(n);
  if (se === 0) return { ...base, mean, stdSample };
  const t = (mean - mu0) / se;
  const criticalValue = invNormCDF(1 - alpha / 2);
  const pApprox = 2 * (1 - normCDF(Math.abs(t)));
  return {
    n,
    mean,
    stdSample,
    t,
    df: n - 1,
    criticalValue,
    reject: criticalValue !== null && Math.abs(t) > criticalValue,
    alpha,
    pApprox,
    assumptions,
  };
}

/* ------------------------------------------------------------------ */
/* Histogram & trend                                                   */
/* ------------------------------------------------------------------ */

function binLabel(x0, x1) {
  const f = (v) => String(Math.round(v * 100) / 100);
  return `${f(x0)} – ${f(x1)}`;
}

/** Equal-width histogram bins: [{ x0, x1, label, count }]. */
export function histogram(values, binCount = 10) {
  const s = sortedNumeric(values);
  if (s.length === 0) return [];
  const n = Math.max(1, Math.floor(binCount) || 1);
  const min = s[0];
  const max = s[s.length - 1];
  if (min === max) {
    return [{ x0: min, x1: max, label: binLabel(min, max), count: s.length }];
  }
  const width = (max - min) / n;
  const bins = [];
  for (let i = 0; i < n; i++) {
    const x0 = min + i * width;
    bins.push({
      x0,
      x1: i === n - 1 ? max : min + (i + 1) * width,
      label: '',
      count: 0,
    });
  }
  for (const v of s) {
    let idx = Math.floor((v - min) / width);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  for (const b of bins) b.label = binLabel(b.x0, b.x1);
  return bins;
}

/**
 * Least-squares linear trend over [{x, y}].
 * direction is 'flat' when slope is exactly 0, otherwise its sign.
 */
export function linearTrend(points) {
  const pts = (Array.isArray(points) ? points : []).filter(
    (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  );
  const n = pts.length;
  if (n < 2) return { slope: null, direction: 'flat', n };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  return {
    slope,
    direction: slope === 0 ? 'flat' : slope > 0 ? 'increasing' : 'decreasing',
    n,
  };
}

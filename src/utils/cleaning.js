// Pure data-cleaning helpers for DataPilot Analytics.
// Never mutate inputs; always return new row arrays.

import { isMissing, toNumber } from './dataTypes.js';

function columnValues(rows, column) {
  return rows.map((row) => row[column]);
}

const MONTH_WORDS =
  /jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?/gi;

function isDateValue(v) {
  if (isMissing(v)) return false;
  if (typeof v === 'number') return false;
  const s = String(v).trim();
  if (s === '' || !/[0-9]/.test(s)) return false;
  // Guard against lenient Date.parse ("ORD-0001" parses as a timestamp):
  // reject ASCII letters that are not part of a month name.
  if (/[a-zA-Z]/.test(s.replace(MONTH_WORDS, ''))) return false;
  return !Number.isNaN(Date.parse(s));
}

/** Quality report for a dataset. */
export function analyzeQuality(dataset) {
  const { rows, columns } = dataset;
  const n = rows.length;
  const colNames = columns.map((c) => c.name);

  const missingByColumn = colNames.map((column) => {
    const missing = columnValues(rows, column).filter(isMissing).length;
    return { column, missing, pct: n === 0 ? 0 : (missing / n) * 100 };
  });

  const seen = new Set();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = JSON.stringify(row, Object.keys(row).sort());
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const numericCols = columns.filter((c) => c.type === 'numeric').map((c) => c.name);

  const invalidNumeric = numericCols.map((column) => ({
    column,
    count: columnValues(rows, column).filter(
      (v) => !isMissing(v) && toNumber(v) === null
    ).length,
  })).filter((d) => d.count > 0);

  const outliers = [];
  for (const column of numericCols) {
    const vals = columnValues(rows, column)
      .map(toNumber)
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    if (vals.length < 4) continue;
    const q1 = vals[Math.floor(vals.length * 0.25)];
    const q3 = vals[Math.floor(vals.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const count = vals.filter((v) => v < lower || v > upper).length;
    if (count > 0) outliers.push({ column, count, lower, upper });
  }

  const inconsistentCategories = [];
  for (const c of columns.filter((cc) => cc.type === 'categorical')) {
    const groups = new Map();
    for (const v of columnValues(rows, c.name)) {
      if (isMissing(v)) continue;
      const norm = String(v).trim().toLowerCase();
      if (!groups.has(norm)) groups.set(norm, new Set());
      groups.get(norm).add(String(v));
    }
    const variants = [...groups.values()]
      .filter((s) => s.size > 1)
      .map((s) => [...s]);
    if (variants.length > 0) {
      inconsistentCategories.push({
        column: c.name,
        variants,
        note: 'Values differ only by case or surrounding whitespace.',
      });
    }
  }

  const singleValueColumns = colNames.filter((column) => {
    const distinct = new Set(
      columnValues(rows, column).filter((v) => !isMissing(v)).map(String)
    );
    return distinct.size === 1 && n > 0;
  });

  const possibleDateColumns = columns
    .filter((c) => c.type === 'categorical')
    .filter((c) => {
      const present = columnValues(rows, c.name).filter((v) => !isMissing(v));
      return (
        present.length > 0 &&
        present.filter(isDateValue).length / present.length >= 0.8
      );
    })
    .map((c) => c.name);

  return {
    missingByColumn,
    duplicateRows,
    invalidNumeric,
    outliers,
    inconsistentCategories,
    singleValueColumns,
    possibleDateColumns,
  };
}

/** Remove duplicate rows (key = JSON.stringify of sorted-key row). */
export function removeDuplicates(rows) {
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const row of rows) {
    const key = JSON.stringify(row, Object.keys(row).sort());
    if (seen.has(key)) removed++;
    else {
      seen.add(key);
      out.push(row);
    }
  }
  return { rows: out, removed };
}

/** Drop rows missing a value in any of the listed columns. */
export function dropRowsWithMissing(rows, columnNames) {
  const cols = Array.isArray(columnNames) ? columnNames : [columnNames];
  const out = [];
  let removed = 0;
  for (const row of rows) {
    if (cols.some((c) => isMissing(row[c]))) removed++;
    else out.push(row);
  }
  return { rows: out, removed };
}

function mean(vals) {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function median(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Fill missing numeric values with mean or median of the column. */
export function fillNumeric(rows, column, method = 'mean') {
  const nums = columnValues(rows, column)
    .map(toNumber)
    .filter((v) => v !== null);
  if (nums.length === 0) return { rows: rows.slice(), filled: 0, value: null };
  const value = method === 'median' ? median(nums) : mean(nums);
  let filled = 0;
  const out = rows.map((row) => {
    if (isMissing(row[column]) || toNumber(row[column]) === null) {
      filled++;
      return { ...row, [column]: value };
    }
    return row;
  });
  return { rows: out, filled, value };
}

/** Fill missing values in a categorical column with a fixed value. */
export function fillCategorical(rows, column, value) {
  let filled = 0;
  const out = rows.map((row) => {
    if (isMissing(row[column])) {
      filled++;
      return { ...row, [column]: value };
    }
    return row;
  });
  return { rows: out, filled };
}

/** Trim whitespace from all string values. */
export function trimWhitespace(rows) {
  let changed = 0;
  const out = rows.map((row) => {
    const next = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string') {
        const t = v.trim();
        if (t !== v) changed++;
        next[k] = t;
      } else {
        next[k] = v;
      }
    }
    return next;
  });
  return { rows: out, changed };
}

/** Convert a column to numeric, date, or string. */
export function convertColumnType(rows, column, target) {
  let converted = 0;
  let failed = 0;
  const out = rows.map((row) => {
    const v = row[column];
    if (isMissing(v)) return row;
    let next = v;
    if (target === 'numeric') {
      const num = toNumber(v);
      if (num === null) {
        failed++;
        return row;
      }
      next = num;
    } else if (target === 'date') {
      const s = String(v).trim();
      const t = Date.parse(s);
      if (Number.isNaN(t)) {
        failed++;
        return row;
      }
      next = new Date(t).toISOString().slice(0, 10);
    } else if (target === 'string') {
      next = String(v);
    }
    converted++;
    return { ...row, [column]: next };
  });
  return { rows: out, converted, failed };
}

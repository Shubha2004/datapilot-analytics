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

/** Validate a column rename: non-empty, unique. Returns { ok, error?, name? }. */
export function validateRename(oldName, newName, colNames) {
  const trimmed = String(newName ?? '').trim();
  if (trimmed === '') {
    return { ok: false, error: 'New column name cannot be empty.' };
  }
  if (trimmed === oldName) {
    return { ok: false, error: `Column is already named "${oldName}".` };
  }
  const duplicate = (colNames || [])
    .filter((n) => n !== oldName)
    .some((n) => n.toLowerCase() === trimmed.toLowerCase());
  if (duplicate) {
    return { ok: false, error: `A column named "${trimmed}" already exists.` };
  }
  return { ok: true, name: trimmed };
}

/** Rename a column key in every row (original key order preserved). */
export function renameColumn(rows, oldName, newName) {
  if (oldName === newName) return { rows: rows.slice(), changed: 0 };
  let changed = 0;
  const out = rows.map((row) => {
    if (!(oldName in row)) return row;
    const next = {};
    for (const [k, v] of Object.entries(row)) {
      next[k === oldName ? newName : k] = v;
    }
    changed++;
    return next;
  });
  return { rows: out, changed };
}

/**
 * Validate a column removal: the column must exist and at least one other
 * column must remain. Returns { ok, error? }.
 */
export function validateRemove(column, colNames) {
  const names = colNames || [];
  if (!names.includes(column)) {
    return { ok: false, error: `Column "${column}" does not exist.` };
  }
  if (names.length < 2) {
    return {
      ok: false,
      error: 'Cannot remove the only column in the dataset.',
    };
  }
  return { ok: true };
}

/** Remove a column from every row. */
export function removeColumn(rows, column) {
  let removed = 0;
  const out = rows.map((row) => {
    if (!(column in row)) return row;
    const next = { ...row };
    delete next[column];
    removed++;
    return next;
  });
  return { rows: out, removed };
}

/** Validate fill-numeric preconditions: existing numeric column with at least
 *  one non-missing numeric value to compute mean/median from. */
export function validateFillNumeric(dataset, column, method = 'mean') {
  const colNames = (dataset.columns || []).map((c) => c.name);
  if (!colNames.includes(column)) {
    return { ok: false, error: `Column "${column}" does not exist.` };
  }
  const type = dataset.columns.find((c) => c.name === column)?.type;
  if (type !== 'numeric') {
    return {
      ok: false,
      error: `Fill (${method}) needs a numeric column — "${column}" is ${type || 'unknown'}.`,
    };
  }
  const nums = dataset.rows
    .map((r) => r[column])
    .map(toNumber)
    .filter((v) => v !== null);
  if (nums.length === 0) {
    return {
      ok: false,
      error: `Column "${column}" has no non-missing numeric values to compute a ${method} from.`,
    };
  }
  return { ok: true };
}

/** Validate fill-categorical preconditions: existing column + non-empty value. */
export function validateFillCategorical(dataset, column, value) {
  const colNames = (dataset.columns || []).map((c) => c.name);
  if (!colNames.includes(column)) {
    return { ok: false, error: `Column "${column}" does not exist.` };
  }
  if (String(value ?? '').trim() === '') {
    return { ok: false, error: 'Enter a fill value.' };
  }
  return { ok: true, value: String(value).trim() };
}

/** Validate type-conversion preconditions: existing column + known target. */
export function validateConvertType(dataset, column, target) {
  const colNames = (dataset.columns || []).map((c) => c.name);
  if (!colNames.includes(column)) {
    return { ok: false, error: `Column "${column}" does not exist.` };
  }
  if (!['numeric', 'date', 'string'].includes(target)) {
    return { ok: false, error: `Unknown target type "${target}".` };
  }
  return { ok: true };
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
      // Use the month-name-aware guard (isDateValue), not bare Date.parse:
      // ID-like codes such as "ORD-0001" must NOT be converted into dates.
      if (!isDateValue(v)) {
        failed++;
        return row;
      }
      const s = String(v).trim();
      next = new Date(Date.parse(s)).toISOString().slice(0, 10);
    } else if (target === 'string') {
      next = String(v);
    }
    converted++;
    return { ...row, [column]: next };
  });
  return { rows: out, converted, failed };
}

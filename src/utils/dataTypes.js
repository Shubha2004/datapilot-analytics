// Shared type helpers for DataPilot Analytics.
// Plain JS (no JSX) so this file can also be used by Node scripts.

/** true for null/undefined/NaN/''/whitespace-only strings */
export function isMissing(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return Number.isNaN(v);
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/** Coerce to a finite number or return null. Strips commas from strings. */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const MONTH_WORDS =
  /jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?/gi;

/**
 * Heuristic: does this string look like a date?
 * V8's Date.parse is lenient (e.g. "ORD-0001" parses as a timestamp), so we
 * first require at least one digit and reject any ASCII letters that are not
 * part of a month name ("12 Jan 2025" passes, "ORD-0001" does not).
 */
function looksDateLike(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return false;
  const s = String(v).trim();
  if (s === '' || !/[0-9]/.test(s)) return false;
  const withoutMonths = s.replace(MONTH_WORDS, '');
  if (/[a-zA-Z]/.test(withoutMonths)) return false;
  return !Number.isNaN(Date.parse(s));
}

function parseDate(v) {
  return looksDateLike(v);
}

function isPurelyNumeric(v) {
  return toNumber(v) !== null;
}

/**
 * Infer a column type from its values.
 * numeric if >=80% of non-missing coerce via toNumber;
 * else date if >=80% of non-missing parse as dates AND are not purely numeric;
 * else boolean if every non-missing value is a boolean-ish literal;
 * else categorical.
 */
export function inferColumnType(values) {
  const present = values.filter((v) => !isMissing(v));
  if (present.length === 0) return 'categorical';

  const numericCount = present.filter((v) => toNumber(v) !== null).length;
  if (numericCount / present.length >= 0.8) return 'numeric';

  const dateCount = present.filter(
    (v) => parseDate(v) && !isPurelyNumeric(v)
  ).length;
  if (dateCount / present.length >= 0.8) return 'date';

  const boolLiterals = new Set([
    true,
    false,
    'true',
    'false',
    'yes',
    'no',
    'Yes',
    'No',
  ]);
  if (present.every((v) => boolLiterals.has(v))) return 'boolean';

  return 'categorical';
}

/** Infer columns from the union of keys across all rows. */
export function inferColumns(rows) {
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        names.push(key);
      }
    }
  }
  return names.map((name) => ({
    name,
    type: inferColumnType(rows.map((row) => row[name])),
  }));
}

function dedupeName(name, taken) {
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name}_${i}`)) i++;
  return `${name}_${i}`;
}

/**
 * Build the canonical dataset object.
 * Throws Error if rawRows is empty. Dedupes duplicate column names.
 */
export function buildDataset(name, rawRows, meta = {}) {
  if (!rawRows || rawRows.length === 0) {
    throw new Error('Cannot build dataset: empty file (no data rows found).');
  }
  const taken = new Set();
  const rename = {};
  const seen = new Set();
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const finalName = dedupeName(key, taken);
      taken.add(finalName);
      rename[key] = finalName;
    }
  }
  const rows = rawRows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[rename[k]] = v;
    }
    return out;
  });
  const columns = inferColumns(rows);
  return {
    name,
    columns,
    rows,
    meta: {
      source: 'upload',
      uploadedAt: new Date().toISOString(),
      ...meta,
    },
  };
}

// File parsers + import validation for DataPilot Analytics (papaparse, xlsx).
// Plain JS (no JSX) so this file can also be used by Node scripts.
//
// Every parse function returns { columns, rows, report }:
//   columns: string[] — cleaned, unique header names
//   rows:    object[] — one object per data row
//   report:  { notes: string[], stats: object } describing fixes applied
//             during import (renames, padding, skipped rows, ...).
// All failure paths throw an Error with a plain-language message.

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { inferColumns, isMissing, toNumber } from './dataTypes';

const ALLOWED_EXT = new Set(['csv', 'xls', 'xlsx', 'json']);
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB — hard reject
export const WARN_FILE_SIZE = 25 * 1024 * 1024; // 25MB — "may be slow" warning

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExt(fileName) {
  if (!fileName || !fileName.includes('.')) return '';
  return fileName.split('.').pop().toLowerCase();
}

function freshReport() {
  return {
    notes: [],
    stats: {
      paddedRows: 0,
      truncatedRows: 0,
      emptyRowsSkipped: 0,
      blankHeadersRenamed: 0,
      duplicateHeadersRenamed: 0,
    },
  };
}

function pushNote(report, note) {
  if (!report.notes.includes(note)) report.notes.push(note);
}

/**
 * Clean raw header values into unique, non-blank column names.
 * - Trims whitespace.
 * - Blank headers become column_1, column_2, ... (1-based position).
 * - Duplicates are suffixed: name, name_2, name_3, ...
 * Every rename is recorded in report.notes.
 */
export function normalizeHeaders(rawHeaders, report) {
  const used = new Set();
  return rawHeaders.map((raw, i) => {
    let name = raw === null || raw === undefined ? '' : String(raw).trim();
    if (name === '') {
      name = `column_${i + 1}`;
      report.stats.blankHeadersRenamed += 1;
      pushNote(
        report,
        `Blank header in column ${i + 1} was named "${name}".`
      );
    }
    if (used.has(name)) {
      let n = 2;
      let candidate = `${name}_${n}`;
      while (used.has(candidate)) {
        n += 1;
        candidate = `${name}_${n}`;
      }
      pushNote(report, `Duplicate column "${name}" was renamed to "${candidate}".`);
      report.stats.duplicateHeadersRenamed += 1;
      name = candidate;
    }
    used.add(name);
    return name;
  });
}

/**
 * Map arrays of cell values onto header names. Rows shorter than the header
 * are padded with null; longer rows are truncated. Both are counted in stats
 * and reported. Deterministic: same input always yields the same output.
 */
function buildRowObjects(headers, dataGrid, report) {
  return dataGrid.map((cells) => {
    const arr = Array.isArray(cells) ? cells : [cells];
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      const v = i < arr.length ? arr[i] : null;
      row[headers[i]] = v === undefined ? null : v;
    }
    if (arr.length < headers.length) report.stats.paddedRows += 1;
    else if (arr.length > headers.length) report.stats.truncatedRows += 1;
    return row;
  });
}

/** Drop rows where every value is missing; count them in stats. */
function dropEmptyRows(rows, report) {
  const kept = rows.filter((row) =>
    Object.values(row).some((v) => !isMissing(v))
  );
  const skipped = rows.length - kept.length;
  if (skipped > 0) {
    report.stats.emptyRowsSkipped += skipped;
    pushNote(report, `Skipped ${skipped} completely blank row${skipped === 1 ? '' : 's'}.`);
  }
  return kept;
}

function summarizeRowShape(report) {
  const { paddedRows, truncatedRows } = report.stats;
  if (paddedRows > 0) {
    pushNote(
      report,
      `${paddedRows} row${paddedRows === 1 ? '' : 's'} had fewer values than the header — missing values were left blank.`
    );
  }
  if (truncatedRows > 0) {
    pushNote(
      report,
      `${truncatedRows} row${truncatedRows === 1 ? '' : 's'} had more values than the header — the extra values were dropped.`
    );
  }
}

/**
 * Type-inference sanity: flag columns that mix numbers and text (they will
 * be treated as categorical), and reject data where literally every cell is
 * blank.
 */
function sanityCheck(rows, headers, report) {
  const allBlank = rows.every((row) =>
    headers.every((h) => isMissing(row[h]))
  );
  if (allBlank) {
    throw new Error(
      'Every value in this file is blank. There is no usable data to import.'
    );
  }
  for (const h of headers) {
    const present = rows.map((r) => r[h]).filter((v) => !isMissing(v));
    if (present.length < 3) continue;
    const numericRatio =
      present.filter((v) => toNumber(v) !== null).length / present.length;
    if (numericRatio > 0 && numericRatio < 0.8) {
      pushNote(
        report,
        `Column "${h}" mixes numbers and text, so it will be treated as categorical.`
      );
    }
  }
}

/** De-duplicate a key against `taken`, suffixing _2, _3, ... */
function dedupeKey(key, taken, report, context) {
  if (!taken.has(key)) return key;
  let n = 2;
  let candidate = `${key}_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${key}_${n}`;
  }
  pushNote(report, `${context} "${key}" was renamed to "${candidate}".`);
  return candidate;
}

// ---------------------------------------------------------------------------
// File validation (extension, size, content sniffing)
// ---------------------------------------------------------------------------

/** Validate extension + size. Returns {ok, error, warning}. */
export function validateFile(file) {
  if (!file || !file.name) {
    return { ok: false, error: 'No file selected.', warning: null };
  }
  const ext = getExt(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return {
      ok: false,
      error: `Unsupported file type${ext ? ` ".${ext}"` : ''}. Please upload a CSV, Excel (.xls/.xlsx), or JSON file.`,
      warning: null,
    };
  }
  const size = file.size || 0;
  if (size === 0) {
    return {
      ok: false,
      error: 'This file is empty (0 bytes). Please choose a file that contains data.',
      warning: null,
    };
  }
  if (size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error:
        `File too large: ${(size / 1024 / 1024).toFixed(1)} MB exceeds the 100 MB import limit. ` +
        'Files that large can freeze the browser tab. Try splitting the file into smaller parts or removing unused columns.',
      warning: null,
    };
  }
  const warning =
    size > WARN_FILE_SIZE
      ? `This file is ${(size / 1024 / 1024).toFixed(1)} MB. Files over 25 MB can be slow to parse and render — a smaller extract is usually fine for exploration.`
      : null;
  return { ok: true, error: null, warning };
}

async function readHeadBytes(file, n) {
  const slice = file.slice ? file.slice(0, n) : file;
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function looksBinary(headText) {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(headText);
}

/**
 * Sniff actual file content and compare it against the extension.
 * Returns {ok, error}. A sniff failure never blocks the import — it returns ok.
 */
export async function sniffFileContent(file) {
  const ext = getExt(file.name);
  try {
    if (ext === 'xlsx' || ext === 'xls') {
      const head = await readHeadBytes(file, 8);
      if (head.length < 4) {
        return { ok: false, error: 'This file is too small to be a valid Excel workbook. It may be corrupted.' };
      }
      const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
      const isOle =
        head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
      if (ext === 'xlsx' && !isZip) {
        const text = bytesToText(head);
        if (!looksBinary(text)) {
          return {
            ok: false,
            error:
              'This file is named ".xlsx" but its contents look like plain text, not an Excel workbook. ' +
              'It may actually be a CSV file — try renaming it to .csv and importing again.',
          };
        }
        return {
          ok: false,
          error:
            'This file is named ".xlsx" but its contents do not look like an Excel workbook. ' +
            'It may be corrupted or saved in a different format.',
        };
      }
      if (ext === 'xls' && !isOle && !isZip) {
        return {
          ok: false,
          error:
            'This file is named ".xls" but its contents do not look like an Excel workbook. ' +
            'It may be corrupted or saved in a different format.',
        };
      }
      return { ok: true, error: null };
    }
    // csv / json: must look like text
    const head = await readHeadBytes(file, 65536);
    const text = bytesToText(head);
    if (looksBinary(text)) {
      const isZip = head[0] === 0x50 && head[1] === 0x4b;
      const hint = isZip
        ? ' Its contents look like a ZIP archive — an .xlsx Excel file is a ZIP, so it may be a misnamed Excel file.'
        : '';
      return {
        ok: false,
        error:
          `This file is named ".${ext}" but its contents look binary, not text.${hint} ` +
          'It may be corrupted or have the wrong extension.',
      };
    }
    if (ext === 'json') {
      const t = text.trimStart();
      if (t && t[0] !== '{' && t[0] !== '[') {
        return {
          ok: false,
          error:
            'This file is named ".json" but does not start with "{" or "[". ' +
            'It may not be JSON, or it may use a different extension.',
        };
      }
    }
    return { ok: true, error: null };
  } catch {
    // Sniffing is best-effort; never block an import because of it.
    return { ok: true, error: null };
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const PAPA_ERROR_NOTES = {
  TooManyFields: 'had more values than the header row — the extra values were dropped',
  TooFewFields: 'had fewer values than the header row — the missing values were left blank',
  FieldMismatch: 'had a different number of values than the header row and was adjusted to fit',
  UndetectableDelimiter:
    'no column delimiter (comma, semicolon, tab) could be detected — the file was read as a single column',
  MissingQuotes: 'has mismatched quotation marks and was parsed on a best-effort basis',
  Quotes: 'has a quoting problem and was parsed on a best-effort basis',
};

/** Turn Papa Parse's error list into one plain-language note per error type. */
function explainPapaErrors(errors, report) {
  if (!errors || errors.length === 0) return;
  const byCode = new Map();
  for (const e of errors) {
    if (!e || !e.code) continue;
    if (!byCode.has(e.code)) byCode.set(e.code, []);
    byCode.get(e.code).push(e.row);
  }
  for (const [code, rows] of byCode) {
    const explanation = PAPA_ERROR_NOTES[code];
    const rowList = rows.filter((r) => r !== null && r !== undefined);
    const where =
      rowList.length > 0
        ? ` (row${rowList.length === 1 ? '' : 's'} ${rowList.slice(0, 5).map((r) => r + 1).join(', ')}${rowList.length > 5 ? ', …' : ''})`
        : '';
    if (explanation) {
      pushNote(report, `CSV issue${where}: ${rows.length} row${rows.length === 1 ? '' : 's'} ${explanation}.`);
    } else {
      pushNote(report, `CSV issue${where}: ${rows.length} row${rows.length === 1 ? '' : 's'} could not be parsed cleanly (${code}).`);
    }
  }
}

/** Parse CSV text into {columns, rows, report}. Throws on bad input. */
export function parseCSVText(text) {
  const report = freshReport();
  if (!text || !text.trim()) {
    throw new Error('This file is empty — there is no content to import.');
  }
  let grid;
  try {
    const results = Papa.parse(text, { header: false, skipEmptyLines: 'greedy' });
    explainPapaErrors(results.errors, report);
    grid = results.data || [];
  } catch (err) {
    throw new Error(`Could not read this CSV file: ${err.message || 'unknown parsing error'}.`);
  }
  if (grid.length === 0) {
    throw new Error('No rows found in this CSV — the file may contain only blank lines.');
  }
  const headers = normalizeHeaders(grid[0], report);
  let rows = buildRowObjects(headers, grid.slice(1), report);
  rows = dropEmptyRows(rows, report);
  if (rows.length === 0) {
    throw new Error('This CSV has a header row but no data rows. Add at least one row of data below the header.');
  }
  summarizeRowShape(report);
  sanityCheck(rows, headers, report);
  return { columns: headers, rows, report };
}

/** Parse a CSV File/Blob into {columns, rows, report}. */
export function parseCSVFile(file) {
  return file.text().then((text) => parseCSVText(text));
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

function readWorkbook(buf) {
  try {
    return XLSX.read(buf, { type: 'array' });
  } catch {
    throw new Error(
      'This file could not be read as an Excel workbook. ' +
        'It may be corrupted, password-protected, or not actually an Excel file.'
    );
  }
}

/** Return the list of sheet names in an Excel file. */
export async function getExcelSheets(file) {
  const buf = await file.arrayBuffer();
  const wb = readWorkbook(buf);
  return wb.SheetNames || [];
}

/**
 * Return [{name, rowCount}] for every sheet (rowCount excludes the header).
 * Lets the UI show counts and hide/disable empty sheets.
 */
export async function getExcelSheetStats(file) {
  const buf = await file.arrayBuffer();
  const wb = readWorkbook(buf);
  return (wb.SheetNames || []).map((name) => {
    let rowCount = 0;
    try {
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        defval: null,
        blankrows: false,
      });
      rowCount = Math.max(0, (grid ? grid.length : 0) - 1);
    } catch {
      rowCount = 0;
    }
    return { name, rowCount };
  });
}

/** Parse one sheet (from a raw buffer) into {columns, rows, report}. */
export function parseExcelBuffer(buf, sheetName) {
  const report = freshReport();
  const wb = readWorkbook(buf);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet "${sheetName}" was not found in this workbook.`);
  }
  let grid;
  try {
    grid = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: true,
    });
  } catch (err) {
    throw new Error(`Could not read sheet "${sheetName}": ${err.message || 'unknown error'}.`);
  }
  if (!grid || grid.length === 0) {
    throw new Error(`Sheet "${sheetName}" is empty — it has no rows at all.`);
  }
  const headers = normalizeHeaders(grid[0], report);
  let rows = buildRowObjects(headers, grid.slice(1), report);
  rows = dropEmptyRows(rows, report);
  if (rows.length === 0) {
    throw new Error(`Sheet "${sheetName}" has a header row but no data rows.`);
  }
  summarizeRowShape(report);
  sanityCheck(rows, headers, report);
  return { columns: headers, rows, report };
}

/** Parse one sheet of an Excel File/Blob into {columns, rows, report}. */
export async function parseExcelSheet(file, sheetName) {
  const buf = await file.arrayBuffer();
  return parseExcelBuffer(buf, sheetName);
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

const JSON_WRAPPERS = ['data', 'rows', 'records', 'items', 'results'];

function shortJsonError(err) {
  const msg = (err && err.message) || 'unknown error';
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
}

/**
 * Flatten nested objects one level: {a: {b: 1}} -> {"a_b": 1}.
 * Deeper nesting and arrays are stored as JSON text. Records what was
 * flattened so the report can explain it.
 */
function flattenOneLevel(obj, flatInfo) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const subs = Object.keys(value);
      if (subs.length === 0) {
        out[key] = null;
        continue;
      }
      if (!flatInfo.has(key)) flatInfo.set(key, new Set());
      for (const sub of subs) {
        const flatKey = `${key}_${sub}`;
        flatInfo.get(key).add(flatKey);
        const sv = value[sub];
        out[flatKey] =
          sv !== null && typeof sv === 'object' ? JSON.stringify(sv) : sv === undefined ? null : sv;
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        out[key] = null;
      } else {
        out[key] = JSON.stringify(value);
        flatInfo.set(`__array__${key}`, new Set([key]));
      }
    } else {
      out[key] = value === undefined ? null : value;
    }
  }
  return out;
}

/** Parse JSON text into {columns, rows, report}. Throws on bad input. */
export function parseJSONText(text) {
  const report = freshReport();
  if (!text || !text.trim()) {
    throw new Error('This file is empty — there is no content to import.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid JSON: ${shortJsonError(err)} Check for missing commas, quotes, or brackets.`
    );
  }
  let items = null;
  let wrappedIn = null;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    for (const key of JSON_WRAPPERS) {
      if (Array.isArray(parsed[key])) {
        items = parsed[key];
        wrappedIn = key;
        break;
      }
    }
  }
  if (!items) {
    throw new Error(
      'Unsupported JSON shape. DataPilot accepts either an array of objects like ' +
        '[{"name": "A", "sales": 10}, ...], or an object holding an array under ' +
        '"data", "rows", "records", "items", or "results".'
    );
  }
  if (wrappedIn) {
    pushNote(report, `Used the "${wrappedIn}" array inside the JSON object (${items.length} records).`);
  }
  if (items.length === 0) {
    throw new Error('The JSON array of objects is empty — there are no records to import.');
  }
  const bad = items.filter((r) => !r || typeof r !== 'object' || Array.isArray(r));
  if (bad.length > 0) {
    throw new Error(
      `${bad.length} of ${items.length} items are not objects. ` +
        'Every item in the array of objects must be an object like {"name": "A", "sales": 10}.'
    );
  }
  // Flatten one level, then de-duplicate the union of keys deterministically
  // (mirrors buildDataset's approach so both layers agree).
  const flatInfo = new Map();
  const flatRows = items.map((r) => flattenOneLevel(r, flatInfo));
  const taken = new Set();
  const rename = new Map();
  const headers = [];
  for (const row of flatRows) {
    for (const key of Object.keys(row)) {
      if (rename.has(key)) continue;
      const finalName = dedupeKey(key, taken, report, 'Column');
      taken.add(finalName);
      rename.set(key, finalName);
      headers.push(finalName);
    }
  }
  let rows = flatRows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[rename.get(k)] = v;
    return out;
  });
  rows = dropEmptyRows(rows, report);
  if (rows.length === 0) {
    throw new Error('No usable records found in the JSON data — every record is blank.');
  }
  for (const [key, childSet] of flatInfo) {
    if (key.startsWith('__array__')) {
      pushNote(
        report,
        `Column "${[...childSet][0]}" held lists of values; they were stored as JSON text.`
      );
    } else {
      pushNote(
        report,
        `Nested field "${key}" was flattened one level into: ${[...childSet].join(', ')}.`
      );
    }
  }
  sanityCheck(rows, headers, report);
  return { columns: headers, rows, report };
}

/** Parse a JSON File/Blob into {columns, rows, report}. */
export async function parseJSONFile(file) {
  const text = await file.text();
  return parseJSONText(text);
}

// ---------------------------------------------------------------------------
// Post-import summary
// ---------------------------------------------------------------------------

/**
 * Summarize a parsed import for the preview panel:
 * { rowCount, columnCount, numeric, categorical, boolean, date, missing }.
 */
export function summarizeDataset(rows) {
  const inferred = inferColumns(rows || []);
  const counts = { numeric: 0, categorical: 0, boolean: 0, date: 0, other: 0 };
  for (const col of inferred) {
    if (counts[col.type] !== undefined) counts[col.type] += 1;
    else counts.other += 1;
  }
  let missing = 0;
  for (const row of rows || []) {
    for (const col of inferred) {
      if (isMissing(row[col.name])) missing += 1;
    }
  }
  return {
    rowCount: (rows || []).length,
    columnCount: inferred.length,
    numeric: counts.numeric,
    categorical: counts.categorical,
    boolean: counts.boolean,
    date: counts.date,
    other: counts.other,
    missing,
  };
}

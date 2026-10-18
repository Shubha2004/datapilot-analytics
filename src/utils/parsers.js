// File parsers for DataPilot Analytics (papaparse, xlsx).
// Plain JS (no JSX).

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const ALLOWED_EXT = new Set(['csv', 'xls', 'xlsx', 'json']);
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** Validate extension + size. Returns {ok, error}. */
export function validateFile(file) {
  if (!file || !file.name) {
    return { ok: false, error: 'No file selected.' };
  }
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return {
      ok: false,
      error: `Unsupported file type ".${ext}". Please upload a CSV, Excel (.xls/.xlsx), or JSON file.`,
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 50 MB.`,
    };
  }
  return { ok: true, error: null };
}

/** Parse a CSV file into {columns, rows}. */
export function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const fatal = (results.errors || []).find(
            (e) => e && e.type !== 'FieldMismatch' && e.code !== 'TooFewFields'
          );
          if (fatal) {
            throw new Error(
              `CSV parse error (row ${fatal.row ?? '?'}): ${fatal.message}`
            );
          }
          const fields = results.meta && results.meta.fields;
          if (!fields || fields.length === 0) {
            throw new Error(
              'No header row found. Make sure the first row of your CSV contains column names.'
            );
          }
          const rows = results.data.filter(
            (row) =>
              row &&
              Object.values(row).some(
                (v) => v !== null && v !== undefined && String(v).trim() !== ''
              )
          );
          resolve({ columns: fields, rows });
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => reject(new Error(`Could not read CSV file: ${err.message}`)),
    });
  });
}

/** Return the list of sheet names in an Excel file. */
export async function getExcelSheets(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames;
}

/** Parse one sheet of an Excel file into {columns, rows}. */
export async function parseExcelSheet(file, sheetName) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet "${sheetName}" not found in workbook.`);
  }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const columns =
    rows.length > 0
      ? Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
      : [];
  return { columns, rows };
}

/** Parse a JSON file (array-of-objects or {data:[...]}) into {columns, rows}. */
export async function parseJSONFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file: could not parse file contents.');
  }
  const rows =
    Array.isArray(parsed) ? parsed :
    parsed && Array.isArray(parsed.data) ? parsed.data :
    null;
  if (
    !rows ||
    rows.length === 0 ||
    !rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))
  ) {
    throw new Error('JSON must be an array of objects (e.g. [{...}, {...}]).');
  }
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return { columns, rows };
}

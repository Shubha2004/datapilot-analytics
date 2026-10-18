// parsers.js — validateFile, parseCSVFile, getExcelSheets,
// parseExcelSheet, parseJSONFile.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  validateFile,
  parseCSVFile,
  parseCSVText,
  normalizeHeaders,
  getExcelSheets,
  getExcelSheetStats,
  parseExcelSheet,
  parseExcelBuffer,
  parseJSONFile,
  parseJSONText,
  sniffFileContent,
  summarizeDataset,
  MAX_FILE_SIZE,
  WARN_FILE_SIZE,
} from '../src/utils/parsers.js';

const csvFile = (text, name = 'data.csv') =>
  new File([text], name, { type: 'text/csv' });
const jsonFile = (text, name = 'data.json') =>
  new File([text], name, { type: 'application/json' });

function xlsxFile(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], 'data.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('validateFile', () => {
  it('accepts csv, json, xls, xlsx within size limit', () => {
    for (const name of ['a.csv', 'A.XLSX', 'b.xls', 'c.json']) {
      const r = validateFile({ name, size: 10 });
      expect(r.ok).toBe(true);
      expect(r.error).toBe(null);
      expect(r.warning).toBe(null);
    }
  });

  it('rejects missing files, bad extensions and oversized files', () => {
    expect(validateFile(null).ok).toBe(false);
    expect(validateFile({}).ok).toBe(false);
    const bad = validateFile({ name: 'data.txt', size: 10 });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/unsupported file type/i);
    const big = validateFile({ name: 'data.csv', size: MAX_FILE_SIZE + 1 });
    expect(big.ok).toBe(false);
    expect(big.error).toMatch(/too large/i);
  });

  it('rejects zero-byte files', () => {
    const r = validateFile({ name: 'data.csv', size: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/empty/i);
  });

  it('warns (but accepts) files over the soft size limit', () => {
    const r = validateFile({ name: 'data.csv', size: WARN_FILE_SIZE + 1 });
    expect(r.ok).toBe(true);
    expect(r.warning).toMatch(/slow/i);
  });

  it('accepts files exactly at the hard size limit', () => {
    expect(validateFile({ name: 'data.csv', size: MAX_FILE_SIZE }).ok).toBe(true);
  });
});

describe('parseCSVFile', () => {
  it('parses a simple CSV into columns + rows (+ report)', async () => {
    const { columns, rows, report } = await parseCSVFile(
      csvFile('name,age\nAlice,30\nBob,25\n')
    );
    expect(columns).toEqual(['name', 'age']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
    expect(report.notes).toEqual([]);
  });

  it('handles quoted fields with commas, quotes and newlines', async () => {
    const { rows } = await parseCSVFile(
      csvFile('id,note\n1,"hello, world"\n2,"say ""hi"""\n3,"line1\nline2"\n')
    );
    expect(rows[0].note).toBe('hello, world');
    expect(rows[1].note).toBe('say "hi"');
    expect(rows[2].note).toBe('line1\nline2');
  });

  it('skips fully-empty lines', async () => {
    const { rows } = await parseCSVFile(csvFile('a,b\n1,2\n\n\n3,4\n'));
    expect(rows).toHaveLength(2);
  });

  it('rejects CSV without a header row', async () => {
    await expect(parseCSVFile(csvFile('\n\n'))).rejects.toThrow();
  });

  it('parses unicode content correctly', async () => {
    const { rows } = await parseCSVFile(csvFile('city\nMünchen\n日本\n'));
    expect(rows.map((r) => r.city)).toEqual(['München', '日本']);
  });
});

describe('parseCSVText (import report)', () => {
  it('renames blank and duplicate headers, recording notes', () => {
    const { columns, report } = parseCSVText('a,,a\n1,2,3\n');
    expect(columns).toEqual(['a', 'column_2', 'a_2']);
    expect(report.stats.blankHeadersRenamed).toBe(1);
    expect(report.stats.duplicateHeadersRenamed).toBe(1);
    expect(report.notes.join(' ')).toMatch(/blank header/i);
    expect(report.notes.join(' ')).toMatch(/duplicate column/i);
  });

  it('pads short rows and truncates long rows, counting both', () => {
    const { rows, report } = parseCSVText('a,b,c\n1,2\n3,4,5,6\n');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: null });
    expect(rows[1]).toEqual({ a: '3', b: '4', c: '5' });
    expect(report.stats.paddedRows).toBe(1);
    expect(report.stats.truncatedRows).toBe(1);
    expect(report.notes.join(' ')).toMatch(/fewer values/i);
  });

  it('blank CSV lines are skipped by the parser (report stat stays 0)', () => {
    // Papa's skipEmptyLines:'greedy' removes blank lines before the
    // dropEmptyRows/report stage, so emptyRowsSkipped only counts rows that
    // survive parsing with every cell blank (see the JSON test below).
    const { rows, report } = parseCSVText('a,b\n1,2\n,,\n3,4\n');
    expect(rows).toHaveLength(2);
    expect(report.stats.emptyRowsSkipped).toBe(0);
  });

  it('throws plain-language errors for empty/header-only input', () => {
    expect(() => parseCSVText('')).toThrow(/empty/i);
    expect(() => parseCSVText('   \n  ')).toThrow(/empty/i);
    expect(() => parseCSVText('a,b\n')).toThrow(/no data rows/i);
  });

  it('flags columns mixing numbers and text', () => {
    const { report } = parseCSVText('m\n1\n2\n3\nabc\ndef\nghi\n');
    expect(report.notes.join(' ')).toMatch(/mixes numbers and text/i);
  });
});

describe('normalizeHeaders', () => {
  it('trims, fills blanks and dedupes deterministically', () => {
    const report = { notes: [], stats: { blankHeadersRenamed: 0, duplicateHeadersRenamed: 0 } };
    expect(normalizeHeaders([' x ', '', 'x', 'x'], report)).toEqual([
      'x',
      'column_2',
      'x_2',
      'x_3',
    ]);
  });
});

describe('parseJSONText', () => {
  it('accepts all documented wrapper keys', () => {
    for (const key of ['data', 'rows', 'records', 'items', 'results']) {
      const { rows, report } = parseJSONText(JSON.stringify({ [key]: [{ a: 1 }] }));
      expect(rows).toHaveLength(1);
      expect(report.notes.join(' ')).toMatch(new RegExp(key));
    }
  });

  it('flattens one level of nesting and stringifies arrays', () => {
    const { columns, rows, report } = parseJSONText(
      JSON.stringify([{ id: 1, geo: { lat: 1.5, lon: 2.5 }, tags: ['a', 'b'] }])
    );
    expect(columns).toEqual(['id', 'geo_lat', 'geo_lon', 'tags']);
    expect(rows[0]).toEqual({
      id: 1,
      geo_lat: 1.5,
      geo_lon: 2.5,
      tags: '["a","b"]',
    });
    expect(report.notes.join(' ')).toMatch(/flattened/i);
  });

  it('throws plain-language errors for bad shapes', () => {
    expect(() => parseJSONText('nope')).toThrow(/invalid json/i);
    expect(() => parseJSONText('[1,2]')).toThrow(/not objects/i);
    expect(() => parseJSONText('{"a":1}')).toThrow(/unsupported json shape/i);
    expect(() => parseJSONText('[]')).toThrow(/empty/i);
  });

  it('drops fully-blank records and reports the count', () => {
    const { rows, report } = parseJSONText('[{}, {"a": 1}, {"a": null}]');
    expect(rows).toEqual([{ a: 1 }]);
    expect(report.stats.emptyRowsSkipped).toBe(2);
    expect(report.notes.join(' ')).toMatch(/blank row/i);
  });
});

describe('parseJSONFile', () => {
  it('returns columns, rows and a report', async () => {
    const { columns, rows, report } = await parseJSONFile(
      jsonFile(JSON.stringify([{ a: 1, b: 2 }, { a: 3, c: 4 }]))
    );
    expect(rows).toHaveLength(2);
    expect(columns).toEqual(['a', 'b', 'c']);
    expect(Array.isArray(report.notes)).toBe(true);
  });
});

describe('sniffFileContent', () => {
  it('flags an .xlsx whose contents are plain text', async () => {
    const f = new File(['a,b\n1,2\n'], 'fake.xlsx');
    const r = await sniffFileContent(f);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/plain text/i);
  });

  it('flags binary content behind a .csv extension', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]);
    const f = new File([bytes], 'fake.csv');
    const r = await sniffFileContent(f);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/binary/i);
  });

  it('passes genuine text csv/json', async () => {
    expect((await sniffFileContent(csvFile('a\n1\n'))).ok).toBe(true);
    expect((await sniffFileContent(jsonFile('[{"a":1}]'))).ok).toBe(true);
  });
});

describe('summarizeDataset', () => {
  it('counts rows, columns, types and missing cells', () => {
    const s = summarizeDataset([
      { n: '1', c: 'x', d: '2024-01-01' },
      { n: '', c: 'y', d: '2024-01-02' },
    ]);
    expect(s.rowCount).toBe(2);
    expect(s.columnCount).toBe(3);
    expect(s.numeric).toBe(1);
    expect(s.categorical).toBe(1);
    expect(s.date).toBe(1);
    expect(s.missing).toBe(1);
  });

  it('handles empty input', () => {
    expect(summarizeDataset([])).toMatchObject({ rowCount: 0, columnCount: 0, missing: 0 });
  });
});

describe('Excel parsing', () => {
  const file = () =>
    xlsxFile({
      Sales: [['name', 'qty'], ['a', 1], ['b', 2]],
      Notes: [['x'], ['y']],
    });

  it('lists sheet names', async () => {
    expect(await getExcelSheets(file())).toEqual(['Sales', 'Notes']);
  });

  it('reports per-sheet row counts', async () => {
    expect(await getExcelSheetStats(file())).toEqual([
      { name: 'Sales', rowCount: 2 },
      { name: 'Notes', rowCount: 1 },
    ]);
  });

  it('parses a sheet into columns + rows (+ report)', async () => {
    const { columns, rows, report } = await parseExcelSheet(file(), 'Sales');
    expect(columns).toEqual(['name', 'qty']);
    expect(rows).toEqual([
      { name: 'a', qty: 1 },
      { name: 'b', qty: 2 },
    ]);
    expect(report.notes).toEqual([]);
  });

  it('throws for a missing sheet', async () => {
    await expect(parseExcelSheet(file(), 'Nope')).rejects.toThrow(/not found/i);
  });

  it('parseExcelBuffer works directly from a raw buffer', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]),
      'S1'
    );
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const { columns, rows } = parseExcelBuffer(buf, 'S1');
    expect(columns).toEqual(['a', 'b']);
    expect(rows).toEqual([{ a: 1, b: 2 }]);
  });
});

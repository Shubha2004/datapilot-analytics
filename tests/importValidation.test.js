// Import-validation upgrades (Worker B): adversarial inputs for CSV, Excel,
// JSON — sniffing, header repair, ragged rows, size limits, import summary.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  validateFile,
  sniffFileContent,
  parseCSVText,
  parseExcelBuffer,
  getExcelSheetStats,
  parseJSONText,
  summarizeDataset,
} from '../src/utils/parsers.js';

function xlsxBytes(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
const xlsxFile = (sheets, name = 'data.xlsx') =>
  new File([xlsxBytes(sheets)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

describe('sample CSV still imports', () => {
  it('parses public/sample-ecommerce.csv without errors', () => {
    const text = readFileSync('public/sample-ecommerce.csv', 'utf-8');
    const { columns, rows, report } = parseCSVText(text);
    expect(rows.length).toBeGreaterThan(0);
    expect(columns.length).toBeGreaterThan(0);
    const summary = summarizeDataset(rows);
    expect(summary.rowCount).toBe(rows.length);
    expect(summary.numeric).toBeGreaterThan(0);
    expect(report.notes).toBeDefined();
  });
});

describe('CSV robustness', () => {
  it('never crashes on malformed CSV; surfaces plain-language notes', () => {
    const bad = 'name,age,city\n"Alice,30,NYC\nBob,25\nCharlie,40,LA,EXTRA\n';
    const { rows, report } = parseCSVText(bad);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it('rejects empty input with a helpful message', () => {
    expect(() => parseCSVText('   \n ')).toThrow(/empty/i);
    expect(validateFile({ name: 'e.csv', size: 0 }).ok).toBe(false);
  });

  it('auto-suffixes duplicate headers and names blank headers', () => {
    const { columns, report } = parseCSVText(',name,age,name,\n1,Alice,30,A2,\n');
    expect(columns).toEqual(['column_1', 'name', 'age', 'name_2', 'column_5']);
    expect(report.notes.some((n) => /duplicate/i.test(n))).toBe(true);
    expect(report.notes.some((n) => /blank header/i.test(n))).toBe(true);
  });

  it('pads short rows and truncates long rows deterministically, and reports it', () => {
    const { rows, report } = parseCSVText('a,b,c\n1,2,3,4,5\n6,7\n8,9,10\n');
    expect(rows.every((r) => Object.keys(r).length === 3)).toBe(true);
    expect(report.stats.truncatedRows).toBe(1);
    expect(report.stats.paddedRows).toBe(1);
    expect(report.notes.some((n) => /fewer values/i.test(n))).toBe(true);
    expect(report.notes.some((n) => /more values/i.test(n))).toBe(true);
  });

  it('flags columns that mix numbers and text', () => {
    const { report } = parseCSVText('code\n123\n456\nabc\n');
    expect(report.notes.some((n) => /mixes numbers and text/i.test(n))).toBe(true);
  });
});

describe('extension vs content sniffing', () => {
  it('rejects xlsx bytes named .csv', async () => {
    const r = await sniffFileContent(xlsxFile({ S: [['a'], [1]] }, 'fake.csv'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/\.csv/i);
  });

  it('rejects CSV text named .xlsx', async () => {
    const f = new File(['a,b\n1,2\n'], 'data.xlsx');
    const r = await sniffFileContent(f);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/plain text/i);
  });

  it('rejects non-JSON text named .json', async () => {
    const r = await sniffFileContent(new File(['hello'], 'data.json'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/json/i);
  });

  it('passes genuine files', async () => {
    expect((await sniffFileContent(new File(['a,b\n1,2\n'], 'ok.csv'))).ok).toBe(true);
    expect((await sniffFileContent(xlsxFile({ S: [['a'], [1]] }))).ok).toBe(true);
  });
});

describe('Excel edge cases', () => {
  it('reports per-sheet row counts so empty sheets can be skipped', async () => {
    const stats = await getExcelSheetStats(
      xlsxFile({ Sales: [['a'], [1], [2]], Empty: [] })
    );
    expect(stats).toEqual([
      { name: 'Sales', rowCount: 2 },
      { name: 'Empty', rowCount: 0 },
    ]);
  });

  it('throws a clear error for an empty sheet', () => {
    expect(() => parseExcelBuffer(xlsxBytes({ E: [] }), 'E')).toThrow(/empty/i);
  });

  it('throws a clear error for a missing sheet', () => {
    expect(() => parseExcelBuffer(xlsxBytes({ S: [['a'], [1]] }), 'Nope')).toThrow(/not found/i);
  });
});

describe('JSON shapes', () => {
  it('flattens nested objects one level and reports it', () => {
    const { columns, rows, report } = parseJSONText(
      JSON.stringify([{ id: 1, addr: { city: 'NYC', zip: '10001' }, tags: ['x'] }])
    );
    expect(columns).toContain('addr_city');
    expect(columns).toContain('addr_zip');
    expect(columns).not.toContain('addr');
    expect(typeof rows[0].tags).toBe('string');
    expect(report.notes.some((n) => /flattened/i.test(n))).toBe(true);
  });

  it('accepts data/rows/records/items/results wrappers', () => {
    for (const key of ['data', 'rows', 'records', 'items', 'results']) {
      const { rows } = parseJSONText(JSON.stringify({ [key]: [{ a: 1 }] }));
      expect(rows).toHaveLength(1);
    }
  });

  it('rejects bad JSON and unsupported shapes with clear messages', () => {
    expect(() => parseJSONText('{"a": }')).toThrow(/invalid json/i);
    expect(() => parseJSONText('{"a": 1}')).toThrow(/array of objects/i);
    expect(() => parseJSONText('[1,2]')).toThrow(/array of objects/i);
    expect(() => parseJSONText('[]')).toThrow(/array of objects/i);
  });
});

describe('size limits', () => {
  it('warns (not rejects) over 25MB', () => {
    const r = validateFile({ name: 'big.csv', size: 30 * 1024 * 1024 });
    expect(r.ok).toBe(true);
    expect(r.warning).toMatch(/slow/i);
  });

  it('rejects over 100MB with an explanation', () => {
    const r = validateFile({ name: 'huge.csv', size: 150 * 1024 * 1024 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large/i);
    expect(r.error).toMatch(/100 MB/);
  });
});

describe('import summary', () => {
  it('counts rows, columns, numeric/categorical columns and missing values', () => {
    const { rows } = parseCSVText('a,b,c\n1,x,3\n4,,6\n');
    const s = summarizeDataset(rows);
    expect(s).toMatchObject({ rowCount: 2, columnCount: 3, missing: 1 });
    expect(s.numeric + s.categorical).toBeLessThanOrEqual(3);
  });
});

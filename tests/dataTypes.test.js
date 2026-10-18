// dataTypes.js — isMissing, toNumber, inferColumnType, buildDataset.
import { describe, it, expect } from 'vitest';
import { isMissing, toNumber, inferColumnType, inferColumns, buildDataset } from '../src/utils/dataTypes.js';

describe('isMissing', () => {
  it('treats null/undefined/NaN/empty/whitespace as missing', () => {
    expect(isMissing(null)).toBe(true);
    expect(isMissing(undefined)).toBe(true);
    expect(isMissing(NaN)).toBe(true);
    expect(isMissing('')).toBe(true);
    expect(isMissing('   ')).toBe(true);
    expect(isMissing('\t\n')).toBe(true);
  });

  it('treats 0, false and real values as present', () => {
    expect(isMissing(0)).toBe(false);
    expect(isMissing(false)).toBe(false);
    expect(isMissing('x')).toBe(false);
    expect(isMissing(42)).toBe(false);
    expect(isMissing([])).toBe(false);
  });
});

describe('toNumber', () => {
  it('coerces finite numbers and numeric strings', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(3.5)).toBe(3.5);
    expect(toNumber('42')).toBe(42);
    expect(toNumber('  3.5  ')).toBe(3.5);
    expect(toNumber('-7')).toBe(-7);
  });

  it('strips thousand separators from strings', () => {
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber('1,234,567.89')).toBe(1234567.89);
  });

  it('returns null for non-finite, empty and non-numeric values', () => {
    expect(toNumber(Infinity)).toBe(null);
    expect(toNumber(-Infinity)).toBe(null);
    expect(toNumber(NaN)).toBe(null);
    expect(toNumber('')).toBe(null);
    expect(toNumber('   ')).toBe(null);
    expect(toNumber('abc')).toBe(null);
    expect(toNumber('12px')).toBe(null);
    expect(toNumber(null)).toBe(null);
    expect(toNumber(undefined)).toBe(null);
    expect(toNumber(true)).toBe(null);
    expect(toNumber({})).toBe(null);
  });
});

describe('inferColumnType', () => {
  it('infers numeric columns (>=80% numeric)', () => {
    expect(inferColumnType(['1', '2', '3', '4', '5'])).toBe('numeric');
    expect(inferColumnType([1, 2, 3, null, '4'])).toBe('numeric');
  });

  it('infers date columns but not purely numeric ones', () => {
    expect(inferColumnType(['2024-01-01', '2024-02-01', '2024-03-01'])).toBe('date');
    expect(inferColumnType(['12 Jan 2025', '05 Feb 2025', '03 Mar 2025', '01 Apr 2025'])).toBe('date');
  });

  it('does not mistake order IDs for dates', () => {
    expect(inferColumnType(['ORD-0001', 'ORD-0002', 'ORD-0003', 'ORD-0004'])).toBe('categorical');
  });

  it('infers boolean columns', () => {
    expect(inferColumnType([true, false, true])).toBe('boolean');
    expect(inferColumnType(['yes', 'no', 'yes'])).toBe('boolean');
  });

  it('falls back to categorical for text and all-missing', () => {
    expect(inferColumnType(['red', 'green', 'blue'])).toBe('categorical');
    expect(inferColumnType([null, undefined, ''])).toBe('categorical');
    expect(inferColumnType([])).toBe('categorical');
  });
});

describe('inferColumns / buildDataset', () => {
  it('unions keys across rows and types each column', () => {
    const cols = inferColumns([
      { a: '1', b: 'x' },
      { a: '2', c: '2024-01-01' },
    ]);
    expect(cols.map((c) => c.name)).toEqual(['a', 'b', 'c']);
    expect(cols.find((c) => c.name === 'a').type).toBe('numeric');
    expect(cols.find((c) => c.name === 'c').type).toBe('date');
  });

  it('builds a canonical dataset with meta', () => {
    const ds = buildDataset('sales', [{ a: '1', b: 'x' }, { a: '2', b: 'y' }]);
    expect(ds.name).toBe('sales');
    expect(ds.rows).toHaveLength(2);
    expect(ds.columns.map((c) => c.name)).toEqual(['a', 'b']);
    expect(ds.meta.source).toBe('upload');
    expect(typeof ds.meta.uploadedAt).toBe('string');
  });

  it('throws on empty input', () => {
    expect(() => buildDataset('empty', [])).toThrow(/empty file/i);
    expect(() => buildDataset('empty', null)).toThrow(/empty file/i);
  });

  it('never mutates the input rows', () => {
    const rows = [{ a: '1' }];
    const snapshot = JSON.stringify(rows);
    buildDataset('x', rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

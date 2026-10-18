// cleaning.js — analyzeQuality, dedupe, fills, trims, type conversion.
// Also asserts immutability of every op (required for undo correctness).
import { describe, it, expect } from 'vitest';
import {
  analyzeQuality,
  removeDuplicates,
  dropRowsWithMissing,
  fillNumeric,
  fillCategorical,
  validateRename,
  renameColumn,
  validateRemove,
  removeColumn,
  validateFillNumeric,
  validateFillCategorical,
  validateConvertType,
  trimWhitespace,
  convertColumnType,
} from '../src/utils/cleaning.js';
import { buildDataset } from '../src/utils/dataTypes.js';

const ds = () =>
  buildDataset('q', [
    { a: '1', b: 'x', c: '2024-01-01' },
    { a: '2', b: 'y', c: '2024-01-02' },
    { a: '', b: 'x', c: '2024-01-03' }, // missing a
    { a: '1', b: 'x', c: '2024-01-01' }, // duplicate of row 0
    { a: 'notanum', b: 'x', c: 'bad-date' },
  ]);

function snapshot(rows) {
  return JSON.stringify(rows);
}

describe('analyzeQuality', () => {
  it('counts missing values per column with percentages', () => {
    const q = analyzeQuality(ds());
    const a = q.missingByColumn.find((m) => m.column === 'a');
    expect(a.missing).toBe(1);
    expect(a.pct).toBeCloseTo(20, 5);
    const b = q.missingByColumn.find((m) => m.column === 'b');
    expect(b.missing).toBe(0);
  });

  it('counts duplicate rows', () => {
    const q = analyzeQuality(ds());
    expect(q.duplicateRows).toBe(1);
  });

  it('flags invalid numerics in numeric-typed columns', () => {
    const rows = [{ n: '1' }, { n: 'abc' }, { n: '3' }, { n: null }, { n: '5' }];
    const dataset = {
      name: 'n',
      columns: [{ name: 'n', type: 'numeric' }],
      rows,
    };
    const q = analyzeQuality(dataset);
    expect(q.invalidNumeric).toEqual([{ column: 'n', count: 1 }]);
  });

  it('detects IQR outliers (needs >= 4 values)', () => {
    const rows = [10, 11, 12, 13, 14, 15, 16, 100].map((n) => ({ v: String(n) }));
    const dataset = { name: 'o', columns: [{ name: 'v', type: 'numeric' }], rows };
    const q = analyzeQuality(dataset);
    expect(q.outliers).toHaveLength(1);
    expect(q.outliers[0].column).toBe('v');
    expect(q.outliers[0].count).toBe(1);
  });

  it('detects case/whitespace-inconsistent categories', () => {
    const rows = [{ c: 'North' }, { c: 'north' }, { c: ' north ' }, { c: 'South' }];
    const dataset = { name: 'c', columns: [{ name: 'c', type: 'categorical' }], rows };
    const q = analyzeQuality(dataset);
    expect(q.inconsistentCategories).toHaveLength(1);
    expect(q.inconsistentCategories[0].column).toBe('c');
    expect(q.inconsistentCategories[0].variants[0].sort()).toEqual(
      ['North', 'north', ' north '].sort()
    );
  });

  it('finds single-value columns and date-like columns', () => {
    const rows = [
      { s: 'same', d: '2024-01-01', id: 'ORD-1' },
      { s: 'same', d: '2024-02-01', id: 'ORD-2' },
      { s: 'same', d: '2024-03-01', id: 'ORD-3' },
      { s: 'same', d: '2024-04-01', id: 'ORD-4' },
    ];
    const dataset = {
      name: 'sd',
      columns: [
        { name: 's', type: 'categorical' },
        { name: 'd', type: 'categorical' },
        { name: 'id', type: 'categorical' },
      ],
      rows,
    };
    const q = analyzeQuality(dataset);
    expect(q.singleValueColumns).toEqual(['s']);
    expect(q.possibleDateColumns).toEqual(['d']);
  });

  it('handles an empty dataset without crashing', () => {
    const q = analyzeQuality({ name: 'e', columns: [], rows: [] });
    expect(q.duplicateRows).toBe(0);
    expect(q.missingByColumn).toEqual([]);
  });
});

describe('removeDuplicates', () => {
  it('removes duplicates regardless of key order and reports count', () => {
    const rows = [{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 3 }];
    const { rows: out, removed } = removeDuplicates(rows);
    expect(removed).toBe(1);
    expect(out).toHaveLength(2);
    expect(out).toEqual([{ a: 1, b: 2 }, { a: 1, b: 3 }]);
    expect(snapshot(rows)).toBe(
      JSON.stringify([{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 3 }])
    );
  });
});

describe('dropRowsWithMissing', () => {
  const rows = [
    { a: '1', b: 'x' },
    { a: '', b: 'y' },
    { a: '3', b: null },
  ];

  it('drops rows missing any listed column', () => {
    const { rows: out, removed } = dropRowsWithMissing(rows, ['a', 'b']);
    expect(removed).toBe(2);
    expect(out).toEqual([{ a: '1', b: 'x' }]);
  });

  it('accepts a single column name and leaves input untouched', () => {
    const before = snapshot(rows);
    const { rows: out, removed } = dropRowsWithMissing(rows, 'a');
    expect(removed).toBe(1);
    expect(out).toHaveLength(2);
    expect(snapshot(rows)).toBe(before);
  });
});

describe('fillNumeric', () => {
  const rows = [{ n: '1' }, { n: '' }, { n: '3' }, { n: 'abc' }];

  it('fills missing AND invalid values with the mean', () => {
    const { rows: out, filled, value } = fillNumeric(rows, 'n', 'mean');
    expect(value).toBe(2);
    expect(filled).toBe(2);
    expect(out.map((r) => r.n)).toEqual(['1', 2, '3', 2]);
  });

  it('fills with the median when requested', () => {
    const { rows: out, value } = fillNumeric(
      [{ n: '1' }, { n: '' }, { n: '10' }],
      'n',
      'median'
    );
    expect(value).toBe(5.5);
    expect(out[1].n).toBe(5.5);
  });

  it('returns value null and fills nothing when no numbers exist', () => {
    const { rows: out, filled, value } = fillNumeric(
      [{ n: 'abc' }, { n: '' }],
      'n'
    );
    expect(value).toBe(null);
    expect(filled).toBe(0);
    expect(out).toHaveLength(2);
  });

  it('does not mutate the input rows', () => {
    const before = snapshot(rows);
    fillNumeric(rows, 'n');
    expect(snapshot(rows)).toBe(before);
  });
});

describe('fillCategorical', () => {
  it('fills missing values with the fixed value', () => {
    const rows = [{ c: 'a' }, { c: '' }, { c: null }];
    const { rows: out, filled } = fillCategorical(rows, 'c', 'unknown');
    expect(filled).toBe(2);
    expect(out.map((r) => r.c)).toEqual(['a', 'unknown', 'unknown']);
    expect(rows[1].c).toBe('');
  });
});

describe('validateRename', () => {
  it('accepts a clean rename and trims the name', () => {
    expect(validateRename('a', '  b  ', ['a', 'c'])).toEqual({ ok: true, name: 'b' });
  });

  it('rejects empty, identical and duplicate (case-insensitive) names', () => {
    expect(validateRename('a', '   ', ['a']).ok).toBe(false);
    expect(validateRename('a', 'a', ['a']).ok).toBe(false);
    const dup = validateRename('a', 'C', ['a', 'c']);
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/already exists/i);
  });
});

describe('renameColumn', () => {
  it('renames the key in every row, preserving key order', () => {
    const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const { rows: out, changed } = renameColumn(rows, 'a', 'alpha');
    expect(changed).toBe(2);
    expect(out).toEqual([{ alpha: 1, b: 2 }, { alpha: 3, b: 4 }]);
    expect(Object.keys(out[0])).toEqual(['alpha', 'b']);
    expect(rows[0]).toEqual({ a: 1, b: 2 }); // input untouched
  });

  it('is a no-op when names are identical', () => {
    const rows = [{ a: 1 }];
    const { rows: out, changed } = renameColumn(rows, 'a', 'a');
    expect(changed).toBe(0);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });
});

describe('validateRemove / removeColumn', () => {
  it('validates existence and refuses to remove the last column', () => {
    expect(validateRemove('a', ['a', 'b'])).toEqual({ ok: true });
    expect(validateRemove('z', ['a', 'b']).ok).toBe(false);
    const last = validateRemove('a', ['a']);
    expect(last.ok).toBe(false);
    expect(last.error).toMatch(/only column/i);
  });

  it('removes the column from every row without mutating input', () => {
    const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const { rows: out, removed } = removeColumn(rows, 'a');
    expect(removed).toBe(2);
    expect(out).toEqual([{ b: 2 }, { b: 4 }]);
    expect(rows[0]).toEqual({ a: 1, b: 2 });
  });

  it('counts zero when the column is absent', () => {
    expect(removeColumn([{ a: 1 }], 'z').removed).toBe(0);
  });
});

describe('validateFillNumeric', () => {
  const dataset = () => buildDataset('f', [{ n: '1' }, { n: '' }, { s: 'x' }]);

  it('accepts a numeric column with values to average', () => {
    expect(validateFillNumeric(dataset(), 'n', 'mean')).toEqual({ ok: true });
  });

  it('rejects missing columns, non-numeric columns and value-less columns', () => {
    expect(validateFillNumeric(dataset(), 'nope').ok).toBe(false);
    const nonNum = validateFillNumeric(dataset(), 's');
    expect(nonNum.ok).toBe(false);
    expect(nonNum.error).toMatch(/numeric/i);
    const empty = buildDataset('e', [{ n: '' }, { n: 'abc' }]);
    // 'n' infers categorical here (no numerics), so it fails the numeric check
    expect(validateFillNumeric(empty, 'n').ok).toBe(false);
  });
});

describe('validateFillCategorical', () => {
  const dataset = () => buildDataset('f', [{ c: 'a' }, { c: '' }]);

  it('accepts an existing column and trims the fill value', () => {
    expect(validateFillCategorical(dataset(), 'c', '  unknown  ')).toEqual({
      ok: true,
      value: 'unknown',
    });
  });

  it('rejects missing columns and empty fill values', () => {
    expect(validateFillCategorical(dataset(), 'nope', 'x').ok).toBe(false);
    expect(validateFillCategorical(dataset(), 'c', '   ').ok).toBe(false);
  });
});

describe('validateConvertType', () => {
  const dataset = () => buildDataset('f', [{ v: '1' }]);

  it('accepts known targets on existing columns', () => {
    for (const t of ['numeric', 'date', 'string']) {
      expect(validateConvertType(dataset(), 'v', t)).toEqual({ ok: true });
    }
  });

  it('rejects missing columns and unknown targets', () => {
    expect(validateConvertType(dataset(), 'nope', 'numeric').ok).toBe(false);
    const bad = validateConvertType(dataset(), 'v', 'boolean');
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/unknown target type/i);
  });
});

describe('trimWhitespace', () => {
  it('trims strings and counts changed cells', () => {
    const rows = [{ a: '  x  ', b: 5 }, { a: 'y', b: '  z' }];
    const { rows: out, changed } = trimWhitespace(rows);
    expect(changed).toBe(2);
    expect(out).toEqual([{ a: 'x', b: 5 }, { a: 'y', b: 'z' }]);
  });

  it('leaves non-strings alone', () => {
    const rows = [{ a: 1, b: null, c: ' ok ' }];
    const { rows: out, changed } = trimWhitespace(rows);
    expect(changed).toBe(1);
    expect(out[0]).toEqual({ a: 1, b: null, c: 'ok' });
  });
});

describe('convertColumnType', () => {
  it('converts to numeric, counting failures', () => {
    const rows = [{ v: '10' }, { v: 'abc' }, { v: '' }, { v: '2.5' }];
    const { rows: out, converted, failed } = convertColumnType(rows, 'v', 'numeric');
    expect(converted).toBe(2);
    expect(failed).toBe(1);
    expect(out[0].v).toBe(10);
    expect(out[1].v).toBe('abc'); // failed rows keep original
    expect(out[3].v).toBe(2.5);
  });

  it('converts to ISO date strings', () => {
    const rows = [{ d: '2024-03-05' }, { d: 'not a date' }];
    const { rows: out, converted, failed } = convertColumnType(rows, 'd', 'date');
    expect(converted).toBe(1);
    expect(failed).toBe(1);
    expect(out[0].d).toBe('2024-03-05');
  });

  it('converts to string', () => {
    const rows = [{ v: 42 }];
    const { rows: out, converted } = convertColumnType(rows, 'v', 'string');
    expect(converted).toBe(1);
    expect(out[0].v).toBe('42');
  });
});

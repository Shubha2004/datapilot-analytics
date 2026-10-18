// statistics.js — null-safe stats, edge cases (empty, NaN, n<2).
import { describe, it, expect } from 'vitest';
import {
  sortedNumeric,
  percentile,
  describeColumn,
  pearson,
  correlationMatrix,
  meanCI,
  tTestOneSample,
  histogram,
  linearTrend,
} from '../src/utils/statistics.js';

describe('sortedNumeric', () => {
  it('keeps finite numbers, drops missing/non-finite, sorts ascending', () => {
    expect(sortedNumeric([3, null, 'a', 1, '', Infinity, NaN, '2.5', 2])).toEqual([
      1, 2, 2.5, 3,
    ]);
  });

  it('handles non-array and empty input', () => {
    expect(sortedNumeric(null)).toEqual([]);
    expect(sortedNumeric(undefined)).toEqual([]);
    expect(sortedNumeric([])).toEqual([]);
  });
});

describe('percentile', () => {
  it('interpolates linearly between ranks', () => {
    expect(percentile([1, 2, 3, 4], 25)).toBeCloseTo(1.75, 10);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  });

  it('clamps p to [0,100] and returns null for empty input', () => {
    expect(percentile([1, 2], 200)).toBe(2);
    expect(percentile([1, 2], -5)).toBe(1);
    expect(percentile([], 50)).toBe(null);
    expect(percentile(null, 50)).toBe(null);
  });
});

describe('describeColumn', () => {
  it('returns null stats for empty/all-missing input', () => {
    const d = describeColumn([]);
    expect(d.count).toBe(0);
    expect(d.mean).toBe(null);
    expect(d.mode).toEqual([]);
    expect(d.varSample).toBe(null);
    const d2 = describeColumn([null, '', NaN]);
    expect(d2.count).toBe(0);
    expect(d2.missing).toBe(3);
  });

  it('computes correct descriptive stats for a known set', () => {
    const d = describeColumn([1, 2, 3, 4, 5]);
    expect(d.count).toBe(5);
    expect(d.missing).toBe(0);
    expect(d.sum).toBe(15);
    expect(d.mean).toBe(3);
    expect(d.median).toBe(3);
    expect(d.min).toBe(1);
    expect(d.max).toBe(5);
    expect(d.range).toBe(4);
    expect(d.varPop).toBeCloseTo(2, 10);
    expect(d.varSample).toBeCloseTo(2.5, 10);
    expect(d.stdPop).toBeCloseTo(Math.SQRT2, 10);
    expect(d.q1).toBeCloseTo(2, 10);
    expect(d.q3).toBeCloseTo(4, 10);
    expect(d.iqr).toBeCloseTo(2, 10);
    expect(d.outlierCount).toBe(0);
  });

  it('finds the mode only when a value repeats', () => {
    expect(describeColumn([1, 2, 2, 3]).mode).toEqual([2]);
    expect(describeColumn([1, 2, 3]).mode).toEqual([]);
    expect(describeColumn([7]).mode).toEqual([7]);
  });

  it('handles a single value (varSample null, not NaN)', () => {
    const d = describeColumn([5]);
    expect(d.count).toBe(1);
    expect(d.mean).toBe(5);
    expect(d.varSample).toBe(null);
    expect(d.stdSample).toBe(null);
    expect(d.outlierCount).toBe(0);
  });

  it('counts outliers with the 1.5*IQR rule', () => {
    const d = describeColumn([10, 11, 12, 13, 14, 15, 16, 100]);
    expect(d.outlierCount).toBe(1);
  });

  it('ignores NaN/Infinity/non-numeric junk', () => {
    const d = describeColumn([1, 2, 3, NaN, Infinity, 'junk', null]);
    expect(d.count).toBe(3);
    expect(d.mean).toBe(2);
    // NaN and null both count as missing per isMissing()
    expect(d.missing).toBe(2);
  });
});

describe('pearson', () => {
  it('returns 1 for perfect positive linear data', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it('returns -1 for perfect negative linear data', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('returns null with fewer than 3 complete pairs', () => {
    expect(pearson([1, 2], [3, 4])).toBe(null);
    expect(pearson([1, null, 3], [2, 4, null])).toBe(null);
  });

  it('returns null for zero variance', () => {
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBe(null);
  });

  it('is pairwise-complete (ignores missing pairs)', () => {
    expect(pearson([1, 2, 3, null, 4], [2, 4, 6, 8, 8])).toBeCloseTo(1, 10);
  });

  it('returns null for empty input', () => {
    expect(pearson([], [])).toBe(null);
    expect(pearson(null, null)).toBe(null);
  });
});

describe('correlationMatrix', () => {
  const rows = [
    { a: 1, b: 2, c: 'x' },
    { a: 2, b: 4, c: 'y' },
    { a: 3, b: 6, c: 'z' },
    { a: 4, b: 8, c: 'w' },
  ];

  it('has 1 on the diagonal and symmetric perfect correlations', () => {
    const { columns, matrix } = correlationMatrix(rows, ['a', 'b']);
    expect(columns).toEqual(['a', 'b']);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
    expect(matrix[0][1]).toBeCloseTo(1, 10);
    expect(matrix[1][0]).toBeCloseTo(1, 10);
  });

  it('yields null where correlation is undefined', () => {
    const flat = [{ a: 1, b: 5 }, { a: 2, b: 5 }, { a: 3, b: 5 }];
    const { matrix } = correlationMatrix(flat, ['a', 'b']);
    expect(matrix[0][1]).toBe(null);
  });
});

describe('meanCI', () => {
  it('returns null fields for n<2', () => {
    const r = meanCI([5]);
    expect(r.n).toBe(1);
    expect(r.lower).toBe(null);
    expect(r.upper).toBe(null);
    expect(meanCI([]).n).toBe(0);
  });

  it('brackets the true mean for a large sample', () => {
    const vals = Array.from({ length: 100 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    const r = meanCI(vals, 0.95);
    expect(r.mean).toBe(100);
    expect(r.lower).toBeLessThan(100);
    expect(r.upper).toBeGreaterThan(100);
    expect(r.lower).toBeGreaterThan(99);
    expect(r.upper).toBeLessThan(101);
  });

  it('documents its assumptions in the result', () => {
    expect(meanCI([1, 2, 3]).method).toMatch(/CLT/);
  });
});

describe('tTestOneSample', () => {
  it('rejects when the sample is far from mu0', () => {
    const r = tTestOneSample([10, 11, 10, 12, 11, 10, 11, 12, 10, 11], 0);
    expect(r.reject).toBe(true);
    expect(r.pApprox).toBeLessThan(0.05);
    expect(r.t).toBeGreaterThan(0);
    expect(r.df).toBe(9);
  });

  it('does not reject when the sample is near mu0', () => {
    const r = tTestOneSample([9.8, 10.2, 10.1, 9.9, 10.0], 10);
    expect(r.reject).toBe(false);
  });

  it('returns the null-safe base result for n<2 or non-finite mu0', () => {
    const r = tTestOneSample([5], 5);
    expect(r.t).toBe(null);
    expect(r.reject).toBe(false);
    expect(tTestOneSample([1, 2], Infinity).t).toBe(null);
  });

  it('handles zero variance without crashing', () => {
    const r = tTestOneSample([5, 5, 5, 5], 5);
    expect(r.t).toBe(null);
    expect(r.mean).toBe(5);
  });
});

describe('histogram', () => {
  it('returns [] for empty input', () => {
    expect(histogram([])).toEqual([]);
  });

  it('collapses constant values into a single bin', () => {
    const bins = histogram([5, 5, 5]);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(3);
  });

  it('places every value in exactly one bin', () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(10);
    expect(bins.every((b) => b.label.length > 0)).toBe(true);
  });

  it('ignores non-numeric values', () => {
    const bins = histogram([1, 2, 'x', null, 3], 2);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe('linearTrend', () => {
  it('detects increasing, decreasing and flat trends', () => {
    expect(linearTrend([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]).direction).toBe('increasing');
    expect(linearTrend([{ x: 1, y: 6 }, { x: 2, y: 4 }, { x: 3, y: 2 }]).direction).toBe('decreasing');
    expect(linearTrend([{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }]).direction).toBe('flat');
  });

  it('returns null slope for fewer than 2 valid points', () => {
    expect(linearTrend([{ x: 1, y: 2 }])).toEqual({ slope: null, direction: 'flat', n: 1 });
    expect(linearTrend([]).slope).toBe(null);
  });

  it('skips non-finite points', () => {
    const t = linearTrend([
      { x: 1, y: 2 },
      { x: NaN, y: 3 },
      { x: 2, y: null },
      { x: 3, y: 6 },
    ]);
    expect(t.n).toBe(2);
    expect(t.direction).toBe('increasing');
  });
});

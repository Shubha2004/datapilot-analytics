// insights.js — formatters and generateInsights.
import { describe, it, expect } from 'vitest';
import { fmtNum, fmtMoney, fmtPct, generateInsights } from '../src/utils/insights.js';
import { sampleDataset, monthlyDataset } from './helpers.js';
import { buildDataset } from '../src/utils/dataTypes.js';

describe('formatters', () => {
  it('fmtNum formats numbers and degrades to n/a', () => {
    expect(fmtNum(1234567.891)).toBe('1,234,567.89');
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(null)).toBe('n/a');
    expect(fmtNum(undefined)).toBe('n/a');
    expect(fmtNum(NaN)).toBe('n/a');
  });

  it('fmtMoney prefixes $ and handles nulls', () => {
    expect(fmtMoney(1234.5)).toBe('$1,234.5');
    expect(fmtMoney(null)).toBe('n/a');
  });

  it('fmtPct renders fractions as percentages', () => {
    expect(fmtPct(0.2)).toBe('20.0%');
    expect(fmtPct(0.3333, 2)).toBe('33.33%');
    expect(fmtPct(null)).toBe('n/a');
  });
});

describe('generateInsights', () => {
  it('returns [] for empty datasets', () => {
    expect(generateInsights(null)).toEqual([]);
    expect(generateInsights({ rows: [] })).toEqual([]);
  });

  it('always emits a dataset overview', () => {
    const [first] = generateInsights(sampleDataset());
    expect(first.id).toBe('ins-summary');
    expect(first.kind).toBe('info');
    expect(first.body).toMatch(/5 rows and 5 columns/);
  });

  it('includes the date range in the overview when a date column exists', () => {
    const [first] = generateInsights(sampleDataset());
    expect(first.body).toMatch(/Jan 5, 2024/);
    expect(first.body).toMatch(/Mar 8, 2024/);
  });

  it('reports the top category by the first numeric column', () => {
    const ins = generateInsights(sampleDataset());
    const top = ins.find((i) => i.id === 'ins-topcat');
    expect(top).toBeDefined();
    expect(top.kind).toBe('success');
    // East: 300, South: 320, North: 250 -> South leads
    expect(top.title).toMatch(/South leads revenue/);
  });

  it('detects an upward monthly trend', () => {
    const ins = generateInsights(monthlyDataset());
    const trend = ins.find((i) => i.id === 'ins-trend');
    expect(trend).toBeDefined();
    expect(trend.body).toMatch(/trends upward/);
    expect(trend.kind).toBe('success');
  });

  it('flags strong correlations without claiming causation', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      a: i + 1,
      b: (i + 1) * 2,
      d: `2024-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const ins = generateInsights(buildDataset('corr', rows));
    const corr = ins.find((i) => i.id.startsWith('ins-corr'));
    expect(corr).toBeDefined();
    expect(corr.body).toMatch(/r=1\.00/);
    expect(corr.body).toMatch(/does not imply causation/);
  });

  it('warns about columns with >20% missing values', () => {
    const rows = [
      { v: 1, holey: null },
      { v: 2, holey: null },
      { v: 3, holey: 'x' },
    ];
    const ins = generateInsights(buildDataset('miss', rows));
    const miss = ins.find((i) => i.id === 'ins-missing-holey');
    expect(miss).toBeDefined();
    expect(miss.kind).toBe('warning');
    expect(miss.body).toMatch(/66\.7%/);
  });

  it('warns about outlier extremes', () => {
    const rows = [10, 11, 12, 13, 14, 15, 16, 100].map((v, i) => ({
      v,
      d: `2024-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const ins = generateInsights(buildDataset('out', rows));
    const out = ins.find((i) => i.id === 'ins-outliers');
    expect(out).toBeDefined();
    expect(out.kind).toBe('warning');
  });

  it('caps output at ~8 insights', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      a: i + 1,
      b: (i + 1) * 2,
      c: i % 2 ? null : i,
      cat: i % 2 ? 'x' : 'y',
      d: `2024-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const ins = generateInsights(buildDataset('many', rows));
    expect(ins.length).toBeLessThanOrEqual(8);
    const ids = ins.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

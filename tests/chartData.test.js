// chartData.js — filters, aggregation, config validation, chart builders.
import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  aggregate,
  validateChartConfig,
  suggestCharts,
  buildChartData,
} from '../src/utils/chartData.js';
import { sampleDataset } from './helpers.js';

const rows = () => sampleDataset().rows;

describe('applyFilters', () => {
  it('returns all rows when no filters are given', () => {
    expect(applyFilters(rows(), [])).toHaveLength(5);
    expect(applyFilters(rows(), null)).toHaveLength(5);
  });

  it('applies AND semantics across filters', () => {
    const out = applyFilters(rows(), [
      { column: 'region', op: 'eq', value: 'North' },
      { column: 'revenue', op: 'gt', value: 120 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].revenue).toBe(150);
  });

  it('handles isNull / notNull', () => {
    const r = [{ a: null }, { a: 'x' }, { a: '' }];
    expect(applyFilters(r, [{ column: 'a', op: 'isNull' }])).toHaveLength(2);
    expect(applyFilters(r, [{ column: 'a', op: 'notNull' }])).toHaveLength(1);
  });

  it('handles contains (case-insensitive)', () => {
    const out = applyFilters(rows(), [{ column: 'product', op: 'contains', value: 'wid' }]);
    expect(out).toHaveLength(3);
  });

  it('compares numerically when both sides are numeric', () => {
    const r = [{ n: '10' }, { n: '9' }, { n: '100' }];
    expect(applyFilters(r, [{ column: 'n', op: 'gt', value: '9' }])).toHaveLength(2);
    expect(applyFilters(r, [{ column: 'n', op: 'lte', value: 10 }])).toHaveLength(2);
    expect(applyFilters(r, [{ column: 'n', op: 'eq', value: 10 }])).toHaveLength(1);
    expect(applyFilters(r, [{ column: 'n', op: 'neq', value: 10 }])).toHaveLength(2);
  });

  it('falls back to string comparison for non-numeric values', () => {
    const r = [{ s: 'b' }, { s: 'a' }];
    expect(applyFilters(r, [{ column: 's', op: 'gt', value: 'a' }])).toHaveLength(1);
  });

  it('treats unknown ops as match-all', () => {
    expect(applyFilters(rows(), [{ column: 'region', op: 'nope', value: 'x' }])).toHaveLength(5);
  });
});

describe('aggregate', () => {
  it('sums/averages/counts/mins/maxes per x group', () => {
    const sum = aggregate({ rows: rows(), xKey: 'region', yKey: 'revenue', aggregation: 'sum' });
    const byX = Object.fromEntries(sum.data.map((d) => [d.x, d.value]));
    expect(byX.North).toBe(250);
    expect(byX.South).toBe(320);
    expect(byX.East).toBe(300);
    expect(sum.seriesKeys).toEqual(['value']);

    const avg = aggregate({ rows: rows(), xKey: 'region', yKey: 'revenue', aggregation: 'avg' });
    expect(Object.fromEntries(avg.data.map((d) => [d.x, d.value])).North).toBe(125);

    const count = aggregate({ rows: rows(), xKey: 'region', aggregation: 'count' });
    expect(Object.fromEntries(count.data.map((d) => [d.x, d.value])).North).toBe(2);

    const min = aggregate({ rows: rows(), xKey: 'region', yKey: 'revenue', aggregation: 'min' });
    expect(Object.fromEntries(min.data.map((d) => [d.x, d.value])).South).toBe(120);

    const max = aggregate({ rows: rows(), xKey: 'region', yKey: 'revenue', aggregation: 'max' });
    expect(Object.fromEntries(max.data.map((d) => [d.x, d.value])).South).toBe(200);
  });

  it('skips rows with missing x and missing y values', () => {
    const r = [{ x: 'a', y: '1' }, { x: null, y: '5' }, { x: 'a', y: '' }];
    const { data } = aggregate({ rows: r, xKey: 'x', yKey: 'y', aggregation: 'sum' });
    expect(data).toEqual([{ x: 'a', value: 1 }]);
  });

  it('groups by groupKey into series', () => {
    const { data, seriesKeys } = aggregate({
      rows: rows(),
      xKey: 'region',
      yKey: 'revenue',
      aggregation: 'sum',
      groupKey: 'product',
    });
    expect(seriesKeys.sort()).toEqual(['Gadget', 'Gizmo', 'Widget']);
    const north = data.find((d) => d.x === 'North');
    expect(north.Widget).toBe(250);
    expect(north.Gadget).toBe(null);
  });

  it('sorts ascending/descending by numeric-aware x', () => {
    const asc = aggregate({
      rows: rows(), xKey: 'region', yKey: 'revenue', aggregation: 'sum', sort: 'asc',
    });
    expect(asc.data.map((d) => d.x)).toEqual(['East', 'North', 'South']);
    const desc = aggregate({
      rows: rows(), xKey: 'revenue', aggregation: 'count', sort: 'desc',
    });
    expect(desc.data[0].x).toBe('300');
  });

  it('returns null aggregates for groups with no numeric y', () => {
    const { data } = aggregate({
      rows: [{ x: 'a', y: 'junk' }],
      xKey: 'x', yKey: 'y', aggregation: 'avg',
    });
    expect(data[0].value).toBe(null);
  });
});

describe('validateChartConfig', () => {
  const ds = sampleDataset();
  const good = {
    type: 'bar', xKey: 'region', yKey: 'revenue', aggregation: 'sum',
    groupKey: null, sort: 'none', filters: [],
  };

  it('accepts a valid config', () => {
    expect(validateChartConfig(ds, good)).toEqual([]);
  });

  it('rejects unknown chart types and missing config/dataset', () => {
    expect(validateChartConfig(ds, { ...good, type: 'pyramid' })[0]).toMatch(/unknown chart type/i);
    expect(validateChartConfig(ds, null)[0]).toMatch(/missing/i);
    expect(validateChartConfig(null, good)[0]).toMatch(/missing column metadata/i);
  });

  it('requires an existing x column', () => {
    expect(validateChartConfig(ds, { ...good, xKey: null })[0]).toMatch(/choose an x/i);
    expect(validateChartConfig(ds, { ...good, xKey: 'nope' })[0]).toMatch(/does not exist/i);
  });

  it('requires a y column unless aggregation is count', () => {
    expect(
      validateChartConfig(ds, { ...good, yKey: null })[0]
    ).toMatch(/choose a y column/i);
    expect(
      validateChartConfig(ds, { ...good, yKey: null, aggregation: 'count' })
    ).toEqual([]);
  });

  it('requires numeric y for sum/avg/min/max', () => {
    const errs = validateChartConfig(ds, { ...good, yKey: 'region' });
    expect(errs[0]).toMatch(/needs a numeric y/i);
  });

  it('enforces per-type column rules', () => {
    expect(
      validateChartConfig(ds, { ...good, type: 'histogram', xKey: 'region' })[0]
    ).toMatch(/numeric x/i);
    expect(
      validateChartConfig(ds, { ...good, type: 'scatter', xKey: 'region', yKey: 'revenue' })[0]
    ).toMatch(/numeric x/i);
    expect(
      validateChartConfig(ds, { ...good, type: 'pie', groupKey: 'product' })[0]
    ).toMatch(/do not support a group column/i);
  });

  it('flags filters on unknown columns', () => {
    const errs = validateChartConfig(ds, {
      ...good, filters: [{ column: 'nope', op: 'eq', value: 'x' }],
    });
    expect(errs[0]).toMatch(/filter 1 references unknown column/i);
  });
});

describe('suggestCharts', () => {
  it('suggests up to 3 charts from column types', () => {
    const s = suggestCharts(sampleDataset());
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s[0].type).toBe('bar');
    expect(s.every((c) => c.id && c.title && c.type)).toBe(true);
  });

  it('returns [] for datasets without usable columns', () => {
    expect(suggestCharts({ columns: [] })).toEqual([]);
  });
});

describe('buildChartData', () => {
  const ds = sampleDataset();

  it('builds a bar chart grouped and summed', () => {
    const r = buildChartData(ds, {
      type: 'bar', xKey: 'region', yKey: 'revenue', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    expect(r.error).toBe(undefined);
    expect(r.seriesKeys).toEqual(['value']);
    expect(r.data.find((d) => d.x === 'North').value).toBe(250);
  });

  it('applies config filters before aggregating', () => {
    const r = buildChartData(ds, {
      type: 'bar', xKey: 'region', yKey: 'revenue', aggregation: 'count',
      groupKey: null, sort: 'none',
      filters: [{ column: 'region', op: 'eq', value: 'North' }],
    });
    expect(r.data).toEqual([{ x: 'North', value: 2 }]);
  });

  it('builds histogram bins with counts', () => {
    const r = buildChartData(ds, {
      type: 'histogram', xKey: 'revenue', yKey: null, aggregation: 'count',
      groupKey: null, sort: 'none', filters: [],
    });
    expect(r.seriesKeys).toEqual(['count']);
    expect(r.data.reduce((s, b) => s + b.count, 0)).toBe(5);
  });

  it('builds scatter points with numeric x/y', () => {
    const r = buildChartData(ds, {
      type: 'scatter', xKey: 'revenue', yKey: 'quantity', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    expect(r.data).toHaveLength(5);
    expect(r.data[0]).toMatchObject({ x: 100, y: 2 });
  });

  it('builds box-plot stats per group', () => {
    const r = buildChartData(ds, {
      type: 'box', xKey: 'region', yKey: 'revenue', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    const north = r.data.find((d) => d.group === 'North');
    expect(north.median).toBe(125);
    expect(north.min).toBe(100);
    expect(north.max).toBe(150);
    expect(north.count).toBe(2);
  });

  it('collapses pie slices beyond 12 into "Other"', () => {
    const rowsMany = Array.from({ length: 20 }, (_, i) => ({
      cat: `c${i}`, v: i + 1,
    }));
    const big = {
      name: 'big',
      columns: [
        { name: 'cat', type: 'categorical' },
        { name: 'v', type: 'numeric' },
      ],
      rows: rowsMany,
    };
    const r = buildChartData(big, {
      type: 'pie', xKey: 'cat', yKey: 'v', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    expect(r.data).toHaveLength(13);
    expect(r.data[r.data.length - 1].x).toBe('Other');
    const total = r.data.reduce((s, d) => s + d.value, 0);
    expect(total).toBe(rowsMany.reduce((s, row) => s + row.v, 0));
  });

  it('auto-sorts line charts ascending on date x columns', () => {
    const r = buildChartData(ds, {
      type: 'line', xKey: 'order_date', yKey: 'revenue', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    const xs = r.data.map((d) => d.x);
    expect(xs).toEqual([...xs].sort());
  });

  it('returns an error object for invalid configs', () => {
    const r = buildChartData(ds, {
      type: 'bar', xKey: 'nope', yKey: 'revenue', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    expect(r.error).toMatch(/does not exist/i);
    expect(r.data).toEqual([]);
  });

  it('returns an error for datasets without rows', () => {
    const r = buildChartData({ columns: [] }, {
      type: 'bar', xKey: 'a', yKey: 'b', aggregation: 'sum',
      groupKey: null, sort: 'none', filters: [],
    });
    expect(r.error).toMatch(/no rows/i);
  });
});

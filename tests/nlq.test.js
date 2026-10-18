// nlq.js — dynamic concept-based NLQ: metric/dimension resolution,
// top-N, grains, distribution, disambiguation, interpretation.
import { describe, it, expect } from 'vitest';
import { parseNLQ, NLQ_EXAMPLES } from '../src/utils/nlq.js';
import { sampleDataset } from './helpers.js';
import { buildDataset } from '../src/utils/dataTypes.js';

const ds = () => sampleDataset('sales');

describe('parseNLQ', () => {
  it('parses "monthly revenue by region" into a monthly line chart', () => {
    const r = parseNLQ('Show monthly revenue by region', ds());
    expect(r.error).toBe(null);
    expect(r.clarification).toBe(null);
    expect(r.chartConfig.type).toBe('line');
    expect(r.chartConfig.xKey).toBe('__period');
    expect(r.chartConfig.yKey).toBe('revenue');
    expect(r.chartConfig.aggregation).toBe('sum');
    expect(r.table.columns[0]).toBe('x');
    expect(r.table.rows.length).toBeGreaterThan(0);
    expect(r.sql).toMatch(/DATE_TRUNC\('month', order_date\)/);
    expect(r.sql).toMatch(/SUM\(revenue\)/);
    expect(r.sql).toMatch(/GROUP BY 1, 2/);
    expect(r.interpretation.plain).toMatch(/monthly/i);
    expect(r.interpretation.columns.length).toBeGreaterThan(0);
  });

  it('handles top-N with descending metric sort and LIMIT', () => {
    const r = parseNLQ('Top 5 products by revenue', ds());
    expect(r.chartConfig.type).toBe('bar');
    expect(r.chartConfig.xKey).toBe('product');
    expect(r.chartConfig.sort).toBe('desc');
    expect(r.table.rows.length).toBeLessThanOrEqual(5);
    expect(r.sql).toMatch(/LIMIT 5/);
    expect(r.sql).toMatch(/DESC/);
  });

  it('handles bottom-N with ascending sort', () => {
    const r = parseNLQ('Bottom 3 regions by revenue', ds());
    expect(r.chartConfig.sort).toBe('asc');
    expect(r.sql).toMatch(/LIMIT 3/);
    expect(r.sql).toMatch(/ASC/);
  });

  it('parses order counts as COUNT aggregation', () => {
    const r = parseNLQ('Count of orders per month', ds());
    expect(r.chartConfig.aggregation).toBe('count');
    expect(r.chartConfig.type).toBe('line');
    expect(r.sql).toMatch(/COUNT\(\*\)/);
  });

  it('parses explicit distribution questions into pie charts', () => {
    const r = parseNLQ('revenue distribution of region', ds());
    expect(r.chartConfig.type).toBe('pie');
    expect(r.chartConfig.xKey).toBe('region');
    expect(r.chartConfig.aggregation).toBe('count');
    expect(r.interpretation.plain).toBe('Region breakdown');
  });

  it('parses "revenue by region" into a bar chart with SUM', () => {
    const r = parseNLQ('Revenue by region', ds());
    expect(r.chartConfig.type).toBe('bar');
    expect(r.chartConfig.aggregation).toBe('sum');
    expect(r.sql).toMatch(/SUM\(revenue\)/);
    expect(r.sql).toMatch(/-- Illustrative SQL/);
  });

  it('switches to average when the question says average', () => {
    const r = parseNLQ('Average revenue by region', ds());
    expect(r.chartConfig.aggregation).toBe('avg');
    expect(r.sql).toMatch(/AVG\(revenue\)/);
  });

  it('asks for the dimension when a metric has no grouping', () => {
    const r = parseNLQ('Total quantity', ds());
    expect(r.chartConfig).toBe(null);
    expect(r.error).toBe(null);
    expect(r.clarification.prompt).toMatch(/break down/i);
    expect(r.clarification.options.length).toBeGreaterThan(0);
  });

  it('matches dimension concepts via synonyms', () => {
    // "area" is a synonym of the region concept; the single numeric column
    // is picked up via the no-metric-word fallback (no direct metric
    // mention, so the metric-leak issue below cannot interfere).
    const d = buildDataset('zones', [
      { area: 'north', amount: 10 },
      { area: 'south', amount: 20 },
    ]);
    const r = parseNLQ('Total earnings by area', d);
    expect(r.error).toBe(null);
    expect(r.chartConfig.type).toBe('bar');
    expect(r.chartConfig.xKey).toBe('area');
    expect(r.chartConfig.yKey).toBe('amount');
    // plural tolerance: "areas"
    const r2 = parseNLQ('Total earnings by areas', d);
    expect(r2.chartConfig.xKey).toBe('area');
  });

  it('returns an error with suggestions when nothing matches', () => {
    const r = parseNLQ('how many llamas ate lunch', ds());
    expect(r.chartConfig).toBe(null);
    expect(r.sql).toBe(null);
    expect(r.table).toBe(null);
    expect(r.error).toMatch(/couldn't map/i);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it('returns noMatch for empty questions and empty datasets', () => {
    expect(parseNLQ('', ds()).error).toMatch(/couldn't map/i);
    expect(parseNLQ('   ', ds()).error).toMatch(/couldn't map/i);
    expect(parseNLQ(null, ds()).error).toMatch(/couldn't map/i);
    expect(parseNLQ('Revenue by region', { name: 'e', columns: [], rows: [] }).error).toMatch(
      /couldn't map/i
    );
  });

  it('exposes the documented example questions', () => {
    expect(NLQ_EXAMPLES.length).toBeGreaterThanOrEqual(10);
    expect(NLQ_EXAMPLES).toContain('Show monthly revenue by region');
  });

  // ------------------------------------------------------------------
  // The two issues below were fixed in src/utils/nlq.js during this task:
  // the resolved metric column is now excluded from dimensions, and bare
  // distribution questions build a COUNT pie. These are regression guards.
  // ------------------------------------------------------------------

  it('excludes the resolved metric column from dimensions', () => {
    expect(parseNLQ('Revenue by region', ds()).chartConfig.xKey).toBe('region');
    expect(parseNLQ('Revenue by region', ds()).chartConfig.groupKey).toBe(null);
    expect(parseNLQ('Show monthly revenue by region', ds()).chartConfig.groupKey).toBe(
      'region'
    );
    expect(parseNLQ('Top 5 products by revenue', ds()).chartConfig.groupKey).toBe(null);
  });

  it('builds a count pie for a bare distribution question', () => {
    const r = parseNLQ('distribution of region', ds());
    expect(r.chartConfig.type).toBe('pie');
    expect(r.chartConfig.xKey).toBe('region');
  });
});

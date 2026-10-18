// sampleData.js — deterministic sample dataset generation.
import { describe, it, expect } from 'vitest';
import { generateSampleData, SAMPLE_SCHEMA } from '../src/utils/sampleData.js';

describe('generateSampleData', () => {
  it('generates 1500 rows with the expected columns', () => {
    const ds = generateSampleData();
    expect(ds.name).toBe('Sample E-commerce Dataset');
    expect(ds.rows).toHaveLength(1500);
    expect(ds.columns.map((c) => c.name)).toEqual([
      'order_id', 'order_date', 'region', 'category', 'product',
      'quantity', 'unit_price', 'revenue', 'channel', 'customer_segment',
    ]);
  });

  it('is deterministic across calls', () => {
    const a = generateSampleData();
    const b = generateSampleData();
    expect(a.rows).toEqual(b.rows);
  });

  it('keeps revenue consistent with quantity * unit_price', () => {
    const ds = generateSampleData();
    for (const r of ds.rows.slice(0, 50)) {
      expect(r.revenue).toBeCloseTo(r.quantity * r.unit_price, 2);
    }
  });

  it('uses zero-padded order IDs and ISO dates in 2025', () => {
    const ds = generateSampleData();
    expect(ds.rows[0].order_id).toBe('ORD-0001');
    expect(ds.rows[1499].order_id).toBe('ORD-1500');
    for (const r of ds.rows.slice(0, 20)) {
      expect(r.order_date).toMatch(/^2025-\d{2}-\d{2}$/);
    }
  });

  it('marks the dataset as sample-sourced', () => {
    const ds = generateSampleData();
    expect(ds.meta.source).toBe('sample');
  });
});

describe('SAMPLE_SCHEMA', () => {
  it('documents the orders table', () => {
    expect(SAMPLE_SCHEMA[0].table).toBe('orders');
    expect(SAMPLE_SCHEMA[0].columns.map((c) => c.name)).toContain('revenue');
  });
});

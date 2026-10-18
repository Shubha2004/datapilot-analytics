// kpis.js — KPI summary: totals, AOV, monthly trend, growth, breakdowns,
// top products, completeness, duplicates, filters.
import { describe, it, expect } from 'vitest';
import { computeKPIs } from '../src/utils/kpis.js';

const EXPECTED_KEYS = [
  'totalRevenue',
  'revenueCells',
  'invalidRevenueCells',
  'totalOrders',
  'distinctOrderIds',
  'rowsWithMissingOrderId',
  'unitsSold',
  'avgOrderValue',
  'aovNote',
  'byMonth',
  'latestMonth',
  'previousMonth',
  'revenueGrowthPct',
  'growthNote',
  'byCategory',
  'byRegion',
  'byChannel',
  'bySegment',
  'topProducts',
  'dataCompleteness',
  'duplicateRate',
  'duplicateRows',
  'grain',
  'assumptions',
  'warnings',
];

/** Hand-built 5-row dataset; expected values computed by hand. */
function handBuiltRows() {
  return [
    {
      order_id: 'A1',
      order_date: '2025-01-05',
      region: 'North',
      category: 'Electronics',
      product: 'Phone',
      quantity: 2,
      unit_price: 100,
      revenue: 200,
      channel: 'Online',
      customer_segment: 'Consumer',
    },
    {
      order_id: 'A1',
      order_date: '2025-01-06',
      region: 'North',
      category: 'Electronics',
      product: 'Case',
      quantity: 1,
      unit_price: 50,
      revenue: 50,
      channel: 'Online',
      customer_segment: 'Consumer',
    },
    {
      order_id: 'A2',
      order_date: '2025-02-10',
      region: 'South',
      category: 'Books',
      product: 'Novel',
      quantity: 3,
      unit_price: 20,
      revenue: 60,
      channel: 'Retail',
      customer_segment: 'Corporate',
    },
    {
      order_id: null,
      order_date: '2025-02-11',
      region: 'South',
      category: 'Books',
      product: 'Novel',
      quantity: 1,
      unit_price: 20,
      revenue: 20,
      channel: 'Retail',
      customer_segment: 'Corporate',
    },
    {
      order_id: 'A3',
      order_date: 'not-a-date',
      region: 'West',
      category: 'Books',
      product: 'Pen',
      quantity: 5,
      unit_price: 4,
      revenue: 20,
      channel: 'Wholesale',
      customer_segment: 'Home Office',
    },
  ];
}

function handBuiltDataset(rows = handBuiltRows()) {
  return { name: 'hand', columns: [], rows };
}

function byKey(list, key = 'key') {
  return Object.fromEntries(list.map((e) => [e[key], e]));
}

describe('computeKPIs basic numbers', () => {
  const k = computeKPIs(handBuiltDataset());

  it('returns exactly the expected keys', () => {
    expect(Object.keys(k).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('computes revenue totals by hand', () => {
    expect(k.totalRevenue).toBe(350); // 200+50+60+20+20
    expect(k.revenueCells).toBe(5);
    expect(k.invalidRevenueCells).toBe(0);
  });

  it('counts distinct order ids, excluding missing ones', () => {
    expect(k.totalOrders).toBe(3); // A1, A2, A3
    expect(k.distinctOrderIds).toBe(3);
    expect(k.rowsWithMissingOrderId).toBe(1);
  });

  it('sums units and computes AOV over distinct orders', () => {
    expect(k.unitsSold).toBe(12); // 2+1+3+1+5
    expect(k.avgOrderValue).toBeCloseTo(350 / 3, 10);
    expect(typeof k.aovNote).toBe('string');
    expect(k.aovNote.length).toBeGreaterThan(0);
  });

  it('builds the monthly trend, excluding unparseable dates', () => {
    expect(k.byMonth).toEqual([
      { month: '2025-01', revenue: 250, orders: 1, units: 3 },
      { month: '2025-02', revenue: 80, orders: 1, units: 4 },
    ]);
    expect(k.latestMonth).toBe('2025-02');
    expect(k.previousMonth).toBe('2025-01');
    expect(k.revenueGrowthPct).toBeCloseTo(-68, 10); // (80-250)/250*100
  });

  it('warns about missing order ids and unparseable dates', () => {
    expect(k.warnings.some((w) => /missing order id/i.test(w))).toBe(true);
    expect(k.warnings.some((w) => /unparseable date/i.test(w))).toBe(true);
  });

  it('breaks down by category with contributionPct', () => {
    const byCat = byKey(k.byCategory);
    expect(byCat.Electronics.revenue).toBe(250);
    expect(byCat.Electronics.orders).toBe(1);
    expect(byCat.Books.revenue).toBe(100);
    expect(byCat.Books.orders).toBe(2); // A2 + A3; missing-id row excluded from orders
    const totalPct = k.byCategory.reduce((s, e) => s + e.contributionPct, 0);
    expect(totalPct).toBeCloseTo(100, 8);
  });

  it('breaks down by region and channel with contributionPct ~100', () => {
    const byReg = byKey(k.byRegion);
    expect(byReg.North.revenue).toBe(250);
    expect(byReg.South.revenue).toBe(80); // 60 + missing-id row's 20
    expect(byReg.West.revenue).toBe(20);
    expect(k.byRegion.reduce((s, e) => s + e.contributionPct, 0)).toBeCloseTo(100, 8);
    expect(k.byChannel.reduce((s, e) => s + e.contributionPct, 0)).toBeCloseTo(100, 8);
  });

  it('breaks down by segment with per-segment AOV', () => {
    const bySeg = byKey(k.bySegment);
    expect(bySeg.Consumer).toMatchObject({ revenue: 250, orders: 1, avgOrderValue: 250 });
    expect(bySeg.Corporate).toMatchObject({ revenue: 80, orders: 1, avgOrderValue: 80 });
    expect(bySeg['Home Office']).toMatchObject({ revenue: 20, orders: 1, avgOrderValue: 20 });
  });

  it('ranks top products by revenue desc (top 10)', () => {
    expect(k.topProducts).toHaveLength(4);
    expect(k.topProducts.map((p) => p.product)).toEqual(['Phone', 'Novel', 'Case', 'Pen']);
    expect(k.topProducts[0]).toMatchObject({ revenue: 200, quantity: 2, orders: 1 });
    expect(k.topProducts[1]).toMatchObject({ revenue: 80, quantity: 4, orders: 1 });
  });

  it('reports grain, assumptions and dataCompleteness', () => {
    expect(k.grain).toContain('One row = one order line item');
    expect(Array.isArray(k.assumptions)).toBe(true);
    expect(k.assumptions.length).toBeGreaterThan(0);
    // 5 rows x 9 KPI fields = 45 cells; 1 missing (null order_id) -> 44/45*100 = 97.78
    expect(k.dataCompleteness).toBeCloseTo(97.78, 2);
  });

  it('reports zero duplicates for unique rows', () => {
    expect(k.duplicateRows).toBe(0);
    expect(k.duplicateRate).toBe(0);
  });
});

describe('order counting edge cases', () => {
  it('counts duplicate order_ids across rows as one order', () => {
    const rows = [
      { order_id: 'X1', order_date: '2025-03-01', revenue: 10, quantity: 1 },
      { order_id: 'X1', order_date: '2025-03-02', revenue: 20, quantity: 2 },
      { order_id: 'X2', order_date: '2025-03-03', revenue: 30, quantity: 3 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.totalOrders).toBe(2);
    expect(k.totalRevenue).toBe(60);
    expect(k.avgOrderValue).toBeCloseTo(30, 10);
  });

  it('excludes missing order_ids from orders but keeps their revenue', () => {
    const rows = [
      { order_id: null, order_date: '2025-03-01', revenue: 40, quantity: 4 },
      { order_id: '', order_date: '2025-03-02', revenue: 60, quantity: 6 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.totalOrders).toBe(0);
    expect(k.distinctOrderIds).toBe(0);
    expect(k.rowsWithMissingOrderId).toBe(2);
    expect(k.totalRevenue).toBe(100);
    expect(k.unitsSold).toBe(10);
  });

  it('returns avgOrderValue null when there are zero orders', () => {
    const rows = [{ order_id: null, order_date: '2025-03-01', revenue: 40, quantity: 1 }];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.avgOrderValue).toBeNull();
    expect(typeof k.aovNote).toBe('string');
    expect(k.aovNote).toMatch(/null/i);
  });
});

describe('empty and degenerate datasets', () => {
  it('never throws on an empty dataset and returns zeros/nulls', () => {
    const k = computeKPIs({ name: 'empty', columns: [], rows: [] });
    expect(k.totalRevenue).toBe(0);
    expect(k.revenueCells).toBe(0);
    expect(k.invalidRevenueCells).toBe(0);
    expect(k.totalOrders).toBe(0);
    expect(k.unitsSold).toBe(0);
    expect(k.avgOrderValue).toBeNull();
    expect(k.byMonth).toEqual([]);
    expect(k.latestMonth).toBeNull();
    expect(k.previousMonth).toBeNull();
    expect(k.revenueGrowthPct).toBeNull();
    expect(typeof k.growthNote).toBe('string');
    expect(k.byCategory).toEqual([]);
    expect(k.byRegion).toEqual([]);
    expect(k.byChannel).toEqual([]);
    expect(k.bySegment).toEqual([]);
    expect(k.topProducts).toEqual([]);
    expect(k.duplicateRows).toBe(0);
    expect(k.duplicateRate).toBe(0);
    expect(Object.keys(k).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('never throws on null/undefined dataset', () => {
    expect(() => computeKPIs(null)).not.toThrow();
    expect(() => computeKPIs(undefined)).not.toThrow();
    expect(computeKPIs(null).totalRevenue).toBe(0);
  });
});

describe('invalid and negative revenue', () => {
  it('ignores NaN/Infinity/non-numeric revenue, counting them as invalid', () => {
    const rows = [
      { order_id: 'B1', order_date: '2025-01-01', revenue: 100, quantity: 1 },
      { order_id: 'B2', order_date: '2025-01-02', revenue: NaN, quantity: 1 },
      { order_id: 'B3', order_date: '2025-01-03', revenue: Infinity, quantity: 1 },
      { order_id: 'B4', order_date: '2025-01-04', revenue: 'abc', quantity: 1 },
      { order_id: 'B5', order_date: '2025-01-05', revenue: '', quantity: 1 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.totalRevenue).toBe(100);
    expect(k.revenueCells).toBe(1);
    expect(k.invalidRevenueCells).toBe(4);
    // quantity still counted for those rows
    expect(k.unitsSold).toBe(5);
  });

  it('keeps negative revenue and flags a warning', () => {
    const rows = [
      { order_id: 'C1', order_date: '2025-01-01', revenue: 100, quantity: 1 },
      { order_id: 'C2', order_date: '2025-01-02', revenue: -30, quantity: 1 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.totalRevenue).toBe(70);
    expect(k.warnings.some((w) => /negative revenue/i.test(w))).toBe(true);
  });
});

describe('month-over-month growth', () => {
  it('computes growth between consecutive calendar months', () => {
    const rows = [
      { order_id: 'D1', order_date: '2025-01-10', revenue: 100, quantity: 1 },
      { order_id: 'D2', order_date: '2025-02-10', revenue: 150, quantity: 1 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.latestMonth).toBe('2025-02');
    expect(k.previousMonth).toBe('2025-01');
    expect(k.revenueGrowthPct).toBeCloseTo(50, 10);
    expect(k.growthNote).toContain('2025-01');
  });

  it('returns null growth when the previous month has no data', () => {
    const rows = [{ order_id: 'E1', order_date: '2025-03-10', revenue: 100, quantity: 1 }];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.latestMonth).toBe('2025-03');
    expect(k.previousMonth).toBe('2025-02');
    expect(k.revenueGrowthPct).toBeNull();
    expect(k.growthNote).toMatch(/no data for the previous month/i);
  });

  it('returns null growth when previous-month revenue is zero', () => {
    const rows = [
      { order_id: 'F1', order_date: '2025-01-10', revenue: 0, quantity: 1 },
      { order_id: 'F2', order_date: '2025-02-10', revenue: 100, quantity: 1 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.revenueGrowthPct).toBeNull();
    expect(k.growthNote).toMatch(/previous month.*revenue is 0/i);
  });

  it('handles year boundaries (Jan -> previous Dec)', () => {
    const rows = [
      { order_id: 'G1', order_date: '2024-12-10', revenue: 200, quantity: 1 },
      { order_id: 'G2', order_date: '2025-01-10', revenue: 100, quantity: 1 },
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.latestMonth).toBe('2025-01');
    expect(k.previousMonth).toBe('2024-12');
    expect(k.revenueGrowthPct).toBeCloseTo(-50, 10);
  });
});

describe('filters', () => {
  it('applies a date range filter', () => {
    const k = computeKPIs(handBuiltDataset(), {
      filters: { dateFrom: '2025-01-01', dateTo: '2025-01-31' },
    });
    expect(k.totalRevenue).toBe(250);
    expect(k.totalOrders).toBe(1);
    expect(k.byMonth).toEqual([{ month: '2025-01', revenue: 250, orders: 1, units: 3 }]);
  });

  it('applies exact-match dimension filters', () => {
    const south = computeKPIs(handBuiltDataset(), { filters: { region: 'South' } });
    expect(south.totalRevenue).toBe(80);
    expect(south.totalOrders).toBe(1);

    const books = computeKPIs(handBuiltDataset(), { filters: { category: 'Books' } });
    expect(books.totalRevenue).toBe(100);

    const retail = computeKPIs(handBuiltDataset(), { filters: { channel: 'Retail' } });
    expect(retail.totalRevenue).toBe(80);

    const corporate = computeKPIs(handBuiltDataset(), { filters: { segment: 'Corporate' } });
    expect(corporate.totalRevenue).toBe(80);
  });

  it('combines filters with AND semantics', () => {
    const k = computeKPIs(handBuiltDataset(), {
      filters: { region: 'North', category: 'Electronics' },
    });
    expect(k.totalRevenue).toBe(250);
    expect(k.totalOrders).toBe(1);
  });

  it('honours custom column name options', () => {
    const rows = [{ id: 'Z1', d: '2025-04-01', amt: 500, qty: 5 }];
    const k = computeKPIs(
      { name: 'custom', columns: [], rows },
      { orderIdCol: 'id', dateCol: 'd', revenueCol: 'amt', quantityCol: 'qty' }
    );
    expect(k.totalRevenue).toBe(500);
    expect(k.totalOrders).toBe(1);
    expect(k.unitsSold).toBe(5);
    expect(k.byMonth).toEqual([{ month: '2025-04', revenue: 500, orders: 1, units: 5 }]);
  });
});

describe('completeness and duplicates', () => {
  it('measures dataCompleteness over the KPI fields', () => {
    const rows = [
      { order_id: 'H1', order_date: '2025-01-01', revenue: 10, quantity: 1 }, // 4 of 9 present
    ];
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.dataCompleteness).toBeCloseTo((4 / 9) * 100, 2);
  });

  it('detects exact duplicate rows with the sorted-key JSON convention', () => {
    const rows = handBuiltRows();
    rows.push({ ...handBuiltRows()[2] }); // exact duplicate of row index 2
    const k = computeKPIs(handBuiltDataset(rows));
    expect(k.duplicateRows).toBe(1);
    expect(k.duplicateRate).toBeCloseTo((1 / 6) * 100, 2);
    // duplicate row still contributes to totals
    expect(k.totalRevenue).toBe(350 + 60);
  });

  it('treats same-content different-key-order rows as duplicates', () => {
    const a = { order_id: 'J1', revenue: 5, quantity: 1 };
    const b = { quantity: 1, revenue: 5, order_id: 'J1' };
    const k = computeKPIs(handBuiltDataset([a, b]));
    expect(k.duplicateRows).toBe(1);
  });
});

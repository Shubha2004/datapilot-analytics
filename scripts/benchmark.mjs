// Performance benchmark for DataPilot Analytics core aggregations.
// Generates synthetic datasets at 1,500 / 10,000 / 50,000 rows using the same
// generator pattern as src/utils/sampleData.js (mulberry32 PRNG, different
// seed and row count — sampleData.js itself is NOT modified), then times:
//   1. computeKPIs-equivalent: total + monthly + grouped aggregations
//   2. describeColumn over the numeric columns (revenue, quantity, unit_price)
//   3. buildChartData: bar chart aggregation (category x revenue, sum)
// Usage: node --import ./scripts/register-esm-hook.mjs scripts/benchmark.mjs
//
// Kept OUT of the vitest suite (no test files touch scripts/).

import { buildDataset } from '../src/utils/dataTypes.js';
import { describeColumn } from '../src/utils/statistics.js';
import { buildChartData } from '../src/utils/chartData.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = {
  Electronics: { products: ['Smartphone', 'Laptop'], priceRange: [25, 1200] },
  Clothing: { products: ['T-Shirt', 'Jeans'], priceRange: [10, 150] },
  'Home & Kitchen': { products: ['Blender', 'Lamp'], priceRange: [15, 300] },
  Sports: { products: ['Yoga Mat', 'Bicycle'], priceRange: [12, 500] },
  Books: { products: ['Fiction Novel', 'Textbook'], priceRange: [8, 60] },
};
const REGIONS = ['North', 'South', 'East', 'West'];
const CHANNELS = ['Online', 'Retail', 'Wholesale'];
const SEGMENTS = ['Consumer', 'Corporate', 'Home Office'];
const DAY_MS = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;

/** Same generator pattern as src/utils/sampleData.js, parameterized. */
function generateRows(n, seed) {
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const start = Date.UTC(2025, 0, 1);
  const catNames = Object.keys(CATEGORIES);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const category = pick(catNames);
    const { products, priceRange } = CATEGORIES[category];
    const quantity = 1 + Math.floor(rand() * 5);
    const unit_price = round2(priceRange[0] + rand() * (priceRange[1] - priceRange[0]));
    const order_date = new Date(start + Math.floor(rand() * 365) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    rows.push({
      order_id: `ORD-${String(i + 1).padStart(4, '0')}`,
      order_date,
      region: pick(REGIONS),
      category,
      product: pick(products),
      quantity,
      unit_price,
      revenue: round2(quantity * unit_price),
      channel: pick(CHANNELS),
      customer_segment: pick(SEGMENTS),
    });
  }
  return buildDataset(`Benchmark dataset (${n} rows)`, rows, { source: 'benchmark' });
}

// KPI-style aggregation: totals + monthly buckets + grouped breakdowns.
// Mirrors the app's KPI contract semantics.
function computeKPIAggregations(rows) {
  let totalRevenue = 0;
  let unitsSold = 0;
  const byMonth = {};
  const byCategory = {};
  const byRegion = {};
  const byChannel = {};
  const bySegment = {};
  for (const r of rows) {
    totalRevenue += r.revenue;
    unitsSold += r.quantity;
    const m = r.order_date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + r.revenue;
    byCategory[r.category] = (byCategory[r.category] || 0) + r.revenue;
    byRegion[r.region] = (byRegion[r.region] || 0) + r.revenue;
    byChannel[r.channel] = (byChannel[r.channel] || 0) + r.revenue;
    bySegment[r.customer_segment] = (bySegment[r.customer_segment] || 0) + r.revenue;
  }
  const months = Object.keys(byMonth).sort();
  let mom = null;
  if (months.length >= 2) {
    mom = ((byMonth[months[months.length - 1]] - byMonth[months[months.length - 2]]) /
      byMonth[months[months.length - 2]]) * 100;
  }
  return { totalRevenue, unitsSold, months: months.length, byCategory, byRegion, byChannel, bySegment, mom };
}

function timed(label, fn, iterations = 1) {
  // warm up once
  fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6 / iterations;
  return { label, ms: Math.round(ms * 100) / 100 };
}

const results = [];
for (const n of [1500, 10000, 50000]) {
  console.log(`\n--- ${n.toLocaleString()} rows ---`);
  const genStart = process.hrtime.bigint();
  const ds = generateRows(n, 1337);
  const genMs = Number(process.hrtime.bigint() - genStart) / 1e6;
  const rows = ds.rows;

  const numericCols = {
    revenue: rows.map((r) => r.revenue),
    quantity: rows.map((r) => r.quantity),
    unit_price: rows.map((r) => r.unit_price),
  };

  const kpi = timed('computeKPIs-equivalent', () => computeKPIAggregations(rows), 5);
  const desc = timed('describeColumn (3 numeric cols)', () => {
    for (const col of Object.values(numericCols)) describeColumn(col);
  }, 5);
  const chart = timed('buildChartData (bar: category x revenue)', () =>
    buildChartData(ds, { type: 'bar', xKey: 'category', yKey: 'revenue', aggregation: 'sum' })
  , 5);

  for (const r of [kpi, desc, chart]) {
    console.log(`${r.label}: ${r.ms} ms`);
    results.push({ rows: n, ...r, generateMs: Math.round(genMs * 100) / 100 });
  }
  results[results.length - 3].generateMs = Math.round(genMs * 100) / 100;
}

console.log('\nBENCHMARK_JSON_START');
console.log(JSON.stringify({ results, node: process.version, platform: process.platform }, null, 2));
console.log('BENCHMARK_JSON_END');

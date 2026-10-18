// Compute real headline numbers for docs/CASE-STUDY.md.
// Usage: node scripts/compute-case-study.mjs
// Uses src/utils/sampleData.js + statistics.js directly (DOM-free), since
// src/utils/kpis.js (Worker A) may not exist yet. Method mirrors the KPI contract:
//   grain: one row = one line item; orders = distinct order_id.
import './register-esm-hook.mjs';
import { generateSampleData } from '../src/utils/sampleData.js';
import { describeColumn } from '../src/utils/statistics.js';
import { isMissing } from '../src/utils/dataTypes.js';

const ds = generateSampleData();
const rows = ds.rows;

// ---- headline totals ----
const sum = (a) => a.reduce((x, y) => x + y, 0);
const totalRevenue = Math.round(sum(rows.map((r) => r.revenue)) * 100) / 100;
const unitsSold = sum(rows.map((r) => r.quantity));
const orderIds = new Set(rows.map((r) => r.order_id));
const totalOrders = orderIds.size;
const avgOrderValue = Math.round((totalRevenue / totalOrders) * 100) / 100;

// ---- monthly ----
const byMonth = {};
for (const r of rows) {
  const m = r.order_date.slice(0, 7);
  if (!byMonth[m]) byMonth[m] = { month: m, revenue: 0, orders: 0 };
  byMonth[m].revenue += r.revenue;
  byMonth[m].orders += 1;
}
const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
for (const m of months) m.revenue = Math.round(m.revenue * 100) / 100;
for (let i = 1; i < months.length; i++) {
  const prev = months[i - 1].revenue;
  months[i].momPct = prev === 0 ? null : Math.round(((months[i].revenue - prev) / prev) * 10000) / 100;
}
const latestMonth = months[months.length - 1];
const previousMonth = months[months.length - 2];

// ---- groupings ----
const group = (key, extra = {}) => {
  const map = {};
  for (const r of rows) {
    const k = r[key];
    if (!map[k]) map[k] = { key: k, revenue: 0, orders: 0, units: 0 };
    map[k].revenue += r.revenue;
    map[k].orders += 1;
    map[k].units += r.quantity;
  }
  const arr = Object.values(map).sort((a, b) => b.revenue - a.revenue);
  for (const g of arr) {
    g.revenue = Math.round(g.revenue * 100) / 100;
    g.contributionPct = Math.round((g.revenue / totalRevenue) * 10000) / 100;
    g.avgOrderValue = Math.round((g.revenue / g.orders) * 100) / 100;
  }
  return arr;
};
const byCategory = group('category');
const byRegion = group('region');
const byChannel = group('channel');
const bySegment = group('customer_segment');

// ---- top products ----
const byProduct = group('product').slice(0, 10);

// ---- data quality ----
const cols = Object.keys(rows[0]);
let missingCells = 0;
for (const r of rows) for (const c of cols) if (isMissing(r[c])) missingCells++;
const dataCompleteness = Math.round(((rows.length * cols.length - missingCells) / (rows.length * cols.length)) * 10000) / 100;
const seen = new Set();
let dupRows = 0;
for (const r of rows) {
  const k = JSON.stringify(r);
  if (seen.has(k)) dupRows++;
  else seen.add(k);
}
const duplicateRate = Math.round((dupRows / rows.length) * 10000) / 100;
const revenueDesc = describeColumn(rows.map((r) => r.revenue));
const qtyDesc = describeColumn(rows.map((r) => r.quantity));
const invalidRevenue = rows.filter((r) => typeof r.revenue !== 'number' || !Number.isFinite(r.revenue) || r.revenue < 0).length;
const invalidQty = rows.filter((r) => !Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > 5).length;
const mathCheck = rows.filter((r) => Math.abs(r.revenue - r.quantity * r.unit_price) > 0.01).length;
const datesValid = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.order_date)).length;
const dateMin = months[0].month, dateMax = months[months.length - 1].month;

const out = {
  generatedAt: new Date().toISOString(),
  dataset: 'Sample E-commerce Dataset (SYNTHETIC, deterministic seed 42)',
  rows: rows.length,
  columns: cols,
  grain: 'one row = one line item; orders = distinct order_id',
  totalRevenue, totalOrders, unitsSold, avgOrderValue,
  byMonth: months,
  latestMonth, previousMonth,
  byCategory, byRegion, byChannel, bySegment,
  topProducts: byProduct,
  dataCompleteness, duplicateRate,
  invalidRevenueRows: invalidRevenue,
  invalidQuantityRows: invalidQty,
  revenueConsistencyMismatches: mathCheck,
  validDateRows: datesValid,
  dateRange: [dateMin, dateMax],
  revenueStats: { min: revenueDesc.min, max: revenueDesc.max, mean: Math.round(revenueDesc.mean * 100) / 100, median: Math.round(revenueDesc.median * 100) / 100 },
  quantityStats: { min: qtyDesc.min, max: qtyDesc.max, mean: Math.round(qtyDesc.mean * 100) / 100 },
};

console.log(JSON.stringify(out, null, 2));

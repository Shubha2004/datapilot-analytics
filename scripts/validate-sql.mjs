// SQL validation: recompute in JS the results that the SQL queries in
// analysis/sql/ would produce against the same dataset, and assert they match
// the SQL README's recorded values.
// Usage: node --import ./scripts/register-esm-hook.mjs scripts/validate-sql.mjs
import { generateSampleData } from '../src/utils/sampleData.js';

const rows = generateSampleData().rows;
const sum = (rs) => rs.reduce((a, r) => a + r.revenue, 0);
const round2 = (n) => Math.round(n * 100) / 100;

// 1) Total revenue  (01_basics.sql query A)
const totalRevenue = round2(sum(rows));

// 2) Top category + share  (01_basics.sql query C / 04_contribution.sql query A)
const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + r.revenue;
const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
const topCatRevenue = round2(topCat[1]);
const topCatShare = round2((topCatRevenue / totalRevenue) * 100);

// 3) MoM growth for 2025-12 vs 2025-11  (06_mom_growth.sql query A)
const byMonth = {};
for (const r of rows) {
  const m = r.order_date.slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + r.revenue;
}
const dec = byMonth['2025-12'];
const nov = byMonth['2025-11'];
const decRevenue = round2(dec);
const momPctDec = round2(((dec - nov) / nov) * 100);

// Expected values (recorded in analysis/sql/README.md)
const EXPECTED = {
  totalRevenue: 1066210.23,
  topCategory: 'Electronics',
  topCategoryRevenue: 594758.43,
  topCategoryShare: 55.78,
  dec2025Revenue: 102133.93,
  dec2025MomPct: 3.86,
};

const checks = [
  ['totalRevenue', totalRevenue, EXPECTED.totalRevenue],
  ['topCategory name', topCat[0], EXPECTED.topCategory],
  ['topCategoryRevenue', topCatRevenue, EXPECTED.topCategoryRevenue],
  ['topCategoryShare', topCatShare, EXPECTED.topCategoryShare],
  ['dec2025Revenue', decRevenue, EXPECTED.dec2025Revenue],
  ['dec2025MomPct', momPctDec, EXPECTED.dec2025MomPct],
];

let failed = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: computed=${got} expected=${want}`);
}
if (failed) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}
console.log('All SQL validation checks passed.');

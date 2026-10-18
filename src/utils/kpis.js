/**
 * kpis.js — KPI summary computation for DataPilot Analytics.
 *
 * Pure functions: no I/O, no mutation of the input dataset, no side effects.
 * All numeric parsing uses toNumber/isMissing from dataTypes.js; numeric
 * aggregation sums use describeColumn from statistics.js.
 */
import { isMissing, toNumber } from './dataTypes.js';
import { describeColumn } from './statistics.js';

const KPI_FIELDS_DEFAULT = {
  orderIdCol: 'order_id',
  dateCol: 'order_date',
  revenueCol: 'revenue',
  quantityCol: 'quantity',
  categoryCol: 'category',
  regionCol: 'region',
  channelCol: 'channel',
  segmentCol: 'customer_segment',
  productCol: 'product',
};

/**
 * Extract a 'YYYY-MM' month key from a date value.
 * Grain: derived from the first 7 characters of an ISO 'YYYY-MM-DD' value;
 * returns null for missing or unparseable values.
 * @param {unknown} v raw date cell value
 * @returns {string|null} 'YYYY-MM' or null
 */
function monthKey(v) {
  if (isMissing(v)) return null;
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(String(v).trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const d = new Date(Date.UTC(Number(m[1]), month - 1, 1));
  if (Number.isNaN(d.getTime())) return null;
  return `${m[1]}-${m[2]}`;
}

/**
 * Calendar month immediately before a 'YYYY-MM' month key.
 * @param {string} ym 'YYYY-MM'
 * @returns {string} 'YYYY-MM' of the preceding month
 */
function previousMonthKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** JSON key for duplicate detection (same convention as cleaning.js). */
function rowKey(row) {
  return JSON.stringify(row, Object.keys(row).sort());
}

/** Round to 2 decimals, guarding against float noise. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the full KPI summary for a dataset.
 *
 * Grain: one input row = one order line item. Orders are counted as DISTINCT
 * order_id values; a row is not assumed to be a unique order. All revenue and
 * quantity figures are computed AFTER the optional filters are applied.
 *
 * Assumptions (also returned in the result):
 * - Only finite numbers count toward revenue/quantity (toNumber coercion, so
 *   strings like '1,000' parse; NaN/Infinity/'abc' are ignored and counted).
 * - Rows with missing order_id are excluded from order counts but their
 *   revenue/units still count toward totals.
 * - Negative revenue/quantity values are kept in totals but flagged.
 * - Rows with missing or unparseable dates are excluded from byMonth.
 * - The previous month is the calendar month before the latest month present
 *   in the data; growth needs data for both months and a non-zero
 *   previous-month revenue.
 * - Duplicate detection uses the sorted-key JSON.stringify convention.
 * - dataCompleteness is measured over the 9 KPI fields per (filtered) row.
 *
 * @param {{name?:string,columns?:Array<{name:string,type:string}>,rows?:Array<Object>,meta?:Object}|null|undefined} dataset
 *   canonical dataset object; null/empty is tolerated (never throws)
 * @param {Object} [opts] optional overrides
 * @param {string} [opts.orderIdCol='order_id'] column holding the order id
 * @param {string} [opts.dateCol='order_date'] column holding 'YYYY-MM-DD' dates
 * @param {string} [opts.revenueCol='revenue'] numeric revenue column
 * @param {string} [opts.quantityCol='quantity'] numeric quantity column
 * @param {string} [opts.categoryCol='category'] categorical column for byCategory
 * @param {string} [opts.regionCol='region'] categorical column for byRegion
 * @param {string} [opts.channelCol='channel'] categorical column for byChannel
 * @param {string} [opts.segmentCol='customer_segment'] categorical column for bySegment
 * @param {string} [opts.productCol='product'] column for topProducts
 * @param {Object} [opts.filters] optional pre-aggregation filters:
 *   { dateFrom, dateTo ('YYYY-MM-DD' strings, inclusive), region, category,
 *   channel, segment (exact-match values) }. Any missing filter is not applied.
 * @returns {Object} KPI summary with the exact keys other workers depend on.
 */
export function computeKPIs(dataset, opts = {}) {
  const {
    orderIdCol,
    dateCol,
    revenueCol,
    quantityCol,
    categoryCol,
    regionCol,
    channelCol,
    segmentCol,
    productCol,
  } = { ...KPI_FIELDS_DEFAULT, ...opts };
  const filters = opts.filters || {};

  const rawRows = dataset && Array.isArray(dataset.rows) ? dataset.rows : [];

  // ---- Filters (applied before every aggregation) ----
  const rows = rawRows.filter((row) => {
    if (filters.dateFrom != null) {
      const dv = row[dateCol];
      if (isMissing(dv) || String(dv) < String(filters.dateFrom)) return false;
    }
    if (filters.dateTo != null) {
      const dv = row[dateCol];
      if (isMissing(dv) || String(dv) > String(filters.dateTo)) return false;
    }
    for (const [filterKey, col] of [
      ['region', regionCol],
      ['category', categoryCol],
      ['channel', channelCol],
      ['segment', segmentCol],
    ]) {
      if (filters[filterKey] != null && row[col] !== filters[filterKey]) {
        return false;
      }
    }
    return true;
  });

  const warnings = [];
  const assumptions = [
    'One row = one order line item. Orders are counted as DISTINCT order_id values; a row is not assumed to be a unique order.',
    'All KPIs are computed after the optional filters are applied.',
    'Revenue and quantity use only finite numbers (toNumber coercion: strings like "1,000" parse; NaN, Infinity and non-numeric strings are ignored).',
    'Rows with missing order IDs are excluded from order counts, but their revenue and units still count toward totals.',
    'Negative revenue/quantity values are kept in totals but flagged in warnings.',
    'Rows with missing or unparseable dates are excluded from the monthly trend.',
    'The previous month is the calendar month before the latest month in the data; growth requires data for both months and a non-zero previous-month revenue.',
    'Duplicate detection uses the sorted-key JSON.stringify convention (same as cleaning.js).',
    'dataCompleteness is measured over the 9 KPI fields per filtered row.',
  ];

  // ---- Revenue / invalid cells ----
  const revenueValues = rows.map((r) => toNumber(r[revenueCol]));
  const validRevenue = revenueValues.filter((n) => n !== null);
  const revenueCells = validRevenue.length;
  const invalidRevenueCells = rows.length - revenueCells;
  const totalRevenue = describeColumn(validRevenue).sum ?? 0;
  const negativeRevenueRows = validRevenue.filter((n) => n < 0).length;
  if (negativeRevenueRows > 0) {
    warnings.push(
      `${negativeRevenueRows} row(s) had negative revenue values; they are included in totals.`
    );
  }
  if (invalidRevenueCells > 0) {
    warnings.push(
      `${invalidRevenueCells} revenue cell(s) could not be parsed as finite numbers and were excluded from revenue totals.`
    );
  }

  // ---- Orders ----
  const orderIds = rows.map((r) => (isMissing(r[orderIdCol]) ? null : r[orderIdCol]));
  const rowsWithMissingOrderId = orderIds.filter((id) => id === null).length;
  const distinctOrderIds = new Set(orderIds.filter((id) => id !== null)).size;
  const totalOrders = distinctOrderIds;
  if (rowsWithMissingOrderId > 0) {
    warnings.push(
      `${rowsWithMissingOrderId} row(s) had missing order IDs; excluded from the order count but their revenue/units are included in totals.`
    );
  }

  // ---- Quantity ----
  const quantityValues = rows.map((r) => toNumber(r[quantityCol]));
  const validQuantity = quantityValues.filter((n) => n !== null);
  const unitsSold = describeColumn(validQuantity).sum ?? 0;
  const negativeQuantityRows = validQuantity.filter((n) => n < 0).length;
  if (negativeQuantityRows > 0) {
    warnings.push(
      `${negativeQuantityRows} row(s) had negative quantity values; they are included in totals.`
    );
  }

  // ---- AOV ----
  const avgOrderValue = totalOrders === 0 ? null : totalRevenue / totalOrders;
  let aovNote =
    'avgOrderValue = totalRevenue / totalOrders, where the denominator is the count of DISTINCT order_id values (not the row count).';
  if (totalOrders === 0) {
    aovNote += ' Currently null because totalOrders is 0.';
  }

  // ---- Monthly trend ----
  const monthAgg = new Map(); // month -> { revenue, orders:Set, units }
  let unparseableDateRows = 0;
  rows.forEach((row, i) => {
    const mk = monthKey(row[dateCol]);
    if (mk === null) {
      if (!isMissing(row[dateCol])) unparseableDateRows++;
      return;
    }
    if (!monthAgg.has(mk)) monthAgg.set(mk, { revenue: 0, orders: new Set(), units: 0 });
    const bucket = monthAgg.get(mk);
    const rev = revenueValues[i];
    if (rev !== null) bucket.revenue += rev;
    const qty = quantityValues[i];
    if (qty !== null) bucket.units += qty;
    const id = orderIds[i];
    if (id !== null) bucket.orders.add(id);
  });
  if (unparseableDateRows > 0) {
    warnings.push(
      `${unparseableDateRows} row(s) had unparseable dates and were excluded from the monthly trend.`
    );
  }
  const byMonth = [...monthAgg.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, b]) => ({
      month,
      revenue: b.revenue,
      orders: b.orders.size,
      units: b.units,
    }));
  const latestMonth = byMonth.length > 0 ? byMonth[byMonth.length - 1].month : null;
  const previousMonth = latestMonth === null ? null : previousMonthKey(latestMonth);

  let revenueGrowthPct = null;
  let growthNote;
  if (latestMonth === null) {
    growthNote = 'No dated rows: growth cannot be computed.';
  } else if (!monthAgg.has(previousMonth)) {
    growthNote = `No data for the previous month (${previousMonth}): growth cannot be computed.`;
  } else {
    const prevRevenue = monthAgg.get(previousMonth).revenue;
    const latestRevenue = monthAgg.get(latestMonth).revenue;
    if (prevRevenue === 0) {
      growthNote = `Previous month (${previousMonth}) revenue is 0: growth percentage is undefined.`;
    } else {
      revenueGrowthPct = ((latestRevenue - prevRevenue) / Math.abs(prevRevenue)) * 100;
      growthNote = `Month-over-month revenue growth from ${previousMonth} to ${latestMonth}.`;
    }
  }

  // ---- Group breakdowns (category / region / channel) ----
  function breakdown(col, groupCol) {
    const agg = new Map(); // key -> { revenue, orders:Set }
    rows.forEach((row, i) => {
      const raw = row[groupCol];
      const key = isMissing(raw) ? '(missing)' : String(raw);
      if (!agg.has(key)) agg.set(key, { revenue: 0, orders: new Set() });
      const b = agg.get(key);
      const rev = revenueValues[i];
      if (rev !== null) b.revenue += rev;
      const id = orderIds[i];
      if (id !== null) b.orders.add(id);
    });
    return [...agg.entries()]
      .map(([key, b]) => ({
        key,
        revenue: b.revenue,
        orders: b.orders.size,
        contributionPct: totalRevenue === 0 ? 0 : (b.revenue / totalRevenue) * 100,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }
  const byCategory = breakdown(rows, categoryCol);
  const byRegion = breakdown(rows, regionCol);
  const byChannel = breakdown(rows, channelCol);

  // ---- Segment breakdown (includes per-segment AOV) ----
  const segAgg = new Map();
  rows.forEach((row, i) => {
    const raw = row[segmentCol];
    const key = isMissing(raw) ? '(missing)' : String(raw);
    if (!segAgg.has(key)) segAgg.set(key, { revenue: 0, orders: new Set() });
    const b = segAgg.get(key);
    const rev = revenueValues[i];
    if (rev !== null) b.revenue += rev;
    const id = orderIds[i];
    if (id !== null) b.orders.add(id);
  });
  const bySegment = [...segAgg.entries()]
    .map(([key, b]) => ({
      key,
      revenue: b.revenue,
      orders: b.orders.size,
      avgOrderValue: b.orders.size === 0 ? null : b.revenue / b.orders.size,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- Top products ----
  const prodAgg = new Map();
  rows.forEach((row, i) => {
    const raw = row[productCol];
    const product = isMissing(raw) ? '(missing)' : String(raw);
    if (!prodAgg.has(product)) prodAgg.set(product, { revenue: 0, quantity: 0, orders: new Set() });
    const b = prodAgg.get(product);
    const rev = revenueValues[i];
    if (rev !== null) b.revenue += rev;
    const qty = quantityValues[i];
    if (qty !== null) b.quantity += qty;
    const id = orderIds[i];
    if (id !== null) b.orders.add(id);
  });
  const topProducts = [...prodAgg.entries()]
    .map(([product, b]) => ({
      product,
      revenue: b.revenue,
      quantity: b.quantity,
      orders: b.orders.size,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ---- Completeness ----
  const kpiFieldCols = [
    ...new Set([
      orderIdCol,
      dateCol,
      revenueCol,
      quantityCol,
      categoryCol,
      regionCol,
      channelCol,
      segmentCol,
      productCol,
    ]),
  ];
  const expectedCells = rows.length * kpiFieldCols.length;
  let presentCells = 0;
  for (const row of rows) {
    for (const col of kpiFieldCols) {
      if (!isMissing(row[col])) presentCells++;
    }
  }
  const dataCompleteness = expectedCells === 0 ? 0 : round2((presentCells / expectedCells) * 100);

  // ---- Duplicates ----
  const seen = new Set();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) {
      duplicateRows++;
    } else {
      seen.add(key);
    }
  }
  const duplicateRate = rows.length === 0 ? 0 : round2((duplicateRows / rows.length) * 100);

  return {
    totalRevenue,
    revenueCells,
    invalidRevenueCells,
    totalOrders,
    distinctOrderIds,
    rowsWithMissingOrderId,
    unitsSold,
    avgOrderValue,
    aovNote,
    byMonth,
    latestMonth,
    previousMonth,
    revenueGrowthPct,
    growthNote,
    byCategory,
    byRegion,
    byChannel,
    bySegment,
    topProducts,
    dataCompleteness,
    duplicateRate,
    duplicateRows,
    grain:
      'One row = one order line item. Orders are counted as DISTINCT order_id values; a row is not assumed to be a unique order.',
    assumptions,
    warnings,
  };
}

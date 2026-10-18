/**
 * verify-cleaning.mjs — node verification for src/utils/cleaning.js.
 * Run: node scripts/verify-cleaning.mjs
 * Exercises rename, remove column, fill mean, dedupe, undo simulation,
 * plus validators and the month-name-aware date guard. Fails non-zero on
 * any assertion failure.
 */
import {
  analyzeQuality,
  removeDuplicates,
  dropRowsWithMissing,
  fillNumeric,
  trimWhitespace,
  convertColumnType,
  renameColumn,
  removeColumn,
  validateRename,
  validateRemove,
  validateFillNumeric,
  validateFillCategorical,
  validateConvertType,
} from '../src/utils/cleaning.js';

let pass = 0;
let fail = 0;
function assert(cond, name) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}
const snap = (rows) => JSON.stringify(rows);

const base = [
  { 'Order ID': 'ORD-0001', Region: 'West', Amount: 100 },
  { 'Order ID': 'ORD-0002', Region: 'East', Amount: null },
  { 'Order ID': 'ORD-0001', Region: 'West', Amount: 100 }, // dup of row 1
  { 'Order ID': 'ORD-0003', Region: 'West', Amount: 300 },
  { 'Order ID': 'ORD-0004', Region: 'North', Amount: 200 },
];
const baseSnap = snap(base);

console.log('— rename column —');
{
  const r = renameColumn(base, 'Order ID', 'order_id');
  assert(r.changed === 5, 'rename touches all 5 rows');
  assert(
    r.rows.every((row) => 'order_id' in row && !('Order ID' in row)),
    'rename swaps key in every row',
  );
  assert(r.rows[1].order_id === 'ORD-0002', 'rename preserves values');
  assert(
    Object.keys(r.rows[0]).join(',') === 'order_id,Region,Amount',
    'rename preserves key order',
  );
  assert(snap(base) === baseSnap, 'original rows untouched by rename');
}

console.log('— validateRename —');
{
  const cols = ['Order ID', 'Region', 'Amount'];
  assert(!validateRename('Order ID', '', cols).ok, 'empty name rejected');
  assert(!validateRename('Order ID', '   ', cols).ok, 'whitespace name rejected');
  assert(!validateRename('Order ID', 'Region', cols).ok, 'duplicate name rejected');
  assert(
    !validateRename('Order ID', 'region', cols).ok,
    'case-insensitive duplicate rejected',
  );
  assert(
    !validateRename('Order ID', 'Order ID', cols).ok,
    'same-as-old name rejected',
  );
  const v = validateRename('Order ID', '  order_id  ', cols);
  assert(v.ok && v.name === 'order_id', 'valid name trimmed and accepted');
}

console.log('— remove column —');
{
  const r = removeColumn(base, 'Region');
  assert(r.removed === 5, 'remove reports 5 deleted cells');
  assert(
    r.rows.every((row) => !('Region' in row)),
    'column gone from every row',
  );
  assert(r.rows[0]['Order ID'] === 'ORD-0001', 'other columns untouched');
  assert(snap(base) === baseSnap, 'original rows untouched by remove');
}

console.log('— validateRemove —');
{
  assert(!validateRemove('Region', ['Only']).ok, 'cannot remove last column');
  assert(!validateRemove('Nope', ['A', 'B']).ok, 'missing column rejected');
  assert(validateRemove('Region', ['Region', 'Amount']).ok, 'valid removal accepted');
}

console.log('— fill numeric (mean) —');
{
  const r = fillNumeric(base, 'Amount', 'mean');
  // non-missing: 100, 100, 300, 200 -> mean 175
  assert(r.value === 175, `mean computed as 175 (got ${r.value})`);
  assert(r.filled === 1, 'one cell filled');
  assert(r.rows[1].Amount === 175, 'missing cell filled with mean');
  assert(r.rows[0].Amount === 100, 'existing values untouched');
  assert(snap(base) === baseSnap, 'original rows untouched by fill');
  const med = fillNumeric(base, 'Amount', 'median');
  assert(med.value === 150, `median computed as 150 (got ${med.value})`);
}

console.log('— validateFillNumeric —');
{
  const ds = {
    columns: [
      { name: 'Amount', type: 'numeric' },
      { name: 'Region', type: 'categorical' },
    ],
    rows: base,
  };
  assert(validateFillNumeric(ds, 'Amount', 'mean').ok, 'numeric col valid');
  assert(!validateFillNumeric(ds, 'Region', 'mean').ok, 'categorical col rejected for mean fill');
  assert(!validateFillNumeric(ds, 'Missing', 'mean').ok, 'unknown column rejected');
  const dsAll = {
    columns: [{ name: 'X', type: 'numeric' }],
    rows: [{ X: null }, { X: null }],
  };
  assert(
    !validateFillNumeric(dsAll, 'X', 'mean').ok,
    'all-missing numeric col rejected',
  );
}

console.log('— validateFillCategorical / validateConvertType —');
{
  const ds = {
    columns: [{ name: 'Region', type: 'categorical' }],
    rows: base,
  };
  assert(validateFillCategorical(ds, 'Region', 'Unknown').ok, 'fill value accepted');
  assert(!validateFillCategorical(ds, 'Region', '  ').ok, 'empty fill value rejected');
  assert(!validateFillCategorical(ds, 'Nope', 'X').ok, 'unknown column rejected');
  assert(validateConvertType(ds, 'Region', 'string').ok, 'string target accepted');
  assert(!validateConvertType(ds, 'Nope', 'string').ok, 'unknown column rejected');
  assert(!validateConvertType(ds, 'Region', 'weird').ok, 'unknown target rejected');
}

console.log('— dedupe —');
{
  const r = removeDuplicates(base);
  assert(r.removed === 1, 'one duplicate removed');
  assert(r.rows.length === 4, '4 rows remain');
  assert(snap(base) === baseSnap, 'original rows untouched by dedupe');
}

console.log('— undo simulation (snapshot before apply) —');
{
  const beforeApply = base; // pre-step reference; pure ops never mutate it
  const applied = fillNumeric(beforeApply, 'Amount', 'mean').rows;
  assert(applied !== beforeApply, 'apply produces a new rows array');
  assert(applied[1].Amount === 175, 'applied result has filled value');
  const reverted = beforeApply; // revert = restore the pre-step reference
  assert(snap(reverted) === baseSnap, 'revert restores pre-step data exactly');
  assert(reverted[1].Amount === null, 'reverted cell is missing again');
}

console.log('— month-name-aware date guard —');
{
  const rows = [
    { d: 'ORD-0001' },
    { d: '2024-01-15' },
    { d: '12 Jan 2025' },
    { d: 'not a date' },
  ];
  const r = convertColumnType(rows, 'd', 'date');
  assert(r.rows[0].d === 'ORD-0001', 'ORD-0001 NOT converted (ID guard)');
  assert(r.rows[1].d === '2024-01-15', 'ISO date converted');
  assert(r.rows[2].d === '2025-01-12', 'month-name date converted');
  assert(r.rows[3].d === 'not a date', 'non-date left unchanged');
  assert(r.converted === 2 && r.failed === 2, 'converted/failed counts correct');

  const ds = {
    columns: [{ name: 'Order ID', type: 'categorical' }],
    rows: base.map((r) => ({ 'Order ID': r['Order ID'] })),
  };
  const q = analyzeQuality(ds);
  assert(
    !q.possibleDateColumns.includes('Order ID'),
    'ORD-0001 column NOT flagged as possible date',
  );
  const dsDates = {
    columns: [{ name: 'd', type: 'categorical' }],
    rows: [{ d: '2024-01-15' }, { d: '2025-01-12' }, { d: '12 Jan 2025' }, { d: '2023-06-01' }],
  };
  assert(
    analyzeQuality(dsDates).possibleDateColumns.includes('d'),
    'real date column still detected',
  );
}

console.log('— trim + drop-missing + analyzeQuality sanity —');
{
  const t = trimWhitespace([{ a: '  hi  ' }, { a: 'ok' }]);
  assert(t.changed === 1 && t.rows[0].a === 'hi', 'trim works');
  const d = dropRowsWithMissing(base, ['Amount']);
  assert(d.removed === 1 && d.rows.length === 4, 'drop-missing works');
  const ds = {
    columns: [
      { name: 'Order ID', type: 'categorical' },
      { name: 'Region', type: 'categorical' },
      { name: 'Amount', type: 'numeric' },
    ],
    rows: base,
  };
  const q = analyzeQuality(ds);
  assert(q.duplicateRows === 1, 'quality: 1 duplicate found');
  assert(
    q.missingByColumn.find((m) => m.column === 'Amount').missing === 1,
    'quality: missing count by column',
  );
  assert(q.outliers.length === 0, 'quality: no outliers in tiny set');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

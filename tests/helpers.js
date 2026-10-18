// Shared fixtures for the DataPilot test suite.
import { buildDataset } from '../src/utils/dataTypes.js';

/** Rows used by most chart/NLQ/insight fixtures. */
export function sampleRows() {
  return [
    { region: 'North', product: 'Widget', revenue: 100, quantity: 2, order_date: '2024-01-05' },
    { region: 'South', product: 'Gadget', revenue: 200, quantity: 4, order_date: '2024-01-12' },
    { region: 'North', product: 'Widget', revenue: 150, quantity: 3, order_date: '2024-02-03' },
    { region: 'East', product: 'Gizmo', revenue: 300, quantity: 5, order_date: '2024-02-20' },
    { region: 'South', product: 'Widget', revenue: 120, quantity: 1, order_date: '2024-03-08' },
  ];
}

/** Canonical dataset with properly typed columns. */
export function sampleDataset(name = 'sample') {
  return buildDataset(name, sampleRows());
}

/** A date-ordered dataset spanning three months (for trend/insights tests). */
export function monthlyDataset() {
  const rows = [];
  for (let m = 1; m <= 6; m++) {
    const mm = String(m).padStart(2, '0');
    rows.push({ region: 'North', revenue: m * 100, order_date: `2024-${mm}-15` });
    rows.push({ region: 'South', revenue: m * 50, order_date: `2024-${mm}-20` });
  }
  return buildDataset('monthly', rows);
}

/** Columns fixture for chartData when exact types are needed. */
export function typedDataset(columns, rows) {
  return { name: 'typed', columns, rows };
}

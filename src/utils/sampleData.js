// Deterministic sample data generator for DataPilot Analytics.
// Plain JS (no JSX) so it can run in Node too.

import { buildDataset } from './dataTypes.js';

// mulberry32 seeded PRNG — deterministic across runs
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
  Electronics: {
    products: ['Smartphone', 'Laptop', 'Headphones', 'Tablet'],
    priceRange: [25, 1200],
  },
  Clothing: {
    products: ['T-Shirt', 'Jeans', 'Jacket', 'Sneakers'],
    priceRange: [10, 150],
  },
  'Home & Kitchen': {
    products: ['Blender', 'Coffee Maker', 'Cookware Set', 'Lamp'],
    priceRange: [15, 300],
  },
  Sports: {
    products: ['Yoga Mat', 'Dumbbells', 'Tennis Racket', 'Bicycle'],
    priceRange: [12, 500],
  },
  Books: {
    products: ['Fiction Novel', 'Textbook', 'Cookbook', 'Biography'],
    priceRange: [8, 60],
  },
};

const REGIONS = ['North', 'South', 'East', 'West'];
const CHANNELS = ['Online', 'Retail', 'Wholesale'];
const SEGMENTS = ['Consumer', 'Corporate', 'Home Office'];
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n) => Math.round(n * 100) / 100;

/** Generate ~1500 deterministic e-commerce rows for 2025. */
export function generateSampleData() {
  const rand = mulberry32(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const start = Date.UTC(2025, 0, 1);

  const catNames = Object.keys(CATEGORIES);
  const rows = [];
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const category = pick(catNames);
    const { products, priceRange } = CATEGORIES[category];
    const quantity = 1 + Math.floor(rand() * 5);
    const unit_price = round2(
      priceRange[0] + rand() * (priceRange[1] - priceRange[0])
    );
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

  return buildDataset('Sample E-commerce Dataset', rows, {
    source: 'sample',
    note: 'Sample data generated locally for demonstration',
  });
}

export const SAMPLE_SCHEMA = [
  {
    table: 'orders',
    description: 'E-commerce orders',
    columns: [
      { name: 'order_id', type: 'string', description: 'Unique order ID' },
      { name: 'order_date', type: 'date', description: 'Date the order was placed' },
      { name: 'region', type: 'string', description: 'Sales region (North/South/East/West)' },
      { name: 'category', type: 'string', description: 'Product category' },
      { name: 'product', type: 'string', description: 'Product name' },
      { name: 'quantity', type: 'number', description: 'Units ordered' },
      { name: 'unit_price', type: 'number', description: 'Price per unit (USD)' },
      { name: 'revenue', type: 'number', description: 'Total order revenue (USD)' },
      { name: 'channel', type: 'string', description: 'Sales channel' },
      { name: 'customer_segment', type: 'string', description: 'Customer segment' },
    ],
  },
];

# Performance Benchmarks — DataPilot Analytics

Measured 2026-10-18. These are actual wall-clock timings from
`scripts/benchmark.mjs` (kept out of the vitest suite), run with:

```bash
node --import ./scripts/register-esm-hook.mjs scripts/benchmark.mjs
```

## Hardware / environment

- CPU: AMD EPYC 9D25 126-Core Processor (shared VM)
- Memory: ~8 GB total
- Node.js: v24.20.0 (single-threaded aggregation)
- Data: synthetic datasets generated with the same pattern as
  `src/utils/sampleData.js` (mulberry32 PRNG, seed 1337)

## Results

Each timing is the mean of 5 iterations after 1 warmup, in milliseconds.
Two runs were averaged to smooth JIT/GC noise; variance between runs was
±1–10 ms on the heavier cases, which is expected on a shared VM.

| Rows | KPI aggregations¹ | describeColumn (3 numeric cols)² | buildChartData (bar)³ | Data generation⁴ |
|---|---|---|---|---|
| 1,500 | **~0.7 ms** | **~4.6 ms** | **~0.8 ms** | ~35 ms |
| 10,000 | **~3.6 ms** | **~22 ms** | **~2.8 ms** | ~75 ms |
| 50,000 | **~16 ms** | **~111 ms** | **~7.6 ms** | ~324 ms |

¹ Totals + monthly buckets + per-category/region/channel/segment aggregations
  (mirrors the app's KPI contract semantics).
² Full descriptive statistics (min/max/mean/median/quartiles/std) over
  `revenue`, `quantity`, `unit_price`.
³ App's own `buildChartData()` for a bar chart: `category × SUM(revenue)`.
⁴ Synthetic row generation (not an app operation; included for context).

## What this shows

- Core aggregations are **sub-millisecond to a few ms** at the sample
  dataset's scale (1,500 rows) — instant in the UI.
- Even at 50,000 rows, the heaviest measured operation (descriptive stats
  over three numeric columns) completes in ~0.1 s, so the app's client-side
  analytics remain responsive well beyond typical demo dataset sizes.
- Data generation and parse are the one-off costs; aggregation itself scales
  roughly linearly.

## No-promises disclaimer

These numbers are from one shared cloud VM on one day and describe the
compute cost of the aggregation functions only. They say nothing about
render time in the browser (React/Recharts), CSV parsing of real files,
device performance on phones, or how the app behaves with your dataset.
Treat them as a rough scale indicator, not a guarantee. Re-run
`scripts/benchmark.mjs` on your own machine for numbers that reflect your
environment.

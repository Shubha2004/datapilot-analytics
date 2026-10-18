# DataPilot Analytics

**Browser-only self-service analytics. 100% client-side — no backend, no API keys, no accounts.**

DataPilot Analytics is a self-service business-intelligence web app that runs entirely in the browser. Upload a CSV, Excel, or JSON file (or load the built-in sample dataset), and immediately get KPI dashboards, natural-language querying, a no-code chart builder, data-quality tooling, statistics, rule-based insights, and printable reports — with your data never leaving your machine.

- 🌐 **Live demo:** <https://shubha2004.github.io/datapilot-analytics/>
- 💻 **Repository:** <https://github.com/Shubha2004/datapilot-analytics>

---

## Features

### ✅ Implemented

- **Dataset import** — drag-and-drop CSV (Papa Parse), Excel `.xls`/`.xlsx` (SheetJS), and JSON. Hard limit 100 MB with a "may be slow" warning past 25 MB. The importer validates extension/size, sniffs file content against the extension (catches misnamed files), cleans headers (blank/duplicate headers renamed), pads or truncates ragged rows, flattens one level of nested JSON, and returns a plain-language **import report** describing every fix it applied. One-click built-in sample e-commerce dataset (1,500 deterministic rows, 2025, clearly labeled SAMPLE DATA).
- **Database connectors (mock)** — PostgreSQL, Snowflake, and BigQuery connector cards. These are **mock**: they load the sample dataset locally. No credentials are ever entered or sent anywhere.
- **Overview dashboard** — KPI metric cards (row count, revenue totals, averages, top category/region), dataset summary, column-type breakdown, missing-value chart, numeric distribution, category frequency, and auto-generated insight cards.
- **Natural-language query bar** — ask questions in plain English ("Show monthly revenue by region", "Top 5 products by revenue"). The **rule-based** parser resolves metrics and dimensions against your actual columns (synonym-aware, plural/fuzzy tolerant), asks a clarification question instead of guessing when ambiguous, and returns a chart plus an illustrative read-only SQL statement and a plain-English interpretation of what was computed. 12 built-in example queries with click-to-try.
- **Chart builder** — no-code chart builder with **9 chart types**: bar, horizontal bar, line, area, pie, donut, scatter, histogram, box plot. Aggregations (sum/avg/count/min/max), series grouping, sorting, and filters; inline config validation; suggested starter charts; saved charts with rename/delete; one-click PNG export per chart.
- **Dataset explorer** — full data table with global search, per-column filters, sorting, pagination, column show/hide, and CSV export of the current view (TanStack Table v8).
- **Data quality + cleaning** — automated quality findings (duplicate rows, missing values, invalid numerics, IQR outliers, inconsistent categories, single-value columns, date-like columns). Cleaning operations with dry-run preview and confirm: remove duplicates, drop rows with missing values, fill numeric (mean/median), fill categorical, rename/remove columns, trim whitespace, convert column type. **Undo** supported; cleaning utilities are pure functions (inputs never mutated); transformation history with revert-to-here.
- **Statistics** — per-column descriptives (mean, median, mode, std dev, min/max, quartiles), Pearson correlation matrix with heatmap, 95% confidence intervals for the mean, one-sample t-test, histograms, linear trend estimation. Sample vs population variance is labeled; every function is null-safe (insufficient data → `null`, never `NaN`); assumptions are documented in the results.
- **Insights engine (rule-based, not AI)** — deterministic auto-generated insights (top category, trend direction, strong correlations, outliers, missing data) capped at 8 per dataset, with info/warning/success severity. Correlations are reported with an explicit "does not imply causation" note.
- **Reports** — assemble a report from dataset metadata, statistics, quality findings, and saved charts; export full dataset as CSV, any chart as PNG, or browser print → Save as PDF (dedicated print stylesheet).
- **CSV export safety** — exported cells starting with `=`, `+`, `-`, `@` (or tab/CR) are prefixed with a single quote so spreadsheet apps treat them as text (formula-injection defence); plain numeric literals (including negatives) are left untouched.
- **Dark / light theme** — class-based dark mode (Tailwind v4 `@custom-variant dark`), persisted in localStorage; default dark.
- **Persistence** — IndexedDB (`idb`) for saved charts and optionally the full dataset (**opt-in** toggle, off by default); localStorage for theme and preferences. Every write returns `{ ok, error }` (`'quota'` or `'unavailable'`) so a failed save is never silently treated as success. "Clear local data" wipes it all with confirmation.
- **SQL example library** — `analysis/sql/` (9 PostgreSQL files covering basics, CASE WHEN, CTEs, contribution, window ranks, LAG/LEAD MoM, duplicates, data quality) with an honest note that the app does not execute SQL; validated against the sample dataset.

### 🚧 Planned (not yet built)

- Real (credentialed) database connectors replacing the mock cards
- More NLQ example templates and additional chart suggestions
- Shareable report links (currently reports are local/export-based)

---

## Screenshots

> 📸 **To be added.** Capture these from the live demo and place them in `docs/screenshots/`:
>
> 1. `dashboard-dark.png` — Overview dashboard in dark mode (default)
> 2. `dashboard-light.png` — Overview dashboard in light mode
> 3. `chart-builder.png` — Chart builder with a bar chart of revenue by category
> 4. `data-quality.png` — Data Quality page showing the scan results
> 5. `nlq.png` — NLQ bar answering "Top 5 products by revenue" (chart + SQL)
>
> Then reference them here as `![Dashboard (dark)](docs/screenshots/dashboard-dark.png)` etc.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework (do not upgrade major) |
| React DOM | 18.3.1 | Rendering |
| Vite | ^8.3.0 | Build tool / dev server |
| @vitejs/plugin-react | ^6.1.1 | React Fast Refresh for Vite |
| Tailwind CSS | ^4.3.3 | Utility-first styling (v4, CSS-first config) |
| @tailwindcss/vite | ^4.3.3 | Tailwind Vite plugin |
| Recharts | ^2.15.4 | Charting library |
| @tanstack/react-table | ^8.21.3 | Data explorer table (sorting/filter/pagination) |
| Papa Parse | ^5.7.0 | CSV parsing |
| xlsx (SheetJS) | ^0.18.5 | Excel import |
| idb | ^8.0.4 | Promise wrapper for IndexedDB persistence |
| lucide-react | ^1.59.0 | Icons |
| oxlint | ^1.81.0 | Fast linting (`npm run lint`) |
| vitest | ^5.0.5 | Unit tests (`npm test`) — dev only |
| jsdom | ^30.1.3 | DOM environment for tests — dev only |

## Architecture

```
datapilot-analytics/
├── src/
│   ├── App.jsx                 # App shell, page routing, layout
│   ├── main.jsx                # Entry point, DataProvider mount
│   ├── index.css               # Tailwind v4 import + @custom-variant dark
│   ├── context/DataContext.jsx # Global state: dataset, theme, charts, prefs
│   ├── components/             # ChartRenderer, DataTable, FileUploader,
│   │                           # ConnectorModal, NLQBar, DataQualityPanel,
│   │                           # Header, Sidebar, MetricCard, InsightCard, ...
│   ├── pages/                  # Dashboard, DatasetExplorer, DataQuality,
│   │                           # ChartBuilder, Statistics, Reports, Settings
│   └── utils/                  # Pure, testable logic (no DOM except
│                               # exportUtils/storage):
│                               # parsers, dataTypes, chartData, nlq, kpis,
│                               # cleaning, statistics, insights,
│                               # exportUtils, sampleData, storage
├── tests/                      # Vitest suite (266 tests — see Testing)
├── analysis/sql/               # PostgreSQL example queries + README
├── scripts/                    # compute-case-study.mjs, benchmark.mjs,
│                               # validate-sql.mjs (node scripts, not tested)
├── docs/                       # CASE-STUDY.md, PORTFOLIO.md, PERFORMANCE.md,
│                               # PRD.md, TESTING-CHECKLIST.md,
│                               # ai-agent-system-prompt.md
├── .github/workflows/ci.yml    # CI config — see note below (local only)
├── public/sample-ecommerce.csv # Downloadable sample dataset
├── vite.config.js              # base: './' — build works from any path
├── vitest.config.js            # Test config (separate from build config)
└── package.json
```

All business logic lives in `src/utils/` as pure functions so it can be unit-tested without a browser. The `tests/` directory mirrors it.

## Sample Dataset — Schema & Business Assumptions

The built-in **synthetic** sample dataset (1,500 rows, order dates across 2025,
deterministically generated with seed 42) has these columns:

| Column | Type | Description |
|---|---|---|
| `order_id` | TEXT | Unique order ID, e.g. `ORD-0001` |
| `order_date` | DATE | `YYYY-MM-DD`, spread across 2025 |
| `region` | TEXT | North / South / East / West |
| `category` | TEXT | Electronics / Clothing / Home & Kitchen / Sports / Books |
| `product` | TEXT | Product name within the category |
| `quantity` | INT | 1–5 units |
| `unit_price` | NUMERIC | Price per unit (USD) |
| `revenue` | NUMERIC | `quantity × unit_price` (USD) |
| `channel` | TEXT | Online / Retail / Wholesale |
| `customer_segment` | TEXT | Consumer / Corporate / Home Office |

**Grain:** one row = one order line item. **Orders = distinct `order_id`**
(1,500 rows = 1,500 orders in the sample). **Average order value = total
revenue ÷ distinct orders.** The dataset is clearly labeled SYNTHETIC /
SAMPLE DATA wherever it appears in the app; it demonstrates the workflow but
supports no real business conclusions.

## Case Study — Real Computed Findings (synthetic data)

Full analysis: [`docs/CASE-STUDY.md`](docs/CASE-STUDY.md). All figures computed
with `scripts/compute-case-study.mjs` against the app's own sample-data
generator and cross-checked with the app's KPI module.

| Finding | Number |
|---|---|
| Total revenue (2025) | **$1,066,210.23** |
| Orders / units / AOV | 1,500 / 4,473 / **$710.81** |
| Top category | **Electronics — $594,758.43 (55.78%)** |
| Best / worst region | South $277,223.94 (26.00%) / West $245,299.97 (23.01%) |
| Latest month (Dec 2025) | **$102,133.93, +3.86% MoM** vs Nov |
| Sharpest MoM move | Mar 2025 −44.44% → Apr +24.27% |
| Channels | Effectively tied: Online 33.37% / Retail 33.34% / Wholesale 33.29% |
| Highest-AOV segment | Corporate $732.33 vs Consumer $677.52 |
| Data quality | 100% completeness, 0% duplicates, 0 revenue-arithmetic mismatches |

Recommendations in the case study are labeled **hypotheses** — no causation claims.

## SQL Analysis

`analysis/sql/` contains 9 commented PostgreSQL 14+ query files over the
`orders` table — SELECT/WHERE/GROUP BY/HAVING, CASE WHEN, CTEs, revenue
contribution, window ranks, LAG-based MoM growth, LEAD, duplicate detection,
and data-quality checks. See [`analysis/sql/README.md`](analysis/sql/README.md)
for the schema and loading notes. Key results were validated to match the
app's computed KPIs exactly (total revenue $1,066,210.23, Electronics 55.78%,
Dec 2025 +3.86% MoM). **Honest note:** the app does not execute SQL — the NLQ
bar shows illustrative read-only SQL previews of what it computes client-side.

## Performance

Benchmarked 2026-10-18 — see [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) for
methodology, hardware, and the no-promises disclaimer.

| Rows | KPI aggregations | Descriptive stats (3 numeric cols) | Chart aggregation |
|---|---|---|---|
| 1,500 | ~0.7 ms | ~4.6 ms | ~0.8 ms |
| 10,000 | ~3.6 ms | ~22 ms | ~2.8 ms |
| 50,000 | ~16 ms | ~111 ms | ~7.6 ms |

Re-run with `node --import ./scripts/register-esm-hook.mjs scripts/benchmark.mjs`.

## Local Install (Windows PowerShell)

### 1. Install Node.js LTS

```powershell
winget install OpenJS.NodeJS.LTS
```

Or download the LTS installer from [nodejs.org](https://nodejs.org). Then verify (restart the terminal first if it was open during install):

```powershell
node --version   # v20.x or later
npm --version
```

### 2. Clone and install

```powershell
git clone https://github.com/Shubha2004/datapilot-analytics.git
cd datapilot-analytics
npm install
```

### 3. Tailwind CSS v4 notes

This repo uses **Tailwind v4** — there is **no `tailwind.config.js`**. Configuration is CSS-first:

- `src/index.css` starts with `@import "tailwindcss";`
- Dark mode uses class strategy via `@custom-variant dark (&:where(.dark, .dark *));` — the app toggles the `dark` class on `<html>`.
- The Vite plugin is registered in `vite.config.js`: `plugins: [react(), tailwindcss()]` where `tailwindcss` comes from `@tailwindcss/vite`.

## Commands

```powershell
npm run dev      # local dev server (Vite prints the http://localhost URL)
npm run build    # production build -> dist/
npm run preview  # serve the production build locally to verify
npm test         # vitest suite (266 tests, all must pass — measured 2026-10-18)
npm run lint     # oxlint (fails on errors; warnings are fine)
```

## Testing

Run `npm test` (vitest). **Measured 2026-10-18: 266 tests across 13 test files — all passed**.

| Test file | Tests | Covers |
|---|---|---|
| statistics.test.js | 32 | descriptives, correlation, CI, t-test, histogram, trend |
| parsers.test.js | 31 | CSV/Excel/JSON import, validation, import report |
| chartData.test.js | 30 | aggregation, config validation, chart builders |
| kpis.test.js | 30 | KPI module |
| cleaning.test.js | 33 | cleaning ops, undo, history |
| importValidation.test.js | 19 | magic-byte sniffing, header repair, size limits |
| insights.test.js | 17 | rule-based insights |
| nlq.test.js | 14 | NLQ parsing, clarification, SQL preview |
| dataTypes.test.js | 14 | type helpers |
| exportUtils.test.js | 12 | CSV export, formula-injection sanitiser |
| storage.test.js | 11 | IndexedDB/localStorage persistence |
| sampleData.test.js | 6 | sample dataset determinism |

Node helper scripts (`scripts/compute-case-study.mjs`, `scripts/benchmark.mjs`,
`scripts/validate-sql.mjs`) are deliberately **not** part of the vitest suite.

## Deployment (GitHub Pages)

`vite.config.js` sets `base: './'`, so the built app uses relative asset paths and works from any sub-path.

**Deploy from the `gh-pages` branch:**

```powershell
npm install -D gh-pages
```

Add to `package.json` scripts:

```json
"predeploy": "npm run build",
"deploy": "gh-pages -d dist"
```

Then:

```powershell
npm run deploy
```

In the repo: Settings → Pages → Deploy from a branch → select the `gh-pages` branch.

**Note on CI:** a CI workflow exists at `.github/workflows/ci.yml`
(`npm ci` → `npm test` → `npm run lint` → `npm run build`). It is currently
**local only** — the GitHub OAuth App scope used for pushes does not allow
uploading workflow files, so `ci.yml` must be added via the GitHub web UI
(Settings → Actions or the file editor). Honest manual step, not automated.

## Limitations (honest)

- **No real AI.** The NLQ bar and insights engine are deterministic rule-based parsers, not LLMs. They only understand questions that map onto your dataset's columns; anything else gets a clarification question or an explanatory error — never invented data.
- **Connectors are mock.** The PostgreSQL/Snowflake/BigQuery cards do not connect to anything; they load local sample data.
- **Statistics are approximations.** Confidence intervals use the normal approximation (CLT); the t-test p-value is approximate. Assumptions are documented in the results themselves.
- **Browser-scale only.** Everything runs in one tab: very large files are capped at 100 MB, and parsing/rendering multi-million-row files will be slow or may exhaust tab memory. There is no server to offload to.
- **Storage can fail.** Private/incognito windows may disable IndexedDB/localStorage; the app keeps working in-session and surfaces a clear error instead of pretending the save worked.
- **Sample data is synthetic.** The built-in 1,500-row dataset is generated deterministically in code for demonstration; it is labeled as sample data wherever it appears.
- **CI workflow is local-only** until added via the GitHub web UI (see above).

## Privacy

DataPilot Analytics is 100% client-side:

- **No network calls for your data.** Uploaded files are parsed in the browser with Papa Parse / SheetJS; nothing is sent to any server (the app has no backend to send to).
- **Storage is local and mostly opt-in.** Theme and UI preferences live in localStorage. Saving charts uses IndexedDB. Persisting the *full dataset* in IndexedDB is behind an explicit opt-in toggle (off by default).
- **Honest failure reporting.** Storage writes return `{ ok, error }` — a quota or private-mode failure is surfaced to you, never silently swallowed.
- **Clearable.** Settings → Clear local data wipes IndexedDB and localStorage entries for the app. Closing the tab without persistence enabled leaves nothing behind.

## Demo Workflow (sample dataset)

1. Open the [live demo](https://shubha2004.github.io/datapilot-analytics/) (or `npm run dev` locally).
2. On the upload screen, click **Load sample data** — this loads the 1,500-row synthetic e-commerce dataset (2025, labeled SAMPLE DATA; nothing is uploaded anywhere).
3. **Overview**: check the KPI cards, column-type breakdown, and auto-generated insights.
4. **Ask**: in the NLQ bar, try the example chips — "Show monthly revenue by region", "Top 5 products by revenue", "Count of orders per month". Each answer shows the chart, the illustrative SQL, and a plain-English interpretation.
5. **Chart builder**: create a bar chart of total revenue by category, add a region series, then export it as PNG.
6. **Data quality**: run the quality scan, preview a cleaning operation (e.g. trim whitespace), apply it, then Undo.
7. **Statistics**: open the correlation matrix and the revenue histogram.
8. **Reports**: assemble a report and use browser print → Save as PDF.
9. **Settings**: toggle dataset persistence (IndexedDB, opt-in) and try Clear local data.

## Troubleshooting

- **Tailwind v4 vs v3:** Do not create a `tailwind.config.js` — v4 ignores it. All customization goes in CSS (`@import "tailwindcss"`, `@custom-variant`, `@theme`). If styles are missing, confirm the `@tailwindcss/vite` plugin is in `vite.config.js` and `src/index.css` is imported by `src/main.jsx`.
- **lucide-react icon renames (v1.x):** some classic names changed — e.g. `BarChart3` → `ChartColumn`. If a build fails with an unexported icon name, check the installed lucide-react exports and update the import (this repo already uses the current names).
- **Large files:** uploads are capped at 100 MB (`MAX_FILE_SIZE` in `src/utils/parsers.js`) with a slowdown warning past 25 MB. For very large spreadsheets, split the file or convert to CSV first.
- **IndexedDB unavailable in private mode:** some browsers disable storage in private/incognito windows. The app keeps working in-session and reports `{ ok: false, error: 'unavailable' }` instead of silently dropping the save.
- **`base: './'` matters:** without it, built asset URLs are absolute (`/assets/...`) and the app breaks when served from a sub-path (GitHub Pages project sites, Cloudflare preview URLs). Keep `base: './'` in `vite.config.js`.

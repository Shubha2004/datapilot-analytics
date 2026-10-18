# DataPilot Analytics

**Browser-only self-service analytics. 100% client-side — no backend, no API keys, no accounts.**

DataPilot Analytics is a self-service business-intelligence web app that runs entirely in the browser. Upload a CSV, Excel, or JSON file (or load the built-in sample dataset), and immediately get KPIs, natural-language querying, chart building, data-quality tooling, statistics, auto-generated insights, and shareable reports — with your data never leaving your machine.

Live demo: <https://shubha2004.github.io/datapilot-analytics/>

---

## Features

- **Dataset import** — drag-and-drop CSV (Papa Parse), Excel `.xls`/`.xlsx` (SheetJS), and JSON. Hard limit 100 MB with a "may be slow" warning past 25 MB. The importer validates extension/size, sniffs file content against the extension (catches misnamed files), cleans headers (blank/duplicate headers are renamed), pads or truncates ragged rows, flattens one level of nested JSON, and returns a plain-language **import report** describing every fix it applied. One-click built-in sample e-commerce dataset (1,500 deterministic rows, 2025, clearly labeled SAMPLE DATA).
- **Mock database connectors** — PostgreSQL, Snowflake, and BigQuery connector cards. These are **mock**: they load the sample dataset locally. No credentials are ever entered or sent anywhere.
- **Overview dashboard** — KPI metric cards (row count, revenue totals, averages, top category/region), dataset summary, column-type breakdown, missing-value chart, numeric distribution, category frequency, and auto-generated insight cards.
- **Natural-language query bar** — ask questions in plain English ("Show monthly revenue by region", "Top 5 products by revenue"). The **rule-based** parser resolves metrics and dimensions against your actual columns (synonym-aware, plural/fuzzy tolerant), asks a clarification question instead of guessing when ambiguous, and returns a chart plus an illustrative read-only SQL statement and a plain-English interpretation of what was computed. 12 built-in example queries with click-to-try.
- **Chart builder** — no-code visual chart builder with **9 chart types**: bar, horizontal bar, line, area, pie, donut, scatter, histogram, and box plot. Aggregations (sum/avg/count/min/max), series grouping, sorting, and filters; inline config validation; suggested starter charts; saved charts with rename/delete; one-click PNG export per chart.
- **Dataset explorer** — full data table with global search, per-column filters, sorting, pagination, column show/hide, and CSV export of the current view (powered by TanStack Table).
- **Data quality + cleaning** — automated quality findings (duplicate rows, missing values, invalid numerics, IQR outliers, inconsistent categories, single-value columns, date-like columns). Cleaning operations with dry-run preview and confirm: remove duplicates, drop rows with missing values, fill numeric (mean/median), fill categorical, rename/remove columns, trim whitespace, convert column type. **Undo** is supported; cleaning utilities are pure functions (inputs are never mutated).
- **Statistics** — per-column descriptives (mean, median, mode, std dev, min/max, quartiles), Pearson correlation matrix with heatmap, 95% confidence intervals for the mean, one-sample t-test, histograms, and linear trend estimation. Every function is null-safe (insufficient data → `null`, never `NaN`).
- **Insights engine** — rule-based auto-generated insights (top category, trend direction, strong correlations, outliers, missing data) capped at 8 per dataset, with info/warning/success severity. Correlations are reported with an explicit "does not imply causation" note.
- **Reports** — assemble a report from dataset metadata, statistics, quality findings, and saved charts; export full dataset as CSV, export any chart as PNG, or use browser print → Save as PDF (dedicated print stylesheet).
- **CSV export safety** — exported cells starting with `=`, `+`, `-`, `@` (or tab/CR) are prefixed with a single quote so spreadsheet apps treat them as text (formula-injection defence); plain numeric literals (including negatives) are left untouched so numbers stay numeric.
- **Dark / light theme** — class-based dark mode (Tailwind v4 `@custom-variant dark`), persisted in localStorage; default dark.
- **Persistence** — IndexedDB (`idb`) for saved charts and optionally the full dataset (**opt-in** toggle, off by default); localStorage for theme and preferences. Every write returns an `{ ok, error }` result (`error` is `'quota'` or `'unavailable'`) so a failed save is never silently treated as success. "Clear local data" wipes it all with confirmation.

## Limitations (honest)

- **No real AI.** The NLQ bar and insights engine are deterministic rule-based parsers, not LLMs. They only understand questions that map onto your dataset's columns; anything else gets a clarification question or an explanatory error — never invented data.
- **Connectors are mock.** The PostgreSQL/Snowflake/BigQuery cards do not connect to anything; they load local sample data.
- **Statistics are approximations.** Confidence intervals use the normal approximation (CLT); the t-test p-value is approximate. Assumptions are documented in the results themselves.
- **Browser-scale only.** Everything runs in one tab: very large files are capped at 100 MB, and parsing/rendering multi-million-row files will be slow or may exhaust tab memory. There is no server to offload to.
- **Storage can fail.** Private/incognito windows may disable IndexedDB/localStorage; the app keeps working in-session and surfaces a clear error instead of pretending the save worked.
- **Sample data is synthetic.** The built-in 1,500-row dataset is generated deterministically in code for demonstration; it is labeled as sample data wherever it appears.

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
│   ├── pages/                  # Dashboard (overview), DatasetExplorer,
│   │                           # DataQuality, ChartBuilder, Statistics,
│   │                           # Reports, Settings
│   └── utils/                  # Pure, testable logic (no DOM except
│                               # exportUtils/storage):
│                               # parsers, dataTypes, chartData, nlq,
│                               # cleaning, statistics, insights,
│                               # exportUtils, sampleData, storage
├── tests/                      # Vitest suite (214 tests, pure-node + jsdom)
├── .github/workflows/ci.yml    # CI: npm ci → test → lint → build
├── public/sample-ecommerce.csv # Downloadable sample dataset
├── vite.config.js              # base: './' — build works from any path
├── vitest.config.js            # Test config (separate from build config)
└── package.json
```

All business logic lives in `src/utils/` as pure functions so it can be unit-tested without a browser. The `tests/` directory mirrors it (`dataTypes`, `parsers`, `cleaning`, `statistics`, `chartData`, `nlq`, `storage`, `exportUtils`, `insights`, `sampleData`).

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
npm test         # vitest suite (214 tests, all must pass)
npm run lint     # oxlint (fails on errors; warnings are fine)
```

## Deployment (GitHub Pages)

`vite.config.js` sets `base: './'`, so the built app uses relative asset paths and works from any sub-path (required for `https://<user>.github.io/<repo>/`).

**Option A — `gh-pages` branch:**

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

**Option B — GitHub Actions (recommended):** create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then in the repo: Settings → Pages → Source → **GitHub Actions**. Push to `main` to deploy.

A separate CI workflow (`.github/workflows/ci.yml`) already runs on every push/PR to `main`: `npm ci` → `npm test` → `npm run lint` → `npm run build`.

## Demo Workflow (sample dataset)

1. `npm run dev` and open the printed localhost URL.
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

## Privacy

DataPilot Analytics is 100% client-side:

- **No network calls for your data.** Uploaded files are parsed in the browser with Papa Parse / SheetJS; nothing is sent to any server (the app has no backend to send to).
- **Storage is local and mostly opt-in.** Theme and UI preferences live in localStorage. Saving charts uses IndexedDB. Persisting the *full dataset* in IndexedDB is behind an explicit opt-in toggle (off by default).
- **Honest failure reporting.** Storage writes return `{ ok, error }` — a quota or private-mode failure is surfaced to you, never silently swallowed.
- **Clearable.** Settings → Clear local data wipes IndexedDB and localStorage entries for the app. Closing the tab without persistence enabled leaves nothing behind.

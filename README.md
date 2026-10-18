# DataPilot Analytics

**Browser-only self-service analytics. 100% client-side — no backend, no API keys, no accounts.**

DataPilot Analytics is a self-service business-intelligence web app that runs entirely in the browser. Upload a CSV, Excel, or JSON file (or connect a mock data-source connector), and immediately get KPIs, natural-language querying, chart building, data-quality tooling, statistics, auto-generated insights, and shareable reports — with your data never leaving your machine.

---

## Features

- **Dataset upload** — drag-and-drop CSV (parsed with Papa Parse), Excel `.xls`/`.xlsx` (SheetJS), and JSON; max 50 MB. One-click built-in sample e-commerce dataset (1,500 deterministic rows, 2025).
- **Mock database connectors** — PostgreSQL, Snowflake, and BigQuery connector cards (mock: they load the sample dataset locally; no credentials ever entered).
- **Overview dashboard** — KPI metric cards (row count, revenue totals, averages, top category/region), dataset summary, column-type breakdown, missing-value chart, numeric distribution, category frequency, and auto-generated insight cards.
- **Natural-language query bar** — ask questions in plain English ("Show monthly revenue by region", "Top 5 products by revenue"); the rule-based parser maps metrics, time grains, dimensions, and top-N into a chart plus an illustrative read-only SQL statement. 12 built-in example queries with click-to-try.
- **Chart builder** — no-code visual chart builder with **9 chart types**: bar, horizontal bar, line, area, pie, donut, scatter, histogram, and box plot. Aggregations (sum/avg/count/min/max), series grouping, sorting, and filters; inline config validation; suggested starter charts; saved charts with rename/delete; one-click PNG export per chart.
- **Dataset explorer** — full data table with global search, per-column filters, sorting, pagination, column show/hide, and CSV export of the current view (powered by TanStack Table).
- **Data quality + cleaning** — automated quality findings (duplicates, missing values, type mismatches, whitespace, outliers); cleaning operations with dry-run preview and confirm: remove duplicates, drop rows with missing values, fill numeric (mean/median/mode), fill categorical, trim whitespace, convert column type. **One-click Undo** restores the dataset to its original imported state.
- **Statistics** — per-column descriptives (mean, median, mode, std dev, min/max, quartiles), Pearson correlation matrix with heatmap, 95% confidence intervals for the mean, one-sample t-test, histograms, and linear trend estimation.
- **Insights engine** — rule-based auto-generated insights (top category, fastest-growing segment, strongest correlations, trend direction) capped at 8 per dataset, with info/warning/success severity.
- **Reports** — assemble a report from dataset metadata, statistics, quality findings, and saved charts; export full dataset as CSV, export any chart as PNG, or use browser print → Save as PDF (dedicated print stylesheet).
- **Dark / light theme** — class-based dark mode (Tailwind v4 `@custom-variant dark`), persisted in localStorage; default dark.
- **Persistence** — IndexedDB (`idb`) for saved charts and optionally the full dataset (opt-in toggle); localStorage for theme and preferences. Everything stored locally; "Clear local data" wipes it all with confirmation.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | ^18.3.1 | UI framework |
| React DOM | ^18.3.1 | Rendering |
| Vite | ^8.3.0 | Build tool / dev server |
| @vitejs/plugin-react | ^6.1.1 | React Fast Refresh for Vite |
| Tailwind CSS | ^4.3.3 | Utility-first styling (v4, CSS-first config) |
| @tailwindcss/vite | ^4.3.3 | Tailwind Vite plugin |
| Recharts | ^2.15.4 | Charting library |
| @tanstack/react-table | ^9.3.1 | Data explorer table (sorting/filter/pagination) |
| Papa Parse | ^5.7.0 | CSV parsing |
| xlsx (SheetJS) | ^0.18.5 | Excel import |
| idb | ^8.0.4 | Promise wrapper for IndexedDB persistence |
| lucide-react | ^1.59.0 | Icons |
| oxlint | ^1.81.0 | Fast linting (`npm run lint`) |

## Project Structure

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
│   └── utils/                  # parsers, dataTypes, chartData, nlq,
│                               # cleaning, statistics, insights,
│                               # exportUtils, sampleData, storage
├── public/sample-ecommerce.csv # Downloadable sample dataset
├── vite.config.js              # base: './' — build works from any path
└── package.json
```

## Setup (Windows / PowerShell)

### 1. Install Node.js LTS

```powershell
winget install OpenJS.NodeJS.LTS
```

Or download the LTS installer from [nodejs.org](https://nodejs.org). Then verify:

```powershell
node --version   # should print v20.x or later
npm --version
```

If the terminal was already open during install, restart it so `node` is on `PATH`.

### 2. Scaffold the Vite + React project

```powershell
npm create vite@latest datapilot-analytics -- --template react
cd datapilot-analytics
```

### 3. Install dependencies

```powershell
npm install
```

The app's runtime and build dependencies (from `package.json`):

```powershell
npm install react react-dom recharts @tanstack/react-table papaparse xlsx idb lucide-react
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite oxlint
```

### 4. Tailwind CSS v4 notes

This repo uses **Tailwind v4** — there is **no `tailwind.config.js`**. Configuration is CSS-first:

- `src/index.css` starts with `@import "tailwindcss";`
- Dark mode uses class strategy via `@custom-variant dark (&:where(.dark, .dark *));` — the app toggles the `dark` class on `<html>`.
- The Vite plugin is registered in `vite.config.js`: `plugins: [react(), tailwindcss()]` where `tailwindcss` comes from `@tailwindcss/vite`.

### 5. Run, build, preview

```powershell
npm run dev      # local dev server (Vite prints the http://localhost URL)
npm run build    # production build -> dist/
npm run preview  # serve the production build locally to verify
npm run lint     # oxlint
```

### 6. GitHub repo setup

```powershell
cd datapilot-analytics
git init
git add .
git commit -m "Initial commit: DataPilot Analytics"
```

With the GitHub CLI:

```powershell
gh repo create datapilot-analytics --public --source=. --push
```

Or create the repo in the GitHub web UI (New repository), then:

```powershell
git remote add origin https://github.com/<your-username>/datapilot-analytics.git
git branch -M main
git push -u origin main
```

### 7. Deploy to GitHub Pages

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
          node-version: 20
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

### 8. Deploy to Cloudflare Pages

1. Push the repo to GitHub (step 6).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the `datapilot-analytics` repository.
4. Build settings:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (repo root)
5. Environment variables: none required.
6. Click **Save and Deploy**. Cloudflare builds and serves the `dist/` output at your `*.pages.dev` URL. Subsequent pushes to the connected branch redeploy automatically.

## Troubleshooting

- **Tailwind v4 vs v3:** Do not create a `tailwind.config.js` — v4 ignores it. All customization goes in CSS (`@import "tailwindcss"`, `@custom-variant`, `@theme`). If styles are missing, confirm the `@tailwindcss/vite` plugin is in `vite.config.js` and `src/index.css` is imported by `src/main.jsx`.
- **lucide-react icon renames (v1.x):** some classic names changed — e.g. `BarChart3` → `ChartColumn`. If a build fails with an unexported icon name, check the installed lucide-react exports and update the import (this repo already uses the current names).
- **xlsx large files:** SheetJS holds the whole workbook in memory. For very large spreadsheets, split the file or convert to CSV first. Uploads are capped at 50 MB (`MAX_FILE_SIZE` in `src/utils/parsers.js`).
- **IndexedDB unavailable in private mode:** some browsers disable IndexedDB in private/incognito windows. Persistence toggles in Settings will silently no-op; the app still works fully in-session.
- **Papa Parse chunking for huge CSVs:** Papa Parse supports `chunk` callbacks for streaming row-by-row instead of buffering the entire file — use it if you extend `parseCSVFile` in `src/utils/parsers.js` beyond the 50 MB cap.
- **`base: './'` matters:** without it, built asset URLs are absolute (`/assets/...`) and the app breaks when served from a sub-path (GitHub Pages project sites, Cloudflare preview URLs). Keep `base: './'` in `vite.config.js`.

## Privacy

DataPilot Analytics is 100% client-side. Uploaded files are parsed in the browser; nothing is sent to any server. Persistence (IndexedDB/localStorage) is opt-in where it matters (dataset persistence is off by default) and can be wiped from Settings → Clear local data.

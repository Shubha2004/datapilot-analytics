# DataPilot Analytics — Product Requirements Document

**Version:** 1.0 · **Scope:** browser-only MVP (100% client-side) · **Status:** shipped, documented

---

## 1. Problem Statement

Non-technical teams (marketing, sales, operations, finance) are blocked waiting on data teams for ad-hoc analysis. A simple question — "Which channel drove the most revenue last quarter?" — becomes a ticket, a queue, and a multi-day wait. Meanwhile, the people closest to the business question cannot explore the data themselves: SQL is a gatekeeper, BI tools are expensive and IT-managed, and spreadsheet gymnastics do not scale.

**DataPilot Analytics** removes the gatekeeper. It is a browser-only self-service analytics app: drop in a CSV/Excel/JSON file and immediately ask questions in plain English, build charts with a visual builder, clean and profile data, run statistics, and export reports — with zero setup, zero backend, and zero data leaving the user's machine.

## 2. Personas

### 2.1 The Data Consumer (primary)

- **Who:** Marketing analyst, sales ops, operations manager, founder. No SQL, comfortable with spreadsheets.
- **Goals:** Answer ad-hoc business questions in minutes; build a chart for a deck; spot trends without filing a ticket.
- **Frustrations:** Waiting days for the data team; tools that require IT provisioning; dashboards that answer someone else's questions.
- **Needs from DataPilot:** One-click sample data to learn with; an NLQ bar that accepts plain English; sensible suggested charts; export to CSV/PNG/PDF for sharing.

### 2.2 The Data Steward (secondary)

- **Who:** Data analyst, analytics engineer, BI owner. Defines which datasets are trusted.
- **Goals:** Give consumers a safe, governed sandbox; reduce repetitive ad-hoc SQL ticket volume; ensure people work from clean, typed data.
- **Frustrations:** "Can you pull this for me?" tickets for trivial cuts of data; consumers misreading messy columns.
- **Needs from DataPilot (current):** Automatic column typing with transparent inference rules; data-quality findings and safe, previewed cleaning with undo; downloadable quality summaries in reports. **(Future, full-stack scope:** RBAC, certified datasets, scheduled alerts — see §5.6.)

## 3. User Journey

1. **Connect** — The consumer opens the app and either uploads a CSV/Excel/JSON file (drag-and-drop, 50 MB cap), clicks a mock database connector (PostgreSQL/Snowflake/BigQuery — loads local sample data in the browser-only version), or loads the built-in 1,500-row sample e-commerce dataset. A downloadable `sample-ecommerce.csv` is also provided.
2. **Govern / Model** — The app automatically infers column types (numeric / date / boolean / categorical, 80%-threshold rules, inspectable in `src/utils/dataTypes.js`). The Data Quality page surfaces findings (duplicates, missing values, whitespace, type issues); the consumer previews and applies cleaning operations, with one-click Undo restoring the original import.
3. **Query** — The consumer asks questions two ways: the **NLQ bar** ("Show monthly revenue by region", "Top 5 products by revenue") parses plain English into a chart plus an illustrative read-only SQL statement; or the **Dataset Explorer** offers no-code search, sort, per-column filters, and pagination.
4. **Visualize** — The **Chart Builder** provides 9 chart types (bar, horizontal bar, line, area, pie, donut, scatter, histogram, box plot) with aggregations, grouping, sorting, filters, inline validation, and suggested starter charts. Charts can be saved (persisted in IndexedDB), renamed, deleted, and exported as PNG.
5. **Share** — The **Reports** page bundles dataset metadata, statistics, quality findings, and saved charts; the consumer exports the dataset as CSV, charts as PNG, or uses browser print → Save as PDF.

## 4. Functional Requirements

### 4.1 File upload + connectors (current)

- Accept `.csv`, `.xls`, `.xlsx`, `.json` via drag-and-drop or file picker; reject other extensions and files over 50 MB with clear error messages (`src/components/FileUploader.jsx`, `src/utils/parsers.js`).
- CSV parsing via Papa Parse with header detection; Excel via SheetJS (first sheet); JSON arrays/objects normalized to rows.
- Mock connector modal for PostgreSQL, Snowflake, BigQuery (`src/components/ConnectorModal.jsx`): clearly labeled mock in the browser-only version; loads the deterministic local sample dataset. Real credential-based connections are **future full-stack scope**.
- Built-in sample dataset generator (`src/utils/sampleData.js`): 1,500 e-commerce rows across 10 typed columns (order_id, order_date, region, category, product, quantity, unit_price, revenue, channel, customer_segment).

### 4.2 Automatic column typing (current)

- On every load/clean, columns are re-inferred from values: **numeric** (≥80% coerce to number), **date** (≥80% parse as dates and are not purely numeric), **boolean** (all values in a boolean-ish literal set), else **categorical** (`src/utils/dataTypes.js`).
- Inferred types drive everything downstream: which columns are chartable as measures vs dimensions, which appear in the correlation matrix, and which cleaning operations are offered.

### 4.3 Natural-language querying

- **Current (rule-based):** `src/utils/nlq.js` matches metric keywords (revenue/sales, quantity, orders, price, order value/AOV), time grains (monthly/quarterly/weekly/yearly), dimension mentions (with underscore/space/plural tolerance), distribution/breakdown phrasing, and top-N/bottom-N patterns. Output: an in-browser computed chart, a result table, and an illustrative (non-executed) SQL string. 12 curated example queries with click-to-try; graceful no-match with suggestions.
- **Future (LLM text-to-SQL):** an embedded agent that inspects the schema/semantic layer first, generates read-only SELECT SQL, picks a visualization, and summarizes takeaways — specified in `docs/ai-agent-system-prompt.md`. Requires an LLM API key and is therefore **future scope**, not part of the browser-only build.

### 4.4 Visual chart builder (current)

- 9 chart types: bar, horizontal bar, line, area, pie, donut, scatter, histogram, box plot (Recharts; `src/utils/chartData.js`, `src/components/ChartRenderer.jsx`).
- X-axis, Y-axis measure, aggregation (sum/avg/count/min/max), series grouping, sort direction, and row filters; inline validation with actionable error messages (`validateChartConfig`).
- **Suggested charts (current recommendation engine):** up to 3 starter configs derived from column types (bar of first numeric by first categorical; line trend over the date column; pie breakdown of the first categorical).
- Saved charts: create, rename, delete; persisted to IndexedDB when the persistence toggle is on; per-chart PNG export (`downloadChartPNG` renders the chart SVG to canvas).

### 4.5 Saved charts & reports (current)

- Reports page (`src/pages/Reports.jsx`): dataset metadata summary, descriptive statistics, data-quality findings, and all saved charts in one printable view.
- Export full dataset as CSV; export individual charts as PNG; print stylesheet (`@media print`, `.no-print`/`.print-only`) for Print → Save as PDF.

### 4.6 RBAC + scheduled Slack/email alerts (FUTURE — full-stack scope, not in browser-only version)

Explicitly out of scope for the browser-only MVP: role-based access control, user accounts, certified/published datasets, scheduled refreshes, and Slack/email alerting. These require a backend (auth, job scheduler, secret storage) and are recorded here as future requirements so the MVP's seams (mock connectors, local-only saved charts) are honest.

## 5. Non-Functional Requirements

### 5.1 Privacy (current)

- **100% client-side processing.** Uploaded files are parsed in the browser; no network request carries user data anywhere. There is no backend, no telemetry, no API keys.
- **Opt-in persistence.** Theme and UI preferences → localStorage. Saved charts → IndexedDB (toggleable). Full dataset persistence → IndexedDB but **off by default**; the user must explicitly opt in from Settings. A "Clear local data" action wipes everything with confirmation.
- Note the limitation honestly: IndexedDB/localStorage may be unavailable in private-browsing mode; the app remains fully functional in-session.

### 5.2 Performance targets

- File parsing: ≤ 50 MB uploads parse without blocking the tab (Papa Parse streaming; SheetJS in-memory with the documented large-file caveat).
- Interactions (filter/sort/page/chart rebuild) target < 200 ms on the 1,500-row sample dataset on commodity hardware; chart builds are pure functions over row arrays (`buildChartData`).
- Initial load: single-page Vite bundle; no runtime data fetching.

### 5.3 Accessibility

- Visible keyboard focus (`:focus-visible` outline), semantic landmarks (`aria-label="Primary"` nav, `aria-current="page"`), labeled icon buttons (rename/export/delete/close), and theme-aware contrast in both dark and light modes.

## 6. Success Metrics

- **North Star: time-to-first-insight** — median minutes from landing on the app (or uploading a file) to viewing the first meaningful chart/answer. Target: under 5 minutes on the sample dataset.
- **KPI 1: Reduction in ad-hoc SQL tickets** — for teams piloting DataPilot alongside a data team, % drop in "can you pull this?" tickets per month.
- **KPI 2: Weekly active explorers** — distinct users loading a dataset and building ≥1 chart per week.
- **KPI 3: Reports exported per week** — count of CSV/PNG/PDF exports, as a proxy for insights leaving the app and reaching decisions.

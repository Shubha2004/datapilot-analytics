# DataPilot Analytics — Testing Checklist

Manual QA checklist for the browser-only build. Check each item in a clean browser profile where practical. Sample data: the built-in 1,500-row e-commerce dataset (`src/utils/sampleData.js`) or `public/sample-ecommerce.csv`.

## Project setup & build

- [ ] `npm install` completes with no errors on a fresh clone
- [ ] `npm run dev` starts and the app loads at the printed localhost URL
- [ ] `npm run build` completes and produces `dist/` with no errors
- [ ] `npm run preview` serves the production build and the app works
- [ ] `npm run lint` (oxlint) reports no errors
- [ ] No console errors or unhandled promise rejections on first load with no dataset
- [ ] Empty states render correctly on every page before any dataset is loaded

## Dataset upload

- [ ] CSV upload via drag-and-drop parses with correct headers, rows, and inferred column types
- [ ] CSV upload via file picker works the same as drag-and-drop
- [ ] Excel `.xlsx` upload parses the first sheet correctly
- [ ] Excel `.xls` (legacy) upload parses correctly
- [ ] JSON upload (array of objects) normalizes to rows and columns
- [ ] Invalid file extension (e.g. `.txt`, `.pdf`) is rejected with a clear error message
- [ ] File over 50 MB is rejected with a clear error message
- [ ] Malformed CSV (ragged rows, bad quoting) fails gracefully with an error, not a crash
- [ ] "Load sample dataset" button generates the 1,500-row e-commerce dataset with 10 typed columns
- [ ] Mock connector modal opens; PostgreSQL / Snowflake / BigQuery cards load sample data with the "mock connector" note in dataset metadata
- [ ] `sample-ecommerce.csv` download link works and the downloaded file uploads cleanly
- [ ] Uploading a second file replaces the dataset and resets dependent state (charts/suggestions)

## Overview KPIs (Dashboard page)

- [ ] KPI metric cards render: row count, total/average revenue, top category, top region (values match the dataset)
- [ ] Dataset summary card shows name, source, row/column counts
- [ ] Column-types card lists each column with its inferred type (numeric/date/boolean/categorical)
- [ ] Missing-values card charts the top columns by missing count
- [ ] Numeric distribution and category frequency cards render for the sample dataset
- [ ] Suggested starter charts appear (bar, line trend, pie breakdown) and match column types
- [ ] Insight cards render (up to 8) with info/warning/success styling and no empty cards

## NLQ bar

- [ ] Bar is visible on the Overview page and focuses via keyboard
- [ ] "Show monthly revenue by region" → line chart grouped by region + illustrative SQL shown
- [ ] "Top 5 products by revenue" → bar chart limited to 5, sorted desc
- [ ] "Average order value by channel" → bar chart with avg aggregation on revenue
- [ ] "Total quantity sold per category" → bar chart summing quantity by category
- [ ] "Revenue trend over time" → line chart over the date column
- [ ] "Bottom 3 categories by revenue" → bar chart limited to 3, sorted asc
- [ ] "Orders by customer segment" → bar chart with count aggregation
- [ ] "Monthly quantity by channel" → line chart grouped by channel
- [ ] "Top 10 products by quantity" → bar chart limited to 10
- [ ] "Average unit price by category" → bar chart averaging unit_price
- [ ] "Revenue by region" → bar chart of revenue by region
- [ ] "Count of orders per month" → monthly count chart
- [ ] Nonsense query ("blorp the zzz") returns the no-match message with 3 suggested examples
- [ ] Clicking an example query runs it; "show all examples" reveals all 12
- [ ] Generated SQL block is labeled illustrative/read-only and is never executed against a server

## Chart builder

- [ ] Each chart type renders correctly with the sample dataset: bar, horizontal bar, line, area, pie, donut, scatter, histogram, box plot
- [ ] Aggregation selector (sum/avg/count/min/max) changes the computed values correctly
- [ ] Series grouping splits bars/lines by the group column
- [ ] Sort direction (asc/desc/none) orders the x-axis as expected
- [ ] Row filters restrict the charted data (e.g. region = North)
- [ ] Validation: missing X column, missing measure for non-count aggregation, and unknown chart type each produce an actionable error message, not a crash
- [ ] Suggested charts section offers up to 3 starters and "use" applies one to the builder
- [ ] Save chart persists it to the saved-charts list; rename updates the title; delete removes it after confirmation
- [ ] Per-chart "Export PNG" downloads a PNG that visually matches the on-screen chart
- [ ] Saved charts survive a page reload when the charts persistence toggle is on

## Dataset explorer

- [ ] Table renders all rows and columns of the loaded dataset
- [ ] Global search filters rows across all columns
- [ ] Per-column filters narrow rows correctly (text and numeric)
- [ ] Clicking a column header sorts ascending, then descending, then clears
- [ ] Pagination controls page through rows; page size is respected
- [ ] Column show/hide menu toggles column visibility
- [ ] "Export CSV" downloads the currently filtered/sorted view with correct headers

## Data quality

- [ ] Quality findings list appears: duplicate rows, missing values per column, whitespace issues, type mismatches
- [ ] Each finding shows counts and affected columns/rows
- [ ] Preview each cleaning operation before applying and verify the preview numbers: remove duplicates, drop rows with missing values, fill numeric (mean/median/mode), fill categorical, trim whitespace, convert column type
- [ ] Applying an operation updates row counts, re-infers column types, and records a note in dataset metadata
- [ ] Applying requires an explicit confirmation dialog
- [ ] Undo restores the dataset to its original imported state (row count and values match pre-cleaning)

## Statistics

- [ ] Descriptives per numeric column: count, mean, median, mode, std dev, min, max, quartiles — spot-check against an independent calculation
- [ ] Columns with insufficient data show nulls gracefully instead of NaN/errors
- [ ] Pearson correlation matrix renders as a heatmap for numeric columns; diagonal is 1.0
- [ ] 95% confidence interval for the mean is shown per numeric column
- [ ] One-sample t-test runs against a user-entered mu0 and reports statistic, p-value, and reject/fail-to-reject at alpha 0.05
- [ ] Histogram uses equal-width bins (default 10) with correct counts
- [ ] Linear trend estimation on a time series reports slope/intercept sanely

## Insights

- [ ] Insights generate automatically after dataset load (no manual trigger needed)
- [ ] At most 8 insights are emitted, each with title, body, and kind (info/warning/success)
- [ ] Insights reference real values from the dataset (spot-check one number)
- [ ] No insight is emitted when the data does not support it (e.g. no trend insight without a date column)

## Reports

- [ ] Report view includes dataset metadata, descriptive statistics, quality findings, and all saved charts
- [ ] "Export full dataset (CSV)" downloads a CSV matching the current (possibly cleaned) dataset
- [ ] Per-chart "Download PNG" works from the Reports page
- [ ] Print → Save as PDF produces a clean document: nav/sidebar/buttons hidden, report content visible (print stylesheet)
- [ ] Report with no saved charts still renders metadata/statistics/quality sections without errors

## Settings

- [ ] Theme toggle switches dark/light; choice persists across reloads (default dark)
- [ ] "Persist saved charts" toggle on/off controls IndexedDB chart storage
- [ ] "Persist dataset" toggle is off by default; enabling it restores the dataset after reload
- [ ] "Clear local data" asks for confirmation and wipes theme, prefs, saved charts, and persisted dataset
- [ ] After clearing, the app returns to the pristine first-load state

## Responsive + accessibility

- [ ] Layout is usable at 1280px, 768px (sidebar collapses to overlay/menu), and 375px widths
- [ ] Charts resize with their containers; no horizontal page scroll on mobile widths
- [ ] All interactive elements are keyboard-reachable with a visible focus outline
- [ ] Icon-only buttons (rename, export PNG, delete, close, theme) expose accessible labels
- [ ] `aria-current="page"` marks the active sidebar item; nav has an accessible name
- [ ] Text contrast is readable in both dark and light themes

## Privacy

- [ ] With browser devtools network tab open, uploading and analyzing a file issues no requests carrying dataset contents
- [ ] No API keys, tokens, or credentials exist anywhere in the codebase or UI
- [ ] Dataset persistence toggle defaults to off; enabling it is an explicit user action
- [ ] App remains fully functional in a private/incognito window where IndexedDB is unavailable (persistence silently no-ops, in-session analysis works)

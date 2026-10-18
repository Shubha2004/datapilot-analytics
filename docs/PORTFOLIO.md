# Portfolio — DataPilot Analytics

**Project description (2–3 sentences):** DataPilot Analytics is a fully
client-side self-service BI web app built with React 18 + Vite — upload a CSV,
Excel, or JSON file and get KPI dashboards, a rule-based natural-language query
bar, a 9-chart no-code chart builder, data-quality cleaning with undo,
statistics, and printable reports, with data never leaving the browser.
Deployed live on GitHub Pages at
<https://shubha2004.github.io/datapilot-analytics/>.

## Resume bullets (ATS-friendly, implemented features only)

- Built a browser-only BI platform (React 18, Vite, Tailwind v4, Recharts) that
  ingests CSV/Excel/JSON client-side with magic-byte validation, header repair,
  and a plain-language import report; shipped 249 passing unit tests (vitest).
- Implemented a rule-based NLQ engine with synonym/fuzzy column matching and
  clarification prompts that renders charts plus illustrative read-only SQL,
  and a 9-chart-type builder (sum/avg/count/min/max, grouping, filters) with
  save/rename/delete and PNG export.
- Delivered data-quality scanning (duplicates, missing values, IQR outliers,
  domain checks) with dry-run cleaning, undo, and transformation history,
  plus per-column statistics (Pearson matrix, 95% CIs, t-tests) with
  documented assumptions.

## Demonstrated technical skills

JavaScript (ES modules), React 18 (hooks, context), Vite, Tailwind CSS v4
(CSS-first config, class-based dark mode), Recharts, TanStack Table v8,
Papa Parse, SheetJS, IndexedDB via `idb`, vitest + jsdom unit testing,
pure-function architecture (DOM-free `src/utils/` for testability),
PostgreSQL-flavored analytical SQL (CTEs, window functions, LAG/LEAD),
client-side data validation and cleaning, formula-injection-safe CSV export,
GitHub Pages deployment, data-honesty practices (no invented metrics,
labeled approximations, causation-free insights).

## GitHub project description (<350 chars)

Browser-only self-service analytics: upload CSV/Excel/JSON and get KPI dashboards, rule-based natural-language querying, a 9-chart builder, data-quality cleaning with undo, and statistics — 100% client-side, no backend, no API keys. React 18 + Vite + Tailwind v4 + Recharts. Live: shubha2004.github.io/datapilot-analytics

## Interview questions (with one-line answer hints)

1. **Why 100% client-side — what breaks if a dataset needs a real database?**
   Hint: browser tab memory caps (~100 MB import limit); a backend would offload parsing/aggregation.
2. **How does the NLQ bar work without an LLM?**
   Hint: rule-based template parser — synonym/plural/fuzzy matching against actual column names, clarification prompt when ambiguous, returns chart + illustrative SQL.
3. **Why are your `src/utils/` modules DOM-free?**
   Hint: pure functions run in Node for vitest without a browser; only exportUtils/storage touch the DOM.
4. **How do you prevent formula-injection in CSV exports?**
   Hint: prefix cells starting with `= + - @` (or tab/CR) with a single quote; leave plain numerics untouched.
5. **What does "sample vs population variance labeled" mean in your Statistics page?**
   Hint: the app labels which denominator (n vs n−1) it uses so results aren't misread.
6. **How does undo work for cleaning operations?**
   Hint: pure cleaning functions + transformation history with revert-to-here; inputs never mutated.
7. **What SQL does the app execute?**
   Hint: none — NLQ shows illustrative read-only SQL; `analysis/sql/` holds validated example queries for PostgreSQL.
8. **How did you validate the case-study numbers?**
   Hint: `scripts/compute-case-study.mjs` against the app's own generator, cross-checked with the KPI module and a JS-vs-SQL validation script — all matched.
9. **What did the benchmark show, and what's its caveat?**
   Hint: ~16 ms KPI aggregation at 50k rows on a VM; caveat: shared-hardware VM, compute-only, no browser render time — re-run on your own machine.
10. **What's the one manual deployment step and why?**
    Hint: `.github/workflows/ci.yml` can't be pushed via the OAuth App (no workflow scope) — must be added through the GitHub web UI.

## Problem → approach → findings → limitations

**Problem:** small teams and students need BI-style analysis (KPIs, charts,
cleaning, stats) without paid tools, backends, or sending sensitive data to a
server.

**Approach:** built a zero-backend React app where all logic lives in
DOM-free pure functions (unit-tested with vitest), uploads are validated
client-side, analysis is rule-based and transparent (every NLQ answer shows
the SQL logic it applied), and every approximation is labeled.

**Findings:** the full analysis workflow runs on the bundled synthetic
1,500-row dataset in well under a second of compute (benchmarked:
~0.7 ms KPI aggregation at 1,500 rows, ~16 ms at 50,000 rows); all 249 tests
pass; every case-study figure reproduces from the committed generator script.

**Limitations:** NLQ/insights are rule-based, not AI; DB connectors are mock;
statistics use documented approximations; browser-scale only (100 MB cap);
the dataset is synthetic, so conclusions are workflow demonstrations, not
business truths.

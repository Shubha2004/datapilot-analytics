# SQL Analysis — `analysis/sql/`

PostgreSQL-flavored analytical queries against the sample dataset's `orders`
table. Each file targets one SQL technique, with a comment above every query
naming the **metric**, the **calculation**, and what it answers.

## Dialect

PostgreSQL 14+. Queries use `DATE_TRUNC`, `FILTER (WHERE ...)`,
`NULLIF`, `STDDEV_POP`, and `CROSS JOIN` — all standard PostgreSQL.

## Schema

```sql
CREATE TABLE orders (
  order_id         TEXT,     -- unique order ID, e.g. 'ORD-0001'
  order_date       DATE,     -- order date (2025 in the sample data)
  region           TEXT,     -- North | South | East | West
  category         TEXT,     -- Electronics | Clothing | Home & Kitchen | Sports | Books
  product          TEXT,     -- product name
  quantity         INT,      -- units ordered (1-5)
  unit_price       NUMERIC,  -- price per unit (USD)
  revenue          NUMERIC,  -- quantity * unit_price (USD)
  channel          TEXT,     -- Online | Retail | Wholesale
  customer_segment TEXT      -- Consumer | Corporate | Home Office
);
```

Load the sample data by exporting the app's sample dataset to CSV
(Data Explorer → Export CSV), then importing it into PostgreSQL.

## Files

| File | Topic |
|---|---|
| `01_basics.sql` | SELECT / WHERE / GROUP BY / HAVING — totals, revenue by region/channel |
| `02_segmentation.sql` | CASE WHEN — revenue tiers, price bands, conditional aggregates |
| `03_ctes.sql` | CTEs — monthly/quarterly roll-ups, running totals |
| `04_contribution.sql` | Revenue contribution — shares and cumulative Pareto |
| `05_window_rank.sql` | ROW_NUMBER / RANK / DENSE_RANK — top products per region, top lines per category |
| `06_mom_growth.sql` | LAG — month-over-month revenue change, drop alerts |
| `07_lead.sql` | LEAD — forward-looking month comparisons per region |
| `08_duplicates.sql` | Duplicate detection — duplicate IDs, exact-duplicate rows, duplicate rate |
| `09_data_quality.sql` | Missing values, invalid business rules, revenue arithmetic consistency, outliers, domain checks |

## Honest note on scope

**The DataPilot Analytics app does not execute SQL.** These files are
reproducible analysis examples you can run against the same data in a real
PostgreSQL database. In the app, the NLQ bar shows **illustrative** SQL for the
question you typed (e.g. *"revenue by category"*); that SQL is a read-only
text preview of the logic the app applies client-side — it is not sent to a
database. All app computation happens in the browser over the loaded dataset.

## Validation

The SQL results were cross-validated on 2026-10-18 by recomputing the same
numbers in JavaScript against the app's sample-data generator
(`scripts/validate-sql.mjs`; run with
`node --import ./scripts/register-esm-hook.mjs scripts/validate-sql.mjs`).
All checks matched exactly:

| Check | SQL file / query | Result |
|---|---|---|
| Total revenue (full year 2025) | `01_basics.sql` A | **$1,066,210.23** ✅ match |
| Top category | `04_contribution.sql` A | **Electronics** ✅ match |
| Top category revenue | `04_contribution.sql` A | **$594,758.43** ✅ match |
| Top category share | `04_contribution.sql` A | **55.78%** ✅ match |
| December 2025 revenue | `06_mom_growth.sql` A | **$102,133.93** ✅ match |
| December 2025 MoM change | `06_mom_growth.sql` A | **+3.86%** (vs Nov 2025) ✅ match |

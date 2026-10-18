-- 07_lead.sql — LEAD (looking ahead)
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Next month's revenue alongside the current month
--    Metric: revenue, next month's revenue, and the forward change.
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', order_date)::DATE AS month,
    SUM(revenue) AS revenue
  FROM orders
  GROUP BY 1
)
SELECT
  month,
  revenue,
  LEAD(revenue) OVER (ORDER BY month) AS next_month_revenue,
  ROUND(
    (LEAD(revenue) OVER (ORDER BY month) - revenue) * 100.0
    / NULLIF(revenue, 0),
    2
  ) AS forward_change_pct
FROM monthly
ORDER BY month;

-- B. Best following month per region (seasonality hint)
--    Metric: for each region, the month whose *next* month grew the most.
WITH region_month AS (
  SELECT
    region,
    DATE_TRUNC('month', order_date)::DATE AS month,
    SUM(revenue) AS revenue
  FROM orders
  GROUP BY region, 2
),
fwd AS (
  SELECT
    region, month, revenue,
    ROUND(
      (LEAD(revenue) OVER (PARTITION BY region ORDER BY month) - revenue)
      * 100.0 / NULLIF(revenue, 0),
      2
    ) AS forward_change_pct
  FROM region_month
)
SELECT region, month, revenue, forward_change_pct
FROM (
  SELECT
    *,
    RANK() OVER (PARTITION BY region ORDER BY forward_change_pct DESC NULLS LAST) AS rnk
  FROM fwd
) ranked
WHERE rnk = 1
ORDER BY forward_change_pct DESC;

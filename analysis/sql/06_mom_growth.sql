-- 06_mom_growth.sql — Month-over-month growth with LAG
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Monthly revenue with prior-month value and MoM % change
--    Metric: revenue, previous month revenue, absolute and % change.
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
  LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue,
  revenue - LAG(revenue) OVER (ORDER BY month) AS mom_change_abs,
  ROUND(
    (revenue - LAG(revenue) OVER (ORDER BY month))
    * 100.0 / NULLIF(LAG(revenue) OVER (ORDER BY month), 0),
    2
  ) AS mom_change_pct
FROM monthly
ORDER BY month;

-- B. Flag months with a large drop (worse than -10% MoM)
--    Metric: months where revenue fell by more than 10% vs prior month.
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', order_date)::DATE AS month,
    SUM(revenue) AS revenue
  FROM orders
  GROUP BY 1
),
mom AS (
  SELECT
    month,
    revenue,
    ROUND(
      (revenue - LAG(revenue) OVER (ORDER BY month))
      * 100.0 / NULLIF(LAG(revenue) OVER (ORDER BY month), 0),
      2
    ) AS mom_change_pct
  FROM monthly
)
SELECT month, revenue, mom_change_pct
FROM mom
WHERE mom_change_pct < -10
ORDER BY month;

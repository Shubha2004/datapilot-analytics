-- 03_ctes.sql — CTEs and date aggregation
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Monthly revenue via CTE, with running total
--    Metric: revenue per calendar month + cumulative revenue for the year.
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', order_date)::DATE AS month,
    COUNT(*)                              AS orders,
    SUM(revenue)                          AS revenue
  FROM orders
  GROUP BY 1
)
SELECT
  month,
  orders,
  revenue,
  SUM(revenue) OVER (ORDER BY month) AS running_revenue
FROM monthly
ORDER BY month;

-- B. Quarterly roll-up
--    Metric: revenue and AOV per calendar quarter.
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', order_date)::DATE AS month,
    SUM(revenue)                          AS revenue,
    COUNT(*)                              AS orders
  FROM orders
  GROUP BY 1
)
SELECT
  DATE_TRUNC('quarter', month)::DATE AS quarter,
  SUM(revenue) AS revenue,
  SUM(orders)  AS orders,
  ROUND(SUM(revenue) / SUM(orders), 2) AS avg_order_value
FROM monthly
GROUP BY 1
ORDER BY 1;

-- C. Year-end summary in one readable query
--    Metric: full-year totals broken out by channel in columns.
WITH by_channel AS (
  SELECT channel, SUM(revenue) AS revenue
  FROM orders
  GROUP BY channel
)
SELECT
  SUM(revenue)                                                    AS total_revenue,
  SUM(revenue) FILTER (WHERE channel = 'Online')                  AS online_revenue,
  SUM(revenue) FILTER (WHERE channel = 'Retail')                  AS retail_revenue,
  SUM(revenue) FILTER (WHERE channel = 'Wholesale')               AS wholesale_revenue
FROM by_channel;

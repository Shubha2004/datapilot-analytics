-- 01_basics.sql — Core SELECT / WHERE / GROUP BY / HAVING
-- Dialect: PostgreSQL 14+. Table: orders
-- (order_id TEXT, order_date DATE, region TEXT, category TEXT, product TEXT,
--  quantity INT, unit_price NUMERIC, revenue NUMERIC, channel TEXT, customer_segment TEXT)

-- A. Full-year headline totals
--    Metric: total revenue, order count, units sold, average order value.
SELECT
  COUNT(*)                                AS total_orders,
  SUM(quantity)                           AS units_sold,
  SUM(revenue)                            AS total_revenue,
  ROUND(SUM(revenue) / COUNT(*), 2)       AS avg_order_value
FROM orders
WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31';

-- B. Revenue by region (best/worst regions)
--    Metric: revenue and share per region, ordered best to worst.
SELECT
  region,
  COUNT(*)                                   AS orders,
  SUM(revenue)                               AS revenue,
  ROUND(SUM(revenue) * 100.0 / (SELECT SUM(revenue) FROM orders), 2) AS revenue_share_pct
FROM orders
GROUP BY region
ORDER BY revenue DESC;

-- C. Categories above a revenue threshold
--    Metric: only categories earning more than $100k in the year.
SELECT
  category,
  SUM(revenue) AS revenue
FROM orders
GROUP BY category
HAVING SUM(revenue) > 100000
ORDER BY revenue DESC;

-- D. Channel performance with unit economics
--    Metric: per-channel revenue, orders and average order value.
SELECT
  channel,
  COUNT(*)                            AS orders,
  SUM(revenue)                        AS revenue,
  ROUND(AVG(revenue), 2)              AS avg_line_revenue
FROM orders
GROUP BY channel
ORDER BY revenue DESC;

-- 04_contribution.sql — Revenue contribution (share of total)
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Category contribution (Pareto-style)
--    Metric: each category's revenue, share of total, and cumulative share.
WITH cat AS (
  SELECT category, SUM(revenue) AS revenue
  FROM orders
  GROUP BY category
),
total AS (
  SELECT SUM(revenue) AS grand_total FROM orders
)
SELECT
  c.category,
  c.revenue,
  ROUND(c.revenue * 100.0 / t.grand_total, 2) AS share_pct,
  ROUND(SUM(c.revenue) OVER (ORDER BY c.revenue DESC) * 100.0 / t.grand_total, 2)
    AS cumulative_share_pct
FROM cat c CROSS JOIN total t
ORDER BY c.revenue DESC;

-- B. Region contribution
--    Metric: each region's share of total revenue.
SELECT
  region,
  SUM(revenue) AS revenue,
  ROUND(SUM(revenue) * 100.0 / (SELECT SUM(revenue) FROM orders), 2) AS share_pct
FROM orders
GROUP BY region
ORDER BY share_pct DESC;

-- C. Top-5 products by revenue with shares
--    Metric: product revenue and its share of the year total.
SELECT
  product,
  SUM(revenue) AS revenue,
  ROUND(SUM(revenue) * 100.0 / (SELECT SUM(revenue) FROM orders), 2) AS share_pct
FROM orders
GROUP BY product
ORDER BY revenue DESC
LIMIT 5;

-- 05_window_rank.sql — ROW_NUMBER / RANK / DENSE_RANK
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Rank categories by revenue
--    Metric: rank, dense rank and row number side by side.
SELECT
  category,
  SUM(revenue) AS revenue,
  RANK()       OVER (ORDER BY SUM(revenue) DESC) AS revenue_rank,
  DENSE_RANK() OVER (ORDER BY SUM(revenue) DESC) AS revenue_dense_rank,
  ROW_NUMBER() OVER (ORDER BY SUM(revenue) DESC) AS revenue_row_number
FROM orders
GROUP BY category;

-- B. Top product per region (no ties dropped — RANK keeps ties)
--    Metric: #1 product(s) in each region by revenue.
WITH product_region AS (
  SELECT region, product, SUM(revenue) AS revenue
  FROM orders
  GROUP BY region, product
)
SELECT region, product, revenue
FROM (
  SELECT
    region, product, revenue,
    RANK() OVER (PARTITION BY region ORDER BY revenue DESC) AS rnk
  FROM product_region
) ranked
WHERE rnk = 1
ORDER BY revenue DESC;

-- C. Top 3 orders (lines) by revenue per category
--    Metric: the three biggest single lines inside each category.
SELECT order_id, category, product, revenue
FROM (
  SELECT
    order_id, category, product, revenue,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) AS rn
  FROM orders
) ranked
WHERE rn <= 3
ORDER BY category, revenue DESC;

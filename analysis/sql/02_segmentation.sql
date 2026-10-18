-- 02_segmentation.sql — CASE WHEN segmentation
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Bucket orders by revenue tier
--    Metric: order counts and revenue per value tier.
SELECT
  CASE
    WHEN revenue < 100   THEN 'Small (<$100)'
    WHEN revenue < 1000  THEN 'Medium ($100-$999)'
    ELSE 'Large ($1,000+)'
  END AS revenue_tier,
  COUNT(*)                 AS orders,
  SUM(revenue)             AS revenue,
  ROUND(AVG(revenue), 2)   AS avg_revenue
FROM orders
GROUP BY 1
ORDER BY 3 DESC;

-- B. Price band per unit
--    Metric: revenue contribution by unit-price band.
SELECT
  CASE
    WHEN unit_price < 50    THEN 'Budget'
    WHEN unit_price < 300   THEN 'Mid-range'
    WHEN unit_price < 800   THEN 'Premium'
    ELSE 'Luxury'
  END AS price_band,
  COUNT(*)   AS orders,
  SUM(revenue) AS revenue
FROM orders
GROUP BY 1
ORDER BY revenue DESC;

-- C. Conditional metrics in one pass: Electronics vs everything else
--    Metric: Electronics revenue, non-Electronics revenue, and the ratio.
SELECT
  SUM(CASE WHEN category = 'Electronics' THEN revenue ELSE 0 END) AS electronics_revenue,
  SUM(CASE WHEN category <> 'Electronics' THEN revenue ELSE 0 END) AS other_revenue,
  ROUND(
    SUM(CASE WHEN category = 'Electronics' THEN revenue ELSE 0 END)
    * 100.0 / SUM(revenue), 2
  ) AS electronics_share_pct
FROM orders;

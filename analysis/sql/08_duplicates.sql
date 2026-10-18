-- 08_duplicates.sql — Duplicate detection
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Duplicate order_id values
--    Metric: any order_id appearing more than once (should be zero).
SELECT order_id, COUNT(*) AS occurrences
FROM orders
GROUP BY order_id
HAVING COUNT(*) > 1
ORDER BY occurrences DESC;

-- B. Exact duplicate rows (same values in every column)
--    Metric: rows whose full column set repeats.
SELECT
  order_id, order_date, region, category, product,
  quantity, unit_price, revenue, channel, customer_segment,
  COUNT(*) AS occurrences
FROM orders
GROUP BY
  order_id, order_date, region, category, product,
  quantity, unit_price, revenue, channel, customer_segment
HAVING COUNT(*) > 1;

-- C. Duplicate rate of the whole table
--    Metric: share of rows that are exact duplicates of another row.
WITH dupes AS (
  SELECT COUNT(*) AS dup_rows
  FROM (
    SELECT 1
    FROM orders
    GROUP BY
      order_id, order_date, region, category, product,
      quantity, unit_price, revenue, channel, customer_segment
    HAVING COUNT(*) > 1
  ) d
)
SELECT
  (SELECT COUNT(*) FROM orders) AS total_rows,
  dupes.dup_rows,
  ROUND(dupes.dup_rows * 100.0 / (SELECT COUNT(*) FROM orders), 4) AS duplicate_rate_pct
FROM dupes;

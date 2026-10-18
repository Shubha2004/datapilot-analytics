-- 09_data_quality.sql — Missing / invalid / outlier checks
-- Dialect: PostgreSQL 14+. Table: orders

-- A. Missing values per column
--    Metric: NULL/blank counts and missing-rate per column.
SELECT
  COUNT(*) FILTER (WHERE order_id IS NULL OR TRIM(order_id) = '')         AS missing_order_id,
  COUNT(*) FILTER (WHERE order_date IS NULL)                               AS missing_order_date,
  COUNT(*) FILTER (WHERE region IS NULL OR TRIM(region) = '')              AS missing_region,
  COUNT(*) FILTER (WHERE category IS NULL OR TRIM(category) = '')          AS missing_category,
  COUNT(*) FILTER (WHERE product IS NULL OR TRIM(product) = '')            AS missing_product,
  COUNT(*) FILTER (WHERE quantity IS NULL)                                AS missing_quantity,
  COUNT(*) FILTER (WHERE unit_price IS NULL)                              AS missing_unit_price,
  COUNT(*) FILTER (WHERE revenue IS NULL)                                  AS missing_revenue,
  COUNT(*) FILTER (WHERE channel IS NULL OR TRIM(channel) = '')            AS missing_channel,
  COUNT(*) FILTER (WHERE customer_segment IS NULL OR TRIM(customer_segment) = '')
                                                                          AS missing_customer_segment
FROM orders;

-- B. Completeness rate of the whole table
--    Metric: share of non-missing cells across all columns.
WITH total_cells AS (
  SELECT COUNT(*) * 10 AS cells FROM orders
)
SELECT
  ROUND(
    (1.0 -
      ( (SELECT COUNT(*) FILTER (WHERE order_id IS NULL OR TRIM(order_id) = '') FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE order_date IS NULL) FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE region IS NULL OR TRIM(region) = '') FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE category IS NULL OR TRIM(category) = '') FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE product IS NULL OR TRIM(product) = '') FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE quantity IS NULL) FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE unit_price IS NULL) FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE revenue IS NULL) FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE channel IS NULL OR TRIM(channel) = '') FROM orders)
      + (SELECT COUNT(*) FILTER (WHERE customer_segment IS NULL OR TRIM(customer_segment) = '') FROM orders)
      ) * 1.0 / (SELECT cells FROM total_cells)
    ) * 100,
    2
  ) AS completeness_pct;

-- C. Invalid business values
--    Metric: rows violating basic business rules (negatives, bad dates, bad quantity).
SELECT
  COUNT(*) FILTER (WHERE revenue < 0)                                       AS negative_revenue_rows,
  COUNT(*) FILTER (WHERE quantity < 1)                                      AS invalid_quantity_rows,
  COUNT(*) FILTER (WHERE unit_price < 0)                                   AS negative_unit_price_rows,
  COUNT(*) FILTER (WHERE order_date < '2000-01-01' OR order_date > CURRENT_DATE)
                                                                           AS out_of_range_date_rows
FROM orders;

-- D. Arithmetic consistency: revenue must equal quantity * unit_price
--    Metric: rows where revenue differs from quantity*unit_price beyond $0.01 rounding.
SELECT COUNT(*) AS inconsistent_revenue_rows
FROM orders
WHERE ABS(revenue - (quantity * unit_price)) > 0.01;

-- E. Outliers: revenue beyond 3 standard deviations from the mean
--    Metric: count and detail of extreme revenue lines.
WITH stats AS (
  SELECT AVG(revenue) AS mean_rev, STDDEV_POP(revenue) AS sd_rev
  FROM orders
)
SELECT
  o.order_id, o.product, o.category, o.revenue,
  ROUND((o.revenue - s.mean_rev) / NULLIF(s.sd_rev, 0), 2) AS z_score
FROM orders o CROSS JOIN stats s
WHERE ABS(o.revenue - s.mean_rev) > 3 * s.sd_rev
ORDER BY o.revenue DESC;

-- F. Domain check: unexpected categorical values
--    Metric: any region/category/channel/segment value outside the known domains.
SELECT 'region' AS column_name, region AS value, COUNT(*) AS rows
FROM orders
WHERE region NOT IN ('North', 'South', 'East', 'West')
GROUP BY region
UNION ALL
SELECT 'category', category, COUNT(*)
FROM orders
WHERE category NOT IN ('Electronics', 'Clothing', 'Home & Kitchen', 'Sports', 'Books')
GROUP BY category
UNION ALL
SELECT 'channel', channel, COUNT(*)
FROM orders
WHERE channel NOT IN ('Online', 'Retail', 'Wholesale')
GROUP BY channel
UNION ALL
SELECT 'customer_segment', customer_segment, COUNT(*)
FROM orders
WHERE customer_segment NOT IN ('Consumer', 'Corporate', 'Home Office')
GROUP BY customer_segment;

# Case Study: Sales Performance and Revenue Optimization Analysis

> **Dataset status: SYNTHETIC.** Every number below was computed from the bundled
> **Sample E-commerce Dataset** — 1,500 rows of deterministically generated demo
> data (seed 42, order dates spread across calendar year 2025). It is **not**
> real company data and supports no real business conclusions. It exists to
> demonstrate the analysis workflow end-to-end.

**Reproducibility:** all figures were produced by `scripts/compute-case-study.mjs`
(run: `node --import ./scripts/register-esm-hook.mjs scripts/compute-case-study.mjs`
from the repo root), which imports the same `generateSampleData()` generator the
app itself uses. Grain: one row = one order line item; **orders = distinct
`order_id`** (1,500 in this dataset, i.e. one row per order).

## Headline metrics (full year 2025)

| Metric | Value |
|---|---|
| Total revenue | **$1,066,210.23** |
| Total orders | 1,500 |
| Units sold | 4,473 |
| Average order value (revenue / orders) | **$710.81** |
| Median line revenue | $295.45 |

## 1. Top revenue categories

**Finding:** Electronics dominates — **$594,758.43 (55.78%)** of total revenue.

| Category | Revenue | Share |
|---|---|---|
| Electronics | $594,758.43 | 55.78% |
| Sports | $240,936.87 | 22.60% |
| Home & Kitchen | $126,344.32 | 11.85% |
| Clothing | $73,554.72 | 6.90% |
| Books | $30,615.89 | 2.87% |

**Calculation:** `SUM(revenue) GROUP BY category`; share = category revenue /
total revenue × 100. **Comparison period:** full year 2025.
**In the app:** build a **bar chart** (category → SUM(revenue)) or use the
**NLQ bar**: *"revenue by category"* — the app shows the same category table with
the illustrative SQL it generated.

**Hypotheses for investigation:** (1) the 55.78% share may reflect the
Electronics price range ($25–$1,200 vs $8–$60 for Books) rather than genuine
demand strength — check units sold per category before acting; (2) the two
largest categories (Electronics + Sports = 78.38%) concentrate inventory risk —
consider whether promotions in Home & Kitchen could diversify; (3) Books at
2.87% could be a candidate for delisting or bundling.

## 2. Best / worst regions

**Finding:** regions are nearly even; **South is best ($277,223.94, 26.00%)**,
**West is worst ($245,299.97, 23.01%)** — a gap of **$31,923.97 (~11.5%)**.

| Region | Revenue | Share |
|---|---|---|
| South | $277,223.94 | 26.00% |
| East | $272,057.43 | 25.52% |
| North | $271,628.89 | 25.48% |
| West | $245,299.97 | 23.01% |

**Calculation:** `SUM(revenue) GROUP BY region`; share as above.
**Comparison period:** full year 2025.
**In the app:** bar chart (region → SUM(revenue)) or NLQ *"revenue by region"*.

**Hypotheses for investigation:** (1) the spread is small relative to total
revenue, so check per-region marketing spend before calling West "underperforming";
(2) if West's order count is also lower (vs. lower basket size), the lever would
be demand generation rather than pricing — a pivot-table by region × category
would tell which it is; (3) the near-parity is consistent with evenly generated
demo data, so this comparison mainly validates the tooling, not real geography.

## 3. Month-over-month revenue change

**Finding:** December 2025 is the latest month: **$102,133.93 (+3.86% vs November's
$98,337.42)**. The most volatile moves were March (−44.44%) and May (+35.64%).

| Month | Revenue | Orders | MoM Δ |
|---|---|---|---|
| 2025-01 | $103,679.25 | 140 | — |
| 2025-02 | $100,850.88 | 116 | −2.73% |
| 2025-03 | $56,031.74 | 95 | **−44.44%** |
| 2025-04 | $69,628.51 | 113 | +24.27% |
| 2025-05 | $94,445.93 | 129 | **+35.64%** |
| 2025-06 | $96,646.37 | 120 | +2.33% |
| 2025-07 | $88,495.86 | 138 | −8.43% |
| 2025-08 | $80,306.69 | 136 | −9.25% |
| 2025-09 | $78,963.22 | 121 | −1.67% |
| 2025-10 | $96,690.43 | 126 | +22.45% |
| 2025-11 | $98,337.42 | 122 | +1.70% |
| 2025-12 | $102,133.93 | 144 | +3.86% |

**Calculation:** `SUM(revenue)` per calendar month (from `order_date`);
MoM = (this month − prior month) / prior month × 100.
**Comparison period:** each month vs. the previous month, 2025.
**In the app:** **line chart** (month → SUM(revenue)) to visualize the trend,
or NLQ *"monthly revenue trend"*.

**Hypotheses for investigation:** (1) March's −44.44% coincides with the lowest
order count of the year (95 vs. 140 in January) — in real data this pattern
would prompt checking for a supply outage, shipping issue, or campaign pause in
March; (2) the October rebound (+22.45%) alongside steady December growth is
consistent with a Q4 seasonal lift — verify against prior-year data before
claiming seasonality; (3) no month shows negative revenue or missing dates, so
the time series is structurally clean.

## 4. Top sales channels

**Finding:** channels are effectively tied — **Online $355,788.25 (33.37%)**,
Retail $355,526.16 (33.34%), Wholesale $354,895.82 (33.29%).

**Calculation:** `SUM(revenue) GROUP BY channel`; share as above.
**Comparison period:** full year 2025.
**In the app:** pie or bar chart (channel → SUM(revenue)) or NLQ *"revenue by channel"*.

**Hypotheses for investigation:** (1) near-perfect parity suggests no channel
strategy insight in this synthetic data; in real data, identical shares would
be a flag to check cost-per-channel — equal revenue rarely means equal margin;
(2) a channel × category cross-tab would reveal whether any channel skews
toward high-ticket Electronics.

## 5. Highest-AOV customer segments

**Finding:** **Corporate has the highest AOV ($732.33)**, then Home Office
($721.38), then Consumer ($677.52).

| Segment | Revenue | Orders | AOV |
|---|---|---|---|
| Corporate | $370,559.25 | 506 | **$732.33** |
| Home Office | $365,020.31 | 506 | $721.38 |
| Consumer | $330,630.67 | 488 | $677.52 |

**Calculation:** AOV = `SUM(revenue) / COUNT(*)` per `customer_segment`.
**Comparison period:** full year 2025.
**In the app:** bar chart (customer_segment → AVG(revenue)) or NLQ *"average
order value by segment"*.

**Hypotheses for investigation:** (1) the Corporate lead (+$54.81 over Consumer,
≈8.1%) is modest — test whether it persists within each category before
designing segment-specific pricing; (2) if real, higher Corporate baskets could
reflect bulk or Wholesale-linked purchases — cross-check segment × channel;
(3) the segment order counts are nearly equal, so AOV differences are not driven
by sample size.

## 6. Data-quality findings

| Check | Result |
|---|---|
| Completeness (non-missing cells) | **100%** (0 missing of 15,000 cells) |
| Duplicate rows | **0 (0%)** |
| `revenue = quantity × unit_price` mismatches | **0** |
| Rows with valid `YYYY-MM-DD` dates | 1,500 / 1,500 |
| Rows with negative revenue | 0 |
| Date range | 2025-01 to 2025-12 (all 12 months present) |
| Quantity range | 1–5 (all integers, as specified) |

**Calculation:** cell-level missing check over all 10 columns; exact-row
duplicate hash; arithmetic consistency within a $0.01 rounding tolerance.
**In the app:** the **Data Quality page** reports completeness, duplicates, and
outlier checks, with cleaning actions, undo, and transformation history.

**Interpretation:** the synthetic dataset is structurally pristine, which is
expected of generated data — it validates the cleaning/quality tooling without
exercising it. Real datasets rarely score 100%.

## 7. Hypotheses for business investigation (synthetic-data caveats apply)

1. **Electronics concentration risk:** 55.78% of revenue from one category means
   an Electronics price or supply shock hits over half the business. Investigate
   whether the share is driven by price level or unit volume.
2. **West region gap:** West trails South by ~$32k. Investigate order counts vs.
   basket size in West before allocating budget there.
3. **Corporate segment premium:** Corporate AOV exceeds Consumer by 8.1%.
   Investigate segment × category and segment × channel mixes to find what
   drives the premium.
4. **March dip:** −44.44% MoM with only 95 orders. In real data, correlate with
   operational events (outages, campaigns) in that window.
5. **Channel parity:** three channels within 0.08pp. In real data, verify
   channel-level costs — equal revenue ≠ equal profit.

> No causal claims are made. Every recommendation above is framed as a
> hypothesis to test against additional (real) data, not as a conclusion.

## Top products (reference)

1. Smartphone — $179,028.68 | 2. Laptop — $158,827.74 | 3. Tablet —
$132,461.25 | 4. Headphones — $124,440.76 | 5. Yoga Mat — $65,356.88
(`SUM(revenue) GROUP BY product`, top 10 in the compute output.)

## Method note

Figures computed 2026-10-18 with `scripts/compute-case-study.mjs` against the
app's own sample-data generator. Totals cross-check against the app's Dashboard
KPIs (same generator, same aggregation logic).

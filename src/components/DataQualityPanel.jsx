/**
 * DataQualityPanel.jsx — plain-English data-quality findings for a dataset.
 * Props: { dataset }. Uses analyzeQuality(dataset) via useMemo.
 */
import { useMemo } from 'react';
import {
  Calendar,
  Copy,
  Droplet,
  Equal,
  Hash,
  Info,
  Tag,
  TrendingDown,
} from 'lucide-react';
import { analyzeQuality } from '../utils/cleaning';
import EmptyState from './EmptyState';

function Card({ icon: Icon, title, explanation, children, tone = 'info' }) {
  const tones = {
    info: 'border-slate-200 dark:border-slate-800',
    warn: 'border-amber-200 dark:border-amber-900/60',
    bad: 'border-red-200 dark:border-red-900/60',
    good: 'border-emerald-200 dark:border-emerald-900/60',
  };
  const iconTones = {
    info: 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400',
    warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    bad: 'bg-red-500/10 text-red-600 dark:text-red-400',
    good: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${tones[tone]}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconTones[tone]}`}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {explanation}
          </p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function PctBar({ pct }) {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div
        className="h-full rounded-full bg-amber-500"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default function DataQualityPanel({ dataset }) {
  const report = useMemo(
    () => (dataset ? analyzeQuality(dataset) : null),
    [dataset],
  );

  if (!dataset) {
    return (
      <EmptyState
        icon={Info}
        title="No dataset loaded"
        message="Upload a file or load the sample dataset to see a data-quality report."
      />
    );
  }

  const totalRows = dataset.rows.length;
  const missingOffenders = [...report.missingByColumn]
    .sort((a, b) => b.pct - a.pct)
    .filter((d) => d.missing > 0)
    .slice(0, 8);
  const hasFindings =
    missingOffenders.length > 0 ||
    report.duplicateRows > 0 ||
    report.invalidNumeric.length > 0 ||
    report.outliers.length > 0 ||
    report.inconsistentCategories.length > 0 ||
    report.singleValueColumns.length > 0 ||
    report.possibleDateColumns.length > 0;

  return (
    <div className="space-y-4">
      {!hasFindings && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          Clean bill of health — no missing values, duplicates, outliers, or
          type issues detected in this dataset.
        </div>
      )}

      {/* Missing values */}
      {missingOffenders.length > 0 && (
        <Card
          icon={Droplet}
          title="Missing values"
          explanation="Blank cells can skew averages and break charts. These are the columns with the most gaps."
          tone="warn"
        >
          <ul className="space-y-2">
            {missingOffenders.map((d) => (
              <li key={d.column} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate font-medium text-slate-700 dark:text-slate-300">
                  {d.column}
                </span>
                <PctBar pct={d.pct} />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {d.missing.toLocaleString()} missing · {d.pct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Duplicates */}
      <Card
        icon={Copy}
        title="Duplicate rows"
        explanation="Identical rows may double-count sales, responses, or events."
        tone={report.duplicateRows > 0 ? 'warn' : 'good'}
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="text-lg font-bold">
            {report.duplicateRows.toLocaleString()}
          </span>{' '}
          of {totalRows.toLocaleString()} rows are exact duplicates.
        </p>
      </Card>

      {/* Invalid numeric */}
      {report.invalidNumeric.length > 0 && (
        <Card
          icon={Hash}
          title="Invalid numeric values"
          explanation="These cells sit in numeric columns but aren't real numbers (e.g. 'N/A', 'unknown'). Charts will skip them."
          tone="bad"
        >
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {report.invalidNumeric.map((d) => (
              <li key={d.column}>
                <span className="font-medium">{d.column}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {' '}
                  — {d.count.toLocaleString()} invalid cells
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Outliers */}
      {report.outliers.length > 0 && (
        <Card
          icon={TrendingDown}
          title="Outliers (IQR method)"
          explanation="Values far outside the normal range (beyond 1.5 × IQR). They may be typos or genuinely extreme — check before averaging."
          tone="warn"
        >
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {report.outliers.map((o) => (
              <li key={o.column}>
                <span className="font-medium">{o.column}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {' '}
                  — {o.count.toLocaleString()} outliers (normal range{' '}
                  {o.lower.toFixed(2)} to {o.upper.toFixed(2)})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Inconsistent categories */}
      {report.inconsistentCategories.length > 0 && (
        <Card
          icon={Tag}
          title="Inconsistent categories"
          explanation="Labels that differ only by case or whitespace split one category into several groups."
          tone="warn"
        >
          <ul className="space-y-2 text-sm">
            {report.inconsistentCategories.map((ic) => (
              <li key={ic.column}>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {ic.column}:{' '}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {ic.variants
                    .slice(0, 3)
                    .map((v) => `"${v.join('", "')}"`)
                    .join('; ')}
                  {ic.variants.length > 3 &&
                    ` +${ic.variants.length - 3} more groups`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Single value columns */}
      {report.singleValueColumns.length > 0 && (
        <Card
          icon={Equal}
          title="Single-value columns"
          explanation="These columns hold the same value in every row, so they add no information to charts or models."
          tone="info"
        >
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {report.singleValueColumns.join(', ')}
          </p>
        </Card>
      )}

      {/* Possible date columns */}
      {report.possibleDateColumns.length > 0 && (
        <Card
          icon={Calendar}
          title="Possible date columns"
          explanation="These text columns look like dates. Converting them to the date type unlocks time-trend charts."
          tone="info"
        >
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {report.possibleDateColumns.join(', ')}
          </p>
        </Card>
      )}
    </div>
  );
}

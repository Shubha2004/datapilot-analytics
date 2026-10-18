/**
 * InsightCard.jsx — rich card for one rule-based insight.
 *
 * Props: { insight }. Supports the rich shape produced by generateInsights:
 * { id, title, body, kind, headline, finding, values, calculation,
 *   whyItMatters, nextStep, caveat } — and degrades gracefully to the legacy
 * { id, title, body, kind } shape (headline/title, finding/body fallbacks).
 *
 * All copy describes detection as rule-based; never as AI. No animations or
 * transitions are used, so the card is inherently prefers-reduced-motion safe.
 */
import { AlertTriangle, Info, TrendingUp, ShieldAlert, Calculator, Compass } from 'lucide-react';
import { fmtNum, fmtMoney, fmtPct } from '../utils/insights';

const KIND = {
  info: {
    icon: Info,
    bar: 'bg-indigo-500',
    chip: 'bg-indigo-600/10 text-indigo-700 dark:text-indigo-300',
    badge: 'border-indigo-200 text-indigo-600 dark:border-indigo-800 dark:text-indigo-400',
  },
  warning: {
    icon: AlertTriangle,
    bar: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    badge: 'border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400',
  },
  success: {
    icon: TrendingUp,
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300',
    badge: 'border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400',
  },
};

function labelize(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function fmtValue(key, v) {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return '—';
  if (typeof v !== 'number') return String(v);
  if (/pct|percent|rate/i.test(key)) return fmtPct(v);
  if (/ratio/i.test(key)) return `${fmtNum(v)}×`;
  if (/revenue|price|cost|amount|spend|total|sum|median|max|min|slope/i.test(key)) return fmtMoney(v);
  return fmtNum(v);
}

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <div className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function InsightCard({ insight }) {
  if (!insight) return null;
  const kind = insight.kind && KIND[insight.kind] ? insight.kind : 'info';
  const style = KIND[kind];
  const Icon = style.icon;

  const headline = insight.headline || insight.title || 'Insight';
  const finding = insight.finding || insight.body || '';
  const values =
    insight.values && typeof insight.values === 'object'
      ? Object.entries(insight.values)
      : [];

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none">
      <div className="flex">
        <div className={`w-1 shrink-0 ${style.bar}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.chip}`}
            >
              <Icon size={17} />
            </span>
            <h3 className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-white">
              {headline}
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.badge}`}
            >
              Rule-based
            </span>
          </div>

          {finding && (
            <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {finding}
            </p>
          )}

          {values.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 sm:grid-cols-3">
              {values.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="truncate text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {labelize(k)}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {fmtValue(k, v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-3 space-y-3">
            {insight.calculation && (
              <MetaRow icon={Calculator} label="How this was calculated">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {insight.calculation}
                </code>
              </MetaRow>
            )}
            {insight.whyItMatters && (
              <MetaRow icon={Info} label="Why it matters">
                {insight.whyItMatters}
              </MetaRow>
            )}
            {insight.nextStep && (
              <MetaRow icon={Compass} label="Suggested next step">
                {insight.nextStep}
              </MetaRow>
            )}
          </div>

          {insight.caveat && (
            <p className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Confidence note: </span>
                {insight.caveat}
              </span>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

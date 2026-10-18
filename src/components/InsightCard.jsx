/**
 * InsightCard.jsx — renders one auto-generated insight.
 * Props: { insight } where insight = { id, title, body, kind }.
 * kind ∈ 'info' | 'warning' | 'success' (falls back to info).
 */
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';

const KIND_ICON = {
  info: Info,
  warning: AlertTriangle,
  success: TrendingUp,
};

const KIND_STYLE = {
  info: 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

export default function InsightCard({ insight }) {
  if (!insight) return null;
  const kind = insight.kind && KIND_ICON[insight.kind] ? insight.kind : 'info';
  const Icon = KIND_ICON[kind];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${KIND_STYLE[kind]}`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {insight.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {insight.body}
        </p>
      </div>
    </div>
  );
}

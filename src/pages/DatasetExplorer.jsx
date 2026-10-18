/**
 * DatasetExplorer.jsx — browse rows: dataset header + DataTable.
 * Shows an EmptyState when no dataset is loaded.
 */
import { Database } from 'lucide-react';
import { useData } from '../context/DataContext';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';

export default function DatasetExplorer() {
  const { dataset } = useData();

  if (!dataset) {
    return (
      <EmptyState
        icon={Database}
        title="No dataset loaded"
        message="Upload a CSV or Excel file from the Overview page to start exploring your data."
        action={
          <p className="text-xs text-slate-400 dark:text-slate-500">
            The Overview page also offers a sample dataset generated locally in
            your browser.
          </p>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          {dataset.name}
        </h1>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {dataset.rows.length.toLocaleString()} rows ×{' '}
          {dataset.columns.length} cols
        </span>
      </div>
      <DataTable dataset={dataset} />
    </div>
  );
}

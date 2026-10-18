import { Database, Snowflake, Cloud, X, AlertTriangle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { generateSampleData, SAMPLE_SCHEMA } from '../utils/sampleData';

const CONNECTORS = [
  { id: 'postgres', label: 'PostgreSQL', Icon: Database },
  { id: 'snowflake', label: 'Snowflake', Icon: Snowflake },
  { id: 'bigquery', label: 'BigQuery', Icon: Cloud },
];

export default function ConnectorModal({ open, onClose }) {
  const { setDataset } = useData();

  if (!open) return null;

  const handleLoad = () => {
    const ds = generateSampleData();
    setDataset({
      ...ds,
      meta: {
        ...ds.meta,
        source: 'connector',
        note: 'Loaded via mock connector (sample data)',
      },
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Connect a data source</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          {CONNECTORS.map(({ id, label, Icon }) => (
            <div
              key={id}
              className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3"
            >
              <Icon className="h-5 w-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </div>
          ))}
        </div>

        <h3 className="mt-5 text-sm font-semibold text-gray-900">Schema preview</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Table</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Column</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_SCHEMA.flatMap((t) =>
                t.columns.map((c) => (
                  <tr key={`${t.table}.${c.name}`} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-700">{t.table}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-gray-800">
                      {c.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{c.type}</td>
                    <td className="px-3 py-1.5 text-gray-600">{c.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Mock connector — no real connection is made; loads the local sample dataset.
          </span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLoad}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Load sample data
          </button>
        </div>
      </div>
    </div>
  );
}

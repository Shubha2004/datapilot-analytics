/**
 * DataQuality.jsx — quality report + interactive cleaning operations.
 * Cleaning ops run the pure helpers from utils/cleaning.js with a preview
 * step; Apply requires window.confirm and calls updateDataset; Undo calls
 * resetDataset() to restore the original.
 */
import { useMemo, useState } from 'react';
import { BrushCleaning, Eye, RotateCcw, Undo2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { isMissing } from '../utils/dataTypes';
import {
  removeDuplicates,
  dropRowsWithMissing,
  fillNumeric,
  fillCategorical,
  trimWhitespace,
  convertColumnType,
} from '../utils/cleaning';
import DataQualityPanel from '../components/DataQualityPanel';
import EmptyState from '../components/EmptyState';

const OPERATIONS = [
  { value: 'remove-duplicates', label: 'Remove duplicate rows' },
  { value: 'drop-missing', label: 'Drop rows with missing values' },
  { value: 'fill-numeric', label: 'Fill missing numeric values' },
  { value: 'fill-categorical', label: 'Fill missing categorical values' },
  { value: 'trim-whitespace', label: 'Trim whitespace from text' },
  { value: 'convert-type', label: 'Convert column type' },
];

const TARGET_TYPES = ['numeric', 'date', 'string'];

function runOperation(op, dataset, params) {
  const rows = dataset.rows;
  switch (op) {
    case 'remove-duplicates': {
      const r = removeDuplicates(rows);
      return {
        rows: r.rows,
        changed: r.removed,
        detail: `${r.removed.toLocaleString()} duplicate rows removed`,
      };
    }
    case 'drop-missing': {
      const cols = params.dropColumns.length > 0 ? params.dropColumns : dataset.columns.map((c) => c.name);
      const r = dropRowsWithMissing(rows, cols);
      return {
        rows: r.rows,
        changed: r.removed,
        detail: `${r.removed.toLocaleString()} rows dropped (missing in: ${cols.join(', ')})`,
      };
    }
    case 'fill-numeric': {
      const r = fillNumeric(rows, params.column, params.method);
      return {
        rows: r.rows,
        changed: r.filled,
        detail:
          r.value === null
            ? 'No numeric values found to fill from'
            : `${r.filled.toLocaleString()} cells filled with ${params.method} (${r.value})`,
      };
    }
    case 'fill-categorical': {
      const r = fillCategorical(rows, params.column, params.fillValue);
      return {
        rows: r.rows,
        changed: r.filled,
        detail: `${r.filled.toLocaleString()} cells filled with "${params.fillValue}"`,
      };
    }
    case 'trim-whitespace': {
      const r = trimWhitespace(rows);
      return {
        rows: r.rows,
        changed: r.changed,
        detail: `${r.changed.toLocaleString()} cells trimmed`,
      };
    }
    case 'convert-type': {
      const r = convertColumnType(rows, params.column, params.targetType);
      return {
        rows: r.rows,
        changed: r.converted,
        detail: `${r.converted.toLocaleString()} cells converted, ${r.failed.toLocaleString()} failed`,
      };
    }
    default:
      throw new Error(`Unknown operation: ${op}`);
  }
}

const selectCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder-slate-500';

export default function DataQuality() {
  const { dataset, originalDataset, updateDataset, resetDataset } = useData();
  const [op, setOp] = useState('remove-duplicates');
  const [column, setColumn] = useState('');
  const [method, setMethod] = useState('mean');
  const [fillValue, setFillValue] = useState('Unknown');
  const [targetType, setTargetType] = useState('numeric');
  const [dropColumns, setDropColumns] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');

  const columns = useMemo(() => (dataset ? dataset.columns : []), [dataset]);
  const numericCols = useMemo(
    () => columns.filter((c) => c.type === 'numeric'),
    [columns],
  );
  const categoricalCols = useMemo(
    () => columns.filter((c) => c.type === 'categorical' || c.type === 'boolean'),
    [columns],
  );

  // Sensible default column whenever the operation changes.
  const pickDefaultColumn = (nextOp) => {
    if (nextOp === 'fill-numeric') return numericCols[0]?.name || '';
    if (nextOp === 'fill-categorical') return categoricalCols[0]?.name || '';
    if (nextOp === 'convert-type') return columns[0]?.name || '';
    return '';
  };

  const handleOpChange = (nextOp) => {
    setOp(nextOp);
    setColumn(pickDefaultColumn(nextOp));
    setPreview(null);
    setPreviewError('');
  };

  const toggleDropColumn = (name) => {
    setDropColumns((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
    setPreview(null);
  };

  const canRun = dataset && dataset.rows.length > 0;

  const needsColumn =
    op === 'fill-numeric' || op === 'fill-categorical' || op === 'convert-type';

  const handlePreview = () => {
    if (!canRun) return;
    setPreviewError('');
    try {
      if (needsColumn && !column) {
        setPreviewError('Select a column for this operation.');
        return;
      }
      if (op === 'fill-categorical' && fillValue.trim() === '') {
        setPreviewError('Enter a fill value.');
        return;
      }
      const result = runOperation(op, dataset, {
        column,
        method,
        fillValue,
        targetType,
        dropColumns,
      });
      setPreview({
        before: dataset.rows.length,
        after: result.rows.length,
        changed: result.changed,
        detail: result.detail,
        rows: result.rows.slice(0, 8),
        colNames: dataset.columns.map((c) => c.name),
        resultRows: result.rows,
      });
    } catch (e) {
      setPreviewError(e.message || 'Preview failed.');
    }
  };

  const handleApply = () => {
    if (!preview) return;
    const opLabel = OPERATIONS.find((o) => o.value === op)?.label || op;
    const ok = window.confirm(
      `Apply "${opLabel}"?\n\n${preview.detail}.\n\nOriginal can be restored with Undo.`,
    );
    if (!ok) return;
    updateDataset(preview.resultRows, `${opLabel}: ${preview.detail}`);
    setPreview(null);
  };

  const handleUndo = () => {
    resetDataset();
    setPreview(null);
    setPreviewError('');
  };

  // Dataset differs from original once a cleaning op has been applied
  // (updateDataset builds a new object; resetDataset restores the reference).
  const isDirty =
    !!dataset && !!originalDataset && dataset !== originalDataset;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
        Data Quality
      </h1>

      {!dataset ? (
        <EmptyState
          icon={BrushCleaning}
          title="No dataset loaded"
          message="Upload a file or load the sample dataset from the Overview page to check quality and run cleaning operations."
        />
      ) : (
        <>
          <DataQualityPanel dataset={dataset} />

          {/* Cleaning operations */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">
              Cleaning operations
            </h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Preview first — nothing changes until you confirm Apply.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Operation
                </label>
                <select
                  value={op}
                  onChange={(e) => handleOpChange(e.target.value)}
                  className={selectCls}
                >
                  {OPERATIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {op === 'fill-numeric' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Numeric column
                    </label>
                    <select
                      value={column}
                      onChange={(e) => {
                        setColumn(e.target.value);
                        setPreview(null);
                      }}
                      className={selectCls}
                    >
                      {numericCols.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Fill method
                    </label>
                    <select
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value);
                        setPreview(null);
                      }}
                      className={selectCls}
                    >
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                    </select>
                  </div>
                </>
              )}

              {op === 'fill-categorical' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Categorical column
                    </label>
                    <select
                      value={column}
                      onChange={(e) => {
                        setColumn(e.target.value);
                        setPreview(null);
                      }}
                      className={selectCls}
                    >
                      {categoricalCols.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Fill value
                    </label>
                    <input
                      type="text"
                      value={fillValue}
                      onChange={(e) => {
                        setFillValue(e.target.value);
                        setPreview(null);
                      }}
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              {op === 'convert-type' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Column
                    </label>
                    <select
                      value={column}
                      onChange={(e) => {
                        setColumn(e.target.value);
                        setPreview(null);
                      }}
                      className={selectCls}
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Target type
                    </label>
                    <select
                      value={targetType}
                      onChange={(e) => {
                        setTargetType(e.target.value);
                        setPreview(null);
                      }}
                      className={selectCls}
                    >
                      {TARGET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {op === 'drop-missing' && (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Drop rows missing in (empty = any column)
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-300 p-2 dark:border-slate-700">
                    {columns.map((c) => (
                      <label
                        key={c.name}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={dropColumns.includes(c.name)}
                          onChange={() => toggleDropColumn(c.name)}
                          className="h-3.5 w-3.5 rounded accent-indigo-600"
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {previewError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {previewError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handlePreview}
                disabled={!canRun}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Eye size={15} />
                Preview
              </button>
              <button
                onClick={handleApply}
                disabled={!preview}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                <BrushCleaning size={15} />
                Apply
              </button>
              {isDirty && (
                <button
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                >
                  <Undo2 size={15} />
                  Undo / Restore original
                </button>
              )}
            </div>

            {/* Preview result */}
            {preview && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
                  <span>
                    Rows: <strong>{preview.before.toLocaleString()}</strong> →{' '}
                    <strong>{preview.after.toLocaleString()}</strong>
                  </span>
                  <span>
                    Changed:{' '}
                    <strong>{preview.changed.toLocaleString()}</strong>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {preview.detail}
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60">
                        {preview.colNames.map((name) => (
                          <th
                            key={name}
                            className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-300"
                          >
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                        >
                          {preview.colNames.map((name) => (
                            <td
                              key={name}
                              className="max-w-[200px] truncate px-2 py-1.5 text-slate-700 dark:text-slate-300"
                              title={isMissing(row[name]) ? '' : String(row[name])}
                            >
                              {isMissing(row[name]) ? '—' : String(row[name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <RotateCcw size={11} />
                  Showing first 8 resulting rows. Apply to make this the active
                  dataset.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

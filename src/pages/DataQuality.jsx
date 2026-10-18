/**
 * DataQuality.jsx — quality report + interactive cleaning operations.
 * Cleaning ops run the pure helpers from utils/cleaning.js with a preview
 * step; nothing changes until the user explicitly confirms Apply.
 * Every applied step is recorded in a transformation history; each step can
 * be reverted (reverting a step also undoes the steps applied after it),
 * and "Restore original" resets to the last-loaded dataset.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BrushCleaning,
  Download,
  Eye,
  RotateCcw,
  Undo2,
  History,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { isMissing, inferColumns } from '../utils/dataTypes';
import { exportDQReportCSV } from '../utils/exportUtils';
import {
  analyzeQuality,
  removeDuplicates,
  dropRowsWithMissing,
  fillNumeric,
  fillCategorical,
  trimWhitespace,
  convertColumnType,
  renameColumn,
  removeColumn,
  validateRename,
  validateRemove,
  validateFillNumeric,
  validateFillCategorical,
  validateConvertType,
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
  { value: 'rename-column', label: 'Rename a column' },
  { value: 'remove-column', label: 'Remove a column' },
];

const TARGET_TYPES = ['numeric', 'date', 'string'];

/**
 * Plain-language notes on how each operation can change analytical results.
 * Recorded on every history entry so cleaning is never silent.
 */
const IMPACT_NOTES = {
  'remove-duplicates':
    'Removing duplicates lowers row counts and can shift totals and averages — recorded here so results stay reproducible.',
  'drop-missing':
    'Dropping rows with missing values shrinks the sample and can bias results if the missingness is not random.',
  'fill-numeric':
    'Replacing missing values with the mean shrinks variance and can bias averages — documented here for reproducibility.',
  'fill-categorical':
    'Filling missing categories with a fixed value concentrates that value and can skew distributions.',
  'trim-whitespace':
    'Trimming whitespace only changes text spacing; numeric results are unaffected, but category groupings may merge.',
  'convert-type':
    'Changing column types alters how values aggregate (e.g. text → number); cells that could not be converted were left unchanged.',
  'rename-column':
    'Renaming a column does not change any values; downstream references must use the new name.',
  'remove-column':
    'Removing a column deletes it from every row; any analysis that used it is no longer possible.',
};

/**
 * Compress an analyzeQuality() result to the four headline numbers stored
 * on each audit entry. missingPct is the share of missing cells over the
 * whole table (rows × columns).
 */
function qualitySnapshot(quality, rowCount, colCount) {
  const byCol = Array.isArray(quality?.missingByColumn)
    ? quality.missingByColumn
    : [];
  const missingCells = byCol.reduce((a, c) => a + (c.missing || 0), 0);
  const totalCells = (rowCount || 0) * (colCount || 0);
  return {
    missingPct:
      totalCells > 0
        ? Math.round(((missingCells / totalCells) * 100 + Number.EPSILON) * 100) /
          100
        : 0,
    duplicateRows: quality?.duplicateRows ?? 0,
    invalidNumericCount: (quality?.invalidNumeric || []).reduce(
      (a, d) => a + (d.count || 0),
      0
    ),
    outlierCount: (quality?.outliers || []).reduce(
      (a, o) => a + (o.count || 0),
      0
    ),
  };
}

/** Column names affected by an operation (for the audit log). */
function affectedColumns(op, dataset, params) {
  const all = dataset.columns.map((c) => c.name);
  switch (op) {
    case 'drop-missing':
      return params.dropColumns.length > 0 ? params.dropColumns : all;
    case 'fill-numeric':
    case 'fill-categorical':
    case 'convert-type':
    case 'remove-column':
      return params.column ? [params.column] : [];
    case 'rename-column':
      return params.column
        ? [`${params.column} → ${String(params.newName).trim()}`]
        : [];
    default:
      // remove-duplicates and trim-whitespace scan every row/column.
      return all;
  }
}

/** Validate preconditions, then run the op. Throws Error on invalid input. */
function runOperation(op, dataset, params) {
  const rows = dataset.rows;
  const colNames = dataset.columns.map((c) => c.name);
  const base = { afterColumns: colNames };

  switch (op) {
    case 'remove-duplicates': {
      const r = removeDuplicates(rows);
      return {
        ...base,
        rows: r.rows,
        changed: r.removed,
        detail: `${r.removed.toLocaleString()} duplicate rows removed`,
      };
    }
    case 'drop-missing': {
      const cols =
        params.dropColumns.length > 0 ? params.dropColumns : colNames;
      const r = dropRowsWithMissing(rows, cols);
      return {
        ...base,
        rows: r.rows,
        changed: r.removed,
        detail: `${r.removed.toLocaleString()} rows dropped (missing in: ${cols.join(', ')})`,
      };
    }
    case 'fill-numeric': {
      const v = validateFillNumeric(dataset, params.column, params.method);
      if (!v.ok) throw new Error(v.error);
      const r = fillNumeric(rows, params.column, params.method);
      return {
        ...base,
        rows: r.rows,
        changed: r.filled,
        detail: `${r.filled.toLocaleString()} cells filled with ${params.method} (${r.value})`,
      };
    }
    case 'fill-categorical': {
      const v = validateFillCategorical(dataset, params.column, params.fillValue);
      if (!v.ok) throw new Error(v.error);
      const r = fillCategorical(rows, params.column, v.value);
      return {
        ...base,
        rows: r.rows,
        changed: r.filled,
        detail: `${r.filled.toLocaleString()} cells filled with "${v.value}"`,
      };
    }
    case 'trim-whitespace': {
      const r = trimWhitespace(rows);
      return {
        ...base,
        rows: r.rows,
        changed: r.changed,
        detail: `${r.changed.toLocaleString()} cells trimmed`,
      };
    }
    case 'convert-type': {
      const v = validateConvertType(dataset, params.column, params.targetType);
      if (!v.ok) throw new Error(v.error);
      const r = convertColumnType(rows, params.column, params.targetType);
      return {
        ...base,
        rows: r.rows,
        changed: r.converted,
        detail:
          `${r.converted.toLocaleString()} cells converted to ${params.targetType}` +
          (r.failed > 0
            ? `, ${r.failed.toLocaleString()} could not be converted and were left unchanged`
            : ''),
      };
    }
    case 'rename-column': {
      const v = validateRename(params.column, params.newName, colNames);
      if (!v.ok) throw new Error(v.error);
      const r = renameColumn(rows, params.column, v.name);
      return {
        rows: r.rows,
        changed: r.changed,
        detail: `Renamed column "${params.column}" → "${v.name}" (${r.changed.toLocaleString()} rows)`,
        afterColumns: colNames.map((n) =>
          n === params.column ? v.name : n,
        ),
      };
    }
    case 'remove-column': {
      const v = validateRemove(params.column, colNames);
      if (!v.ok) throw new Error(v.error);
      const r = removeColumn(rows, params.column);
      return {
        rows: r.rows,
        changed: r.removed,
        detail: `Removed column "${params.column}" — ${r.removed.toLocaleString()} cells in ${rows.length.toLocaleString()} rows deleted`,
        afterColumns: colNames.filter((n) => n !== params.column),
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
  const toast = useToast();
  const [op, setOp] = useState('remove-duplicates');
  const [column, setColumn] = useState('');
  const [newName, setNewName] = useState('');
  const [method, setMethod] = useState('mean');
  const [fillValue, setFillValue] = useState('Unknown');
  const [targetType, setTargetType] = useState('numeric');
  const [dropColumns, setDropColumns] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [revertTarget, setRevertTarget] = useState(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  // Ordered history of applied steps. Each entry keeps a snapshot of the
  // rows *before* the step, so any step can be reverted individually
  // (reverting a step also undoes the steps applied after it, since those
  // were computed from its result).
  const [history, setHistory] = useState([]);

  const columns = useMemo(() => (dataset ? dataset.columns : []), [dataset]);
  const numericCols = useMemo(
    () => columns.filter((c) => c.type === 'numeric'),
    [columns],
  );
  const categoricalCols = useMemo(
    () =>
      columns.filter((c) => c.type === 'categorical' || c.type === 'boolean'),
    [columns],
  );

  // A freshly loaded dataset starts a clean slate: history snapshots belong
  // to the previous dataset.
  useEffect(() => {
    setHistory([]);
    setPreview(null);
    setPreviewError('');
    setConfirming(false);
    setApplying(false);
    setRevertTarget(null);
    setRestoreOpen(false);
  }, [originalDataset]);

  // Sensible default column whenever the operation changes.
  const pickDefaultColumn = (nextOp) => {
    if (nextOp === 'fill-numeric') return numericCols[0]?.name || '';
    if (nextOp === 'fill-categorical') return categoricalCols[0]?.name || '';
    if (
      nextOp === 'convert-type' ||
      nextOp === 'rename-column' ||
      nextOp === 'remove-column'
    )
      return columns[0]?.name || '';
    return '';
  };

  const handleOpChange = (nextOp) => {
    setOp(nextOp);
    setColumn(pickDefaultColumn(nextOp));
    setNewName('');
    setPreview(null);
    setPreviewError('');
    setConfirming(false);
  };

  const toggleDropColumn = (name) => {
    setDropColumns((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
    setPreview(null);
    setConfirming(false);
  };

  const canRun = dataset && dataset.rows.length > 0;

  const needsColumn =
    op === 'fill-numeric' ||
    op === 'fill-categorical' ||
    op === 'convert-type' ||
    op === 'rename-column' ||
    op === 'remove-column';

  // Live validation feedback for renames.
  const renameCheck =
    op === 'rename-column' && column
      ? validateRename(
          column,
          newName,
          columns.map((c) => c.name),
        )
      : null;

  const handlePreview = () => {
    if (!canRun) return;
    setPreviewError('');
    setConfirming(false);
    try {
      if (needsColumn && !column) {
        setPreviewError('Select a column for this operation.');
        return;
      }
      const result = runOperation(op, dataset, {
        column,
        newName,
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
        afterColumns: result.afterColumns,
        resultRows: result.rows,
      });
    } catch (e) {
      setPreviewError(e.message || 'Preview failed.');
    }
  };

  // Step 1 of the explicit confirm: show the confirmation panel.
  const handleApply = () => {
    if (!preview) return;
    setConfirming(true);
  };

  // Step 2: the user confirmed — record history and apply. The apply is
  // synchronous but re-infers columns over every row, so it can block on
  // large datasets; defer a tick so the spinner paints first.
  const handleConfirmApply = () => {
    if (!preview || applying) return;
    const opLabel = OPERATIONS.find((o) => o.value === op)?.label || op;
    // Snapshot before the deferred run; the user can't change inputs while
    // the apply button is disabled. Params are captured now because the
    // drop-column selection is cleared after a successful apply.
    const detail = preview.detail;
    const resultRows = preview.resultRows;
    const beforeRows = dataset.rows;
    const opParams = { column, newName, method, fillValue, targetType, dropColumns };
    setApplying(true);
    setTimeout(() => {
      try {
        // Audit snapshots: headline quality numbers before and after this
        // step. analyzeQuality is pure and O(rows × columns) — cheap enough
        // to run twice per explicit user-confirmed apply.
        const beforeDs = {
          name: dataset.name,
          columns: dataset.columns,
          rows: beforeRows,
          meta: dataset.meta,
        };
        const qualityBefore = qualitySnapshot(
          analyzeQuality(beforeDs),
          beforeRows.length,
          dataset.columns.length
        );
        const afterColumns = inferColumns(resultRows);
        const qualityAfter = qualitySnapshot(
          analyzeQuality({
            name: dataset.name,
            columns: afterColumns,
            rows: resultRows,
            meta: dataset.meta,
          }),
          resultRows.length,
          afterColumns.length
        );
        const entry = {
          id: `step-${Date.now().toString(36)}`,
          label: opLabel,
          detail,
          at: new Date().toISOString(),
          // Pre-step snapshot: pure ops never mutate, so this reference stays
          // a faithful, recoverable copy of the data before the step.
          beforeRows,
          // Audit fields — nothing is ever applied silently.
          op,
          columns: affectedColumns(op, dataset, opParams),
          rowsBefore: beforeRows.length,
          rowsAfter: resultRows.length,
          rowsAffected: preview.changed,
          qualityBefore,
          qualityAfter,
          impactNote: IMPACT_NOTES[op] || '',
        };
        setHistory((h) => [...h, entry]);
        updateDataset(resultRows, `${opLabel}: ${detail}`);
        toast.success(`Applied “${opLabel}”.`);
      } catch (e) {
        toast.error(`Apply failed: ${e?.message || e}`);
      } finally {
        setPreview(null);
        setConfirming(false);
        setDropColumns([]);
        setApplying(false);
      }
    }, 30);
  };

  /** Open the confirmation dialog to revert history step `index`. */
  const handleRevertStep = (index) => {
    const entry = history[index];
    if (!entry) return;
    setRevertTarget({ index, entry, later: history.length - index - 1 });
  };

  /** The user confirmed the revert — roll back to before that step. */
  const confirmRevertStep = () => {
    if (!revertTarget) return;
    const { index, entry } = revertTarget;
    updateDataset(
      entry.beforeRows,
      `Reverted to before step ${index + 1}: ${entry.label}`,
    );
    setHistory((h) => h.slice(0, index));
    setPreview(null);
    setPreviewError('');
    setConfirming(false);
    setRevertTarget(null);
    toast.success(`Reverted to before step ${index + 1}: ${entry.label}.`);
  };

  /** Open the confirmation dialog to restore the original dataset. */
  const handleRestoreOriginal = () => {
    setRestoreOpen(true);
  };

  /** The user confirmed — discard all cleaning steps. */
  const confirmRestoreOriginal = () => {
    resetDataset();
    setHistory([]);
    setPreview(null);
    setPreviewError('');
    setConfirming(false);
    setRestoreOpen(false);
    toast.success('Original dataset restored. All cleaning steps discarded.');
  };

  /** Export the full quality report (current metrics + audit log) as CSV. */
  const handleExportDQReport = () => {
    if (!dataset) return;
    try {
      exportDQReportCSV(dataset.name, analyzeQuality(dataset), history);
      toast.success('Quality report exported as CSV.');
    } catch (e) {
      toast.error(`Export failed: ${e?.message || e}`);
    }
  };

  // Dataset differs from original once a cleaning op has been applied
  // (updateDataset builds a new object; resetDataset restores the reference).
  const isDirty = !!dataset && !!originalDataset && dataset !== originalDataset;

  const opLabel = OPERATIONS.find((o) => o.value === op)?.label || op;
  const columnsChanged =
    preview &&
    preview.afterColumns.join('|') !== preview.colNames.join('|');

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
                        setConfirming(false);
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
                        setConfirming(false);
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
                        setConfirming(false);
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
                        setConfirming(false);
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
                        setConfirming(false);
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
                        setConfirming(false);
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

              {op === 'rename-column' && (
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
                        setConfirming(false);
                      }}
                      className={selectCls}
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      New name
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setPreview(null);
                        setConfirming(false);
                      }}
                      placeholder="e.g. order_id"
                      className={inputCls}
                    />
                    {renameCheck && newName.trim() !== '' && (
                      <p
                        className={`mt-1 text-xs ${renameCheck.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {renameCheck.ok
                          ? `“${column}” will be renamed to “${renameCheck.name}”.`
                          : renameCheck.error}
                      </p>
                    )}
                  </div>
                </>
              )}

              {op === 'remove-column' && (
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
                        setConfirming(false);
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
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      Removing a column deletes it from every row. Preview and
                      confirm carefully — you can revert afterwards from the
                      history below.
                    </span>
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

            {/* Toolbar: interactive controls are hidden when printing. */}
            <div className="no-print mt-4 flex flex-wrap gap-2">
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
                disabled={!preview || confirming || applying}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {applying ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <BrushCleaning size={15} />
                )}
                {applying ? 'Applying…' : 'Apply'}
              </button>
              {isDirty && (
                <button
                  onClick={handleRestoreOriginal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                >
                  <Undo2 size={15} />
                  Undo / Restore original
                </button>
              )}
            </div>

            {/* Explicit in-app confirmation before anything changes */}
            {confirming && preview && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  <AlertTriangle size={15} />
                  Confirm: apply “{opLabel}”?
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                  {preview.detail}. Rows: {preview.before.toLocaleString()} →{' '}
                  {preview.after.toLocaleString()}.
                  {columnsChanged &&
                    ` Columns: ${preview.colNames.length} → ${preview.afterColumns.length}.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={handleConfirmApply}
                    disabled={applying}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {applying ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <BrushCleaning size={15} />
                    )}
                    {applying ? 'Applying…' : 'Yes, apply this change'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                  {columnsChanged && (
                    <span>
                      Columns: <strong>{preview.colNames.length}</strong> →{' '}
                      <strong>{preview.afterColumns.length}</strong>
                    </span>
                  )}
                  <span className="text-slate-500 dark:text-slate-400">
                    {preview.detail}
                  </span>
                </div>
                {columnsChanged && (
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {preview.colNames.join(', ')} →{' '}
                    {preview.afterColumns.join(', ')}
                  </p>
                )}
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60">
                        {preview.afterColumns.map((name) => (
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
                          {preview.afterColumns.map((name) => (
                            <td
                              key={name}
                              className="max-w-[200px] truncate px-2 py-1.5 text-slate-700 dark:text-slate-300"
                              title={
                                isMissing(row[name]) ? '' : String(row[name])
                              }
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

            {/* Transformation history */}
            {history.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                  <History size={15} />
                  Transformation history ({history.length})
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Each step stores the data from before it ran. Reverting a
                  step also undoes the steps applied after it.
                </p>
                <ol className="mt-2 space-y-1.5">
                  {history.map((entry, i) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          Step {i + 1}: {entry.label}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {entry.detail}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevertStep(i)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Undo2 size={12} />
                        Revert to here
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Audit log: plain-language record of every cleaning step, with
                before/after quality numbers so nothing is applied silently. */}
            {history.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    <History size={15} />
                    Audit log ({history.length})
                  </h3>
                  <button
                    onClick={handleExportDQReport}
                    className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Download size={14} />
                    Export quality report (CSV)
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Each entry records what changed and how the headline quality
                  metrics moved, plus a plain-language note on how the step can
                  affect analytical results.
                </p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-950/60">
                        <th className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          Time
                        </th>
                        <th className="px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          Operation
                        </th>
                        <th className="px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          Column(s)
                        </th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          Rows affected
                        </th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          Missing %
                        </th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          Duplicates
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => {
                        const cols = Array.isArray(entry.columns)
                          ? entry.columns
                          : [];
                        const qb = entry.qualityBefore || {};
                        const qa = entry.qualityAfter || {};
                        const fmt = (v) =>
                          typeof v === 'number'
                            ? v.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })
                            : '—';
                        return (
                          <tr
                            key={entry.id}
                            className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800/60"
                          >
                            <td className="whitespace-nowrap px-2 py-1.5 text-slate-500 dark:text-slate-400">
                              {entry.at
                                ? new Date(entry.at).toLocaleString()
                                : '—'}
                            </td>
                            <td className="max-w-[320px] px-2 py-1.5">
                              <p className="font-medium text-slate-800 dark:text-slate-200">
                                {entry.label}
                              </p>
                              {entry.impactNote && (
                                <p className="mt-0.5 text-slate-500 italic dark:text-slate-400">
                                  {entry.impactNote}
                                </p>
                              )}
                            </td>
                            <td className="max-w-[200px] truncate px-2 py-1.5 text-slate-700 dark:text-slate-300">
                              {cols.join(', ') || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                              {(entry.rowsAffected ?? 0).toLocaleString()}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-slate-700 dark:text-slate-300">
                              {fmt(qb.missingPct)}% → {fmt(qa.missingPct)}%
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-slate-700 dark:text-slate-300">
                              {fmt(qb.duplicateRows)} → {fmt(qa.duplicateRows)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Revert-step confirmation */}
      <ConfirmDialog
        open={revertTarget !== null}
        title={
          revertTarget ? `Revert "${revertTarget.entry.label}"?` : 'Revert step?'
        }
        description={
          revertTarget
            ? `${revertTarget.entry.detail}. ` +
              (revertTarget.later > 0
                ? `This also undoes the ${revertTarget.later} step${revertTarget.later === 1 ? '' : 's'} applied after it.`
                : 'The dataset returns to how it was before this step.')
            : ''
        }
        confirmLabel="Revert"
        destructive
        onConfirm={confirmRevertStep}
        onCancel={() => setRevertTarget(null)}
      />

      {/* Restore-original confirmation */}
      <ConfirmDialog
        open={restoreOpen}
        title="Restore original dataset?"
        description="All cleaning steps will be discarded. The dataset returns to how it was when last loaded."
        confirmLabel="Restore original"
        destructive
        onConfirm={confirmRestoreOriginal}
        onCancel={() => setRestoreOpen(false)}
      />
    </div>
  );
}

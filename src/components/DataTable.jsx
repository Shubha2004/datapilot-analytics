/**
 * DataTable.jsx — full-featured TanStack table for dataset exploration.
 * Props: { dataset }.
 * Features: global search, per-column filters, sortable headers, pagination,
 * column visibility toggle, footer with reset + filtered CSV export.
 */
import { useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { isMissing, toNumber } from '../utils/dataTypes';
import { downloadCSV } from '../utils/exportUtils';
import EmptyState from './EmptyState';
import { useToast } from './Toast';

/* ------------------------------------------------------------------ */
/* Filter value shape: { text, nullness, min, max }                     */
/* ------------------------------------------------------------------ */

const EMPTY_FILTER = { text: '', nullness: 'all', min: '', max: '' };

/** Single filterFn handling text / range / nullness for any column type. */
function combinedFilterFn(row, columnId, filterValue) {
  const fv = { ...EMPTY_FILTER, ...(filterValue || {}) };
  const hasText = fv.text !== '' && fv.text != null;
  const hasRange =
    (fv.min !== '' && fv.min != null) || (fv.max !== '' && fv.max != null);
  if (fv.nullness === 'all' && !hasText && !hasRange) return true;

  const cell = row.getValue(columnId);
  if (fv.nullness === 'null') return isMissing(cell);
  if (fv.nullness === 'notnull' && isMissing(cell)) return false;
  if (isMissing(cell)) return false;

  if (hasText) {
    const ok = String(cell)
      .toLowerCase()
      .includes(String(fv.text).toLowerCase());
    if (!ok) return false;
  }

  if (hasRange) {
    const n = toNumber(cell);
    if (n === null) return false;
    if (fv.min !== '' && fv.min != null && n < Number(fv.min)) return false;
    if (fv.max !== '' && fv.max != null && n > Number(fv.max)) return false;
  }
  return true;
}

const TYPE_BADGE = {
  numeric:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  categorical:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  date: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  boolean:
    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
};

function cellText(v) {
  if (isMissing(v)) return '—';
  return String(v);
}

/* ------------------------------------------------------------------ */
/* Per-column filter UI                                                */
/* ------------------------------------------------------------------ */

function ColumnFilter({ column, type }) {
  const raw = column.getFilterValue();
  const fv = { ...EMPTY_FILTER, ...(raw || {}) };
  const set = (patch) => {
    const next = { ...fv, ...patch };
    const empty =
      next.text === '' && next.nullness === 'all' && next.min === '' && next.max === '';
    column.setFilterValue(empty ? undefined : next);
  };

  const inputCls =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500';
  const isNumeric = type === 'numeric';

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type={isNumeric ? 'number' : 'text'}
        placeholder={isNumeric ? 'min' : 'contains…'}
        value={isNumeric ? fv.min : fv.text}
        onChange={(e) =>
          set(isNumeric ? { min: e.target.value } : { text: e.target.value })
        }
        className={`${inputCls} min-w-[52px] max-w-[84px]`}
        aria-label={`Filter ${column.id} min or text`}
      />
      {isNumeric && (
        <input
          type="number"
          placeholder="max"
          value={fv.max}
          onChange={(e) => set({ max: e.target.value })}
          className={`${inputCls} min-w-[52px] max-w-[84px]`}
          aria-label={`Filter ${column.id} max`}
        />
      )}
      <select
        value={fv.nullness}
        onChange={(e) => set({ nullness: e.target.value })}
        className={`${inputCls} w-auto max-w-[92px]`}
        aria-label={`Null filter for ${column.id}`}
      >
        <option value="all">All</option>
        <option value="null">Is null</option>
        <option value="notnull">Not null</option>
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function DataTable({ dataset }) {
  const toast = useToast();
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [showColsMenu, setShowColsMenu] = useState(false);
  const colsMenuRef = useRef(null);

  const columns = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.map((col) => ({
      id: col.name,
      accessorKey: col.name,
      filterFn: 'combined',
      header: () => (
        <span className="inline-flex items-center gap-1.5">
          <span>{col.name}</span>
          <span
            className={`rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              TYPE_BADGE[col.type] || TYPE_BADGE.categorical
            }`}
          >
            {col.type}
          </span>
        </span>
      ),
      cell: ({ getValue }) => (
        <span
          className={`block max-w-[280px] truncate ${
            isMissing(getValue()) ? 'text-slate-400 dark:text-slate-600' : ''
          }`}
          title={isMissing(getValue()) ? '' : String(getValue())}
        >
          {cellText(getValue())}
        </span>
      ),
    }));
  }, [dataset]);

  const data = useMemo(
    () => (dataset ? dataset.rows : []),
    [dataset],
  );

  const colTypes = useMemo(() => {
    const map = {};
    for (const c of dataset?.columns || []) map[c.name] = c.type;
    return map;
  }, [dataset]);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, columnFilters, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    filterFns: { combined: combinedFilterFn },
    globalFilterFn: 'includesString',
    initialState: { pagination: { pageSize: 25 } },
  });

  if (!dataset) {
    return (
      <EmptyState
        icon={Search}
        title="No dataset loaded"
        message="Upload a CSV or Excel file, or load the sample dataset to explore rows here."
      />
    );
  }

  const hasFilters =
    globalFilter !== '' || columnFilters.length > 0 || sorting.length > 0;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const start = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, filteredCount);

  const resetAll = () => {
    setGlobalFilter('');
    setColumnFilters([]);
    setSorting([]);
    table.setPageIndex(0);
  };

  const exportFiltered = () => {
    const visibleCols = table
      .getVisibleLeafColumns()
      .map((c) => c.id);
    const filteredRows = table
      .getFilteredRowModel()
      .rows.map((r) => r.original);
    try {
      downloadCSV(
        `${dataset.name || 'dataset'}-filtered.csv`,
        visibleCols,
        filteredRows,
      );
      toast.success(`Exported ${filteredRows.length} filtered rows to CSV.`);
    } catch (err) {
      toast.error(`CSV export failed: ${err.message}`);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search all columns…"
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder-slate-500"
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Column visibility */}
        <div className="relative" ref={colsMenuRef}>
          <button
            onClick={() => setShowColsMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Toggle column visibility"
          >
            <Eye size={15} />
            Columns
          </button>
          {showColsMenu && (
            <div className="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-950">
              {table.getAllLeafColumns().map((col) => (
                <label
                  key={col.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                    className="h-3.5 w-3.5 rounded accent-indigo-600"
                  />
                  <span className="truncate">{col.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={resetAll}
          disabled={!hasFilters}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RotateCcw size={15} />
          Reset
        </button>
        <button
          onClick={exportFiltered}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Download size={15} />
          Export filtered CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"
              >
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200"
                    >
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          title={
                            sorted === 'asc'
                              ? 'Sort descending'
                              : sorted === 'desc'
                                ? 'Clear sort'
                                : 'Sort ascending'
                          }
                          className="inline-flex items-center gap-1 text-left hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === 'asc' ? (
                            <ArrowUp size={13} className="text-indigo-600 dark:text-indigo-400" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={13} className="text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <ArrowUpDown size={13} className="text-slate-400" />
                          )}
                        </button>
                        {header.column.getCanFilter() && (
                          <ColumnFilter
                            column={header.column}
                            type={colTypes[header.column.id]}
                          />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 text-slate-700 dark:text-slate-300"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Showing {start}–{end} of {filteredCount.toLocaleString()} rows
          {(globalFilter !== '' || columnFilters.length > 0) && (
            <span className="ml-1 text-slate-400 dark:text-slate-500">
              ({filteredCount.toLocaleString()} after filters ·{' '}
              {totalCount.toLocaleString()} total)
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500 dark:text-slate-400">
            Rows per page:
            <select
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="ml-1 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Page {pageIndex + 1} of {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

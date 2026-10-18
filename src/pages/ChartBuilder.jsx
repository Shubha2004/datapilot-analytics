/**
 * ChartBuilder.jsx — interactive chart builder with live preview and a
 * gallery of saved charts for DataPilot Analytics.
 */
import { useMemo, useRef, useState } from 'react'
import {
  ChartColumn,
  ChartBar,
  ChartLine,
  ChartArea,
  ChartPie,
  Donut,
  ChartScatter,
  ChartNoAxesColumn,
  Box,
  Save,
  Pencil,
  Check,
  X,
  Plus,
  Trash,
  Download,
  TriangleAlert,
  ListFilter,
  SlidersHorizontal,
  Loader2,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import ChartRenderer from '../components/ChartRenderer'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { validateChartConfig } from '../utils/chartData'
import { downloadChartPNG } from '../utils/exportUtils'

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now())
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar', Icon: ChartColumn },
  { value: 'hbar', label: 'H. bar', Icon: ChartBar },
  { value: 'line', label: 'Line', Icon: ChartLine },
  { value: 'area', label: 'Area', Icon: ChartArea },
  { value: 'pie', label: 'Pie', Icon: ChartPie },
  { value: 'donut', label: 'Donut', Icon: Donut },
  { value: 'scatter', label: 'Scatter', Icon: ChartScatter },
  { value: 'histogram', label: 'Histogram', Icon: ChartNoAxesColumn },
  { value: 'box', label: 'Box', Icon: Box },
]

const AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
]

const SORTS = [
  { value: 'none', label: 'None' },
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

const FILTER_OPS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'isNull', label: 'is empty' },
  { value: 'notNull', label: 'is not empty' },
]

const opLabel = (op) => (FILTER_OPS.find((o) => o.value === op) || {}).label || op

const selectCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const labelCls =
  'mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400'
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500'
const iconBtnCls =
  'flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-600 dark:hover:text-indigo-400'

function defaultDraft(columns) {
  const cols = Array.isArray(columns) ? columns : []
  const firstCat = cols.find((c) => c.type === 'categorical')
  const firstNum = cols.find((c) => c.type === 'numeric')
  return {
    id: 'draft',
    title: '',
    type: 'bar',
    xKey: firstCat ? firstCat.name : cols.length > 0 ? cols[0].name : '',
    yKey: firstNum ? firstNum.name : null,
    aggregation: 'sum',
    groupKey: null,
    sort: 'none',
    filters: [],
  }
}

function ColumnSelect({ label, value, onChange, groups, allowEmpty, emptyLabel }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <select
        value={value === null || value === undefined ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className={selectCls}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {Object.entries(groups).map(
          ([group, names]) =>
            names.length > 0 && (
              <optgroup key={group} label={group}>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </optgroup>
            ),
        )}
      </select>
    </label>
  )
}

export default function ChartBuilder() {
  const { dataset, savedCharts, addChart, updateChart, deleteChart } = useData()
  const toast = useToast()
  const cardRefs = useRef({})

  const [draft, setDraft] = useState(() => defaultDraft(dataset ? dataset.columns : []))
  const [chartName, setChartName] = useState('')
  const [newFilter, setNewFilter] = useState(() => ({
    column: dataset && dataset.columns.length > 0 ? dataset.columns[0].name : '',
    op: 'eq',
    value: '',
  }))
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [exportingId, setExportingId] = useState(null)

  const groups = useMemo(() => {
    const g = { Numeric: [], Categorical: [], Date: [], Other: [] }
    if (!dataset) return g
    for (const c of dataset.columns) {
      const key =
        c.type === 'numeric'
          ? 'Numeric'
          : c.type === 'categorical'
            ? 'Categorical'
            : c.type === 'date'
              ? 'Date'
              : 'Other'
      g[key].push(c.name)
    }
    return g
  }, [dataset])

  const catGroups = useMemo(
    () => ({
      Categorical: groups.Categorical,
      Date: groups.Date,
      Other: groups.Other,
    }),
    [groups],
  )

  const errors = useMemo(
    () => (dataset ? validateChartConfig(dataset, { ...draft, id: 'draft' }) : []),
    [dataset, draft],
  )

  if (!dataset) {
    return (
      <EmptyState
        icon={ChartColumn}
        title="Upload a dataset to build charts"
        message="Import a CSV or spreadsheet file first, then design charts with a live preview here."
      />
    )
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const addFilter = () => {
    if (!newFilter.column) return
    set({ filters: [...draft.filters, { ...newFilter }] })
    setNewFilter((f) => ({ ...f, value: '' }))
  }

  const removeFilter = (idx) => {
    set({ filters: draft.filters.filter((_, i) => i !== idx) })
  }

  const handleSave = () => {
    if (errors.length > 0) return
    const name = chartName.trim() || draft.title.trim() || 'Untitled chart'
    addChart({ ...draft, id: newId(), title: name })
    setChartName('')
    toast.success(`Saved chart “${name}”.`)
  }

  const exportPNG = async (chart) => {
    if (exportingId) return
    setExportingId(chart.id)
    try {
      const svg = cardRefs.current[chart.id]
        ? cardRefs.current[chart.id].querySelector('svg')
        : null
      await downloadChartPNG(svg, `${chart.title || 'chart'}.png`)
      toast.success(`Exported “${chart.title || 'Untitled chart'}” as PNG.`)
    } catch (e) {
      toast.error(`PNG export failed: ${e && e.message ? e.message : e}`)
    } finally {
      setExportingId(null)
    }
  }

  const startRename = (chart) => {
    setRenamingId(chart.id)
    setRenameValue(chart.title || '')
  }

  const confirmRename = (chart) => {
    const name = renameValue.trim() || chart.title
    const changed = name !== chart.title
    updateChart(chart.id, { title: name })
    setRenamingId(null)
    if (changed) toast.success(`Renamed chart to “${name}”.`)
  }

  const handleDelete = (chart) => {
    setDeleteTarget(chart)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const name = deleteTarget.title || 'Untitled chart'
    deleteChart(deleteTarget.id)
    setDeleteTarget(null)
    toast.success(`Deleted chart “${name}”.`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Chart Builder
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure a chart on the left and watch it update live on the right.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---- Config panel ---- */}
        <div className="self-start rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <SlidersHorizontal size={16} className="text-indigo-600 dark:text-indigo-400" />
            Chart settings
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <span className={labelCls}>Chart type</span>
              <div className="grid grid-cols-3 gap-2">
                {CHART_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set({ type: value })}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition ${
                      draft.type === value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <ColumnSelect
              label="X column (required)"
              value={draft.xKey}
              onChange={(v) => set({ xKey: v || '' })}
              groups={groups}
              allowEmpty={false}
            />

            <ColumnSelect
              label="Y column"
              value={draft.yKey}
              onChange={(v) => set({ yKey: v, aggregation: v === null ? 'count' : draft.aggregation === 'count' ? 'sum' : draft.aggregation })}
              groups={groups}
              allowEmpty
              emptyLabel="Count of rows"
            />

            <label className="block">
              <span className={labelCls}>Aggregation</span>
              <select
                value={draft.aggregation}
                onChange={(e) => set({ aggregation: e.target.value })}
                className={selectCls}
              >
                {AGGREGATIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <ColumnSelect
              label="Group by"
              value={draft.groupKey}
              onChange={(v) => set({ groupKey: v })}
              groups={catGroups}
              allowEmpty
              emptyLabel="None"
            />

            <label className="block">
              <span className={labelCls}>Sort</span>
              <select
                value={draft.sort}
                onChange={(e) => set({ sort: e.target.value })}
                className={selectCls}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelCls}>Title</span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Chart title"
                className={inputCls}
              />
            </label>

            <div>
              <span className={`${labelCls} flex items-center gap-1.5`}>
                <ListFilter size={13} /> Filters
              </span>
              <div className="space-y-2">
                {draft.filters.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">{f.column}</span>
                    <span className="text-slate-500 dark:text-slate-400">{opLabel(f.op)}</span>
                    <span className="truncate text-slate-600 dark:text-slate-300">{String(f.value)}</span>
                    <button
                      type="button"
                      onClick={() => removeFilter(i)}
                      aria-label="Remove filter"
                      className="ml-auto text-slate-400 transition hover:text-red-500"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
                {draft.filters.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No filters yet.</p>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    value={newFilter.column}
                    onChange={(e) => setNewFilter((f) => ({ ...f, column: e.target.value }))}
                    className={selectCls}
                    aria-label="Filter column"
                  >
                    {Object.entries(groups).map(
                      ([group, names]) =>
                        names.length > 0 && (
                          <optgroup key={group} label={group}>
                            {names.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </optgroup>
                        ),
                    )}
                  </select>
                  <select
                    value={newFilter.op}
                    onChange={(e) => setNewFilter((f) => ({ ...f, op: e.target.value }))}
                    className={selectCls}
                    aria-label="Filter operator"
                  >
                    {FILTER_OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFilter.value}
                    onChange={(e) => setNewFilter((f) => ({ ...f, value: e.target.value }))}
                    placeholder="Value"
                    disabled={newFilter.op === 'isNull' || newFilter.op === 'notNull'}
                    className={`${inputCls} disabled:opacity-50`}
                    aria-label="Filter value"
                  />
                  <button
                    type="button"
                    onClick={addFilter}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Preview + gallery ---- */}
        <div className="min-w-0 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Live preview</h2>
            {errors.length > 0 && (
              <ul className="mt-3 space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              {errors.length === 0 && (
                <ChartRenderer
                  config={{ ...draft, id: 'draft' }}
                  dataset={dataset}
                  height={360}
                />
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row">
              <input
                type="text"
                value={chartName}
                onChange={(e) => setChartName(e.target.value)}
                placeholder="Name this chart (optional)"
                className={`${inputCls} sm:flex-1`}
                aria-label="Chart name"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={errors.length > 0}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={15} />
                Save chart
              </button>
            </div>
          </div>

          {/* ---- Saved charts gallery ---- */}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Saved charts
              <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {savedCharts.length}
              </span>
            </h2>
            {savedCharts.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={ChartColumn}
                  title="No saved charts yet"
                  message="Design a chart above and save it — it will appear here for reuse, editing and PNG export."
                />
              </div>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {savedCharts.map((chart) => (
                  <div
                    key={chart.id}
                    ref={(el) => {
                      cardRefs.current[chart.id] = el
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <ChartRenderer config={chart} dataset={dataset} height={200} />
                    <div className="mt-3">
                      {renamingId === chart.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className={inputCls}
                            aria-label="Chart title"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => confirmRename(chart)}
                            aria-label="Confirm rename"
                            className={iconBtnCls}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            aria-label="Cancel rename"
                            className={iconBtnCls}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {chart.title || 'Untitled chart'}
                        </p>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft({ ...chart, id: 'draft' })}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
                      >
                        Load
                      </button>
                      {renamingId !== chart.id && (
                        <button
                          type="button"
                          onClick={() => startRename(chart)}
                          aria-label="Rename chart"
                          title="Rename"
                          className={iconBtnCls}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => exportPNG(chart)}
                        disabled={exportingId === chart.id}
                        aria-label="Export chart as PNG"
                        title="Export PNG"
                        className={`${iconBtnCls} disabled:opacity-50`}
                      >
                        {exportingId === chart.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(chart)}
                        aria-label="Delete chart"
                        title="Delete"
                        className={`${iconBtnCls} hover:!border-red-300 hover:!text-red-500`}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete-chart confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete chart?"
        description={`“${deleteTarget?.title || 'Untitled chart'}” will be removed from the saved charts gallery. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

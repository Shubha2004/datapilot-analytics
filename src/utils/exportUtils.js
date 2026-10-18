/**
 * exportUtils.js — CSV download, chart PNG export and printing for
 * DataPilot Analytics. All browser-only.
 */

/**
 * Escape one CSV cell with proper quoting.
 *
 * CSV formula-injection defence (OWASP): if the cell's first non-whitespace
 * character is one of = + - @, tab or CR, prefix a single quote so
 * spreadsheet apps treat it as text instead of executing it as a formula.
 * Plain numbers (including negatives) are left alone so numeric exports
 * stay numeric. The quote keeps the CSV itself valid and round-trippable.
 */
const NUMERIC_LITERAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function escapeCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (
    typeof v !== 'number' &&
    /^\s*[=+\-@\t\r]/.test(s) &&
    !NUMERIC_LITERAL_RE.test(s.trim())
  ) {
    s = "'" + s;
  }
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * sanitizeCell is the exported alias of the CSV formula-injection defence
 * (escapeCell): unit tests and other modules import this to verify behaviour.
 */
export const sanitizeCell = escapeCell;

/** Make a filename safe for download (strip path separators & controls). */
function safeFileName(name, fallback) {
  const base = String(name ?? '').trim() || fallback;
  // Strip path separators / shell-hostile chars, then any non-printable or
  // DEL characters (written without literal control-char escapes so the
  // linter's no-control-regex rule stays quiet).
  const cleaned = base
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '-')
    .slice(0, 120);
  return cleaned || fallback;
}
/** Trigger a download of an object URL via a temporary anchor. */
function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(href);
    a.remove();
  }, 100);
}

/**
 * Download rows as CSV. columnNames is the header order; rows may be
 * objects keyed by column name or plain arrays.
 */
export function downloadCSV(filename, columnNames, rows) {
  const cols = Array.isArray(columnNames) ? columnNames : [];
  const lines = [cols.map(escapeCell).join(',')];
  for (const r of Array.isArray(rows) ? rows : []) {
    const cells = Array.isArray(r)
      ? r.map(escapeCell)
      : cols.map((c) => escapeCell(r[c]));
    lines.push(cells.join(','));
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(URL.createObjectURL(blob), filename);
}

/** Export a whole dataset (columns + rows) as "<dataset.name>.csv". */
export function exportDatasetCSV(dataset) {
  const cols = (dataset.columns || []).map((c) => c.name);
  downloadCSV(`${dataset.name || 'dataset'}.csv`, cols, dataset.rows || []);
}

/**
 * Export a chart <svg> element as a 2x PNG download.
 * Pass the svg node itself, e.g. container.querySelector('svg').
 * Rejects with Error('Chart PNG export failed: ...') on failure.
 */
export function downloadChartPNG(svgEl, filename) {
  return new Promise((resolve, reject) => {
    const fail = (msg) => reject(new Error('Chart PNG export failed: ' + msg));
    // Hoisted so the outer catch can revoke the object URL if anything
    // throws after it was created but before img.src was assigned.
    let url = null;
    try {
      if (!svgEl || typeof svgEl.cloneNode !== 'function') {
        fail('no chart element provided');
        return;
      }
      const width =
        svgEl.clientWidth || parseInt(svgEl.getAttribute('width'), 10) || 800;
      const height =
        svgEl.clientHeight || parseInt(svgEl.getAttribute('height'), 10) || 600;
      const SCALE = 2;

      const clone = svgEl.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('font-family', 'Inter, system-ui, -apple-system, sans-serif');
      clone.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif';

      // Wrap contents in a 2x-scaled group so the raster is genuinely 2x.
      const NS = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `scale(${SCALE})`);
      while (clone.childNodes.length > 0) g.appendChild(clone.childNodes[0]);
      clone.appendChild(g);
      clone.setAttribute('width', String(width * SCALE));
      clone.setAttribute('height', String(height * SCALE));

      const svgText = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width * SCALE;
          canvas.height = height * SCALE;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            fail('2d canvas context unavailable');
            return;
          }
          ctx.drawImage(img, 0, 0, width * SCALE, height * SCALE);
          URL.revokeObjectURL(url);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fail('canvas produced no image data');
                return;
              }
              triggerDownload(URL.createObjectURL(blob), filename);
              resolve();
            },
            'image/png'
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          fail(e && e.message ? e.message : 'rasterization error');
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        fail('could not rasterize chart SVG');
      };
      img.src = url;
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      fail(e && e.message ? e.message : 'unknown error');
    }
  });
}

/** Open the browser print dialog. */
export function triggerPrint() {
  window.print();
}

/* ------------------------------------------------------------------ */
/* Structured report exports (additive; all route through downloadCSV, */
/* hence through the sanitizeCell formula-injection defence).          */
/* ------------------------------------------------------------------ */

/**
 * Export a KPI summary as CSV with columns metric, value, note.
 * `kpis` is the computeKPIs() return object; grain and assumptions are
 * appended as trailing rows so the report stays self-documenting.
 * Tolerant of null/partial input — never throws.
 */
export function exportKPISummaryCSV(kpis, datasetName) {
  const k = kpis && typeof kpis === 'object' ? kpis : {};
  const num = (v) =>
    v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
      ? ''
      : v;
  const note = (v) => (v === null || v === undefined ? '' : String(v));
  const rows = [
    {
      metric: 'totalRevenue',
      value: num(k.totalRevenue),
      note: 'Sum of valid revenue cells (after filters).',
    },
    {
      metric: 'revenueCells',
      value: num(k.revenueCells),
      note: 'Revenue cells parsed as finite numbers.',
    },
    {
      metric: 'invalidRevenueCells',
      value: num(k.invalidRevenueCells),
      note: 'Revenue cells excluded as non-numeric.',
    },
    {
      metric: 'totalOrders',
      value: num(k.totalOrders),
      note: 'DISTINCT order_id values (not the row count).',
    },
    {
      metric: 'rowsWithMissingOrderId',
      value: num(k.rowsWithMissingOrderId),
      note: 'Excluded from order counts; revenue/units still counted.',
    },
    {
      metric: 'unitsSold',
      value: num(k.unitsSold),
      note: 'Sum of valid quantity cells.',
    },
    { metric: 'avgOrderValue', value: num(k.avgOrderValue), note: note(k.aovNote) },
    {
      metric: 'revenueGrowthPct',
      value: num(k.revenueGrowthPct),
      note: note(k.growthNote),
    },
    {
      metric: 'latestMonth',
      value: num(k.latestMonth),
      note: 'Latest YYYY-MM present in the data.',
    },
    {
      metric: 'previousMonth',
      value: num(k.previousMonth),
      note: 'Calendar month before latestMonth.',
    },
    {
      metric: 'dataCompleteness',
      value: num(k.dataCompleteness),
      note: 'Share of non-missing KPI fields per filtered row.',
    },
    {
      metric: 'duplicateRows',
      value: num(k.duplicateRows),
      note: 'Duplicate rows (sorted-key JSON.stringify convention).',
    },
    {
      metric: 'duplicateRate',
      value: num(k.duplicateRate),
      note: 'duplicateRows / filtered row count.',
    },
    {
      metric: 'grain',
      value: note(k.grain),
      note: 'Level of detail the KPIs were computed at.',
    },
  ];
  for (const a of Array.isArray(k.assumptions) ? k.assumptions : []) {
    rows.push({ metric: 'assumption', value: note(a), note: '' });
  }
  downloadCSV(
    `${safeFileName(datasetName, 'dataset')}-kpi-summary.csv`,
    ['metric', 'value', 'note'],
    rows
  );
}

/** Round to 2 decimals for readable CSV output. */
function round2csv(n) {
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.round((n + Number.EPSILON) * 100) / 100
    : n;
}

/**
 * Export a full data-quality report as CSV with columns
 * section, item, metric, value: dataset info + generation timestamp,
 * per-column missing counts/%, duplicate rows, invalid numerics,
 * outliers (with bounds), single-value columns, possible date columns,
 * then the full audit log of cleaning steps.
 * `quality` is an analyzeQuality() result; `auditLog` is an array of
 * history entries as recorded by the Data Quality page. Never throws.
 */
export function exportDQReportCSV(datasetName, quality, auditLog) {
  const q = quality && typeof quality === 'object' ? quality : {};
  const log = Array.isArray(auditLog) ? auditLog : [];
  const rows = [];
  const add = (section, item, metric, value) =>
    rows.push({ section, item, metric, value });

  add('dataset', '', 'name', String(datasetName ?? ''));
  add('dataset', '', 'generated_at', new Date().toISOString());

  for (const c of Array.isArray(q.missingByColumn) ? q.missingByColumn : []) {
    add('missing', String(c.column ?? ''), 'missing_count', c.missing ?? '');
    add(
      'missing',
      String(c.column ?? ''),
      'missing_pct',
      round2csv(c.pct ?? '')
    );
  }
  add('duplicates', '', 'duplicate_rows', q.duplicateRows ?? '');
  for (const d of Array.isArray(q.invalidNumeric) ? q.invalidNumeric : []) {
    add('invalid_numeric', String(d.column ?? ''), 'invalid_count', d.count ?? '');
  }
  for (const o of Array.isArray(q.outliers) ? q.outliers : []) {
    add('outliers', String(o.column ?? ''), 'outlier_count', o.count ?? '');
    add('outliers', String(o.column ?? ''), 'lower_bound', round2csv(o.lower ?? ''));
    add('outliers', String(o.column ?? ''), 'upper_bound', round2csv(o.upper ?? ''));
  }
  for (const name of Array.isArray(q.singleValueColumns)
    ? q.singleValueColumns
    : []) {
    add('single_value_columns', String(name), 'flag', 'single value');
  }
  for (const name of Array.isArray(q.possibleDateColumns)
    ? q.possibleDateColumns
    : []) {
    add('possible_date_columns', String(name), 'flag', 'possible date');
  }
  for (const v of Array.isArray(q.inconsistentCategories)
    ? q.inconsistentCategories
    : []) {
    add(
      'inconsistent_categories',
      String(v.column ?? ''),
      'variants',
      (v.variants || []).map((set) => set.join(' | ')).join('; ')
    );
  }

  log.forEach((e, i) => {
    const entry = e && typeof e === 'object' ? e : {};
    const step = `step_${i + 1}: ${entry.label || entry.op || 'step'}`;
    const cols = Array.isArray(entry.columns) ? entry.columns.join(', ') : '';
    const qb = entry.qualityBefore || {};
    const qa = entry.qualityAfter || {};
    add('audit_log', step, 'applied_at', entry.at || '');
    add('audit_log', step, 'operation', entry.op || entry.label || '');
    add('audit_log', step, 'columns', cols);
    add('audit_log', step, 'rows_before', entry.rowsBefore ?? '');
    add('audit_log', step, 'rows_after', entry.rowsAfter ?? '');
    add('audit_log', step, 'rows_affected', entry.rowsAffected ?? '');
    add('audit_log', step, 'missing_pct_before', round2csv(qb.missingPct ?? ''));
    add('audit_log', step, 'missing_pct_after', round2csv(qa.missingPct ?? ''));
    add(
      'audit_log',
      step,
      'duplicate_rows_before',
      qb.duplicateRows ?? ''
    );
    add('audit_log', step, 'duplicate_rows_after', qa.duplicateRows ?? '');
    add('audit_log', step, 'detail', entry.detail || '');
    add('audit_log', step, 'impact_note', entry.impactNote || '');
  });

  downloadCSV(
    `${safeFileName(datasetName, 'dataset')}-quality-report.csv`,
    ['section', 'item', 'metric', 'value'],
    rows
  );
}

/**
 * Export chart data as CSV. `chartData` is the { data, seriesKeys } object
 * from buildChartData(); it is flattened so every distinct data key becomes
 * a column. Tolerant of null/empty input — never throws.
 */
export function exportChartDataCSV(title, chartData) {
  const data =
    chartData && Array.isArray(chartData.data) ? chartData.data : [];
  const cols = [];
  for (const row of data) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) {
        if (!cols.includes(key)) cols.push(key);
      }
    }
  }
  downloadCSV(`${safeFileName(title, 'chart')}.csv`, cols, data);
}

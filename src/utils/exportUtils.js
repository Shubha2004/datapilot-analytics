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

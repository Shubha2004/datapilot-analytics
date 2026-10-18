import { useRef, useState } from 'react';
import { Upload, FileText, Database, AlertTriangle, Loader2, Table } from 'lucide-react';
import { useData } from '../context/DataContext';
import { validateFile, parseCSVFile, getExcelSheets, parseExcelSheet, parseJSONFile } from '../utils/parsers';
import { buildDataset } from '../utils/dataTypes';
import { generateSampleData } from '../utils/sampleData';
import ConnectorModal from './ConnectorModal';

const PREVIEW_ROWS = 8;

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function FileUploader({ compact = false }) {
  const { setDataset, setIsLoading } = useData();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // { file, sheets, selected, columns, rows }
  const [parsed, setParsed] = useState(null); // { fileName, fileSize, rows, columns, sheetName }
  const [busy, setBusy] = useState(false);
  const [connectorOpen, setConnectorOpen] = useState(false);

  const reset = () => {
    setParsed(null);
    setPending(null);
    setError(null);
  };

  const handleLoadSample = () => {
    try {
      setDataset(generateSampleData());
    } catch (err) {
      setError(err.message);
    }
  };

  const fail = (message) => {
    setError(message);
    setBusy(false);
    setIsLoading(false);
  };

  const finish = (file, rows, columns, sheetName) => {
    setParsed({
      fileName: file.name,
      fileSize: file.size,
      rows,
      columns,
      sheetName: sheetName || null,
    });
    setPending(null);
    setBusy(false);
    setIsLoading(false);
  };

  const parseDirect = async (file, sheetName = null) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') return parseCSVFile(file);
    if (ext === 'json') return parseJSONFile(file);
    return parseExcelSheet(file, sheetName);
  };

  const processFile = async (file) => {
    reset();
    const validation = validateFile(file);
    if (!validation.ok) {
      fail(validation.error);
      return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    setBusy(true);
    setIsLoading(true);
    try {
      if (ext === 'xls' || ext === 'xlsx') {
        const sheets = await getExcelSheets(file);
        if (!sheets || sheets.length === 0) {
          fail('No worksheets found in this Excel file.');
          return;
        }
        if (sheets.length === 1) {
          const { columns, rows } = await parseExcelSheet(file, sheets[0]);
          if (!rows || rows.length === 0) {
            fail('The selected sheet contains no data rows.');
            return;
          }
          finish(file, rows, columns, sheets[0]);
        } else {
          setPending({ file, sheets, selected: sheets[0] });
          setBusy(false);
          setIsLoading(false);
        }
      } else {
        const { columns, rows } = await parseDirect(file);
        if (!rows || rows.length === 0) {
          fail('This file contains no data rows. It may be empty or header-only.');
          return;
        }
        finish(file, rows, columns, null);
      }
    } catch (err) {
      fail(err.message || 'Failed to parse file. Please check the format and try again.');
    }
  };

  const handleSheetConfirm = async () => {
    if (!pending) return;
    const { file, selected } = pending;
    setBusy(true);
    setIsLoading(true);
    try {
      const { columns, rows } = await parseExcelSheet(file, selected);
      if (!rows || rows.length === 0) {
        fail(`Sheet "${selected}" contains no data rows.`);
        return;
      }
      finish(file, rows, columns, selected);
    } catch (err) {
      fail(err.message || 'Failed to parse the selected sheet.');
    }
  };

  const handleConfirmDataset = () => {
    if (!parsed) return;
    try {
      setDataset(
        buildDataset(parsed.fileName.replace(/\.[^.]+$/, ''), parsed.rows, {
          source: 'upload',
          fileName: parsed.fileName,
          fileSize: parsed.fileSize,
          sheetName: parsed.sheetName,
        })
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const onPick = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) processFile(file);
  };

  const previewRows = parsed ? parsed.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current && inputRef.current.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl ${compact ? 'p-4' : 'p-8'} text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx,.json"
          onChange={onPick}
          className="hidden"
        />
        <Upload className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-700">
          Drag &amp; drop a file here, or click to browse
        </p>
        <p className="mt-1 text-xs text-gray-500">CSV, Excel (.xls/.xlsx), JSON — max 50 MB</p>
      </div>

      {/* Alternative actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleLoadSample}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Table className="h-4 w-4" />
          Load sample dataset
        </button>
        <button
          type="button"
          onClick={() => setConnectorOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Database className="h-4 w-4" />
          Connect database
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Busy */}
      {busy && !pending && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing file…
        </div>
      )}

      {/* Sheet picker */}
      {pending && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">
            This workbook has {pending.sheets.length} sheets. Choose one to load:
          </p>
          <select
            value={pending.selected}
            onChange={(e) => setPending({ ...pending, selected: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {pending.sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSheetConfirm}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Parse sheet
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Parsed preview */}
      {parsed && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <FileText className="h-4 w-4 text-gray-500" />
            <span className="font-medium">{parsed.fileName}</span>
            <span className="text-gray-500">({formatSize(parsed.fileSize)})</span>
            {parsed.sheetName && (
              <span className="text-gray-500">· Sheet: {parsed.sheetName}</span>
            )}
            <span className="text-gray-500">
              · {parsed.rows.length.toLocaleString()} rows × {parsed.columns.length} columns
            </span>
          </div>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {parsed.columns.map((c) => (
                    <th
                      key={c}
                      className="whitespace-nowrap border-b px-3 py-2 text-left font-semibold text-gray-600"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className={i % 2 ? 'bg-white' : 'bg-gray-50/50'}>
                    {parsed.columns.map((c) => (
                      <td key={c} className="whitespace-nowrap px-3 py-1.5 text-gray-700">
                        {row[c] === null || row[c] === undefined ? '' : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            Showing first {Math.min(PREVIEW_ROWS, parsed.rows.length)} of{' '}
            {parsed.rows.length.toLocaleString()} rows.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmDataset}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Use this dataset
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Choose different file
            </button>
          </div>
        </div>
      )}

      <ConnectorModal open={connectorOpen} onClose={() => setConnectorOpen(false)} />
    </div>
  );
}

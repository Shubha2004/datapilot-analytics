// exportSafety.test.js — CSV formula-injection defence for the new
// structured exports (exportKPISummaryCSV / exportDQReportCSV /
// exportChartDataCSV) plus direct unit tests of the exported sanitizeCell.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeCell,
  exportKPISummaryCSV,
  exportDQReportCSV,
  exportChartDataCSV,
} from '../src/utils/exportUtils.js';
import { buildReportData } from '../src/utils/reportBuilder.js';
import { sampleDataset } from './helpers.js';

let captured = [];
let realCreate, realRevoke;

beforeEach(() => {
  captured = [];
  realCreate = URL.createObjectURL;
  realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    captured.push(blob);
    return 'blob:fake';
  };
  URL.revokeObjectURL = () => {};
  vi.useFakeTimers();
});

afterEach(() => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  vi.useRealTimers();
});

async function lastCSV() {
  const blob = captured[captured.length - 1];
  expect(blob).toBeInstanceOf(Blob);
  return blob.text();
}

describe('sanitizeCell (formula-injection defence)', () => {
  it('prefixes leading =, +, - @ with a single quote', () => {
    expect(sanitizeCell('=cmd|/c calc')).toBe("'=cmd|/c calc");
    expect(sanitizeCell('+1+1')).toBe("'+1+1");
    expect(sanitizeCell('@mention')).toBe("'@mention");
    expect(sanitizeCell('-2+3')).toBe("'-2+3");
  });

  it('leaves plain numeric literals (incl. negatives) untouched', () => {
    expect(sanitizeCell('-5')).toBe('-5');
    expect(sanitizeCell(-5)).toBe('-5');
    expect(sanitizeCell('3.14')).toBe('3.14');
    expect(sanitizeCell('+12')).toBe('+12');
    expect(sanitizeCell(0)).toBe('0');
  });

  it('does not double-prefix an already-prefixed value', () => {
    expect(sanitizeCell("'=cmd")).toBe("'=cmd");
    expect(sanitizeCell("''+x")).toBe("''+x");
  });

  it('catches leading whitespace / tab / CR before a trigger char', () => {
    expect(sanitizeCell('  =2+2')).toBe("'  =2+2");
    expect(sanitizeCell('\tcmd')).toBe("'\tcmd");
    // '\r@x' is both sanitized (leading ') and CSV-quoted (contains CR).
    expect(sanitizeCell('\r@x')).toBe('"\'\r@x"');
  });

  it('passes through ordinary text, null and undefined', () => {
    expect(sanitizeCell('hello world')).toBe('hello world');
    expect(sanitizeCell('')).toBe('');
    expect(sanitizeCell(null)).toBe('');
    expect(sanitizeCell(undefined)).toBe('');
  });
});

describe('exportKPISummaryCSV', () => {
  it('contains one row per KPI metric plus grain and assumption rows', async () => {
    exportKPISummaryCSV(
      {
        totalRevenue: 1250.5,
        totalOrders: 42,
        unitsSold: 100,
        avgOrderValue: 29.77,
        aovNote: 'aov note',
        revenueGrowthPct: 12.5,
        dataCompleteness: 0.98,
        duplicateRows: 2,
        duplicateRate: 0.01,
        grain: 'one row = one order line item',
        assumptions: ['assumption one', 'assumption two'],
      },
      'sales'
    );
    const text = await lastCSV();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('metric,value,note');
    expect(text).toContain('totalRevenue,1250.5,');
    expect(text).toContain('totalOrders,42,');
    expect(text).toContain('grain,one row = one order line item,');
    expect(text).toContain('assumption,assumption one,');
    expect(text).toContain('assumption,assumption two,');
  });

  it('sanitizes formula-like values and tolerates null input', async () => {
    exportKPISummaryCSV(
      { totalRevenue: '=evil()', grain: '+1+1', assumptions: ['@note'] },
      'sales'
    );
    const text = await lastCSV();
    expect(text).toContain("'=evil()");
    expect(text).toContain("'+1+1");
    expect(text).toContain("'@note");
    exportKPISummaryCSV(null, 'sales');
    const blank = await lastCSV();
    expect(blank.split('\r\n')[0]).toBe('metric,value,note');
  });
});

describe('exportDQReportCSV', () => {
  it('includes dataset info, per-column missing, duplicates and the audit log', async () => {
    const quality = {
      missingByColumn: [
        { column: 'age', missing: 2, pct: 20 },
        { column: 'city', missing: 0, pct: 0 },
      ],
      duplicateRows: 3,
      invalidNumeric: [{ column: 'age', count: 1 }],
      outliers: [{ column: 'age', count: 1, lower: 0, upper: 120 }],
      singleValueColumns: ['country'],
      possibleDateColumns: ['order_date'],
    };
    const auditLog = [
      {
        id: 'step-1',
        label: 'Remove duplicate rows',
        op: 'remove-duplicates',
        detail: '3 duplicate rows removed',
        at: '2026-10-18T10:00:00.000Z',
        columns: ['age', 'city'],
        rowsBefore: 10,
        rowsAfter: 7,
        rowsAffected: 3,
        qualityBefore: { missingPct: 5, duplicateRows: 3 },
        qualityAfter: { missingPct: 2, duplicateRows: 0 },
        impactNote: 'an impact note',
      },
    ];
    exportDQReportCSV('my-dataset', quality, auditLog);
    const text = await lastCSV();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('section,item,metric,value');
    expect(text).toContain('dataset,,name,my-dataset');
    expect(text).toContain('dataset,,generated_at,');
    expect(text).toContain('missing,age,missing_count,2');
    expect(text).toContain('missing,age,missing_pct,20');
    expect(text).toContain('duplicates,,duplicate_rows,3');
    expect(text).toContain('invalid_numeric,age,invalid_count,1');
    expect(text).toContain('outliers,age,outlier_count,1');
    expect(text).toContain('single_value_columns,country,flag,single value');
    expect(text).toContain('possible_date_columns,order_date,flag,possible date');
    expect(text).toContain('audit_log,step_1: Remove duplicate rows,operation,remove-duplicates');
    expect(text).toContain('audit_log,step_1: Remove duplicate rows,rows_before,10');
    expect(text).toContain('audit_log,step_1: Remove duplicate rows,rows_after,7');
    expect(text).toContain('audit_log,step_1: Remove duplicate rows,missing_pct_before,5');
    expect(text).toContain('audit_log,step_1: Remove duplicate rows,duplicate_rows_after,0');
    expect(text).toContain('audit_log,step_1: Remove duplicate rows,impact_note,an impact note');
  });

  it('sanitizes malicious column names and item values', async () => {
    const quality = {
      missingByColumn: [{ column: '=evil', missing: 1, pct: 10 }],
      duplicateRows: 0,
      invalidNumeric: [],
      outliers: [],
      singleValueColumns: [],
      possibleDateColumns: [],
    };
    exportDQReportCSV('ds', quality, []);
    const text = await lastCSV();
    expect(text).toContain("missing,'=evil,missing_count,1");
  });

  it('tolerates null quality and audit log', async () => {
    exportDQReportCSV('ds', null, null);
    const text = await lastCSV();
    expect(text).toContain('dataset,,name,ds');
    expect(text).toContain('dataset,,generated_at,');
  });
});

describe('exportChartDataCSV', () => {
  it('flattens chart data to one column per key', async () => {
    exportChartDataCSV('revenue by region', {
      data: [
        { region: 'North', revenue: 100 },
        { region: 'South', revenue: 200 },
      ],
      seriesKeys: ['revenue'],
    });
    expect(await lastCSV()).toBe('region,revenue\r\nNorth,100\r\nSouth,200');
  });

  it('unions keys across rows and sanitizes formula-like labels', async () => {
    exportChartDataCSV('t', {
      data: [{ a: 1 }, { a: 2, b: '=cmd' }],
      seriesKeys: [],
    });
    expect(await lastCSV()).toBe('a,b\r\n1,\r\n2,\'=cmd');
  });

  it('handles empty chart data without throwing', async () => {
    exportChartDataCSV('empty', { data: [], seriesKeys: [] });
    expect(await lastCSV()).toBe('');
    exportChartDataCSV('none', null);
    expect(await lastCSV()).toBe('');
  });
});

describe('buildReportData (reportBuilder contract for Worker E)', () => {
  it('returns the full report shape with honest limitations', () => {
    const dataset = sampleDataset('sales');
    dataset.meta = { ...(dataset.meta || {}), source: 'sample' };
    const kpis = {
      totalRevenue: 1000,
      totalOrders: 10,
      grain: 'one row = one line item',
      assumptions: ['only finite numbers count'],
    };
    const report = buildReportData({
      dataset,
      kpis,
      quality: {
        missingByColumn: [{ column: 'revenue', missing: 0, pct: 0 }],
        duplicateRows: 1,
        invalidNumeric: [],
        outliers: [],
        singleValueColumns: [],
        possibleDateColumns: ['order_date'],
      },
      insights: [{ title: 'i1' }],
      filters: { region: 'North' },
      savedCharts: [
        { title: 'rev', type: 'bar', xKey: 'region', yKey: 'revenue', aggregation: 'sum' },
      ],
    });

    expect(report.datasetName).toBe('sales');
    expect(report.datasetMeta).toMatchObject({
      rows: 5,
      cols: dataset.columns.length,
      source: 'sample',
    });
    expect(typeof report.generatedAt).toBe('string');
    expect(report.filters).toEqual({ region: 'North' });
    // analysisPeriod falls back to the order_date column min/max
    expect(report.analysisPeriod).toEqual({
      from: '2024-01-05',
      to: '2024-03-08',
    });
    expect(report.kpiSummary).toContainEqual(
      expect.objectContaining({ metric: 'totalRevenue', value: 1000 })
    );
    expect(report.kpiSummary).toContainEqual(
      expect.objectContaining({ metric: 'grain', value: 'one row = one line item' })
    );
    expect(report.qualitySummary).toMatchObject({
      duplicateRows: 1,
      totalMissingCells: 0,
      possibleDateColumns: ['order_date'],
    });
    expect(report.insights).toEqual([{ title: 'i1' }]);
    expect(report.chartSummaries).toEqual([
      { title: 'rev', type: 'bar', xKey: 'region', yKey: 'revenue', aggregation: 'sum' },
    ]);
    expect(report.assumptions).toEqual(['only finite numbers count']);
    // Honest limitations
    expect(
      report.limitations.some((l) => /synthetic sample data/i.test(l))
    ).toBe(true);
    expect(report.limitations.some((l) => /rule-based/i.test(l))).toBe(true);
    expect(
      report.limitations.some((l) => /correlation does not imply causation/i.test(l))
    ).toBe(true);
    expect(
      report.limitations.some((l) => /cleaning operations/i.test(l))
    ).toBe(true);
  });

  it('prefers filter dates for the analysis period and returns null with no dates', () => {
    const dataset = sampleDataset('s');
    expect(
      buildReportData({
        dataset,
        filters: { dateFrom: '2024-02-01', dateTo: '2024-02-28' },
      }).analysisPeriod
    ).toEqual({ from: '2024-02-01', to: '2024-02-28' });

    const noDates = { name: 'x', columns: [{ name: 'a', type: 'numeric' }], rows: [{ a: 1 }], meta: {} };
    expect(buildReportData({ dataset: noDates }).analysisPeriod).toBeNull();
  });

  it('notes non-empty audit logs in limitations', () => {
    const dataset = sampleDataset('s');
    const quality = { missingByColumn: [], auditLog: [{ op: 'trim-whitespace' }] };
    const report = buildReportData({ dataset, quality });
    expect(
      report.limitations.some((l) => /1 cleaning operation\(s\) were applied/i.test(l))
    ).toBe(true);
  });

  it('tolerates missing optional inputs', () => {
    const report = buildReportData({ dataset: null });
    expect(report.datasetName).toBe('dataset');
    expect(report.datasetMeta).toEqual({ rows: 0, cols: 0, source: null });
    expect(report.kpiSummary).toEqual([]);
    expect(report.qualitySummary).toBeNull();
    expect(report.insights).toEqual([]);
    expect(report.chartSummaries).toEqual([]);
    expect(report.assumptions).toEqual([]);
    expect(report.analysisPeriod).toBeNull();
  });
});

// exportUtils.js — CSV correctness (quoting, special chars, object/array
// rows) and the known CSV formula-injection gap (tracked as it.fails).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  downloadCSV,
  exportDatasetCSV,
  downloadChartPNG,
  triggerPrint,
} from '../src/utils/exportUtils.js';

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

describe('downloadCSV', () => {
  it('writes header + object rows in the given column order', async () => {
    downloadCSV('t.csv', ['b', 'a'], [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);
    expect(await lastCSV()).toBe('b,a\r\n2,1\r\n4,3');
  });

  it('writes array rows positionally', async () => {
    downloadCSV('t.csv', ['x', 'y'], [[1, 2], [3, 4]]);
    expect(await lastCSV()).toBe('x,y\r\n1,2\r\n3,4');
  });

  it('quotes cells containing commas, quotes or newlines', async () => {
    downloadCSV('t.csv', ['note'], [
      { note: 'hello, world' },
      { note: 'say "hi"' },
      { note: 'line1\nline2' },
    ]);
    expect(await lastCSV()).toBe(
      'note\r\n"hello, world"\r\n"say ""hi"""\r\n"line1\nline2"'
    );
  });

  it('emits empty strings for null/undefined and handles special chars', async () => {
    downloadCSV('t.csv', ['a', 'b', 'c'], [
      { a: null, b: undefined, c: 'München 日本 🚀' },
    ]);
    // unicode needs no quoting — only the delimiters force quotes:
    expect(await lastCSV()).toBe('a,b,c\r\n,,München 日本 🚀');
  });

  it('handles empty rows gracefully', async () => {
    downloadCSV('t.csv', ['a'], []);
    expect(await lastCSV()).toBe('a');
  });

  // CSV formula-injection defence (src/utils/exportUtils.js escapeCell):
  // cells whose first non-whitespace char is = + - @, tab or CR get a
  // leading single quote — unless they are plain numeric literals
  // (negative numbers stay numeric in the export).
  it('sanitizes formula-injection prefixes', async () => {
    downloadCSV('t.csv', ['v'], [
      { v: '=SUM(A1:A2)' },
      { v: '+cmd|/c calc' },
      { v: '@evil' },
      { v: '-2+3' },
      { v: '  =2+2' },
    ]);
    const text = await lastCSV();
    const lines = text.split('\r\n');
    expect(lines[1]).toBe("'=SUM(A1:A2)");
    expect(lines[2]).toBe("'+cmd|/c calc");
    expect(lines[3]).toBe("'@evil");
    expect(lines[4]).toBe("'-2+3");
    expect(lines[5]).toBe("'  =2+2");
  });

  it('leaves plain numeric literals (incl. negatives) unsanitized', async () => {
    downloadCSV('t.csv', ['v'], [{ v: '-5' }, { v: -5 }, { v: '3.14' }, { v: '+12' }]);
    expect(await lastCSV()).toBe('v\r\n-5\r\n-5\r\n3.14\r\n+12');
  });

  it('sanitizes tab/CR-prefixed cells', async () => {
    downloadCSV('t.csv', ['v'], [{ v: '\tcmd' }]);
    expect(await lastCSV()).toBe("v\r\n'\tcmd");
  });
});

describe('exportDatasetCSV', () => {
  it('uses column metadata for the header and dataset name for the file', async () => {
    exportDatasetCSV({
      name: 'sales-data',
      columns: [{ name: 'region' }, { name: 'revenue' }],
      rows: [{ region: 'North', revenue: 100 }],
    });
    expect(await lastCSV()).toBe('region,revenue\r\nNorth,100');
  });

  it('handles datasets with no columns', async () => {
    exportDatasetCSV({ name: 'e', columns: [], rows: [] });
    expect(await lastCSV()).toBe('');
  });
});

describe('downloadChartPNG', () => {
  it('rejects with a clear error when no chart element is provided', async () => {
    await expect(downloadChartPNG(null, 'c.png')).rejects.toThrow(
      /chart png export failed: no chart element provided/i
    );
  });
});

describe('triggerPrint', () => {
  it('calls window.print', () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
    try {
      triggerPrint();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

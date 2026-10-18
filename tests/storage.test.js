// storage.js — localStorage prefs + IndexedDB dataset persistence.
// Write fns return { ok, error } result objects ('quota' | 'unavailable');
// every function never throws, even when storage is broken or missing.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadPrefs,
  savePrefs,
  loadCharts,
  saveCharts,
  saveDataset,
  loadDataset,
  clearStoredDataset,
  clearAllLocal,
  classifyStorageError,
  storageErrorMessage,
} from '../src/utils/storage.js';

const hasLocalStorage = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
})();

describe('classifyStorageError', () => {
  it('maps quota errors to "quota"', () => {
    expect(classifyStorageError(new DOMException('x', 'QuotaExceededError'))).toBe('quota');
    expect(classifyStorageError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe('quota');
    expect(classifyStorageError({ code: 22 })).toBe('quota');
  });

  it('maps everything else to "unavailable"', () => {
    expect(classifyStorageError(new Error('denied'))).toBe('unavailable');
    expect(classifyStorageError(null)).toBe('unavailable');
    expect(classifyStorageError(undefined)).toBe('unavailable');
  });
});

describe('storageErrorMessage', () => {
  it('returns a friendly message per error code and null when fine', () => {
    expect(storageErrorMessage('quota')).toMatch(/quota exceeded/i);
    expect(storageErrorMessage('unavailable')).toMatch(/unavailable/i);
    expect(storageErrorMessage(null)).toBe(null);
    expect(storageErrorMessage(undefined)).toBe(null);
  });
});

(hasLocalStorage ? describe : describe.skip)('prefs (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips prefs and charts with ok result objects', async () => {
    expect(await savePrefs({ theme: 'dark', persist: true })).toEqual({
      ok: true,
      error: null,
    });
    expect(await loadPrefs()).toEqual({ theme: 'dark', persist: true });
    expect(await saveCharts([{ id: 'c1' }])).toEqual({ ok: true, error: null });
    expect(await loadCharts()).toEqual([{ id: 'c1' }]);
  });

  it('returns null when nothing is stored', async () => {
    expect(await loadPrefs()).toBe(null);
    expect(await loadCharts()).toBe(null);
  });

  it('returns null on corrupt JSON instead of throwing', async () => {
    localStorage.setItem('datapilot:prefs', '{not-json');
    expect(await loadPrefs()).toBe(null);
  });

  it('reports quota failure as {ok:false,error:"quota"} without throwing', async () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      });
    try {
      expect(await savePrefs({ a: 1 })).toEqual({ ok: false, error: 'quota' });
      expect(await saveCharts([])).toEqual({ ok: false, error: 'quota' });
    } finally {
      spy.mockRestore();
    }
    // storage recovers after the failure
    expect(await savePrefs({ ok: true })).toEqual({ ok: true, error: null });
    expect(await loadPrefs()).toEqual({ ok: true });
  });

  it('reports non-quota write failures as "unavailable"', async () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    try {
      expect(await savePrefs({ a: 1 })).toEqual({ ok: false, error: 'unavailable' });
    } finally {
      spy.mockRestore();
    }
  });

  it('survives localStorage reads that throw', async () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    try {
      expect(await loadPrefs()).toBe(null);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('dataset (IndexedDB)', () => {
  it('reports {ok:false,error:"unavailable"} rather than throwing when IDB is missing', async () => {
    // jsdom has no indexedDB; writes must degrade gracefully.
    const result = await saveDataset({ name: 'x', columns: [], rows: [] });
    if (typeof indexedDB === 'undefined') {
      expect(result).toEqual({ ok: false, error: 'unavailable' });
      expect(await loadDataset()).toEqual({ found: false, error: 'unavailable' });
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it('clear* helpers never throw, even without IDB', async () => {
    await expect(clearStoredDataset()).resolves.toBe(undefined);
    await expect(clearAllLocal()).resolves.toBe(undefined);
  });
});

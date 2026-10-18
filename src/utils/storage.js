// localStorage + IndexedDB persistence for DataPilot Analytics.
// All functions are async and never throw. Write functions return a result
// object { ok, error } so callers can distinguish a real save from a silent
// failure: error is 'quota' when the browser refused for lack of space and
// 'unavailable' when storage is disabled (e.g. private/incognito mode).
// Never treat a write as successful until the returned ok is true.

import { openDB } from 'idb';

const PREFS_KEY = 'datapilot:prefs';
const CHARTS_KEY = 'datapilot:charts';
const THEME_KEY = 'datapilot:theme';
const DB_NAME = 'datapilot-db';
const STORE = 'kv';
const DATASET_KEY = 'dataset';

/** Classify a storage exception into a user-facing error code. */
export function classifyStorageError(e) {
  if (
    e &&
    (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22)
  ) {
    return 'quota';
  }
  return 'unavailable';
}

/** Friendly message for a storage result's error code (null when no error). */
export function storageErrorMessage(error) {
  if (error === 'quota') {
    return 'Save failed: browser storage quota exceeded. Free up space or turn persistence off.';
  }
  if (error === 'unavailable') {
    return 'Save failed: browser storage is unavailable (private/incognito mode or storage disabled).';
  }
  return null;
}

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: classifyStorageError(e) };
  }
}

export async function loadPrefs() {
  return loadJSON(PREFS_KEY);
}

export async function savePrefs(prefs) {
  return saveJSON(PREFS_KEY, prefs);
}

export async function loadCharts() {
  return loadJSON(CHARTS_KEY);
}

export async function saveCharts(charts) {
  return saveJSON(CHARTS_KEY, charts);
}

let dbPromise = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    }).catch(() => null);
  }
  return dbPromise;
}

export async function saveDataset(ds) {
  try {
    const db = await getDB();
    if (!db) return { ok: false, error: 'unavailable' };
    await db.put(STORE, ds, DATASET_KEY);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: classifyStorageError(e) };
  }
}

/**
 * Read result: { found: true, dataset } when a stored dataset exists,
 * { found: false, error } otherwise. error is null when nothing was stored
 * yet, 'quota'/'unavailable' when the read itself failed.
 */
export async function loadDataset() {
  try {
    const db = await getDB();
    if (!db) return { found: false, error: 'unavailable' };
    const ds = await db.get(STORE, DATASET_KEY);
    return ds ? { found: true, dataset: ds } : { found: false, error: null };
  } catch (e) {
    return { found: false, error: classifyStorageError(e) };
  }
}

export async function clearStoredDataset() {
  try {
    const db = await getDB();
    if (!db) return;
    await db.delete(STORE, DATASET_KEY);
  } catch {
    // never throw
  }
}

export async function clearAllLocal() {
  try {
    const db = await getDB();
    if (db) await db.clear(STORE);
  } catch {
    // never throw
  }
  for (const key of [PREFS_KEY, CHARTS_KEY, THEME_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // never throw
    }
  }
}

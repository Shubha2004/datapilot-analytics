// localStorage + IndexedDB persistence for DataPilot Analytics.
// All functions are async, use try/catch, and never throw.

import { openDB } from 'idb';

const PREFS_KEY = 'datapilot:prefs';
const CHARTS_KEY = 'datapilot:charts';
const THEME_KEY = 'datapilot:theme';
const DB_NAME = 'datapilot-db';
const STORE = 'kv';
const DATASET_KEY = 'dataset';

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
    return true;
  } catch {
    return false;
  }
}

export async function loadPrefs() {
  return loadJSON(PREFS_KEY);
}

export async function savePrefs(prefs) {
  saveJSON(PREFS_KEY, prefs);
}

export async function loadCharts() {
  return loadJSON(CHARTS_KEY);
}

export async function saveCharts(charts) {
  saveJSON(CHARTS_KEY, charts);
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
    if (!db) return false;
    await db.put(STORE, ds, DATASET_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function loadDataset() {
  try {
    const db = await getDB();
    if (!db) return null;
    return (await db.get(STORE, DATASET_KEY)) ?? null;
  } catch {
    return null;
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

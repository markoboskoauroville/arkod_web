// ON THE DEVICE: one IndexedDB store of named values (Moje čestice, their groups, the caches, Imenik,
// search history, the Lines style, the Google keys, the folios found by hand), and localStorage for
// the small preferences (which map, where it was, the switches).

const NAME = 'arkod-layer';
let opened = null;

function open() {
  if (opened) return opened;
  opened = new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return opened;
}

export async function get(key, fallback = null) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result === undefined ? fallback : r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function set(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function del(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** A small preference: localStorage, JSON, and a default when it is missing or unreadable. */
export function pref(key, fallback) {
  try {
    const v = localStorage.getItem('arkod.' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function setPref(key, value) {
  try { localStorage.setItem('arkod.' + key, JSON.stringify(value)); } catch { /* private mode: kept for this visit only */ }
}

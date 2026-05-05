// lib/storage.js
// Tracks downloads, tabs, and triage state in IndexedDB.
// Browser history stays where it is — we just read it via chrome.history.

const DB_NAME = 'mindful';
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('downloads')) {
        const s = db.createObjectStore('downloads', { keyPath: 'id' });
        s.createIndex('triaged', 'triaged');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('tabs')) {
        const s = db.createObjectStore('tabs', { keyPath: 'id' });
        s.createIndex('triaged', 'triaged');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('savedTabs')) {
        const s = db.createObjectStore('savedTabs', { keyPath: 'id' });
        s.createIndex('status', 'status');
        s.createIndex('savedAt', 'savedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export async function recordDownload(d) {
  const store = await tx('downloads', 'readwrite');
  return new Promise((res, rej) => {
    const req = store.put({
      id: d.id,
      filename: d.filename,
      url: d.url,
      mime: d.mime,
      bytes: d.bytes || 0,
      referrer: d.referrer || '',
      createdAt: Date.now(),
      triaged: 0, // 0 = no, 1 = yes (IndexedDB indexes don't like booleans)
      triagedAt: null,
      triageAction: null,
      note: ''
    });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function recordTab(t) {
  // Upsert: preserve createdAt and triage state if the row already exists.
  const store = await tx('tabs', 'readwrite');
  return new Promise((res, rej) => {
    const getReq = store.get(t.id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      const row = existing
        ? {
            ...existing,
            url: t.url || existing.url,
            title: t.title || existing.title,
            favicon: t.favicon || existing.favicon,
            openerTabId: t.openerTabId ?? existing.openerTabId
          }
        : {
            id: t.id,
            url: t.url,
            title: t.title || '',
            favicon: t.favicon || '',
            openerTabId: t.openerTabId || null,
            createdAt: Date.now(),
            closedAt: null,
            triaged: 0,
            triagedAt: null,
            triageAction: null,
            note: ''
          };
      const putReq = store.put(row);
      putReq.onsuccess = () => res(putReq.result);
      putReq.onerror = () => rej(putReq.error);
    };
    getReq.onerror = () => rej(getReq.error);
  });
}

export async function markTabClosed(id) {
  const store = await tx('tabs', 'readwrite');
  return new Promise((res) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) return res(null);
      row.closedAt = Date.now();
      const putReq = store.put(row);
      putReq.onsuccess = () => res(row);
    };
    getReq.onerror = () => res(null);
  });
}

export async function updateTab(id, patch) {
  const store = await tx('tabs', 'readwrite');
  return new Promise((res) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) return res(null);
      Object.assign(row, patch);
      const putReq = store.put(row);
      putReq.onsuccess = () => res(row);
    };
  });
}

export async function triageDownload(id, action, note = '') {
  const store = await tx('downloads', 'readwrite');
  return new Promise((res) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) return res(null);
      row.triaged = 1;
      row.triagedAt = Date.now();
      row.triageAction = action;
      if (note) row.note = note;
      const putReq = store.put(row);
      putReq.onsuccess = () => res(row);
    };
  });
}

export async function triageTab(id, action, note = '') {
  const store = await tx('tabs', 'readwrite');
  return new Promise((res) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) return res(null);
      row.triaged = 1;
      row.triagedAt = Date.now();
      row.triageAction = action;
      if (note) row.note = note;
      const putReq = store.put(row);
      putReq.onsuccess = () => res(row);
    };
  });
}

export async function getUntriagedDownloads() {
  const store = await tx('downloads');
  return new Promise((res) => {
    const idx = store.index('triaged');
    const req = idx.getAll(0);
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => res([]);
  });
}

export async function getUntriagedTabs() {
  const store = await tx('tabs');
  return new Promise((res) => {
    const idx = store.index('triaged');
    const req = idx.getAll(0);
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => res([]);
  });
}

export async function getAllRecentTabs(sinceMs) {
  const store = await tx('tabs');
  return new Promise((res) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      res(rows.filter((r) => r.createdAt >= sinceMs));
    };
    req.onerror = () => res([]);
  });
}

export async function getMeta(key, fallback = null) {
  const store = await tx('meta');
  return new Promise((res) => {
    const req = store.get(key);
    req.onsuccess = () => res(req.result ? req.result.value : fallback);
    req.onerror = () => res(fallback);
  });
}

export async function setMeta(key, value) {
  const store = await tx('meta', 'readwrite');
  return new Promise((res) => {
    const req = store.put({ key, value });
    req.onsuccess = () => res(true);
    req.onerror = () => res(false);
  });
}

export async function saveTabForLater(tab, note = '') {
  const now = Date.now();
  const store = await tx('savedTabs', 'readwrite');
  return new Promise((res, rej) => {
    const row = {
      id: `${now}_${tab.id || Math.random().toString(36).slice(2)}`,
      url: tab.url || '',
      title: tab.title || '',
      favicon: tab.favicon || tab.favIconUrl || '',
      sourceTabId: tab.id ?? tab.sourceTabId ?? null,
      sourceCreatedAt: tab.createdAt || null,
      note: note || '',
      savedAt: now,
      status: 'active',
      completedAt: null,
      dismissedAt: null
    };
    const req = store.put(row);
    req.onsuccess = () => res(row);
    req.onerror = () => rej(req.error);
  });
}

export async function getSavedTabs() {
  const store = await tx('savedTabs');
  return new Promise((res) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      const active = rows
        .filter((r) => r.status === 'active')
        .sort((a, b) => b.savedAt - a.savedAt);
      const archived = rows
        .filter((r) => r.status === 'completed')
        .sort((a, b) => (b.completedAt || b.savedAt) - (a.completedAt || a.savedAt));
      res({ active, archived });
    };
    req.onerror = () => res({ active: [], archived: [] });
  });
}

export async function completeSavedTab(id) {
  const store = await tx('savedTabs', 'readwrite');
  return new Promise((res) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) return res(null);
      row.status = 'completed';
      row.completedAt = Date.now();
      const putReq = store.put(row);
      putReq.onsuccess = () => res(row);
      putReq.onerror = () => res(null);
    };
    getReq.onerror = () => res(null);
  });
}

export async function dismissSavedTab(id) {
  const store = await tx('savedTabs', 'readwrite');
  return new Promise((res) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) return res(null);
      row.status = 'dismissed';
      row.dismissedAt = Date.now();
      const putReq = store.put(row);
      putReq.onsuccess = () => res(row);
      putReq.onerror = () => res(null);
    };
    getReq.onerror = () => res(null);
  });
}

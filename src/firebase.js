/* ═══════════════════════════════════════════
   LOCAL-ONLY DATA LAYER
   All reads/writes go to data/ via Vite dev server.
   Firebase is DISABLED — will be reconnected later
   when the full pipeline is stable.
   ═══════════════════════════════════════════ */

// Keep these exports so existing imports don't break
export const FIREBASE_CONFIG = { apiKey: "", projectId: "" };
export const FS_BASE = "";
export function toFsVal(val) { return val; }
export function fromFsVal(val) { return val; }
export function fromFsDoc(doc) { return doc; }

/* ═══════════════════════════════════════════
   LOCAL CACHE — localStorage for instant reads
   ═══════════════════════════════════════════ */
const LC_PREFIX = "xt_";

const localCache = {
  set(collection, docId, data) {
    try {
      localStorage.setItem(`${LC_PREFIX}${collection}_${docId}`, JSON.stringify({ ...data, _cachedAt: Date.now() }));
    } catch (e) {
      if (e.name === "QuotaExceededError") {
        this._evict();
        try { localStorage.setItem(`${LC_PREFIX}${collection}_${docId}`, JSON.stringify({ ...data, _cachedAt: Date.now() })); } catch {}
      }
    }
  },
  get(collection, docId) {
    try {
      const r = localStorage.getItem(`${LC_PREFIX}${collection}_${docId}`);
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  },
  getAll(collection) {
    const prefix = `${LC_PREFIX}${collection}_`, results = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        try {
          const d = JSON.parse(localStorage.getItem(key));
          if (d) { d._id = key.slice(prefix.length); results.push(d); }
        } catch {}
      }
    }
    return results.sort((a, b) => {
      const da = a.updated_at || a.created_at || String(a._cachedAt || "");
      const db_ = b.updated_at || b.created_at || String(b._cachedAt || "");
      return db_.localeCompare(da);
    });
  },
  remove(collection, docId) {
    try { localStorage.removeItem(`${LC_PREFIX}${collection}_${docId}`); } catch {}
  },
  clearCollection(collection) {
    const prefix = `${LC_PREFIX}${collection}_`;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) toRemove.push(key);
    }
    toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  },
  _evict() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LC_PREFIX)) {
        try { const d = JSON.parse(localStorage.getItem(key)); entries.push({ key, at: d?._cachedAt || 0 }); }
        catch { entries.push({ key, at: 0 }); }
      }
    }
    entries.sort((a, b) => a.at - b.at);
    const n = Math.max(1, Math.floor(entries.length * 0.25));
    for (let i = 0; i < n; i++) localStorage.removeItem(entries[i].key);
  }
};

/* ═══════════════════════════════════════════
   FILE STORE — JSON files in data/ folder
   Primary data store via Vite dev server middleware.
   ═══════════════════════════════════════════ */
const fileStore = {
  async save(collection, docId, data) {
    try {
      const res = await fetch(`/__api/backup/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch { return false; }
  },
  async remove(collection, docId) {
    try {
      await fetch(`/__api/backup/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, { method: "DELETE" });
    } catch {}
  },
  async getAll(collection) {
    try {
      const res = await fetch(`/__api/backup/${encodeURIComponent(collection)}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
};

/* ═══════════════════════════════════════════
   REQUEST DEDUP — prevents duplicate concurrent reads
   ═══════════════════════════════════════════ */
const _pendingFetches = new Map();

function _dedupFetch(cacheKey, fetchFn) {
  if (_pendingFetches.has(cacheKey)) return _pendingFetches.get(cacheKey);
  const p = fetchFn().finally(() => _pendingFetches.delete(cacheKey));
  _pendingFetches.set(cacheKey, p);
  return p;
}

/* ═══════════════════════════════════════════
   DB — Local-only database operations
   Same API as before, but reads/writes go to
   data/ files + localStorage. Zero Firebase calls.
   ═══════════════════════════════════════════ */
let _lastDbError = null;

export const db = {
  getLastError() { return _lastDbError; },

  async save(collection, data) {
    _lastDbError = null;
    try {
      const docId = "local_" + Date.now();
      data.created_at = data.created_at || new Date().toISOString();
      data.updated_at = new Date().toISOString();
      localCache.set(collection, docId, data);
      await fileStore.save(collection, docId, data);
      return docId;
    } catch (e) {
      _lastDbError = `Save exception: ${e.message}`;
      console.warn("[db]", _lastDbError);
      return null;
    }
  },

  async update(collection, docId, data) {
    _lastDbError = null;
    try {
      data.updated_at = new Date().toISOString();
      localCache.set(collection, docId, data);
      await fileStore.save(collection, docId, data);
      return true;
    } catch (e) {
      _lastDbError = `Update exception: ${e.message}`;
      console.warn("[db]", _lastDbError);
      return false;
    }
  },

  async getAll(collection) {
    return _dedupFetch(`getAll:${collection}`, () => this._getAllLocal(collection));
  },

  async _getAllLocal(collection) {
    _lastDbError = null;
    try {
      // Primary: file store (data/ folder)
      const docs = await fileStore.getAll(collection);
      if (docs.length > 0) {
        docs.sort((a, b) => {
          const da = a.updated_at || a.created_at || "";
          const db_ = b.updated_at || b.created_at || "";
          return db_.localeCompare(da);
        });
        // Sync to localStorage for instant subsequent reads
        docs.forEach(d => { if (d._id) localCache.set(collection, d._id, d); });
        return docs;
      }
      // Fallback: localStorage
      const cached = localCache.getAll(collection);
      if (cached.length > 0) {
        console.info(`[db] Serving ${cached.length} docs for '${collection}' from localStorage`);
        return cached;
      }
      return [];
    } catch (e) {
      _lastDbError = `GetAll exception: ${e.message}`;
      console.warn("[db]", _lastDbError);
      const cached = localCache.getAll(collection);
      if (cached.length > 0) return cached;
      return [];
    }
  },

  async delete(collection, docId) {
    _lastDbError = null;
    try {
      localCache.remove(collection, docId);
      await fileStore.remove(collection, docId);
      return true;
    } catch (e) {
      _lastDbError = `Delete exception: ${e.message}`;
      return false;
    }
  },

  async saveWithId(collection, docId, data) {
    _lastDbError = null;
    try {
      data.updated_at = new Date().toISOString();
      localCache.set(collection, docId, data);
      await fileStore.save(collection, docId, data);
      return true;
    } catch (e) {
      _lastDbError = `SaveWithId exception: ${e.message}`;
      console.warn("[db]", _lastDbError);
      return false;
    }
  },

  async getAllPaginated(collection) {
    // No pagination needed for local — just return all docs
    return _dedupFetch(`getAllPaginated:${collection}`, () => this._getAllLocal(collection));
  },

  async test() {
    // Test local file store connectivity
    try {
      const res = await fetch("/__api/backup/pipelines");
      if (res.ok) return { ok: true, mode: "local" };
      return { ok: false, error: "File store not responding" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};

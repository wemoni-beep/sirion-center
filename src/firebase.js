/* ═══════════════════════════════════════════
   SHARED FIREBASE CONFIGURATION & HELPERS
   ═══════════════════════════════════════════ */

// Firebase web API keys are public by design (security = Firestore rules).
// Read from Cloudflare Pages env vars (injected at build time via VITE_ prefix),
// Firebase is DISABLED — all data comes from local file store.
// To re-enable: set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in .env
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || ""
};

// Empty projectId = all Firebase calls fail instantly → localStorage fallback kicks in
export const FS_BASE = FIREBASE_CONFIG.projectId
  ? `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`
  : "";

// Phase 5: Production guard — warn if Firebase is not configured
export const FIREBASE_ENABLED = !!FS_BASE;
if (!FIREBASE_ENABLED) {
  console.warn("[Firebase] No project ID configured. Data will only persist in localStorage (lost on browser clear). Set VITE_FIREBASE_PROJECT_ID in .env for durable persistence.");
}

// Convert JS value → Firestore value (flatten deeply nested objects to JSON strings to avoid depth limits)
export function toFsVal(val, depth = 0) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val.length > 8000 ? val.substring(0, 8000) : val };
  // For deep objects/arrays: serialize to JSON string to avoid Firestore depth limits
  if (depth >= 2) return { stringValue: JSON.stringify(val).substring(0, 50000) };
  if (Array.isArray(val)) {
    // Firestore allows up to 20000 array elements; serialize large arrays to JSON string
    if (val.length > 500) return { stringValue: JSON.stringify(val) };
    return { arrayValue: { values: val.map(v => toFsVal(v, depth + 1)) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) { fields[k] = toFsVal(v, depth + 1); }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Convert Firestore value → JS value
export function fromFsVal(val) {
  if (!val) return null;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return parseInt(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("stringValue" in val) {
    // Try to parse JSON strings back to objects
    const s = val.stringValue;
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try { return JSON.parse(s); } catch { return s; }
    }
    return s;
  }
  if ("arrayValue" in val) return (val.arrayValue.values || []).map(fromFsVal);
  if ("mapValue" in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) { obj[k] = fromFsVal(v); }
    return obj;
  }
  return null;
}

export function fromFsDoc(doc) {
  if (!doc?.fields) return null;
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields)) { obj[k] = fromFsVal(v); }
  if (doc.name) obj._id = doc.name.split("/").pop();
  return obj;
}

/* ═══════════════════════════════════════════
   LOCAL CACHE — localStorage safety net
   Write-through on every save, fallback on load failure.
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
    return results.sort((a, b) => (b.created_at || b._cachedAt || "").toString().localeCompare((a.created_at || a._cachedAt || "").toString()));
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
   FILE BACKUP — REMOVED (was dev-only Vite middleware)
   The /__api/backup/ endpoint does not exist on static hosting.
   All persistence now flows through Firebase + localStorage.
   ═══════════════════════════════════════════ */
const fileBackup = {
  save() {},
  remove() {},
  async getAll() { return []; }
};

// Firestore DB operations with full error visibility
let _lastDbError = null;

export const db = {
  getLastError() { return _lastDbError; },

  async save(collection, data) {
    _lastDbError = null;
    try {
      const fields = {};
      for (const [k, v] of Object.entries(data)) { fields[k] = toFsVal(v, 0); }
      const url = `${FS_BASE}/${collection}?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        const err = await res.text();
        _lastDbError = `Save failed (${res.status}): ${err.substring(0, 200)}`;
        console.warn("Firebase:", _lastDbError);
        const tmpId = "local_" + Date.now();
        localCache.set(collection, tmpId, data);
        fileBackup.save(collection, tmpId, data);
        return null;
      }
      const doc = await res.json();
      const docId = doc.name ? doc.name.split("/").pop() : null;
      if (docId) { localCache.set(collection, docId, data); fileBackup.save(collection, docId, data); }
      return docId;
    } catch (e) {
      _lastDbError = `Save exception: ${e.message}`;
      console.warn("Firebase:", _lastDbError);
      const tmpId = "local_" + Date.now();
      localCache.set(collection, tmpId, data);
      fileBackup.save(collection, tmpId, data);
      return null;
    }
  },

  async update(collection, docId, data) {
    _lastDbError = null;
    localCache.set(collection, docId, data);
    fileBackup.save(collection, docId, data);
    try {
      const fields = {};
      for (const [k, v] of Object.entries(data)) { fields[k] = toFsVal(v, 0); }
      const updateMask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join("&");
      const url = `${FS_BASE}/${collection}/${docId}?${updateMask}&key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        const err = await res.text();
        _lastDbError = `Update failed (${res.status}): ${err.substring(0, 200)}`;
        console.warn("Firebase:", _lastDbError);
        return false;
      }
      return true;
    } catch (e) {
      _lastDbError = `Update exception: ${e.message}`;
      console.warn("Firebase:", _lastDbError);
      return false;
    }
  },

  // Firebase-first: read from Firebase, fall back to localStorage cache.
  async getAll(collection) {
    _lastDbError = null;
    // 1. Try Firebase as primary source
    try {
      const url = `${FS_BASE}/${collection}?key=${FIREBASE_CONFIG.apiKey}&pageSize=50`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.text();
        _lastDbError = `GetAll failed (${res.status}): ${err.substring(0, 200)}`;
        console.warn("Firebase:", _lastDbError);
        const cached = localCache.getAll(collection);
        if (cached.length > 0) return cached;
        return [];
      }
      const data = await res.json();
      const docs = (data.documents || []).map(fromFsDoc).filter(Boolean);
      docs.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      // Cache Firebase docs locally but do NOT overwrite existing file backup
      docs.forEach(d => { if (d._id) localCache.set(collection, d._id, d); });
      return docs;
    } catch (e) {
      _lastDbError = `GetAll exception: ${e.message}`;
      console.warn("Firebase:", _lastDbError);
      const cached = localCache.getAll(collection);
      if (cached.length > 0) return cached;
      return [];
    }
  },

  async delete(collection, docId) {
    _lastDbError = null;
    try {
      const url = `${FS_BASE}/${collection}/${docId}?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.text();
        _lastDbError = `Delete failed (${res.status}): ${err.substring(0, 200)}`;
        return false;
      }
      localCache.remove(collection, docId);
      fileBackup.remove(collection, docId);
      return true;
    } catch (e) {
      _lastDbError = `Delete exception: ${e.message}`;
      return false;
    }
  },

  // Save or overwrite a document at a known ID (PATCH creates if missing)
  async saveWithId(collection, docId, data) {
    _lastDbError = null;
    localCache.set(collection, docId, data);
    fileBackup.save(collection, docId, data);
    try {
      const fields = {};
      for (const [k, v] of Object.entries(data)) { fields[k] = toFsVal(v, 0); }
      const url = `${FS_BASE}/${collection}/${docId}?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        const err = await res.text();
        _lastDbError = `SaveWithId failed (${res.status}): ${err.substring(0, 200)}`;
        console.warn("Firebase:", _lastDbError);
        return false;
      }
      return true;
    } catch (e) {
      _lastDbError = `SaveWithId exception: ${e.message}`;
      console.warn("Firebase:", _lastDbError);
      return false;
    }
  },

  // Fetch all documents with pagination — Firebase-first
  async getAllPaginated(collection, maxPages = 20) {
    _lastDbError = null;
    // 1. Try Firebase with pagination
    try {
      let all = [];
      let pageToken = null;
      for (let i = 0; i < maxPages; i++) {
        let url = `${FS_BASE}/${collection}?key=${FIREBASE_CONFIG.apiKey}&pageSize=100`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const res = await fetch(url);
        if (!res.ok) {
          _lastDbError = `GetAllPaginated failed (${res.status})`;
          console.warn("Firebase:", _lastDbError);
          break;
        }
        const data = await res.json();
        const docs = (data.documents || []).map(fromFsDoc).filter(Boolean);
        all = all.concat(docs);
        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }
      if (all.length > 0) {
        all.forEach(d => { if (d._id) localCache.set(collection, d._id, d); });
        return all;
      }
    } catch (e) {
      _lastDbError = `GetAllPaginated exception: ${e.message}`;
      console.warn("Firebase:", _lastDbError);
    }
    // 3. Last resort: localStorage cache
    const cached = localCache.getAll(collection);
    return cached;
  },

  // Quick test — try to list the collection
  async test() {
    try {
      const url = `${FS_BASE}/analyses?key=${FIREBASE_CONFIG.apiKey}&pageSize=1`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.text();
        return { ok: false, error: `${res.status}: ${err.substring(0, 150)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};

/* ═══════════════════════════════════════════
   API KEY MANAGEMENT — Firebase-backed, localStorage-cached
   Keys are stored in Firebase (app_config/api_keys) so they
   persist across browsers/devices after Cloudflare deployment.
   On boot, keys are loaded from Firebase → localStorage.
   Getter functions in scanEngine.js/claudeApi.js read localStorage.
   ═══════════════════════════════════════════ */

const API_KEY_COLLECTION = "app_config";
const API_KEY_DOC = "api_keys";
const API_KEY_FIELDS = ["xt_anthropic_key", "xt_gemini_key", "xt_openai_key", "xt_perplexity_key"];

/**
 * Load API keys from Firebase into localStorage.
 * Called on app boot so getter functions work immediately.
 */
export async function loadApiKeys() {
  try {
    const url = `${FS_BASE}/${API_KEY_COLLECTION}/${API_KEY_DOC}?key=${FIREBASE_CONFIG.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields) return null;
    const keys = {};
    for (const field of API_KEY_FIELDS) {
      const val = fromFsVal(doc.fields[field]);
      if (val) {
        localStorage.setItem(field, val);
        keys[field] = val;
      }
    }
    console.info("[ApiKeys] Loaded from Firebase:", Object.keys(keys).length, "keys");
    return keys;
  } catch (e) {
    console.warn("[ApiKeys] Firebase load failed:", e.message);
    return null;
  }
}

/**
 * Save API keys to both localStorage (immediate) and Firebase (durable).
 */
export async function saveApiKeys(keys) {
  for (const field of API_KEY_FIELDS) {
    if (keys[field]) {
      localStorage.setItem(field, keys[field]);
    } else {
      localStorage.removeItem(field);
    }
  }
  try {
    const fields = {};
    for (const field of API_KEY_FIELDS) {
      fields[field] = toFsVal(keys[field] || "");
    }
    fields.updated_at = toFsVal(new Date().toISOString());
    const url = `${FS_BASE}/${API_KEY_COLLECTION}/${API_KEY_DOC}?key=${FIREBASE_CONFIG.apiKey}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      console.warn("[ApiKeys] Firebase save failed:", (await res.text()).substring(0, 200));
      return false;
    }
    console.info("[ApiKeys] Saved to Firebase");
    return true;
  } catch (e) {
    console.warn("[ApiKeys] Firebase save exception:", e.message);
    return false;
  }
}

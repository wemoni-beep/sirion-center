/* ═══════════════════════════════════════════
   PERSISTENCE MANAGER — Batched save queue
   Single point of coordination for all durable saves.
   Collects updateModule calls, writes once after quiet period.
   ═══════════════════════════════════════════ */

import { db } from "./firebase.js";

const COLLECTION = "pipelines";
const BATCH_DELAY = 1500;        // ms of quiet before flushing to Firebase
const RETRY_DELAYS = [5000, 15000, 30000]; // retry backoff on Firebase failure

export function createPersistenceManager(getState, getDocId, setDocId) {
  let _timer = null;
  let _retryCount = 0;
  let _saving = false;
  let _lastSavedAt = null;
  let _error = null;
  let _destroyed = false;

  let _lastHash = null;

  // ── Build a slim snapshot — localStorage is light cache, not source of truth ──
  function _buildSnapshot(state) {
    const snap = {};
    for (const key of Object.keys(state)) {
      if (key.startsWith("_")) continue;
      snap[key] = state[key];
    }

    // ── Strip heavy data that lives in its own Firebase collection ──
    // M1: questions live in m1_questions_v2, personas in m1_personas
    if (snap.m1) {
      snap.m1 = { ...snap.m1 };
      delete snap.m1.questions;        // 1000+ items → m1_questions_v2
      delete snap.m1.personaProfiles;  // full text → m1_personas
    }
    // Intel: keep scores/narrative (display-ready), drop full scan results array
    if (snap.intel) {
      snap.intel = { ...snap.intel };
      if (snap.intel.scanResults) {
        // Keep metadata (llms, date, scores) but drop individual results
        const { results, ...scanMeta } = snap.intel.scanResults;
        snap.intel.scanResults = scanMeta;
      }
    }
    // M2: keep scores, drop full scan results
    if (snap.m2) {
      snap.m2 = { ...snap.m2 };
      if (snap.m2.scanResults) {
        const { results, ...scanMeta } = snap.m2.scanResults;
        snap.m2.scanResults = scanMeta;
      }
    }

    snap.updated_at = new Date().toISOString();
    return snap;
  }

  // ── Immediate localStorage write (sync, crash safety) ──
  function _writeLocalStorage(snap) {
    try {
      localStorage.setItem("xt_pipeline_snapshot", JSON.stringify(snap));
    } catch (e) { console.warn("[PersistenceManager] localStorage write failed:", e.message); }
  }

  // ── Firebase write (async, durable) ──
  async function _writeFirebase(snap) {
    const docId = getDocId();
    if (docId) {
      const ok = await db.saveWithId(COLLECTION, docId, snap);
      if (!ok) throw new Error("Firebase saveWithId failed");
    } else {
      const newId = await db.save(COLLECTION, snap);
      if (newId) {
        setDocId(newId);
      } else {
        throw new Error("Firebase save failed (no docId returned)");
      }
    }
  }

  // ── Simple hash to detect meaningful changes ──
  function _quickHash(obj) {
    const s = JSON.stringify(obj, (k, v) => k === "updated_at" ? undefined : v);
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
  }

  // ── Flush: write current state to all persistence layers ──
  async function flush() {
    if (_destroyed) return;
    if (_saving) return; // Already flushing, the timer will re-schedule if needed

    const state = getState();
    if (!state._loaded) return;

    const snap = _buildSnapshot(state);

    // 1. localStorage — always, synchronous
    _writeLocalStorage(snap);

    // 2. Firebase — skip if nothing changed (reduce write amplification)
    const hash = _quickHash(snap);
    if (hash === _lastHash) return;

    _saving = true;
    _error = null;
    try {
      await _writeFirebase(snap);
      _lastSavedAt = new Date().toISOString();
      _lastHash = hash;
      _retryCount = 0;
    } catch (e) {
      console.warn("[PersistenceManager] Firebase save failed:", e.message);
      _error = e.message;
      // Schedule retry
      if (_retryCount < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[_retryCount];
        _retryCount++;
        console.info(`[PersistenceManager] Retrying in ${delay / 1000}s (attempt ${_retryCount}/${RETRY_DELAYS.length})`);
        if (!_destroyed) {
          _timer = setTimeout(() => { _saving = false; flush(); }, delay);
        }
      } else {
        console.error("[PersistenceManager] All retries exhausted. Data is in localStorage only.");
      }
    }
    _saving = false;
  }

  // ── Enqueue: schedule a batched flush ──
  function enqueueSave() {
    if (_destroyed) return;
    // Immediate localStorage write for crash safety
    const state = getState();
    if (state._loaded) {
      _writeLocalStorage(_buildSnapshot(state));
    }
    // Debounce the Firebase write
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(flush, BATCH_DELAY);
  }

  // ── Status for UI indicators ──
  function getStatus() {
    return { saving: _saving, lastSavedAt: _lastSavedAt, error: _error };
  }

  // ── Lifecycle: beforeunload + visibilitychange ──
  function _onBeforeUnload() {
    // Sync localStorage write only (fetch may not complete)
    const state = getState();
    if (state._loaded) {
      _writeLocalStorage(_buildSnapshot(state));
    }
  }

  function _onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      // Try to save to Firebase using keepalive fetch
      const state = getState();
      if (!state._loaded) return;
      const snap = _buildSnapshot(state);
      _writeLocalStorage(snap);
      // Use sendBeacon or keepalive fetch for Firebase
      // (best-effort, may not complete)
      const docId = getDocId();
      if (docId) {
        try {
          db.saveWithId(COLLECTION, docId, snap).catch(() => {});
        } catch {}
      }
    }
  }

  window.addEventListener("beforeunload", _onBeforeUnload);
  document.addEventListener("visibilitychange", _onVisibilityChange);

  // ── Cleanup ──
  function destroy() {
    _destroyed = true;
    if (_timer) clearTimeout(_timer);
    window.removeEventListener("beforeunload", _onBeforeUnload);
    document.removeEventListener("visibilitychange", _onVisibilityChange);
  }

  return { enqueueSave, flush, getStatus, destroy };
}

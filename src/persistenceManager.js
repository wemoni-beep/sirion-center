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

  // ── Build a clean snapshot (no internal _ fields) ──
  function _buildSnapshot(state) {
    const snap = {};
    for (const key of Object.keys(state)) {
      if (key.startsWith("_")) continue;
      snap[key] = state[key];
    }
    snap.updated_at = new Date().toISOString();
    return snap;
  }

  // ── Immediate localStorage write (sync, crash safety) ──
  function _writeLocalStorage(snap) {
    try {
      localStorage.setItem("xt_pipeline_snapshot", JSON.stringify(snap));
    } catch {}
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

  // ── Flush: write current state to all persistence layers ──
  async function flush() {
    if (_destroyed) return;
    if (_saving) return; // Already flushing, the timer will re-schedule if needed

    const state = getState();
    if (!state._loaded) return;

    const snap = _buildSnapshot(state);

    // 1. localStorage — always, synchronous
    _writeLocalStorage(snap);

    // 2. Firebase — async with retry
    _saving = true;
    _error = null;
    try {
      await _writeFirebase(snap);
      _lastSavedAt = new Date().toISOString();
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

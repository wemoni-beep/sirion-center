import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from "react";
import { db, loadApiKeys } from "./firebase.js";
import { createPersistenceManager } from "./persistenceManager.js";
// Seed data bundled at build time — used as fallback when Firebase + localStorage are empty
import seedPipeline from "../data/pipelines/local_master.json";

const COLLECTION = "pipelines";

// ── Data version: bump this after any seed/reset to clear ALL stale caches ──
const DATA_VERSION = "2026-03-03-v4";
(function clearStaleCache() {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("xt_data_version") !== DATA_VERSION) {
      localStorage.removeItem("xt_pipeline_snapshot");
      localStorage.removeItem("m2_scanHistory");
      localStorage.setItem("xt_data_version", DATA_VERSION);
      // Phase 4: Also clear IndexedDB so M1 doesn't re-hydrate stale questions
      try { indexedDB.deleteDatabase("xtrusio-m1"); } catch {}
      console.info("[Pipeline] Cleared all caches — localStorage + IndexedDB (data version updated)");
    }
  } catch {}
})();

const INITIAL_STATE = {
  _docId: null,
  _loaded: false,
  _saving: false,
  meta: { company: "Sirion", url: "https://sirion.ai", industry: "Contract Lifecycle Management" },
  // Phase 3: generationId fields track data freshness across modules
  m1: { questions: [], personas: [], clusters: [], generatedAt: null, personaProfiles: [], decisionScores: {}, generationId: null },
  m2: { scanResults: null, scores: null, contentGaps: [], personaBreakdown: [], stageBreakdown: [], recommendations: [], scannedAt: null, scanProgress: null, generationId: null, m1GenerationId: null },
  m3: { prioritizedDomains: [], gapMatrix: null, outreachPlan: null, personaDomainMap: null, gapCount: 0, strongCount: 0, analyzedAt: null, generationId: null, m2GenerationId: null },
  m4: { analyses: [], latestStage: null, latestReadiness: null, analyzedAt: null, generationId: null },
  m5: { recommendations: [], leadData: null, generatedAt: null, generationId: null },
};

function reducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return { ...state, ...action.payload, _loaded: true };
    case "UPDATE_MODULE":
      return {
        ...state,
        [action.moduleId]: { ...state[action.moduleId], ...action.data },
      };
    case "UPDATE_META":
      return { ...state, meta: { ...state.meta, ...action.data } };
    case "SET_DOC_ID":
      return { ...state, _docId: action.docId };
    case "SET_SAVING":
      return { ...state, _saving: action.value };
    case "SET_LOADED":
      return { ...state, _loaded: true };
    default:
      return state;
  }
}

const PipelineContext = createContext(null);

export function PipelineProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Persistence manager (batched saves to localStorage + Firebase) ──
  const pmRef = useRef(null);
  if (!pmRef.current) {
    pmRef.current = createPersistenceManager(
      () => stateRef.current,
      () => stateRef.current._docId,
      (newId) => dispatch({ type: "SET_DOC_ID", docId: newId })
    );
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pmRef.current) pmRef.current.destroy(); };
  }, []);

  // ── Load pipeline from Firebase (primary) or localStorage (fallback) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load API keys in background
        loadApiKeys().catch(() => {});

        // Phase 2: Firebase is the primary source. No file backup.
        const docs = await db.getAll(COLLECTION);
        if (cancelled) return;

        if (docs.length > 0) {
          const latest = docs[0];
          const docId = latest._id;
          delete latest._id;

          // Merge with INITIAL_STATE to ensure all keys exist
          const merged = {};
          for (const key of Object.keys(INITIAL_STATE)) {
            if (key.startsWith("_")) continue;
            if (latest[key] && typeof latest[key] === "object" && !Array.isArray(latest[key])) {
              merged[key] = { ...INITIAL_STATE[key], ...latest[key] };
            } else if (latest[key] !== undefined) {
              merged[key] = latest[key];
            }
          }

          // Phase 2: Timestamp-based merge with localStorage (not blind patch)
          // Only prefer localStorage if it has a NEWER timestamp than Firebase
          try {
            const snap = localStorage.getItem("xt_pipeline_snapshot");
            if (snap) {
              const parsed = JSON.parse(snap);
              const localTime = parsed._savedAt || 0;
              const fbTime = latest.updated_at || "";
              // Only use localStorage if it's clearly newer
              if (localTime && fbTime && new Date(localTime) > new Date(fbTime)) {
                console.info("[Pipeline] localStorage is newer than Firebase — using localStorage data");
                for (const key of ["m1", "m2", "m3", "m4", "m5"]) {
                  if (parsed[key] && typeof parsed[key] === "object") {
                    merged[key] = { ...INITIAL_STATE[key], ...parsed[key] };
                  }
                }
              }
            }
          } catch (e) { console.warn("[Pipeline] localStorage merge check failed:", e.message); }

          // Backfill: if Firebase has no M2/M3 scan data, use bundled seed sample data
          for (const mod of ["m2", "m3"]) {
            const hasData = mod === "m2" ? !!merged.m2?.scores : (merged.m3?.prioritizedDomains?.length > 0);
            if (!hasData && seedPipeline?.[mod]) {
              merged[mod] = { ...INITIAL_STATE[mod], ...seedPipeline[mod] };
              console.info(`[Pipeline] Backfilled ${mod} from bundled seed data`);
            }
          }

          dispatch({ type: "LOAD", payload: { ...merged, _docId: docId } });
        } else {
          // No Firebase docs — try localStorage snapshot
          try {
            const snap = localStorage.getItem("xt_pipeline_snapshot");
            if (snap) {
              const parsed = JSON.parse(snap);
              dispatch({ type: "LOAD", payload: parsed });
              console.info("[Pipeline] Restored from localStorage snapshot (no Firebase docs)");
              return;
            }
          } catch {}
          // Last resort: bundled seed data (questions + any sample M2/M3 data)
          if (seedPipeline?.m1?.questions?.length > 0) {
            const seed = {
              meta: seedPipeline.meta || INITIAL_STATE.meta,
              m1: seedPipeline.m1,
              m2: { ...INITIAL_STATE.m2, ...(seedPipeline.m2 || {}) },
              m3: { ...INITIAL_STATE.m3, ...(seedPipeline.m3 || {}) },
              m4: { ...INITIAL_STATE.m4, ...(seedPipeline.m4 || {}) },
              m5: INITIAL_STATE.m5,
            };
            dispatch({ type: "LOAD", payload: seed });
            console.info("[Pipeline] Loaded bundled seed data (" + seedPipeline.m1.questions.length + " questions)");
            return;
          }
          dispatch({ type: "SET_LOADED" });
        }
      } catch (e) {
        console.error("Pipeline load failed:", e);
        // Fallback: localStorage only
        try {
          const snap = localStorage.getItem("xt_pipeline_snapshot");
          if (snap) {
            const parsed = JSON.parse(snap);
            dispatch({ type: "LOAD", payload: parsed });
            console.info("[Pipeline] Restored from localStorage snapshot (Firebase failed)");
            return;
          }
        } catch {}
        // Seed fallback on error too
        if (seedPipeline?.m1?.questions?.length > 0) {
          const seed = {
            meta: seedPipeline.meta || INITIAL_STATE.meta,
            m1: seedPipeline.m1,
            m2: { ...INITIAL_STATE.m2, ...(seedPipeline.m2 || {}) },
            m3: { ...INITIAL_STATE.m3, ...(seedPipeline.m3 || {}) },
            m4: { ...INITIAL_STATE.m4, ...(seedPipeline.m4 || {}) },
            m5: INITIAL_STATE.m5,
          };
          dispatch({ type: "LOAD", payload: seed });
          console.info("[Pipeline] Loaded bundled seed data as error fallback");
          return;
        }
        dispatch({ type: "SET_LOADED" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Update module data — single entry point for all modules ──
  // Phase 1: No more synchronous localStorage write with stale stateRef.
  // Instead, dispatch to React state, then let persistenceManager batch the save.
  const updateModule = useCallback((moduleId, data) => {
    dispatch({ type: "UPDATE_MODULE", moduleId, data });
    // Let the persistence manager handle localStorage + Firebase batching.
    // It reads stateRef.current at flush time (after React has processed all dispatches).
    // Use queueMicrotask so the stateRef is updated before the localStorage write.
    queueMicrotask(() => {
      if (pmRef.current) pmRef.current.enqueueSave();
    });
  }, []);

  const updateMeta = useCallback((data) => {
    dispatch({ type: "UPDATE_META", data });
    queueMicrotask(() => {
      if (pmRef.current) pmRef.current.enqueueSave();
    });
  }, []);

  // Pipeline status helper
  const getStatus = useCallback(() => {
    const s = stateRef.current;
    return {
      m1: { hasData: s.m1.questions.length > 0, count: s.m1.questions.length, at: s.m1.generatedAt },
      m2: { hasData: !!s.m2.scores, count: s.m2.scanResults?.results?.length || 0, at: s.m2.scannedAt },
      m3: { hasData: s.m3.prioritizedDomains.length > 0, count: s.m3.prioritizedDomains.length, at: s.m3.analyzedAt },
      m4: { hasData: s.m4.analyses.length > 0, count: s.m4.analyses.length, at: s.m4.analyzedAt },
      m5: { hasData: s.m5.recommendations.length > 0, count: s.m5.recommendations.length, at: s.m5.generatedAt },
    };
  }, []);

  // Phase 3: Staleness detection helper
  const getStaleness = useCallback(() => {
    const s = stateRef.current;
    return {
      m2: s.m2.m1GenerationId && s.m2.m1GenerationId !== s.m1.generationId,
      m3: s.m3.m2GenerationId && s.m3.m2GenerationId !== s.m2.generationId,
    };
  }, []);

  // Expose persistence status for UI save indicators
  const getSaveStatus = useCallback(() => {
    return pmRef.current ? pmRef.current.getStatus() : { saving: false, lastSavedAt: null, error: null };
  }, []);

  const value = useMemo(() => ({
    pipeline: state, updateModule, updateMeta, getStatus, getStaleness, getSaveStatus
  }), [state, updateModule, updateMeta, getStatus, getStaleness, getSaveStatus]);

  return (
    <PipelineContext.Provider value={value}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used inside PipelineProvider");
  return ctx;
}

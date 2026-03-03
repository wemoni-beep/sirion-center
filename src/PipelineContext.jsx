import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from "react";
import { db, loadApiKeys } from "./firebase.js";

const COLLECTION = "pipelines";

// ── Data version: bump this after any seed/reset to clear stale localStorage ──
const DATA_VERSION = "2026-03-03-v2";
(function clearStaleCache() {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("xt_data_version") !== DATA_VERSION) {
      localStorage.removeItem("xt_pipeline_snapshot");
      localStorage.removeItem("m2_scanHistory");
      localStorage.setItem("xt_data_version", DATA_VERSION);
      console.info("[Pipeline] Cleared stale localStorage cache (data version updated)");
    }
  } catch {}
})();

const INITIAL_STATE = {
  _docId: null,
  _loaded: false,
  _saving: false,
  meta: { company: "Sirion", url: "https://sirion.ai", industry: "Contract Lifecycle Management" },
  m1: { questions: [], personas: [], clusters: [], generatedAt: null, personaProfiles: [] },
  m2: { scanResults: null, scores: null, contentGaps: [], personaBreakdown: [], stageBreakdown: [], recommendations: [], scannedAt: null },
  m3: { prioritizedDomains: [], gapMatrix: null, outreachPlan: null, personaDomainMap: null, gapCount: 0, strongCount: 0, analyzedAt: null },
  m4: { analyses: [], latestStage: null, latestReadiness: null, analyzedAt: null },
  m5: { recommendations: [], leadData: null, generatedAt: null },
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
  const saveTimerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load latest pipeline + API keys from Firebase on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load API keys from Firebase → localStorage so LLM getters work immediately
        loadApiKeys().catch(() => {});
        const docs = await db.getAll(COLLECTION);
        if (cancelled) return;
        if (docs.length > 0) {
          const latest = docs[0];
          const docId = latest._id;
          delete latest._id;
          // Merge loaded data with initial state structure to ensure all keys exist
          const merged = {};
          for (const key of Object.keys(INITIAL_STATE)) {
            if (key.startsWith("_")) continue;
            if (latest[key] && typeof latest[key] === "object" && !Array.isArray(latest[key])) {
              merged[key] = { ...INITIAL_STATE[key], ...latest[key] };
            } else if (latest[key] !== undefined) {
              merged[key] = latest[key];
            }
          }
          // Patch from localStorage snapshot: fill any null/empty module fields that the
          // snapshot has — handles the case where Firebase PATCH succeeded for m1 but failed
          // to persist m2/m4 updates (localStorage is always written before Firebase).
          try {
            const snap = localStorage.getItem("xt_pipeline_snapshot");
            if (snap) {
              const parsed = JSON.parse(snap);
              for (const key of ["m1", "m2", "m3", "m4", "m5"]) {
                const fbVal = merged[key];
                const localVal = parsed[key];
                if (localVal && typeof localVal === "object") {
                  // For each field in the module, if Firebase has null/empty but localStorage has data, prefer localStorage
                  const patched = { ...fbVal };
                  for (const [field, localField] of Object.entries(localVal)) {
                    if ((patched[field] == null || patched[field] === "" || (Array.isArray(patched[field]) && patched[field].length === 0)) && localField != null && localField !== "" && !(Array.isArray(localField) && localField.length === 0)) {
                      patched[field] = localField;
                    }
                  }
                  merged[key] = patched;
                }
              }
            }
          } catch (e) { console.warn("[Pipeline] localStorage snapshot patch failed:", e.message); }
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
          // Third fallback: file backup
          try {
            const res = await fetch("/__api/backup/pipeline_snapshot/current");
            if (res.ok) {
              const parsed = await res.json();
              if (parsed && Object.keys(parsed).length > 0) {
                dispatch({ type: "LOAD", payload: parsed });
                console.info("[Pipeline] Restored from file backup (no Firebase docs, no localStorage)");
                return;
              }
            }
          } catch {}
          dispatch({ type: "SET_LOADED" });
        }
      } catch (e) {
        console.error("Pipeline load failed:", e);
        // Fallback: localStorage -> file backup
        try {
          const snap = localStorage.getItem("xt_pipeline_snapshot");
          if (snap) {
            const parsed = JSON.parse(snap);
            dispatch({ type: "LOAD", payload: parsed });
            console.info("[Pipeline] Restored from localStorage snapshot (Firebase failed)");
            return;
          }
        } catch {}
        try {
          const res = await fetch("/__api/backup/pipeline_snapshot/current");
          if (res.ok) {
            const parsed = await res.json();
            if (parsed && Object.keys(parsed).length > 0) {
              dispatch({ type: "LOAD", payload: parsed });
              console.info("[Pipeline] Restored from file backup (Firebase + localStorage failed)");
              return;
            }
          }
        } catch {}
        dispatch({ type: "SET_LOADED" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced save — LOCAL-FIRST: always save to local_master.json via file backup.
  // Firebase sync is deferred to the explicit "Push to Firebase" flow.
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const s = stateRef.current;
      if (!s._loaded) return;
      dispatch({ type: "SET_SAVING", value: true });
      try {
        const data = {};
        for (const key of Object.keys(s)) {
          if (key.startsWith("_")) continue;
          data[key] = s[key];
        }
        data.updated_at = new Date().toISOString();
        // Save to local file backup only (local_master.json)
        await fetch("/__api/backup/pipelines/local_master", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch (e) {
        console.error("Pipeline save failed:", e);
      }
      dispatch({ type: "SET_SAVING", value: false });
    }, 2000);
  }, []);

  const updateModule = useCallback((moduleId, data) => {
    dispatch({ type: "UPDATE_MODULE", moduleId, data });
    // Immediate localStorage snapshot (sync, instant — survives tab close within debounce window)
    try {
      const s = stateRef.current;
      const snap = {};
      for (const key of Object.keys(s)) {
        if (key.startsWith("_")) continue;
        snap[key] = key === moduleId ? { ...s[key], ...data } : s[key];
      }
      localStorage.setItem("xt_pipeline_snapshot", JSON.stringify(snap));
      // File backup (fire-and-forget)
      fetch("/__api/backup/pipeline_snapshot/current", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap)
      }).catch(() => {});
    } catch {}
    scheduleSave();
  }, [scheduleSave]);

  const updateMeta = useCallback((data) => {
    dispatch({ type: "UPDATE_META", data });
    try {
      const s = stateRef.current;
      const snap = {};
      for (const key of Object.keys(s)) {
        if (key.startsWith("_")) continue;
        snap[key] = key === "meta" ? { ...s.meta, ...data } : s[key];
      }
      localStorage.setItem("xt_pipeline_snapshot", JSON.stringify(snap));
      fetch("/__api/backup/pipeline_snapshot/current", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap)
      }).catch(() => {});
    } catch {}
    scheduleSave();
  }, [scheduleSave]);

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

  return (
    <PipelineContext.Provider value={{ pipeline: state, updateModule, updateMeta, getStatus }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used inside PipelineProvider");
  return ctx;
}

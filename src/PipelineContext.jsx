import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from "react";
import { db } from "./firebase.js";

const COLLECTION = "pipelines";

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

  // Load latest pipeline from Firebase on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
          // If m2 has no scan results in the pipeline doc, hydrate from m2_scan_results collection
          if (!merged.m2?.scanResults?.results?.length) {
            try {
              const [scanMeta, scanResults] = await Promise.all([
                db.getAllPaginated("m2_scan_meta"),
                db.getAllPaginated("m2_scan_results"),
              ]);
              if (scanResults.length > 0) {
                const latestMeta = scanMeta
                  .filter(m => m.status === "complete")
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
                  || scanMeta[0];
                const llms = latestMeta?.llms || ["claude", "gemini", "openai"];
                const compactResults = scanResults.map(r => ({
                  qid: r.qid, question: r.question, query: r.query,
                  lifecycle: r.lifecycle, persona: r.persona, stage: r.stage,
                  mentions: r.mentions || Object.fromEntries(
                    llms.map(lid => [lid, r.analyses?.[lid]?.mentioned || false])
                  ),
                }));
                if (!merged.m2) merged.m2 = { ...INITIAL_STATE.m2 };
                merged.m2 = {
                  ...merged.m2,
                  scanResults: { llms, results: compactResults },
                  scores: latestMeta?.scores || merged.m2.scores,
                  scannedAt: latestMeta?.date || merged.m2.scannedAt,
                };
                console.info(`[Pipeline] Hydrated m2.scanResults from m2_scan_results (${compactResults.length} results)`);
              }
            } catch (e) { console.warn("[Pipeline] m2 hydration failed:", e.message); }
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

  // Debounced save to Firebase
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const s = stateRef.current;
      if (!s._loaded) return;
      dispatch({ type: "SET_SAVING", value: true });
      try {
        // Build saveable data (exclude internal fields)
        const data = {};
        for (const key of Object.keys(s)) {
          if (key.startsWith("_")) continue;
          data[key] = s[key];
        }
        data.updated_at = new Date().toISOString();

        if (s._docId) {
          await db.update(COLLECTION, s._docId, data);
        } else {
          data.created_at = new Date().toISOString();
          const docId = await db.save(COLLECTION, data);
          if (docId) dispatch({ type: "SET_DOC_ID", docId });
        }
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

import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from "react";
import { db, loadApiKeys, saveApiKeys, FIREBASE_ENABLED, FIREBASE_CONFIG } from "./firebase.js";
import { createPersistenceManager } from "./persistenceManager.js";
// Seed data bundled at build time — used as fallback when Firebase + localStorage are empty
import seedPipeline from "../data/pipelines/local_master.json";

// ═══════════════════════════════════════════════════════════
// CANONICAL DATA SOURCES (single source of truth for each entity):
//
// - Questions (M1):   Firebase pipeline doc .m1.questions — IndexedDB is browser-local cache only
// - Scan results (M2): Firebase m2_scan_meta + m2_scans + m2_scan_results — pipeline.m2 is display cache
// - Authority (M3):   Firebase pipeline doc .m3 — derivable from M2, no independent collection
// - Buying Stage (M4): Firebase pipeline doc .m4 — derivable from M1, no independent collection
// - CLM (M5):         Firebase pipeline doc .m5 — no independent collection
// - API keys:         Firebase app_config/api_keys → localStorage cache for sync reads
// - Calibration:      Firebase pipeline doc .m1/.m2 sub-keys — localStorage is NOT source of truth
//
// Write path: updateModule() → persistenceManager → localStorage (immediate) + Firebase (batched)
// Read path:  Firebase (primary) → localStorage (fallback) → seed data (last resort)
// ═══════════════════════════════════════════════════════════

const COLLECTION = "pipelines";

// ── Data version: bump this after any seed/reset to clear ALL stale caches ──
const DATA_VERSION = "2026-03-07-v5";
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
  m1: { questions: [], personas: [], clusters: [], generatedAt: null, personaProfiles: [], decisionScores: {}, yinMatrix: null, generationId: null, scanBatch: null, clusterCalibration: null },
  m2: { scanResults: null, scores: null, contentGaps: [], personaBreakdown: [], stageBreakdown: [], recommendations: [], scannedAt: null, scanProgress: null, generationId: null, m1GenerationId: null, calibration: null, contentPipeline: [] },
  m3: { prioritizedDomains: [], gapMatrix: null, outreachPlan: null, personaDomainMap: null, gapCount: 0, strongCount: 0, analyzedAt: null, generationId: null, m2GenerationId: null },
  m4: { analyses: [], latestStage: null, latestReadiness: null, companyBuckets: {}, analyzedAt: null, generationId: null },
  m5: { recommendations: [], leadData: null, generatedAt: null, generationId: null },
  intel: { companyName: null, companyUrl: null, industry: null, overview: null, productsServices: [], targetMarket: null, competitors: [], decisionMakers: [], buyerPersonas: [], recentNews: [], marketPosition: null, keyFindings: [], demandMap: null, questions: [], researchedAt: null, generationId: null, researchPhase: null, error: null },
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

  // ── Boot diagnostics — tracks how data was loaded for Settings display ──
  const diagnosticsRef = useRef({
    firebase: { enabled: FIREBASE_ENABLED, projectId: FIREBASE_CONFIG.projectId || "(none)", loadedDocs: 0, loadError: null },
    dataSource: "pending", // "firebase" | "localStorage" | "seed" | "empty"
    dataVersion: DATA_VERSION,
    seedQuestionCount: seedPipeline?.m1?.questions?.length || 0,
    bootedAt: new Date().toISOString(),
  });

  // ── Persistence manager (batched saves to localStorage + Firebase) ──
  const pmRef = useRef(null);
  if (!pmRef.current) {
    pmRef.current = createPersistenceManager(
      () => stateRef.current,
      () => stateRef.current._docId,
      (newId) => dispatch({ type: "SET_DOC_ID", docId: newId })
    );
  }

  // Cleanup on unmount (StrictMode-safe: null the ref so next render recreates PM)
  useEffect(() => {
    return () => {
      if (pmRef.current) {
        pmRef.current.destroy();
        pmRef.current = null;
      }
    };
  }, []);

  // ── Load pipeline from Firebase (primary) or localStorage (fallback) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load API keys in background — track result for diagnostics
        loadApiKeys().then(result => {
          if (result) {
            diagnosticsRef.current.firebaseKeyNames = Object.keys(result);
            diagnosticsRef.current.firebaseKeyDocExists = true;
          } else {
            diagnosticsRef.current.firebaseKeyNames = [];
            diagnosticsRef.current.firebaseKeyDocExists = false;
          }
        }).catch(() => {
          diagnosticsRef.current.firebaseKeyNames = [];
          diagnosticsRef.current.firebaseKeyDocExists = false;
        });

        // Phase 2: Firebase is the primary source. No file backup.
        let docs = [];
        try {
          docs = await db.getAll(COLLECTION);
        } catch (fbErr) {
          diagnosticsRef.current.firebase.loadError = fbErr.message;
        }
        if (cancelled) return;
        diagnosticsRef.current.firebase.loadedDocs = docs.length;

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
          // Boot trace: companyIntel presence after merge
          if (merged.m1?.companyIntel) console.info("[Pipeline] Boot: companyIntel present for", merged.m1.companyIntel.companyName || "?");

          // Phase 2: Timestamp-based merge with localStorage (not blind patch)
          // Only prefer localStorage if it has a NEWER timestamp than Firebase.
          // IMPORTANT: Use key-level merge that preserves non-null Firebase values
          // when localStorage has null. This prevents boot-cycle overwrites where
          // persistenceManager flushes before a useEffect restores state from the pipeline.
          try {
            const snap = localStorage.getItem("xt_pipeline_snapshot");
            if (snap) {
              const parsed = JSON.parse(snap);
              const localTime = parsed._savedAt || 0;
              const fbTime = latest.updated_at || "";
              // Only use localStorage if it's clearly newer
              if (localTime && fbTime && new Date(localTime) > new Date(fbTime)) {
                console.info("[Pipeline] localStorage is newer than Firebase — merging (preserving non-null Firebase values)");
                for (const key of ["m1", "m2", "m3", "m4", "m5", "intel", "meta"]) {
                  if (parsed[key] && typeof parsed[key] === "object") {
                    const localMod = parsed[key];
                    const fbMod = latest[key] || {};
                    // Start with INITIAL_STATE, layer localStorage, then restore any
                    // non-null Firebase values that localStorage nulled out
                    const result = { ...INITIAL_STATE[key], ...localMod };
                    for (const [k, v] of Object.entries(fbMod)) {
                      if (v != null && result[k] == null) {
                        result[k] = v;
                        console.info(`[Pipeline] Preserved Firebase ${key}.${k} (localStorage had null)`);
                      }
                    }
                    merged[key] = result;
                  }
                }
              }
            }
          } catch (e) { console.warn("[Pipeline] localStorage merge check failed:", e.message); }

          // Backfill M1: if Firebase has fewer questions than seed, use seed questions
          // This prevents data loss when Firebase has a stale/partial snapshot.
          // IMPORTANT: Only backfill questions/personas/clusters from seed — preserve
          // existing module-level data like companyIntel, calibration, personaProfiles.
          let needsResave = false;
          const fbQCount = merged.m1?.questions?.length || 0;
          const seedQCount = seedPipeline?.m1?.questions?.length || 0;
          if (seedQCount > 0 && fbQCount < seedQCount) {
            console.info(`[Pipeline] Firebase M1 has ${fbQCount} questions but seed has ${seedQCount} — restoring seed questions`);
            const preserved = { ...merged.m1 }; // save existing m1 data
            merged.m1 = { ...INITIAL_STATE.m1, ...seedPipeline.m1, ...preserved };
            // Seed questions override preserved questions (that's the point of backfill)
            merged.m1.questions = seedPipeline.m1.questions;
            needsResave = true;
          }

          // Backfill: if Firebase has no M2/M3 scan data, use bundled seed sample data
          for (const mod of ["m2", "m3"]) {
            const hasData = mod === "m2" ? !!merged.m2?.scores : (merged.m3?.prioritizedDomains?.length > 0);
            if (!hasData && seedPipeline?.[mod]) {
              merged[mod] = { ...INITIAL_STATE[mod], ...seedPipeline[mod] };
              console.info(`[Pipeline] Backfilled ${mod} from bundled seed data`);
              needsResave = true;
            }
          }

          diagnosticsRef.current.dataSource = "firebase";
          dispatch({ type: "LOAD", payload: { ...merged, _docId: docId } });

          // If any backfill happened, push corrected data back to Firebase
          if (needsResave) {
            queueMicrotask(() => {
              if (pmRef.current) {
                pmRef.current.enqueueSave();
                console.info("[Pipeline] Saving backfilled data to Firebase");
              }
            });
          }
        } else {
          // No Firebase docs — try localStorage snapshot
          try {
            const snap = localStorage.getItem("xt_pipeline_snapshot");
            if (snap) {
              const parsed = JSON.parse(snap);
              diagnosticsRef.current.dataSource = "localStorage";
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
            diagnosticsRef.current.dataSource = "seed";
            dispatch({ type: "LOAD", payload: seed });
            console.info("[Pipeline] Loaded bundled seed data (" + seedPipeline.m1.questions.length + " questions)");
            return;
          }
          diagnosticsRef.current.dataSource = "empty";
          dispatch({ type: "SET_LOADED" });
        }
      } catch (e) {
        console.error("Pipeline load failed:", e);
        diagnosticsRef.current.firebase.loadError = e.message;
        // Fallback: localStorage only
        try {
          const snap = localStorage.getItem("xt_pipeline_snapshot");
          if (snap) {
            const parsed = JSON.parse(snap);
            diagnosticsRef.current.dataSource = "localStorage";
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
          diagnosticsRef.current.dataSource = "seed";
          dispatch({ type: "LOAD", payload: seed });
          console.info("[Pipeline] Loaded bundled seed data as error fallback");
          return;
        }
        diagnosticsRef.current.dataSource = "empty";
        dispatch({ type: "SET_LOADED" });
      }

      // ── Boot diagnostic output ──
      const diag = diagnosticsRef.current;
      const apiKeys = ["xt_anthropic_key", "xt_gemini_key", "xt_openai_key", "xt_perplexity_key", "xt_grok_key"];
      diag.apiKeysPresent = apiKeys.filter(k => { try { return !!localStorage.getItem(k); } catch { return false; } });
      console.info("[Diagnostics] Boot complete:", JSON.stringify(diag, null, 2));

      // Invariant: if Firebase is disabled in production, emit a clear error
      if (!FIREBASE_ENABLED && import.meta.env.PROD) {
        console.error("[INVARIANT] Firebase is DISABLED in production. Data only persists in this browser. Set VITE_FIREBASE_PROJECT_ID to enable durable storage.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Update module data — single entry point for all modules ──
  // Eagerly update stateRef so persistence reads the latest data immediately.
  // React 18 batching means re-renders are async — stateRef.current = state (line 81)
  // may not fire before queueMicrotask, so we compute the next state eagerly here.
  const updateModule = useCallback((moduleId, data) => {
    dispatch({ type: "UPDATE_MODULE", moduleId, data });
    // Eagerly update ref so persistence manager sees the new data
    stateRef.current = {
      ...stateRef.current,
      [moduleId]: { ...stateRef.current[moduleId], ...data },
    };
    queueMicrotask(() => {
      if (pmRef.current) pmRef.current.enqueueSave();
    });
  }, []);

  const updateMeta = useCallback((data) => {
    dispatch({ type: "UPDATE_META", data });
    stateRef.current = {
      ...stateRef.current,
      meta: { ...stateRef.current.meta, ...data },
    };
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
      intel: { hasData: !!s.intel?.companyName, count: s.intel?.questions?.length || 0, at: s.intel?.researchedAt },
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

  // Expose boot diagnostics for Settings panel (re-checks live state on each call)
  const getDiagnostics = useCallback(() => {
    const diag = { ...diagnosticsRef.current };
    diag.pipelineDocId = stateRef.current._docId || "(none)";
    diag.questionCount = stateRef.current.m1?.questions?.length || 0;
    diag.firebaseDisabled = !FIREBASE_ENABLED;
    // ── API key source breakdown: 3 separate tiers ──
    // Canonical: Firebase (durable, cross-browser)
    // Runtime: localStorage (browser-local, survives refresh but not cache clear)
    // Fallback: import.meta.env VITE_* (baked into JS bundle at build time — dev only)
    const ALL_KEYS = ["xt_anthropic_key", "xt_gemini_key", "xt_openai_key", "xt_perplexity_key", "xt_grok_key"];
    const ENV_MAP = {
      xt_anthropic_key: "VITE_ANTHROPIC_API_KEY",
      xt_gemini_key: "VITE_GEMINI_API_KEY",
      xt_openai_key: "VITE_OPENAI_API_KEY",
      xt_perplexity_key: "VITE_PERPLEXITY_API_KEY",
      xt_grok_key: "VITE_GROK_API_KEY",
    };
    try {
      diag.apiKeys = {
        localStorage: ALL_KEYS.filter(k => !!localStorage.getItem(k)),
        firebase: diag.firebaseKeyNames || [],
        firebaseDocExists: diag.firebaseKeyDocExists ?? null, // null = still loading
        envFallback: ALL_KEYS.filter(k => !!import.meta.env[ENV_MAP[k]]),
        envBundled: import.meta.env.PROD, // true = keys baked into production bundle
      };
    } catch {
      diag.apiKeys = { localStorage: [], firebase: [], firebaseDocExists: null, envFallback: [], envBundled: false };
    }
    // Legacy compat: keep flat count for anything reading old shape
    diag.apiKeysPresent = ALL_KEYS.filter(k => {
      try { return !!localStorage.getItem(k) || !!import.meta.env[ENV_MAP[k]]; } catch { return false; }
    });
    return diag;
  }, []);

  // Save API keys to both localStorage (immediate) and Firebase (durable canonical).
  // After Firebase save, refresh the diagnostics cache so the panel shows updated sources.
  const persistApiKeys = useCallback(async (keys) => {
    const result = await saveApiKeys(keys);
    if (result) {
      diagnosticsRef.current.firebaseKeyNames = Object.keys(keys).filter(k => !!keys[k]);
      diagnosticsRef.current.firebaseKeyDocExists = true;
    }
    return result;
  }, []);

  const value = useMemo(() => ({
    pipeline: state, updateModule, updateMeta, getStatus, getStaleness, getSaveStatus, getDiagnostics, persistApiKeys
  }), [state, updateModule, updateMeta, getStatus, getStaleness, getSaveStatus, getDiagnostics, persistApiKeys]);

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

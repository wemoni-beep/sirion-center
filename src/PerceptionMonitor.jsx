import { FONT } from "./typography";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell, Legend, LineChart, Line,
  PieChart, Pie
} from "recharts";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { runScan, testConnections, getAvailableLLMs, buildExportPayload, computeScores } from "./scanEngine";
import { db } from "./firebase";

/* ───────────────────────────────────────────────
   DESIGN TOKENS
   ─────────────────────────────────────────────── */
const T_DARK = {
  bg: "#060A0E", surface: "#0C1318", sidebar: "#0A0F14", card: "#111921",
  border: "rgba(45,212,191,0.08)", text: "#E8ECF1",
  muted: "rgba(255,255,255,0.60)", dim: "rgba(255,255,255,0.32)",
  blue: "#38BDF8", gold: "#FBBF24", green: "#2DD4BF", red: "#F87171",
  purple: "#A78BFA", orange: "#FB923C", cyan: "#22D3EE", pink: "#F472B6",
  teal: "#14B8A6", lime: "#A3E635",
  fontH: FONT.heading, fontB: FONT.body, fontM: FONT.mono,
};
const T_LIGHT = {
  ...T_DARK,
  bg: "#f7f7f8", surface: "#ededf0", sidebar: "#ffffff", card: "#ffffff",
  border: "rgba(45,212,191,0.15)", text: "#111118",
  muted: "rgba(0,0,0,0.55)", dim: "rgba(0,0,0,0.30)",
};
let T = { ...T_DARK };

const ABBR_MAP = {
  ACC: "Accuracy", CMP: "Completeness", POS: "Positioning",
  PSO: "Perception Score Overall", CTR: "Citation Rate", MNT: "Mention Rate",
};

const LLM_META = {
  claude: { name: "Claude", color: T_DARK.purple },
  openai: { name: "ChatGPT", color: T_DARK.green },
  gemini: { name: "Gemini", color: T_DARK.blue },
  perplexity: { name: "Perplexity", color: T_DARK.cyan },
};

const VENDOR_COLORS = {
  Sirion: T_DARK.teal, Icertis: "#e06b50", Ironclad: T_DARK.gold,
  Agiloft: T_DARK.green, ContractPodAi: T_DARK.purple, Conga: T_DARK.orange,
  "DocuSign CLM": "#4ade80", Juro: T_DARK.pink, SpotDraft: T_DARK.lime,
  Coupa: T_DARK.orange, Nobody: T_DARK.dim,
};
const SOURCE_TYPE_COLORS = {
  analyst: T_DARK.purple, review: T_DARK.gold, vendor: T_DARK.blue,
  news: T_DARK.green, community: T_DARK.orange, academic: T_DARK.cyan, other: T_DARK.dim,
};
const SECTION_TABS = ["vendors", "sources", "responses", "action"];

/* ───────────────────────────────────────────────
   DEFAULT QUERY BANK
   ─────────────────────────────────────────────── */
const DEFAULT_QUERIES = [
  { id: "cpo-aw-1", persona: "CPO", stage: "Awareness", query: "How do I get visibility into what we're actually paying versus what our contracts say?", cw: "Nobody", lifecycle: "post-signature" },
  { id: "cpo-dis-1", persona: "CPO", stage: "Discovery", query: "Best CLM platforms for procurement teams that need supplier performance tracking", cw: "Sirion, Icertis", lifecycle: "post-signature" },
  { id: "cpo-con-1", persona: "CPO", stage: "Consideration", query: "Sirion vs Icertis for post-signature contract management and supplier governance", cw: "Split", lifecycle: "post-signature" },
  { id: "gc-aw-1", persona: "GC", stage: "Awareness", query: "How can AI help my legal team do more with fewer resources in contract review?", cw: "Ironclad", lifecycle: "pre-signature" },
  { id: "gc-dis-1", persona: "GC", stage: "Discovery", query: "AI contract review tools that work with our existing playbooks", cw: "Sirion, Ironclad", lifecycle: "pre-signature" },
  { id: "gc-con-1", persona: "GC", stage: "Consideration", query: "Can Sirion handle third-party paper redlining against our playbook automatically?", cw: "Sirion", lifecycle: "pre-signature" },
  { id: "cfo-aw-1", persona: "CFO", stage: "Awareness", query: "How much money are we losing from poor contract management?", cw: "Ironclad", lifecycle: "full-stack" },
  { id: "cfo-dis-1", persona: "CFO", stage: "Discovery", query: "Contract management platform that proves ROI to the board in 6 months", cw: "Icertis", lifecycle: "full-stack" },
  { id: "vp-dis-1", persona: "VP Legal Ops", stage: "Discovery", query: "CLM platforms with fastest implementation time for enterprise", cw: "Juro, Ironclad", lifecycle: "full-stack" },
  { id: "vp-dis-2", persona: "VP Legal Ops", stage: "Discovery", query: "Contract management AI that legal and procurement teams can actually both use", cw: "Sirion, Icertis", lifecycle: "full-stack" },
  { id: "pd-dis-1", persona: "Proc Dir", stage: "Discovery", query: "Contract management software that tracks SLA compliance and supplier performance automatically", cw: "Sirion", lifecycle: "post-signature" },
  { id: "ceo-aw-2", persona: "CEO", stage: "Awareness", query: "What is agentic AI for contracts and should my team be investing in it?", cw: "Icertis, Sirion", lifecycle: "full-stack" },
];

const CLM_STAGES = [
  { id: "pre-signature", label: "Pre-Signature", color: "#3b82f6" },
  { id: "post-signature", label: "Post-Signature", color: "#10b981" },
  { id: "full-stack", label: "Full-Stack CLM", color: "#a78bfa" },
];

/* ───────────────────────────────────────────────
   QUESTION IMPORT HELPERS
   ─────────────────────────────────────────────── */
function parseImportedQuestions(text) {
  if (!text || !text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((q, i) => ({
        id: q.id || `imp-${i + 1}`, persona: q.persona || "General",
        stage: q.stage || q.journeyStage || q.journey_stage || "Discovery",
        query: q.query || q.question || q.text || "",
        cw: q.cw || q.currentWinner || q.topicCluster || "Unknown",
      })).filter(q => q.query.trim());
    }
  } catch {}
  const lines = text.split("\n").filter(l => l.trim());
  const tableLines = lines.filter(l => l.includes("|") && !l.match(/^[\s|:-]+$/));
  if (tableLines.length > 2) {
    const header = tableLines[0].split("|").map(c => c.trim().toLowerCase()).filter(Boolean);
    const qIdx = header.findIndex(h => h.includes("question") || h.includes("query"));
    const pIdx = header.findIndex(h => h.includes("persona"));
    const sIdx = header.findIndex(h => h.includes("stage") || h.includes("journey"));
    if (qIdx >= 0) {
      return tableLines.slice(1).map((row, i) => {
        const cells = row.split("|").map(c => c.trim()).filter(Boolean);
        return { id: `imp-${i + 1}`, persona: (pIdx >= 0 ? cells[pIdx] : "General") || "General",
          stage: (sIdx >= 0 ? cells[sIdx] : "Discovery") || "Discovery", query: cells[qIdx] || "", cw: "Unknown" };
      }).filter(q => q.query.trim() && q.query.length > 10);
    }
  }
  const questions = [];
  for (const line of lines) {
    const match = line.match(/^\s*\d+[\.\)]\s*(.+)/);
    if (match && match[1].trim().length > 10) {
      questions.push({ id: `imp-${questions.length + 1}`, persona: "General", stage: "Discovery",
        query: match[1].trim().replace(/^\*+|\*+$/g, "").trim(), cw: "Unknown" });
    }
  }
  if (questions.length >= 3) return questions;
  return lines.filter(l => l.trim().length > 15).map((l, i) => ({
    id: `imp-${i + 1}`, persona: "General", stage: "Discovery",
    query: l.trim().replace(/^\d+[\.\)]\s*/, "").replace(/^\*+|\*+$/g, "").trim(), cw: "Unknown",
  }));
}

/* ───────────────────────────────────────────────
   FIREBASE SIZE HELPERS — Strip large fields before saving
   ─────────────────────────────────────────────── */

// Strip full_response from all analyses (saves ~70% size for Firestore 1MB limit)
function stripForFirebase(result) {
  if (!result?.analyses) return result;
  const stripped = { ...result, analyses: {} };
  for (const [llm, analysis] of Object.entries(result.analyses)) {
    const { full_response, ...rest } = analysis;
    // Keep snippet at 200 chars for display
    if (rest.response_snippet && rest.response_snippet.length > 200) {
      rest.response_snippet = rest.response_snippet.substring(0, 200);
    }
    stripped.analyses[llm] = rest;
  }
  return stripped;
}

// Estimate serialized size of an object
function estimateDocSize(obj) {
  try { return new Blob([JSON.stringify(obj)]).size; } catch { return 0; }
}

/* ───────────────────────────────────────────────
   UI COMPONENTS
   ─────────────────────────────────────────────── */
function Chip({ text, color = T.teal }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + "14", color, border: "1px solid " + color + "25" }}>{text}</span>;
}
function BadgeEl({ text, color }) {
  return <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: color, color: "#000", fontFamily: T.fontM }}>{text}</span>;
}
function Ring({ score, size = 64, color = T.teal, label }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOffset(c - (score / 100) * c), 150); return () => clearTimeout(t); }, [score, c]);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }} />
        <text x={size / 2} y={size / 2 + 1} textAnchor="middle" fill={T.text} fontSize={size > 50 ? "14" : "11"} fontWeight="800" fontFamily={T.fontH}>{score}</text>
      </svg>
      {label && <div title={ABBR_MAP[label] || label} style={{ fontSize: 11, color: T.dim, marginTop: 1, fontFamily: T.fontM, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "help", borderBottom: "1px dotted " + T.dim }}>{label}</div>}
    </div>
  );
}
function PBar({ value, max = 100, color, h = 4 }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 50); return () => clearTimeout(t); }, [value]);
  return <div style={{ width: "100%", height: h, background: "rgba(255,255,255,0.03)", borderRadius: h, overflow: "hidden" }}><div style={{ width: (w / max) * 100 + "%", height: "100%", background: color, borderRadius: h, transition: "width 0.9s cubic-bezier(.22,1,.36,1)" }} /></div>;
}
function Card({ children, style, glow }) {
  return (
    <div style={{ background: T.card, borderRadius: 12, border: "1px solid " + T.border, padding: "16px 18px", position: "relative", overflow: "hidden", marginBottom: 12, ...style }}>
      {glow && <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: glow, filter: "blur(90px)", opacity: 0.04, top: -60, right: -40, pointerEvents: "none" }} />}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
function Label({ children }) {
  return <div style={{ fontSize: 11, color: T.dim, letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase", marginBottom: 8, fontFamily: T.fontH }}>{children}</div>;
}
function Btn({ children, onClick, primary, disabled, style: s }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: primary ? "9px 22px" : "7px 14px", borderRadius: 8, border: primary ? "none" : "1px solid " + T.border, cursor: disabled ? "not-allowed" : "pointer", background: primary ? "linear-gradient(135deg," + T.teal + "," + T.blue + ")" : T.surface, color: primary ? "#000" : T.muted, fontWeight: primary ? 700 : 500, fontSize: primary ? 12 : 10, fontFamily: primary ? T.fontH : T.fontB, opacity: disabled ? 0.5 : 1, ...s }}>{children}</button>;
}
function EmptyState({ icon, title, description, action }) {
  return (
    <Card glow={T.teal} style={{ textAlign: "center", padding: "56px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.fontH, marginBottom: 10, color: T.text }}>{title}</div>
      <div style={{ color: T.muted, fontSize: 12, maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>{description}</div>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </Card>
  );
}

function DeltaBadge({ val, suffix = "" }) {
  if (val === null || val === undefined || val === 0) return null;
  const positive = val > 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.fontM, color: positive ? T.green : T.red }}>
      {positive ? "\u25B2" : "\u25BC"}{Math.abs(val)}{suffix}
    </span>
  );
}

const stageColor = (s) => s === "Awareness" ? T.gold : s === "Discovery" ? T.blue : T.green;
const diffColor = (v) => v <= 3 ? T.green : v <= 6 ? T.gold : T.red;
const diffLabel = (v) => v <= 3 ? "EASY" : v <= 6 ? "MOD" : v <= 8 ? "HARD" : "V.HARD";
const TIP_STYLE = () => ({ background: T.card, border: "1px solid " + T.border, borderRadius: 8, fontSize: 11, fontFamily: T.fontB, color: T.text, padding: "6px 10px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" });

/* ───────────────────────────────────────────────
   MAIN COMPONENT
   ─────────────────────────────────────────────── */
export default function App() {
  const _globalTheme = useTheme();
  T = _globalTheme.mode === "light" ? { ...T_LIGHT } : { ...T_DARK };
  const { pipeline, updateModule } = usePipeline();

  const [nav, setNav] = useState("overview");
  const [collapsed, setColl] = useState(false);
  const [selResult, setSelResult] = useState(null);
  const [fPersona, setFP] = useState("All");
  const [fStage, setFS] = useState("All");
  const [fLifecycle, setFL] = useState("All");

  // Query bank
  const [queries, setQueries] = useState(DEFAULT_QUERIES);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [pipelineM1Loaded, setPipelineM1Loaded] = useState(false);
  const [queriesLoaded, setQueriesLoaded] = useState(false); // tracks if Firebase load completed

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanData, setScanData] = useState(null); // latest scan result
  const [scanHistory, setScanHistory] = useState([]);
  const [scanError, setScanError] = useState("");
  const [exportCopied, setExportCopied] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState({});
  const [expandedSection, setExpandedSection] = useState({}); // keyed by qid, value = "vendors"|"sources"|"responses"|"action"

  // Per-question rescan
  const [rescanning, setRescanning] = useState(null); // qid currently rescanning

  // LLM connections
  const [connections, setConnections] = useState({});
  const [testing, setTesting] = useState(false);

  // Save status visibility
  const [saveWarnings, setSaveWarnings] = useState([]); // [{msg, ts}]
  const [resumableScan, setResumableScan] = useState(null); // {meta, completedQids}

  // Abort controller for scan cancellation
  const abortRef = useRef(null);

  // ── Single combined hydration: load scan history + decide question bank source ──
  // M1 pipeline questions ALWAYS win over saved bank (they are the source of truth).
  // This single effect eliminates the race between async Firebase load and pipeline read.
  useEffect(() => {
    (async () => {
      // ═══ STEP 1: Load scan data (metadata + full scans + individual results) ═══
      let allScans = [];
      try {
        // 1a. Load scan metadata (lightweight, always saved)
        const fbMeta = await db.getAllPaginated("m2_scan_meta");

        // 1b. Load full scan docs (legacy format + new stripped format)
        const fbScans = await db.getAllPaginated("m2_scans");
        const scanById = {};
        fbScans.forEach(s => { if (s.id) scanById[s.id] = s; });

        // 1c. Load individual scan results (for reconstruction if full doc is missing)
        let fbResults = [];
        try { fbResults = await db.getAllPaginated("m2_scan_results"); } catch {}
        const resultsByScan = {};
        fbResults.forEach(r => {
          const sid = r.scanId || (r._id ? r._id.split("__")[0] : null);
          if (sid) { (resultsByScan[sid] = resultsByScan[sid] || []).push(r); }
        });

        // 1d. Reconstruct complete scans from best available source
        const metaById = {};
        fbMeta.forEach(m => { if (m.id) metaById[m.id] = m; });

        // Merge all known scan IDs
        const allScanIds = new Set([...Object.keys(scanById), ...Object.keys(metaById)]);

        for (const sid of allScanIds) {
          const fullDoc = scanById[sid];
          const meta = metaById[sid];
          const indResults = resultsByScan[sid] || [];

          // Prefer full doc if it has results
          if (fullDoc && fullDoc.results && fullDoc.results.length > 0) {
            allScans.push(fullDoc);
          } else if (indResults.length > 0) {
            // Reconstruct from metadata + individual results
            const reconstructed = {
              id: sid,
              date: meta?.date || indResults[0]?.date || "",
              llms: meta?.llms || ["claude", "gemini", "openai"],
              company: meta?.company || "Sirion",
              results: indResults,
              scores: meta?.scores || computeScores(indResults, meta?.llms || ["claude", "gemini", "openai"]),
              errors: meta?.errors || [],
              cost: meta?.cost || {},
              duration: meta?.duration || 0,
              _reconstructed: true,
            };
            allScans.push(reconstructed);
          } else if (meta && meta.status === "complete") {
            // Metadata exists but no results found — keep as placeholder
            allScans.push({ ...meta, results: [] });
          }
        }

        // 1e. Check for paused/running scans (resume offer)
        const pausedOrRunning = fbMeta.find(m => m.status === "paused" || m.status === "running");
        if (pausedOrRunning) {
          const completedResults = resultsByScan[pausedOrRunning.id] || [];
          const completedQids = new Set(completedResults.map(r => r.qid));
          setResumableScan({
            meta: pausedOrRunning,
            completedQids,
            completedCount: completedQids.size,
            totalQueries: pausedOrRunning.totalQueries || 0,
          });
        }

      } catch (e) { console.warn("M2 scan hydration error:", e.message); }

      // Set scan history and active scan
      if (allScans.length > 0) {
        const sorted = allScans.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 20);
        setScanHistory(sorted);
        // Prefer the scan with the most results as default view
        const best = sorted.reduce((a, b) => ((b.results?.length || 0) > (a.results?.length || 0) ? b : a), sorted[0]);
        if (!scanData) setScanData(best);
      }

      // ═══ STEP 2: Decide question bank ═══
      const m1Qs = pipeline.m1.questions;
      if (m1Qs && m1Qs.length > 0) {
        setQueries(m1Qs);
        setImportStatus({ type: "success", msg: `Pipeline: Loaded ${m1Qs.length} questions from M1.` });
        setPipelineM1Loaded(true);
      } else {
        try {
          const fbConfig = await db.getAllPaginated("m2_config");
          const qbDoc = fbConfig.find(d => d._id === "question_bank" || d.id === "question_bank");
          if (qbDoc?.queries && Array.isArray(qbDoc.queries) && qbDoc.queries.length > 0) {
            setQueries(qbDoc.queries);
            setImportStatus({ type: "success", msg: `Loaded ${qbDoc.queries.length} questions from saved bank.` });
          }
        } catch (e) { console.warn("M2 question bank load skipped:", e.message); }
      }
      setQueriesLoaded(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time sync: refresh scan state when user returns to tab ──
  // Prevents stale UI after refresh/tab-switch/leaving window
  useEffect(() => {
    const refreshScanState = async () => {
      if (scanning) return; // Don't interfere with an active scan
      try {
        const fbMeta = await db.getAllPaginated("m2_scan_meta");
        const pausedOrRunning = fbMeta.find(m => m.status === "paused" || m.status === "running");
        if (pausedOrRunning) {
          let fbResults = [];
          try { fbResults = await db.getAllPaginated("m2_scan_results"); } catch {}
          // Count ALL completed results across ALL scan IDs (not just this scan)
          // This handles the case where resume created a new scanId before the fix
          const allCompletedQids = new Set(fbResults.map(r => r.qid).filter(Boolean));
          setResumableScan({
            meta: pausedOrRunning,
            completedQids: allCompletedQids,
            completedCount: allCompletedQids.size,
            totalQueries: queries.length || pausedOrRunning.totalQueries || 138,
          });
        } else {
          setResumableScan(null);
        }
      } catch (e) { console.warn("Scan state refresh failed:", e.message); }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshScanState();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    // Also poll every 30s while page is visible
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && !scanning) refreshScanState();
    }, 30000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [scanning]);

  // Save question bank to Firebase whenever queries change (after initial load)
  useEffect(() => {
    if (!queriesLoaded) return;
    if (queries === DEFAULT_QUERIES) {
      db.saveWithId("m2_config", "question_bank", { queries: [], _cleared: true }).catch(() => {});
      return;
    }
    db.saveWithId("m2_config", "question_bank", { queries, savedAt: new Date().toISOString() }).catch(() => {});
  }, [queries, queriesLoaded]);

  // Watch for LIVE M1 exports (user exports new questions while already on M2)
  const m1GenRef = useRef(pipeline.m1.generatedAt || null);
  useEffect(() => {
    const gen = pipeline.m1.generatedAt || null;
    const m1Qs = pipeline.m1.questions;
    // Skip if this is the initial value we already handled above
    if (gen === m1GenRef.current) return;
    // New export arrived
    if (gen && m1Qs && m1Qs.length > 0) {
      m1GenRef.current = gen;
      setQueries(m1Qs);
      setPipelineM1Loaded(true);
      setImportStatus({ type: "success", msg: `Pipeline: Loaded ${m1Qs.length} questions from M1.` });
    }
  }, [pipeline.m1.questions, pipeline.m1.generatedAt]);

  const allLLMs = getAvailableLLMs();
  const personas = useMemo(() => [...new Set(queries.map(q => q.persona))], [queries]);
  const sc = scanData?.scores || { overall: 0, mention: 0, position: 0, sentiment: 0, accuracy: 0, completeness: 0, positioning: 0 };

  const filtered = useMemo(() => {
    if (!scanData) return [];
    return scanData.results.filter(r =>
      (fPersona === "All" || r.persona === fPersona) &&
      (fStage === "All" || r.stage === fStage) &&
      (fLifecycle === "All" || (r.lifecycle || "full-stack") === fLifecycle)
    );
  }, [scanData, fPersona, fStage, fLifecycle]);

  const compMentions = useMemo(() => {
    if (!scanData) return [];
    const c = {};
    scanData.results.forEach(r => {
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (!a || a._error) return;
        (a.vendors_mentioned || []).forEach(v => {
          if (!c[v.name]) c[v.name] = { name: v.name, m: 0, t3: 0, pos: 0 };
          c[v.name].m++;
          if (v.position <= 3) c[v.name].t3++;
          if (v.sentiment === "positive") c[v.name].pos++;
        });
      });
    });
    return Object.values(c).sort((a, b) => b.m - a.m);
  }, [scanData]);

  const stageBk = useMemo(() => {
    if (!scanData) return [];
    return ["Awareness", "Discovery", "Consideration"].map(st => {
      const sr = scanData.results.filter(r => r.stage === st);
      let m = 0, total = 0;
      sr.forEach(r => {
        (scanData.llms || []).forEach(lid => {
          const a = r.analyses[lid];
          if (a && !a._error) { total++; if (a.mentioned) m++; }
        });
      });
      return { stage: st, rate: total ? Math.round((m / total) * 100) : 0, total: sr.length };
    });
  }, [scanData]);

  const clmStageBk = useMemo(() => {
    if (!scanData) return [];
    return CLM_STAGES.map(cs => {
      const sr = scanData.results.filter(r => (r.lifecycle || "full-stack") === cs.id);
      let m = 0, total = 0;
      sr.forEach(r => {
        (scanData.llms || []).forEach(lid => {
          const a = r.analyses[lid];
          if (a && !a._error) { total++; if (a.mentioned) m++; }
        });
      });
      return { ...cs, rate: total ? Math.round((m / total) * 100) : 0, count: sr.length };
    });
  }, [scanData]);

  const diffDist = useMemo(() => {
    if (!scanData) return { easy: 0, mod: 0, hard: 0 };
    let easy = 0, mod = 0, hard = 0;
    scanData.results.forEach(r => {
      const c2 = r.difficulty?.composite || 5;
      if (c2 <= 3) easy++; else if (c2 <= 6) mod++; else hard++;
    });
    return { easy, mod, hard };
  }, [scanData]);

  const avgRank = useMemo(() => {
    if (!scanData) return null;
    let sum = 0, count = 0;
    scanData.results.forEach(r => {
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (a && !a._error && a.rank) { sum += a.rank; count++; }
      });
    });
    return count > 0 ? +(sum / count).toFixed(1) : null;
  }, [scanData]);

  const compFeatures = useMemo(() => {
    if (!scanData) return {};
    const fm = {};
    scanData.results.forEach(r => {
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (!a || a._error) return;
        (a.vendors_mentioned || []).forEach(v => {
          if (!fm[v.name]) fm[v.name] = {};
          (v.features || []).forEach(f => {
            const k = f.toLowerCase().trim();
            if (k) fm[v.name][k] = (fm[v.name][k] || 0) + 1;
          });
        });
      });
    });
    return fm;
  }, [scanData]);

  // Previous scan for delta comparison
  const prevScan = useMemo(() => {
    if (!scanData || scanHistory.length < 2) return null;
    const sorted = scanHistory.filter(s => s.id !== scanData.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return sorted[0] || null;
  }, [scanData, scanHistory]);

  // Delta scores (current vs previous scan)
  const deltaScores = useMemo(() => {
    if (!scanData?.scores || !prevScan?.scores) return null;
    const d = {};
    for (const k of Object.keys(scanData.scores)) {
      d[k] = scanData.scores[k] - (prevScan.scores[k] || 0);
    }
    return d;
  }, [scanData, prevScan]);

  // Share of Voice
  const shareOfVoice = useMemo(() => {
    if (!scanData) return 0;
    return scanData.scores?.shareOfVoice || 0;
  }, [scanData]);

  // Citation sources aggregated across all queries
  const citationSources = useMemo(() => {
    if (!scanData) return [];
    const domainMap = {};
    scanData.results.forEach(r => {
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (!a || a._error) return;
        (a.cited_sources || []).forEach(src => {
          const d = src.domain?.toLowerCase().replace(/^www\./, "");
          if (!d) return;
          if (!domainMap[d]) domainMap[d] = { domain: d, type: src.type || "other", count: 0, contexts: [], llms: new Set() };
          domainMap[d].count++;
          domainMap[d].llms.add(lid);
          if (src.context && domainMap[d].contexts.length < 3) domainMap[d].contexts.push(src.context);
        });
      });
    });
    return Object.values(domainMap)
      .map(d => ({ ...d, llms: [...d.llms] }))
      .sort((a, b) => b.count - a.count);
  }, [scanData]);

  const bestAnalysis = (r) => r.analyses.claude || r.analyses.gemini || r.analyses.openai || r.analyses.perplexity || null;

  // Consolidated vendor table for a single result across all LLMs
  const buildVendorTable = useCallback((r) => {
    const llms = scanData?.llms || [];
    const vendorMap = {};
    llms.forEach(lid => {
      const a = r.analyses[lid];
      if (!a || a._error) return;
      (a.vendors_mentioned || []).forEach(v => {
        const key = v.name.toLowerCase().replace(/\s+/g, "");
        if (!vendorMap[key]) vendorMap[key] = { name: v.name, positions: {}, features: new Set(), isSirion: /sirion/i.test(v.name) };
        vendorMap[key].positions[lid] = v.position || null;
        (v.features || []).forEach(f => vendorMap[key].features.add(f));
      });
    });
    return Object.values(vendorMap)
      .map(v => ({ ...v, features: [...v.features], avgPos: Object.values(v.positions).filter(Boolean).reduce((s, p) => s + p, 0) / (Object.values(v.positions).filter(Boolean).length || 1) }))
      .sort((a, b) => a.avgPos - b.avgPos);
  }, [scanData]);

  // Source attribution for a single result across all LLMs
  const buildSourceAttribution = useCallback((r) => {
    const llms = scanData?.llms || [];
    const domainMap = {};
    let hasSirionSource = false;
    llms.forEach(lid => {
      const a = r.analyses[lid];
      if (!a || a._error) return;
      (a.cited_sources || []).forEach(src => {
        const d = src.domain?.toLowerCase().replace(/^www\./, "");
        if (!d) return;
        if (/sirion/i.test(d)) hasSirionSource = true;
        if (!domainMap[d]) domainMap[d] = { domain: d, type: src.type || "other", llms: new Set(), contexts: [], isSirion: /sirion/i.test(d) };
        domainMap[d].llms.add(lid);
        if (src.context && domainMap[d].contexts.length < 2) domainMap[d].contexts.push(src.context);
      });
    });
    const sources = Object.values(domainMap).map(d => ({ ...d, llms: [...d.llms] })).sort((a, b) => b.llms.length - a.llms.length);
    // Pie chart data: group by type
    const typeCount = {};
    sources.forEach(s => { typeCount[s.type] = (typeCount[s.type] || 0) + 1; });
    const pieData = Object.entries(typeCount).map(([t, c]) => ({ name: t, value: c, fill: SOURCE_TYPE_COLORS[t] || T.dim }));
    return { sources, pieData, hasSirionSource, totalSources: sources.length };
  }, [scanData]);

  // Aggregate sentiment across LLMs for a result
  const aggregateSentiment = (r) => {
    const llms = scanData?.llms || [];
    const sents = llms.map(lid => r.analyses[lid]?.sentiment).filter(Boolean);
    if (sents.includes("negative")) return "negative";
    if (sents.includes("positive")) return "positive";
    if (sents.includes("neutral")) return "neutral";
    return "absent";
  };

  const sentimentColor = (s) => s === "positive" ? T.green : s === "negative" ? T.red : s === "neutral" ? T.gold : T.dim;

  // Test connections
  const handleTestConnections = async () => {
    setTesting(true);
    try {
      const res = await testConnections();
      setConnections(res);
    } catch (e) {
      console.error("Connection test failed:", e);
    }
    setTesting(false);
  };

  // Run scan — with incremental Firebase persistence
  // resumeOptions: { scanId, previouslyCompleted } — when resuming an existing scan
  const handleRunScan = async (subset, resumeOptions) => {
    if (scanning) return;
    const llms = getAvailableLLMs();
    if (llms.length === 0) { setScanError("No LLM API keys configured. Add keys in .env"); return; }

    const targetQueries = subset || queries;
    const company = pipeline.m1?.company || "Sirion";
    const isResume = !!resumeOptions?.scanId;
    const scanId = isResume ? resumeOptions.scanId : "scan-" + Date.now();
    const prevCompleted = isResume ? (resumeOptions.previouslyCompleted || 0) : 0;
    const scanDate = isResume ? (resumeOptions.scanDate || new Date().toISOString()) : new Date().toISOString();

    setScanning(true);
    setScanError("");
    setSaveWarnings([]);
    setScanProgress({ phase: "starting", percent: 0, status: isResume ? `Resuming scan (${prevCompleted} already done)...` : "Initializing scan..." });
    setNav("scan");

    // 1. Create or update scan metadata doc (status: running)
    const scanMeta = {
      id: scanId, date: scanDate, status: "running",
      llms, company,
      totalQueries: isResume ? (prevCompleted + targetQueries.length) : targetQueries.length,
      completedQueries: prevCompleted,
      queryIds: targetQueries.map(q => q.id),
      scores: {}, errors: [], cost: { apiCalls: 0, estimated: 0 },
    };
    const metaSaved = await db.saveWithId("m2_scan_meta", scanId, scanMeta);
    if (!metaSaved) {
      setScanError("Failed to create scan record in database. Check your connection. Error: " + (db.getLastError() || "unknown"));
      setScanning(false);
      setScanProgress(null);
      return;
    }

    // Create abort controller for this scan
    const abortController = new AbortController();
    abortRef.current = abortController;

    // 2. Incremental save callback — saves each result to Firebase as it completes
    const saveErrors = [];
    const onResultReady = async (resultItem, index, total) => {
      const stripped = stripForFirebase(resultItem);
      stripped.scanId = scanId; // Tag with parent scan ID
      const docId = `${scanId}__${resultItem.qid}`;
      const saved = await db.saveWithId("m2_scan_results", docId, stripped);
      if (!saved) {
        const errMsg = `Q${index + 1} save failed: ${db.getLastError() || "unknown"}`;
        saveErrors.push(errMsg);
        setSaveWarnings(prev => [...prev, { msg: errMsg, ts: Date.now() }]);
      }
      // Update metadata progress — offset by previously completed queries on resume
      const totalCompleted = prevCompleted + index + 1;
      db.saveWithId("m2_scan_meta", scanId, {
        ...scanMeta, completedQueries: totalCompleted, status: "running",
      }).catch(() => {});
    };

    try {
      const result = await runScan(targetQueries, company, llms, (progress) => {
        setScanProgress(progress);
      }, abortController.signal, onResultReady);

      // Override scan ID to match our pre-created metadata
      result.id = scanId;
      result.date = scanDate;

      // If resuming, merge previously completed results with new results
      if (isResume && prevCompleted > 0) {
        try {
          let prevResults = await db.getAllPaginated("m2_scan_results");
          prevResults = prevResults.filter(r => {
            const sid = r.scanId || (r._id ? r._id.split("__")[0] : null);
            return sid === scanId;
          });
          // Merge: old results + new results (dedup by qid)
          const newQids = new Set(result.results.map(r => r.qid));
          const oldOnly = prevResults.filter(r => !newQids.has(r.qid));
          result.results = [...oldOnly, ...result.results];
          result.count = result.results.length;
          // Recompute scores with full result set
          console.log(`Resume merge: ${oldOnly.length} old + ${newQids.size} new = ${result.results.length} total results`);
        } catch (mergeErr) {
          console.warn("Could not merge old results on resume:", mergeErr.message);
        }
      }

      // 3. Save stripped full scan as single doc (for fast hydration)
      const strippedScan = {
        ...result,
        results: result.results.map(r => stripForFirebase(r)),
      };
      const scanSize = estimateDocSize(strippedScan);
      if (scanSize < 900000) {
        // Under 1MB — save as single doc
        const scanSaved = await db.saveWithId("m2_scans", scanId, strippedScan);
        if (!scanSaved) {
          setSaveWarnings(prev => [...prev, { msg: "Full scan doc save failed (individual results are safe): " + (db.getLastError() || ""), ts: Date.now() }]);
        }
      } else {
        // Too large for single doc — individual results already saved above
        console.warn(`Scan doc too large (${Math.round(scanSize / 1024)}KB), relying on individual results`);
        setSaveWarnings(prev => [...prev, { msg: `Scan data split across ${result.results.length} individual records (too large for single doc)`, ts: Date.now() }]);
      }

      // 4. Mark scan complete in metadata
      const completeMeta = {
        ...scanMeta, status: "complete",
        completedQueries: prevCompleted + result.results.length,
        scores: result.scores,
        errors: result.errors,
        cost: result.cost,
        duration: result.duration,
        retries: result.retries,
        partialFailures: result.partialFailures,
      };
      await db.saveWithId("m2_scan_meta", scanId, completeMeta);

      // 5. Auto-build export payload for M3 (no manual export needed)
      const payload = buildExportPayload(result);

      // 6. Update local state + pipeline (with full exportPayload for M3)
      setScanData(result);
      setScanHistory(prev => [result, ...prev].slice(0, 20));
      updateModule("m2", {
        scanResults: result,
        scores: result.scores,
        scannedAt: result.date,
        contentGaps: payload.allContentGaps,
        personaBreakdown: payload.personaBreakdown,
        stageBreakdown: payload.stageBreakdown,
        recommendations: payload.allRecommendations,
        exportPayload: payload,
      });

      // 7. Show save warnings if any
      if (saveErrors.length > 0) {
        setScanError(`Scan complete. ${saveErrors.length} of ${result.results.length} results had save issues (data may be in local cache).`);
      }

      setNav("overview");
    } catch (e) {
      if (e.name === "AbortError") {
        // Mark as paused (resumable)
        db.saveWithId("m2_scan_meta", scanId, { ...scanMeta, status: "paused" }).catch(() => {});
        setScanError("Scan paused. Your completed results are saved. You can resume later.");
      } else {
        db.saveWithId("m2_scan_meta", scanId, { ...scanMeta, status: "failed", error: e.message }).catch(() => {});
        setScanError(e.message);
      }
    }
    abortRef.current = null;
    setScanning(false);
    setScanProgress(null);
  };

  // Cancel running scan
  const handleCancelScan = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  // Rescan a single question against all LLMs
  const handleRescan = async (qid) => {
    if (scanning || rescanning) return;
    if (!scanData) return;

    const llms = getAvailableLLMs();
    if (llms.length === 0) { setScanError("No LLM API keys configured."); return; }

    const orig = scanData.results.find(r => r.qid === qid);
    if (!orig) return;

    const singleQuery = [{
      id: orig.qid, persona: orig.persona, stage: orig.stage,
      query: orig.query, cw: orig.cw || "Unknown",
    }];

    setRescanning(qid);
    setScanError("");

    try {
      const company = pipeline.meta?.company || "Sirion";
      const result = await runScan(singleQuery, company, llms, null, null);
      const newResult = result.results[0];
      if (!newResult) throw new Error("Rescan returned no result");

      // Replace old result, recompute aggregate scores
      const updatedResults = scanData.results.map(r => r.qid === qid ? newResult : r);
      const updatedScores = computeScores(updatedResults, scanData.llms);
      const updatedScanData = {
        ...scanData, results: updatedResults, scores: updatedScores,
        lastRescan: { qid, date: new Date().toISOString() },
      };

      setScanData(updatedScanData);
      setScanHistory(prev => prev.map(s => s.id === scanData.id ? updatedScanData : s));
      updateModule("m2", { scanResults: updatedScanData, scores: updatedScores, scannedAt: updatedScanData.date });

      // Save stripped rescan result + updated scan to Firebase
      const strippedResult = stripForFirebase(newResult);
      strippedResult.scanId = scanData.id;
      await db.saveWithId("m2_scan_results", `${scanData.id}__${qid}`, strippedResult);
      const strippedScan = { ...updatedScanData, results: updatedScanData.results.map(r => stripForFirebase(r)) };
      const scanSize = estimateDocSize(strippedScan);
      if (scanSize < 900000) {
        const saved = await db.saveWithId("m2_scans", scanData.id, strippedScan);
        if (!saved) setSaveWarnings(prev => [...prev, { msg: "Rescan save failed: " + (db.getLastError() || ""), ts: Date.now() }]);
      }
    } catch (e) {
      setScanError("Rescan failed: " + e.message);
    }
    setRescanning(null);
  };

  const NAV_ITEMS = [
    { id: "overview", icon: "\u25C9", label: "Overview" },
    { id: "scan", icon: "\u26A1", label: "Run Scan" },
    { id: "results", icon: "\u25C8", label: "Results" },
    { id: "competitors", icon: "\u2694", label: "Competitors" },
    { id: "gaps", icon: "\u25CE", label: "Content Gaps" },
    { id: "trends", icon: "\u2197", label: "Trends" },
    { id: "settings", icon: "\u2699", label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, fontFamily: T.fontB, color: T.text, overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: rgba(45,212,191,0.08) transparent; }
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-thumb { background: rgba(45,212,191,0.1); border-radius: 3px }
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width: collapsed ? 56 : 220, minWidth: collapsed ? 56 : 220, background: T.sidebar, borderRight: "1px solid " + T.border, display: "flex", flexDirection: "column", transition: "all 0.25s", overflow: "hidden", zIndex: 50 }}>
        <div style={{ padding: collapsed ? "16px 12px" : "20px 18px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "center", gap: 10, minHeight: 64 }}>
          <div style={{ width: 32, height: 32, minWidth: 32, borderRadius: 8, background: "linear-gradient(135deg," + T.teal + "," + T.blue + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{"\uD83D\uDD2D"}</div>
          {!collapsed && <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}><div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.fontH }}>Perception Monitor</div><div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>v2 {"\u00B7"} LIVE</div></div>}
        </div>
        <div style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(n => {
            const isActive = nav === n.id;
            return (
              <button key={n.id} onClick={() => setNav(n.id)} title={collapsed ? n.label : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "10px 0" : "9px 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer", background: isActive ? T.teal + "12" : "transparent", color: isActive ? T.teal : T.muted, fontSize: 12, fontFamily: T.fontB, fontWeight: isActive ? 600 : 400, width: "100%", textAlign: "left", position: "relative" }}>
                {isActive && <div style={{ position: "absolute", left: collapsed ? "50%" : 0, top: collapsed ? 0 : "50%", transform: collapsed ? "translateX(-50%)" : "translateY(-50%)", width: collapsed ? 20 : 3, height: collapsed ? 3 : 20, borderRadius: 2, background: T.teal }} />}
                <span style={{ fontSize: 13, minWidth: 18, textAlign: "center" }}>{n.icon}</span>
                {!collapsed && <span style={{ flex: 1 }}>{n.label}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ borderTop: "1px solid " + T.border, padding: "10px 8px" }}>
          <button onClick={() => setColl(!collapsed)} style={{ width: "100%", padding: "8px 0", borderRadius: 6, border: "none", background: "transparent", color: T.dim, cursor: "pointer", fontSize: 11, fontFamily: T.fontM }}>{collapsed ? "\u00BB" : "\u00AB Collapse"}</button>
          {!collapsed && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{allLLMs.length} LLMs {"\u00B7"} {queries.length} queries{scanData ? ` \u00B7 Score: ${sc.overall}` : ""}</div>}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflow: "auto", background: T.bg, paddingBottom: 40 }}>
        <div style={{ padding: "14px 28px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.surface, position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.fontH }}>{NAV_ITEMS.find(n => n.id === nav)?.icon} {NAV_ITEMS.find(n => n.id === nav)?.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{scanData ? new Date(scanData.date).toLocaleString() : "No scan yet"}</span>
            {allLLMs.map(id => <div key={id} style={{ width: 6, height: 6, borderRadius: "50%", background: LLM_META[id]?.color || T.dim, opacity: 0.8 }} title={LLM_META[id]?.name} />)}
          </div>
        </div>

        <div style={{ padding: "24px 28px", maxWidth: 1100 }}>

          {/* ═══ OVERVIEW ═══ */}
          {nav === "overview" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {!scanData ? (
                <>
                  <EmptyState icon={"\uD83D\uDD2D"} title="No Scan Data Yet" description="Run your first AI perception scan to see how your company is positioned across AI platforms." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Go to Run Scan</Btn>} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                    <Card><Label>QUERY BANK</Label><div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.fontH, color: T.teal }}>{queries.length}</div><div style={{ fontSize: 11, color: T.dim }}>{queries === DEFAULT_QUERIES ? "Default" : "Custom"}</div></Card>
                    <Card><Label>PERSONAS</Label><div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.fontH, color: T.purple }}>{personas.length}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>{personas.slice(0, 5).map(p => <Chip key={p} text={p} color={T.purple} />)}</div></Card>
                    <Card><Label>LLM PLATFORMS</Label><div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.fontH, color: T.blue }}>{allLLMs.length}</div><div style={{ display: "flex", gap: 4, marginTop: 4 }}>{allLLMs.map(id => <Chip key={id} text={LLM_META[id]?.name} color={LLM_META[id]?.color} />)}</div></Card>
                  </div>
                </>
              ) : (
                <>
                  {/* KPI Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
                    <Card glow={T.teal}>
                      <Label>VISIBILITY SCORE</Label>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Ring score={sc.overall} size={64} color={T.teal} />
                        <div>
                          {deltaScores && <DeltaBadge val={deltaScores.overall} suffix="pts" />}
                          <div style={{ fontSize: 10, fontFamily: T.fontM, color: sc.overall >= 60 ? T.green : sc.overall >= 30 ? T.gold : T.red }}>{sc.overall >= 60 ? "STRONG" : sc.overall >= 30 ? "MODERATE" : "WEAK"}</div>
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <Label>SHOWING UP?</Label>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.fontH, color: sc.mention >= 50 ? T.green : sc.mention >= 20 ? T.gold : T.red }}>
                        {sc.mention >= 50 ? "YES" : sc.mention >= 20 ? "PARTIAL" : "NO"}
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{sc.mention}%{deltaScores ? ` (${deltaScores.mention >= 0 ? "+" : ""}${deltaScores.mention})` : ""}</div>
                      <PBar value={sc.mention} color={sc.mention >= 50 ? T.green : sc.mention >= 20 ? T.gold : T.red} />
                    </Card>
                    <Card>
                      <Label>AVG RANK</Label>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.fontH, color: avgRank && avgRank <= 2 ? T.green : avgRank && avgRank <= 4 ? T.gold : T.red }}>
                        {avgRank ? `#${avgRank}` : "N/A"}
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{avgRank ? (avgRank <= 2 ? "Top tier" : avgRank <= 4 ? "Mid tier" : "Low tier") : "Not ranked"}</div>
                      <PBar value={avgRank ? Math.max(0, 100 - (avgRank - 1) * 20) : 0} color={avgRank && avgRank <= 2 ? T.green : avgRank && avgRank <= 4 ? T.gold : T.red} />
                    </Card>
                    <Card>
                      <Label>SHARE OF VOICE</Label>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.fontH, color: shareOfVoice >= 20 ? T.green : shareOfVoice >= 10 ? T.gold : T.red }}>
                        {shareOfVoice}%
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>of all vendor mentions{deltaScores?.shareOfVoice ? ` (${deltaScores.shareOfVoice >= 0 ? "+" : ""}${deltaScores.shareOfVoice})` : ""}</div>
                      <PBar value={shareOfVoice} color={shareOfVoice >= 20 ? T.green : shareOfVoice >= 10 ? T.gold : T.red} />
                    </Card>
                    <Card>
                      <Label>AI TONE</Label>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.fontH, color: sc.sentiment >= 60 ? T.green : sc.sentiment >= 40 ? T.gold : T.red, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sc.sentiment >= 60 ? "Positive" : sc.sentiment >= 40 ? "Neutral" : "Negative"}
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{sc.sentiment}%{deltaScores ? ` (${deltaScores.sentiment >= 0 ? "+" : ""}${deltaScores.sentiment})` : ""}</div>
                      <PBar value={sc.sentiment} color={sc.sentiment >= 60 ? T.green : sc.sentiment >= 40 ? T.gold : T.red} />
                    </Card>
                  </div>
                  {/* Delta comparison banner */}
                  {prevScan && (
                    <div style={{ padding: "8px 14px", borderRadius: 6, background: T.teal + "08", border: "1px solid " + T.teal + "15", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 11, color: T.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Comparing vs previous scan: {new Date(prevScan.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ({prevScan.count} queries)</div>
                      <div style={{ fontSize: 11, fontFamily: T.fontM, color: T.dim, flexShrink: 0, whiteSpace: "nowrap" }}>Score then: {prevScan.scores?.overall || 0}</div>
                    </div>
                  )}
                  {/* Radar + Stage + Difficulty */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <Card>
                      <Label>SIRION AI PRESENCE</Label>
                      <div style={{ marginTop: 4 }}>
                        {(scanData.llms || []).map(lid => {
                          const llmMentions = scanData.results.filter(r => r.analyses[lid]?.mentioned).length;
                          const llmTotal = scanData.results.filter(r => r.analyses[lid] && !r.analyses[lid]._error).length;
                          const pct = llmTotal ? Math.round((llmMentions / llmTotal) * 100) : 0;
                          return (
                            <div key={lid} style={{ marginBottom: 14 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: LLM_META[lid]?.color }} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: LLM_META[lid]?.color }}>{LLM_META[lid]?.name}</span>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.fontH, color: pct >= 50 ? T.green : pct > 0 ? T.gold : T.red }}>{llmMentions}/{llmTotal}</span>
                              </div>
                              <PBar value={pct} color={pct >= 50 ? T.green : pct > 0 ? T.gold : T.red} h={4} />
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                    <Card>
                      <Label>MENTION BY STAGE</Label>
                      {stageBk.map(s => (
                        <div key={s.stage} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><Chip text={s.stage} color={stageColor(s.stage)} /><span style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: stageColor(s.stage) }}>{s.rate}%</span></div>
                          <PBar value={s.rate} color={stageColor(s.stage)} h={5} />
                        </div>
                      ))}
                    </Card>
                    <Card>
                      <Label>MENTION BY CLM STAGE</Label>
                      {clmStageBk.map(s => (
                        <div key={s.id} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <Chip text={s.label} color={s.color} />
                            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: s.color }}>{s.rate}%</span>
                          </div>
                          <PBar value={s.rate} color={s.color} h={5} />
                          <div style={{ fontSize: 9, color: T.dim, marginTop: 2 }}>{s.count} questions</div>
                        </div>
                      ))}
                    </Card>
                    <Card>
                      <Label>AI DIFFICULTY DISTRIBUTION</Label>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {[{ l: "Easy", v: diffDist.easy, c: T.green }, { l: "Moderate", v: diffDist.mod, c: T.gold }, { l: "Hard", v: diffDist.hard, c: T.red }].map(d => (
                          <div key={d.l} style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid " + d.c + "20" }}>
                            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.fontH, color: d.c }}>{d.v}</div>
                            <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM, marginTop: 2 }}>{d.l}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                  {/* Competitor Leaderboard */}
                  <Card>
                    <Label>COMPETITOR AI VISIBILITY LEADERBOARD</Label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
                      {compMentions.slice(0, 10).map((c2, i) => (
                        <div key={c2.name} style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid " + (i === 0 ? T.gold + "35" : T.border) }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: VENDOR_COLORS[c2.name] || T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }} title={c2.name}>{c2.name}</span>
                            <BadgeEl text={"#" + (i + 1)} color={i === 0 ? T.gold : i < 3 ? T.blue : T.dim} />
                          </div>
                          <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c2.m} mentions {"\u00B7"} {c2.t3} top3 {"\u00B7"} {c2.pos} positive</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                  {/* Competitor Frequency Bar Chart */}
                  {compMentions.length > 0 && (
                    <Card style={{ marginTop: 12 }}>
                      <Label>COMPETITOR MENTION FREQUENCY</Label>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 8 }}>How often each vendor is mentioned across all {scanData.results.length} queries and {scanData.llms.length} LLMs</div>
                      <ResponsiveContainer width="100%" height={Math.max(180, compMentions.slice(0, 10).length * 28)}>
                        <BarChart data={compMentions.slice(0, 10)} layout="vertical" margin={{ left: 100, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis type="number" tick={{ fill: T.dim, fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" tick={{ fill: T.muted, fontSize: 11 }} width={95} />
                          <Tooltip contentStyle={TIP_STYLE()} />
                          <Bar dataKey="m" name="Mentions" radius={[0, 3, 3, 0]}>
                            {compMentions.slice(0, 10).map((c2, i) => <Cell key={i} fill={VENDOR_COLORS[c2.name] || T.dim} fillOpacity={c2.name.toLowerCase().includes("sirion") ? 1 : 0.55} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  )}
                  {/* Citation Sources */}
                  {citationSources.length > 0 && (
                    <Card>
                      <Label>CITATION SOURCES</Label>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 10 }}>Sources AI platforms reference when discussing vendors in this space</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                        {citationSources.slice(0, 12).map((src, i) => {
                          const typeColor = { analyst: T.purple, review: T.gold, vendor: T.blue, news: T.green, community: T.orange, academic: T.cyan, other: T.dim }[src.type] || T.dim;
                          return (
                            <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.015)", border: "1px solid " + T.border, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }} title={src.domain}>{src.domain}</span>
                                <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                                  <BadgeEl text={src.type} color={typeColor} />
                                  <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.dim }}>{src.count}x</span>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                {src.llms.map(lid => <div key={lid} style={{ width: 5, height: 5, borderRadius: "50%", background: LLM_META[lid]?.color || T.dim }} title={LLM_META[lid]?.name} />)}
                              </div>
                              {src.contexts[0] && <div style={{ fontSize: 10, color: T.muted, marginTop: 3, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src.contexts[0]}>{src.contexts[0]}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ RUN SCAN ═══ */}
          {nav === "scan" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {/* Scan Progress */}
              {scanning && scanProgress && (
                <Card glow={T.teal} style={{ borderLeft: "3px solid " + T.teal }}>
                  <Label>SCANNING IN PROGRESS</Label>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: T.teal, fontWeight: 600 }}>{scanProgress.status}</span>
                      <span style={{ fontSize: 11, fontFamily: T.fontM, color: T.teal }}>{scanProgress.percent}%</span>
                    </div>
                    <PBar value={scanProgress.percent} color={T.teal} h={6} />
                  </div>
                  {scanProgress.query && (
                    <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                      {scanProgress.llm && <Chip text={LLM_META[scanProgress.llm]?.name || scanProgress.llm} color={LLM_META[scanProgress.llm]?.color || T.dim} />}
                      {" "}{scanProgress.query}...
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <Btn onClick={handleCancelScan} style={{ borderColor: T.red, color: T.red }}>Cancel Scan</Btn>
                  </div>
                </Card>
              )}

              {/* Resume scan banner */}
              {resumableScan && !scanning && (
                <Card style={{ borderLeft: "3px solid " + T.gold }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.gold, marginBottom: 6 }}>Incomplete Scan Detected</div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.6 }}>
                    A previous scan was interrupted. {resumableScan.completedCount} of {resumableScan.totalQueries} queries completed and saved.
                    You can resume to complete the remaining {resumableScan.totalQueries - resumableScan.completedCount} queries.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn primary onClick={async () => {
                      // Guard: re-read Firebase to get ALL completed queries across ALL scans
                      const originalScanId = resumableScan.meta.id;
                      const originalDate = resumableScan.meta.date;
                      try {
                        let fbResults = [];
                        try { fbResults = await db.getAllPaginated("m2_scan_results"); } catch {}
                        // Count ALL completed qids regardless of scan ID
                        const freshQids = new Set(fbResults.map(r => r.qid).filter(Boolean));
                        const remaining = queries.filter(q => !freshQids.has(q.id));
                        if (remaining.length > 0) {
                          // Resume with SAME scanId — new results accumulate under original scan
                          handleRunScan(remaining, {
                            scanId: originalScanId,
                            scanDate: originalDate,
                            previouslyCompleted: freshQids.size,
                          });
                        } else {
                          setScanError("All queries already completed in previous scan.");
                        }
                      } catch (e) {
                        // Fallback to cached state if Firebase read fails
                        const remaining = queries.filter(q => !resumableScan.completedQids.has(q.id));
                        if (remaining.length > 0) {
                          handleRunScan(remaining, {
                            scanId: originalScanId,
                            scanDate: originalDate,
                            previouslyCompleted: resumableScan.completedCount,
                          });
                        }
                      }
                      setResumableScan(null);
                    }}>Resume Scan ({resumableScan.totalQueries - resumableScan.completedCount} remaining)</Btn>
                    <Btn onClick={() => {
                      // Mark as abandoned
                      db.saveWithId("m2_scan_meta", resumableScan.meta.id, { ...resumableScan.meta, status: "abandoned" }).catch(() => {});
                      setResumableScan(null);
                    }}>Dismiss</Btn>
                  </div>
                </Card>
              )}

              {/* Save warnings */}
              {saveWarnings.length > 0 && (
                <Card style={{ borderLeft: "3px solid " + T.orange }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.orange, marginBottom: 4 }}>Save Warnings ({saveWarnings.length})</div>
                  <div style={{ fontSize: 10, color: T.muted, maxHeight: 80, overflowY: "auto" }}>
                    {saveWarnings.slice(-5).map((w, i) => (
                      <div key={i} style={{ marginBottom: 2 }}>{w.msg}</div>
                    ))}
                  </div>
                  <Btn onClick={() => setSaveWarnings([])} style={{ marginTop: 6 }}>Clear</Btn>
                </Card>
              )}

              {scanError && (
                <Card style={{ borderLeft: "3px solid " + T.red }}>
                  <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>{scanError}</div>
                  <Btn onClick={() => setScanError("")} style={{ marginTop: 8 }}>Dismiss</Btn>
                </Card>
              )}

              <Card glow={T.blue}>
                <Label>RUN AI PERCEPTION SCAN</Label>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.7 }}>
                  Fire {queries.length} queries across {allLLMs.length} platforms: {allLLMs.map(id => LLM_META[id]?.name).join(", ")}.
                  Each question is sent as-is to each AI, then Claude analyzes the response for brand positioning.
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                  {allLLMs.map(id => <Chip key={id} text={LLM_META[id]?.name} color={LLM_META[id]?.color} />)}
                  <span style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>~${(queries.length * allLLMs.length * 2 * 0.004).toFixed(2)} credits {"\u00B7"} {queries.length * allLLMs.length * 2} API calls</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn primary onClick={() => handleRunScan()} disabled={scanning}>{scanning ? "Scanning..." : `\u26A1 Full Scan (${queries.length} \u00D7 ${allLLMs.length})`}</Btn>
                  <Btn onClick={() => handleRunScan(queries.slice(0, 3))} disabled={scanning}>Quick Test (3 queries)</Btn>
                </div>
              </Card>

              {/* Query Bank Preview - Table */}
              <Card>
                <Label>QUERY BANK ({queries.length} queries{queries !== DEFAULT_QUERIES ? " \u00B7 Custom Import" : ""})</Label>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "65%" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
                        {["#", "PERSONA", "STAGE", "QUERY"].map(h => (
                          <th key={h} style={{ padding: "5px 4px", textAlign: "left", color: T.dim, fontWeight: 600, fontSize: 9, fontFamily: T.fontM, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.teal + "30" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queries.map((q, idx) => (
                        <tr key={q.id} style={{ borderBottom: "1px solid " + T.border + "40" }}>
                          <td style={{ padding: "5px 4px", color: T.dim, fontSize: 10, fontFamily: T.fontM, verticalAlign: "top" }}>{idx + 1}</td>
                          <td style={{ padding: "5px 4px", verticalAlign: "top", fontSize: 10, color: T.purple, fontFamily: T.fontM, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.persona}>{q.persona}</td>
                          <td style={{ padding: "5px 4px", verticalAlign: "top", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ fontSize: 9, fontFamily: T.fontM, fontWeight: 600, padding: "1px 4px", borderRadius: 3, background: stageColor(q.stage) + "15", color: stageColor(q.stage) }}>{q.stage}</span></td>
                          <td style={{ padding: "5px 4px", color: T.muted, lineHeight: 1.45, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{q.query}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ═══ RESULTS ═══ */}
          {nav === "results" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {!scanData ? (
                <EmptyState icon={"\u25C8"} title="No Scan Results" description="Run a perception scan first." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Run Scan</Btn>} />
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    <select value={fPersona} onChange={e => setFP(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 11 }}>
                      <option value="All">All Personas</option>
                      {personas.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={fStage} onChange={e => setFS(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 11 }}>
                      <option value="All">All Stages</option>
                      <option>Awareness</option><option>Discovery</option><option>Consideration</option>
                    </select>
                    <select value={fLifecycle} onChange={e => setFL(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 11 }}>
                      <option value="All">All CLM Stages</option>
                      {CLM_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <div style={{ marginLeft: "auto", fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{filtered.length} results {"\u00B7"} {scanData.llms.length} LLMs</div>
                  </div>
                  {filtered.map(r => {
                    const a = bestAnalysis(r);
                    if (!a) return null;
                    const exp = selResult === r.qid;
                    const dc = r.difficulty?.composite || 5;
                    const sir = a;
                    return (
                      <Card key={r.qid} style={{ cursor: "pointer", borderColor: exp ? T.teal + "30" : T.border }}>
                        <div onClick={() => setSelResult(exp ? null : r.qid)}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
                                <Chip text={r.persona} color={T.purple} />
                                <Chip text={r.stage} color={stageColor(r.stage)} />
                                {sir.mentioned && <BadgeEl text={"#" + sir.rank} color={sir.rank <= 2 ? T.green : sir.rank <= 4 ? T.gold : T.red} />}
                                {!sir.mentioned && <BadgeEl text="ABSENT" color={T.red} />}
                                <BadgeEl text={dc.toFixed(1) + " " + diffLabel(dc)} color={diffColor(dc)} />
                                <Chip text={CLM_STAGES.find(c => c.id === (r.lifecycle || "full-stack"))?.label || "Full-Stack CLM"} color={CLM_STAGES.find(c => c.id === (r.lifecycle || "full-stack"))?.color || "#a78bfa"} />
                              </div>
                              <div style={{ fontSize: 11, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>"{r.query}"</div>
                            </div>
                            <div style={{ display: "flex", gap: 3, flexShrink: 0, flexWrap: "wrap", maxWidth: "40%", justifyContent: "flex-end" }}>
                              {(sir.vendors_mentioned || []).sort((va, vb) => (va.position || 99) - (vb.position || 99)).slice(0, 5).map((v, vi) => {
                                const isSirion = v.name.toLowerCase().includes("sirion");
                                return (
                                  <div key={vi} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: T.fontM, background: isSirion ? T.teal + "20" : "rgba(255,255,255,0.03)", border: "1px solid " + (isSirion ? T.teal : T.border), color: isSirion ? T.teal : (VENDOR_COLORS[v.name] || T.muted), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }} title={"#" + v.position + " " + v.name}>
                                    #{v.position} {v.name}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Per-question rescan button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRescan(r.qid); }}
                              disabled={scanning || rescanning !== null}
                              title="Rescan this question against all LLMs"
                              style={{
                                flexShrink: 0, padding: "3px 10px", borderRadius: 5,
                                border: "1px solid " + (rescanning === r.qid ? T.teal + "60" : T.border),
                                background: rescanning === r.qid ? T.teal + "12" : "transparent",
                                color: rescanning === r.qid ? T.teal : T.dim,
                                cursor: (scanning || rescanning !== null) ? "not-allowed" : "pointer",
                                fontSize: 9, fontWeight: 600, fontFamily: T.fontM,
                                opacity: (scanning || (rescanning && rescanning !== r.qid)) ? 0.3 : 1,
                                display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                                transition: "all 0.2s ease", alignSelf: "center",
                              }}
                            >
                              {rescanning === r.qid ? (
                                <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid " + T.teal, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                              ) : "\u21BB"}
                              {rescanning === r.qid ? "Scanning..." : "Rescan"}
                            </button>
                          </div>
                        </div>
                        {exp && (() => {
                          const vendorTable = buildVendorTable(r);
                          const srcAttr = buildSourceAttribution(r);
                          const aggSent = aggregateSentiment(r);
                          const activeTab = expandedSection[r.qid] || "vendors";
                          const toggleTab = (tab) => { setExpandedSection(prev => ({ ...prev, [r.qid]: prev[r.qid] === tab ? null : tab })); };
                          const tabStyle = (tab) => ({
                            padding: "5px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: T.fontM,
                            textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", border: "none",
                            background: activeTab === tab ? T.teal + "18" : "transparent",
                            color: activeTab === tab ? T.teal : T.dim,
                            borderBottom: activeTab === tab ? "2px solid " + T.teal : "2px solid transparent",
                            transition: "all 0.2s ease",
                          });
                          return (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + T.border, animation: "fadeUp 0.25s ease" }}>

                            {/* LAYER 1: Consolidated Intelligence Strip */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.015)", marginBottom: 10 }}>
                              {/* Per-LLM presence pills */}
                              {(scanData.llms || []).map(lid => {
                                const la = r.analyses[lid];
                                const present = la && !la._error && la.mentioned;
                                const rank = la?.rank;
                                return (
                                  <div key={lid} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 4, background: present ? (LLM_META[lid]?.color || T.dim) + "10" : T.red + "08", border: "1px solid " + (present ? (LLM_META[lid]?.color || T.dim) + "25" : T.red + "20") }}>
                                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: LLM_META[lid]?.color || T.dim, flexShrink: 0 }} />
                                    <span style={{ fontSize: 9, fontFamily: T.fontM, fontWeight: 600, color: present ? (LLM_META[lid]?.color || T.dim) : T.red, whiteSpace: "nowrap" }}>
                                      {(LLM_META[lid]?.name || lid).substring(0, 3)}: {present ? "#" + rank : "ABS"}
                                    </span>
                                  </div>
                                );
                              })}
                              <div style={{ width: 1, height: 14, background: T.border, flexShrink: 0 }} />
                              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: sentimentColor(aggSent), textTransform: "uppercase", whiteSpace: "nowrap" }}>{aggSent}</span>
                              <div style={{ width: 1, height: 14, background: T.border, flexShrink: 0 }} />
                              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: diffColor(dc), whiteSpace: "nowrap" }}>{dc.toFixed(1)} {diffLabel(dc)}</span>
                              {srcAttr.totalSources > 0 && (
                                <>
                                  <div style={{ width: 1, height: 14, background: T.border, flexShrink: 0 }} />
                                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.cyan, whiteSpace: "nowrap" }}>{srcAttr.totalSources} src</span>
                                  {!srcAttr.hasSirionSource && <span style={{ fontSize: 8, fontWeight: 700, fontFamily: T.fontM, color: T.red, padding: "1px 3px", borderRadius: 3, background: T.red + "12", whiteSpace: "nowrap" }}>NO SIRION</span>}
                                </>
                              )}
                            </div>

                            {/* LAYER 2: Tab Headers */}
                            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + T.border, marginBottom: 10, overflowX: "auto" }}>
                              {[
                                { id: "vendors", label: "VENDORS", count: vendorTable.length },
                                { id: "sources", label: "SOURCES", count: srcAttr.totalSources },
                                { id: "responses", label: "RESPONSES", count: (scanData.llms || []).length },
                                { id: "action", label: "ACTION" },
                              ].map(tab => (
                                <button key={tab.id} onClick={(e) => { e.stopPropagation(); toggleTab(tab.id); }} style={{ ...tabStyle(tab.id), whiteSpace: "nowrap", flexShrink: 0, padding: "5px 8px" }}>
                                  {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
                                </button>
                              ))}
                            </div>

                            {/* TAB: VENDORS -- Consolidated table */}
                            {activeTab === "vendors" && (
                              <div style={{ animation: "fadeUp 0.2s ease" }}>
                                {vendorTable.length > 0 ? (
                                  <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                                      <colgroup>
                                        <col style={{ width: "22%" }} />
                                        {(scanData.llms || []).map(lid => <col key={lid} style={{ width: Math.floor(18 / (scanData.llms.length || 1)) + "%" }} />)}
                                        <col />
                                      </colgroup>
                                      <thead>
                                        <tr>
                                          <th style={{ padding: "5px 4px", textAlign: "left", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border }}>Vendor</th>
                                          {(scanData.llms || []).map(lid => (
                                            <th key={lid} style={{ padding: "5px 2px", textAlign: "center", fontSize: 8, fontWeight: 700, fontFamily: T.fontM, color: LLM_META[lid]?.color || T.dim, textTransform: "uppercase", borderBottom: "1px solid " + T.border }} title={LLM_META[lid]?.name}>{(LLM_META[lid]?.name || lid).substring(0, 3).toUpperCase()}</th>
                                          ))}
                                          <th style={{ padding: "5px 4px", textAlign: "left", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border }}>Features</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {vendorTable.map((v, vi) => (
                                          <tr key={vi} style={{ background: v.isSirion ? T.teal + "08" : "transparent", borderBottom: "1px solid " + T.border + "40" }}>
                                            <td style={{ padding: "4px 4px", fontWeight: v.isSirion ? 700 : 500, color: v.isSirion ? T.teal : (VENDOR_COLORS[v.name] || T.muted), fontFamily: T.fontM, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.name}>{v.name}</td>
                                            {(scanData.llms || []).map(lid => {
                                              const pos = v.positions[lid];
                                              return (
                                                <td key={lid} style={{ padding: "4px 2px", textAlign: "center", fontFamily: T.fontM, fontSize: 10 }}>
                                                  {pos ? <span style={{ fontWeight: 700, color: pos <= 2 ? T.green : pos <= 4 ? T.gold : T.red }}>#{pos}</span> : <span style={{ color: T.dim + "60" }}>--</span>}
                                                </td>
                                              );
                                            })}
                                            <td style={{ padding: "4px 4px", overflow: "hidden" }}>
                                              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                                {v.features.slice(0, 3).map((f, fi) => <span key={fi} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: (v.isSirion ? T.teal : T.dim) + "10", color: v.isSirion ? T.teal : T.dim, fontFamily: T.fontM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }} title={f}>{f}</span>)}
                                                {v.features.length > 3 && <span style={{ fontSize: 8, color: T.dim, fontFamily: T.fontM }}>+{v.features.length - 3}</span>}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : <div style={{ fontSize: 11, color: T.dim, padding: 10 }}>No vendors detected in this response.</div>}
                                {/* Difficulty sub-scores (compact) */}
                                {r.difficulty && (
                                  <div style={{ marginTop: 10, padding: "6px 8px", borderRadius: 4, background: "rgba(255,255,255,0.01)" }}>
                                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                      {[{ l: "Specificity", v: r.difficulty.specificity }, { l: "Competition", v: r.difficulty.competition }, { l: "Content Gap", v: r.difficulty.contentGap }, { l: "Volume", v: r.difficulty.volume }].map(d2 => (
                                        <div key={d2.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <span style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM }}>{d2.l}:</span>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: diffColor(d2.v), fontFamily: T.fontM }}>{d2.v}/10</span>
                                        </div>
                                      ))}
                                    </div>
                                    {r.difficulty.rationale && <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{r.difficulty.rationale}</div>}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* TAB: SOURCES -- Citation attribution */}
                            {activeTab === "sources" && (
                              <div style={{ animation: "fadeUp 0.2s ease" }}>
                                {srcAttr.totalSources > 0 ? (
                                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                    {/* Donut chart */}
                                    <div style={{ flex: "0 0 140px" }}>
                                      <ResponsiveContainer width={140} height={140}>
                                        <PieChart>
                                          <Pie data={srcAttr.pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none">
                                            {srcAttr.pieData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                                          </Pie>
                                          <Tooltip contentStyle={TIP_STYLE()} />
                                        </PieChart>
                                      </ResponsiveContainer>
                                      {/* Legend */}
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, justifyContent: "center" }}>
                                        {srcAttr.pieData.map((d2, i2) => (
                                          <div key={i2} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: d2.fill }} />
                                            <span style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM, textTransform: "capitalize" }}>{d2.name} ({d2.value})</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    {/* Source list */}
                                    <div style={{ flex: 1, minWidth: 200 }}>
                                      {!srcAttr.hasSirionSource && (
                                        <div style={{ padding: "6px 10px", borderRadius: 4, background: T.red + "08", border: "1px solid " + T.red + "20", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: T.red, fontFamily: T.fontM }}>ALERT:</span>
                                          <span style={{ fontSize: 10, color: T.muted }}>Sirion content not cited as a source by any LLM</span>
                                        </div>
                                      )}
                                      {srcAttr.sources.map((s2, si) => (
                                        <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: si < srcAttr.sources.length - 1 ? "1px solid " + T.border + "30" : "none" }}>
                                          <span style={{ fontSize: 10, fontWeight: 600, color: s2.isSirion ? T.teal : T.text, fontFamily: T.fontM, minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s2.domain}</span>
                                          <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, fontFamily: T.fontM, textTransform: "uppercase", background: (SOURCE_TYPE_COLORS[s2.type] || T.dim) + "15", color: SOURCE_TYPE_COLORS[s2.type] || T.dim }}>{s2.type}</span>
                                          <div style={{ display: "flex", gap: 2 }}>
                                            {s2.llms.map(lid => <div key={lid} style={{ width: 5, height: 5, borderRadius: "50%", background: LLM_META[lid]?.color || T.dim }} title={LLM_META[lid]?.name} />)}
                                          </div>
                                          {s2.isSirion && <span style={{ fontSize: 8, fontWeight: 700, color: T.teal, fontFamily: T.fontM, padding: "1px 4px", borderRadius: 3, background: T.teal + "15" }}>SIRION</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : <div style={{ fontSize: 11, color: T.dim, padding: 10 }}>No citation sources detected for this query.</div>}
                              </div>
                            )}

                            {/* TAB: AI RESPONSES -- Per-LLM detail */}
                            {activeTab === "responses" && (
                              <div style={{ animation: "fadeUp 0.2s ease" }}>
                                {(scanData.llms || []).map(lid => {
                                  const la = r.analyses[lid];
                                  if (!la || la._error) return <div key={lid} style={{ fontSize: 11, color: T.red, marginBottom: 6 }}>{LLM_META[lid]?.name}: {la?._error || "No data"}</div>;
                                  const respKey = r.qid + "-" + lid;
                                  const isRespExpanded = expandedResponses[respKey];
                                  const fullText = la.full_response || la.response_snippet || "";
                                  const snippet = (la.response_snippet || "").substring(0, 260);
                                  return (
                                    <div key={lid} style={{ padding: 10, borderRadius: 6, background: "rgba(255,255,255,0.01)", border: "1px solid " + (LLM_META[lid]?.color || T.dim) + "15", marginBottom: 8 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: LLM_META[lid]?.color }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: LLM_META[lid]?.color }}>{LLM_META[lid]?.name}</span>
                                        {la.mentioned && <BadgeEl text={"#" + la.rank} color={la.rank <= 2 ? T.green : la.rank <= 4 ? T.gold : T.red} />}
                                        {!la.mentioned && <BadgeEl text="ABSENT" color={T.red} />}
                                        {la.framing && <span style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM, marginLeft: 4 }}>"{la.framing}"</span>}
                                        <span style={{ fontSize: 10, fontWeight: 600, color: sentimentColor(la.sentiment), fontFamily: T.fontM, marginLeft: "auto", textTransform: "uppercase" }}>{la.sentiment}</span>
                                      </div>
                                      {/* Response viewer */}
                                      <div style={{ marginBottom: 6 }}>
                                        {!isRespExpanded && snippet && <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{snippet}{fullText.length > 260 ? "\u2026" : ""}</div>}
                                        {isRespExpanded && (
                                          <div style={{ maxHeight: 400, overflowY: "auto", padding: "10px 12px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border, fontSize: 11, fontFamily: T.fontM, lineHeight: 1.7, color: T.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                            {fullText}
                                          </div>
                                        )}
                                        {fullText.length > 260 && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedResponses(prev => ({ ...prev, [respKey]: !prev[respKey] })); }}
                                            style={{ background: "none", border: "none", color: T.teal, fontSize: 11, cursor: "pointer", padding: "4px 0", fontFamily: T.fontM }}>
                                            {isRespExpanded ? "Collapse" : "Show Full AI Response"}
                                          </button>
                                        )}
                                      </div>
                                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                        {(la.strengths || []).map((s2, j) => <Chip key={j} text={s2} color={T.green} />)}
                                        {(la.gaps || []).map((g, j) => <Chip key={"g" + j} text={g} color={T.red} />)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* TAB: ACTION -- Content gaps + Recommendation */}
                            {activeTab === "action" && (
                              <div style={{ animation: "fadeUp 0.2s ease" }}>
                                {a.content_gaps && a.content_gaps.length > 0 && (
                                  <div style={{ padding: "7px 10px", borderRadius: 6, background: T.gold + "06", border: "1px solid " + T.gold + "18", marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, color: T.gold, fontFamily: T.fontM, marginBottom: 3 }}>CONTENT GAPS</div>
                                    {a.content_gaps.map((g, i2) => <div key={i2} style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>{"\u2022"} {g}</div>)}
                                  </div>
                                )}
                                {a.recommendation && (
                                  <div style={{ padding: "7px 10px", borderRadius: 6, background: T.teal + "06", border: "1px solid " + T.teal + "18", marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontM, marginBottom: 2 }}>RECOMMENDATION</div>
                                    <div style={{ fontSize: 11, color: T.muted }}>{a.recommendation}</div>
                                  </div>
                                )}
                                {(!a.content_gaps || a.content_gaps.length === 0) && !a.recommendation && (
                                  <div style={{ fontSize: 11, color: T.dim, padding: 10 }}>No action items identified for this query.</div>
                                )}
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ═══ COMPETITORS ═══ */}
          {nav === "competitors" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {!scanData ? (
                <EmptyState icon={"\u2694\uFE0F"} title="Competitor Intelligence" description="Run a scan first to see competitor analysis." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Run Scan</Btn>} />
              ) : (
                <>
                  <Card>
                    <Label>MENTION FREQUENCY ACROSS ALL LLMs</Label>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={compMentions.slice(0, 8)} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis type="number" tick={{ fill: T.dim, fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fill: T.muted, fontSize: 11 }} width={95} />
                        <Tooltip contentStyle={TIP_STYLE()} />
                        <Bar dataKey="m" name="Mentions" radius={[0, 3, 3, 0]}>
                          {compMentions.slice(0, 8).map((c2, i) => <Cell key={i} fill={VENDOR_COLORS[c2.name] || T.dim} fillOpacity={0.65} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card>
                    <Label>QUERY OWNERSHIP MATRIX</Label>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <colgroup>
                          <col style={{ width: "34%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "11%" }} />
                        </colgroup>
                        <thead><tr>
                          {["Query", "Persona", "Stage", "AI Winner", "Sirion", "Diff"].map(h => (
                            <th key={h} style={{ padding: "7px 6px", textAlign: h === "Query" ? "left" : "center", fontSize: 10, color: T.dim, fontFamily: T.fontM, borderBottom: "1px solid " + T.border, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {scanData.results.map((r, i) => {
                            const a = bestAnalysis(r);
                            const top = a?.vendors_mentioned?.sort((x, y) => x.position - y.position)?.[0];
                            const dc = r.difficulty?.composite || 5;
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid " + T.border }}>
                                <td style={{ padding: "6px 6px", fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.query}>{r.query}</td>
                                <td style={{ textAlign: "center", padding: "6px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Chip text={r.persona} color={T.purple} /></td>
                                <td style={{ textAlign: "center", padding: "6px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Chip text={r.stage} color={stageColor(r.stage)} /></td>
                                <td style={{ textAlign: "center", padding: "6px 4px", fontSize: 11, fontWeight: 600, color: VENDOR_COLORS[top?.name] || T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={top?.name}>{top?.name || "\u2014"}</td>
                                <td style={{ textAlign: "center", padding: "6px 4px" }}>{a?.mentioned ? <BadgeEl text={"#" + a.rank} color={a.rank <= 2 ? T.green : a.rank <= 4 ? T.gold : T.red} /> : <span style={{ color: T.red, fontSize: 11 }}>{"\u2717"}</span>}</td>
                                <td style={{ textAlign: "center", padding: "6px 4px" }}><BadgeEl text={dc.toFixed(1)} color={diffColor(dc)} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  {/* Competitor Feature Attribution */}
                  <Card>
                    <Label>COMPETITOR FEATURE ATTRIBUTION</Label>
                    <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>What capabilities AI attributes to each vendor across all queries</div>
                    {compMentions.slice(0, 10).map(c2 => {
                      const feats = compFeatures[c2.name] || {};
                      const sorted = Object.entries(feats).sort((a2, b2) => b2[1] - a2[1]).slice(0, 6);
                      if (sorted.length === 0) return null;
                      const isSirion = c2.name.toLowerCase().includes("sirion");
                      return (
                        <div key={c2.name} style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 6, background: "rgba(255,255,255,0.015)", border: "1px solid " + (isSirion ? T.teal + "30" : T.border) }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: VENDOR_COLORS[c2.name] || T.muted }}>{c2.name}</span>
                            <span style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{c2.m} mentions</span>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {sorted.map(([feat, count]) => (
                              <div key={feat} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: T.fontM, background: (isSirion ? T.teal : T.dim) + "10", border: "1px solid " + (isSirion ? T.teal : T.dim) + "20", color: isSirion ? T.teal : T.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={feat + " (" + count + "x)"}>
                                {feat} ({count}x)
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                  {/* Sirion vs Top Competitor */}
                  {(() => {
                    const sirionData = compMentions.find(c2 => c2.name.toLowerCase().includes("sirion"));
                    const topComp = compMentions.find(c2 => !c2.name.toLowerCase().includes("sirion"));
                    if (!sirionData || !topComp) return null;
                    const sirFeats = Object.entries(compFeatures[sirionData.name] || {}).sort((a2, b2) => b2[1] - a2[1]).slice(0, 6);
                    const compFeats2 = Object.entries(compFeatures[topComp.name] || {}).sort((a2, b2) => b2[1] - a2[1]).slice(0, 6);
                    return (
                      <Card glow={T.teal}>
                        <Label>SIRION vs TOP COMPETITOR</Label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
                          {[{ data: sirionData, feats: sirFeats, color: T.teal, label: sirionData.name },
                            { data: topComp, feats: compFeats2, color: VENDOR_COLORS[topComp.name] || T.red, label: topComp.name }
                          ].map(side => (
                            <div key={side.label} style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: side.color, marginBottom: 8, fontFamily: T.fontH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{side.label}</div>
                              <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM, marginBottom: 8 }}>{side.data.m} mentions | {side.data.t3} top-3 | {side.data.pos} positive</div>
                              {side.feats.length > 0 ? side.feats.map(([f, c3]) => (
                                <div key={f} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4, padding: "3px 0", borderBottom: "1px solid " + T.border }}>
                                  <span style={{ fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }} title={f}>{f}</span>
                                  <span style={{ fontSize: 11, fontFamily: T.fontM, color: side.color, fontWeight: 700, flexShrink: 0 }}>{c3}x</span>
                                </div>
                              )) : <div style={{ fontSize: 11, color: T.dim }}>No feature data yet</div>}
                            </div>
                          ))}
                        </div>
                      </Card>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* ═══ CONTENT GAPS ═══ */}
          {nav === "gaps" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {!scanData ? (
                <EmptyState icon={"\u25CE"} title="Content Gap Analysis" description="Run a scan first." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Run Scan</Btn>} />
              ) : (() => {
                const allGaps = [];
                const framings = [];
                scanData.results.forEach(r => {
                  (scanData.llms || []).forEach(lid => {
                    const a = r.analyses[lid];
                    if (!a || a._error) return;
                    (a.content_gaps || []).forEach(g => allGaps.push({ gap: g, p: r.persona, s: r.stage }));
                    if (a.framing) framings.push({ f: a.framing, p: r.persona, llm: lid });
                  });
                });
                const gc = {};
                allGaps.forEach(g => {
                  const k = g.gap.toLowerCase().substring(0, 60);
                  if (!gc[k]) gc[k] = { gap: g.gap, n: 0, ps: new Set(), ss: new Set() };
                  gc[k].n++; gc[k].ps.add(g.p); gc[k].ss.add(g.s);
                });
                const topG = Object.values(gc).sort((a2, b) => b.n - a2.n);
                return (
                  <>
                    <Card glow={T.purple}>
                      <Label>HOW AI FRAMES {(pipeline.m1?.company || "SIRION").toUpperCase()}'S IDENTITY</Label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {framings.slice(0, 20).map((f, i) => (
                          <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.015)", border: "1px solid " + T.purple + "18", maxWidth: 280 }}>
                            <div style={{ fontSize: 11, color: T.purple, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.f}>"{f.f}"</div>
                            <div style={{ fontSize: 11, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.p} {"\u00B7"} {LLM_META[f.llm]?.name}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                    <Card>
                      <Label>PRIORITY CONTENT GAPS (by frequency)</Label>
                      {topG.slice(0, 15).map((g, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: i < 14 ? "1px solid " + T.border : "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: T.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.gap}>{g.gap}</div>
                            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                              {[...g.ps].map(p => <Chip key={p} text={p} color={T.purple} />)}
                              {[...g.ss].map(s2 => <Chip key={s2} text={s2} color={stageColor(s2)} />)}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.orange, fontFamily: T.fontM, flexShrink: 0 }}>{g.n}{"\u00D7"}</span>
                        </div>
                      ))}
                    </Card>
                  </>
                );
              })()}
            </div>
          )}

          {/* ═══ TRENDS ═══ */}
          {nav === "trends" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {scanHistory.length === 0 ? (
                <EmptyState icon={"\u2197\uFE0F"} title="Visibility Trends" description="Run multiple scans over time to see trends." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Run First Scan</Btn>} />
              ) : (
                <>
                  {scanHistory.length > 1 && (
                    <>
                    <Card glow={T.teal}>
                      <Label>AI VISIBILITY OVER TIME</Label>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={scanHistory.slice().reverse().map(s => ({
                          d: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                          overall: s.scores?.overall || 0,
                          mention: s.scores?.mention || 0,
                          sentiment: s.scores?.sentiment || 0,
                          sov: s.scores?.shareOfVoice || 0,
                          position: s.scores?.position || 0,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="d" tick={{ fill: T.dim, fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 11 }} />
                          <Tooltip contentStyle={TIP_STYLE()} />
                          <Legend wrapperStyle={{ fontSize: 11, fontFamily: T.fontM }} />
                          <Line type="monotone" dataKey="overall" name="Overall" stroke={T.teal} strokeWidth={2.5} dot={{ r: 3, fill: T.teal }} />
                          <Line type="monotone" dataKey="mention" name="Mention Rate" stroke={T.green} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                          <Line type="monotone" dataKey="sentiment" name="Sentiment" stroke={T.gold} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                          <Line type="monotone" dataKey="sov" name="Share of Voice" stroke={T.cyan} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                          <Line type="monotone" dataKey="position" name="Position Score" stroke={T.purple} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                    {/* Period Comparison */}
                    {scanHistory.length >= 2 && (() => {
                      const latest = scanHistory[0];
                      const prev = scanHistory[1];
                      const metrics = [
                        { key: "overall", label: "Overall Score", color: T.teal },
                        { key: "mention", label: "Mention Rate", color: T.green },
                        { key: "sentiment", label: "Sentiment", color: T.gold },
                        { key: "shareOfVoice", label: "Share of Voice", color: T.cyan },
                        { key: "position", label: "Position Score", color: T.purple },
                      ];
                      return (
                        <Card>
                          <Label>SCAN-OVER-SCAN COMPARISON</Label>
                          <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>
                            {new Date(prev.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} vs {new Date(latest.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                            {metrics.map(m => {
                              const cur = latest.scores?.[m.key] || 0;
                              const prv = prev.scores?.[m.key] || 0;
                              const delta = cur - prv;
                              return (
                                <div key={m.key} style={{ padding: "10px 8px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid " + m.color + "20", textAlign: "center" }}>
                                  <div style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM, marginBottom: 4, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontH, color: m.color }}>{cur}</div>
                                  <DeltaBadge val={delta} suffix="pts" />
                                  <div style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM, marginTop: 2 }}>was {prv}</div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      );
                    })()}
                    </>
                  )}
                  <Card>
                    <Label>SCAN HISTORY</Label>
                    {scanHistory.map((s, i) => (
                      <div key={s.id} onClick={() => { setScanData(s); setNav("overview"); }} style={{ padding: "9px 12px", borderRadius: 6, marginBottom: 4, cursor: "pointer", background: scanData?.id === s.id ? T.teal + "08" : "transparent", border: "1px solid " + (scanData?.id === s.id ? T.teal + "25" : T.border), display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{new Date(s.date).toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.count} queries {"\u00B7"} {s.llms.length} LLMs {"\u00B7"} ${s.cost?.display} {"\u00B7"} {Math.round(s.duration / 1000)}s</div>
                        </div>
                        <Ring score={s.scores.overall} size={36} color={T.teal} />
                      </div>
                    ))}
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {nav === "settings" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              <Card glow={T.purple}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <Label>LLM CONNECTIONS</Label>
                  <Btn onClick={handleTestConnections} disabled={testing}>{testing ? "Testing..." : "Test All Connections"}</Btn>
                </div>
                {["claude", "openai", "gemini", "perplexity"].map(id => {
                  const meta = LLM_META[id];
                  const avail = allLLMs.includes(id);
                  const conn = connections[id];
                  const statusColor = conn === "connected" ? T.green : conn === "error" ? T.red : avail ? T.gold : T.dim;
                  const statusText = conn === "connected" ? "CONNECTED" : conn === "error" ? "ERROR" : avail ? "KEY SET" : "NO KEY";
                  return (
                    <div key={id} style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid " + (avail ? meta.color + "25" : T.border), marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, flexWrap: "wrap" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.name}</span>
                          <BadgeEl text={statusText} color={statusColor} />
                          {id === "claude" && <BadgeEl text="BUILT-IN + ANALYZER" color={T.purple} />}
                        </div>
                        <span style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM, flexShrink: 0, whiteSpace: "nowrap" }}>{id === "claude" ? "claude-sonnet-4" : id === "openai" ? "gpt-4o" : id === "gemini" ? "gemini-2.0-flash" : "sonar"}</span>
                      </div>
                      {avail && <div style={{ fontSize: 11, color: T.dim, marginTop: 6, fontFamily: T.fontM }}>API key configured via .env</div>}
                      {!avail && <div style={{ fontSize: 11, color: T.red, marginTop: 6 }}>Add VITE_{id.toUpperCase()}_API_KEY to .env</div>}
                    </div>
                  );
                })}
              </Card>

              {/* M1→M2 Bridge */}
              <Card glow={T.teal} style={{ borderLeft: "3px solid " + T.teal }}>
                <Label>QUESTION BANK {"\u2014"} M1{"\u2192"}M2 BRIDGE</Label>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>
                  Import buyer-intent questions from M1. Supports numbered lists, markdown tables, CSV, JSON.
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: queries === DEFAULT_QUERIES ? T.teal + "12" : T.gold + "12", border: "1px solid " + (queries === DEFAULT_QUERIES ? T.teal : T.gold) + "30" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: queries === DEFAULT_QUERIES ? T.teal : T.gold }}>{queries === DEFAULT_QUERIES ? "Default Bank" : "Custom Import"}</div>
                    <div style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{queries.length} queries {"\u00B7"} {personas.length} personas</div>
                  </div>
                  {queries !== DEFAULT_QUERIES && <Btn onClick={() => { setQueries(DEFAULT_QUERIES); setImportStatus({ type: "success", msg: "Restored defaults" }); }}>{"\u21BA"} Reset</Btn>}
                </div>
                <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste questions from M1 Question Generator..." style={{ width: "100%", minHeight: 80, padding: "10px 12px", borderRadius: 8, background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 11, fontFamily: T.fontM, resize: "vertical", lineHeight: 1.5, outline: "none" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                  <Btn primary onClick={() => { const p = parseImportedQuestions(importText); if (!p.length) { setImportStatus({ type: "error", msg: "No questions found." }); return; } setQueries(p); setImportStatus({ type: "success", msg: `Imported ${p.length} questions.` }); }} disabled={!importText.trim()}>{"\u26A1"} Import</Btn>
                  <Btn onClick={() => { setImportText(""); setImportStatus(null); }}>Clear</Btn>
                </div>
                {importStatus && <div style={{ marginTop: 8, fontSize: 11, color: importStatus.type === "success" ? T.green : T.red, fontWeight: 600 }}>{importStatus.type === "success" ? "\u2713" : "\u2717"} {importStatus.msg}</div>}
              </Card>

              {/* M2→M3 Auto-Sync Status */}
              <Card glow={T.purple} style={{ borderLeft: "3px solid " + (scanData ? T.green : T.purple) }}>
                <Label>AUTHORITY RING SYNC {"\u2014"} M2{"\u2192"}M3 (AUTO)</Label>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>Scan results automatically flow to the Authority Ring for domain prioritization. No manual export needed.</div>
                {scanData ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.green, boxShadow: `0 0 8px ${T.green}50` }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.green, fontFamily: T.fontM }}>SYNCED — {scanData.results?.length || 0} results flowing to M3</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.dim, padding: "14px", textAlign: "center", background: T.surface, borderRadius: 8 }}>Run a scan first — data will auto-sync to Authority Ring</div>
                )}
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, Component, lazy, Suspense } from "react";
import { themes, ThemeContext } from "./ThemeContext";
import { PipelineProvider, usePipeline } from "./PipelineContext";
import { GOOGLE_FONTS_URL } from "./typography";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, RadialBarChart, RadialBar, Legend } from "recharts";
import { NARRATIVE_CLASSES } from "./scanEngine";

// BUG-009 fix: lazy-load heavy module components for code splitting
const QuestionGenerator = lazy(() => import("./QuestionGenerator"));
const PerceptionMonitor = lazy(() => import("./PerceptionMonitor"));
const AuthorityRing = lazy(() => import("./AuthorityRing"));
const BuyingStageGuide = lazy(() => import("./BuyingStageGuide"));
const CLMAdvisor = lazy(() => import("./CLMAdvisor"));
const StrategyAdvisor = lazy(() => import("./StrategyAdvisor"));
const CompanyIntelligence = lazy(() => import("./CompanyIntelligence"));


/* ═══════════════════════════════════════════════════════
   XTRUSIO — AI Organic Growth Engine
   App Shell: Sidebar navigation, theme toggle, module rendering
   Design system adapted from competitive-intel-product.jsx
   ═══════════════════════════════════════════════════════ */

const MODULES = [
  { id: "home", n: "0", label: "Dashboard", icon: "\u25C9", path: "/" },
  { id: "intel", n: "R", label: "Company Intel", path: "/intel" },
  { id: "m1", n: "1", label: "Question Generator", icon: "\u2753", path: "/questions" },
  { id: "m2", n: "2", label: "Perception Monitor", icon: "\uD83D\uDD2D", path: "/perception" },
  { id: "m3", n: "3", label: "Authority Ring", icon: "\u25CE", path: "/authority" },
  { id: "m4", n: "4", label: "Buying Stage Guide", icon: "\uD83E\uDDED", path: "/buying-stage" },
  { id: "m5", n: "5", label: "CLM Advisor", icon: "\u26A1", path: "/advisor" },
  { id: "settings", n: "\u2699", label: "Settings", section: "system", path: "/settings" },
];

/* ── Hash-based URL routing ── */
const pathToId = Object.fromEntries(MODULES.map(m => [m.path, m.id]));
const idToPath = Object.fromEntries(MODULES.map(m => [m.id, m.path]));

function getModuleFromHash() {
  const hash = window.location.hash.replace("#", "") || "/";
  if (pathToId[hash]) return pathToId[hash];
  // Support sub-routes: #/perception/scan -> m2
  const basePath = "/" + hash.split("/").filter(Boolean)[0];
  return pathToId[basePath] || "home";
}

function getSubTabFromHash() {
  const parts = (window.location.hash.replace("#", "") || "/").split("/").filter(Boolean);
  return parts.length > 1 ? parts[1] : null;
}

function useHashRouter() {
  const [active, setActiveState] = useState(getModuleFromHash);
  const [subTab, setSubTabState] = useState(getSubTabFromHash);

  useEffect(() => {
    const onHash = () => { setActiveState(getModuleFromHash()); setSubTabState(getSubTabFromHash()); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setActive = (id, sub) => {
    const path = idToPath[id] || "/";
    window.location.hash = sub ? path + "/" + sub : path;
  };

  return [active, setActive, subTab];
}

const useIsMobile = () => {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 900); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  return m;
};

/* ── Dashboard Visualization Helpers ── */
const GaugeArc = ({ value, max = 100, size = 80, strokeWidth = 7, label, sub, color, t }) => {
  const pct = Math.min(Math.max((value || 0) / max, 0), 1);
  const r = (size - strokeWidth) / 2;
  const circ = Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path d={`M ${strokeWidth / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none" stroke={t.border} strokeWidth={strokeWidth} strokeLinecap="round" />
        <path d={`M ${strokeWidth / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.3s" }} />
      </svg>
      <div style={{ marginTop: -4, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mono)", color, lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)", marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
};

const PersonaRing = ({ name, researched, t }) => {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const r = 18, sw = 3, circ = 2 * Math.PI * r;
  const color = researched ? "#22c55e" : "#f59e0b";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: 44, height: 44 }}>
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle cx={22} cy={22} r={r} fill="none" stroke={t.border} strokeWidth={sw} />
          <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={researched ? `${circ}` : `${4} ${4}`} strokeLinecap="round"
            transform="rotate(-90 22 22)" style={{ transition: "stroke-dasharray 0.5s" }} />
        </svg>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color }}>{initials}</div>
      </div>
      <div style={{ fontSize: 10, color: t.textSec, textAlign: "center", maxWidth: 68, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name.split(" ")[0]}
      </div>
    </div>
  );
};

/* ── Dashboard — Sirion Growth Intelligence ── */
function Dashboard({ t, onNavigate }) {
  const { getStatus, getStaleness, pipeline: ps } = usePipeline();
  const status = getStatus();
  const staleness = getStaleness ? getStaleness() : {};

  const fmtTime = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return null; }
  };

  const m1 = status.m1 || {};
  const m2 = status.m2 || {};
  const m3 = status.m3 || {};
  const m4 = status.m4 || {};

  // M2 scan progress (real-time during active scans)
  const scanProgress = ps?.m2?.scanProgress;

  // Personas
  const m1Personas = ps?.m1?.personaProfiles || [];
  const researchedPersonas = m1Personas.filter(p => p.researchSummary);
  const unresearchedPersonas = m1Personas.filter(p => !p.researchSummary);

  // M2 scores
  const scanScores = ps?.m2?.scores || null;
  const mentionRate = scanScores?.mention || 0;
  const overallScore = scanScores?.overall || 0;
  const shareOfVoice = scanScores?.shareOfVoice || 0;
  const scannedAt = ps?.m2?.scannedAt;

  // M2 compact scan results
  const scanResultsRaw = ps?.m2?.scanResults?.results;
  const scanResultsArr = Array.isArray(scanResultsRaw) ? scanResultsRaw : [];
  const scanLlms = ps?.m2?.scanResults?.llms || [];

  // Per-LLM mention rates (horizontal bars)
  const llmData = useMemo(() => {
    if (!scanResultsArr.length || !scanLlms.length) return [];
    const llmNames = { claude: "Claude", gemini: "Gemini", chatgpt: "ChatGPT", "gpt-4o": "ChatGPT", openai: "ChatGPT" };
    return scanLlms.map(lid => {
      let mentioned = 0;
      scanResultsArr.forEach(r => {
        if (r.mentions) { if (r.mentions[lid]) mentioned++; }
        else { const a = r.analyses?.[lid]; if (a && !a._error && a.mentioned) mentioned++; }
      });
      const rate = scanResultsArr.length ? Math.round((mentioned / scanResultsArr.length) * 100) : 0;
      return { id: lid, name: llmNames[lid] || lid, mentioned, total: scanResultsArr.length, rate };
    });
  }, [scanResultsArr.length, scanLlms.length]);

  // Radial data for LLM chart
  const llmRadialData = useMemo(() => {
    if (!llmData.length) return [];
    const fills = { Claude: "#67e8f9", Gemini: "#818cf8", ChatGPT: "#4ade80" };
    return llmData.map((d, i) => ({ ...d, fill: fills[d.name] || ["#67e8f9", "#818cf8", "#4ade80"][i] }));
  }, [llmData]);

  // CLM lifecycle breakdown
  const clmCounts = { "pre-signature": 0, "post-signature": 0, "full-stack": 0 };
  scanResultsArr.forEach(r => { const lc = r.lifecycle || "full-stack"; if (clmCounts[lc] !== undefined) clmCounts[lc]++; });
  const totalQueries = scanResultsArr.length;
  const clmData = [
    { name: "Pre-Signature", count: clmCounts["pre-signature"], color: "#3b82f6", desc: "Authoring, templates, redlining" },
    { name: "Post-Signature", count: clmCounts["post-signature"], color: "#10b981", desc: "Obligations, compliance, renewals" },
    { name: "Full-Stack", count: clmCounts["full-stack"], color: "#a78bfa", desc: "End-to-end platform, analytics" },
  ];

  // Narrative Classification — pre-computed by M2 when scan completes
  const narrativeData = ps?.m2?.narrativeBreakdown || null;

  const narrativeDonutData = useMemo(() => {
    if (!narrativeData) return [];
    return (narrativeData.breakdown || []).filter(b => b.count > 0 && b.id !== "absent");
  }, [narrativeData]);

  // M3 Authority Ring — FIXED: was reading ps.m3.domains (wrong), now reads ps.m3.prioritizedDomains
  const m3DomainsArr = Array.isArray(ps?.m3?.prioritizedDomains) ? ps.m3.prioritizedDomains : [];
  const gapCount = ps?.m3?.gapCount || 0;
  const strongCount = ps?.m3?.strongCount || 0;
  const presentCount = ps?.m3?.presentCount || 0;
  const totalDomains = ps?.m3?.totalDomains || (gapCount + strongCount + presentCount) || 0;
  const topGapDomains = useMemo(() =>
    [...m3DomainsArr].sort((a, b) => (b.da || 0) - (a.da || 0)).slice(0, 3),
    [m3DomainsArr.length]
  );
  const authorityData = useMemo(() => {
    if (!totalDomains) return [];
    return [
      { name: "Zero Presence", value: gapCount, color: "#ef4444" },
      { name: "Present", value: presentCount, color: "#fbbf24" },
      { name: "Strong", value: strongCount, color: "#22c55e" },
    ];
  }, [gapCount, presentCount, strongCount, totalDomains]);

  // Competitor data — try competitorSummary (new), fall back to exportPayload
  const competitorData = useMemo(() => {
    if (ps?.m2?.competitorSummary?.length) return ps.m2.competitorSummary;
    const queries = ps?.m2?.exportPayload?.queries;
    if (!Array.isArray(queries) || !queries.length) return [];
    const agg = {};
    queries.forEach(q => {
      (q.topCompetitors || []).forEach(c => {
        if (!agg[c.name]) agg[c.name] = { name: c.name, mentions: 0, top3: 0, positive: 0 };
        agg[c.name].mentions++;
        if (c.position <= 3) agg[c.name].top3++;
        if (c.sentiment === "positive") agg[c.name].positive++;
      });
    });
    return Object.values(agg).sort((a, b) => b.mentions - a.mentions).slice(0, 8);
  }, [ps?.m2?.competitorSummary, ps?.m2?.exportPayload]);

  // Competitor bar chart data (reversed for vertical layout - highest on top)
  const competitorChartData = useMemo(() => {
    return competitorData.slice(0, 8).map(c => ({
      name: c.name.length > 12 ? c.name.slice(0, 11) + "\u2026" : c.name,
      fullName: c.name, mentions: c.mentions,
      isSirion: c.name.toLowerCase().includes("sirion"),
    })).reverse();
  }, [competitorData]);

  // CLM donut data
  const clmDonutData = useMemo(() => clmData.filter(d => d.count > 0), [clmData]);

  // Authority bar chart data — grouped by status (Strong > Present > Zero), sorted by DA within each group
  const authorityBarData = useMemo(() => {
    if (!m3DomainsArr.length) return [];
    const sc = { verified_strong: "#22c55e", verified_present: "#fbbf24", verified_zero: "#ef4444" };
    const order = { verified_strong: 0, verified_present: 1, verified_zero: 2 };
    return [...m3DomainsArr]
      .sort((a, b) => (order[a.sirionStatus] ?? 9) - (order[b.sirionStatus] ?? 9) || (b.da || 0) - (a.da || 0))
      .map(d => ({
        name: d.domain.replace(/\.(com|org|net|io|co)$/, "").slice(0, 14),
        fullDomain: d.domain, da: d.da || 0,
        status: d.sirionStatus, fill: sc[d.sirionStatus] || "#ef4444",
      })).reverse(); // reversed for vertical layout (highest group on top)
  }, [m3DomainsArr.length]);

  // Intel data
  const intelData = ps?.intel;
  const hasIntel = !!intelData?.companyName && intelData?.researchPhase === "complete";
  const intelQCount = intelData?.questions?.length || 0;
  const intelPersonaCount = intelData?.buyerPersonas?.length || 0;
  const intelCompCount = intelData?.competitors?.length || 0;
  const intelDm = intelData?.demandMap;

  // Prioritized actions
  const actions = [];
  if (!hasIntel) actions.push({ priority: 0, text: "Research your target company to build a demand map with buyer-intent queries", mod: "Intel", action: "intel", icon: "R" });
  if (!m1.hasData) actions.push({ priority: 1, text: "Generate buyer-intent questions to fuel the entire growth engine", mod: "M1", action: "m1", icon: "1" });
  else if (!m2.hasData) actions.push({ priority: 1, text: "Run your first AI perception scan across Claude, Gemini, ChatGPT", mod: "M2", action: "m2", icon: "1" });
  if (m2.hasData && mentionRate < 50) actions.push({ priority: actions.length + 1, text: `Sirion mentioned in only ${mentionRate}% of AI responses — publish targeted content to close gaps`, mod: "M2", action: "m2", icon: String(actions.length + 1) });
  if (unresearchedPersonas.length > 0) actions.push({ priority: actions.length + 1, text: `Research ${unresearchedPersonas.length} persona(s) to unlock buying stage analysis`, mod: "M1", action: "m1", icon: String(actions.length + 1) });
  if (m1.hasData && !m4.hasData && researchedPersonas.length > 0) actions.push({ priority: actions.length + 1, text: `Analyze buying readiness for ${researchedPersonas[0]?.name || "decision maker"}`, mod: "M4", action: "m4", icon: String(actions.length + 1) });
  if (!m3.hasData) actions.push({ priority: actions.length + 1, text: "Review authority domain gaps — identify where competitors outrank Sirion", mod: "M3", action: "m3", icon: String(actions.length + 1) });
  if (actions.length === 0) actions.push({ priority: 1, text: "All systems operational — run a fresh scan to track perception changes", mod: "M2", action: "m2", icon: "1" });

  // Helpers
  const card = (extra = {}) => ({
    background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, ...extra,
  });
  const scoreColor = (val, low, mid) => val >= mid ? "#22c55e" : val >= low ? "#f59e0b" : "#ef4444";
  const emptyState = (msg, mod, color) => (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>{msg}</div>
      <button onClick={() => onNavigate(mod)} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}>
        Go to {mod.toUpperCase()}
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* ── INTEL BANNER ── */}
      {hasIntel && (
        <div onClick={() => onNavigate("intel")} style={{
          ...card({ padding: "14px 20px", marginBottom: 14, cursor: "pointer", borderLeft: `3px solid ${t.brand}` }),
          display: "flex", alignItems: "center", gap: 14, transition: "all 0.2s",
        }}>
          <span style={{
            width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, fontFamily: "var(--mono)", background: t.brand, color: "#fff",
          }}>R</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>
              {intelData.companyName}
              <span style={{ fontSize: 11, color: t.textDim, fontWeight: 400, marginLeft: 8 }}>Demand Map Ready</span>
            </div>
            <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)", marginTop: 2 }}>
              {intelCompCount} competitors · {intelPersonaCount} personas · {intelQCount} queries
              {intelDm && <span> · {intelDm.dimensions?.information || 0} info / {intelDm.dimensions?.competitive || 0} comp / {intelDm.dimensions?.authority || 0} auth</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {intelData.researchedAt && (
              <span style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)" }}>
                {fmtTime(intelData.researchedAt)}
              </span>
            )}
            <span style={{ fontSize: 11, color: t.brand, fontWeight: 600, fontFamily: "var(--mono)" }}>View Map</span>
          </div>
        </div>
      )}

      {/* ── ROW 1: SCORE CARDS WITH GAUGE ARCS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "AI Visibility", value: overallScore, max: 100, displayLabel: scanScores ? String(overallScore) : "--", color: scanScores ? scoreColor(overallScore, 30, 60) : t.textGhost, sub: scannedAt ? `Scanned ${fmtTime(scannedAt)}` : "No scan yet", action: "m2" },
          { label: "Mention Rate", value: mentionRate, max: 100, displayLabel: scanScores ? `${mentionRate}%` : "--", color: scanScores ? scoreColor(mentionRate, 30, 60) : t.textGhost, sub: scanLlms.length ? `across ${scanLlms.length} LLMs` : "Run M2 scan", action: "m2" },
          { label: "Authority Gaps", value: gapCount, max: totalDomains || 20, displayLabel: gapCount ? String(gapCount) : "--", color: gapCount > 15 ? "#ef4444" : gapCount > 8 ? "#f59e0b" : gapCount > 0 ? "#22c55e" : t.textGhost, sub: gapCount ? "zero Sirion presence" : "Run M3 analysis", action: "m3" },
          { label: "Share of Voice", value: shareOfVoice, max: 100, displayLabel: scanScores ? `${shareOfVoice}%` : "--", color: scanScores ? scoreColor(shareOfVoice, 15, 30) : t.textGhost, sub: competitorData.length ? `vs ${competitorData.length} vendors` : "vs competitors", action: "m2" },
        ].map((s, i) => (
          <div key={i} onClick={() => onNavigate(s.action)} style={{
            ...card({ padding: "14px 12px", cursor: "pointer" }), transition: "all 0.2s",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textDim, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
              {s.label}
            </div>
            <GaugeArc value={s.value} max={s.max} size={76} label={s.displayLabel} sub={s.sub} color={s.color} t={t} />
          </div>
        ))}
      </div>

      {/* ── STRATEGIC FOCUS ── */}
      {(() => {
        const postSigPct = narrativeData?.postSigPct || 0;
        const opp = gapCount > 0
          ? { desc: `Close ${gapCount} authority gaps \u2014 high-DA domains are missing Sirion presence`, go: "m3" }
          : mentionRate < 50
          ? { desc: `Increase AI mention rate from ${mentionRate}% \u2014 publish targeted CLM content`, go: "m2" }
          : { desc: "Expand persona research to unlock new buying signals", go: "m1" };
        const risk = postSigPct > 40
          ? { desc: `Post-sig framing at ${postSigPct}% \u2014 AI still sees Sirion as narrow specialist`, go: "m2" }
          : mentionRate < 30
          ? { desc: `Critical: AI mentions Sirion in only ${mentionRate}% of queries`, go: "m2" }
          : gapCount > totalDomains * 0.5
          ? { desc: "Over half of authority domains have zero Sirion presence", go: "m3" }
          : { desc: "Monitor competitive positioning \u2014 maintain current trajectory", go: "m2" };
        const up = unresearchedPersonas[0];
        const win = up
          ? { desc: `Research ${up.name} \u2014 persona intelligence ready in 2 minutes`, go: "m1" }
          : scanScores && overallScore < 60
          ? { desc: "Re-scan to track recent content impact on AI visibility", go: "m2" }
          : { desc: "Run a benchmark scan to validate 10 ground-truth questions", go: "m2" };
        const items = [
          { title: "TOP OPPORTUNITY", color: "#2dd4bf", ...opp },
          { title: "BIGGEST RISK", color: "#ef4444", ...risk },
          { title: "QUICK WIN", color: "#22c55e", ...win },
        ];
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {items.map((it, i) => (
              <div key={i} style={{ ...card({ padding: "16px 18px" }), display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${it.color}26`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: it.color }} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: it.color, letterSpacing: 1.2, fontFamily: "var(--mono)" }}>{it.title}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.textSec, lineHeight: 1.4 }}>{it.desc}</div>
                <button onClick={() => onNavigate(it.go)} style={{ alignSelf: "flex-start", marginTop: "auto", padding: "3px 12px", borderRadius: 5, border: `1px solid ${t.border}`, background: "transparent", color: t.textDim, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}>Go</button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── SCAN PROGRESS + STALENESS ── */}
      {(staleness.m2 || staleness.m3 || scanProgress) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {scanProgress && (
            <div style={{ ...card({ padding: "12px 16px" }), borderLeft: `3px solid ${t.client}`, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.client, fontFamily: "var(--mono)" }}>SCANNING</span>
              <span style={{ fontSize: 12, color: t.text }}>{scanProgress.completed} / {scanProgress.total} questions</span>
              <div style={{ flex: 1, height: 4, background: t.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((scanProgress.completed / scanProgress.total) * 100)}%`, height: "100%", background: t.client, borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            </div>
          )}
          {staleness.m2 && (
            <div style={{ ...card({ padding: "10px 16px" }), borderLeft: "3px solid #f59e0b", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>M2 scan used older questions</span>
              <span style={{ fontSize: 11, color: t.textDim }}>Re-scan recommended.</span>
            </div>
          )}
          {staleness.m3 && (
            <div style={{ ...card({ padding: "10px 16px" }), borderLeft: "3px solid #f59e0b", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>M3 analysis used older scan</span>
              <span style={{ fontSize: 11, color: t.textDim }}>Re-analyze recommended.</span>
            </div>
          )}
        </div>
      )}

      {/* ── ROW 2: THIS WEEK'S PRIORITIES ── */}
      <div style={{ ...card({ padding: "16px 20px", marginBottom: 16 }), borderLeft: `3px solid ${t.brand}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 12 }}>
          This Week's Priorities
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {actions.slice(0, 3).map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                background: i === 0 ? t.brand : "transparent",
                border: i === 0 ? "none" : `1px solid ${t.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, fontFamily: "var(--mono)",
                color: i === 0 ? "#fff" : t.textDim,
              }}>{a.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>{a.text}</div>
                <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: t.textGhost }}>{a.mod}</span>
              </div>
              <button onClick={() => onNavigate(a.action)} style={{
                padding: "5px 14px", borderRadius: 6,
                border: i === 0 ? "none" : `1px solid ${t.border}`,
                background: i === 0 ? t.brand : "transparent",
                color: i === 0 ? "#fff" : t.brand,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)", flexShrink: 0,
              }}>Go</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── ROW 3: LLM BREAKDOWN + COMPETITOR LEADERBOARD ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Left: LLM Radial Bar Chart */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.client, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8 }}>
            AI Visibility by LLM
          </div>
          {llmRadialData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={170}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="90%"
                  data={llmRadialData} startAngle={180} endAngle={0} barSize={14}>
                  <RadialBar dataKey="rate" background={{ fill: t.border }} cornerRadius={7} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (<div style={{ background: t.tooltipBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "var(--mono)" }}>
                      <div style={{ fontWeight: 700, color: t.text }}>{d.name}</div>
                      <div style={{ color: t.textDim }}>{d.rate}% mentioned ({d.mentioned}/{d.total})</div>
                    </div>);
                  }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
                {llmRadialData.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.fill }} />
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: t.textSec }}>{d.name} {d.rate}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : emptyState("Run M2 scan to see LLM data", "m2", t.client)}
        </div>

        {/* Right: Competitor Bar Chart */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8 }}>
            Competitor Leaderboard
          </div>
          {competitorChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(170, competitorChartData.length * 26 + 20)}>
              <BarChart data={competitorChartData} layout="vertical" barSize={7} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: t.textDim, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10, fill: t.textSec, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (<div style={{ background: t.tooltipBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "var(--mono)" }}>
                    <div style={{ fontWeight: 700, color: t.text }}>{d.fullName}</div>
                    <div style={{ color: t.textDim }}>{d.mentions} mentions</div>
                  </div>);
                }} />
                <Bar dataKey="mentions" radius={[0, 4, 4, 0]}>
                  {competitorChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.isSirion ? t.brand : "#f97316"} fillOpacity={entry.isSirion ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : emptyState("Run M2 scan to see competitor data", "m2", "#f97316")}
        </div>
      </div>

      {/* ── ROW 4: CLM LIFECYCLE + AUTHORITY RING ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Left: CLM Lifecycle Donut */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8 }}>
            CLM Lifecycle Coverage
          </div>
          {totalQueries > 0 ? (
            <div>
              <div style={{ position: "relative" }}>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={clmDonutData} dataKey="count" nameKey="name" cx="50%" cy="50%"
                      innerRadius={48} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                      {clmDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload;
                      const pct = totalQueries ? Math.round((d.count / totalQueries) * 100) : 0;
                      return (<div style={{ background: t.tooltipBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "var(--mono)" }}>
                        <div style={{ fontWeight: 700, color: t.text }}>{d.name}</div>
                        <div style={{ color: t.textDim }}>{d.count} queries ({pct}%)</div>
                        <div style={{ color: t.textGhost, fontSize: 10 }}>{d.desc}</div>
                      </div>);
                    }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mono)", color: t.text }}>{totalQueries}</div>
                  <div style={{ fontSize: 8, color: t.textDim, fontFamily: "var(--mono)", textTransform: "uppercase" }}>queries</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 4 }}>
                {clmData.map(d => {
                  const pct = totalQueries ? Math.round((d.count / totalQueries) * 100) : 0;
                  return (<div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: t.textSec }}>{d.name} {pct}%</span>
                  </div>);
                })}
              </div>
              {clmCounts["pre-signature"] < clmCounts["post-signature"] && (
                <div style={{ fontSize: 11, color: "#f59e0b", padding: "8px 10px", marginTop: 10, background: "#f59e0b10", borderRadius: 6, lineHeight: 1.5 }}>
                  Pre-signature coverage is low. Create content targeting pre-sign queries.
                </div>
              )}
            </div>
          ) : emptyState("Tag questions with lifecycle stages in M1", "m1", "#a78bfa")}
        </div>

        {/* Right: Authority Ring — Horizontal Bar Chart */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8 }}>
            Authority Ring Status
          </div>
          {totalDomains > 0 ? (
            <div>
              {authorityBarData.length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max(authorityBarData.length * 18 + 30, 140)}>
                  <BarChart data={authorityBarData} layout="vertical" margin={{ top: 2, right: 10, left: 2, bottom: 2 }}
                    barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke={t.border} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: t.textDim, fontFamily: "var(--mono)" }}
                      axisLine={{ stroke: t.border }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9, fill: t.textSec, fontFamily: "var(--mono)" }}
                      axisLine={false} tickLine={false} />
                    <Tooltip content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload;
                      const sl = { verified_zero: "Zero Presence", verified_present: "Present", verified_strong: "Strong" };
                      return (<div style={{ background: t.tooltipBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "var(--mono)" }}>
                        <div style={{ fontWeight: 700, color: t.text }}>{d.fullDomain}</div>
                        <div style={{ color: d.fill, fontWeight: 600 }}>{sl[d.status] || d.status}</div>
                        <div style={{ color: t.textDim }}>Domain Authority: {d.da}</div>
                      </div>);
                    }} />
                    <Bar dataKey="da" barSize={6} radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={600}>
                      {authorityBarData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {/* Legend */}
              <div style={{ display: "flex", gap: 14, marginTop: 6, marginBottom: 8 }}>
                {authorityData.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ fontSize: 10, color: t.textSec, fontFamily: "var(--mono)" }}>{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
              {/* Top gap domains */}
              {topGapDomains.length > 0 && (
                <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
                  <div style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 4 }}>TOP PRIORITY GAPS</div>
                  {topGapDomains.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: "#ef4444", width: 14 }}>{i + 1}</span>
                      <span style={{ fontSize: 11, color: t.text, flex: 1 }}>{d.domain}</span>
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: t.textDim }}>DA {d.da}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : emptyState("Run M3 analysis to see authority data", "m3", "#fbbf24")}
        </div>
      </div>

      {/* ── ROW 4.5: NARRATIVE CLASSIFICATION ── */}
      {narrativeDonutData.length > 0 && narrativeData && (
        <div style={{ ...card({ padding: "18px 20px", marginBottom: 16 }) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: narrativeData.narrativeScore >= 50 ? "#22c55e" : narrativeData.narrativeScore >= 25 ? "#f59e0b" : "#ef4444", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
              AI Narrative Classification
            </span>
            <button onClick={() => onNavigate("m2")} style={{
              padding: "4px 12px", borderRadius: 6, border: `1px solid ${t.border}`,
              background: "transparent", color: t.textSec, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)",
            }}>Details in M2</button>
          </div>
          <div style={{ fontSize: 10, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 12 }}>
            How AI frames {ps?.m2?.scanResults?.company || "Sirion"} when mentioned — the story AI tells, not just mention counts
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center" }}>
            {/* Left: Donut */}
            <div style={{ position: "relative", width: 170 }}>
              <ResponsiveContainer width={170} height={170}>
                <PieChart>
                  <Pie data={narrativeDonutData} dataKey="count" nameKey="label" cx="50%" cy="50%"
                    innerRadius={48} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                    {narrativeDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (<div style={{ background: t.tooltipBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "var(--mono)" }}>
                      <div style={{ fontWeight: 700, color: d.color }}>{d.label}</div>
                      <div style={{ color: t.textDim }}>{d.count} responses ({d.pct}%)</div>
                      <div style={{ color: t.textGhost, fontSize: 10 }}>{d.desc}</div>
                    </div>);
                  }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mono)", color: narrativeData.narrativeScore >= 50 ? "#22c55e" : narrativeData.narrativeScore >= 25 ? "#f59e0b" : "#ef4444" }}>{narrativeData.narrativeScore}</div>
                <div style={{ fontSize: 7, color: t.textDim, fontFamily: "var(--mono)", textTransform: "uppercase" }}>health</div>
              </div>
            </div>
            {/* Right: Key metrics + legend */}
            <div>
              {/* 3 key metrics */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[
                  { l: "Post-Sig Only", v: narrativeData.postSigPct, c: "#ef4444", sub: "The problem" },
                  { l: "Full-Stack", v: narrativeData.fullStackPct, c: "#22c55e", sub: "The goal" },
                  { l: "Pre-Sig", v: narrativeData.preSigPct, c: "#3b82f6", sub: "Progress" },
                ].map(m => (
                  <div key={m.l} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 6, background: m.c + "08", border: `1px solid ${m.c}15` }}>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--mono)", color: m.c }}>{m.v}%</div>
                    <div style={{ fontSize: 9, color: t.textSec }}>{m.l}</div>
                    <div style={{ fontSize: 8, color: t.textGhost }}>{m.sub}</div>
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {narrativeDonutData.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color }} />
                    <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: t.textSec }}>{d.label} {d.pct}%</span>
                  </div>
                ))}
              </div>
              {/* Insight */}
              <div style={{ fontSize: 10, color: narrativeData.postSigPct > 40 ? "#ef4444" : narrativeData.fullStackPct > 30 ? "#22c55e" : "#f59e0b", padding: "6px 8px", marginTop: 8, background: (narrativeData.postSigPct > 40 ? "#ef4444" : narrativeData.fullStackPct > 30 ? "#22c55e" : "#f59e0b") + "08", borderRadius: 5, lineHeight: 1.5 }}>
                {narrativeData.postSigPct > 40
                  ? `${narrativeData.postSigPct}% of AI responses still frame ${ps?.m2?.scanResults?.company || "Sirion"} as post-sig only. Publish full-stack content to shift the narrative.`
                  : narrativeData.fullStackPct > 30
                  ? `${narrativeData.fullStackPct}% full-stack framing achieved. Continue publishing to strengthen positioning.`
                  : `Mixed narrative — AI is uncertain about positioning. Targeted content will clarify.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ROW 5: PERSONA COVERAGE RINGS ── */}
      {m1Personas.length > 0 && (
        <div style={{ ...card({ padding: "16px 20px" }) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
              Persona Coverage
            </span>
            <button onClick={() => onNavigate("m1")} style={{
              padding: "4px 12px", borderRadius: 6, border: `1px solid ${t.border}`,
              background: "transparent", color: t.brand, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)",
            }}>View All</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center" }}>
            {m1Personas.slice(0, 6).map((p, i) => (
              <PersonaRing key={i} name={p.name} researched={Boolean(p.researchSummary)} t={t} />
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, fontFamily: "var(--mono)", color: t.textDim }}>
            {researchedPersonas.length}/{m1Personas.length} researched
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Settings Page ── */
function SettingsPage({ t }) {
  const { getDiagnostics, getSaveStatus, persistApiKeys } = usePipeline();
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem("xt_anthropic_key") || "");
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem("xt_gemini_key") || "");
  const [openaiKey, setOpenaiKey] = useState(localStorage.getItem("xt_openai_key") || "");
  const [perplexityKey, setPerplexityKey] = useState(localStorage.getItem("xt_perplexity_key") || "");
  const [grokKey, setGrokKey] = useState(localStorage.getItem("xt_grok_key") || "");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const diag = getDiagnostics();
  const saveStatus = getSaveStatus();

  const handleSave = async () => {
    const keys = { xt_anthropic_key: anthropicKey, xt_gemini_key: geminiKey, xt_openai_key: openaiKey, xt_perplexity_key: perplexityKey, xt_grok_key: grokKey };
    // 1. localStorage (immediate, browser-local)
    for (const [k, v] of Object.entries(keys)) {
      if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
    }
    // 2. Firebase (canonical, durable) — via persistApiKeys on context
    setSaveError(null);
    const ok = await persistApiKeys(keys);
    if (!ok) setSaveError("Saved to localStorage only. Firebase write failed — keys will not persist across browsers.");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inp = {
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8,
    padding: "10px 14px", color: t.text, fontSize: 13, fontFamily: "var(--mono)",
    width: "100%", outline: "none",
  };
  const label = { fontSize: 11, fontWeight: 600, color: t.textSec, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8, display: "block" };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: t.sectionNum, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)" }}>Configuration</span>
        <h2 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 800, color: t.text, letterSpacing: -0.5 }}>Global Settings</h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
          Manage API keys and platform preferences. Keys are stored in your browser.
        </p>
      </div>

      {/* API Configuration */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>API Keys</div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Anthropic API Key (Claude)</label>
          <input value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." type="password" style={inp} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Google Gemini API Key</label>
          <input value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." type="password" style={inp} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>OpenAI API Key</label>
          <input value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." type="password" style={inp} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Perplexity API Key</label>
          <input value={perplexityKey} onChange={e => setPerplexityKey(e.target.value)} placeholder="pplx-..." type="password" style={inp} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>xAI Grok API Key (Dual-Engine Research)</label>
          <input value={grokKey} onChange={e => setGrokKey(e.target.value)} placeholder="xai-..." type="password" style={inp} />
        </div>
        <button onClick={handleSave} style={{
          padding: "10px 24px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13,
          background: saved ? "#34d399" : t.brand, color: "#fff", cursor: "pointer",
          fontFamily: "var(--mono)", transition: "background 0.2s",
        }}>
          {saved ? "Saved" : "Save API Keys"}
        </button>
        {saveError && (
          <div style={{ fontSize: 11, color: "#f87171", marginTop: 8, fontFamily: "var(--mono)" }}>{saveError}</div>
        )}
        <div style={{ fontSize: 11, color: t.textDim, marginTop: 8 }}>
          Keys are saved to localStorage (immediate) and Firebase (durable, cross-browser).
        </div>
      </div>

      {/* Company Configuration */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>Company Configuration</div>
        <div style={{ fontSize: 13, color: t.textSec, lineHeight: 1.7 }}>
          Company name, URL, and industry are configured in the Question Generator (M1).
          All modules share the same company context via the pipeline.
        </div>
      </div>

      {/* Firebase Warning Banner */}
      {diag.firebaseDisabled && (
        <div style={{ background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 10, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>!</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>Firebase Disabled</div>
            <div style={{ fontSize: 11, color: "#fecaca", lineHeight: 1.5 }}>
              Data only persists in this browser. Clearing cache or switching browsers will lose all data.
              Set VITE_FIREBASE_PROJECT_ID at build time to enable durable storage.
            </div>
          </div>
        </div>
      )}

      {/* System Status */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>System Status</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Firebase", value: diag.firebaseDisabled ? "Disabled" : "Connected", color: diag.firebaseDisabled ? "#ef4444" : "#34d399" },
            { label: "Project ID", value: diag.firebase?.projectId || "(none)" },
            { label: "Data Source", value: diag.dataSource || "unknown" },
            { label: "Data Version", value: diag.dataVersion || "unknown" },
            { label: "Pipeline Doc", value: diag.pipelineDocId || "(none)" },
            { label: "Question Count", value: String(diag.questionCount || 0) },
            { label: "Firebase Docs Loaded", value: String(diag.firebase?.loadedDocs ?? 0) },
            { label: "Last Save", value: saveStatus.lastSavedAt ? new Date(saveStatus.lastSavedAt).toLocaleTimeString() : "never" },
          ].map((item, i) => (
            <div key={i} style={{ padding: "10px 0" }}>
              <div style={{ fontSize: 11, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: item.color || t.text }}>{item.value}</div>
            </div>
          ))}
        </div>
        {diag.firebase?.loadError && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#7f1d1d20", borderRadius: 6, fontSize: 11, color: "#f87171", fontFamily: "var(--mono)" }}>
            Firebase error: {diag.firebase.loadError}
          </div>
        )}
      </div>

      {/* API Key Persistence — 3-source breakdown */}
      {(() => {
        const ak = diag.apiKeys || {};
        const lsKeys = ak.localStorage || [];
        const fbKeys = ak.firebase || [];
        const envKeys = ak.envFallback || [];
        const fbDocExists = ak.firebaseDocExists;
        const envBundled = ak.envBundled;
        const onlyEnv = envKeys.length > 0 && lsKeys.length === 0 && fbKeys.length === 0;
        const noCanonical = fbKeys.length === 0 && fbDocExists === false;
        return (
          <div style={{ background: t.bgCard, border: `1px solid ${noCanonical ? "#ef4444" : t.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>API Key Sources</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {/* Firebase (canonical) */}
              <div style={{ padding: "12px", background: t.bg, borderRadius: 8, border: `1px solid ${fbKeys.length > 0 ? "#34d39940" : noCanonical ? "#ef444440" : t.border}` }}>
                <div style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)", marginBottom: 6 }}>Firebase</div>
                <div style={{ fontSize: 9, color: "#34d399", fontFamily: "var(--mono)", marginBottom: 6 }}>CANONICAL</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: fbKeys.length > 0 ? "#34d399" : "#ef4444" }}>{fbKeys.length} / 5</div>
                <div style={{ fontSize: 9, color: t.textDim, marginTop: 4 }}>
                  {fbDocExists === null ? "loading..." : fbDocExists ? "doc exists" : "doc missing (404)"}
                </div>
              </div>
              {/* localStorage (runtime) */}
              <div style={{ padding: "12px", background: t.bg, borderRadius: 8, border: `1px solid ${lsKeys.length > 0 ? "#fbbf2440" : t.border}` }}>
                <div style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)", marginBottom: 6 }}>localStorage</div>
                <div style={{ fontSize: 9, color: "#fbbf24", fontFamily: "var(--mono)", marginBottom: 6 }}>RUNTIME CACHE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: lsKeys.length > 0 ? "#fbbf24" : t.textDim }}>{lsKeys.length} / 5</div>
                <div style={{ fontSize: 9, color: t.textDim, marginTop: 4 }}>browser-local only</div>
              </div>
              {/* env fallback */}
              <div style={{ padding: "12px", background: t.bg, borderRadius: 8, border: `1px solid ${envKeys.length > 0 ? "#f9731640" : t.border}` }}>
                <div style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)", marginBottom: 6 }}>.env Fallback</div>
                <div style={{ fontSize: 9, color: "#f97316", fontFamily: "var(--mono)", marginBottom: 6 }}>DEV/BUILD ONLY</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: envKeys.length > 0 ? "#f97316" : t.textDim }}>{envKeys.length} / 5</div>
                <div style={{ fontSize: 9, color: t.textDim, marginTop: 4 }}>baked into JS bundle</div>
              </div>
            </div>
            {/* Warnings */}
            {noCanonical && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "#7f1d1d20", borderRadius: 6, border: "1px solid #ef444430" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", marginBottom: 2 }}>No canonical key storage</div>
                <div style={{ fontSize: 10, color: "#fecaca", lineHeight: 1.5 }}>
                  Firebase doc <span style={{ fontFamily: "var(--mono)" }}>app_config/api_keys</span> does not exist.
                  Click "Save API Keys" above to create it. Until then, keys exist only in this browser{envKeys.length > 0 ? " (or baked into the build)" : ""}.
                </div>
              </div>
            )}
            {envKeys.length > 0 && (
              <div style={{ marginTop: noCanonical ? 8 : 12, padding: "10px 12px", background: "#78350f20", borderRadius: 6, border: "1px solid #f9731630" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fdba74", marginBottom: 2 }}>
                  {envBundled ? "VITE_ keys in production bundle" : "VITE_ keys in dev bundle"}
                </div>
                <div style={{ fontSize: 10, color: "#fed7aa", lineHeight: 1.5 }}>
                  {envKeys.length} key{envKeys.length > 1 ? "s" : ""} from <span style={{ fontFamily: "var(--mono)" }}>.env</span> are compiled into the client JavaScript.
                  {envBundled
                    ? " Anyone inspecting the deployed site can extract them. Move keys to Firebase via Settings save, then remove from .env for production builds."
                    : " Acceptable for local development. Remove from .env before production builds to avoid leaking secrets in the client bundle."
                  }
                </div>
              </div>
            )}
            {onlyEnv && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "#7f1d1d20", borderRadius: 6, border: "1px solid #ef444430" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", marginBottom: 2 }}>Keys rely entirely on build fallback</div>
                <div style={{ fontSize: 10, color: "#fecaca", lineHeight: 1.5 }}>
                  No keys in localStorage or Firebase. The app only works because .env values are baked into the bundle.
                  This is not canonical persistence — it will break on any deploy without the same .env file.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Platform Info */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>Platform Information</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Version", value: "1.0.0" },
            { label: "Modules", value: "5 Active" },
            { label: "AI Provider", value: "Claude + Grok (Dual-Engine)" },
            { label: "Storage", value: diag.firebaseDisabled ? "localStorage only" : "Firebase + localStorage" },
          ].map((item, i) => (
            <div key={i} style={{ padding: "10px 0" }}>
              <div style={{ fontSize: 11, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Error Boundary — catches render errors in any module, shows recovery UI ── */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Module crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      const t = this.props.t || { bg: "#0f0f15", bgCard: "#1a1a2e", border: "#2a2a3e", brand: "#7c3aed", text: "#e2e8f0", textSec: "#94a3b8" };
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 16, textAlign: "center" }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Something went wrong in this module</div>
          <div style={{ fontSize: 12, color: t.textSec, maxWidth: 400, lineHeight: 1.6, fontFamily: "var(--mono)", background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 14px", wordBreak: "break-word" }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 8, padding: "8px 20px", borderRadius: 6, border: "none", background: t.brand, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Universal loading gate — blocks all modules until pipeline data arrives from Firebase ── */
function ModuleArea({ renderContent, t }) {
  const { pipeline } = usePipeline();
  if (!pipeline._loaded) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, background: t.bg }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid " + t.brand + "30", borderTopColor: t.brand, animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: t.dim, fontFamily: "var(--mono)", letterSpacing: 0.5 }}>Syncing your growth engine...</span>
      </div>
    );
  }
  return (
    <Suspense fallback={
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, background: t.bg }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid " + t.brand + "30", borderTopColor: t.brand, animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: t.dim, fontFamily: "var(--mono)", letterSpacing: 0.5 }}>Loading module...</span>
      </div>
    }>
      {renderContent()}
    </Suspense>
  );
}

/* ── Main App ── */
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [active, setActive, subTab] = useHashRouter();
  const [sbOpen, setSbOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const mob = useIsMobile();
  const t = isDark ? themes.dark : themes.light;

  useEffect(() => { if (mob) setSbOpen(false); }, [mob]);

  const renderContent = () => {
    switch (active) {
      case "intel": return <CompanyIntelligence onNavigate={setActive} />;
      case "m1": return <QuestionGenerator onNavigate={setActive} />;
      case "m2": return <PerceptionMonitor subTab={subTab} />;
      case "m3": return <AuthorityRing />;
      case "m4": return <BuyingStageGuide />;
      case "m5": return <CLMAdvisor />;
      case "settings": return <SettingsPage t={t} />;
      default: return <Dashboard t={t} onNavigate={setActive} />;
    }
  };

  return (
    <PipelineProvider>
      <ThemeContext.Provider value={t}>
        <div style={{ display: "flex", minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "var(--body)", overflow: "hidden", transition: "background 0.4s, color 0.3s" }}>
        <link href={GOOGLE_FONTS_URL} rel="stylesheet" />
        <style>{`
          :root { --body:'Inter',system-ui,-apple-system,sans-serif; --mono:'JetBrains Mono','SF Mono','Fira Code',monospace; }
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:${t.bg};transition:background 0.4s}
          ::-webkit-scrollbar{width:10px;height:10px}
          ::-webkit-scrollbar-track{background:transparent}
          ::-webkit-scrollbar-thumb{background:${t.scrollThumb};border-radius:5px}
          ::-webkit-scrollbar-thumb:hover{background:${t.scrollThumb}90}
          @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
          .fade-up{animation:fadeUp 0.35s ease-out}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
          select{appearance:auto}
          select option{background:${t.inputBg};color:${t.text}}
        `}</style>

        {/* ── SIDEBAR ── */}
        {sbOpen && (
          <div style={{
            width: mob ? "100vw" : 240, minWidth: mob ? "100vw" : 240, height: "100vh",
            position: mob ? "fixed" : "sticky", top: 0, left: 0, zIndex: 100,
            background: t.sidebar, borderRight: `1px solid ${t.sidebarBorder}`,
            display: "flex", flexDirection: "column", transition: "background 0.4s",
          }}>
            {/* Brand */}
            <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${t.sidebarBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `linear-gradient(135deg, ${t.brand}, ${t.brandDim})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, color: "#fff", fontFamily: "var(--mono)",
                }}>Xtr</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.text, letterSpacing: -0.3 }}>Xtrusio</div>
                  <div style={{ fontSize: 11, color: t.textGhost, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)" }}>Growth Engine</div>
                </div>
              </div>
            </div>

            {/* Module Nav */}
            <div style={{ padding: "12px 12px", flex: 1, overflowY: "auto" }}>
              <div style={{ fontSize: 11, color: t.textGhost, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)", padding: "8px 8px 10px" }}>
                Modules
              </div>
              {MODULES.map((mod, idx) => (
                <div key={mod.id}>
                  {mod.section === "system" && idx > 0 && (
                    <div style={{ borderTop: `1px solid ${t.sidebarBorder}`, margin: "8px 8px 10px", paddingTop: 10 }}>
                      <div style={{ fontSize: 11, color: t.textGhost, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)", padding: "0 2px 6px" }}>
                        System
                      </div>
                    </div>
                  )}
                  <button onClick={() => { setActive(mod.id); if (mob) setSbOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "10px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                      background: active === mod.id
                        ? (t.mode === "dark" ? "rgba(167,139,250,0.08)" : "rgba(124,58,237,0.06)")
                        : "transparent",
                      color: active === mod.id ? t.text : t.textDim,
                      fontSize: 13, fontWeight: active === mod.id ? 600 : 400,
                      fontFamily: "var(--body)", marginBottom: 1, textAlign: "left",
                      transition: "all 0.15s",
                    }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 5, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)",
                      background: active === mod.id ? t.brand : "transparent",
                      color: active === mod.id ? "#fff" : t.textGhost,
                      border: active === mod.id ? "none" : `1px solid ${t.border}`,
                    }}>{mod.n}</span>
                    {mod.label}
                    {mod.accent && <span style={{ marginLeft: "auto", fontSize: 11, color: t.brand, fontFamily: "var(--mono)" }}>SAMPLE</span>}
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 16px", borderTop: `1px solid ${t.sidebarBorder}`, fontSize: 11, color: t.textGhost }}>
              <div style={{ fontFamily: "var(--mono)" }}>v1.0 {"\u00B7"} 5 Modules</div>
              <div style={{ marginTop: 2 }}>AI Organic Growth Engine</div>
            </div>
          </div>
        )}

        {/* ── MAIN ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Top Bar */}
          <div style={{
            height: 50, borderBottom: `1px solid ${t.sidebarBorder}`,
            display: "flex", alignItems: "center", padding: "0 18px", gap: 12,
            flexShrink: 0, background: t.bgAlt, transition: "background 0.4s",
          }}>
            <button onClick={() => setSbOpen(!sbOpen)}
              style={{
                background: "none", border: `1px solid ${t.border}`,
                borderRadius: 5, padding: "5px 9px", color: t.textDim,
                cursor: "pointer", fontSize: 13, fontFamily: "var(--mono)",
              }}>
              {sbOpen ? "\u25C2" : "\u25B8"}
            </button>
            <span style={{ fontSize: 12, color: t.textDim, fontFamily: "var(--mono)" }}>
              {MODULES.find(m => m.id === active)?.label || "Dashboard"}
            </span>
            <div style={{ flex: 1 }} />

            {/* Theme Toggle */}
            <button onClick={() => setIsDark(!isDark)}
              style={{
                position: "relative", width: 52, height: 26, borderRadius: 13,
                background: t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                border: `1px solid ${t.border}`, cursor: "pointer", padding: 0,
              }}>
              <div style={{
                position: "absolute", top: 3, left: isDark ? 3 : 27,
                width: 18, height: 18, borderRadius: "50%", background: t.brand,
                transition: "left 0.3s cubic-bezier(0.4,0,0.2,1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#fff",
              }}>{isDark ? "\u263D" : "\u2600"}</div>
            </button>

            {/* AI Advisor toggle */}
            <button onClick={() => setChatOpen(!chatOpen)}
              style={{
                background: chatOpen ? t.brand : "none",
                border: `1px solid ${chatOpen ? t.brand : t.border}`,
                borderRadius: 7, padding: "5px 12px",
                color: chatOpen ? "#fff" : t.textDim,
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                fontFamily: "var(--mono)", letterSpacing: 0.3,
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s",
              }}>
              <span style={{ fontSize: 14 }}>AI</span>
              <span>Advisor</span>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>Live</span>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", padding: mob ? 16 : "32px 40px", display: "flex", flexDirection: "column" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", flex: 1 }}>
              <div className="fade-up" key={active} style={{ height: "100%" }}>
                <ErrorBoundary t={t}>
                  <ModuleArea renderContent={renderContent} t={t} />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </div>
        {/* AI Strategy Advisor drawer */}
        <Suspense fallback={null}>
          <StrategyAdvisor open={chatOpen} onClose={() => setChatOpen(false)} />
        </Suspense>
      </ThemeContext.Provider>
    </PipelineProvider>
  );
}

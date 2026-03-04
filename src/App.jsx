import { useState, useEffect, useMemo, Component, lazy, Suspense } from "react";
import { themes, ThemeContext } from "./ThemeContext";
import { PipelineProvider, usePipeline } from "./PipelineContext";
import { GOOGLE_FONTS_URL } from "./typography";
import { PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// BUG-009 fix: lazy-load heavy module components for code splitting
const QuestionGenerator = lazy(() => import("./QuestionGenerator"));
const PerceptionMonitor = lazy(() => import("./PerceptionMonitor"));
const AuthorityRing = lazy(() => import("./AuthorityRing"));
const BuyingStageGuide = lazy(() => import("./BuyingStageGuide"));
const CLMAdvisor = lazy(() => import("./CLMAdvisor"));
const StrategyAdvisor = lazy(() => import("./StrategyAdvisor"));


/* ═══════════════════════════════════════════════════════
   XTRUSIO — AI Organic Growth Engine
   App Shell: Sidebar navigation, theme toggle, module rendering
   Design system adapted from competitive-intel-product.jsx
   ═══════════════════════════════════════════════════════ */

const MODULES = [
  { id: "home", n: "0", label: "Dashboard", icon: "\u25C9" },
  { id: "m1", n: "1", label: "Question Generator", icon: "\u2753" },
  { id: "m2", n: "2", label: "Perception Monitor", icon: "\uD83D\uDD2D" },
  { id: "m3", n: "3", label: "Authority Ring", icon: "\u25CE" },
  { id: "m4", n: "4", label: "Buying Stage Guide", icon: "\uD83E\uDDED" },
  { id: "m5", n: "5", label: "CLM Advisor", icon: "\u26A1" },
  { id: "settings", n: "\u2699", label: "Settings", section: "system" },
];

const useIsMobile = () => {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 900); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  return m;
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

  // CLM lifecycle breakdown
  const clmCounts = { "pre-signature": 0, "post-signature": 0, "full-stack": 0 };
  scanResultsArr.forEach(r => { const lc = r.lifecycle || "full-stack"; if (clmCounts[lc] !== undefined) clmCounts[lc]++; });
  const totalQueries = scanResultsArr.length;
  const clmData = [
    { name: "Pre-Signature", count: clmCounts["pre-signature"], color: "#3b82f6", desc: "Authoring, templates, redlining" },
    { name: "Post-Signature", count: clmCounts["post-signature"], color: "#10b981", desc: "Obligations, compliance, renewals" },
    { name: "Full-Stack", count: clmCounts["full-stack"], color: "#a78bfa", desc: "End-to-end platform, analytics" },
  ];

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

  // Prioritized actions
  const actions = [];
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

      {/* ── ROW 1: SCORE CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          {
            label: "AI Visibility",
            value: scanScores ? overallScore : "--",
            unit: "/ 100",
            color: scanScores ? scoreColor(overallScore, 30, 60) : t.textGhost,
            sub: scannedAt ? `Scanned ${fmtTime(scannedAt)}` : "No scan yet",
            action: "m2",
          },
          {
            label: "Mention Rate",
            value: scanScores ? `${mentionRate}%` : "--",
            unit: "",
            color: scanScores ? scoreColor(mentionRate, 30, 60) : t.textGhost,
            sub: scanLlms.length ? `across ${scanLlms.length} LLMs` : "Run M2 scan",
            action: "m2",
          },
          {
            label: "Authority Gaps",
            value: gapCount || "--",
            unit: gapCount ? "domains" : "",
            color: gapCount > 15 ? "#ef4444" : gapCount > 8 ? "#f59e0b" : gapCount > 0 ? "#22c55e" : t.textGhost,
            sub: gapCount ? "zero Sirion presence" : "Run M3 analysis",
            action: "m3",
          },
          {
            label: "Share of Voice",
            value: scanScores ? `${shareOfVoice}%` : "--",
            unit: "",
            color: scanScores ? scoreColor(shareOfVoice, 15, 30) : t.textGhost,
            sub: competitorData.length ? `vs ${competitorData.length} vendors` : "vs competitors",
            action: "m2",
          },
        ].map((s, i) => (
          <div key={i} onClick={() => onNavigate(s.action)} style={{
            ...card({ padding: "16px 18px", cursor: "pointer", borderLeft: `3px solid ${s.color}` }),
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textDim, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8 }}>
              {s.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--mono)", color: s.color, lineHeight: 1 }}>
                {s.value}
              </span>
              {s.unit && <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>{s.unit}</span>}
            </div>
            <div style={{ fontSize: 10, color: t.textSec, marginTop: 6, fontFamily: "var(--mono)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

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
        {/* Left: LLM Breakdown */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.client, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 14 }}>
            AI Visibility by LLM
          </div>
          {llmData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {llmData.map(d => (
                <div key={d.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{d.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color: scoreColor(d.rate, 30, 60) }}>{d.rate}%</span>
                  </div>
                  <div style={{ height: 8, background: t.border, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${d.rate}%`, height: "100%", background: scoreColor(d.rate, 30, 60), borderRadius: 4, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: t.textDim, fontFamily: "var(--mono)", marginTop: 2 }}>
                    mentioned in {d.mentioned}/{d.total} queries
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: t.textDim, fontFamily: "var(--mono)", borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
                {totalQueries} queries across {scanLlms.length} LLMs
              </div>
            </div>
          ) : emptyState("Run M2 scan to see LLM data", "m2", t.client)}
        </div>

        {/* Right: Competitor Leaderboard */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 14 }}>
            Competitor Leaderboard
          </div>
          {competitorData.length > 0 ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px 50px", gap: 4, padding: "0 0 6px", borderBottom: `1px solid ${t.border}` }}>
                <span style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)" }}>#</span>
                <span style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)" }}>VENDOR</span>
                <span style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)", textAlign: "right" }}>MENTIONS</span>
                <span style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)", textAlign: "right" }}>TOP 3</span>
              </div>
              {competitorData.slice(0, 6).map((c, i) => {
                const isSirion = c.name.toLowerCase().includes("sirion");
                return (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "24px 1fr 60px 50px", gap: 4,
                    padding: "7px 4px", borderBottom: `1px solid ${t.border}22`,
                    background: isSirion ? t.brand + "10" : "transparent",
                    borderRadius: isSirion ? 4 : 0, marginTop: 2,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: t.textDim }}>{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: isSirion ? 700 : 500, color: isSirion ? t.brand : t.text }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color: t.text, textAlign: "right" }}>{c.mentions}</span>
                    <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: t.textSec, textAlign: "right" }}>{c.top3}</span>
                  </div>
                );
              })}
            </div>
          ) : emptyState("Run M2 scan to see competitor data", "m2", "#f97316")}
        </div>
      </div>

      {/* ── ROW 4: CLM LIFECYCLE + AUTHORITY RING ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Left: CLM Lifecycle */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 14 }}>
            CLM Lifecycle Coverage
          </div>
          {totalQueries > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {clmData.map(d => {
                const pct = totalQueries ? Math.round((d.count / totalQueries) * 100) : 0;
                return (
                  <div key={d.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color: d.color }}>{pct}%</span>
                    </div>
                    <div style={{ height: 8, background: t.border, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: d.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ fontSize: 10, color: t.textDim, marginTop: 2, fontFamily: "var(--mono)" }}>
                      {d.count}/{totalQueries} queries · {d.desc}
                    </div>
                  </div>
                );
              })}
              {clmCounts["pre-signature"] < clmCounts["post-signature"] && (
                <div style={{ fontSize: 11, color: "#f59e0b", padding: "8px 10px", background: "#f59e0b10", borderRadius: 6, lineHeight: 1.5 }}>
                  Pre-signature coverage is low. Create content targeting pre-sign queries to expand Sirion's perception beyond post-signature.
                </div>
              )}
            </div>
          ) : emptyState("Tag questions with lifecycle stages in M1", "m1", "#a78bfa")}
        </div>

        {/* Right: Authority Ring Status */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 14 }}>
            Authority Ring Status
          </div>
          {totalDomains > 0 ? (
            <div>
              {/* Stacked horizontal bar */}
              <div style={{ height: 28, display: "flex", borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                {authorityData.filter(d => d.value > 0).map(d => (
                  <div key={d.name} style={{
                    width: `${(d.value / totalDomains) * 100}%`, background: d.color,
                    display: "flex", alignItems: "center", justifyContent: "center", minWidth: 20,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "var(--mono)" }}>{d.value}</span>
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                {authorityData.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ fontSize: 10, color: t.textSec, fontFamily: "var(--mono)" }}>{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
              {/* Top gap domains */}
              {topGapDomains.length > 0 && (
                <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 10, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 6 }}>TOP PRIORITY GAPS</div>
                  {topGapDomains.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: "#ef4444", width: 16 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: t.text, flex: 1 }}>{d.domain}</span>
                      <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: t.textDim }}>DA {d.da}</span>
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: t.textGhost, background: t.border + "60", padding: "1px 6px", borderRadius: 3 }}>
                        P{Math.round(d.priority || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : emptyState("Run M3 analysis to see authority data", "m3", "#fbbf24")}
        </div>
      </div>

      {/* ── ROW 5: PERSONA COVERAGE ── */}
      {m1Personas.length > 0 && (
        <div style={{ ...card({ padding: "16px 20px" }) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
              Persona Coverage ({m1Personas.length})
            </span>
            <button onClick={() => onNavigate("m1")} style={{
              padding: "4px 12px", borderRadius: 6, border: `1px solid ${t.border}`,
              background: "transparent", color: t.brand, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)",
            }}>View All</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {m1Personas.slice(0, 6).map((p, i) => (
              <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: t.bgAlt, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.researchSummary ? "#22c55e" : "#f59e0b", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: t.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || p.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Settings Page ── */
function SettingsPage({ t }) {
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem("xt_anthropic_key") || "");
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem("xt_gemini_key") || "");
  const [openaiKey, setOpenaiKey] = useState(localStorage.getItem("xt_openai_key") || "");
  const [perplexityKey, setPerplexityKey] = useState(localStorage.getItem("xt_perplexity_key") || "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (anthropicKey) localStorage.setItem("xt_anthropic_key", anthropicKey); else localStorage.removeItem("xt_anthropic_key");
    if (geminiKey) localStorage.setItem("xt_gemini_key", geminiKey); else localStorage.removeItem("xt_gemini_key");
    if (openaiKey) localStorage.setItem("xt_openai_key", openaiKey); else localStorage.removeItem("xt_openai_key");
    if (perplexityKey) localStorage.setItem("xt_perplexity_key", perplexityKey); else localStorage.removeItem("xt_perplexity_key");
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
        <button onClick={handleSave} style={{
          padding: "10px 24px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13,
          background: saved ? "#34d399" : t.brand, color: "#fff", cursor: "pointer",
          fontFamily: "var(--mono)", transition: "background 0.2s",
        }}>
          {saved ? "Saved" : "Save API Keys"}
        </button>
        <div style={{ fontSize: 11, color: t.textDim, marginTop: 8 }}>
          Keys are stored in your browser's localStorage. They never leave your device.
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

      {/* Platform Info */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>Platform Information</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Version", value: "1.0.0" },
            { label: "Modules", value: "5 Active" },
            { label: "AI Provider", value: "Claude (Anthropic)" },
            { label: "Storage", value: "IndexedDB + Firebase" },
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
  const [active, setActive] = useState("home");
  const [sbOpen, setSbOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const mob = useIsMobile();
  const t = isDark ? themes.dark : themes.light;

  useEffect(() => { if (mob) setSbOpen(false); }, [mob]);

  const renderContent = () => {
    switch (active) {
      case "m1": return <QuestionGenerator onNavigate={setActive} />;
      case "m2": return <PerceptionMonitor />;
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
          ::-webkit-scrollbar{width:4px;height:4px}
          ::-webkit-scrollbar-track{background:transparent}
          ::-webkit-scrollbar-thumb{background:${t.scrollThumb};border-radius:2px}
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

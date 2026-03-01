import { useState, useEffect, useMemo } from "react";
import { themes, ThemeContext } from "./ThemeContext";
import { PipelineProvider, usePipeline } from "./PipelineContext";
import { GOOGLE_FONTS_URL } from "./typography";
import { PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import QuestionGenerator from "./QuestionGenerator";
import PerceptionMonitor from "./PerceptionMonitor";
import AuthorityRing from "./AuthorityRing";
import BuyingStageGuide from "./BuyingStageGuide";
import CLMAdvisor from "./CLMAdvisor";
import VisualDemo from "./VisualDemo";

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
  { id: "demo", n: "\u25B6", label: "Visual Demo", accent: true },
];

const useIsMobile = () => {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 900); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  return m;
};

/* ── Dashboard — Sirion Growth Command Center ── */
function Dashboard({ t, onNavigate }) {
  const { getStatus, pipeline: ps } = usePipeline();
  const status = getStatus();

  const fmtTime = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return null; }
  };

  const m1 = status.m1 || {};
  const m2 = status.m2 || {};
  const m3 = status.m3 || {};
  const m4 = status.m4 || {};
  const m5 = status.m5 || {};

  const m1Personas = ps?.m1?.personaProfiles || [];
  const researchedPersonas = m1Personas.filter(p => p.researchSummary);
  const unresearchedPersonas = m1Personas.filter(p => !p.researchSummary);

  // M2 scan data
  const scanScores = ps?.m2?.scores || null;
  const mentionRate = scanScores?.mention || 0;
  const overallScore = scanScores?.overall || 0;

  // CLM lifecycle breakdown from scan results
  const scanResultsRaw = ps?.m2?.scanResults?.results;
  const scanResultsArr = Array.isArray(scanResultsRaw) ? scanResultsRaw : [];
  const clmCounts = { "pre-signature": 0, "post-signature": 0, "full-stack": 0 };
  scanResultsArr.forEach(r => { const lc = r.lifecycle || "full-stack"; if (clmCounts[lc] !== undefined) clmCounts[lc]++; });

  // M3 Authority Ring domain stats for charts
  const m3Domains = ps?.m3?.domains;
  const m3DomainsArr = Array.isArray(m3Domains) ? m3Domains : (m3Domains && typeof m3Domains === "object" ? Object.values(m3Domains) : []);

  // Authority domain status breakdown for pie chart
  const domainStatusData = useMemo(() => {
    if (!m3DomainsArr.length) return [
      { name: "Zero Presence", value: 14, color: "#ef4444" },
      { name: "Present/Wrong", value: 8, color: "#fbbf24" },
      { name: "Strong", value: 5, color: "#22c55e" },
    ];
    const z = m3DomainsArr.filter(d => d.sirionStatus === "verified_zero").length;
    const s = m3DomainsArr.filter(d => d.sirionStatus === "strong_presence").length;
    const p = m3DomainsArr.length - z - s;
    return [
      { name: "Zero Presence", value: z, color: "#ef4444" },
      { name: "Present/Wrong", value: p, color: "#fbbf24" },
      { name: "Strong", value: s, color: "#22c55e" },
    ];
  }, [m3DomainsArr.length]);

  // Per-LLM mention rates for radar chart
  const llmRadarData = useMemo(() => {
    if (!scanResultsArr.length) return [
      { llm: "Claude", rate: 0 }, { llm: "Gemini", rate: 0 }, { llm: "ChatGPT", rate: 0 },
    ];
    const llms = ps?.m2?.scanResults?.llms || ["claude", "gemini", "chatgpt"];
    const llmNames = { claude: "Claude", gemini: "Gemini", chatgpt: "ChatGPT", "gpt-4o": "ChatGPT" };
    return llms.map(lid => {
      let mentioned = 0, total = 0;
      scanResultsArr.forEach(r => {
        // Support compact format (r.mentions) and legacy format (r.analyses)
        if (r.mentions) {
          total++;
          if (r.mentions[lid]) mentioned++;
        } else {
          const a = r.analyses?.[lid];
          if (a && !a._error) { total++; if (a.mentioned) mentioned++; }
        }
      });
      return { llm: llmNames[lid] || lid, rate: total ? Math.round((mentioned / total) * 100) : 0 };
    });
  }, [scanResultsArr.length]);

  // CLM lifecycle chart data
  const clmChartData = useMemo(() => [
    { name: "Pre-Signature", count: clmCounts["pre-signature"], color: "#3b82f6" },
    { name: "Post-Signature", count: clmCounts["post-signature"], color: "#10b981" },
    { name: "Full-Stack", count: clmCounts["full-stack"], color: "#a78bfa" },
  ], [clmCounts]);

  // Domain priority distribution for bar chart
  const domainPriorityData = useMemo(() => {
    const buckets = [
      { range: "90-100", min: 90, max: 101, color: "#ef4444" },
      { range: "80-89", min: 80, max: 90, color: "#f97316" },
      { range: "70-79", min: 70, max: 80, color: "#fbbf24" },
      { range: "60-69", min: 60, max: 70, color: "#22c55e" },
      { range: "<60", min: 0, max: 60, color: "#6b7280" },
    ];
    const src = m3DomainsArr.length ? m3DomainsArr : [];
    return buckets.map(b => ({
      range: b.range, count: src.filter(d => (d.priorityScore || 0) >= b.min && (d.priorityScore || 0) < b.max).length, color: b.color,
    }));
  }, [m3DomainsArr.length]);

  // Tooltip style
  const tipStyle = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)" };

  // Pipeline flow scoring
  const pipelineStages = [
    { label: "Questions", done: m1.hasData, count: m1.count || 0, action: "m1", color: t.brand },
    { label: "AI Scans", done: m2.hasData, count: m2.count || 0, action: "m2", color: t.client },
    { label: "Authority", done: m3.hasData, count: m3.count || 0, action: "m3", color: "#fbbf24" },
    { label: "Buyers", done: m4.hasData, count: m4.count || 0, action: "m4", color: "#4ade80" },
    { label: "Advisor", done: m5.hasData, count: m5.count || 0, action: "m5", color: "#fb923c" },
  ];
  const completedStages = pipelineStages.filter(s => s.done).length;

  // Build prioritized actions
  const actions = [];
  if (!m1.hasData) actions.push({ priority: 1, text: "Generate buyer-intent questions to fuel the entire growth engine", mod: "M1", action: "m1", icon: "1" });
  else if (!m2.hasData) actions.push({ priority: 1, text: "Run your first AI perception scan across Claude, Gemini, ChatGPT", mod: "M2", action: "m2", icon: "1" });
  if (m2.hasData && mentionRate < 50) actions.push({ priority: actions.length + 1, text: `Sirion mentioned in only ${mentionRate}% of AI responses — publish targeted content to close gaps`, mod: "M2", action: "m2", icon: String(actions.length + 1) });
  if (unresearchedPersonas.length > 0) actions.push({ priority: actions.length + 1, text: `Research ${unresearchedPersonas.length} persona(s) to unlock buying stage analysis`, mod: "M1", action: "m1", icon: String(actions.length + 1) });
  if (m1.hasData && !m4.hasData && researchedPersonas.length > 0) actions.push({ priority: actions.length + 1, text: `Analyze buying readiness for ${researchedPersonas[0]?.name || "decision maker"}`, mod: "M4", action: "m4", icon: String(actions.length + 1) });
  if (!m3.hasData) actions.push({ priority: actions.length + 1, text: "Review authority domain gaps — identify where competitors outrank Sirion", mod: "M3", action: "m3", icon: String(actions.length + 1) });
  if (actions.length === 0) actions.push({ priority: 1, text: "All systems operational — run a fresh scan to track perception changes", mod: "M2", action: "m2", icon: "1" });

  // Card style helper
  const card = (extra = {}) => ({
    background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, ...extra,
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.sectionNum, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)" }}>Command Center</span>
        </div>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: t.text, lineHeight: 1.2, letterSpacing: -0.5 }}>
          Sirion Growth Intelligence
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
          AI-powered organic growth platform. Pipeline status, competitive intelligence, and prioritized actions.
        </p>
      </div>

      {/* ── Pipeline Flow ── */}
      <div style={{ ...card({ padding: "18px 24px", marginBottom: 16 }) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
            Growth Pipeline
          </span>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: completedStages === 5 ? t.green : t.textDim }}>
            {completedStages}/5 stages active
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {pipelineStages.map((stage, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
              <div
                onClick={() => onNavigate(stage.action)}
                style={{
                  flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 8, cursor: "pointer",
                  background: stage.done ? stage.color + "12" : "transparent",
                  border: `1px solid ${stage.done ? stage.color + "40" : t.border}`,
                  transition: "all 0.2s",
                }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--mono)", color: stage.done ? stage.color : t.textGhost, lineHeight: 1 }}>
                  {stage.done ? stage.count : "--"}
                </div>
                <div style={{ fontSize: 11, color: stage.done ? t.textSec : t.textGhost, marginTop: 3, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {stage.label}
                </div>
              </div>
              {i < pipelineStages.length - 1 && (
                <div style={{ padding: "0 4px", color: stage.done ? stage.color : t.textGhost, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {"\u2192"}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Competitive Alert (when scan data exists) ── */}
      {scanScores && (
        <div style={{
          ...card({
            borderLeft: `3px solid ${mentionRate < 30 ? t.red : mentionRate < 60 ? t.orange : t.green}`,
            padding: "16px 20px", marginBottom: 16,
          }),
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: mentionRate < 30 ? t.red : t.orange, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
              {mentionRate < 30 ? "Competitive Alert" : mentionRate < 60 ? "Visibility Gap" : "Tracking Status"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--mono)", color: mentionRate < 30 ? t.red : mentionRate < 60 ? t.orange : t.green }}>
                {mentionRate}%
              </span>
              <span style={{ fontSize: 12, color: t.textSec, marginLeft: 6 }}>AI mention rate</span>
            </div>
            <div style={{ width: 1, height: 28, background: t.border }} />
            <div>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--mono)", color: t.text }}>{overallScore}</span>
              <span style={{ fontSize: 12, color: t.textSec, marginLeft: 6 }}>visibility score</span>
            </div>
            <div style={{ width: 1, height: 28, background: t.border }} />
            <div style={{ fontSize: 12, color: t.textSec, lineHeight: 1.6, flex: 1, minWidth: 200 }}>
              {mentionRate === 0
                ? "Sirion is not being mentioned by any AI platform. Buyers asking about CLM are getting competitor recommendations."
                : mentionRate < 30
                  ? "Sirion appears in less than a third of AI responses. Competitors are dominating the narrative."
                  : mentionRate < 60
                    ? "Sirion has moderate visibility but significant gaps remain. Targeted content can close the gap."
                    : "Sirion has strong AI presence. Focus on maintaining position and expanding to new queries."}
            </div>
          </div>
        </div>
      )}

      {/* ── This Week's Priorities ── */}
      <div style={{
        ...card({ padding: "16px 20px", marginBottom: 16 }),
        borderLeft: `3px solid ${t.brand}`,
      }}>
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
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                flexShrink: 0,
              }}>Go</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Module Health Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        {[
          {
            n: "M1", key: "m1", label: "Question Generator", color: t.brand,
            value: m1.hasData ? m1.count : "--", unit: "questions",
            sub: m1.hasData
              ? `${m1Personas.length} personas, ${researchedPersonas.length} researched`
              : "Generates buyer-intent questions for all personas",
          },
          {
            n: "M2", key: "m2", label: "Perception Monitor", color: t.client,
            value: m2.hasData ? (scanScores?.overall || 0) : "--", unit: m2.hasData ? "/ 100 score" : "scans",
            sub: m2.hasData
              ? `${mentionRate}% mention | Pre-Sig: ${clmCounts["pre-signature"]} | Post-Sig: ${clmCounts["post-signature"]} | Full-Stack: ${clmCounts["full-stack"]}`
              : "Scans Claude, Gemini, ChatGPT for brand mentions",
          },
          {
            n: "M3", key: "m3", label: "Authority Ring", color: "#fbbf24",
            value: m3.hasData ? m3.count : "45+", unit: "domains",
            sub: m3.hasData
              ? "Backlink intelligence mapped"
              : "Pre-loaded with 45+ verified authority domains",
          },
          {
            n: "M4", key: "m4", label: "Buying Stage Guide", color: "#4ade80",
            value: m4.hasData ? m4.count : "--", unit: "analyses",
            sub: m4.hasData
              ? "Decision maker readiness tracked"
              : "Analyzes buying readiness from LinkedIn + research",
          },
          {
            n: "M5", key: "m5", label: "CLM Advisor", color: "#fb923c",
            value: "15", unit: "vendors",
            sub: m5.hasData
              ? "Recommendations generated"
              : "Personalized vendor comparison engine",
          },
        ].map((m, i) => (
          <div key={i} onClick={() => onNavigate(m.key)}
            style={{
              ...card({ padding: "16px 18px", cursor: "pointer", borderTop: `2px solid ${m.color}` }),
              transition: "all 0.2s",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)",
                color: m.color, background: m.color + "15", padding: "2px 6px", borderRadius: 4,
              }}>{m.n}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{m.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--mono)", color: m.color, lineHeight: 1 }}>
                {m.value}
              </span>
              <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>{m.unit}</span>
            </div>
            <div style={{ fontSize: 11, color: t.textSec, lineHeight: 1.5 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Analytics Charts ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* AI Visibility by LLM — Radar Chart */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.client, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 12 }}>
            AI Visibility by LLM
          </div>
          {llmRadarData.some(d => d.rate > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={llmRadarData} cx="50%" cy="50%" outerRadius={70}>
                <PolarGrid stroke={t.border} />
                <PolarAngleAxis dataKey="llm" tick={{ fontSize: 11, fill: t.textSec, fontFamily: "var(--mono)" }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: t.textDim }} />
                <Radar name="Mention %" dataKey="rate" stroke={t.client} fill={t.client} fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>&#x1F50D;</div>
              <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>Run M2 scan to populate</div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 6 }}>
            {llmRadarData.map(d => (
              <div key={d.llm} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--mono)", color: d.rate > 0 ? t.client : t.textGhost }}>{d.rate}%</div>
                <div style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)" }}>{d.llm}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Authority Domain Status — Donut Chart */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 12 }}>
            Authority Domain Status
          </div>
          <div style={{ position: "relative" }}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={domainStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                  {domainStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} formatter={(v, n) => [`${v} domains`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--mono)", color: t.text }}>{domainStatusData.reduce((s, d) => s + d.value, 0)}</div>
              <div style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)" }}>DOMAINS</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 4 }}>
            {domainStatusData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: 10, color: t.textSec, fontFamily: "var(--mono)" }}>{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: CLM Lifecycle + Domain Priority Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* CLM Lifecycle Distribution */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 12 }}>
            CLM Lifecycle Coverage
          </div>
          {scanResultsArr.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={clmChartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid stroke={t.border} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: t.textDim, fontFamily: "var(--mono)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: t.textSec, fontFamily: "var(--mono)" }} width={75} />
                <Tooltip contentStyle={tipStyle} formatter={v => [`${v} queries`]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {clmChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>Export questions with lifecycle tags to see data</div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8 }}>
            {clmChartData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />
                <span style={{ fontSize: 10, color: t.textSec, fontFamily: "var(--mono)" }}>{d.name}: {d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Domain Priority Distribution */}
        <div style={{ ...card({ padding: "18px 20px" }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 12 }}>
            Domain Priority Distribution
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={domainPriorityData} margin={{ left: 5, right: 5, top: 5, bottom: 5 }}>
              <CartesianGrid stroke={t.border} vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: t.textDim, fontFamily: "var(--mono)" }} />
              <YAxis tick={{ fontSize: 10, fill: t.textDim, fontFamily: "var(--mono)" }} allowDecimals={false} />
              <Tooltip contentStyle={tipStyle} formatter={v => [`${v} domains`]} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {domainPriorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: t.textDim, fontFamily: "var(--mono)", textAlign: "center", marginTop: 6 }}>
            Priority score ranges (higher = more urgent)
          </div>
        </div>
      </div>

      {/* ── Persona Intelligence ── */}
      {m1Personas.length > 0 && (
        <div style={{ ...card({ padding: 20 }) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)" }}>
              Persona Intelligence ({m1Personas.length})
            </span>
            <button onClick={() => onNavigate("m1")} style={{
              padding: "4px 12px", borderRadius: 6, border: `1px solid ${t.border}`,
              background: "transparent", color: t.brand, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--mono)",
            }}>View All</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {m1Personas.slice(0, 6).map((p, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: t.bgAlt, border: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: t.textSec }}>{p.title}</div>
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>{p.company}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.researchSummary ? t.green : t.yellow }} />
                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: p.researchSummary ? t.green : t.yellow }}>
                    {p.researchSummary ? "Researched" : "Pending"}
                  </span>
                  {p.clmReadiness && (
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: t.client, marginLeft: "auto" }}>
                      CLM {p.clmReadiness}/10
                    </span>
                  )}
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
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ANTHROPIC_API_KEY ? "\u2022".repeat(20) : "");
  const [firebaseProject, setFirebaseProject] = useState(import.meta.env.VITE_FIREBASE_PROJECT_ID || "");

  const inp = {
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8,
    padding: "10px 14px", color: t.text, fontSize: 13, fontFamily: "var(--body)",
    width: "100%", outline: "none",
  };
  const label = { fontSize: 11, fontWeight: 600, color: t.textSec, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "var(--mono)", marginBottom: 8, display: "block" };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: t.sectionNum, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)" }}>Configuration</span>
        <h2 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 800, color: t.text, letterSpacing: -0.5 }}>Global Settings</h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
          Manage API keys, Firebase connection, and platform preferences.
        </p>
      </div>

      {/* API Configuration */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 16 }}>API Configuration</div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Anthropic API Key</label>
          <input value={apiKey} readOnly style={{ ...inp, color: t.textDim }} />
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>Configured via .env file (VITE_ANTHROPIC_API_KEY)</div>
        </div>
        <div>
          <label style={label}>Firebase Project ID</label>
          <input value={firebaseProject} readOnly style={{ ...inp, color: t.textDim }} />
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>Configured via .env file (VITE_FIREBASE_PROJECT_ID)</div>
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
  return renderContent();
}

/* ── Main App ── */
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [active, setActive] = useState("home");
  const [sbOpen, setSbOpen] = useState(true);
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
      case "demo": return <VisualDemo />;
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

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>Live</span>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", padding: mob ? 16 : "32px 40px", display: "flex", flexDirection: "column" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", flex: 1 }}>
              <div className="fade-up" key={active} style={{ height: "100%" }}>
                <ModuleArea renderContent={renderContent} t={t} />
              </div>
            </div>
          </div>
        </div>
      </div>
      </ThemeContext.Provider>
    </PipelineProvider>
  );
}

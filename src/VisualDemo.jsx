import { useState, useRef } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";

/* ═══ DESIGN TOKENS ═══ */
const T = {
  bg: "#070C10", surface: "#0F1820", card: "#131E28",
  border: "rgba(45,212,191,0.10)", text: "#F0F4F8",
  muted: "rgba(255,255,255,0.70)", dim: "rgba(255,255,255,0.40)",
  blue: "#38BDF8", gold: "#FBBF24", green: "#2DD4BF",
  red: "#F87171", purple: "#A78BFA", orange: "#FB923C", cyan: "#22D3EE",
  teal: "#14B8A6", tealGlow: "#2DD4BF",
  h: "'Sora',sans-serif", b: "'DM Sans',sans-serif", m: "'JetBrains Mono',monospace"
};
const tip = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontFamily: T.b, color: T.text, padding: "8px 12px" };

/* ═══ SAMPLE DATA — AbbVie (Short signals!) ═══ */
const DATA = {
  dm: { name: "Sanjeev Ishwar", title: "Chief Procurement Officer", company: "AbbVie Inc.", location: "Greater Chicago Area", tenure: "3 years 2 months", certs: ["PhD Chemical Engineering"], activity: ["Top 100 Procurement Leaders award", "Active team building posts", "Strategic engagement on M&A"], summary: "Visionary procurement leader managing $14B addressable spend with 400+ professionals. PhD background + pharma domain expertise = technical depth + strategic vision. Perfect CLM profile." },
  co: { industry: "Biopharmaceuticals", revenue: "$58.1B", employees: "~56,000", global: "170+ markets", news: "30+ M&A deals since 2024 including $175M manufacturing facility." },
  analysis: {
    tech_stack: { score: 7, findings: "SAP ecosystem with Workday detected. No enterprise CLM platform found — DocuSign only.", signals: ["SAP Ariba Ecosystem", "Workday Adoption", "$1.1B Annual ICT Spend", "No CLM Platform", "DocuSign Only"] },
    hiring: { score: 7, findings: "Procurement intern role mentions 'AI in procurement analytics.' Operations Excellence role active.", signals: ["AI Procurement Intern (2026)", "Ops Excellence Director", "Legal Academy + AI Focus", "Team Expansion Underway"] },
    digital: { score: 8, findings: "30+ M&A deals create massive contract complexity. Active digital transformation with AI and cloud.", signals: ["30+ M&A Integrations", "Digital Transformation Active", "Custom LLM Development", "Accenture Partnership", "Data-Driven Leadership"] },
    competitor: { score: 6, findings: "BMS (previous employer) uses Icertis actively. No evidence of Ironclad or Agiloft at AbbVie.", signals: ["BMS Uses Icertis CLM", "No Current CLM at AbbVie", "SAP Ariba (No CLM Module)", "AbbVie Mentioned Icertis 2020"] },
    dm_signals: { score: 8, findings: "Came from BMS (Icertis user). Top 100 Procurement Leader. Managing $14B spend = enterprise CLM use case.", signals: ["Ex-BMS (Icertis User)", "$14B Spend Under Management", "Top 100 Procurement Leader", "3yr Tenure = Ready to Invest", "PhD Technical Background"] }
  },
  stages: { awareness: 3, consideration: 8, discovery: 5 },
  primary: "consideration", confidence: "high", readiness: 7.8,
  hook: "Sanjeev, congratulations on your Top 100 Procurement Leaders recognition! Given your experience with enterprise CLM at BMS, I imagine you're seeing similar contract complexity at AbbVie with 30+ M&A deals and $14B in spend.",
  actions: [
    "Lead with transformation angle — his LinkedIn emphasizes it",
    "Reference BMS/Icertis experience as familiar ground",
    "Leverage 30+ M&A pain point for contract chaos narrative",
    "Connect with AI procurement hiring as receptivity signal",
    "Use Top 100 recognition as ice-breaker opening"
  ],
  risks: [
    "Possible existing Icertis loyalty from BMS days",
    "SAP Ariba pressure to use SAP CLM module",
    "Large org (56K) = long sales cycle, complex procurement",
    "Legal department may control CLM buying decision"
  ]
};
const OUTREACH = {
  stage: { headline: "Your Contract Chaos Has a Price Tag", diagnosis: "AbbVie's 30+ M&A deals since 2024 have created massive contract fragmentation. With $14B in addressable spend across 170+ markets, you're managing complexity that no spreadsheet or SharePoint can handle. Your procurement transformation vision needs a platform that matches your ambition.", bullets: [
    { label: "Current Reality", detail: "30+ acquired entities with fragmented contracts across multiple systems, no unified CLM repository" },
    { label: "Industry Position", detail: "BMS (your former employer) already runs Icertis CLM — AbbVie is behind on contract intelligence" },
    { label: "Risk Exposure", detail: "Multi-jurisdiction compliance gaps across 170+ markets without automated obligation tracking" }
  ]},
  waste: { headline: "You're Losing $34.7M Every Year", total: "$34.7M", metrics: [
    { cat: "Revenue Leakage", stat: "8.4%", dollar: 14.2, src: "World Commerce & Contracting 2024" },
    { cat: "Cycle Time", stat: "4.1 wks", dollar: 8.6, src: "Aberdeen Group CLM Study" },
    { cat: "Compliance Risk", stat: "$5.2M", dollar: 5.2, src: "Deloitte Regulatory Cost Index" },
    { cat: "Resource Drain", stat: "48 hrs/wk", dollar: 4.1, src: "McKinsey Operations Report" },
    { cat: "Missed Renewals", stat: "19%", dollar: 2.6, src: "Gartner Procurement Research 2024" }
  ]},
  lifecycle: [
    { stage: "Vendor Selection", icon: "🔍", pain: "No centralized view of 2,000+ supplier contracts post-M&A", solution: "AI supplier discovery with risk scoring and benchmarking", features: ["Supplier Intelligence", "Risk Scoring"], outcome: "60% faster", score: 85 },
    { stage: "Authoring", icon: "✍️", pain: "Inconsistent clause libraries across acquired business units", solution: "Smart templates with AI clause recommendations", features: ["Clause Library", "AI Redlining"], outcome: "45% shorter", score: 70 },
    { stage: "Approval", icon: "✅", pain: "Email approvals averaging 4.1 weeks, no audit trail", solution: "Configurable workflows with e-signature integration", features: ["Workflow Engine", "E-Signature"], outcome: "70% faster", score: 90 },
    { stage: "Obligations", icon: "📋", pain: "Obligations in Excel across 170+ markets — compliance gaps", solution: "AI extracts and monitors obligations with proactive alerts", features: ["AI Extraction", "Alerts"], outcome: "95% visibility", score: 95 },
    { stage: "Renewals", icon: "🔄", pain: "19% contracts auto-renew on unfavorable terms", solution: "Predictive renewal management with spend analytics", features: ["Renewal Alerts", "Analytics"], outcome: "$2.6M saved/yr", score: 80 }
  ],
  cta: { headline: "Let's Quantify Your Savings", body: "Sanjeev, with your PhD analytical background and transformation mandate, you know that data drives decisions. Let's run a 30-minute contract health assessment and show you exactly where Sirion delivers ROI within 90 days." }
};
const VERIF = { accuracy: "high", checked: 5, corrections: 0, confirmed: ["Sanjeev is CPO at AbbVie", "Revenue ~$58.1B confirmed", "Operations in 170+ markets", "Top 100 Procurement Leader verified", "BMS Icertis usage confirmed"], notes: "All claims verified as of Feb 11, 2026. No corrections needed." };

/* ═══ COMPONENTS ═══ */
const Glow = ({ color, size = 180, top = -70, right = -50 }) => <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: color, filter: `blur(${size/2}px)`, opacity: 0.06, top, right, pointerEvents: "none" }} />;
const Label = ({ children, color = T.dim }) => <div style={{ fontSize: 10, color, letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, fontFamily: T.h }}>{children}</div>;
const Panel = ({ children, style: s = {}, glow }) => <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: "16px 18px", marginBottom: 12, position: "relative", overflow: "hidden", ...s }}>{glow && <Glow color={glow} />}{children}</div>;
const Chip = ({ text, color }) => <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 14, fontSize: 10, background: `${color}14`, color, border: `1px solid ${color}22`, fontWeight: 500, marginRight: 4, marginBottom: 4, lineHeight: 1.2 }}>{text}</span>;

const dimKeys = [
  { key: "tech_stack", label: "Tech Stack", short: "Tech", color: T.purple },
  { key: "hiring", label: "Hiring", short: "Hiring", color: T.blue },
  { key: "digital", label: "Digital Signals", short: "Digital", color: T.gold },
  { key: "competitor", label: "Competitor CLM", short: "Competitor", color: T.red },
  { key: "dm_signals", label: "DM Signals", short: "DM Signals", color: T.green }
];
const STAGE_CFG = { awareness: { label: "Awareness", color: "#F59E0B" }, consideration: { label: "Consideration", color: "#4A90D9" }, discovery: { label: "Discovery", color: "#10B981" } };

/* ═══════════════════════════════════════════
   ANALYSIS REPORT
   ═══════════════════════════════════════════ */
function AnalysisReport({ onVerify, verification, verifying }) {
  const stg = STAGE_CFG[DATA.primary];
  const radarData = dimKeys.map(d => ({ axis: d.short, score: DATA.analysis[d.key].score }));
  const stageData = [{ name: "Awareness", score: DATA.stages.awareness, color: "#F59E0B" }, { name: "Consideration", score: DATA.stages.consideration, color: "#4A90D9" }, { name: "Discovery", score: DATA.stages.discovery, color: "#10B981" }];
  const allSignals = dimKeys.flatMap(d => DATA.analysis[d.key].signals);

  return (<div>
    {/* HEADER */}
    <div style={{ background: `linear-gradient(135deg, ${T.surface}, ${T.card})`, borderRadius: 16, border: `1px solid ${stg.color}40`, padding: "22px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
      <Glow color={stg.color} size={220} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Label color={stg.color}>CLM READINESS INTELLIGENCE REPORT</Label>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: T.h, color: T.text, margin: "0 0 4px" }}>{DATA.dm.company}</h1>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>{DATA.dm.name} · {DATA.dm.title}</div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.dim, flexWrap: "wrap" }}>
            <span>🏢 {DATA.co.industry}</span><span>💰 {DATA.co.revenue}</span><span>👥 {DATA.co.employees}</span><span>🌍 {DATA.co.global}</span>
          </div>
        </div>
        <svg width={110} height={110}><circle cx={55} cy={55} r={44} fill="none" stroke={`${stg.color}15`} strokeWidth="6"/><circle cx={55} cy={55} r={44} fill="none" stroke={stg.color} strokeWidth="6" strokeDasharray={2*Math.PI*44} strokeDashoffset={2*Math.PI*44*(1-DATA.readiness/10)} strokeLinecap="round" transform="rotate(-90 55 55)" style={{ transition: "stroke-dashoffset 1.6s ease" }}/><text x={55} y={51} textAnchor="middle" fill={T.text} fontSize="24" fontWeight="800" fontFamily={T.h}>{DATA.readiness.toFixed(1)}</text><text x={55} y={68} textAnchor="middle" fill={T.dim} fontSize="10">/ 10.0</text></svg>
      </div>
    </div>

    {/* METRICS */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
      {[
        { v: DATA.readiness.toFixed(1), l: "Readiness", s: "out of 10", c: stg.color },
        { v: stg.label, l: "Stage", s: `${DATA.stages[DATA.primary]}/10`, c: stg.color },
        { v: "HIGH", l: "Confidence", s: "signal density", c: T.green },
        { v: allSignals.length, l: "Signals", s: "5 dimensions", c: T.purple }
      ].map((m, i) => (
        <div key={i} style={{ padding: "14px 12px", borderRadius: 12, background: T.card, border: `1px solid ${T.border}`, overflow: "hidden", position: "relative" }}>
          <Glow color={m.c} size={70} top={-35} right={-30} />
          <div style={{ fontSize: String(m.v).length > 6 ? 16 : 26, fontWeight: 800, fontFamily: T.h, color: m.c, lineHeight: 1.1, marginBottom: 2, wordBreak: "break-word" }}>{m.v}</div>
          <div style={{ fontSize: 10, color: T.muted, fontWeight: 500 }}>{m.l}</div>
          <div style={{ fontSize: 9, color: T.dim }}>{m.s}</div>
        </div>
      ))}
    </div>

    {/* CHARTS */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
      <Panel glow={T.blue}>
        <Label color={T.blue}>READINESS DIMENSIONS</Label>
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: T.muted, fontSize: 10 }} />
            <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: T.dim, fontSize: 9 }} axisLine={false} />
            <Radar dataKey="score" stroke={T.blue} fill={T.blue} fillOpacity={0.2} strokeWidth={2} dot={{ fill: T.blue, r: 4 }} />
          </RadarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel glow={T.gold}>
        <Label color={T.gold}>STAGE CLASSIFICATION</Label>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={stageData} layout="vertical" barSize={22}>
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis type="number" domain={[0, 10]} tick={{ fill: T.dim, fontSize: 10 }} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} width={90} />
            <Tooltip contentStyle={tip} />
            <Bar dataKey="score" radius={[0, 8, 8, 0]}>{stageData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 6 }}>
          {stageData.map((s, i) => <span key={i} style={{ padding: "3px 10px", borderRadius: 16, fontSize: 10, fontWeight: 700, background: s.name.toLowerCase() === DATA.primary ? `${s.color}20` : "transparent", color: s.name.toLowerCase() === DATA.primary ? s.color : T.dim, border: `1px solid ${s.name.toLowerCase() === DATA.primary ? `${s.color}40` : T.border}`, fontFamily: T.h }}>{s.name.toLowerCase() === DATA.primary && "● "}{s.name}</span>)}
        </div>
      </Panel>
    </div>

    {/* SIGNAL CHIPS — compact horizontal wrap */}
    <Panel>
      <Label>DIMENSION SCORES & SIGNALS</Label>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={dimKeys.map(d => ({ name: d.short, score: DATA.analysis[d.key].score }))} barSize={32}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} />
          <YAxis domain={[0, 10]} tick={{ fill: T.dim, fontSize: 10 }} axisLine={false} />
          <Tooltip contentStyle={tip} />
          <Bar dataKey="score" radius={[6, 6, 0, 0]}>{dimKeys.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
        {allSignals.map((s, i) => <Chip key={i} text={s} color={dimKeys[Math.floor(i / 5) % dimKeys.length].color} />)}
      </div>
    </Panel>

    {/* DM INTELLIGENCE — better flex layout */}
    <Panel>
      <Label color={T.purple}>DECISION MAKER INTELLIGENCE</Label>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: T.dim, marginBottom: 6 }}>📍 {DATA.dm.location} · ⏱ {DATA.dm.tenure} in role</div>
          <div style={{ marginBottom: 8 }}>{DATA.dm.certs.map((c, i) => <Chip key={i} text={c} color={T.purple} />)}</div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{DATA.dm.summary}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.dim, fontWeight: 700, marginBottom: 8 }}>LINKEDIN SIGNALS</div>
          {DATA.dm.activity.map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: T.muted, padding: "4px 0", display: "flex", gap: 6, lineHeight: 1.4 }}>
              <span style={{ color: T.blue, flexShrink: 0 }}>📡</span>{a}
            </div>
          ))}
        </div>
      </div>
    </Panel>

    {/* HOOK */}
    <Panel style={{ borderLeft: `3px solid ${T.blue}` }} glow={T.blue}>
      <Label color={T.blue}>🎯 OUTREACH HOOK</Label>
      <p style={{ fontSize: 13, color: T.text, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>"{DATA.hook}"</p>
    </Panel>

    {/* ACTIONS + RISKS — 2 columns */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Panel style={{ borderTop: `2px solid ${T.green}` }}>
        <Label color={T.green}>RECOMMENDED ACTIONS</Label>
        {DATA.actions.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ width: 20, height: 20, borderRadius: 5, background: `${T.green}15`, color: T.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, fontFamily: T.m }}>{i+1}</span>
            <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{a}</span>
          </div>
        ))}
      </Panel>
      <Panel style={{ borderTop: `2px solid ${T.red}` }}>
        <Label color={T.red}>RISK FACTORS</Label>
        {DATA.risks.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ width: 20, height: 20, borderRadius: 5, background: `${T.red}15`, color: T.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>!</span>
            <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{r}</span>
          </div>
        ))}
      </Panel>
    </div>

    {/* CREDIBILITY */}
    <Panel style={{ marginTop: 2 }}>
      <Label color={T.cyan}>CREDIBILITY & SOURCES</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { icon: "🔗", title: "LinkedIn Profile", method: "Direct copy-paste", rel: "100%", c: T.green },
          { icon: "🌐", title: "Live Web Search", method: "AI-powered research", rel: "95%+", c: T.blue },
          { icon: "🏢", title: "Company Website", method: "Direct page fetch", rel: "100%", c: T.green }
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px", borderRadius: 10, background: `${s.c}06`, border: `1px solid ${s.c}12` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: s.c, padding: "2px 6px", borderRadius: 6, background: `${s.c}15`, fontFamily: T.m }}>{s.rel}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: T.h }}>{s.title}</div>
            <div style={{ fontSize: 10, color: s.c, fontWeight: 600 }}>{s.method}</div>
          </div>
        ))}
      </div>
      <Label color={T.cyan}>SCORE RATIONALE</Label>
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.03)", display: "grid", gridTemplateColumns: "1.2fr 0.4fr 2.5fr", gap: 8, borderBottom: `1px solid ${T.border}` }}>
          {["DIMENSION","SCORE","RATIONALE"].map(h => <span key={h} style={{ fontSize: 9, fontWeight: 700, color: T.dim, fontFamily: T.h, letterSpacing: "0.08em" }}>{h}</span>)}
        </div>
        {dimKeys.map((d, i) => (
          <div key={i} style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1.2fr 0.4fr 2.5fr", gap: 8, alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{d.label}</span>
            </div>
            <div><span style={{ fontSize: 16, fontWeight: 800, color: d.color, fontFamily: T.h }}>{DATA.analysis[d.key].score}</span><span style={{ fontSize: 8, color: T.dim }}>/10</span></div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{DATA.analysis[d.key].findings}</div>
          </div>
        ))}
      </div>
    </Panel>

    {/* VERIFICATION */}
    <div style={{ marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
      {!verification && !verifying && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: T.dim, marginBottom: 8 }}>Report generated from live AI research. Double-check critical facts?</div>
          <button onClick={onVerify} style={{ padding: "12px 28px", borderRadius: 12, cursor: "pointer", background: `linear-gradient(135deg, ${T.gold}15, ${T.gold}08)`, border: `1.5px solid ${T.gold}40`, fontFamily: T.h, color: T.gold, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 10 }}>
            🔒 Verify for Latest Developments
          </button>
          <div style={{ fontSize: 10, color: T.dim, marginTop: 6 }}>M&A · leadership · ownership · ~30 sec</div>
        </div>
      )}
      {verifying && (
        <Panel style={{ textAlign: "center", borderColor: `${T.gold}25` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.gold}20`, borderTopColor: T.gold, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.gold, fontFamily: T.h }}>Verifying...</span>
          </div>
        </Panel>
      )}
      {verification && !verifying && (
        <Panel style={{ borderColor: `${T.green}25` }} glow={T.green}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${T.green}15`, border: `2px solid ${T.green}30`, fontSize: 14 }}>✓</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.green, fontFamily: T.h }}>All Facts Verified</div>
                <div style={{ fontSize: 10, color: T.dim }}>{verification.checked} claims checked · {verification.accuracy.toUpperCase()}</div>
              </div>
            </div>
            <span style={{ padding: "3px 12px", borderRadius: 14, fontSize: 10, fontWeight: 800, background: `${T.green}12`, color: T.green, border: `1px solid ${T.green}25`, fontFamily: T.h }}>🔒 VERIFIED</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {verification.confirmed.map((v, i) => <span key={i} style={{ padding: "4px 10px", borderRadius: 14, fontSize: 10, background: `${T.green}08`, color: T.muted, border: `1px solid ${T.green}15` }}><span style={{ color: T.green, fontWeight: 700 }}>✓</span> {v}</span>)}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.4, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>ℹ️ {verification.notes}</div>
        </Panel>
      )}
    </div>
  </div>);
}

/* ═══════════════════════════════════════════
   OUTREACH REPORT
   ═══════════════════════════════════════════ */
function OutreachReport() {
  const stg = STAGE_CFG[DATA.primary];
  const wc = [T.red, T.orange, T.purple, T.blue, T.gold];
  const cd = OUTREACH.waste.metrics.map(m => ({ name: m.cat.length > 11 ? m.cat.substring(0,10)+"…" : m.cat, value: m.dollar }));
  const pd = OUTREACH.waste.metrics.map((m, i) => ({ name: m.cat, value: m.dollar, color: wc[i] }));
  const lcData = OUTREACH.lifecycle.map(ls => ({ name: ls.stage.length > 10 ? ls.stage.substring(0,9)+"…" : ls.stage, score: ls.score }));

  return (<div>
    {/* HEADER */}
    <div style={{ background: `linear-gradient(135deg, ${stg.color}10, ${T.card})`, borderRadius: 16, border: `1px solid ${stg.color}30`, padding: "22px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
      <Glow color={stg.color} />
      <Label color={stg.color}>OUTREACH REPORT</Label>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: T.h, color: T.text, margin: "0 0 4px" }}>{DATA.dm.company}</h1>
      <div style={{ fontSize: 13, color: T.muted }}>{DATA.dm.name} · {DATA.dm.title}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <span style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: 700, background: `${stg.color}15`, color: stg.color, border: `1px solid ${stg.color}30` }}>{stg.label} Stage</span>
        <span style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,0.04)", color: T.muted, border: `1px solid ${T.border}` }}>{DATA.readiness.toFixed(1)}/10</span>
      </div>
    </div>

    {/* STAGE DIAGNOSIS */}
    <Panel style={{ borderLeft: `4px solid ${stg.color}` }} glow={stg.color}>
      <Label color={stg.color}>01 — STAGE DIAGNOSIS</Label>
      <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.h, color: T.text, margin: "0 0 10px" }}>{OUTREACH.stage.headline}</h2>
      <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.65, margin: "0 0 14px" }}>{OUTREACH.stage.diagnosis}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {OUTREACH.stage.bullets.map((b, i) => (
          <div key={i} style={{ flex: 1, padding: "12px", borderRadius: 10, background: `${[stg.color, T.blue, T.red][i]}08`, border: `1px solid ${[stg.color, T.blue, T.red][i]}15` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: [stg.color, T.blue, T.red][i], marginBottom: 4, fontFamily: T.h }}>{b.label}</div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{b.detail}</div>
          </div>
        ))}
      </div>
    </Panel>

    {/* COST OF INACTION */}
    <Panel glow={T.red}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <div><Label color={T.red}>02 — THE COST OF INACTION</Label><h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.h, color: T.text, margin: 0 }}>{OUTREACH.waste.headline}</h2></div>
        <div style={{ padding: "8px 18px", borderRadius: 12, background: `${T.red}12`, border: `1px solid ${T.red}25`, textAlign: "center" }}>
          <div style={{ fontSize: 8, color: T.red, fontWeight: 700, letterSpacing: "0.08em", fontFamily: T.h }}>ANNUAL WASTE</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.red, fontFamily: T.h }}>{OUTREACH.waste.total}</div>
        </div>
      </div>
    </Panel>
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 12 }}>
      <Panel>
        <Label>WASTE BY CATEGORY ($M)</Label>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cd} barSize={24}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 9 }} axisLine={false} />
            <YAxis tick={{ fill: T.dim, fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v}M`} />
            <Tooltip contentStyle={tip} formatter={v => [`$${v}M`]} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>{cd.map((_, i) => <Cell key={i} fill={wc[i]} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel>
        <Label>DISTRIBUTION</Label>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={pd} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">{pd.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie>
            <Tooltip contentStyle={tip} formatter={v => [`$${v}M`]} />
            <Legend iconType="circle" iconSize={6} formatter={v => <span style={{ color: T.muted, fontSize: 9 }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>
    </div>
    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
      {OUTREACH.waste.metrics.map((m, i) => (
        <div key={i} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, borderTop: `3px solid ${wc[i]}` }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: wc[i], fontFamily: T.h, lineHeight: 1 }}>{m.stat}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.text, marginTop: 2, fontFamily: T.h }}>{m.cat}</div>
          <div style={{ fontSize: 8, color: T.dim, marginTop: 1 }}>${m.dollar}M/yr</div>
          <div style={{ fontSize: 7, color: T.dim, marginTop: 2, fontStyle: "italic" }}>{m.src}</div>
        </div>
      ))}
    </div>

    {/* LIFECYCLE */}
    <Panel glow={T.green}>
      <Label color={T.green}>03 — SIRION ACROSS YOUR LIFECYCLE</Label>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={lcData}>
          <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.green} stopOpacity={0.25}/><stop offset="95%" stopColor={T.green} stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 10 }} axisLine={false} tickFormatter={v => `${v}%`} />
          <Tooltip contentStyle={tip} formatter={v => [`${v}%`, "Sirion Impact"]} />
          <Area type="monotone" dataKey="score" stroke={T.green} fill="url(#lg)" strokeWidth={2.5} dot={{ fill: T.green, r: 5, strokeWidth: 2, stroke: T.card }} />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
    {OUTREACH.lifecycle.map((ls, i) => (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 60px", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${T.green}12`, border: `1px solid ${T.green}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{ls.icon}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: T.h }}>{ls.stage}</div>
          <div style={{ fontSize: 10, color: T.red, lineHeight: 1.3, marginTop: 1 }}>{ls.pain}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.green, lineHeight: 1.3 }}>{ls.solution}</div>
          <div style={{ display: "flex", gap: 3, marginTop: 3 }}>{ls.features.map((f, fi) => <Chip key={fi} text={f} color={T.blue} />)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.green, fontFamily: T.h }}>{ls.score}%</div>
          <div style={{ fontSize: 7, color: T.dim, lineHeight: 1.2 }}>{ls.outcome}</div>
        </div>
      </div>
    ))}

    {/* CTA */}
    <div style={{ background: `linear-gradient(135deg, ${T.blue}10, ${T.purple}08)`, borderRadius: 16, border: `1px solid ${T.blue}25`, padding: "28px 24px", textAlign: "center", marginTop: 8 }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.h, color: T.text, margin: "0 0 8px" }}>{OUTREACH.cta.headline}</h3>
      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.65, margin: 0, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>{OUTREACH.cta.body}</p>
    </div>
  </div>);
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
export default function SirionVisualDemo() {
  const [tab, setTab] = useState("analysis");
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const printRef = useRef(null);

  const handleVerify = () => { setVerifying(true); setTimeout(() => { setVerifying(false); setVerification(VERIF); }, 3000); };
  const handlePrint = () => { const el = printRef.current; if (!el) return; el.style.display = "block"; setTimeout(() => { window.print(); setTimeout(() => { el.style.display = "none"; }, 500); }, 200); };

  return (
    <div style={{ minHeight: "100vh", background: "#070C10", fontFamily: T.b, color: T.text, display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        button:hover { filter: brightness(1.1); }
        @media print { .screen-ui { display: none !important; } .print-all { display: block !important; } @page { size: A4; margin: 10mm; } body { background: #0B0D11 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}>
        <div style={{ padding: "18px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, #14B8A6, #2DD4BF)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: T.h, color: "#070C10", boxShadow: "0 0 20px rgba(45,212,191,0.25)" }}>S</div>
            <div><div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.h }}>Sirion</div><div style={{ fontSize: 9, color: T.dim }}>Intelligence Engine</div></div>
          </div>
          {[{ id: "analysis", label: "Intelligence Report", icon: "📊" }, { id: "outreach", label: "Outreach Report", icon: "📨" }].map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: tab === n.id ? `1px solid ${T.blue}30` : `1px solid transparent`, background: tab === n.id ? `${T.blue}10` : "transparent", color: tab === n.id ? T.text : T.dim, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.h, textAlign: "left", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 9, color: T.dim }}>AI Research Engine</span>
          </div>
          <div style={{ fontSize: 9, color: T.dim }}>Active: {DATA.dm.company}</div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="screen-ui" style={{ flex: 1, overflowY: "auto", maxHeight: "100vh" }}>
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: T.h }}>{tab === "analysis" ? "Intelligence Report" : "Outreach Report"}</h2>
            <span style={{ fontSize: 10, color: T.gold, padding: "2px 8px", borderRadius: 6, background: `${T.gold}12`, border: `1px solid ${T.gold}20`, fontWeight: 700, fontFamily: T.h }}>SAMPLE</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {verification && <button onClick={() => { setVerification(null); setVerifying(false); }} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.gold}25`, background: `${T.gold}08`, color: T.gold, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.h }}>↺ Reset Verify</button>}
            <button onClick={handlePrint} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.green}25`, background: `${T.green}10`, color: T.green, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.h, display: "flex", alignItems: "center", gap: 6 }}>📥 Download {tab === "analysis" ? "Intelligence" : "Outreach"} PDF</button>
          </div>
        </div>
        <div style={{ padding: "20px 24px", maxWidth: 820, animation: "fadeUp 0.4s ease" }}>
          {tab === "analysis" && <AnalysisReport verification={verification} verifying={verifying} onVerify={handleVerify} />}
          {tab === "outreach" && <OutreachReport />}
        </div>
      </div>

      {/* PRINT */}
      <div ref={printRef} className="print-all" style={{ display: "none" }}>
        <div style={{ width: 794, background: "#0B0D11", padding: "24px 28px", color: T.text, fontFamily: T.b }}>
          {tab === "analysis" && <AnalysisReport verification={verification} verifying={verifying} onVerify={() => {}} />}
          {tab === "outreach" && <OutreachReport />}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import { useTheme } from "./ThemeContext";
import { db } from "./firebase.js";
import { usePipeline } from "./PipelineContext";
import { callClaude, callClaudeFast } from "./claudeApi.js";
import { updatePersona } from "./questionDB.js";
import { FONT, GOOGLE_FONTS_URL } from "./typography";

/* ═══════════════════════════════════════════
   FIREBASE — imported from shared firebase.js
   ═══════════════════════════════════════════ */

/* (Firebase helpers now in shared firebase.js) */

/* ═══════════════════════════════════════════
   CONFIGURATION & CONSTANTS
   ═══════════════════════════════════════════ */

const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const STAGE_CONFIG = {
  awareness: { label: "Awareness", color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)", icon: "◉", tagline: "You Seriously Need CLM", description: "Manual processes, no central repository" },
  consideration: { label: "Consideration", color: "#3B82F6", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)", icon: "◎", tagline: "You Know the Pain — Now Find the Cure", description: "Actively researching CLM vendors" },
  discovery: { label: "Discovery", color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)", icon: "◈", tagline: "You're Close — Choose Wisely", description: "Replacing/integrating CLM solution" }
};

const ANALYSIS_PROMPT = `You are a Senior Sales Intelligence Analyst specializing in Enterprise SaaS and CLM (Contract Lifecycle Management) for Sirion.

CRITICAL: Today's date is ${TODAY}. All information MUST reflect CURRENT status as of today.

You will receive:
1. A CLEANED LINKEDIN PROFILE (structured JSON) of the decision maker — this has been pre-processed to extract name, title, company, work history, skills, certifications, and activity. Use this as your primary source for the decision maker's identity and background.
2. A COMPANY WEBSITE URL — fetch this URL to get official company information.
3. Then do additional web searches for deeper intelligence.

STEP-BY-STEP PROCESS:
1. USE the cleaned LinkedIn JSON to identify:
   - Full name, exact current title, current company
   - Location
   - About/summary section (reveals priorities and pain points)
   - Complete work history (previous companies — check if any used CLM tools)
   - Skills & certifications (IACCM, legal ops = huge CLM signal)
   - Recent activity/posts (engaging with CLM, procurement tech, or vendor content?)
   - Education
   
2. FETCH the company website URL to get:
   - Official company description, size, industry
   - Leadership team pages
   - News/press releases
   - Product/service information

3. SEARCH the web for:
   - Tech Stack & Legacy Indicators (SharePoint, DocuSign, SAP Ariba, Coupa, competitor CLMs like Icertis, Ironclad, Agiloft)
   - Current hiring patterns (Legal Ops, Contract Admin, Procurement Transformation roles)
   - M&A activity, regulatory news, growth signals
   - Competitor CLM usage evidence
   - Industry-specific contract management challenges

4. CROSS-REFERENCE the LinkedIn work history:
   - Did they previously work at a company known to use CLM? (This signals familiarity)
   - Did they come from a consulting firm? (May have seen CLM implementations)
   - How long in current role? (New = mandate to change; Long tenure = established relationships)
   - Any certifications like IACCM, PMP, Six Sigma? (Process maturity signals)

5. ANALYZE LinkedIn activity:
   - Posts/shares about procurement, contracts, legal ops, digital transformation
   - Following/engaging with CLM vendor content
   - Conference attendance signals
   - Thought leadership on relevant topics

For EVERY M&A deal or major event, do a SEPARATE search to confirm CURRENT status.

Respond ONLY in valid JSON (no markdown, no backticks):
{
  "decision_maker": {
    "name": "Full Name",
    "title": "Exact Current Title from LinkedIn",
    "company": "Current Company",
    "location": "Location",
    "tenure_current_role": "How long in current role",
    "previous_roles": [
      { "title": "Previous Title", "company": "Company", "duration": "X years", "clm_relevance": "Did this company use CLM? Any relevant experience?" }
    ],
    "certifications": ["cert1", "cert2"],
    "linkedin_activity_signals": ["Posted re: procurement transformation", "Shared vendor consolidation article"],
    "profile_summary_insights": "2-3 sentence max insights from About section"
  },
  "company_profile": {
    "industry": "Industry",
    "estimated_revenue": "Revenue",
    "employee_count": "Count",
    "headquarters": "Location",
    "global_presence": "Description",
    "recent_news": "Key developments WITH CURRENT STATUS AND DATES",
    "website_insights": "Key info gathered from fetching the company URL"
  },
  "analysis": {
    "tech_stack": { "findings": "2 sentences max. Be concise.", "signals": ["s1","s2","s3"], "score": 7 },
    "hiring_patterns": { "findings": "2 sentences max.", "signals": ["s1","s2"], "score": 5 },
    "digital_footprint": { "findings": "2 sentences max.", "signals": ["s1","s2"], "score": 6 },
    "competitor_usage": { "findings": "2 sentences max.", "signals": ["s1"], "score": 4 },
    "decision_maker_signals": {
      "findings": "2 sentences max about this person's readiness signals from LinkedIn",
      "signals": ["Previous employer used Icertis", "Shared CLM article", "IACCM certified"],
      "score": 7
    }
  },
  "stage_scores": { "awareness": 6, "consideration": 8, "discovery": 3 },
  "primary_stage": "consideration",
  "confidence": "high",
  "readiness_score": 7.2,
  "outreach_hook": "PERSONALIZED hook based on their specific LinkedIn activity, background, and company situation. Max 3 sentences.",
  "recommended_actions": ["action1","action2","action3","action4","action5"],
  "risk_factors": ["risk1","risk2","risk3","risk4"],
  "summary": "2-3 sentence executive summary",
  "personalization_notes": "Specific things to reference in outreach based on LinkedIn"
}

STRICT FORMATTING RULES — FOLLOW EXACTLY:
- "signals" arrays: Each signal MUST be 3-7 words MAX. These are short TAGS, not sentences. Examples: "No CLM Platform Detected", "SAP Ariba Ecosystem", "Active M&A Integration", "Posted About Supply Chain". NEVER write full sentences like "SAP ecosystem presence creates natural pathway to SAP Ariba consideration" — that's wrong.
- Max 4-5 signals per dimension. Pick the strongest ones only.
- "findings": Max 2 short sentences per dimension. Be dense, not verbose.
- "linkedin_activity_signals": Max 8 words each. Examples: "Posted re: procurement transformation", "Shared vendor consolidation article".
- "recommended_actions": Exactly 4-5 actions. Each max 15 words. Start with verb.
- "risk_factors": Exactly 3-4 risks. Each max 15 words.
- "outreach_hook": Max 3 sentences.
- "profile_summary_insights": Max 3 sentences.`;

const VERIFICATION_PROMPT = `You are a quick fact-checker. Today is ${TODAY}.

Verify a sales intelligence report. Do ONLY 2-3 targeted web searches max:
1. "[Company] acquisition merger latest 2025 2026" — check if any deal status changed
2. "[Person] [Company] current role" — confirm they still hold the role
3. Only if needed: "[Company] public private status"

DO NOT search every claim. Only catch what would cause EMBARRASSMENT (deal closed vs pending, person left, etc).

Respond ONLY in valid JSON (no markdown, no backticks):
{
  "verification_timestamp": "${new Date().toISOString()}",
  "overall_accuracy": "high|medium|low",
  "total_claims_checked": 3,
  "corrections_needed": 0,
  "corrections": [
    { "severity": "high", "original_claim": "text", "corrected_claim": "text", "field_path": "field.path", "evidence": "source" }
  ],
  "verified_claims": [
    { "claim": "text", "status": "confirmed", "source": "source" }
  ],
  "updated_summary": null,
  "updated_outreach_hook": null,
  "updated_risk_factors": null,
  "freshness_notes": "One sentence"
}

CRITICAL: Max 3 searches. Be fast. Only flag things that would embarrass the sales team.`;

const OUTREACH_PROMPT = `You are a Senior Sales Strategist for Sirion, the leading AI-native CLM platform.

CRITICAL: Today is ${TODAY}. Use CORRECTED/VERIFIED data only.

ANALYSIS DATA:
{ANALYSIS_DATA}

VERIFICATION CORRECTIONS:
{VERIFICATION_DATA}

Generate a detailed, PERSONALIZED outreach report. Use the decision maker's LinkedIn background, activity, and specific situation to make this feel hand-crafted — not generic.

Key personalization from LinkedIn:
- Reference their specific background/previous roles where relevant
- Use their recent activity/posts to show you understand their priorities
- Reference certifications or expertise areas
- Connect their career trajectory to why CLM matters NOW

Generate as valid JSON ONLY (no markdown, no backticks):
{
  "stage_section": {
    "headline": "Bold direct headline (max 8 words)",
    "stage_name": "awareness|consideration|discovery",
    "diagnosis": "3-4 sentence diagnosis speaking TO the prospect using VERIFIED data AND LinkedIn insights",
    "current_state_bullets": [
      {"label": "Current Reality", "detail": "1-2 sentences max based on VERIFIED signals"},
      {"label": "Industry Position", "detail": "1-2 sentences max on where they stand vs peers"},
      {"label": "Risk Exposure", "detail": "1-2 sentences max on compliance/risk implications"}
    ]
  },
  "why_section": {
    "headline": "Data headline like 'You're Losing $X.XM Every Year'",
    "summary": "1-2 sentence financial impact overview",
    "total_estimated_waste": "$24.1M",
    "waste_metrics": [
      { "category": "Revenue Leakage", "stat": "9.2%", "dollar_value": "$9.2M", "description": "lost to poor contract terms", "source": "World Commerce & Contracting 2024" },
      { "category": "Cycle Time Waste", "stat": "3.4 wks", "dollar_value": "$8.2M", "description": "avg contract cycle time", "source": "Aberdeen Group CLM Study" },
      { "category": "Compliance Risk", "stat": "$4.5M", "dollar_value": "$4.5M", "description": "penalty exposure", "source": "Deloitte Regulatory Cost Index" },
      { "category": "Resource Drain", "stat": "42 hrs/wk", "dollar_value": "$3.8M", "description": "manual admin per dept", "source": "McKinsey Operations Report" },
      { "category": "Missed Renewals", "stat": "24%", "dollar_value": "$6.1M", "description": "unfavorable auto-renewals", "source": "Gartner Procurement Research 2024" }
    ]
  },
  "how_section": {
    "headline": "Sirion: Your Partner at Every Stage",
    "intro": "1-2 sentences mapping to their lifecycle",
    "lifecycle_stages": [
      { "stage": "Vendor Selection", "icon": "🔍", "current_pain": "Max 15 words", "sirion_solution": "Max 15 words", "key_features": ["f1","f2"], "outcome": "60% faster", "score": 85 },
      { "stage": "Authoring", "icon": "✍️", "current_pain": "Max 15 words", "sirion_solution": "Max 15 words", "key_features": ["f1","f2"], "outcome": "45% shorter", "score": 70 },
      { "stage": "Approval", "icon": "✅", "current_pain": "Max 15 words", "sirion_solution": "Max 15 words", "key_features": ["f1","f2"], "outcome": "70% faster", "score": 90 },
      { "stage": "Obligations", "icon": "📋", "current_pain": "Max 15 words", "sirion_solution": "Max 15 words", "key_features": ["f1","f2"], "outcome": "95% visibility", "score": 95 },
      { "stage": "Renewals", "icon": "🔄", "current_pain": "Max 15 words", "sirion_solution": "Max 15 words", "key_features": ["f1","f2"], "outcome": "$XM saved", "score": 80 }
    ]
  },
  "closing": {
    "cta_headline": "Personalized CTA (max 6 words)",
    "cta_body": "2-3 sentence personalized closing referencing THEIR LinkedIn activity or background"
  }
}

STRICT FORMATTING RULES:
- "current_pain" and "sirion_solution": Max 15 words each. Be punchy.
- "key_features": Exactly 2 features per stage, each 2-3 words.
- "outcome": Short metric like "60% faster" or "$6.1M saved". Max 4 words.
- "score": Number 0-100 representing Sirion's impact for that lifecycle stage.
- "dollar_value": Must be a dollar amount string like "$9.2M".
- "stat": A punchy number/percentage.
- "description": Max 8 words.`;

/* ═══════════════════════════════════════════
   REUSABLE UI COMPONENTS
   ═══════════════════════════════════════════ */

function ScoreBar({ score, max = 10, color, height = 6 }) {
  const [anim, setAnim] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnim(score), 100); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ width: "100%", height, background: VT.border, borderRadius: height / 2, overflow: "hidden" }}>
      <div style={{ width: `${(anim / max) * 100}%`, height: "100%", background: color, borderRadius: height / 2, transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
    </div>
  );
}

function RadialScore({ score, size = 130, color }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const [off, setOff] = useState(circ);
  useEffect(() => { const t = setTimeout(() => setOff(circ - (score / 10) * circ), 200); return () => clearTimeout(t); }, [score, circ]);
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={VT.border} strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)" }} />
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fill={VT.text} fontSize="26" fontWeight="700" fontFamily={FONT.heading}>{score.toFixed(1)}</text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill={VT.textDim} fontSize="11" fontFamily={FONT.heading}>/ 10.0</text>
    </svg>
  );
}

function Chip({ text, color }) {
  return <span style={{ display: "inline-block", padding: "4px 11px", borderRadius: 20, fontSize: 11, background: `${color}12`, color, border: `1px solid ${color}25`, marginRight: 5, marginBottom: 5, lineHeight: 1.3 }}>{text}</span>;
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 12, color: VT.textDim, letterSpacing: "0.1em", fontWeight: 700, margin: 0, textTransform: "uppercase" }}>{children}</h3>
      {sub && <p style={{ fontSize: 13, color: VT.textMuted, margin: "4px 0 0", lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function Card({ children, style: s = {} }) {
  return <div style={{ background: VT.card, borderRadius: 14, border: `1px solid ${VT.border}`, padding: 20, marginBottom: 14, ...s }}>{children}</div>;
}

/* ═══ Visual Report Helpers ═══ */
const VT_DARK = {
  blue: "#38BDF8", gold: "#FBBF24", green: "#2DD4BF", red: "#F87171",
  purple: "#A78BFA", orange: "#FB923C", cyan: "#22D3EE",
  teal: "#14B8A6", tealDark: "#0D9488", tealGlow: "#2DD4BF",
  heading: FONT.heading, body: FONT.body, mono: FONT.mono,
  bg: "#0A0F14", surface: "#0F1820", card: "#131E28", border: "rgba(45,212,191,0.10)", text: "#F0F4F8",
  textMuted: "rgba(255,255,255,0.70)", textDim: "rgba(255,255,255,0.40)"
};
const VT_LIGHT = {
  ...VT_DARK,
  bg: "#f7f7f8", surface: "#ededf0", card: "#ffffff",
  border: "rgba(45,212,191,0.15)", text: "#111118",
  textMuted: "rgba(0,0,0,0.55)", textDim: "rgba(0,0,0,0.35)",
};
const VT = { ...VT_DARK };
const chartTip = () => ({ background: VT.card, border: `1px solid ${VT.border}`, borderRadius: 10, fontSize: 12, fontFamily: VT.body, color: VT.text, padding: "8px 14px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" });
const Glow = ({ color, size = 200, top, right, opacity = 0.06 }) => <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: color, filter: `blur(${size/2}px)`, opacity, top, right, pointerEvents: "none" }} />;
const VLabel = ({ children, color = VT.textDim }) => <div style={{ fontSize: 11, color, letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase", marginBottom: 12, fontFamily: VT.heading }}>{children}</div>;
const Panel = ({ children, style: s = {}, glow }) => <div style={{ background: VT.card, borderRadius: 16, border: `1px solid ${VT.border}`, padding: "20px 22px", marginBottom: 14, position: "relative", overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.2)", ...s }}>{glow && <Glow color={glow} size={160} top={-60} right={-60} />}{children}</div>;
const VChip = ({ text, color }) => <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 14, fontSize: 11, background: `${color}12`, color, border: `1px solid ${color}20`, fontFamily: VT.body, fontWeight: 500, marginRight: 4, marginBottom: 4 }}>{text}</span>;

function DownloadPDFBtn({ printRef, label = "Download PDF" }) {
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    el.style.display = "block";
    setTimeout(() => { window.print(); setTimeout(() => { el.style.display = "none"; }, 500); }, 200);
  };
  return (
    <button onClick={handlePrint} style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${VT.green}30`, background: `${VT.green}12`, color: VT.green, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: VT.heading, display: "inline-flex", alignItems: "center", gap: 8 }}>
      📥 {label}
    </button>
  );
}

/* ═══════════════════════════════════════════
   LINKEDIN PREPROCESSING PROMPT (Pass 0)
   ═══════════════════════════════════════════ */

const LINKEDIN_CLEANUP_PROMPT = `You are a data extraction specialist. Your ONLY job is to take raw copy-pasted LinkedIn profile text (which contains tons of noise, navigation elements, ads, "People also viewed", etc.) and extract ONLY the meaningful profile data into a clean, structured JSON.

This must be FAST. Do NOT search the web. Just parse the text.

Extract ONLY these fields from the raw text. If a field is not found, use null.

Respond ONLY in valid JSON (no markdown, no backticks):
{
  "name": "Full Name",
  "headline": "Their headline/tagline",
  "current_title": "Exact current job title",
  "current_company": "Current company name",
  "location": "Location",
  "about": "Their About/summary section text (truncate to 500 chars max)",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Duration text (e.g. 'Jan 2023 - Present · 2 yrs')",
      "description": "Brief description if available (100 chars max per role)"
    }
  ],
  "education": [
    { "school": "School Name", "degree": "Degree", "years": "Years" }
  ],
  "certifications": ["Cert 1", "Cert 2"],
  "skills_top": ["Top skill 1", "Top skill 2", "Top skill 3", "Top skill 4", "Top skill 5"],
  "recent_activity": [
    "Brief description of recent post or share (30 words max each)"
  ],
  "recommendations_summary": "Brief summary of recommendation themes if any (50 words max)",
  "raw_char_count": 12345,
  "cleaned_char_count": 2345
}

RULES:
- Strip ALL navigation text, ads, "People also viewed", "More profiles", buttons, etc.
- Keep ONLY factual profile data
- Limit experience to last 5 roles max
- Limit recent_activity to last 3 items max
- Limit skills to top 5 most relevant
- Total output must be under 2000 characters
- Be FAST — this is a preprocessing step`;

/* ═══════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════ */

/* callClaude & callClaudeFast imported from shared claudeApi.js */

function mergeCorrections(analysis, verification) {
  if (!verification?.corrections?.length) return analysis;
  const m = JSON.parse(JSON.stringify(analysis));
  if (verification.updated_summary) m.summary = verification.updated_summary;
  if (verification.updated_outreach_hook) m.outreach_hook = verification.updated_outreach_hook;
  if (verification.updated_risk_factors?.length) m.risk_factors = verification.updated_risk_factors;
  for (const c of verification.corrections) {
    if (c.field_path) {
      const parts = c.field_path.split(".");
      let t = m;
      for (let i = 0; i < parts.length - 1; i++) { if (t[parts[i]]) t = t[parts[i]]; }
      const k = parts[parts.length - 1];
      if (t[k] && typeof t[k] === "string" && c.corrected_claim) {
        t[k] = t[k].includes(c.original_claim) ? t[k].replace(c.original_claim, c.corrected_claim) : t[k] + " [UPDATED: " + c.corrected_claim + "]";
      }
    }
  }
  return m;
}

/* ═══════════════════════════════════════════
   LOADING
   ═══════════════════════════════════════════ */

function LoadingState({ steps, step, title }) {
  return (
    <div style={{ padding: "50px 20px", maxWidth: 440, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ width: 52, height: 52, margin: "0 auto 18px" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", border: "3px solid rgba(45,212,191,0.12)", borderTopColor: "#2DD4BF", animation: "spin 1s linear infinite" }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: VT.text }}>{title}</div>
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", opacity: i <= step ? 1 : 0.2, transition: "opacity 0.5s" }}>
          <span style={{
            width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0,
            background: i < step ? "rgba(45,212,191,0.12)" : i === step ? "rgba(45,212,191,0.15)" : VT.card,
            color: i < step ? "#2DD4BF" : i === step ? "#2DD4BF" : VT.textDim,
            border: `1px solid ${i < step ? "rgba(45,212,191,0.25)" : i === step ? "rgba(45,212,191,0.30)" : VT.border}`
          }}>
            {i < step ? "✓" : i === step ? "●" : "○"}
          </span>
          <span style={{ fontSize: 12, color: i === step ? VT.text : i < step ? VT.textMuted : VT.textDim, fontWeight: i === step ? 600 : 400 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════
   ANALYSIS VIEW — Visual Charts + Credibility + Verification + PDF
   ═══════════════════════════════════════════ */

function AnalysisView({ data, verification, verifying, verificationError, onVerify, m1Questions = [] }) {
  if (!data) return null;
  const printRef = useRef(null);
  const primary = STAGE_CONFIG[data.primary_stage] || STAGE_CONFIG.awareness;
  const dm = data.decision_maker || {};
  const co = data.company_profile || {};

  const dimKeys = [
    { key: "tech_stack", label: "Tech Stack", short: "Tech", color: VT.purple },
    { key: "hiring_patterns", label: "Hiring", short: "Hiring", color: VT.blue },
    { key: "digital_footprint", label: "Digital Signals", short: "Digital", color: VT.gold },
    { key: "competitor_usage", label: "Competitor CLM", short: "Competitor", color: VT.red },
    { key: "decision_maker_signals", label: "DM Signals", short: "DM Signals", color: VT.green }
  ];

  const getDim = (key) => {
    if (typeof data[key] === "object" && data[key]?.score !== undefined) return data[key];
    if (data.analysis && typeof data.analysis[key] === "object") return data.analysis[key];
    return { score: 0, findings: "", signals: [] };
  };

  const radarData = dimKeys.map(d => ({ axis: d.short, score: getDim(d.key).score || 0 }));
  const stageData = [
    { name: "Awareness", score: data.stage_scores?.awareness || 0, color: "#F59E0B" },
    { name: "Consideration", score: data.stage_scores?.consideration || 0, color: "#4A90D9" },
    { name: "Discovery", score: data.stage_scores?.discovery || 0, color: "#4CAF82" }
  ];
  const allSignals = dimKeys.flatMap(d => getDim(d.key)?.signals || []);

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    el.style.display = "block";
    setTimeout(() => { window.print(); setTimeout(() => { el.style.display = "none"; }, 500); }, 200);
  };

  const reportBody = (
    <div>
      {/* ═══ HEADER ═══ */}
      <div style={{ background: `linear-gradient(135deg, ${VT.surface}, ${VT.card})`, borderRadius: 18, border: `1px solid ${primary.color}35`, padding: "26px", marginBottom: 16, position: "relative", overflow: "hidden", boxShadow: `0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(45,212,191,0.05)` }}>
        <Glow color={primary.color} size={220} top={-80} right={-60} opacity={0.08} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <VLabel color={primary.color}>CLM READINESS INTELLIGENCE REPORT</VLabel>
            <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: VT.heading, color: VT.text, margin: "0 0 4px" }}>{dm.company || "Company"}</h1>
            <div style={{ fontSize: 14, color: VT.textMuted, marginBottom: 12 }}>{dm.name} · {dm.title}</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: VT.textDim }}>
              {co.industry && <span>🏢 {co.industry}</span>}
              {co.estimated_revenue && <span>💰 {co.estimated_revenue}</span>}
              {co.employee_count && <span>👥 {co.employee_count}</span>}
              {co.global_presence && <span>🌍 {co.global_presence.split(",")[0]}</span>}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <svg width={120} height={120}>
              <circle cx={60} cy={60} r={48} fill="none" stroke={`${primary.color}15`} strokeWidth="7" />
              <circle cx={60} cy={60} r={48} fill="none" stroke={primary.color} strokeWidth="7"
                strokeDasharray={2*Math.PI*48} strokeDashoffset={2*Math.PI*48*(1-(data.readiness_score||0)/10)}
                strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)" }} />
              <text x={60} y={56} textAnchor="middle" fill={VT.text} fontSize="26" fontWeight="800" fontFamily={VT.heading}>{(data.readiness_score||0).toFixed(1)}</text>
              <text x={60} y={72} textAnchor="middle" fill={VT.textDim} fontSize="11">/ 10.0</text>
            </svg>
            <div style={{ fontSize: 11, color: VT.textDim, fontWeight: 700, letterSpacing: "0.06em" }}>READINESS</div>
          </div>
        </div>
      </div>

      {/* ═══ METRICS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { v: (data.readiness_score||0).toFixed(1), l: "Readiness Score", s: "out of 10.0", c: primary.color },
          { v: primary.label, l: "Primary Stage", s: `Score: ${stageData.find(s=>s.name.toLowerCase()===data.primary_stage)?.score||0}/10`, c: primary.color },
          { v: (data.confidence||"medium").toUpperCase(), l: "Confidence", s: "signal density", c: VT.green },
          { v: allSignals.length, l: "Total Signals", s: "5 dimensions", c: VT.purple }
        ].map((m,i) => (
          <div key={i} style={{ padding: "16px 14px", borderRadius: 12, background: VT.card, border: `1px solid ${VT.border}`, position: "relative", overflow: "hidden" }}>
            <Glow color={m.c} size={80} top={-40} right={-40} opacity={0.08} />
            <div style={{ fontSize: String(m.v).length > 6 ? 18 : 28, fontWeight: 800, fontFamily: VT.heading, color: m.c, lineHeight: 1.1, marginBottom: 3, wordBreak: "break-word" }}>{m.v}</div>
            <div style={{ fontSize: 11, color: VT.textMuted, fontWeight: 500 }}>{m.l}</div>
            <div style={{ fontSize: 11, color: VT.textDim }}>{m.s}</div>
          </div>
        ))}
      </div>

      {/* ═══ CHARTS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel glow={VT.blue}>
          <VLabel color={VT.blue}>READINESS DIMENSIONS</VLabel>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke={VT.border} />
              <PolarAngleAxis dataKey="axis" tick={{ fill: VT.textMuted, fontSize: 11, fontFamily: VT.body }} />
              <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: VT.textDim, fontSize: 11 }} axisLine={false} />
              <Radar dataKey="score" stroke={VT.blue} fill={VT.blue} fillOpacity={0.2} strokeWidth={2} dot={{ fill: VT.blue, r: 4 }} />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel glow={VT.gold}>
          <VLabel color={VT.gold}>STAGE CLASSIFICATION</VLabel>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={stageData} layout="vertical" barSize={26}>
              <CartesianGrid horizontal={false} stroke={VT.border} />
              <XAxis type="number" domain={[0, 10]} tick={{ fill: VT.textDim, fontSize: 11 }} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: VT.textMuted, fontSize: 12 }} axisLine={false} width={100} />
              <Tooltip contentStyle={chartTip()} />
              <Bar dataKey="score" radius={[0, 8, 8, 0]}>{stageData.map((e,i) => <Cell key={i} fill={e.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
            {stageData.map((s,i) => (
              <span key={i} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.name.toLowerCase()===data.primary_stage ? `${s.color}20` : "transparent", color: s.name.toLowerCase()===data.primary_stage ? s.color : VT.textDim, border: `1px solid ${s.name.toLowerCase()===data.primary_stage ? `${s.color}40` : VT.border}`, fontFamily: VT.heading }}>{s.name.toLowerCase()===data.primary_stage && "● "}{s.name}</span>
            ))}
          </div>
        </Panel>
      </div>

      {/* ═══ SIGNAL DENSITY ═══ */}
      <Panel>
        <VLabel>DIMENSION SCORES & SIGNALS</VLabel>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={dimKeys.map(d => ({ name: d.short, score: getDim(d.key).score || 0 }))} barSize={36}>
            <CartesianGrid vertical={false} stroke={VT.border} />
            <XAxis dataKey="name" tick={{ fill: VT.textMuted, fontSize: 11 }} axisLine={false} />
            <YAxis domain={[0, 10]} tick={{ fill: VT.textDim, fontSize: 11 }} axisLine={false} />
            <Tooltip contentStyle={chartTip()} />
            <Bar dataKey="score" radius={[6, 6, 0, 0]}>{dimKeys.map((d,i) => <Cell key={i} fill={d.color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 12 }}>
          {allSignals.map((s,i) => <VChip key={i} text={s} color={dimKeys[i % dimKeys.length].color} />)}
        </div>
      </Panel>

      {/* ═══ DM INTELLIGENCE ═══ */}
      <Panel>
        <VLabel color={VT.purple}>DECISION MAKER INTELLIGENCE</VLabel>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: VT.textDim, marginBottom: 6 }}>📍 {dm.location || "N/A"} · ⏱ {dm.tenure_current_role || "N/A"}</div>
            <div style={{ marginBottom: 8 }}>{(dm.certifications||[]).map((c,i) => <VChip key={i} text={c} color={VT.purple} />)}</div>
            <div style={{ fontSize: 12, color: VT.textMuted, lineHeight: 1.6 }}>{dm.profile_summary_insights || ""}</div>
          </div>
          {dm.linkedin_activity_signals?.length > 0 && (
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 11, color: VT.textDim, fontWeight: 700, marginBottom: 6 }}>LINKEDIN SIGNALS</div>
              {dm.linkedin_activity_signals.map((a,i) => (
                <div key={i} style={{ fontSize: 11, color: VT.textMuted, padding: "3px 0", display: "flex", gap: 6 }}><span style={{ color: VT.blue }}>📡</span>{a}</div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* ═══ HOOK ═══ */}
      <Panel style={{ borderLeft: `3px solid ${VT.blue}` }} glow={VT.blue}>
        <VLabel color={VT.blue}>🎯 OUTREACH HOOK</VLabel>
        <p style={{ fontSize: 14, color: VT.text, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>"{data.outreach_hook}"</p>
      </Panel>

      {/* ═══ ACTIONS + RISKS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel style={{ borderTop: `2px solid ${VT.green}` }}>
          <VLabel color={VT.green}>RECOMMENDED ACTIONS</VLabel>
          {(data.recommended_actions||[]).map((a,i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${VT.border}` }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: `${VT.green}15`, color: VT.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: VT.mono }}>{i+1}</span>
              <span style={{ fontSize: 13, color: VT.textMuted, lineHeight: 1.5 }}>{a}</span>
            </div>
          ))}
        </Panel>
        <Panel style={{ borderTop: `2px solid ${VT.red}` }}>
          <VLabel color={VT.red}>RISK FACTORS</VLabel>
          {(data.risk_factors||[]).map((r,i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${VT.border}` }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: `${VT.red}15`, color: VT.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>!</span>
              <span style={{ fontSize: 13, color: VT.textMuted, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </Panel>
      </div>

      {/* ═══ CREDIBILITY & SOURCES ═══ */}
      <Panel style={{ marginTop: 8 }}>
        <VLabel color={VT.cyan}>CREDIBILITY & SOURCES</VLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { icon: "🔗", title: "LinkedIn Profile", method: "Direct copy-paste", detail: "Name, title, work history, certifications, activity from the person's actual LinkedIn.", rel: "100%", c: VT.green },
            { icon: "🌐", title: "Live Web Search", method: "AI-powered research", detail: "Real-time searches across news, job boards, filings, tech review sites.", rel: "95%+", c: VT.blue },
            { icon: "🏢", title: "Company Website", method: "Direct page fetch", detail: "Official company page for leadership, press releases, investor data.", rel: "100%", c: VT.green }
          ].map((s,i) => (
            <div key={i} style={{ padding: "14px", borderRadius: 12, background: `${s.c}06`, border: `1px solid ${s.c}15` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: s.c, padding: "2px 8px", borderRadius: 8, background: `${s.c}15`, fontFamily: VT.mono }}>{s.rel}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: VT.text, fontFamily: VT.heading, marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: s.c, fontWeight: 600, marginBottom: 4 }}>{s.method}</div>
              <div style={{ fontSize: 11, color: VT.textDim, lineHeight: 1.5 }}>{s.detail}</div>
            </div>
          ))}
        </div>
        <VLabel color={VT.cyan}>SCORE RATIONALE</VLabel>
        <div style={{ background: VT.card, borderRadius: 12, border: `1px solid ${VT.border}`, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: VT.surface, display: "grid", gridTemplateColumns: "1.5fr 0.5fr 3fr 1fr", gap: 8, borderBottom: `1px solid ${VT.border}` }}>
            {["DIMENSION","SCORE","RATIONALE","SOURCES"].map(h => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: VT.textDim, fontFamily: VT.heading, letterSpacing: "0.08em" }}>{h}</span>)}
          </div>
          {dimKeys.map((d,i) => {
            const dd = getDim(d.key);
            return (
              <div key={i} style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1.5fr 0.5fr 3fr 1fr", gap: 8, alignItems: "center", borderBottom: `1px solid ${VT.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: VT.text }}>{d.label}</span>
                </div>
                <div><span style={{ fontSize: 18, fontWeight: 800, color: d.color, fontFamily: VT.heading }}>{dd.score||0}</span><span style={{ fontSize: 11, color: VT.textDim }}>/10</span></div>
                <div style={{ fontSize: 11, color: VT.textMuted, lineHeight: 1.4 }}>{dd.findings || ""}</div>
                <div style={{ fontSize: 11, color: VT.textDim }}>{(dd.signals||[]).length} signals</div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ═══ VERIFICATION ═══ */}
      <div className="no-print" style={{ marginTop: 16, borderTop: `1px solid ${VT.border}`, paddingTop: 20 }}>
        {!verification && !verifying && !verificationError && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: VT.textDim, marginBottom: 10 }}>Report generated from live AI research. Want to double-check critical facts?</div>
            <button onClick={onVerify} style={{ padding: "14px 32px", borderRadius: 14, cursor: "pointer", background: `linear-gradient(135deg, ${VT.gold}15, ${VT.gold}08)`, border: `1.5px solid ${VT.gold}40`, fontFamily: VT.heading, color: VT.gold, fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: `${VT.gold}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🔒</span>
              Verify for Latest Developments
            </button>
            <div style={{ fontSize: 11, color: VT.textDim, marginTop: 8 }}>M&A statuses · leadership changes · ownership · ~30 sec</div>
          </div>
        )}
        {verifying && (
          <Panel style={{ textAlign: "center", borderColor: `${VT.gold}25` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2.5px solid ${VT.gold}20`, borderTopColor: VT.gold, animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: VT.gold, fontFamily: VT.heading }}>Verifying Latest Developments...</span>
            </div>
            {["Searching deal & M&A statuses...","Confirming leadership positions...","Checking company ownership..."].map((s,i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "4px 0" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: VT.gold, animation: `pulse ${1+i*0.3}s ease infinite` }} />
                <span style={{ fontSize: 12, color: VT.textMuted }}>{s}</span>
              </div>
            ))}
          </Panel>
        )}
        {verificationError && !verifying && (
          <Panel style={{ borderColor: `${VT.red}25`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><span style={{ fontSize: 12, fontWeight: 700, color: VT.red }}>Verification failed — </span><span style={{ fontSize: 12, color: VT.textMuted }}>{verificationError}</span></div>
            <button onClick={onVerify} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${VT.red}25`, background: `${VT.red}10`, color: VT.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: VT.heading }}>Retry</button>
          </Panel>
        )}
        {verification && !verifying && (
          <Panel style={{ borderColor: verification.corrections_needed > 0 ? `${VT.gold}25` : `${VT.green}25` }} glow={verification.corrections_needed > 0 ? VT.gold : VT.green}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: verification.corrections_needed > 0 ? `${VT.gold}15` : `${VT.green}15`, border: `2px solid ${verification.corrections_needed > 0 ? `${VT.gold}30` : `${VT.green}30`}`, fontSize: 16 }}>{verification.corrections_needed > 0 ? "⟳" : "✓"}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: verification.corrections_needed > 0 ? VT.gold : VT.green, fontFamily: VT.heading }}>{verification.corrections_needed > 0 ? `${verification.corrections_needed} Correction${verification.corrections_needed>1?"s":""} Applied` : "All Facts Verified"}</div>
                  <div style={{ fontSize: 11, color: VT.textDim }}>{verification.total_claims_checked} claims checked · {(verification.overall_accuracy||"").toUpperCase()}</div>
                </div>
              </div>
              <span style={{ padding: "4px 14px", borderRadius: 16, fontSize: 11, fontWeight: 800, background: `${VT.green}12`, color: VT.green, border: `1px solid ${VT.green}25`, fontFamily: VT.heading }}>🔒 VERIFIED</span>
            </div>
            {(verification.corrections||[]).map((c,i) => {
              const sc = c.severity==="high" ? VT.red : c.severity==="medium" ? VT.gold : VT.blue;
              return (
                <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: `${sc}06`, borderTop: `1px solid ${sc}15`, borderRight: `1px solid ${sc}15`, borderBottom: `1px solid ${sc}15`, borderLeft: `4px solid ${sc}`, marginBottom: 8 }}>
                  <VChip text={c.severity?.toUpperCase()} color={sc} />
                  <div style={{ fontSize: 12, color: VT.textDim, textDecoration: "line-through", marginTop: 6 }}>❌ {c.original_claim}</div>
                  <div style={{ fontSize: 13, color: VT.text, fontWeight: 600, marginTop: 4 }}>✅ {c.corrected_claim}</div>
                  {c.evidence && <div style={{ fontSize: 11, color: VT.textDim, marginTop: 4, fontStyle: "italic" }}>Source: {c.evidence}</div>}
                </div>
              );
            })}
            {(verification.verified_claims||[]).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {verification.verified_claims.map((v,i) => (
                  <span key={i} style={{ padding: "5px 12px", borderRadius: 16, fontSize: 11, background: `${VT.green}08`, color: VT.textMuted, border: `1px solid ${VT.green}15` }}><span style={{ color: VT.green, fontWeight: 700 }}>✓</span> {v.claim}</span>
                ))}
              </div>
            )}
            {verification.freshness_notes && <div style={{ marginTop: 10, fontSize: 12, color: VT.textMuted, lineHeight: 1.5, paddingTop: 10, borderTop: `1px solid ${VT.border}` }}>ℹ️ {verification.freshness_notes}</div>}
          </Panel>
        )}
      </div>
    </div>
  );

  // Filter M1 questions relevant to this persona's type
  // M1 exports persona as full label (e.g., "Chief Procurement Officer") or short ID
  const dmTitle = (dm.title || "").toLowerCase();
  const relevantQuestions = m1Questions.filter(q => {
    const qPersona = (q.persona || "").toLowerCase();
    // Match by title keywords in the decision maker's title
    if (dmTitle.includes("general counsel") || dmTitle.includes("chief legal")) return qPersona.includes("general counsel") || qPersona === "gc";
    if (dmTitle.includes("procurement") && (dmTitle.includes("chief") || dmTitle.includes("officer"))) return qPersona.includes("procurement") || qPersona === "cpo";
    if (dmTitle.includes("cio") || dmTitle.includes("chief information")) return qPersona.includes("information") || qPersona === "cio";
    if (dmTitle.includes("legal operations")) return qPersona.includes("legal operations") || qPersona === "vplo";
    if (dmTitle.includes("cto") || dmTitle.includes("chief technology")) return qPersona.includes("cto") || qPersona.includes("technology") || qPersona === "cto";
    if (dmTitle.includes("contract manager")) return qPersona.includes("contract manager") || qPersona === "cm";
    if (dmTitle.includes("procurement director")) return qPersona.includes("procurement director") || qPersona === "pd";
    if (dmTitle.includes("cfo") || dmTitle.includes("chief financial")) return qPersona.includes("financial") || qPersona.includes("cfo") || qPersona === "cfo";
    return false;
  });

  return (
    <div style={{ animation: "fadeUp 0.5s ease" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button onClick={handlePrint} style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${VT.green}30`, background: `${VT.green}12`, color: VT.green, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: VT.heading, display: "inline-flex", alignItems: "center", gap: 8 }}>📥 Download Intelligence Report</button>
      </div>
      {reportBody}

      {/* ═══ M1 QUESTIONS FOR THIS PERSONA ═══ */}
      {relevantQuestions.length > 0 && (
        <Panel style={{ marginTop: 14, borderTop: `2px solid #A78BFA` }}>
          <VLabel color="#A78BFA">QUESTIONS THIS PERSONA WOULD ASK</VLabel>
          <div style={{ fontSize: 11, color: VT.textDim, marginBottom: 12 }}>
            {relevantQuestions.length} questions from M1 Question Generator matching {dm.title || "this persona"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {relevantQuestions.slice(0, 10).map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 12px", borderRadius: 8, background: `rgba(167,139,250,0.04)`, border: `1px solid rgba(167,139,250,0.08)` }}>
                <span style={{ width: 20, height: 20, borderRadius: 4, background: `rgba(167,139,250,0.12)`, color: "#A78BFA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: VT.mono }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: VT.text, lineHeight: 1.5 }}>{q.query}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "rgba(103,232,249,0.08)", color: "#67e8f9", fontFamily: VT.mono }}>{q.stage}</span>
                    {q.source && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "rgba(167,139,250,0.08)", color: "#A78BFA", fontFamily: VT.mono }}>{q.source}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {relevantQuestions.length > 10 && (
            <div style={{ fontSize: 11, color: VT.textDim, marginTop: 8, textAlign: "center", fontFamily: VT.mono }}>
              + {relevantQuestions.length - 10} more questions available in M1
            </div>
          )}
        </Panel>
      )}

      <div ref={printRef} className="print-container" style={{ display: "none" }}>
        <div style={{ width: 794, background: "#070C10", padding: "28px 32px", color: "#E8EAED", fontFamily: FONT.body }}>{reportBody}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   OUTREACH VIEW — Visual Charts + PDF
   ═══════════════════════════════════════════ */

function OutreachView({ outreach, analysisData }) {
  if (!outreach || !analysisData) return null;
  const printRef = useRef(null);
  const stage = STAGE_CONFIG[outreach.stage_section?.stage_name] || STAGE_CONFIG[analysisData.primary_stage] || STAGE_CONFIG.awareness;
  const wc = [VT.red, VT.orange, VT.purple, VT.blue, VT.gold];

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    el.style.display = "block";
    setTimeout(() => { window.print(); setTimeout(() => { el.style.display = "none"; }, 500); }, 200);
  };

  const wasteMetrics = outreach.why_section?.waste_metrics || [];
  const chartData = wasteMetrics.map(m => {
    const dollarStr = typeof m.dollar_value === "string" ? m.dollar_value : (m.dollar || "");
    const val = parseFloat(String(dollarStr).replace(/[^0-9.]/g, "")) || 0;
    return { name: (m.category||"").length > 11 ? (m.category||"").substring(0,10)+"…" : (m.category||""), value: val };
  });
  const pieData = wasteMetrics.map((m,i) => {
    const dollarStr = typeof m.dollar_value === "string" ? m.dollar_value : (m.dollar || "");
    const val = parseFloat(String(dollarStr).replace(/[^0-9.]/g, "")) || 0;
    return { name: m.category||"", value: val, color: wc[i%5] };
  });
  const lcStages = outreach.how_section?.lifecycle_stages || [];
  const lcData = lcStages.map(ls => ({ name: (ls.stage||"").length > 10 ? (ls.stage||"").substring(0,9)+"…" : (ls.stage||""), score: ls.score || ls.impact_score || 50 }));

  const reportBody = (
    <div>
      {/* ═══ HEADER ═══ */}
      <div style={{ background: `linear-gradient(135deg, ${stage.bg || `${stage.color}08`}, ${VT.card})`, borderRadius: 18, border: `1.5px solid ${stage.border || `${stage.color}25`}`, padding: "26px", marginBottom: 16, position: "relative", overflow: "hidden", boxShadow: `0 4px 32px rgba(0,0,0,0.3)` }}>
        <Glow color={stage.color} size={200} top={-80} right={-60} opacity={0.08} />
        <VLabel color={stage.color}>OUTREACH REPORT</VLabel>
        <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: VT.heading, color: VT.text, margin: "0 0 4px" }}>{analysisData.decision_maker?.company}</h1>
        <div style={{ fontSize: 14, color: VT.textMuted }}>{analysisData.decision_maker?.name} · {analysisData.decision_maker?.title}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <span style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: stage.bg || `${stage.color}12`, color: stage.color, border: `1px solid ${stage.border || `${stage.color}30`}` }}>{stage.label} Stage</span>
          <span style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: VT.card, color: VT.textMuted, border: `1px solid ${VT.border}` }}>{(analysisData.readiness_score||0).toFixed(1)}/10</span>
        </div>
      </div>

      {/* ═══ STAGE DIAGNOSIS ═══ */}
      {outreach.stage_section && (
        <Panel style={{ borderLeft: `4px solid ${stage.color}` }} glow={stage.color}>
          <VLabel color={stage.color}>01 — STAGE DIAGNOSIS</VLabel>
          <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: VT.heading, color: VT.text, margin: "0 0 12px" }}>{outreach.stage_section.headline}</h2>
          <p style={{ fontSize: 13, color: VT.textMuted, lineHeight: 1.7, margin: "0 0 16px" }}>{outreach.stage_section.diagnosis}</p>
          {outreach.stage_section.current_state_bullets?.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {outreach.stage_section.current_state_bullets.map((b,i) => (
                <div key={i} style={{ flex: "1 1 200px", padding: "14px", borderRadius: 12, background: `${[stage.color, VT.blue, VT.red][i%3]}08`, border: `1px solid ${[stage.color, VT.blue, VT.red][i%3]}18` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: [stage.color, VT.blue, VT.red][i%3], marginBottom: 4, fontFamily: VT.heading }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: VT.textMuted, lineHeight: 1.5 }}>{b.detail}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ═══ COST OF INACTION ═══ */}
      {outreach.why_section && (
        <>
          <Panel glow={VT.red}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
              <div>
                <VLabel color={VT.red}>02 — THE COST OF INACTION</VLabel>
                <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: VT.heading, color: VT.text, margin: 0 }}>{outreach.why_section.headline}</h2>
              </div>
              <div style={{ padding: "8px 20px", borderRadius: 12, background: `${VT.red}12`, border: `1px solid ${VT.red}25`, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: VT.red, fontWeight: 700, letterSpacing: "0.08em", fontFamily: VT.heading }}>ANNUAL WASTE</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: VT.red, fontFamily: VT.heading }}>{outreach.why_section.total_estimated_waste || "$0"}</div>
              </div>
            </div>
          </Panel>
          {chartData.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 14 }}>
              <Panel>
                <VLabel>WASTE BY CATEGORY ($M)</VLabel>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barSize={28}>
                    <CartesianGrid vertical={false} stroke={VT.border} />
                    <XAxis dataKey="name" tick={{ fill: VT.textMuted, fontSize: 11 }} axisLine={false} />
                    <YAxis tick={{ fill: VT.textDim, fontSize: 11 }} axisLine={false} tickFormatter={v => `$${v}M`} />
                    <Tooltip contentStyle={chartTip()} formatter={v => [`$${v}M`]} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>{chartData.map((_,i) => <Cell key={i} fill={wc[i%5]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel>
                <VLabel>DISTRIBUTION</VLabel>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">
                      {pieData.map((e,i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTip()} formatter={v => [`$${v}M`]} />
                    <Legend iconType="circle" iconSize={7} formatter={v => <span style={{ color: VT.textMuted, fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </Panel>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {wasteMetrics.map((m,i) => (
              <div key={i} style={{ flex: "1 1 120px", padding: "12px 10px", borderRadius: 10, background: VT.card, border: `1px solid ${VT.border}`, borderTop: `3px solid ${wc[i%5]}` }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: wc[i%5], fontFamily: VT.heading, lineHeight: 1 }}>{m.stat || m.percentage || "—"}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: VT.text, marginTop: 3, fontFamily: VT.heading }}>{m.category}</div>
                <div style={{ fontSize: 11, color: VT.textDim, marginTop: 2 }}>{m.dollar_value || m.dollar || ""}/yr</div>
                <div style={{ fontSize: 11, color: VT.textDim, marginTop: 3, fontStyle: "italic" }}>{m.source || ""}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ LIFECYCLE SOLUTION ═══ */}
      {outreach.how_section && (
        <>
          <Panel glow={VT.green}>
            <VLabel color={VT.green}>03 — SIRION ACROSS YOUR LIFECYCLE</VLabel>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: VT.heading, color: VT.text, margin: "0 0 6px" }}>{outreach.how_section.headline}</h2>
            <p style={{ fontSize: 13, color: VT.textMuted, lineHeight: 1.6, margin: "0 0 16px" }}>{outreach.how_section.intro}</p>
            {lcData.length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={lcData}>
                  <defs><linearGradient id="lcGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={VT.green} stopOpacity={0.25} /><stop offset="95%" stopColor={VT.green} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke={VT.border} />
                  <XAxis dataKey="name" tick={{ fill: VT.textMuted, fontSize: 11 }} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: VT.textDim, fontSize: 11 }} axisLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={chartTip()} formatter={v => [`${v}%`, "Sirion Impact"]} />
                  <Area type="monotone" dataKey="score" stroke={VT.green} fill="url(#lcGrad)" strokeWidth={2.5} dot={{ fill: VT.green, r: 5, strokeWidth: 2, stroke: VT.card }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>
          {lcStages.map((ls,i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr 70px", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: VT.card, border: `1px solid ${VT.border}`, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${VT.green}12`, border: `1px solid ${VT.green}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{ls.icon || "📋"}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: VT.text, fontFamily: VT.heading }}>{ls.stage}</div>
                <div style={{ fontSize: 11, color: VT.red, lineHeight: 1.3, marginTop: 2 }}>{(ls.current_pain||"").length > 80 ? (ls.current_pain||"").substring(0,77)+"…" : ls.current_pain}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: VT.green, lineHeight: 1.3 }}>{(ls.sirion_solution||"").length > 80 ? (ls.sirion_solution||"").substring(0,77)+"…" : ls.sirion_solution}</div>
                <div style={{ display: "flex", gap: 3, marginTop: 4 }}>{(ls.key_features||[]).map((f,fi) => <VChip key={fi} text={f} color={VT.blue} />)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: VT.green, fontFamily: VT.heading }}>{ls.score || ls.impact_score || 0}%</div>
                <div style={{ fontSize: 11, color: VT.textDim, lineHeight: 1.2 }}>{ls.outcome || ""}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ═══ CTA ═══ */}
      {outreach.closing && (
        <div style={{ background: `linear-gradient(135deg, rgba(20,184,166,0.08), rgba(45,212,191,0.04))`, borderRadius: 18, border: `1px solid rgba(45,212,191,0.18)`, padding: "32px 28px", textAlign: "center", marginTop: 8 }}>
          <h3 style={{ fontSize: 22, fontWeight: 800, fontFamily: VT.heading, color: VT.text, margin: "0 0 10px" }}>{outreach.closing.cta_headline}</h3>
          <p style={{ fontSize: 14, color: VT.textMuted, lineHeight: 1.7, margin: 0, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>{outreach.closing.cta_body}</p>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ animation: "fadeUp 0.5s ease" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button onClick={handlePrint} style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${VT.green}30`, background: `${VT.green}12`, color: VT.green, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: VT.heading, display: "inline-flex", alignItems: "center", gap: 8 }}>📥 Download Outreach Report</button>
      </div>
      {reportBody}
      <div ref={printRef} className="print-container" style={{ display: "none" }}>
        <div style={{ width: 794, background: "#070C10", padding: "28px 32px", color: "#E8EAED", fontFamily: FONT.body }}>{reportBody}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HISTORY VIEW
   ═══════════════════════════════════════════ */

function HistoryView({ history, onSelect, onDelete, loading: histLoading, dbStatus, dbError }) {
  if (histLoading) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: VT.textDim }}>
      <div style={{ width: 32, height: 32, margin: "0 auto 14px", borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.06)", borderTopColor: "#3B82F6", animation: "spin 1s linear infinite" }} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>Loading from Firebase...</div>
    </div>
  );
  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <SectionTitle sub={`${history.length} analyses saved`}>Analysis History</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dbStatus === "connected" ? "#10B981" : dbStatus === "error" ? "#F59E0B" : "#F59E0B" }} />
          <span style={{ fontSize: 11, color: VT.textDim }}>
            {dbStatus === "connected" ? "Firebase Connected" : dbStatus === "error" ? "Setup Needed" : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Show Firebase setup guide if not connected */}
      {dbError && (
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#F59E0B", marginBottom: 4 }}>{"\u26A0"} Firebase Setup Required</div>
          <div style={{ fontSize: 11, color: VT.textDim, lineHeight: 1.6, marginTop: 6 }}>
            To save and view analysis history, enable Firestore in your Firebase Console:
          </div>
          <div style={{ fontSize: 11, color: VT.textMuted, lineHeight: 1.7, marginTop: 6, padding: "8px 12px", borderRadius: 6, background: VT.card }}>
            {"\u2460"} Open <strong style={{ color: VT.text }}>Firebase Console</strong> {"\u2192"} Select your project<br/>
            {"\u2461"} Click <strong style={{ color: VT.text }}>Cloud Firestore</strong> {"\u2192"} Create database<br/>
            {"\u2462"} Choose <strong style={{ color: VT.text }}>Test mode</strong> {"\u2192"} Select location {"\u2192"} Enable
          </div>
          <div style={{ fontSize: 11, color: VT.textDim, marginTop: 8, fontFamily: VT.mono }}>
            Analyses still work without Firebase {"\u2014"} they just won{"\u2019"}t persist between sessions.
          </div>
        </div>
      )}
      {!history.length && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: VT.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No analyses yet</div>
          <div style={{ fontSize: 13 }}>Run your first analysis — it'll be saved here automatically</div>
        </div>
      )}
      {history.map((h, i) => {
        const s = STAGE_CONFIG[h.data?.primary_stage] || STAGE_CONFIG.awareness;
        return (
          <button key={h._id || i} onClick={() => onSelect(h)} style={{
            width: "100%", textAlign: "left", background: VT.card,
            border: `1px solid ${VT.border}`, borderRadius: 12,
            padding: "16px 18px", marginBottom: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontFamily: FONT.body, transition: "all 0.2s"
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: VT.text, fontSize: 14, fontWeight: 600 }}>{h.data?.decision_maker?.company || "Unknown"}</span>
                {h.verification && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 700 }}>✓ VERIFIED</span>}
                {h.outreach && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "rgba(59,130,246,0.12)", color: "#3B82F6", fontWeight: 700 }}>OUTREACH</span>}
              </div>
              <div style={{ color: VT.textDim, fontSize: 12, marginTop: 2 }}>
                {h.data?.decision_maker?.name || ""} · {h.data?.decision_maker?.title || ""} · {h.timestamp instanceof Date ? h.timestamp.toLocaleDateString() : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{(h.data?.readiness_score || 0).toFixed?.(1) || "—"}</span>
              {onDelete && (
                <span onClick={(e) => onDelete(h, e)} style={{
                  width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(239,68,68,0.06)", color: "rgba(239,68,68,0.4)", fontSize: 12,
                  cursor: "pointer", border: "1px solid rgba(239,68,68,0.1)",
                  marginLeft: 4
                }}>×</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   INPUT FORM COMPONENT
   ═══════════════════════════════════════════ */

function InputForm({ onAnalyze, loading, m1Personas = [] }) {
  const [companyUrl, setCompanyUrl] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinCharCount, setLinkedinCharCount] = useState(0);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");

  const handleLinkedinChange = (e) => {
    const val = e.target.value;
    setLinkedinText(val);
    setLinkedinCharCount(val.length);
  };

  // When M1 persona selected, auto-fill fields
  const handlePersonaSelect = (personaId) => {
    setSelectedPersonaId(personaId);
    if (personaId) {
      const p = m1Personas.find(pp => pp.id === personaId);
      if (p) {
        if (p.rawLinkedinText) {
          setLinkedinText(p.rawLinkedinText);
          setLinkedinCharCount(p.rawLinkedinText.length);
        }
        if (p.companyUrl) setCompanyUrl(p.companyUrl);
      }
    }
  };

  const canSubmit = linkedinText.trim().length > 50 && !loading;

  const handleSubmit = () => {
    if (canSubmit) onAnalyze({ companyUrl: companyUrl.trim(), linkedinText: linkedinText.trim(), selectedPersonaId: selectedPersonaId || null });
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ textAlign: "center", paddingTop: 28, marginBottom: 30 }}>
        <div style={{ fontSize: 11, color: "#2DD4BF", letterSpacing: "0.16em", fontWeight: 700, marginBottom: 14 }}>CLM READINESS ANALYZER</div>
        <h1 style={{
          fontSize: 34, fontWeight: 700, lineHeight: 1.15, marginBottom: 10,
          color: VT.text
        }}>Know When They're Ready</h1>
        <p style={{ fontSize: 14, color: VT.textDim, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
          {m1Personas.length > 0
            ? "Select a researched persona from M1 or paste a LinkedIn profile + company URL."
            : "Paste a LinkedIn profile + company URL. We'll build a verified, personalized intelligence report."}
        </p>
      </div>

      {/* Value Proposition Preview */}
      <div style={{
        background: VT.card,
        border: `1px solid ${VT.border}`,
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, color: VT.textDim, letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase", marginBottom: 12, fontFamily: VT.heading }}>WHAT YOU'LL GET</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
          {[
            { icon: "\u25C9", color: "#F59E0B", text: "Buying stage classification (Awareness \u2192 Decision)" },
            { icon: "\u25CE", color: "#2DD4BF", text: "CLM readiness score (1\u201310) across 5 dimensions" },
            { icon: "\u25C8", color: "#3B82F6", text: "Personalized outreach timing recommendation" },
            { icon: "\u25C7", color: "#A78BFA", text: "Competitive positioning for this decision maker" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: item.color, fontSize: 10, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: 12, color: VT.textMuted, lineHeight: 1.5 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* M1 Persona Selector */}
      {m1Personas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#A78BFA" }}>M1</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: VT.text }}>Select Persona from M1 Research</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(74,222,128,0.1)", color: "#4ade80", fontWeight: 700 }}>{m1Personas.length} available</span>
          </div>
          <select
            value={selectedPersonaId}
            onChange={e => handlePersonaSelect(e.target.value)}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 12,
              background: VT.card, border: `1.5px solid ${selectedPersonaId ? "rgba(167,139,250,0.35)" : VT.border}`,
              color: VT.text, fontSize: 13, fontFamily: FONT.body,
              outline: "none", cursor: "pointer", transition: "border-color 0.3s",
            }}
          >
            <option value="">-- or paste LinkedIn below --</option>
            {m1Personas.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} \u2014 {p.title} at {p.company}
                {p.researchSummary ? " (researched)" : ""}
              </option>
            ))}
          </select>
          {selectedPersonaId && (
            <div style={{ fontSize: 11, color: "#A78BFA", marginTop: 6, paddingLeft: 4 }}>
              \u2713 Auto-filled from M1 research. Click "Run Deep Analysis" to proceed.
            </div>
          )}
        </div>
      )}

      {/* LinkedIn Paste Area */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>in</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: VT.text }}>LinkedIn Profile</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#EF4444", fontWeight: 700 }}>REQUIRED</span>
          </div>
          {linkedinCharCount > 0 && (
            <span style={{ fontSize: 11, color: linkedinCharCount > 100 ? "#10B981" : "#F59E0B" }}>
              {linkedinCharCount > 100 ? "✓ Good amount of data" : "Paste more profile data"}
            </span>
          )}
        </div>
        <div style={{
          background: VT.card, borderRadius: 12,
          border: `1.5px solid ${linkedinText.length > 100 ? "rgba(16,185,129,0.25)" : VT.border}`,
          transition: "border-color 0.3s"
        }}>
          <textarea
            value={linkedinText}
            onChange={handleLinkedinChange}
            placeholder={"Go to the decision maker's LinkedIn profile → Ctrl+A (select all) → Ctrl+C (copy) → Ctrl+V (paste here)\n\nThis gives us their exact title, work history, skills, certifications, activity, and more — making the analysis significantly richer and more accurate."}
            rows={8}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: VT.text, fontSize: 13, padding: "16px", fontFamily: FONT.body,
              resize: "vertical", lineHeight: 1.6, minHeight: 160
            }}
          />
          {linkedinText.length > 100 && (
            <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${VT.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: VT.textDim }}>Detected:</span>
              {linkedinText.includes("Experience") && <Chip text="Work History" color="#10B981" />}
              {linkedinText.includes("Education") && <Chip text="Education" color="#3B82F6" />}
              {linkedinText.includes("Skills") && <Chip text="Skills" color="#8B5CF6" />}
              {linkedinText.includes("About") && <Chip text="About Section" color="#F59E0B" />}
              {linkedinText.includes("Activity") && <Chip text="Activity" color="#EF4444" />}
              {(linkedinText.includes("Certifications") || linkedinText.includes("Licenses")) && <Chip text="Certifications" color="#10B981" />}
            </div>
          )}
        </div>
      </div>

      {/* Company URL */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🌐</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: VT.text }}>Company Website URL</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: VT.card, color: VT.textDim, fontWeight: 600 }}>RECOMMENDED</span>
        </div>
        <div style={{
          background: VT.card, borderRadius: 12,
          border: `1.5px solid ${companyUrl.startsWith("http") ? "rgba(16,185,129,0.25)" : VT.border}`,
          display: "flex", alignItems: "center", padding: "0 4px", transition: "border-color 0.3s"
        }}>
          <span style={{ padding: "0 10px", fontSize: 13, color: VT.textDim }}>https://</span>
          <input
            type="text"
            value={companyUrl}
            onChange={e => setCompanyUrl(e.target.value)}
            placeholder="www.company.com"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: VT.text, fontSize: 14, padding: "14px 8px", fontFamily: FONT.body
            }}
          />
          {companyUrl.startsWith("http") && (
            <span style={{ padding: "0 10px", fontSize: 11, color: "#10B981" }}>✓ Will be fetched</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: VT.textDim, marginTop: 6, paddingLeft: 4 }}>
          💡 The system will fetch this page directly for official company data — unlike LinkedIn, this is fully accessible
        </div>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={!canSubmit} style={{
        width: "100%", padding: "16px", borderRadius: 12, border: "none",
        background: canSubmit ? "linear-gradient(135deg, #14B8A6, #0D9488)" : VT.card,
        color: "#fff", fontSize: 15, fontWeight: 700, cursor: canSubmit ? "pointer" : "default",
        fontFamily: FONT.body, opacity: canSubmit ? 1 : 0.3, transition: "all 0.2s",
        letterSpacing: "0.02em"
      }}>
        {loading ? "Analyzing..." : "🔬 Run Deep Analysis + Verification"}
      </button>

      {/* Data Sources */}
      <div style={{ marginTop: 10, textAlign: "center" }}>
        <span style={{ fontSize: 11, color: VT.textDim }}>
          3-Pass engine: ⚡ Preprocess → 🔍 Deep Research → 🔒 Verify
        </span>
      </div>

      {/* How it works */}
      <div style={{ marginTop: 40 }}>
        <SectionTitle>3-Pass Engine: How It Works</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { source: "⚡ LinkedIn Preprocessing", reliability: "Instant", color: "#F59E0B", detail: "Strips noise, extracts only name, title, history, skills — reduces 50K chars to ~2K" },
            { source: "Company Website (fetched)", reliability: "100%", color: "#10B981", detail: "Official company data, leadership, news, press releases" },
            { source: "Web Search (AI)", reliability: "95%+", color: "#3B82F6", detail: "Tech stack, hiring patterns, M&A news, competitor signals" },
            { source: "Verification Pass", reliability: "Cross-checked", color: "#8B5CF6", detail: "Every claim re-searched and corrected before you see the report" }
          ].map((s, i) => (
            <div key={i} style={{ padding: 14, borderRadius: 10, background: VT.card, border: `1px solid ${s.color}18` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: VT.text }}>{s.source}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.reliability}</span>
              </div>
              <div style={{ fontSize: 11, color: VT.textDim, lineHeight: 1.5 }}>{s.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */

const NAV_ITEMS = [
  { id: "analyze", icon: "🔬", label: "Analyze" },
  { id: "report", icon: "📊", label: "Report" },
  { id: "outreach", icon: "🎯", label: "Outreach" },
  { id: "history", icon: "📋", label: "History" }
];

const ANALYSIS_STEPS = [
  "⚡ Cleaning LinkedIn data (fast pass)...",
  "⚡ Extracting profile essentials...",
  "Fetching company website...",
  "Searching tech stack & tools...",
  "Analyzing hiring patterns...",
  "Scanning M&A & growth signals...",
  "Checking competitor CLM usage...",
  "Building report..."
];
const OUTREACH_STEPS = [
  "Loading verified analysis...",
  "Researching industry benchmarks...",
  "Calculating waste metrics...",
  "Mapping Sirion to lifecycle stages...",
  "Personalizing with LinkedIn insights...",
  "Generating outreach report..."
];

export default function SirionDashboard({ user, onSignOut }) {
  const _globalTheme = useTheme();
  Object.assign(VT, _globalTheme.mode === "light" ? VT_LIGHT : VT_DARK);
  const { pipeline, updateModule } = usePipeline();
  const [nav, setNav] = useState("analyze");
  const [analysisData, setAnalysisData] = useState(null);
  const [verificationData, setVerificationData] = useState(null);
  const [outreachData, setOutreachData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState("connecting"); // connecting | connected | error
  const [dbError, setDbError] = useState(null);

  // ═══ LOAD HISTORY FROM FIREBASE ON STARTUP ═══
  useEffect(() => {
    (async () => {
      try {
        // Test connection first
        const test = await db.test();
        if (!test.ok) {
          setDbStatus("error");
          setDbError(test.error);
          setHistoryLoading(false);
          return;
        }
        setDbStatus("connected");

        // Load history
        const docs = await db.getAll("analyses");
        if (docs && docs.length > 0) {
          const mapped = docs.map(doc => ({
            _id: doc._id,
            data: doc.analysis_data || {},
            verification: doc.verification_data || null,
            outreach: doc.outreach_data || null,
            timestamp: doc.created_at ? new Date(doc.created_at) : new Date(),
            companyUrl: doc.company_url || ""
          }));
          setHistory(mapped);
        }
      } catch (e) {
        console.error("Firebase startup failed:", e);
        setDbStatus("error");
        setDbError(e.message);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const runAnalysis = async ({ companyUrl, linkedinText, selectedPersonaId }) => {
    setLoading(true); setLoadingType("analysis"); setError("");
    setAnalysisData(null); setVerificationData(null); setOutreachData(null);
    setCurrentDocId(null);
    setLoadingStep(0);

    try {
      // ═══ PASS 0: LinkedIn Preprocessing (FAST, no web search) ═══
      let cleanedProfile;
      try {
        cleanedProfile = await callClaudeFast(
          LINKEDIN_CLEANUP_PROMPT,
          `Extract the structured profile data from this raw LinkedIn copy-paste. Strip all noise. Return ONLY valid JSON.\n\nRAW TEXT:\n${linkedinText}`
        );
        setLoadingStep(1);
      } catch (e) {
        console.warn("LinkedIn cleanup failed, using truncated raw:", e);
        cleanedProfile = { name: "Unknown", raw_fallback: linkedinText.substring(0, 3000) };
        setLoadingStep(1);
      }

      setLoadingStep(2);
      const stepInterval = setInterval(() => setLoadingStep(p => p < 7 ? p + 1 : p), 3500);

      // ═══ PASS 1: Deep Research (with clean data — much faster) ═══
      let userMsg = `CLEANED LINKEDIN PROFILE DATA:\n${JSON.stringify(cleanedProfile, null, 2)}\n\n`;
      if (companyUrl) {
        userMsg += `COMPANY WEBSITE URL (please fetch this URL for official company data): ${companyUrl}\n\n`;
      }
      userMsg += `Today is ${TODAY}. Use the cleaned LinkedIn data above as the primary source for the decision maker. Then do thorough web searches for the company's tech stack, hiring, M&A, and CLM signals. For EVERY M&A deal, verify its CURRENT status with a separate search. Return ONLY valid JSON.`;

      const analysisResult = await callClaude(ANALYSIS_PROMPT, userMsg);
      clearInterval(stepInterval);

      // Show report IMMEDIATELY
      setAnalysisData(analysisResult);
      setNav("report");

      // ═══ PUSH TO PIPELINE (M4 output → M5) ═══
      updateModule("m4", {
        analyses: [...(pipeline.m4.analyses || []), {
          person: analysisResult.decision_maker?.name || "Unknown",
          company: analysisResult.decision_maker?.company || "Unknown",
          title: analysisResult.decision_maker?.title || "",
          stage: analysisResult.primary_stage || "",
          readiness: analysisResult.readiness_score || 0,
          analyzedAt: new Date().toISOString(),
        }],
        latestStage: analysisResult.primary_stage || null,
        latestReadiness: analysisResult.readiness_score || 0,
        analyzedAt: new Date().toISOString(),
        // Phase 3: Generation tracking
        generationId: new Date().toISOString(),
      });

      // ═══ SAVE TO FIREBASE (background, but track status) ═══
      const docId = await db.save("analyses", {
        analysis_data: analysisResult,
        verification_data: null,
        outreach_data: null,
        cleaned_profile: cleanedProfile,
        company_url: companyUrl || "",
        company_name: analysisResult.decision_maker?.company || "Unknown",
        person_name: analysisResult.decision_maker?.name || "Unknown",
        person_title: analysisResult.decision_maker?.title || "",
        primary_stage: analysisResult.primary_stage || "",
        readiness_score: analysisResult.readiness_score || 0,
        verified: false,
        created_at: new Date().toISOString()
      });

      if (docId) {
        setCurrentDocId(docId);
        setDbStatus("connected");
        // Update local history
        const newEntry = {
          _id: docId,
          data: analysisResult,
          verification: null,
          outreach: null,
          timestamp: new Date(),
          companyUrl: companyUrl || ""
        };
        setHistory(prev => [newEntry, ...prev].slice(0, 30));
      } else {
        // Save failed — show error but don't block the report
        setDbStatus("error");
        setDbError(db.getLastError());
      }

      // ═══ UPDATE M1 PERSONA (if selected from M1 bridge) ═══
      if (selectedPersonaId) {
        try {
          await updatePersona(selectedPersonaId, {
            m4AnalysisId: docId || null,
            m4Stage: analysisResult.primary_stage || null,
            m4ReadinessScore: analysisResult.readiness_score || 0,
            m4AnalyzedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn("Failed to update M1 persona:", e);
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false); setLoadingType(null);
    }
  };

  // ═══ VERIFICATION — On-demand, triggered by user ═══
  const runVerification = async () => {
    if (!analysisData) return;
    setVerifying(true); setVerificationError("");
    try {
      const companyName = analysisData.decision_maker?.company || "";
      const personName = analysisData.decision_maker?.name || "";
      const result = await callClaude(
        VERIFICATION_PROMPT,
        `Quick-verify this report. Company: ${companyName}. Person: ${personName}. Do max 2-3 searches. Focus on: deal statuses, role confirmation, company ownership.\nReport:\n${JSON.stringify({ summary: analysisData.summary, company_profile: analysisData.company_profile, decision_maker: analysisData.decision_maker, risk_factors: analysisData.risk_factors }, null, 1)}\nReturn ONLY JSON.`,
        90000
      );
      setVerificationData(result);

      // Apply corrections to the report
      const corrected = mergeCorrections(analysisData, result);
      setAnalysisData(corrected);

      // ═══ UPDATE FIREBASE (background) ═══
      if (currentDocId) {
        db.update("analyses", currentDocId, {
          analysis_data: corrected,
          verification_data: result,
          verified: true,
          verified_at: new Date().toISOString()
        });
      }

      // Update local history
      setHistory(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(h => h._id === currentDocId);
        if (idx >= 0) { updated[idx] = { ...updated[idx], data: corrected, verification: result }; }
        return updated;
      });
    } catch (err) {
      setVerificationError(err.message || "Verification timed out. You can try again.");
    } finally {
      setVerifying(false);
    }
  };

  const generateOutreach = async () => {
    if (!analysisData) return;
    setLoading(true); setLoadingType("outreach"); setError("");
    setLoadingStep(0);
    const stepInterval = setInterval(() => setLoadingStep(p => p < 5 ? p + 1 : p), 4000);
    try {
      const prompt = OUTREACH_PROMPT.replace("{ANALYSIS_DATA}", JSON.stringify(analysisData)).replace("{VERIFICATION_DATA}", JSON.stringify(verificationData || {}));
      const result = await callClaude(prompt, `Generate a PERSONALIZED outreach report using verified data and LinkedIn insights. Use real CLM industry stats. Return ONLY valid JSON.`);
      setOutreachData(result);
      setNav("outreach");

      // ═══ UPDATE FIREBASE (background) ═══
      if (currentDocId) {
        db.update("analyses", currentDocId, {
          outreach_data: result,
          outreach_generated_at: new Date().toISOString()
        });
      }

      // Update local history
      setHistory(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(h => h._id === currentDocId);
        if (idx >= 0) { updated[idx] = { ...updated[idx], outreach: result }; }
        return updated;
      });
    } catch (err) { setError(err.message); } finally {
      clearInterval(stepInterval);
      setLoading(false); setLoadingType(null);
    }
  };

  // ═══ LOAD FROM HISTORY ═══
  const loadFromHistory = (entry) => {
    setAnalysisData(entry.data);
    setVerificationData(entry.verification || null);
    setOutreachData(entry.outreach || null);
    setCurrentDocId(entry._id || null);
    setNav("report");
  };

  // ═══ DELETE FROM HISTORY ═══
  const deleteFromHistory = async (entry, e) => {
    e.stopPropagation();
    if (entry._id) { db.delete("analyses", entry._id); }
    setHistory(prev => prev.filter(h => h._id !== entry._id));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: VT.bg, color: VT.text, fontFamily: FONT.body }}>
      <style>{`
        @import url('${GOOGLE_FONTS_URL}');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 12px rgba(59,130,246,0.15); } 50% { box-shadow: 0 0 24px rgba(59,130,246,0.3); } }
        input::placeholder, textarea::placeholder { color: ${_globalTheme.mode === "light" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.2)"}; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${_globalTheme.mode === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)"}; border-radius: 3px; }
        button:hover { filter: brightness(1.08); }
        @media print {
          body, html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .screen-hide-print { display: none !important; }
          .print-container { display: block !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* ═══ SIDEBAR ═══ */}
      <div style={{ width: 230, borderRight: `1px solid ${VT.border}`, background: _globalTheme.mode === "light" ? "rgba(240,240,245,0.97)" : "rgba(10,15,20,0.95)", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "20px 18px", borderBottom: `1px solid ${VT.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #14B8A6, #2DD4BF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#070C10", boxShadow: "0 0 20px rgba(45,212,191,0.25)" }}>S</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: VT.text }}>Sirion</div>
              <div style={{ fontSize: 11, color: "rgba(45,212,191,0.5)", letterSpacing: "0.08em", fontWeight: 600 }}>INTELLIGENCE</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 10px", flex: 1 }}>
          <div style={{ fontSize: 11, color: VT.textDim, letterSpacing: "0.12em", fontWeight: 700, padding: "8px 10px 6px", marginBottom: 2 }}>WORKSPACE</div>
          {NAV_ITEMS.map(item => {
            const active = nav === item.id;
            const disabled = (item.id === "outreach" && !outreachData);
            return (
              <button key={item.id} onClick={() => !disabled && !loading && setNav(item.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10, border: "none",
                background: active ? "rgba(45,212,191,0.10)" : "transparent",
                color: disabled ? VT.textDim : active ? VT.text : VT.textMuted,
                fontSize: 13, fontWeight: active ? 600 : 400, cursor: disabled || loading ? "default" : "pointer",
                fontFamily: FONT.body, textAlign: "left",
                borderLeft: active ? "2px solid #2DD4BF" : "2px solid transparent",
                transition: "all 0.15s", marginBottom: 2
              }}>
                <span style={{ fontSize: 16, opacity: disabled ? 0.3 : 1 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === "report" && analysisData && (
                  <span style={{ marginLeft: "auto", fontSize: 11, padding: "1px 6px", borderRadius: 8, background: verificationData ? "rgba(16,185,129,0.12)" : VT.card, color: verificationData ? "#10B981" : VT.textDim, fontWeight: 700 }}>{verificationData ? "✓" : "○"}</span>
                )}
                {item.id === "history" && history.length > 0 && <span style={{ marginLeft: "auto", fontSize: 11, padding: "1px 7px", borderRadius: 10, background: VT.card, color: VT.textDim }}>{history.length}</span>}
              </button>
            );
          })}

          {analysisData && !outreachData && !loading && (
            <div style={{ marginTop: 16, padding: "0 4px" }}>
              <button onClick={generateOutreach} style={{
                width: "100%", padding: "12px 14px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #14B8A6, #0D9488)",
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: FONT.body, boxShadow: "0 0 20px rgba(45,212,191,0.2)"
              }}>🎯 Generate Outreach Report</button>
            </div>
          )}

          {analysisData && !loading && (
            <div style={{ marginTop: 20, padding: "0 8px" }}>
              <div style={{ fontSize: 11, color: VT.textDim, letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>DATA STATUS</div>
              <div style={{
                padding: "10px 12px", borderRadius: 10,
                background: verificationData ? (verificationData.corrections_needed > 0 ? "rgba(245,158,11,0.06)" : "rgba(16,185,129,0.06)") : VT.card,
                border: `1px solid ${verificationData ? (verificationData.corrections_needed > 0 ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)") : VT.border}`
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>{verificationData ? (verificationData.corrections_needed > 0 ? "⟳" : "🛡️") : verifying ? "⏳" : "○"}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: verificationData ? (verificationData.corrections_needed > 0 ? "#F59E0B" : "#10B981") : verifying ? "#F59E0B" : VT.textDim }}>
                    {verificationData ? (verificationData.corrections_needed > 0 ? `${verificationData.corrections_needed} Corrected` : "Verified ✓") : verifying ? "Verifying..." : "Not yet verified"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: VT.textDim }}>
                  {verificationData ? `${verificationData.total_claims_checked} claims checked` : "Click verify in report"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${VT.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2DD4BF", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, color: VT.textDim }}>AI Research Engine</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dbStatus === "connected" ? "#10B981" : dbStatus === "error" ? "#F59E0B" : "#F59E0B" }} />
            <span style={{ fontSize: 11, color: VT.textDim }}>
              {dbStatus === "connected" ? "Firebase Connected" : dbStatus === "error" ? "Firebase: Setup Needed" : "Connecting..."}
            </span>
          </div>
          {dbError && (
            <div style={{ fontSize: 11, color: "rgba(245,158,11,0.7)", marginTop: 4, lineHeight: 1.4 }}>
              Enable Firestore in Firebase Console to save analyses
            </div>
          )}
          {analysisData && <div style={{ marginTop: 6, fontSize: 11, color: VT.textDim }}>Active: {analysisData.decision_maker?.company}</div>}
          {user && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${VT.border}` }}>
              <div style={{ fontSize: 11, color: VT.textDim, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>👤 {user.email}</div>
              <button onClick={onSignOut} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${VT.border}`, background: _globalTheme.mode === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.02)", color: VT.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div style={{ flex: 1, overflowY: "auto", maxHeight: "100vh" }}>
        <div style={{
          padding: "14px 28px", borderBottom: `1px solid ${VT.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: _globalTheme.mode === "light" ? "rgba(247,247,248,0.85)" : "rgba(7,12,16,0.85)", backdropFilter: "blur(20px)",
          position: "sticky", top: 0, zIndex: 50
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: VT.textMuted }}>
              {nav === "analyze" && "🔬 Decision Maker Analysis"}
              {nav === "report" && "📊 Verified Readiness Report"}
              {nav === "outreach" && "🎯 Outreach Report"}
              {nav === "history" && "📋 Analysis History"}
            </span>
            {nav === "report" && (
              verificationData
                ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)", fontWeight: 600 }}>🔒 VERIFIED</span>
                : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: VT.card, color: VT.textDim, border: `1px solid ${VT.border}`, fontWeight: 600 }}>UNVERIFIED</span>
            )}
          </div>
          {analysisData && nav !== "analyze" && !loading && (
            <button onClick={() => { setAnalysisData(null); setVerificationData(null); setOutreachData(null); setCurrentDocId(null); setNav("analyze"); }} style={{
              background: _globalTheme.mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)", border: `1px solid ${VT.border}`,
              color: VT.textMuted, fontSize: 12, padding: "6px 14px",
              borderRadius: 8, cursor: "pointer", fontFamily: FONT.body
            }}>+ New Analysis</button>
          )}
        </div>

        <div style={{ maxWidth: 780, margin: "0 auto", padding: "28px 24px 60px" }}>
          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
              <span style={{ color: "#EF4444", fontWeight: 600, fontSize: 13 }}>Error</span>
              <p style={{ color: VT.textMuted, fontSize: 12, marginTop: 4 }}>{error}</p>
            </div>
          )}

          {nav === "analyze" && !loading && <InputForm onAnalyze={runAnalysis} loading={loading} m1Personas={pipeline.m1?.personaProfiles || []} />}
          {loading && <LoadingState steps={loadingType === "outreach" ? OUTREACH_STEPS : ANALYSIS_STEPS} step={loadingStep} title={loadingType === "outreach" ? "Generating Outreach Report..." : loadingStep < 2 ? "⚡ Preprocessing LinkedIn..." : "Deep Research in Progress..."} />}
          {nav === "report" && !loading && analysisData && <AnalysisView data={analysisData} verification={verificationData} verifying={verifying} verificationError={verificationError} onVerify={runVerification} m1Questions={pipeline.m1?.questions || []} />}
          {nav === "report" && !loading && !analysisData && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>{"\uD83D\uDCCA"}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: VT.text, marginBottom: 8 }}>No Analysis Yet</div>
              <div style={{ fontSize: 13, color: VT.textMuted, maxWidth: 400, lineHeight: 1.6 }}>
                Select a persona from the Analyze tab and run an analysis. The report will auto-populate here with buying stage insights, readiness scores, and personalized recommendations.
              </div>
              <button onClick={() => setNav("analyze")} style={{
                marginTop: 20, padding: "10px 24px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #14B8A6, #0D9488)",
                color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Go to Analyze</button>
            </div>
          )}
          {nav === "outreach" && !loading && <OutreachView outreach={outreachData} analysisData={analysisData} />}
          {nav === "history" && !loading && <HistoryView history={history} onSelect={loadFromHistory} onDelete={deleteFromHistory} loading={historyLoading} dbStatus={dbStatus} dbError={dbError} />}
        </div>
      </div>
    </div>
  );
}

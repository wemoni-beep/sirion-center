import { FONT } from "./typography";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell, Legend, LineChart, Line,
  PieChart, Pie
} from "recharts";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { runScan, testConnections, getAvailableLLMs, buildExportPayload, computeScores, NARRATIVE_CLASSES, computeNarrativeBreakdown, DEFAULT_CALIBRATION, loadCalibration, saveCalibration, SCAN_MODES } from "./scanEngine";
import { callClaudeFast } from "./claudeApi.js";
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
   LENS 1: EXTERNAL RESEARCH
   Sources: Sirion AI Visibility Report (10 curated questions)
            + Sirion Intelligence Hub (58-URL Web Audit)
   These represent the BASELINE — what AI defaults to
   when asked broad CLM questions, driven by internet
   training data and Sirion's own website content.
   ─────────────────────────────────────────────── */
const EXTERNAL_RESEARCH = {
  _source: "Sirion AI Visibility Report + 58-URL Web Audit",
  _methodology: "10 curated decision-maker questions + web content analysis",

  defaultNarrative: {
    label: "Post-Signature Specialist",
    evidence: ["Post-signature", "Obligations", "SLAs", "Performance tracking", "Value leakage"],
    finding: "18 sources reinforce post-sig, only 5 support full lifecycle",
    rootCause: "Content architecture problem, not a product problem",
  },
  productReality: {
    claim: "AI-Native, Full-Lifecycle CLM",
    gartnerNote: "Rated #1 across ALL 4 use cases including pre-signature",
    gartnerContrast: "But AI platforms only describe post-signature capabilities",
  },
  benchmarks: {
    visibility: { Sirion: 37, Icertis: 46, Ironclad: 30 },
    hitRates: { chatgpt: 40, gemini: 50, claude: 60 },
    aiAudience: { Sirion: "12.96M", Icertis: "11.13M", Ironclad: "6.31M" },
    totalMentions: { Sirion: 841, Icertis: 1160, Ironclad: 478 },
    citedPages: { Sirion: 708, Icertis: 545, Ironclad: 901 },
  },
  competitorNarratives: {
    Sirion: ["Post-signature", "Obligations", "SLAs", "Performance tracking", "Value leakage"],
    Icertis: ["Enterprise risk", "Compliance", "Governance-first", "Global scale", "Pharma leader"],
    Ironclad: ["Speed", "Pre-signature velocity", "Self-service", "Legal workflow", "Digital-first"],
  },
  keyQuote: "If you are performance-first post-signature (obligations, SLAs, ongoing value realization), Sirion is often positioned that way.",
  contentGaps: [
    { topic: "Letter of Intent & LOI Templates", volume: "92.96K", visibility: 0, priority: "High" },
    { topic: "Digital & Electronic Signatures", volume: "53.53K", visibility: 0, priority: "High" },
    { topic: "Consulting/Freelance Contract Templates", volume: "22.03K", visibility: 0, priority: "High" },
    { topic: "AI-Driven Contract Drafting", volume: "490", visibility: 0, priority: "Medium" },
    { topic: "Salesforce Contract Management", volume: "2.23K", visibility: 0, priority: "Medium" },
  ],
};


/* ───────────────────────────────────────────────
   PERCEPTION CLUSTER DATA — animated scatter plot
   Red cluster = what AI defaults to (post-sig)
   Teal cluster = what Sirion actually is (full-stack)
   ─────────────────────────────────────────────── */
const PERCEPTION_CLUSTERS = {
  clusterA: {
    label: "What AI Defaults To",
    color: T_DARK.red,
    center: { x: 25, y: 55 },
    items: [
      { label: "Post-signature", x: 20, y: 50 },
      { label: "Obligations", x: 30, y: 60 },
      { label: "SLAs", x: 18, y: 65 },
      { label: "Performance tracking", x: 32, y: 48 },
      { label: "Value leakage", x: 22, y: 42 },
    ],
  },
  clusterB: {
    label: "What Sirion Actually Is",
    color: T_DARK.teal,
    center: { x: 72, y: 42 },
    items: [
      { label: "Full lifecycle CLM", x: 68, y: 36 },
      { label: "Pre-sig authoring", x: 75, y: 48 },
      { label: "AI redlining", x: 78, y: 34 },
      { label: "Negotiation workflows", x: 70, y: 52 },
      { label: "Analytics & insights", x: 80, y: 42 },
      { label: "Gartner #1 all 4 uses", x: 64, y: 30 },
    ],
  },
};

/* ───────────────────────────────────────────────
   DENDROGRAM DATA — competitive territory map
   How AI currently slots each vendor
   ─────────────────────────────────────────────── */
const DENDROGRAM_DATA = {
  root: "CLM Market",
  children: [
    { name: "Post-Signature", color: T_DARK.red, children: [
      { name: "Sirion", vendor: true, features: ["Obligations", "SLAs", "Performance"] },
    ]},
    { name: "Governance & Risk", color: T_DARK.purple, children: [
      { name: "Icertis", vendor: true, features: ["Compliance", "Risk", "Global scale"] },
    ]},
    { name: "Speed & Pre-Sig", color: T_DARK.gold, children: [
      { name: "Ironclad", vendor: true, features: ["Self-service", "Legal workflow", "Digital-first"] },
    ]},
  ],
};

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

// Preserve full_response for the Report tab's expandable AI response viewer.
// Individual result docs are ~5-10KB with full text — well under Firestore's 1MB limit.
function stripForFirebase(result) {
  if (!result?.analyses) return result;
  const stripped = { ...result, analyses: {} };
  for (const [llm, analysis] of Object.entries(result.analyses)) {
    stripped.analyses[llm] = { ...analysis };
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
/* ─── Animated Perception Cluster — Professional scatter plot ─── */
function PerceptionCluster({ clusters, height = 320 }) {
  if (!clusters?.clusterA || !clusters?.clusterB) return null;
  const cA = clusters.clusterA, cB = clusters.clusterB;
  const [phase, setPhase] = useState(0);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1200),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const isDk = T.card === "#111921";

  /* ── Layout: two equal circles with gap zone in between ── */
  const W = 600, H = 300;
  const R = 110;                       // circle radius — equal for both
  const centerY = H / 2;              // vertical center
  const gapW = 80;                     // negative space between circles
  const cxA = R + 20;                  // left circle center
  const cxB = W - R - 20;             // right circle center
  const midX = W / 2;                 // gap zone center

  /* ── Map data items into circle-local coords (random spread inside radius) ── */
  const spreadItems = (items, cx, cy) => items.map((d, i) => {
    // Deterministic spread — use index for angle, hash label length for distance
    const angle = (i / items.length) * Math.PI * 2 + (i * 0.7);
    const dist = R * 0.3 + (R * 0.45) * ((d.label.length * 7 + i * 13) % 100) / 100;
    return { ...d, px: cx + Math.cos(angle) * dist, py: cy + Math.sin(angle) * dist };
  });

  const aItems = spreadItems(cA.items, cxA, centerY);
  const bItems = spreadItems(cB.items, cxB, centerY);

  /* ── Colors ── */
  const circBgA = isDk ? `${cA.color}08` : `${cA.color}06`;
  const circBgB = isDk ? `${cB.color}08` : `${cB.color}06`;
  const borderA = isDk ? `${cA.color}40` : `${cA.color}30`;
  const borderB = isDk ? `${cB.color}40` : `${cB.color}30`;
  const gapBg = isDk ? "rgba(17,25,33,0.95)" : "rgba(255,255,255,0.95)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height}
      style={{ overflow: "visible", fontFamily: T.fontB }}>
      <defs>
        <radialGradient id="pcRadA" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={cA.color} stopOpacity={isDk ? 0.07 : 0.05} />
          <stop offset="100%" stopColor={cA.color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pcRadB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={cB.color} stopOpacity={isDk ? 0.07 : 0.05} />
          <stop offset="100%" stopColor={cB.color} stopOpacity="0" />
        </radialGradient>
        <filter id="pcShadow"><feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.3" /></filter>
      </defs>

      {/* ── Left circle: What AI Defaults To ── */}
      <g opacity={phase >= 1 ? 1 : 0} style={{ transition: "opacity 0.8s ease" }}>
        <circle cx={cxA} cy={centerY} r={R} fill="url(#pcRadA)" />
        <circle cx={cxA} cy={centerY} r={R} fill="none"
          stroke={borderA} strokeWidth="1.5" />
        {/* Circle label — top */}
        <text x={cxA} y={centerY - R - 12} textAnchor="middle"
          fill={cA.color} fontSize="10" fontWeight="700" fontFamily={T.fontM}
          letterSpacing="0.8" opacity={0.9}>{cA.label}</text>
      </g>

      {/* ── Right circle: What Sirion Actually Is ── */}
      <g opacity={phase >= 1 ? 1 : 0} style={{ transition: "opacity 0.8s ease" }}>
        <circle cx={cxB} cy={centerY} r={R} fill="url(#pcRadB)" />
        <circle cx={cxB} cy={centerY} r={R} fill="none"
          stroke={borderB} strokeWidth="1.5" />
        {/* Circle label — top */}
        <text x={cxB} y={centerY - R - 12} textAnchor="middle"
          fill={cB.color} fontSize="10" fontWeight="700" fontFamily={T.fontM}
          letterSpacing="0.8" opacity={0.9}>{cB.label}</text>
      </g>

      {/* ── PERCEPTION GAP — centered between circles, 2 lines ── */}
      <g opacity={phase >= 2 ? 1 : 0} style={{ transition: "opacity 0.8s ease" }}>
        <rect x={midX - 44} y={centerY - 20} width={88} height={40} rx={6}
          fill={gapBg} stroke={T.gold} strokeWidth="1" opacity={0.9} />
        <text x={midX} y={centerY - 4} textAnchor="middle"
          fill={T.gold} fontSize="9" fontWeight="800" fontFamily={T.fontM}
          letterSpacing="2.5">PERCEPTION</text>
        <text x={midX} y={centerY + 12} textAnchor="middle"
          fill={T.gold} fontSize="9" fontWeight="800" fontFamily={T.fontM}
          letterSpacing="2.5">GAP</text>
      </g>

      {/* ── Dots — cluster A (left) ── */}
      {aItems.map((d, i) => (
        <g key={"a" + i} opacity={phase >= 2 ? 1 : 0}
          style={{ transition: `opacity 0.5s ease ${i * 0.08}s`, cursor: "pointer" }}
          onMouseEnter={() => setHovered("a" + i)} onMouseLeave={() => setHovered(null)}>
          <circle cx={d.px} cy={d.py} r={6}
            fill={cA.color} opacity={0.85} />
          <circle cx={d.px} cy={d.py} r={6}
            fill="none" stroke={isDk ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)"} strokeWidth="1" />
          {/* Inner highlight */}
          <circle cx={d.px - 1.5} cy={d.py - 1.5} r={1.8}
            fill={isDk ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)"} />
          {/* Hover tooltip */}
          {hovered === "a" + i && (
            <g filter="url(#pcShadow)">
              <rect x={d.px - d.label.length * 3.2 - 8} y={d.py - 28}
                width={d.label.length * 6.4 + 16} height={20} rx={4}
                fill={isDk ? "#1a2332" : "#fff"} stroke={cA.color} strokeWidth="0.8" />
              <text x={d.px} y={d.py - 15} textAnchor="middle"
                fill={T.text} fontSize="9" fontWeight="600" fontFamily={T.fontB}>{d.label}</text>
            </g>
          )}
        </g>
      ))}

      {/* ── Dots — cluster B (right) ── */}
      {bItems.map((d, i) => (
        <g key={"b" + i} opacity={phase >= 2 ? 1 : 0}
          style={{ transition: `opacity 0.5s ease ${i * 0.08}s`, cursor: "pointer" }}
          onMouseEnter={() => setHovered("b" + i)} onMouseLeave={() => setHovered(null)}>
          <circle cx={d.px} cy={d.py} r={6}
            fill={cB.color} opacity={0.85} />
          <circle cx={d.px} cy={d.py} r={6}
            fill="none" stroke={isDk ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)"} strokeWidth="1" />
          {/* Inner highlight */}
          <circle cx={d.px - 1.5} cy={d.py - 1.5} r={1.8}
            fill={isDk ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)"} />
          {/* Hover tooltip */}
          {hovered === "b" + i && (
            <g filter="url(#pcShadow)">
              <rect x={d.px - d.label.length * 3.2 - 8} y={d.py - 28}
                width={d.label.length * 6.4 + 16} height={20} rx={4}
                fill={isDk ? "#1a2332" : "#fff"} stroke={cB.color} strokeWidth="0.8" />
              <text x={d.px} y={d.py - 15} textAnchor="middle"
                fill={T.text} fontSize="9" fontWeight="600" fontFamily={T.fontB}>{d.label}</text>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ─── Animated Competitor Dendrogram — Professional elbow-connected tree ─── */
function CompetitorDendrogram({ data, dynamicFeatures }) {
  if (!data?.children) return null;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 1700),
      setTimeout(() => setPhase(5), 2200),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const isDk = T.card === "#111921";
  const W = 540, H = 280;
  const rootY = 32, catY = 110, vendY = 190, tagStartY = 218;
  const n = data.children.length;
  const sp = W / (n + 1);
  const connColor = isDk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: "visible" }}>
      <defs>
        <filter id="dendShadow"><feDropShadow dx="0" dy="1" stdDeviation="2" floodColor={isDk ? "#000" : "#999"} floodOpacity="0.15" /></filter>
      </defs>

      {/* Root node — pill shape */}
      <g opacity={phase >= 1 ? 1 : 0} style={{ transition: "opacity 0.5s ease" }}>
        <rect x={W / 2 - 50} y={rootY - 14} width={100} height={28} rx={14}
          fill={isDk ? "#1a2a3a" : "#f0f4f8"} stroke={T.teal} strokeWidth="1.2" filter="url(#dendShadow)" />
        <text x={W / 2} y={rootY + 4} textAnchor="middle" fill={T.teal}
          fontSize="12" fontWeight="700" fontFamily={T.fontH} letterSpacing="0.5">{data.root}</text>
      </g>

      {/* Horizontal spine from root — right-angle (elbow) connections */}
      {phase >= 2 && (
        <g>
          {/* Vertical trunk from root */}
          <line x1={W / 2} y1={rootY + 14} x2={W / 2} y2={rootY + 36}
            stroke={connColor} strokeWidth="1.5" opacity={phase >= 2 ? 1 : 0}
            style={{ transition: "opacity 0.4s ease" }} />
          {/* Horizontal crossbar */}
          <line x1={sp * 1} y1={rootY + 36} x2={sp * n} y2={rootY + 36}
            stroke={connColor} strokeWidth="1.5" opacity={phase >= 2 ? 1 : 0}
            style={{ transition: "opacity 0.4s ease" }} />
        </g>
      )}

      {/* Branches */}
      {data.children.map((ch, i) => {
        const cx = sp * (i + 1);
        const branchColor = ch.color || T.dim;
        const vendor = ch.children[0];
        const vendorColor = vendor?.vendor ? (VENDOR_COLORS[vendor.name] || T.dim) : T.dim;
        const feats = dynamicFeatures?.[vendor?.name]
          ? Object.entries(dynamicFeatures[vendor.name]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0])
          : (vendor?.features || []);

        return (
          <g key={i}>
            {/* Vertical drop from crossbar to category */}
            <line x1={cx} y1={rootY + 36} x2={cx} y2={catY - 16}
              stroke={branchColor} strokeWidth="1.2" opacity={phase >= 2 ? 0.5 : 0}
              style={{ transition: "opacity 0.5s ease" }} />

            {/* Category node — rounded rect */}
            <g opacity={phase >= 3 ? 1 : 0} style={{ transition: "opacity 0.5s ease" }}>
              <rect x={cx - 52} y={catY - 16} width={104} height={30} rx={6}
                fill={branchColor + (isDk ? "12" : "0a")} stroke={branchColor} strokeWidth="0.8" />
              <text x={cx} y={catY + 4} textAnchor="middle" fill={branchColor}
                fontSize="10.5" fontWeight="600" fontFamily={T.fontH}>{ch.name}</text>
            </g>

            {/* Category to vendor — vertical line */}
            <line x1={cx} y1={catY + 14} x2={cx} y2={vendY - 18}
              stroke={vendorColor} strokeWidth="1" opacity={phase >= 4 ? 0.35 : 0}
              strokeDasharray="4 3" style={{ transition: "opacity 0.5s ease" }} />

            {/* Vendor node — circle with subtle fill */}
            <g opacity={phase >= 4 ? 1 : 0} style={{ transition: "opacity 0.5s ease" }}>
              <circle cx={cx} cy={vendY} r={18} fill={vendorColor + (isDk ? "14" : "0c")}
                stroke={vendorColor} strokeWidth="1.5" />
              <circle cx={cx} cy={vendY} r={18} fill="none"
                stroke={vendorColor} strokeWidth="0.3" opacity={0.4}
                strokeDasharray="3 2" />
              <text x={cx} y={vendY + 4} textAnchor="middle" fill={vendorColor}
                fontSize="10" fontWeight="700" fontFamily={T.fontH}>{vendor?.name}</text>
            </g>

            {/* Feature tags — small pills below vendor */}
            {feats.slice(0, 3).map((f, fi) => (
              <g key={fi} opacity={phase >= 5 ? 0.8 : 0} style={{ transition: "opacity 0.5s ease" }}>
                <rect x={cx - f.length * 3.2 - 6} y={tagStartY + fi * 20 - 8} width={f.length * 6.4 + 12}
                  height={16} rx={8} fill={vendorColor + (isDk ? "0c" : "08")} stroke={vendorColor + "30"} strokeWidth="0.5" />
                <text x={cx} y={tagStartY + fi * 20 + 3} textAnchor="middle"
                  fill={T.muted} fontSize="8.5" fontFamily={T.fontB}>{f}</text>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
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

function SourceTag({ lens, style: s }) {
  const isReport = lens === "report";
  const color = isReport ? T.orange : T.cyan;
  const label = isReport ? "External Research" : "M2 Scan Engine";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 3, fontSize: 8, fontFamily: T.fontM, fontWeight: 600, background: color + "10", color, border: "1px solid " + color + "20", letterSpacing: "0.04em", textTransform: "uppercase", ...s }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

const stageColor = (s) => s === "Awareness" ? T.gold : s === "Discovery" ? T.blue : T.green;
const diffColor = (v) => v <= 3 ? T.green : v <= 6 ? T.gold : T.red;
const diffLabel = (v) => v <= 3 ? "EASY" : v <= 6 ? "MOD" : v <= 8 ? "HARD" : "V.HARD";
const TIP_STYLE = () => ({ background: T.card, border: "1px solid " + T.border, borderRadius: 8, fontSize: 11, fontFamily: T.fontB, color: T.text, padding: "6px 10px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" });
const rBadge = (bg, c) => ({ display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:700, fontFamily:T.fontM, letterSpacing:0.3, background:bg, color:c });
const rThS = (align="left") => ({ padding:"8px 6px", textAlign:align, fontSize:9, fontWeight:700, fontFamily:T.fontM, color:T.dim, textTransform:"uppercase", letterSpacing:"0.08em", borderBottom:"1px solid "+T.teal+"30", position:"sticky", top:0, background:T.surface, zIndex:2, whiteSpace:"nowrap" });

/* ───────────────────────────────────────────────
   CALIBRATION PANEL — Adjustable scoring weights
   ─────────────────────────────────────────────── */
function CalibrationPanel({ T, Card, Label, Btn, BadgeEl, onPersist }) {
  const [cal, setCal] = useState(() => loadCalibration());
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (key, val) => {
    setCal(prev => ({ ...prev, [key]: val }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    saveCalibration(cal);
    if (onPersist) onPersist(cal);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setCal({ ...DEFAULT_CALIBRATION });
    saveCalibration(DEFAULT_CALIBRATION);
    if (onPersist) onPersist(DEFAULT_CALIBRATION);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDefault = JSON.stringify(cal) === JSON.stringify(DEFAULT_CALIBRATION);

  const SliderRow = ({ label, valKey, min, max, step, suffix = "", desc }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.fontM, color: cal[valKey] !== DEFAULT_CALIBRATION[valKey] ? T.gold : T.teal }}>{cal[valKey]}{suffix}</span>
      </div>
      {desc && <div style={{ fontSize: 10, color: T.dim, marginBottom: 4 }}>{desc}</div>}
      <input
        type="range" min={min} max={max} step={step}
        value={cal[valKey]}
        onChange={e => update(valKey, parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: T.teal, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.dim, fontFamily: T.fontM }}>
        <span>{min}{suffix}</span><span>{max}{suffix}</span>
      </div>
    </div>
  );

  // Validate weights sum to ~1
  const wSum = cal.wMention + cal.wPosition + cal.wSentiment;
  const wValid = Math.abs(wSum - 1.0) < 0.02;

  return (
    <Card glow={T.gold} style={{ borderLeft: "3px solid " + T.gold }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Label>SCORING CALIBRATION</Label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!isDefault && <BadgeEl text="CUSTOM" color={T.gold} />}
          {saved && <BadgeEl text="SAVED" color={T.green} />}
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
        Adjust how the Visibility Score and Narrative Health Score are computed. Changes apply to all future score computations. Saved locally per browser.
      </div>

      {/* ── Overall Score Weights ── */}
      <div style={{ padding: "12px 14px", borderRadius: 8, background: T.surface, border: "1px solid " + T.border, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.fontH, color: T.text }}>Overall Score Weights</span>
          <span style={{ fontSize: 10, fontFamily: T.fontM, color: wValid ? T.green : T.red, fontWeight: 700 }}>
            Sum: {wSum.toFixed(2)} {wValid ? "\u2713" : "\u2014 should be 1.00"}
          </span>
        </div>
        <SliderRow label="Mention Rate" valKey="wMention" min={0} max={1} step={0.05} desc="How much 'being mentioned' matters" />
        <SliderRow label="Position Score" valKey="wPosition" min={0} max={1} step={0.05} desc="How much ranking position matters" />
        <SliderRow label="Sentiment" valKey="wSentiment" min={0} max={1} step={0.05} desc="How much positive/negative framing matters" />
        <SliderRow label="Rank Step" valKey="rankStep" min={5} max={50} step={5} desc="Points lost per rank position (rank 1 = 100, rank 2 = 100 - step, etc.)" />
      </div>

      {/* ── Narrative Health Weights ── */}
      <div style={{ padding: "12px 14px", borderRadius: 8, background: T.surface, border: "1px solid " + T.border, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.fontH, color: T.text, display: "block", marginBottom: 10 }}>Narrative Health Weights</span>
        <div style={{ fontSize: 10, color: T.dim, marginBottom: 10 }}>How each narrative class contributes to the Narrative Health Score (0-100 scale).</div>
        {[
          { key: "nw_fullStack", label: "Full-Stack CLM", color: "#22c55e" },
          { key: "nw_preSig", label: "Pre-Sig Capable", color: "#3b82f6" },
          { key: "nw_positive", label: "Positive General", color: "#a78bfa" },
          { key: "nw_neutral", label: "Neutral/Generic", color: "#6b7280" },
          { key: "nw_postSigOnly", label: "Post-Sig Specialist", color: "#ef4444" },
          { key: "nw_negative", label: "Negative", color: "#f97316" },
          { key: "nw_absent", label: "Not Mentioned", color: "#374151" },
        ].map(({ key, label, color }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: T.text, width: 120, flexShrink: 0 }}>{label}</span>
            <input
              type="range" min={0} max={100} step={5}
              value={cal[key]}
              onChange={e => update(key, parseInt(e.target.value))}
              style={{ flex: 1, accentColor: color, cursor: "pointer" }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.fontM, color: cal[key] !== DEFAULT_CALIBRATION[key] ? T.gold : T.muted, width: 30, textAlign: "right" }}>{cal[key]}</span>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Btn primary onClick={handleSave} disabled={!dirty || !wValid}>
          {saved ? "\u2713 Saved" : "Save Calibration"}
        </Btn>
        {!isDefault && <Btn onClick={handleReset}>Reset to Defaults</Btn>}
        {!wValid && <span style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>Score weights must sum to 1.00</span>}
      </div>
    </Card>
  );
}

/* ───────────────────────────────────────────────
   CONTENT PLANNING PANEL — Gap-to-Content Pipeline
   ─────────────────────────────────────────────── */
const CONTENT_TYPES = [
  { id: "blog", label: "Blog Post", icon: "\u270D", effort: "Low" },
  { id: "whitepaper", label: "Whitepaper", icon: "\uD83D\uDCC4", effort: "High" },
  { id: "case-study", label: "Case Study", icon: "\uD83C\uDFAF", effort: "Medium" },
  { id: "webinar", label: "Webinar", icon: "\uD83C\uDF99\uFE0F", effort: "Medium" },
  { id: "landing", label: "Landing Page", icon: "\uD83D\uDCBB", effort: "Medium" },
];
const PIPELINE_STATUSES = [
  { id: "planned", label: "Planned", color: "#6b7280" },
  { id: "titles", label: "Titles Generated", color: "#a78bfa" },
  { id: "drafting", label: "Drafting", color: "#FBBF24" },
  { id: "review", label: "In Review", color: "#FB923C" },
  { id: "published", label: "Published", color: "#22c55e" },
];

function loadContentPipeline(initialData) {
  // 1. Use pipeline context data if available (canonical source)
  if (initialData && initialData.length > 0) return initialData;
  // 2. Legacy fallback: direct localStorage key
  try {
    const raw = localStorage.getItem("xt_content_pipeline");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
function saveContentPipeline(items) {
  try { localStorage.setItem("xt_content_pipeline", JSON.stringify(items)); } catch {}
}

function ContentPlanningPanel({ T, Card, Label, Btn, Chip, BadgeEl, topGaps, company, initialData, onPersist }) {
  const [pipeline, setPipeline] = useState(() => loadContentPipeline(initialData));
  const [generating, setGenerating] = useState(null); // gap key being generated
  const [genResults, setGenResults] = useState({}); // gapKey -> titles[]
  const [expandedGap, setExpandedGap] = useState(null);

  // Persist pipeline changes (localStorage + pipeline context → Firebase)
  const updatePipeline = (newItems) => {
    setPipeline(newItems);
    saveContentPipeline(newItems);
    if (onPersist) onPersist(newItems);
  };

  // Add a gap to the content pipeline
  const addToPipeline = (gap, type = "blog") => {
    const exists = pipeline.find(p => p.gapKey === gap.gap.toLowerCase().substring(0, 60) && p.type === type);
    if (exists) return;
    const item = {
      id: "cp-" + Date.now(),
      gapKey: gap.gap.toLowerCase().substring(0, 60),
      gapText: gap.gap,
      type,
      status: "planned",
      personas: [...gap.ps],
      stages: [...gap.ss],
      frequency: gap.n,
      titles: [],
      createdAt: new Date().toISOString(),
    };
    updatePipeline([...pipeline, item]);
  };

  const updateItemStatus = (id, status) => {
    updatePipeline(pipeline.map(p => p.id === id ? { ...p, status } : p));
  };

  const removeItem = (id) => {
    updatePipeline(pipeline.filter(p => p.id !== id));
  };

  const saveTitlesToItem = (id, titles) => {
    updatePipeline(pipeline.map(p => p.id === id ? { ...p, titles, status: "titles" } : p));
  };

  // Generate blog titles using Claude
  const generateTitles = async (gap) => {
    const gapKey = gap.gap.toLowerCase().substring(0, 60);
    setGenerating(gapKey);
    try {
      const personas = [...gap.ps].join(", ");
      const stages = [...gap.ss].join(", ");
      const prompt = `You are an SEO content strategist for ${company || "a B2B SaaS company"} in the Contract Lifecycle Management (CLM) space.

Given this content gap identified from AI perception analysis:
"${gap.gap}"

Target personas: ${personas}
Relevant buyer journey stages: ${stages}
This gap appeared ${gap.n} times across AI platform responses.

Generate exactly 5 blog post titles that would:
1. Address this content gap directly
2. Rank well in search engines (SEO-optimized)
3. Appeal to the target personas
4. Position the company as a thought leader

For each title, also provide:
- A 1-sentence description of what the post should cover
- The primary keyword to target
- Estimated word count (short 800-1200, medium 1500-2000, long 2500+)

Return as JSON array: [{"title":"...","description":"...","keyword":"...","wordCount":"medium"}]
Return ONLY the JSON array, no other text.`;

      const resp = await callClaudeFast(prompt);
      let titles = [];
      try {
        const match = resp.match(/\[[\s\S]*\]/);
        if (match) titles = JSON.parse(match[0]);
      } catch { titles = []; }
      setGenResults(prev => ({ ...prev, [gapKey]: titles }));

      // Auto-save to any pipeline items matching this gap
      const matchingItems = pipeline.filter(p => p.gapKey === gapKey);
      if (matchingItems.length > 0) {
        updatePipeline(pipeline.map(p => p.gapKey === gapKey ? { ...p, titles, status: p.status === "planned" ? "titles" : p.status } : p));
      }
    } catch (e) {
      console.warn("[ContentPlanning] Title generation failed:", e.message);
      setGenResults(prev => ({ ...prev, [gapKey]: [{ title: "Generation failed: " + e.message, description: "", keyword: "", wordCount: "" }] }));
    }
    setGenerating(null);
  };

  // Compute top 5 priority content recommendations
  const top5 = useMemo(() => {
    if (!topGaps || topGaps.length === 0) return [];
    return topGaps.slice(0, 5).map((g, i) => {
      const personaCount = g.ps?.size || 0;
      const stageCount = g.ss?.size || 0;
      const impactScore = g.n * 2 + personaCount * 3 + stageCount * 2;
      const inPipeline = pipeline.some(p => p.gapKey === g.gap.toLowerCase().substring(0, 60));
      return { ...g, rank: i + 1, impactScore, inPipeline };
    });
  }, [topGaps, pipeline]);

  // Pipeline stats
  const stats = useMemo(() => {
    const byStatus = {};
    PIPELINE_STATUSES.forEach(s => { byStatus[s.id] = 0; });
    pipeline.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
    return { total: pipeline.length, ...byStatus };
  }, [pipeline]);

  return (
    <>
      {/* ── TOP 5 CONTENT RECOMMENDATIONS ── */}
      <Card glow={T.teal} style={{ borderLeft: "3px solid " + T.teal }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Label>CONTENT PLANNING {"\u2014"} TOP 5 PRIORITIES THIS MONTH</Label>
          {stats.total > 0 && <BadgeEl text={stats.total + " IN PIPELINE"} color={T.green} />}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Based on gap frequency, persona coverage, and stage relevance. Each gap affects how AI platforms describe {company || "your company"}.
        </div>
        {top5.length === 0 ? (
          <div style={{ fontSize: 11, color: T.dim, padding: 20, textAlign: "center", background: T.surface, borderRadius: 8 }}>No content gaps detected yet. Run a scan to identify opportunities.</div>
        ) : top5.map((g, i) => (
          <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: T.surface, border: "1px solid " + T.border, marginBottom: 8, cursor: "pointer" }}
            onClick={() => setExpandedGap(expandedGap === i ? null : i)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#000", flexShrink: 0 }}>{g.rank}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 4 }}>{g.gap}</div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {[...g.ps].map(p => <Chip key={p} text={p} color={T.purple} />)}
                    {[...g.ss].map(s => <Chip key={s} text={s} color={stageColor(s)} />)}
                    <Chip text={g.n + "\u00D7 mentioned"} color={T.orange} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                {g.inPipeline && <BadgeEl text="IN PIPELINE" color={T.green} />}
                <span style={{ fontSize: 10, color: T.dim }}>{expandedGap === i ? "\u25B2" : "\u25BC"}</span>
              </div>
            </div>

            {/* Expanded: actions + generated titles */}
            {expandedGap === i && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + T.border }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {!g.inPipeline && CONTENT_TYPES.slice(0, 3).map(ct => (
                    <Btn key={ct.id} onClick={() => addToPipeline(g, ct.id)} style={{ fontSize: 10 }}>
                      {ct.icon} Add as {ct.label}
                    </Btn>
                  ))}
                  <Btn primary onClick={() => generateTitles(g)} disabled={generating === g.gap.toLowerCase().substring(0, 60)}>
                    {generating === g.gap.toLowerCase().substring(0, 60) ? "Generating..." : "\u2728 Generate Blog Titles"}
                  </Btn>
                </div>

                {/* Show generated titles */}
                {genResults[g.gap.toLowerCase().substring(0, 60)]?.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 12px", border: "1px solid " + T.teal + "20" }}>
                    <div style={{ fontSize: 10, color: T.teal, fontWeight: 700, marginBottom: 8, letterSpacing: "0.08em" }}>AI-GENERATED BLOG TITLES</div>
                    {genResults[g.gap.toLowerCase().substring(0, 60)].map((t, ti) => (
                      <div key={ti} style={{ padding: "6px 0", borderBottom: ti < 4 ? "1px solid " + T.border : "none" }}>
                        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
                        {t.description && <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{t.description}</div>}
                        <div style={{ display: "flex", gap: 6 }}>
                          {t.keyword && <Chip text={"\uD83D\uDD0D " + t.keyword} color={T.blue} />}
                          {t.wordCount && <Chip text={t.wordCount} color={T.dim} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* ── CONTENT PIPELINE TRACKER ── */}
      {pipeline.length > 0 && (
        <Card glow={T.gold}>
          <Label>CONTENT PIPELINE</Label>

          {/* Status bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {PIPELINE_STATUSES.map(s => (
              <div key={s.id} style={{ padding: "4px 10px", borderRadius: 6, background: s.color + "12", border: "1px solid " + s.color + "30", display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                <span style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}: {stats[s.id] || 0}</span>
              </div>
            ))}
          </div>

          {/* Pipeline items */}
          {pipeline.map(item => {
            const statusObj = PIPELINE_STATUSES.find(s => s.id === item.status) || PIPELINE_STATUSES[0];
            return (
              <div key={item.id} style={{ padding: "10px 12px", borderRadius: 8, background: T.surface, border: "1px solid " + statusObj.color + "20", marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{CONTENT_TYPES.find(c => c.id === item.type)?.icon || "\u270D"}</span>
                      <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{item.gapText}</span>
                    </div>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      <Chip text={CONTENT_TYPES.find(c => c.id === item.type)?.label || item.type} color={T.blue} />
                      {(item.personas || []).map(p => <Chip key={p} text={p} color={T.purple} />)}
                    </div>
                    {item.titles?.length > 0 && (
                      <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: "2px solid " + T.teal + "30" }}>
                        {item.titles.slice(0, 2).map((t, ti) => (
                          <div key={ti} style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{t.title}</div>
                        ))}
                        {item.titles.length > 2 && <div style={{ fontSize: 10, color: T.dim }}>+{item.titles.length - 2} more titles</div>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                    <select value={item.status} onChange={e => updateItemStatus(item.id, e.target.value)}
                      style={{ fontSize: 10, padding: "3px 6px", borderRadius: 4, background: statusObj.color + "15", border: "1px solid " + statusObj.color + "30", color: statusObj.color, fontWeight: 600, cursor: "pointer", outline: "none" }}>
                      {PIPELINE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button onClick={() => removeItem(item.id)} style={{ fontSize: 9, color: T.dim, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }} title="Remove from pipeline">{"\u2715"}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

/* ───────────────────────────────────────────────
   MAIN COMPONENT
   ─────────────────────────────────────────────── */
export default function App() {
  const _globalTheme = useTheme();
  T = _globalTheme.mode === "light" ? { ...T_LIGHT } : { ...T_DARK };
  const { pipeline, updateModule } = usePipeline();

  // Auto-open Run Scan tab when M1 pushed a scanBatch
  const [nav, setNav] = useState(() => pipeline.m1?.scanBatch ? "scan" : "overview");
  const [collapsed, setColl] = useState(false);
  const [selResult, setSelResult] = useState(null);
  const [fPersona, setFP] = useState("All");
  const [fStage, setFS] = useState("All");
  const [fLifecycle, setFL] = useState("All");
  const [hoveredKpi, setHoveredKpi] = useState(null);

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
  const [scanMode, setScanMode] = useState("premium"); // economy or premium (human-like)
  const [exportCopied, setExportCopied] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState({});
  // Report v2 states
  const [rptFilter, setRptFilter] = useState({
    persona: "All", stage: "All", lifecycle: "All", cluster: "All",
    source: "All", classification: "All", volume: "All",
    llm: "All", scanType: "All", dateFrom: "", dateTo: "",
    scanId: "All", mentioned: "All", rank: "All", sentiment: "All",
    competitor: "All"
  });
  const [rptExpanded, setRptExpanded] = useState(null);
  const [rptSort, setRptSort] = useState({ key: "query", dir: "asc" });
  const [dynamicTrends, setDynamicTrends] = useState([]);
  const [expandedSection, setExpandedSection] = useState({}); // Results tab expanded row tab state

  // Per-question rescan
  const [rescanning, setRescanning] = useState(null); // qid currently rescanning
  // LLM connections
  const [connections, setConnections] = useState({});
  const [testing, setTesting] = useState(false);

  // Save status visibility
  const [saveWarnings, setSaveWarnings] = useState([]); // [{msg, ts}]
  const [resumableScan, setResumableScan] = useState(null); // {meta, completedQids}
  const [hydrating, setHydrating] = useState(true); // true until initial Firebase load completes
  const [compareScanId, setCompareScanId] = useState(null); // Phase 2: Scan Comparison delta view

  // Abort controller for scan cancellation
  const abortRef = useRef(null);

  // ETA timer — tracks elapsed + estimated remaining during an active scan
  const scanStartRef = useRef(null);
  const [scanETA, setScanETA] = useState(null); // { elapsed, remaining } in seconds, or null

  // ── Load scan history from Firebase (callable for manual refresh) ──
  const loadScanHistory = useCallback(async (replaceSelected = false) => {
    let allScans = [];
    try {
      const fbMeta = await db.getAllPaginated("m2_scan_meta");
      const fbScans = await db.getAllPaginated("m2_scans");
      const scanById = {};
      fbScans.forEach(s => { if (s.id) scanById[s.id] = s; });
      let fbResults = [];
      try { fbResults = await db.getAllPaginated("m2_scan_results"); } catch (e) { console.warn("loadScanHistory: m2_scan_results load failed:", e.message); }
      const resultsByScan = {};
      fbResults.forEach(r => {
        const sid = r.scanId || (r._id ? r._id.split("__")[0] : null);
        if (sid) { (resultsByScan[sid] = resultsByScan[sid] || []).push(r); }
      });
      const metaById = {};
      fbMeta.forEach(m => { if (m.id) metaById[m.id] = m; });
      const allScanIds = new Set([...Object.keys(scanById), ...Object.keys(metaById)]);
      for (const sid of allScanIds) {
        const fullDoc = scanById[sid];
        const meta = metaById[sid];
        const indResults = resultsByScan[sid] || [];
        if (fullDoc && fullDoc.results && fullDoc.results.length > 0) {
          allScans.push(fullDoc);
        } else if (indResults.length > 0) {
          allScans.push({
            id: sid, date: meta?.date || indResults[0]?.date || "",
            llms: meta?.llms || ["claude", "gemini", "openai"],
            company: meta?.company || "Sirion", results: indResults,
            scores: meta?.scores || computeScores(indResults, meta?.llms || ["claude", "gemini", "openai"]),
            errors: meta?.errors || [], cost: meta?.cost || {}, duration: meta?.duration || 0, _reconstructed: true,
          });
        } else if (meta && meta.status === "complete") {
          allScans.push({ ...meta, results: [] });
        }
      }
      // Find most recent incomplete scan — sort by date desc so newest wins
      // Include "failed" scans that have saved results (interrupted by PC suspend/network error)
      const sortedMeta = [...fbMeta].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const pausedOrRunning = sortedMeta.find(m =>
        m.status === "paused" || m.status === "running" ||
        (m.status === "failed" && (resultsByScan[m.id]?.length || 0) > 0)
      );
      if (pausedOrRunning) {
        const completedResults = resultsByScan[pausedOrRunning.id] || [];
        const completedQids = new Set(completedResults.map(r => r.qid));
        setResumableScan({ meta: pausedOrRunning, completedQids, completedCount: completedQids.size, totalQueries: pausedOrRunning.totalQueries || 0 });
      } else {
        setResumableScan(null);
      }
    } catch (e) { console.warn("M2 scan load error:", e.message); }

    if (allScans.length > 0) {
      // ALL scans go into history — they all contribute to trends
      const sorted = allScans.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 20);
      setScanHistory(sorted);
      // For active scanData: prefer the scan with most results
      const best = sorted.reduce((a, b) => {
        const aScore = a.scores?.overall || 0;
        const bScore = b.scores?.overall || 0;
        // Prefer scans with more results
        if ((a.results?.length || 0) > 50 && (b.results?.length || 0) <= 50) return a;
        if ((b.results?.length || 0) > 50 && (a.results?.length || 0) <= 50) return b;
        if (aScore === 0 && bScore > 0) return b;
        if (bScore === 0 && aScore > 0) return a;
        return (b.results?.length || 0) > (a.results?.length || 0) ? b : a;
      }, sorted[0]);
      if (replaceSelected || !scanData) setScanData(best);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single combined hydration: load scan history + decide question bank source ──
  useEffect(() => {
    (async () => {
      // STEP 1: Load scan history
      await loadScanHistory(false);

      // STEP 2: Decide question bank
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
      setHydrating(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time sync: refresh scan state when user returns to tab ──
  // Prevents stale UI after refresh/tab-switch/leaving window
  useEffect(() => {
    const refreshScanState = async () => {
      if (scanning) return; // Don't interfere with an active scan
      try {
        const fbMeta = await db.getAllPaginated("m2_scan_meta");
        let fbResults = [];
        try { fbResults = await db.getAllPaginated("m2_scan_results"); } catch (e) { console.warn("refreshScanState: m2_scan_results load failed:", e.message); }
        const resultsByScanId = {};
        fbResults.forEach(r => {
          const sid = r.scanId || (r._id ? r._id.split("__")[0] : null);
          if (sid) (resultsByScanId[sid] = resultsByScanId[sid] || []).push(r);
        });
        // Sort most recent first; include "failed" scans with saved results (PC suspend)
        const sortedMeta = [...fbMeta].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const pausedOrRunning = sortedMeta.find(m =>
          m.status === "paused" || m.status === "running" ||
          (m.status === "failed" && (resultsByScanId[m.id]?.length || 0) > 0)
        );
        if (pausedOrRunning) {
          // BUG-002 fix: only count results from THIS scan (not all scans)
          const thisScanResults = resultsByScanId[pausedOrRunning.id] || [];
          const completedQids = new Set(thisScanResults.map(r => r.qid).filter(Boolean));
          setResumableScan({
            meta: pausedOrRunning,
            completedQids,
            completedCount: completedQids.size,
            // BUG-004+005 fix: prefer scan metadata total, no magic number fallback
            totalQueries: pausedOrRunning.totalQueries || queries.length || 0,
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

  // ETA ticker — runs every second while scan is active
  useEffect(() => {
    if (!scanning) { setScanETA(null); return; }
    scanStartRef.current = scanStartRef.current || Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - scanStartRef.current) / 1000);
      const pct = scanProgress?.percent || 0;
      const remaining = pct > 5 ? Math.round(elapsed / (pct / 100) - elapsed) : null;
      setScanETA({ elapsed, remaining });
    }, 1000);
    return () => clearInterval(interval);
  }, [scanning, scanProgress?.percent]); // eslint-disable-line

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

  // Auto-switch to Run Scan tab when a new scanBatch arrives from M1
  const scanBatchRef = useRef(pipeline.m1?.scanBatch?.createdAt || null);
  useEffect(() => {
    const batch = pipeline.m1?.scanBatch;
    if (batch && batch.createdAt !== scanBatchRef.current) {
      scanBatchRef.current = batch.createdAt;
      setNav("scan");
    }
  }, [pipeline.m1?.scanBatch]);

  const allLLMs = getAvailableLLMs();
  const personas = useMemo(() => [...new Set(queries.map(q => q.persona))], [queries]);
  const stages = useMemo(() => {
    const set = new Set();
    queries.forEach(q => { if (q.stage) set.add(q.stage); });
    if (scanData) scanData.results.forEach(r => { if (r.stage) set.add(r.stage); });
    return [...set].sort();
  }, [queries, scanData]);
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

  // personaBk — mention rate per persona (parallels stageBk), sorted weakest first
  const personaBk = useMemo(() => {
    if (!scanData) return [];
    const pMap = {};
    scanData.results.forEach(r => {
      const pRaw = r.persona || "Unknown";
      const pKey = pRaw.toLowerCase();
      if (!pMap[pKey]) pMap[pKey] = { persona: pRaw.length <= 5 && /^[a-zA-Z]+$/.test(pRaw) ? pRaw.toUpperCase() : pRaw, m: 0, total: 0 };
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (a && !a._error) { pMap[pKey].total++; if (a.mentioned) pMap[pKey].m++; }
      });
    });
    return Object.values(pMap).map(p => ({
      persona: p.persona,
      rate: p.total ? Math.round((p.m / p.total) * 100) : 0,
      count: p.total
    })).sort((a, b) => a.rate - b.rate);
  }, [scanData]);

  // perceptionMatrix — persona x stage mention rate grid for heatmap
  const perceptionMatrix = useMemo(() => {
    if (!scanData) return { personas: [], stages: [], cells: {} };
    const stageList = ["Awareness", "Discovery", "Consideration"];
    const normStage = (s) => stageList.find(st => st.toLowerCase() === (s || "").toLowerCase()) || null;
    const pSet = new Set();
    const cells = {};
    scanData.results.forEach(r => {
      const pRaw = r.persona || "Unknown";
      const p = pRaw.length <= 5 && /^[a-zA-Z]+$/.test(pRaw) ? pRaw.toUpperCase() : pRaw;
      const s = normStage(r.stage);
      if (!s) return;
      pSet.add(p);
      const key = `${p}__${s}`;
      if (!cells[key]) cells[key] = { m: 0, total: 0 };
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (a && !a._error) { cells[key].total++; if (a.mentioned) cells[key].m++; }
      });
    });
    const personaList = [...pSet];
    const activeStages = stageList.filter(s => Object.keys(cells).some(k => k.endsWith(`__${s}`)));
    Object.keys(cells).forEach(k => {
      cells[k].rate = cells[k].total ? Math.round((cells[k].m / cells[k].total) * 100) : 0;
    });
    return { personas: personaList, stages: activeStages, cells };
  }, [scanData]);

  // Narrative Classification — HOW AI frames the company, not just whether it mentions them
  const narrativeBk = useMemo(() => {
    if (!scanData) return null;
    return computeNarrativeBreakdown(scanData.results, scanData.llms || []);
  }, [scanData]);

  // LENS 2 ANALYSIS: Question Mix Balance — what % of scan questions target each lifecycle stage?
  const questionMixAnalysis = useMemo(() => {
    if (!scanData) return null;
    const mix = { "pre-signature": 0, "post-signature": 0, "full-stack": 0, unknown: 0 };
    scanData.results.forEach(r => {
      const lc = (r.lifecycle || "full-stack").toLowerCase();
      if (mix[lc] !== undefined) mix[lc]++;
      else mix.unknown++;
    });
    const total = scanData.results.length;
    const pcts = {};
    Object.keys(mix).forEach(k => { pcts[k] = total ? Math.round((mix[k] / total) * 100) : 0; });
    // Detect skew: if any one lifecycle stage accounts for >50% of questions
    const skewed = Object.entries(pcts).find(([k, v]) => k !== "unknown" && v > 50);
    return { counts: mix, pcts, total, skewWarning: skewed ? `${skewed[0]} questions dominate (${skewed[1]}%)` : null };
  }, [scanData]);

  // Per-lifecycle narrative: what does AI say when asked pre-sig vs post-sig vs full-stack questions?
  const narrativeByLifecycle = useMemo(() => {
    if (!scanData) return null;
    const stages = ["pre-signature", "post-signature", "full-stack"];
    const byStage = {};
    stages.forEach(stage => {
      const stageResults = scanData.results.filter(r => (r.lifecycle || "full-stack").toLowerCase() === stage);
      if (stageResults.length > 0) {
        byStage[stage] = computeNarrativeBreakdown(stageResults, scanData.llms || []);
      }
    });
    return byStage;
  }, [scanData]);

  // Computed Perception Gap — derives reality from scan data instead of hardcoding it
  const computedPerceptionGap = useMemo(() => {
    if (!narrativeBk || narrativeBk.mentioned === 0) {
      return { claim: EXTERNAL_RESEARCH.productReality.claim, reality: EXTERNAL_RESEARCH.defaultNarrative.label, source: "report", severity: "critical" };
    }
    // Determine dominant narrative from scan
    const dominated = narrativeBk.breakdown
      .filter(b => b.id !== "absent" && b.id !== "neutral")
      .sort((a, b) => b.count - a.count);
    const dominant = dominated[0];
    let reality = EXTERNAL_RESEARCH.defaultNarrative.label; // fallback
    let severity = "critical";
    if (dominant) {
      reality = dominant.label;
      if (dominant.id === "full-stack") severity = "closing";
      else if (dominant.id === "pre-sig" || dominant.id === "positive") severity = "moderate";
      else severity = "critical";
    }
    // Check if two lenses agree or diverge
    const lensesAgree = (dominant?.id === "post-sig-only");
    const lensDivergence = !lensesAgree ? `Scan says "${reality}" while external research says "${EXTERNAL_RESEARCH.defaultNarrative.label}"` : null;
    return { claim: EXTERNAL_RESEARCH.productReality.claim, reality, source: "scan", severity, dominant, lensesAgree, lensDivergence };
  }, [narrativeBk]);

  // Sync narrative data to pipeline so Dashboard can read it
  useEffect(() => {
    if (narrativeBk && narrativeBk.total > 0) {
      updateModule("m2", { narrativeBreakdown: narrativeBk });
    }
  }, [narrativeBk]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Phase 2: Scan Comparison — deep delta analysis ──
  const compareScan = useMemo(() => {
    if (!compareScanId || !scanHistory.length) return null;
    return scanHistory.find(s => s.id === compareScanId) || null;
  }, [compareScanId, scanHistory]);

  // Narrative delta: how framing shifted between compare scan and current
  const narrativeDelta = useMemo(() => {
    if (!scanData || !compareScan) return null;
    const cur = computeNarrativeBreakdown(scanData.results, scanData.llms || []);
    const prev = computeNarrativeBreakdown(compareScan.results, compareScan.llms || []);
    if (!cur.total || !prev.total) return null;
    return {
      cur, prev,
      scoreDelta: cur.narrativeScore - prev.narrativeScore,
      postSigDelta: cur.postSigPct - prev.postSigPct,
      fullStackDelta: cur.fullStackPct - prev.fullStackPct,
      preSigDelta: cur.preSigPct - prev.preSigPct,
    };
  }, [scanData, compareScan]);

  // Per-query diff: which queries improved/declined between scans
  const queryDiff = useMemo(() => {
    if (!scanData || !compareScan) return null;
    const llmIds = scanData.llms || [];
    const prevMap = {};
    (compareScan.results || []).forEach(r => { prevMap[r.qid] = r; });
    const improved = [], declined = [], newQueries = [], lostQueries = [];
    scanData.results.forEach(r => {
      const pr = prevMap[r.qid];
      if (!pr) { newQueries.push({ ...r, change: "new" }); return; }
      // Compare mention rate across LLMs
      let curM = 0, prevM = 0, ct = 0;
      llmIds.forEach(lid => {
        const ca = r.analyses?.[lid], pa = pr.analyses?.[lid];
        if (ca && !ca._error) { ct++; if (ca.mentioned) curM++; }
        if (pa && !pa._error) { if (pa.mentioned) prevM++; }
      });
      if (ct === 0) return;
      const delta = curM - prevM;
      if (delta > 0) improved.push({ ...r, delta, prevMentions: prevM, curMentions: curM });
      else if (delta < 0) declined.push({ ...r, delta, prevMentions: prevM, curMentions: curM });
    });
    // Queries in prev but not in current
    (compareScan.results || []).forEach(r => {
      if (!scanData.results.find(s => s.qid === r.qid)) lostQueries.push({ ...r, change: "removed" });
    });
    return { improved: improved.sort((a, b) => b.delta - a.delta), declined: declined.sort((a, b) => a.delta - b.delta), newQueries, lostQueries };
  }, [scanData, compareScan]);

  // Competitor shift: who gained/lost mentions between scans
  const competitorShift = useMemo(() => {
    if (!scanData || !compareScan) return null;
    const count = (results, llms) => {
      const m = {};
      results.forEach(r => {
        (llms || []).forEach(lid => {
          const a = r.analyses?.[lid];
          if (!a || a._error) return;
          (a.vendors_mentioned || []).forEach(v => {
            const n = v.name?.toLowerCase();
            if (n) m[n] = (m[n] || 0) + 1;
          });
        });
      });
      return m;
    };
    const curCounts = count(scanData.results, scanData.llms);
    const prevCounts = count(compareScan.results, compareScan.llms);
    const allVendors = new Set([...Object.keys(curCounts), ...Object.keys(prevCounts)]);
    const shifts = [];
    allVendors.forEach(v => {
      const cur = curCounts[v] || 0, prev = prevCounts[v] || 0;
      if (cur !== prev) shifts.push({ vendor: v, cur, prev, delta: cur - prev });
    });
    return shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12);
  }, [scanData, compareScan]);

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

  // Competitive Intelligence — what competitors are strong for, where we're losing
  const competitorInsights = useMemo(() => {
    if (!scanData || compMentions.length === 0) return null;
    const company = (pipeline.meta?.company || pipeline.m1?.company || "Sirion").toLowerCase();
    const sirionKey = compMentions.find(c => c.name.toLowerCase().includes(company))?.name;
    // What Sirion is known for
    const sirionFeats = sirionKey
      ? Object.entries(compFeatures[sirionKey] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
      : [];
    // Top competitor strengths (exclude Sirion)
    const topComps = compMentions
      .filter(c => !c.name.toLowerCase().includes(company))
      .slice(0, 3)
      .map(c => ({
        ...c,
        topFeatures: Object.entries(compFeatures[c.name] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
      }));
    // Queries where we're losing — Sirion absent or ranked low, competitor wins
    const losingMap = {};
    scanData.results.forEach(r => {
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (!a || a._error) return;
        const sirV = (a.vendors_mentioned || []).find(v => v.name.toLowerCase().includes(company));
        const topV = (a.vendors_mentioned || []).sort((x, y) => x.position - y.position)[0];
        if ((!sirV || sirV.position > 3) && topV && !topV.name.toLowerCase().includes(company)) {
          if (!losingMap[r.qid]) {
            losingMap[r.qid] = { qid: r.qid, query: r.query, persona: r.persona, stage: r.stage, winners: new Set(), sirionAbsent: !sirV, bestSirion: sirV?.position || null };
          }
          losingMap[r.qid].winners.add(topV.name);
        }
      });
    });
    const losing = Object.values(losingMap).map(l => ({ ...l, winners: [...l.winners] })).slice(0, 5);
    // Top content actions
    const gapTopics = {};
    scanData.results.forEach(r => {
      (scanData.llms || []).forEach(lid => {
        const a = r.analyses[lid];
        if (!a || a._error) return;
        (a.content_gaps || []).forEach(g => {
          const k = g.toLowerCase().trim();
          if (k.length > 5) gapTopics[k] = (gapTopics[k] || 0) + 1;
        });
      });
    });
    const topActions = Object.entries(gapTopics).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { sirionFeats, topComps, losing, topActions, sirionKey };
  }, [scanData, compMentions, compFeatures, pipeline]);

  // Per-query win/lose status for results table
  const queryStatus = useCallback((r) => {
    if (!scanData) return "unknown";
    const company = (pipeline.meta?.company || pipeline.m1?.company || "Sirion").toLowerCase();
    let mentioned = 0, top3 = 0, total = 0;
    (scanData.llms || []).forEach(lid => {
      const a = r.analyses?.[lid];
      if (!a || a._error) return;
      total++;
      const sirV = (a.vendors_mentioned || []).find(v => v.name.toLowerCase().includes(company));
      if (sirV) { mentioned++; if (sirV.position <= 3) top3++; }
    });
    if (total === 0) return "unknown";
    if (top3 === total) return "winning";
    if (mentioned === total && top3 > 0) return "competitive";
    if (mentioned > 0) return "partial";
    return "losing";
  }, [scanData, pipeline]);

  /* S7.5: Report tab filter helpers (must be after queryStatus) */
  const countByStatus = useMemo(() => {
    if (!scanData) return { winning: 0, competitive: 0, partial: 0, losing: 0, unknown: 0 };
    const c = { winning: 0, competitive: 0, partial: 0, losing: 0, unknown: 0 };
    scanData.results.forEach(r => { c[queryStatus(r)]++; });
    return c;
  }, [scanData, queryStatus]);

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

  // Delete a scan from history and Firebase
  const handleDeleteScan = async (scanId) => {
    if (!window.confirm("Delete this scan? This cannot be undone.")) return;
    try {
      // Delete from all 3 Firebase collections
      await db.delete("m2_scan_meta", scanId);
      await db.delete("m2_scans", scanId);
      // Delete individual results for this scan
      try {
        const allResults = await db.getAllPaginated("m2_scan_results");
        const toDelete = allResults.filter(r => {
          const sid = r.scanId || (r._id ? r._id.split("__")[0] : null);
          return sid === scanId;
        });
        for (const r of toDelete) {
          if (r._id) await db.delete("m2_scan_results", r._id);
        }
      } catch (e) { console.warn("Delete scan results cleanup:", e.message); }
      // Update local state
      setScanHistory(prev => prev.filter(s => s.id !== scanId));
      if (scanData?.id === scanId) {
        const remaining = scanHistory.filter(s => s.id !== scanId);
        setScanData(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (e) {
      console.warn("Delete scan error:", e.message);
      setScanError("Failed to delete scan: " + e.message);
    }
  };

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

  // ── Report v2: Cross-reference M1 question metadata by qid ──
  const getQMeta = useCallback((qid) => {
    const qs = pipeline.m1?.questions || [];
    return qs.find(q => q.id === qid) || {};
  }, [pipeline.m1?.questions]);

  // ── Report v2: Pure filter function (reusable for Analyze Trends) ──
  const applyRptFilters = useCallback((results, filters, scan) => {
    if (!results) return [];
    const llms = scan?.llms || scanData?.llms || [];
    const company = (pipeline.meta?.company || pipeline.m1?.company || "Sirion").toLowerCase();
    return results.filter(r => {
      // Question-level filters
      if (filters.persona !== "All" && r.persona !== filters.persona) return false;
      if (filters.stage !== "All" && r.stage !== filters.stage) return false;
      if (filters.lifecycle !== "All" && r.lifecycle !== filters.lifecycle) return false;
      const meta = getQMeta(r.qid);
      if (filters.cluster !== "All" && (meta.cluster || "Unclustered") !== filters.cluster) return false;
      if (filters.source !== "All" && (meta.source || "pipeline") !== filters.source) return false;
      if (filters.classification !== "All" && (meta.classification || "general") !== filters.classification) return false;
      if (filters.volume !== "All" && String(meta.volumeTier || "unknown") !== filters.volume) return false;
      // Scan-level filters
      if (filters.scanType !== "All" && (scan?.scanType || scanData?.scanType || "full") !== filters.scanType) return false;
      // LLM filter: at least one matching LLM must have data
      if (filters.llm !== "All") {
        const la = r.analyses?.[filters.llm];
        if (!la || la._error) return false;
      }
      // Mentioned filter
      if (filters.mentioned !== "All") {
        const wantMentioned = filters.mentioned === "Yes";
        const anyMentioned = llms.some(lid => r.analyses?.[lid]?.mentioned && !r.analyses[lid]._error);
        if (wantMentioned !== anyMentioned) return false;
      }
      // Rank filter
      if (filters.rank !== "All") {
        const ranks = llms.map(lid => r.analyses?.[lid]?.rank).filter(Boolean);
        const best = ranks.length > 0 ? Math.min(...ranks) : null;
        if (filters.rank === "#1" && best !== 1) return false;
        if (filters.rank === "Top 3" && (best === null || best > 3)) return false;
        if (filters.rank === "4+" && (best === null || best < 4)) return false;
        if (filters.rank === "Unranked" && best !== null) return false;
      }
      // Sentiment filter
      if (filters.sentiment !== "All") {
        const agg = aggregateSentiment(r);
        if (agg !== filters.sentiment) return false;
      }
      // Competitor filter
      if (filters.competitor !== "All") {
        const hasComp = llms.some(lid => {
          const a = r.analyses?.[lid];
          if (!a || a._error) return false;
          return (a.vendors_mentioned || []).some(v => v.name === filters.competitor);
        });
        if (!hasComp) return false;
      }
      return true;
    });
  }, [scanData, pipeline, getQMeta, aggregateSentiment]);

  // ── Report v2: Filtered results ──
  const rptFiltered = useMemo(() => {
    if (!scanData?.results) return [];
    return applyRptFilters(scanData.results, rptFilter, scanData);
  }, [scanData, rptFilter, applyRptFilters]);

  // ── Report v2: Aggregated stats from filtered results ──
  const rptStats = useMemo(() => {
    const llms = scanData?.llms || [];
    const results = rptFiltered;
    const total = results.length;
    if (total === 0) return null;

    // Visibility
    const visPerLlm = {};
    llms.forEach(lid => {
      let hit = 0;
      results.forEach(r => { if (r.analyses?.[lid]?.mentioned && !r.analyses[lid]._error) hit++; });
      visPerLlm[lid] = total > 0 ? Math.round(hit / total * 1000) / 10 : 0;
    });
    const anyVisible = results.filter(r => llms.some(lid => r.analyses?.[lid]?.mentioned && !r.analyses[lid]._error)).length;
    const visOverall = Math.round(anyVisible / total * 1000) / 10;

    // Ranking
    const rankBuckets = { rank1: 0, rank2to3: 0, rank4plus: 0, unranked: 0 };
    const rankPerLlm = {};
    let rankSum = 0, rankCount = 0;
    llms.forEach(lid => { rankPerLlm[lid] = { sum: 0, count: 0 }; });
    results.forEach(r => {
      llms.forEach(lid => {
        const a = r.analyses?.[lid];
        if (a && !a._error && a.mentioned && a.rank) {
          const rk = Number(a.rank);
          if (!Number.isFinite(rk)) return;
          rankSum += rk; rankCount++;
          rankPerLlm[lid].sum += rk; rankPerLlm[lid].count++;
          if (rk === 1) rankBuckets.rank1++;
          else if (rk <= 3) rankBuckets.rank2to3++;
          else rankBuckets.rank4plus++;
        } else if (a && !a._error && a.mentioned && !a.rank) {
          rankBuckets.unranked++;
        }
      });
    });
    const avgRank = rankCount > 0 ? Math.round(rankSum / rankCount * 10) / 10 : null;
    const llmAvgRank = {};
    llms.forEach(lid => {
      llmAvgRank[lid] = rankPerLlm[lid].count > 0 ? Math.round(rankPerLlm[lid].sum / rankPerLlm[lid].count * 10) / 10 : null;
    });

    // Sentiment
    const sentCounts = { positive: 0, neutral: 0, negative: 0 };
    const sentPerLlm = {};
    llms.forEach(lid => { sentPerLlm[lid] = { positive: 0, neutral: 0, negative: 0 }; });
    results.forEach(r => {
      llms.forEach(lid => {
        const s = r.analyses?.[lid]?.sentiment;
        if (s && sentCounts[s] !== undefined) { sentCounts[s]++; sentPerLlm[lid][s]++; }
      });
    });

    // Competitors
    const compMap = {};
    const company = (pipeline.meta?.company || pipeline.m1?.company || "Sirion").toLowerCase();
    results.forEach(r => {
      llms.forEach(lid => {
        const a = r.analyses?.[lid];
        if (!a || a._error) return;
        (a.vendors_mentioned || []).forEach(v => {
          const key = v.name.toLowerCase().replace(/\s+/g, "");
          if (key.includes(company)) return; // skip Sirion
          if (!compMap[key]) compMap[key] = { name: v.name, freq: 0, rankSum: 0, rankCount: 0, perLlm: {} };
          compMap[key].freq++;
          const cPos = Number(v.position);
          if (cPos && Number.isFinite(cPos)) { compMap[key].rankSum += cPos; compMap[key].rankCount++; }
          if (!compMap[key].perLlm[lid]) compMap[key].perLlm[lid] = { freq: 0, rankSum: 0, rankCount: 0 };
          compMap[key].perLlm[lid].freq++;
          if (cPos && Number.isFinite(cPos)) { compMap[key].perLlm[lid].rankSum += cPos; compMap[key].perLlm[lid].rankCount++; }
        });
      });
    });
    const competitors = Object.values(compMap)
      .map(c => ({ ...c, avgRank: c.rankCount > 0 ? Math.round(c.rankSum / c.rankCount * 10) / 10 : null }))
      .sort((a, b) => b.freq - a.freq);

    // Sirion stats for comparison
    let sirFreq = 0, sirRankSum = 0, sirRankCount = 0;
    results.forEach(r => {
      llms.forEach(lid => {
        const a = r.analyses?.[lid];
        if (!a || a._error) return;
        const sv = (a.vendors_mentioned || []).find(v => v.name.toLowerCase().includes(company));
        if (sv) { sirFreq++; const sp = Number(sv.position); if (sp && Number.isFinite(sp)) { sirRankSum += sp; sirRankCount++; } }
      });
    });

    // Benchmark stats
    const bmResults = results.filter(r => r.qid?.startsWith("bm-"));
    const bmHits = bmResults.filter(r => llms.some(lid => r.analyses?.[lid]?.mentioned && !r.analyses[lid]._error)).length;
    const bmHitRate = bmResults.length > 0 ? Math.round(bmHits / bmResults.length * 1000) / 10 : 0;

    return {
      visibility: { overall: visOverall, perLlm: visPerLlm, visible: anyVisible, total },
      ranking: { avg: avgRank, ...rankBuckets, perLlm: llmAvgRank, totalRanked: rankCount },
      sentiment: sentCounts,
      sentPerLlm,
      competitors,
      sirion: { freq: sirFreq, avgRank: sirRankCount > 0 ? Math.round(sirRankSum / sirRankCount * 10) / 10 : null },
      benchmark: { count: bmResults.length, hits: bmHits, hitRate: bmHitRate, results: bmResults },
    };
  }, [rptFiltered, scanData, pipeline]);

  // ── Report v2: Sorted results for per-question table ──
  const rptSorted = useMemo(() => {
    const arr = [...rptFiltered];
    const { key, dir } = rptSort;
    const mult = dir === "asc" ? 1 : -1;
    const llms = scanData?.llms || [];
    arr.sort((a, b) => {
      if (key === "query") return mult * (a.query || "").localeCompare(b.query || "");
      if (key === "status") return mult * (queryStatus(a) || "").localeCompare(queryStatus(b) || "");
      if (key === "persona") return mult * (a.persona || "").localeCompare(b.persona || "");
      if (key === "stage") return mult * (a.stage || "").localeCompare(b.stage || "");
      if (key === "visibility") {
        const va = llms.filter(lid => a.analyses?.[lid]?.mentioned).length;
        const vb = llms.filter(lid => b.analyses?.[lid]?.mentioned).length;
        return mult * (va - vb);
      }
      if (key === "rank") {
        const ra = llms.map(lid => a.analyses?.[lid]?.rank).filter(Boolean);
        const rb = llms.map(lid => b.analyses?.[lid]?.rank).filter(Boolean);
        const avgA = ra.length > 0 ? ra.reduce((s, v) => s + v, 0) / ra.length : 99;
        const avgB = rb.length > 0 ? rb.reduce((s, v) => s + v, 0) / rb.length : 99;
        return mult * (avgA - avgB);
      }
      if (key === "sentiment") {
        const order = { positive: 0, neutral: 1, negative: 2, absent: 3 };
        return mult * ((order[aggregateSentiment(a)] || 3) - (order[aggregateSentiment(b)] || 3));
      }
      return 0;
    });
    return arr;
  }, [rptFiltered, rptSort, scanData, queryStatus, aggregateSentiment]);

  // ── Report v2: Analyze Trends handler ──
  const handleAnalyzeTrends = useCallback(() => {
    const parts = [];
    Object.entries(rptFilter).forEach(([k, v]) => {
      if (v !== "All" && v !== "") parts.push(v);
    });
    const name = parts.length > 0 ? parts.join(" + ") : "All Questions";
    const trendData = scanHistory.slice().reverse().map(scan => {
      const filtered = applyRptFilters(scan.results || [], rptFilter, scan);
      const sLlms = scan.llms || [];
      const vis = filtered.length > 0
        ? filtered.filter(r => sLlms.some(lid => r.analyses?.[lid]?.mentioned)).length / filtered.length * 100
        : 0;
      return {
        date: new Date(scan.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        visibility: Math.round(vis * 10) / 10,
        count: filtered.length,
      };
    });
    const id = "trend_" + Date.now();
    setDynamicTrends(prev => [...prev, { id, name, filters: { ...rptFilter }, data: trendData }]);
    setNav("trends");
  }, [rptFilter, scanHistory, applyRptFilters]);

  const resetRptFilters = () => setRptFilter({
    persona: "All", stage: "All", lifecycle: "All", cluster: "All",
    source: "All", classification: "All", volume: "All",
    llm: "All", scanType: "All", dateFrom: "", dateTo: "",
    scanId: "All", mentioned: "All", rank: "All", sentiment: "All",
    competitor: "All"
  });

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
    scanStartRef.current = Date.now();
    setScanError("");
    setSaveWarnings([]);
    setScanProgress({ phase: "starting", percent: 0, status: isResume ? `Resuming scan (${prevCompleted} already done)...` : "Initializing scan..." });
    setNav("scan");

    // 1. Create or update scan metadata doc (status: running)
    const scanMeta = {
      id: scanId, date: scanDate, status: "running",
      scanType: subset ? "selective" : "full",
      llms, company,
      totalQueries: isResume ? (prevCompleted + targetQueries.length) : targetQueries.length,
      completedQueries: prevCompleted,
      queryIds: targetQueries.map(q => q.id),
      scores: {}, errors: [], cost: { apiCalls: 0, estimated: 0 },
    };
    const metaSaved = await db.saveWithId("m2_scan_meta", scanId, scanMeta);
    if (!metaSaved) {
      const fbErr = db.getLastError() || "unknown";
      setScanError(
        "Firebase is not saving data. Fix this before running a scan:\n\n" +
        "1. Go to Firebase Console → Firestore Database → Rules\n" +
        "2. Set: allow read, write: if true;\n" +
        "3. Click Publish\n\n" +
        "Firebase error: " + fbErr
      );
      setScanning(false);
      setScanProgress(null);
      return;
    }

    // Create abort controller for this scan
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Track real-time progress so abort/error saves use accurate count (not original 0)
    let actualCompleted = prevCompleted;

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
      actualCompleted = prevCompleted + index + 1;
      db.saveWithId("m2_scan_meta", scanId, {
        ...scanMeta, completedQueries: actualCompleted, status: "running",
      }).catch(() => {});
      // Phase 2: Push scan progress to Pipeline so Dashboard shows real-time updates
      if ((index + 1) % 5 === 0 || index + 1 === total) {
        updateModule("m2", {
          scanProgress: { completed: actualCompleted, total, scanId },
        });
      }
    };

    try {
      const result = await runScan(targetQueries, company, llms, (progress) => {
        setScanProgress(progress);
      }, abortController.signal, onResultReady, scanMode);

      // Override scan ID to match our pre-created metadata
      result.id = scanId;
      result.scanType = subset ? "selective" : "full";
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
          // Recompute scores with full result set (BUG-001 fix)
          result.scores = computeScores(result.results, llms);
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
        // BUG-003 fix: after merge, result.results already contains old+new, don't add prevCompleted again
        completedQueries: result.results.length,
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

      // 6. ALL scans go to scan history for trends tracking
      setScanHistory(prev => [result, ...prev].slice(0, 20));

      // Update active scanData + pipeline
      setScanData(result);

      // Clear pending scanBatch after selective scan completes
      if (pipeline.m1?.scanBatch) {
        updateModule("m1", { scanBatch: null });
      }

      const compactResults = result.results.map(r => ({
        lifecycle: r.lifecycle || "full-stack",
        persona: r.persona,
        stage: r.stage,
        mentions: Object.fromEntries(
          (result.llms || []).map(lid => [lid, r.analyses?.[lid]?.mentioned || false])
        ),
      }));
      // Build compact competitor summary for Dashboard leaderboard
      const _compAgg = {};
      result.results.forEach(r => {
        (result.llms || []).forEach(lid => {
          const a = r.analyses?.[lid];
          if (!a || a._error) return;
          (a.vendors_mentioned || []).forEach(v => {
            if (!_compAgg[v.name]) _compAgg[v.name] = { name: v.name, mentions: 0, top3: 0, positive: 0 };
            _compAgg[v.name].mentions++;
            if (v.position <= 3) _compAgg[v.name].top3++;
            if (v.sentiment === "positive") _compAgg[v.name].positive++;
          });
        });
      });
      const competitorSummary = Object.values(_compAgg).sort((a, b) => b.mentions - a.mentions).slice(0, 10);
      // Narrative Classification — compute from full results (before compaction strips analyses)
      const narrativeBreakdown = computeNarrativeBreakdown(result.results, result.llms || []);
      updateModule("m2", {
        scanResults: { llms: result.llms, results: compactResults },
        scores: result.scores,
        scannedAt: result.date,
        contentGaps: payload.allContentGaps,
        personaBreakdown: payload.personaBreakdown,
        stageBreakdown: payload.stageBreakdown,
        recommendations: payload.allRecommendations,
        exportPayload: payload,
        competitorSummary,
        narrativeBreakdown,
        scanProgress: null,
        generationId: new Date().toISOString(),
        m1GenerationId: pipeline.m1.generationId || null,
      });

      // 7. Show save warnings if any
      if (saveErrors.length > 0) {
        setScanError(`Scan complete. ${saveErrors.length} of ${result.results.length} results had save issues (data may be in local cache).`);
      }

      setNav("report");
    } catch (e) {
      if (e.name === "AbortError") {
        // User clicked Cancel — mark as paused (resumable)
        db.saveWithId("m2_scan_meta", scanId, { ...scanMeta, completedQueries: actualCompleted, status: "paused" }).catch(() => {});
        setScanError("Scan paused. Your completed results are saved. You can resume later.");
      } else {
        // Network error, PC suspend, timeout, etc.
        // If we completed some queries, save as "paused" so resume detection finds it
        // Use actualCompleted (not scanMeta.completedQueries which is 0 from initialization)
        const statusToSave = actualCompleted > 0 ? "paused" : "failed";
        db.saveWithId("m2_scan_meta", scanId, { ...scanMeta, completedQueries: actualCompleted, status: statusToSave, error: e.message }).catch(() => {});
        if (actualCompleted > 0) {
          setScanError(`Scan interrupted after ${actualCompleted} queries. Your results are saved — click Resume to continue.`);
        } else {
          setScanError(e.message);
        }
      }
    } finally {
      abortRef.current = null;
      setScanning(false);
      setScanProgress(null);
    }
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
      const result = await runScan(singleQuery, company, llms, null, null, null, scanMode);
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
      updateModule("m2", { scanResults: updatedScanData, scores: updatedScores, scannedAt: updatedScanData.date, generationId: new Date().toISOString() });

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
    { id: "report", icon: "\u2263", label: "Report" },
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
            <button
              onClick={async () => { setHydrating(true); await loadScanHistory(true); setHydrating(false); }}
              title="Reload scan history from database"
              style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid " + T.border, background: "transparent", color: T.teal, fontSize: 11, fontFamily: T.fontM, cursor: "pointer", letterSpacing: 0.5 }}>
              ↺ Reload
            </button>
          </div>
        </div>

        <div style={{ padding: "24px 28px", maxWidth: 1100 }}>

          {/* ═══ UNIVERSAL HYDRATION LOADER ═══ */}
          {hydrating ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid " + T.teal + "30", borderTopColor: T.teal, animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>
                Loading data from database...
              </div>
            </div>
          ) : (<>

          {/* ═══ OVERVIEW — DUAL-LENS PERCEPTION MONITOR ═══ */}
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

                  {/* ═══ 1. THE GAP — Original Design ═══ */}
                  <Card style={{ marginBottom: 14, position: "relative", overflow: "hidden", borderLeft: `3px solid ${T.red}` }}>
                    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "40%", background: `linear-gradient(90deg, transparent, ${T.red}04)`, pointerEvents: "none" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: T.fontH, color: T.red, lineHeight: 1.3 }}>
                          The Internet Trains AI to Call {pipeline.meta?.company || "Sirion"} a Post-Signature Specialist
                        </div>
                        <div style={{ fontSize: 10, color: T.dim, marginTop: 3 }}>{EXTERNAL_RESEARCH._methodology}</div>
                      </div>
                      <SourceTag lens="report" />
                    </div>

                    {/* Animated Perception Cluster */}
                    <div style={{ margin: "8px 0 12px", borderRadius: 8, overflow: "hidden", background: T.surface, border: `1px solid ${T.border}` }}>
                      <PerceptionCluster clusters={PERCEPTION_CLUSTERS} />
                    </div>

                    {/* Evidence + Contradiction */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 10 }}>
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: `${T.red}06`, border: `1px solid ${T.red}18` }}>
                        <div style={{ fontSize: 8, color: T.dim, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: T.fontM, marginBottom: 3 }}>AI DEFAULT</div>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: T.fontH, color: T.red }}>{EXTERNAL_RESEARCH.defaultNarrative.label}</div>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 6 }}>
                          {EXTERNAL_RESEARCH.defaultNarrative.evidence.slice(0, 3).map(n => (
                            <span key={n} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 8, fontFamily: T.fontM, fontWeight: 600, background: `${T.red}10`, color: T.red }}>{n}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${T.red}15`, border: `2px solid ${T.red}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 12, color: T.red }}>{"\u2260"}</span>
                        </div>
                        <span style={{ fontSize: 7, fontFamily: T.fontM, color: T.red, fontWeight: 700 }}>GAP</span>
                      </div>
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: `${T.teal}06`, border: `1px solid ${T.teal}18` }}>
                        <div style={{ fontSize: 8, color: T.dim, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: T.fontM, marginBottom: 3 }}>REALITY</div>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: T.fontH, color: T.teal }}>{EXTERNAL_RESEARCH.productReality.claim}</div>
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{EXTERNAL_RESEARCH.productReality.gartnerNote}</div>
                      </div>
                    </div>

                    {/* Key finding */}
                    <div style={{ padding: "6px 10px", borderRadius: 4, background: `${T.gold}08`, border: `1px solid ${T.gold}15`, fontSize: 10, color: T.gold, fontWeight: 600 }}>
                      {EXTERNAL_RESEARCH.defaultNarrative.finding}
                    </div>
                  </Card>



                  {/* ═══ 2. PERCEPTION HEALTH SUMMARY ═══ */}
                  {(() => {
                    const company = pipeline.meta?.company || "Sirion";
                    const totalQ = scanData.results.length;
                    const totalStatus = countByStatus.winning + countByStatus.competitive + countByStatus.partial + countByStatus.losing;
                    const compPressure = totalStatus > 0 ? Math.round(((countByStatus.losing + countByStatus.partial) / totalStatus) * 100) : 0;
                    const weakStage = stageBk.length > 0 ? stageBk[stageBk.length - 1] : null;
                    const weakPersona = personaBk.length > 0 ? personaBk[0] : null;

                    const healthCards = [
                      {
                        title: "AI Recognition",
                        value: `${sc.mention}%`,
                        interpretation: sc.mention >= 50 ? `${company} appears in most AI responses` : sc.mention >= 20 ? `${company} appears inconsistently` : `${company} is largely invisible to AI`,
                        status: sc.mention >= 50 ? "strong" : sc.mention >= 20 ? "moderate" : "critical",
                        action: () => setNav("results"),
                      },
                      {
                        title: "Perception Accuracy",
                        value: `${sc.sentiment}%`,
                        interpretation: sc.sentiment >= 60 ? "AI frames you positively when mentioned" : sc.sentiment >= 40 ? "AI tone is neutral, not compelling" : "AI responses carry negative framing",
                        status: sc.sentiment >= 60 ? "strong" : sc.sentiment >= 40 ? "moderate" : "critical",
                        action: () => setNav("results"),
                      },
                      {
                        title: "Competitor Pressure",
                        value: `${compPressure}%`,
                        interpretation: compPressure <= 30 ? "Competitors rarely outposition you" : compPressure <= 60 ? "Competitors lead in some areas" : "Competitors dominate most queries",
                        status: compPressure <= 30 ? "strong" : compPressure <= 60 ? "moderate" : "critical",
                        action: () => setNav("results"),
                      },
                      {
                        title: "Weakest Buying Stage",
                        value: weakStage ? weakStage.stage : "N/A",
                        interpretation: weakStage ? `${weakStage.rate}% mention rate, lowest across stages` : "No stage data available",
                        status: weakStage ? (weakStage.rate >= 50 ? "strong" : weakStage.rate >= 20 ? "moderate" : "critical") : "moderate",
                        action: () => setNav("results"),
                      },
                      {
                        title: "Weakest Persona",
                        value: weakPersona ? weakPersona.persona : "N/A",
                        interpretation: weakPersona ? `${weakPersona.rate}% mention rate, lowest across personas` : "No persona data available",
                        status: weakPersona ? (weakPersona.rate >= 50 ? "strong" : weakPersona.rate >= 20 ? "moderate" : "critical") : "moderate",
                        action: () => setNav("results"),
                      },
                    ];

                    const statusColor = (s) => s === "strong" ? T.green : s === "moderate" ? T.gold : T.red;
                    const statusLabel = (s) => s === "strong" ? "Strong" : s === "moderate" ? "Needs Work" : "Critical";

                    return (
                      <Card style={{ marginBottom: 14, borderLeft: `3px solid ${T.teal}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Perception Health</div>
                            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>Five dimensions of AI perception quality</div>
                          </div>
                          <SourceTag lens="scan" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))", gap: 10 }}>
                          {healthCards.map(card => {
                            const col = statusColor(card.status);
                            return (
                              <div
                                key={card.title}
                                onClick={card.action}
                                style={{
                                  padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                                  background: `${col}06`, border: `1px solid ${col}18`,
                                  transition: "all 0.2s ease",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = `${col}12`; e.currentTarget.style.borderColor = `${col}30`; }}
                                onMouseLeave={e => { e.currentTarget.style.background = `${col}06`; e.currentTarget.style.borderColor = `${col}18`; }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <div style={{ fontSize: 8, color: T.dim, textTransform: "uppercase", fontFamily: T.fontM, letterSpacing: 0.8 }}>{card.title}</div>
                                  <span style={{ fontSize: 7, fontWeight: 700, fontFamily: T.fontM, padding: "1px 5px", borderRadius: 3, background: `${col}15`, color: col, textTransform: "uppercase", letterSpacing: 0.5 }}>{statusLabel(card.status)}</span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontH, color: col, marginBottom: 4 }}>{card.value}</div>
                                <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.4 }}>{card.interpretation}</div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    );
                  })()}


                  {/* ═══ 3. WHERE THE GAP LIVES ═══ */}
                  {perceptionMatrix.personas.length > 0 && perceptionMatrix.stages.length > 0 && (
                    <Card style={{ marginBottom: 14, borderLeft: `3px solid ${T.purple}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Where the Gap Lives</div>
                          <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>Perception strength by persona and buying stage</div>
                        </div>
                        <SourceTag lens="scan" />
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: T.fontM }}>
                          <thead>
                            <tr>
                              <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 8, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${T.border}` }}>Persona</th>
                              {perceptionMatrix.stages.map(s => (
                                <th key={s} style={{ padding: "6px 10px", textAlign: "center", fontSize: 8, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${T.border}`, minWidth: 80 }}>{s}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {perceptionMatrix.personas.map(p => (
                              <tr key={p}>
                                <td style={{ padding: "8px 10px", fontSize: 10, fontWeight: 600, color: T.text, borderBottom: `1px solid ${T.border}40`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={p}>{p}</td>
                                {perceptionMatrix.stages.map(s => {
                                  const cell = perceptionMatrix.cells[`${p}__${s}`];
                                  const rate = cell?.rate ?? 0;
                                  const cellColor = rate >= 50 ? T.green : rate >= 20 ? T.gold : T.red;
                                  return (
                                    <td key={s} style={{ padding: "6px 10px", textAlign: "center", borderBottom: `1px solid ${T.border}40` }}>
                                      {cell?.total > 0 ? (
                                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44, padding: "4px 8px", borderRadius: 4, background: `${cellColor}12`, border: `1px solid ${cellColor}20` }}>
                                          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: T.fontH, color: cellColor }}>{rate}%</span>
                                        </div>
                                      ) : (
                                        <span style={{ color: T.dim, fontSize: 9 }}>--</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
                        {[{ label: "Strong", color: T.green }, { label: "Partial", color: T.gold }, { label: "Weak", color: T.red }].map(l => (
                          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: `${l.color}30`, border: `1px solid ${l.color}40` }} />
                            <span style={{ fontSize: 9, color: T.dim }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}


                  {/* ═══ 4. NARRATIVE OWNERSHIP ═══ */}
                  {(() => {
                    const company = (pipeline.meta?.company || "Sirion").toLowerCase();
                    // Build themes from question clusters — which competitor dominates each topic cluster
                    const clusterMap = {};
                    scanData.results.forEach(r => {
                      const meta = getQMeta(r.qid);
                      const cluster = meta.cluster || meta.cw || r.lifecycle || "General";
                      if (!clusterMap[cluster]) clusterMap[cluster] = { theme: cluster, vendors: {} };
                      (scanData.llms || []).forEach(lid => {
                        const a = r.analyses[lid];
                        if (!a || a._error) return;
                        (a.vendors_mentioned || []).forEach(v => {
                          clusterMap[cluster].vendors[v.name] = (clusterMap[cluster].vendors[v.name] || 0) + 1;
                        });
                      });
                    });
                    const themes = Object.values(clusterMap)
                      .map(t => {
                        const sorted = Object.entries(t.vendors).sort((a, b) => b[1] - a[1]);
                        const owner = sorted[0] || ["-", 0];
                        const sirionEntry = sorted.find(([v]) => v.toLowerCase().includes(company));
                        const sirionCount = sirionEntry ? sirionEntry[1] : 0;
                        const ownerIsSirion = owner[0].toLowerCase().includes(company);
                        const totalMentions = sorted.reduce((s, [, c]) => s + c, 0);
                        let strategy = "Attack";
                        let stratColor = T.gold;
                        if (ownerIsSirion) { strategy = "Defend"; stratColor = T.green; }
                        else if (sirionCount > 0 && sirionCount >= owner[1] * 0.6) { strategy = "Compete"; stratColor = T.blue; }
                        else if (totalMentions <= 2) { strategy = "Ignore"; stratColor = T.dim; }
                        return { ...t, owner: owner[0], ownerCount: owner[1], sirionCount, totalMentions, strategy, stratColor, ownerIsSirion };
                      })
                      .sort((a, b) => b.totalMentions - a.totalMentions)
                      .slice(0, 7);

                    if (themes.length === 0) return null;

                    return (
                      <Card style={{ marginBottom: 14, borderLeft: `3px solid ${T.gold}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Narrative Ownership</div>
                            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>Which competitor owns each theme in AI responses</div>
                          </div>
                          <SourceTag lens="scan" />
                        </div>
                        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
                          {/* Header */}
                          <div style={{
                            display: "grid", gridTemplateColumns: "1fr 100px 80px 60px 70px",
                            padding: "6px 10px", background: T.surface,
                            fontSize: 8, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8,
                          }}>
                            <span>Theme</span>
                            <span style={{ textAlign: "center" }}>Owner</span>
                            <span style={{ textAlign: "center" }}>{pipeline.meta?.company || "Sirion"}</span>
                            <span style={{ textAlign: "center" }}>Weight</span>
                            <span style={{ textAlign: "center" }}>Action</span>
                          </div>
                          {/* Rows */}
                          {themes.map((t, idx) => (
                            <div key={t.theme} style={{
                              display: "grid", gridTemplateColumns: "1fr 100px 80px 60px 70px",
                              padding: "7px 10px", alignItems: "center",
                              borderTop: `1px solid ${T.border}`,
                              background: idx % 2 === 0 ? "transparent" : `${T.surface}60`,
                            }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }} title={t.theme}>{t.theme}</span>
                              <div style={{ textAlign: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: VENDOR_COLORS[t.owner] || T.muted }}>{t.owner.length > 12 ? t.owner.substring(0, 11) + ".." : t.owner}</span>
                                <span style={{ fontSize: 8, color: T.dim, marginLeft: 3 }}>({t.ownerCount}x)</span>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                {t.sirionCount > 0 ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.fontM, color: t.ownerIsSirion ? T.green : T.teal }}>{t.sirionCount}x</span>
                                ) : (
                                  <span style={{ fontSize: 9, fontWeight: 600, color: T.red }}>Absent</span>
                                )}
                              </div>
                              <div style={{ textAlign: "center" }}>
                                <span style={{ fontSize: 9, fontFamily: T.fontM, color: T.dim }}>{t.totalMentions}</span>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                <span style={{ fontSize: 8, fontWeight: 700, fontFamily: T.fontM, padding: "2px 6px", borderRadius: 3, background: `${t.stratColor}12`, color: t.stratColor, textTransform: "uppercase", letterSpacing: 0.3 }}>{t.strategy}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
                          {[{ label: "Defend", color: T.green }, { label: "Compete", color: T.blue }, { label: "Attack", color: T.gold }, { label: "Ignore", color: T.dim }].map(l => (
                            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: `${l.color}25` }} />
                              <span style={{ fontSize: 9, color: T.dim }}>{l.label}</span>
                            </div>
                          ))}
                        </div>
                      </Card>
                    );
                  })()}


                  {/* ═══ 5. TREND SIGNAL ═══ */}
                  <Card style={{ marginBottom: 14, borderLeft: `3px solid ${T.blue}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Trend Signal</div>
                        <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>Directional movement since last scan</div>
                      </div>
                      <SourceTag lens="scan" />
                    </div>

                    {(() => {
                      if (!deltaScores || !prevScan) {
                        return (
                          <div style={{ padding: "16px 0", textAlign: "center", fontSize: 11, color: T.dim, lineHeight: 1.6 }}>
                            Run a second scan to track perception trends over time
                          </div>
                        );
                      }
                      // Scope validation: same LLM count and comparable question count
                      const prevCount = prevScan.results?.length || prevScan.count || 0;
                      const curCount = scanData.results.length;
                      const prevLlms = prevScan.llms?.length || 0;
                      const curLlms = (scanData.llms || []).length;
                      const scopeMatch = prevLlms === curLlms && Math.abs(curCount - prevCount) <= Math.max(curCount, prevCount) * 0.3;

                      if (!scopeMatch) {
                        return (
                          <div style={{ padding: "12px 14px", borderRadius: 6, background: `${T.gold}08`, border: `1px solid ${T.gold}18`, fontSize: 10, color: T.muted, lineHeight: 1.6 }}>
                            <span style={{ fontWeight: 700, color: T.gold }}>Trend unavailable.</span> Scan scope has changed (previous: {prevCount} questions / {prevLlms} models, current: {curCount} questions / {curLlms} models). Run scans with matching scope to enable comparison.
                          </div>
                        );
                      }

                      const trendItems = [
                        { label: "Visibility", val: deltaScores.overall, suffix: "pts" },
                        { label: "Mention Rate", val: deltaScores.mention, suffix: "%" },
                        { label: "Sentiment", val: deltaScores.sentiment, suffix: "%" },
                        { label: "Share of Voice", val: deltaScores.shareOfVoice || 0, suffix: "%" },
                      ];
                      const dirLabel = (v) => v > 2 ? "Improving" : v < -2 ? "Declining" : "Stable";
                      const dirColor = (v) => v > 2 ? T.green : v < -2 ? T.red : T.dim;
                      const dirArrow = (v) => v > 2 ? "\u2191" : v < -2 ? "\u2193" : "\u2192";

                      return (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                            {trendItems.map(d => (
                              <div key={d.label} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 8, color: T.dim, textTransform: "uppercase", fontFamily: T.fontM, letterSpacing: 0.8, marginBottom: 4 }}>{d.label}</div>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: T.fontH, color: dirColor(d.val) }}>{dirArrow(d.val)}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.fontM, color: dirColor(d.val) }}>{dirLabel(d.val)}</span>
                                </div>
                                <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM, marginTop: 3 }}>{d.val > 0 ? "+" : ""}{d.val}{d.suffix}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: `${T.blue}08`, border: `1px solid ${T.blue}15`, fontSize: 10, color: T.muted }}>
                            vs {new Date(prevScan.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ({prevCount} questions, {prevLlms} models)
                          </div>
                        </>
                      );
                    })()}
                  </Card>


                  {/* ═══ 6. RECOMMENDED PRIORITY ACTIONS ═══ */}
                  {competitorInsights && (competitorInsights.topActions.length > 0 || competitorInsights.losing.length > 0) && (
                    <Card style={{ marginBottom: 14, borderLeft: `3px solid ${T.gold}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Priority Actions</div>
                          <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>What to fix next based on gap and competitive analysis</div>
                        </div>
                        <SourceTag lens="scan" />
                      </div>

                      {/* Content Gaps */}
                      {competitorInsights.topActions.length > 0 && (
                        <div style={{ marginBottom: competitorInsights.losing.length > 0 ? 14 : 0 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.gold, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Content Gaps</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {competitorInsights.topActions.map(([topic, freq], i) => {
                              const severity = freq >= 5 ? "High" : freq >= 3 ? "Medium" : "Low";
                              const sevColor = freq >= 5 ? T.red : freq >= 3 ? T.gold : T.dim;
                              return (
                                <div key={topic} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.015)", border: `1px solid ${T.border}` }}>
                                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${T.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: T.gold, fontFamily: T.fontH, flexShrink: 0 }}>{i + 1}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>{topic}</div>
                                    <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM, marginTop: 2 }}>AI flagged this gap in {freq} responses. {severity === "High" ? "Multiple models agree this is missing." : "Appears across some responses."}</div>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                                    <span style={{ fontSize: 7, fontWeight: 700, fontFamily: T.fontM, padding: "1px 5px", borderRadius: 3, background: `${sevColor}12`, color: sevColor, textTransform: "uppercase" }}>{severity}</span>
                                    <span style={{ fontSize: 9, fontFamily: T.fontM, color: T.dim }}>{freq} evidence</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Competitive Losses */}
                      {competitorInsights.losing.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.red, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Competitive Losses</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {competitorInsights.losing.slice(0, 3).map((l) => (
                              <div key={l.qid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: `${T.red}04`, border: `1px solid ${T.red}12` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 10, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }} title={l.query}>{l.query}</div>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                    <Chip text={l.persona} color={T.purple} />
                                    <span style={{ fontSize: 9, fontFamily: T.fontM, color: T.red, fontWeight: 700 }}>{l.sirionAbsent ? "Absent" : `#${l.bestSirion}`}</span>
                                    <span style={{ fontSize: 9, color: T.dim }}>vs</span>
                                    <span style={{ fontSize: 9, fontFamily: T.fontM, color: VENDOR_COLORS[l.winners[0]] || T.gold, fontWeight: 600 }}>{l.winners[0]}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => setNav("results")}
                                  style={{ fontSize: 9, fontFamily: T.fontM, fontWeight: 600, color: T.teal, background: `${T.teal}10`, border: `1px solid ${T.teal}25`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}
                                  onMouseEnter={e => { e.target.style.background = `${T.teal}20`; }}
                                  onMouseLeave={e => { e.target.style.background = `${T.teal}10`; }}
                                >View</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  )}


                  {/* ═══ CTA STRIP ═══ */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                    {[
                      { label: "View Full Evidence in Results", nav: "results", color: T.teal },
                      { label: "Build Executive Report", nav: "report", color: T.blue },
                      { label: "Open Content Gaps", nav: "gaps", color: T.gold },
                    ].map(cta => (
                      <button
                        key={cta.nav}
                        onClick={() => setNav(cta.nav)}
                        style={{
                          padding: "8px 20px", borderRadius: 6, border: `1px solid ${cta.color}35`,
                          background: `${cta.color}08`, color: cta.color, fontSize: 11, fontWeight: 700,
                          fontFamily: T.fontM, cursor: "pointer", letterSpacing: 0.3,
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={e => { e.target.style.background = `${cta.color}20`; }}
                        onMouseLeave={e => { e.target.style.background = `${cta.color}08`; }}
                      >
                        {cta.label} {"\u2192"}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ RUN SCAN ═══ */}
          {nav === "scan" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>

              {/* Pending Selective Scan from M1 */}
              {pipeline.m1?.scanBatch && !scanning && (
                <Card glow={T.purple} style={{ borderLeft: "3px solid " + T.purple, marginBottom: 14 }}>
                  <Label>SELECTIVE SCAN &mdash; {pipeline.m1.scanBatch.name}</Label>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.7 }}>
                    {pipeline.m1.scanBatch.questions.length} questions pushed from Question Generator.
                    Created {new Date(pipeline.m1.scanBatch.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.
                  </div>

                  {/* Question list preview */}
                  <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12, borderRadius: 6, border: `1px solid ${T.border}` }}>
                    {pipeline.m1.scanBatch.questions.map((q, idx) => (
                      <div key={q.id || idx} style={{
                        padding: "5px 10px", fontSize: 10, color: T.text, lineHeight: 1.5,
                        borderBottom: idx < pipeline.m1.scanBatch.questions.length - 1 ? `1px solid ${T.border}40` : "none",
                        background: idx % 2 === 0 ? "transparent" : `${T.surface}60`,
                      }}>
                        <span style={{ color: T.dim, marginRight: 6, fontFamily: T.fontM }}>{idx + 1}.</span>
                        {q.query}
                        <span style={{ marginLeft: 8, fontSize: 8, color: T.purple, fontFamily: T.fontM, textTransform: "uppercase" }}>{q.persona}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    {allLLMs.map(id => {
                      const m = LLM_META[id];
                      return <span key={id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: (m?.color || T.dim) + "18", color: m?.color || T.dim, fontFamily: T.fontM, fontWeight: 600 }}>{m?.name || id}</span>;
                    })}
                    <span style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM }}>
                      ~${(pipeline.m1.scanBatch.questions.length * 0.006).toFixed(2)} est.
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn primary onClick={() => handleRunScan(pipeline.m1.scanBatch.questions)} disabled={scanning}>
                      Run Selective Scan ({pipeline.m1.scanBatch.questions.length} queries)
                    </Btn>
                    <Btn onClick={() => updateModule("m1", { scanBatch: null })}>
                      Dismiss
                    </Btn>
                  </div>
                </Card>
              )}

              {/* Scan Progress */}
              {scanning && scanProgress && (
                <Card glow={T.teal} style={{ borderLeft: "3px solid " + T.teal }}>
                  <Label>SCANNING IN PROGRESS</Label>
                  {/* Sleep warning */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, padding: "7px 10px", marginBottom: 10 }}>
                    <span style={{ fontSize: 14 }}>⚠️</span>
                    <span style={{ fontSize: 10, color: "#fbbf24", lineHeight: 1.5 }}>
                      <strong>Keep this tab active.</strong> Scan pauses if the browser tab is hidden or the computer sleeps. If interrupted, click <strong>Cancel Scan</strong> first — then Resume when you return.
                    </span>
                  </div>
                  {/* Overall progress */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: T.teal, fontWeight: 600 }}>
                        {scanProgress.phase === "analyzing" ? "Analyzing responses..." : scanProgress.query ? `"${scanProgress.query.substring(0, 55)}..."` : scanProgress.status}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: T.fontM, color: T.teal }}>{scanProgress.percent}%</span>
                    </div>
                    <PBar value={scanProgress.percent} color={T.teal} h={5} />
                  </div>
                  {/* Per-LLM progress bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                    {allLLMs.map(lid => {
                      const done = scanProgress.llmDone?.[lid] || 0;
                      const total = scanProgress.queryCount || queries.length;
                      const pct = total ? Math.round((done / total) * 100) : 0;
                      const isActive = (scanProgress.activeLLMs || []).includes(lid) && scanProgress.phase === "scanning";
                      const meta = LLM_META[lid];
                      return (
                        <div key={lid}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta?.color || T.dim, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? (meta?.color || T.teal) : T.muted, fontFamily: T.fontM }}>
                                {meta?.name || lid}
                                {isActive && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>▶ asking...</span>}
                              </span>
                            </div>
                            <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.dim }}>{done}/{total}</span>
                          </div>
                          <PBar value={pct} color={isActive ? (meta?.color || T.teal) : (meta?.color || T.dim) + "60"} h={4} />
                        </div>
                      );
                    })}
                  </div>
                  {/* ETA counter */}
                  {scanETA && (() => {
                    const fmt = s => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
                    return (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid " + T.border, marginBottom: 10, fontFamily: T.fontM }}>
                        <span style={{ fontSize: 10, color: T.dim }}>⏱ {fmt(scanETA.elapsed)} elapsed</span>
                        {scanETA.remaining !== null && (
                          <span style={{ fontSize: 10, color: T.teal, fontWeight: 600 }}>~{fmt(scanETA.remaining)} remaining</span>
                        )}
                      </div>
                    );
                  })()}
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
                        try { fbResults = await db.getAllPaginated("m2_scan_results"); } catch (e) { console.warn("Resume: m2_scan_results load failed:", e.message); }
                        // ONLY count results from THIS scan — cross-scan qid matching causes false "all done"
                        const thisScanResults = fbResults.filter(r => {
                          const sid = r.scanId || (r._id ? r._id.split("__")[0] : null);
                          return sid === originalScanId;
                        });
                        const freshQids = new Set(thisScanResults.map(r => r.qid).filter(Boolean));
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

              {/* Show completion summary if scan exists, otherwise show the run card */}
              {scanData && scanData.results && scanData.results.length > 0 && !scanning ? (
                <Card glow={T.green} style={{ borderLeft: "3px solid " + T.green }}>
                  <Label>LAST SCAN COMPLETE</Label>
                  <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: T.green, fontFamily: T.fontM }}>{scanData.results.length}</div>
                      <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>Queries Scanned</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: T.blue, fontFamily: T.fontM }}>{(scanData.llms || []).length}</div>
                      <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>Platforms</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: T.purple, fontFamily: T.fontM }}>{scanData.scores?.mention ?? scanData.scores?.mentionRate ?? 0}%</div>
                      <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>Mention Rate</div>
                    </div>
                    {scanData.date && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, fontFamily: T.fontM }}>{new Date(scanData.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>Scan Date</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: scanData.scanType === "selective" ? T.purple : T.teal, fontFamily: T.fontM, textTransform: "uppercase" }}>
                        {scanData.scanType === "selective" ? "Selective" : "Full"}
                      </div>
                      <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>Scan Type</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                    {(scanData.llms || []).map(id => <Chip key={id} text={LLM_META[id]?.name} color={LLM_META[id]?.color} />)}
                  </div>
                  {/* SCAN MODE TOGGLE */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 9, fontFamily: T.fontM, fontWeight: 700, color: T.dim, letterSpacing: 0.8, textTransform: "uppercase" }}>Scan Mode</span>
                    {Object.entries(SCAN_MODES).map(([key, m]) => (
                      <button key={key} onClick={() => setScanMode(key)}
                        style={{
                          padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: T.fontM, fontWeight: 600,
                          background: scanMode === key ? (key === "premium" ? T.teal : T.surface) : T.surface,
                          color: scanMode === key ? "#fff" : T.dim,
                          border: `1px solid ${scanMode === key ? (key === "premium" ? T.teal : T.border) : T.border}`,
                          transition: "all 0.2s ease",
                        }}>
                        {m.label}
                      </button>
                    ))}
                    <span style={{ fontSize: 10, color: scanMode === "premium" ? T.teal : T.dim, fontFamily: T.fontM }}>
                      {SCAN_MODES[scanMode]?.desc}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn onClick={() => setNav("overview")}>View Results</Btn>
                    <Btn onClick={() => handleRunScan()} disabled={scanning} style={{ borderColor: T.orange, color: T.orange }}>{"\u26A1"} Run New Scan ({queries.length} queries)</Btn>
                    <Btn onClick={() => handleRunScan(queries.slice(0, 3))} disabled={scanning}>Quick Test (3 queries)</Btn>
                  </div>
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 8 }}>
                    ~${(queries.length * (scanMode === "premium" ? 0.040 : 0.006)).toFixed(2)} estimated cost {scanMode === "premium" ? " \u00B7 Web search ON" : ""}
                  </div>
                </Card>
              ) : !scanning && (
                <Card glow={T.blue}>
                  <Label>RUN AI PERCEPTION SCAN</Label>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.7 }}>
                    Fire {queries.length} queries across {allLLMs.length} platforms: {allLLMs.map(id => LLM_META[id]?.name).join(", ")}.
                    Each question is sent as-is to each AI, then Claude analyzes the response for brand positioning.
                  </div>
                  {/* SCAN MODE TOGGLE */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 9, fontFamily: T.fontM, fontWeight: 700, color: T.dim, letterSpacing: 0.8, textTransform: "uppercase" }}>Scan Mode</span>
                    {Object.entries(SCAN_MODES).map(([key, m]) => (
                      <button key={key} onClick={() => setScanMode(key)}
                        style={{
                          padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: T.fontM, fontWeight: 600,
                          background: scanMode === key ? (key === "premium" ? T.teal : T.surface) : T.surface,
                          color: scanMode === key ? "#fff" : T.dim,
                          border: `1px solid ${scanMode === key ? (key === "premium" ? T.teal : T.border) : T.border}`,
                          transition: "all 0.2s ease",
                        }}>
                        {m.label}
                      </button>
                    ))}
                    <span style={{ fontSize: 10, color: scanMode === "premium" ? T.teal : T.dim, fontFamily: T.fontM }}>
                      {SCAN_MODES[scanMode]?.desc}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                    {allLLMs.map(id => <Chip key={id} text={LLM_META[id]?.name} color={LLM_META[id]?.color} />)}
                    <span style={{ fontSize: 11, color: T.dim, fontFamily: T.fontM }}>~${(queries.length * (scanMode === "premium" ? 0.040 : 0.006)).toFixed(2)} credits {"\u00B7"} {queries.length + queries.length} API calls ({queries.length} asks + {queries.length} analyses){scanMode === "premium" ? " \u00B7 Web search ON" : ""}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn primary onClick={() => handleRunScan()} disabled={scanning}>{"\u26A1"} Full Scan ({queries.length} {"\u00D7"} {allLLMs.length})</Btn>
                    <Btn onClick={() => handleRunScan(queries.slice(0, 3))} disabled={scanning}>Quick Test (3 queries)</Btn>
                  </div>
                </Card>
              )}

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
                  <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM, display: "flex", gap: 12, marginBottom: 6 }}>
                    <span>Scan: {scanData.id?.slice(0, 8) || "—"}</span>
                    <span>Type: {(scanData.scanType || "full").toUpperCase()}</span>
                    <span style={{ color: scanData.scanMode === "premium" ? T.teal : T.dim }}>Mode: {(scanData.scanMode || "economy").toUpperCase()}</span>
                    <span>Date: {scanData.date ? new Date(scanData.date).toLocaleDateString() : "—"}</span>
                    <span>LLMs: {scanData.llms?.length || 0}</span>
                    <span>Questions: {scanData.results?.length || 0}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    <select value={fPersona} onChange={e => setFP(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 11 }}>
                      <option value="All">All Personas</option>
                      {personas.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={fStage} onChange={e => setFS(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 11 }}>
                      <option value="All">All Stages</option>
                      {stages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={fLifecycle} onChange={e => setFL(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 11 }}>
                      <option value="All">All CLM Stages</option>
                      {CLM_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <div style={{ marginLeft: "auto", fontSize: 11, color: T.dim, fontFamily: T.fontM }}>{filtered.length} results {"\u00B7"} {scanData.llms.length} LLMs</div>
                  </div>
                  <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: T.surface }}>
                          <th style={{ padding: "7px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "34%" }}>Query</th>
                          <th style={{ padding: "7px 4px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "7%" }}>Status</th>
                          <th style={{ padding: "7px 6px", textAlign: "left", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "11%" }}>Persona</th>
                          <th style={{ padding: "7px 6px", textAlign: "left", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "10%" }}>Stage</th>
                          <th style={{ padding: "7px 6px", textAlign: "left", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "10%" }}>CLM</th>
                          <th style={{ padding: "7px 6px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "14%" }}>LLM Presence</th>
                          <th style={{ padding: "7px 6px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "8%" }}>Diff</th>
                          <th style={{ padding: "7px 6px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid " + T.border, width: "6%" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                  {filtered.map(r => {
                    const a = bestAnalysis(r);
                    if (!a) return null;
                    const exp = selResult === r.qid;
                    const dc = r.difficulty?.composite || 5;
                    const sir = a;
                    const clmStage = CLM_STAGES.find(c => c.id === (r.lifecycle || "full-stack"));
                    return (
                      <React.Fragment key={r.qid}>
                        {/* Table row (collapsed) */}
                        <tr
                          onClick={() => setSelResult(exp ? null : r.qid)}
                          style={{ cursor: "pointer", background: exp ? T.teal + "08" : "transparent", borderBottom: exp ? "none" : "1px solid " + T.border + "50", transition: "background 0.15s ease" }}
                        >
                          {/* Query */}
                          <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM, flexShrink: 0 }}>{exp ? "\u25BC" : "\u25B6"}</span>
                              <span style={{ fontSize: 11, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} title={r.query}>{r.query}</span>
                            </div>
                          </td>
                          {/* Status pill */}
                          {(() => {
                            const qs = queryStatus(r);
                            const statusCfg = { winning: { label: "WIN", color: T.green }, competitive: { label: "OK", color: T.gold }, partial: { label: "WEAK", color: T.orange }, losing: { label: "LOST", color: T.red }, unknown: { label: "?", color: T.dim } }[qs];
                            return (
                              <td style={{ padding: "8px 4px", verticalAlign: "middle", textAlign: "center" }}>
                                <span style={{ fontSize: 8, fontWeight: 800, fontFamily: T.fontM, padding: "2px 5px", borderRadius: 3, background: statusCfg.color + "15", color: statusCfg.color, border: "1px solid " + statusCfg.color + "25", whiteSpace: "nowrap", letterSpacing: "0.05em" }}>{statusCfg.label}</span>
                              </td>
                            );
                          })()}
                          {/* Persona */}
                          <td style={{ padding: "8px 6px", verticalAlign: "middle" }}>
                            <span style={{ fontSize: 10, color: T.purple, fontFamily: T.fontM, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 90 }} title={r.persona}>{r.persona}</span>
                          </td>
                          {/* Stage */}
                          <td style={{ padding: "8px 6px", verticalAlign: "middle" }}>
                            <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, fontFamily: T.fontM, background: stageColor(r.stage) + "18", color: stageColor(r.stage), whiteSpace: "nowrap" }}>{r.stage}</span>
                          </td>
                          {/* CLM Lifecycle */}
                          <td style={{ padding: "8px 6px", verticalAlign: "middle" }}>
                            <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, fontFamily: T.fontM, background: (clmStage?.color || "#a78bfa") + "18", color: clmStage?.color || "#a78bfa", whiteSpace: "nowrap" }}>{clmStage?.label?.replace(" CLM", "") || "Full-Stack"}</span>
                          </td>
                          {/* LLM Presence */}
                          <td style={{ padding: "8px 6px", verticalAlign: "middle", textAlign: "center" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              {(scanData.llms || []).map(lid => {
                                const la = r.analyses?.[lid];
                                const present = la && !la._error && la.mentioned;
                                return (
                                  <div key={lid} title={`${LLM_META[lid]?.name}: ${present ? "#" + la.rank : "absent"}`}
                                    style={{ display: "flex", alignItems: "center", gap: 2, padding: "1px 4px", borderRadius: 3, background: present ? (LLM_META[lid]?.color || T.dim) + "15" : T.red + "08", border: "1px solid " + (present ? (LLM_META[lid]?.color || T.dim) + "30" : T.red + "20") }}>
                                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: LLM_META[lid]?.color || T.dim }} />
                                    <span style={{ fontSize: 8, fontFamily: T.fontM, fontWeight: 700, color: present ? (LLM_META[lid]?.color || T.dim) : T.red }}>{present ? "#" + la.rank : "–"}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          {/* Difficulty */}
                          <td style={{ padding: "8px 6px", verticalAlign: "middle", textAlign: "center" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.fontM, color: diffColor(dc) }}>{dc.toFixed(1)} <span style={{ fontSize: 9, fontWeight: 500 }}>{diffLabel(dc)}</span></span>
                          </td>
                          {/* Rescan */}
                          <td style={{ padding: "8px 6px", verticalAlign: "middle", textAlign: "center" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRescan(r.qid); }}
                              disabled={scanning || rescanning !== null}
                              title="Rescan this question against all LLMs"
                              style={{
                                padding: "2px 8px", borderRadius: 4,
                                border: "1px solid " + (rescanning === r.qid ? T.teal + "60" : T.border),
                                background: rescanning === r.qid ? T.teal + "12" : "transparent",
                                color: rescanning === r.qid ? T.teal : T.dim,
                                cursor: (scanning || rescanning !== null) ? "not-allowed" : "pointer",
                                fontSize: 9, fontWeight: 600, fontFamily: T.fontM,
                                opacity: (scanning || (rescanning && rescanning !== r.qid)) ? 0.3 : 1,
                                display: "inline-flex", alignItems: "center", gap: 3,
                              }}
                            >
                              {rescanning === r.qid ? (
                                <span style={{ display: "inline-block", width: 8, height: 8, border: "1.5px solid " + T.teal, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                              ) : "\u21BB"}
                              {rescanning === r.qid ? "..." : "Rescan"}
                            </button>
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {exp && <tr style={{ background: T.bgCard, borderBottom: "1px solid " + T.border + "50" }}><td colSpan={8} style={{ padding: 0 }}><div style={{ padding: "14px 16px", borderTop: "1px solid " + T.teal + "25", animation: "fadeUp 0.25s ease" }}>
                        {(() => {
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
                          <div>

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
                        </div></td></tr>}
                      </React.Fragment>
                    );
                  })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ CEO REPORT ═══ */}
          {nav === "report" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {!scanData ? (
                <EmptyState icon={"\u2263"} title="Scan Report" description="Run a scan first to see the CEO-level insight report." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Run Scan</Btn>} />
              ) : (() => {
                const llms = scanData.llms || [];
                const results = scanData.results || [];
                const totalQueries = results.length;

                const fSel = (k, opts, label) => (
                  <select value={rptFilter[k]} onChange={e => setRptFilter(p => ({...p, [k]: e.target.value}))} title={label} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + (rptFilter[k] !== "All" ? T.teal + "60" : T.border), background: rptFilter[k] !== "All" ? T.teal + "08" : T.surface, color: T.text, fontSize: 10, fontFamily: T.fontM, minWidth: 0, flex: 1 }}>
                    <option value="All">{label}: All</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                );
                // Derive filter options from data
                const uPersonas = [...new Set(results.map(r => r.persona).filter(Boolean))].sort();
                const uStages = [...new Set(results.map(r => r.stage).filter(Boolean))].sort();
                const uLifecycles = [...new Set(results.map(r => r.lifecycle).filter(Boolean))].sort();
                const uClusters = [...new Set(results.map(r => (getQMeta(r.qid).cluster || "Unclustered")).filter(Boolean))].sort();
                const uSources = [...new Set(results.map(r => (getQMeta(r.qid).source || "pipeline")).filter(Boolean))].sort();
                const uClassifications = [...new Set(results.map(r => (getQMeta(r.qid).classification || "general")).filter(Boolean))].sort();
                const uVolumes = [...new Set(results.map(r => String(getQMeta(r.qid).volumeTier || "unknown")).filter(Boolean))].sort();
                const uCompetitors = [...new Set(results.flatMap(r => llms.flatMap(lid => (r.analyses?.[lid]?.vendors_mentioned || []).filter(v => !v.name.toLowerCase().includes("sirion")).map(v => v.name))))].sort();
                const activeFilterCount = Object.values(rptFilter).filter(v => v !== "All" && v !== "").length;

                const statusBadge = (st) => {
                  if (st === "winning") return rBadge(T.green + "18", T.green);
                  if (st === "competitive") return rBadge(T.teal + "18", T.teal);
                  if (st === "partial") return rBadge(T.gold + "18", T.gold);
                  if (st === "losing") return rBadge(T.red + "18", T.red);
                  return rBadge(T.dim + "18", T.dim);
                };
                const statusLabel = (st) => st === "winning" ? "WIN" : st === "competitive" ? "OK" : st === "partial" ? "WEAK" : st === "losing" ? "LOST" : "?";
                const sortHeader = (label, key, align) => (
                  <th onClick={() => setRptSort(p => ({ key, dir: p.key === key && p.dir === "asc" ? "desc" : "asc" }))}
                    style={{ ...rThS(align), cursor: "pointer", userSelect: "none" }}>
                    {label} {rptSort.key === key ? (rptSort.dir === "asc" ? "\u25B4" : "\u25BE") : ""}
                  </th>
                );

                return (
                  <>
                    {/* ──── FILTER BAR ──── */}
                    <Card>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <Label>REPORT FILTERS {activeFilterCount > 0 ? "(" + activeFilterCount + " active)" : ""}</Label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {activeFilterCount > 0 && <Btn onClick={resetRptFilters}>Reset</Btn>}
                          <Btn primary onClick={handleAnalyzeTrends} disabled={scanHistory.length < 2}>Analyze Trends</Btn>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                        {fSel("persona", uPersonas, "Persona")}
                        {fSel("stage", uStages, "Stage")}
                        {fSel("lifecycle", uLifecycles, "Lifecycle")}
                        {fSel("cluster", uClusters, "Cluster")}
                        {fSel("source", uSources, "Source")}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                        {fSel("classification", uClassifications, "Class.")}
                        {fSel("volume", uVolumes, "Volume")}
                        {fSel("llm", llms, "LLM")}
                        {fSel("scanType", ["full", "selective"], "Scan Type")}
                        {fSel("mentioned", ["Yes", "No"], "Mentioned")}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {fSel("rank", ["#1", "Top 3", "4+", "Unranked"], "Rank")}
                        {fSel("sentiment", ["positive", "neutral", "negative"], "Sentiment")}
                        {fSel("competitor", uCompetitors, "Competitor")}
                        <input type="date" value={rptFilter.dateFrom} onChange={e => setRptFilter(p => ({...p, dateFrom: e.target.value}))} style={{ padding: "4px 6px", borderRadius: 5, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 10, fontFamily: T.fontM, flex: 1 }} title="From date" />
                        <input type="date" value={rptFilter.dateTo} onChange={e => setRptFilter(p => ({...p, dateTo: e.target.value}))} style={{ padding: "4px 6px", borderRadius: 5, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 10, fontFamily: T.fontM, flex: 1 }} title="To date" />
                      </div>
                      <div style={{ fontSize: 9, color: T.dim, marginTop: 6, fontFamily: T.fontM }}>
                        Showing {rptFiltered.length} of {totalQueries} results {activeFilterCount > 0 ? " | " + activeFilterCount + " filters applied" : ""}
                      </div>
                    </Card>

                    {/* ──── SECTION 1: ARE WE VISIBLE? ──── */}
                    {rptStats && (
                      <Card glow={T.teal}>
                        <Label>SECTION 1: ARE WE VISIBLE?</Label>
                        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 12 }}>
                          <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                            <svg viewBox="0 0 36 36" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke={T.border} strokeWidth="3" />
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke={T.teal} strokeWidth="3" strokeDasharray={`${rptStats.visibility.overall} ${100 - rptStats.visibility.overall}`} strokeLinecap="round" />
                            </svg>
                            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 18, fontWeight: 800, fontFamily: T.fontH, color: T.teal }}>{rptStats.visibility.overall}%</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Visible in {rptStats.visibility.visible} of {rptStats.visibility.total} queries</div>
                            <div style={{ fontSize: 10, color: T.dim, marginBottom: 8 }}>At least one LLM mentions Sirion</div>
                            {llms.map(lid => {
                              const pct = rptStats.visibility.perLlm[lid] || 0;
                              const meta = LLM_META[lid];
                              return (
                                <div key={lid} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta?.color || T.dim, flexShrink: 0 }} />
                                  <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.muted, minWidth: 55 }}>{meta?.name || lid}</span>
                                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.border }}>
                                    <div style={{ width: pct + "%", height: "100%", borderRadius: 3, background: meta?.color || T.teal, transition: "width 0.4s ease" }} />
                                  </div>
                                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.fontM, color: meta?.color || T.teal, minWidth: 35, textAlign: "right" }}>{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* ──── SECTION 2: WHERE DO WE RANK? ──── */}
                    {rptStats && rptStats.ranking.avg !== null && (
                      <Card glow={T.gold}>
                        <Label>SECTION 2: WHERE DO WE RANK?</Label>
                        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 12 }}>
                          <div style={{ textAlign: "center", minWidth: 80 }}>
                            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: T.fontH, color: rptStats.ranking.avg <= 2 ? T.green : rptStats.ranking.avg <= 4 ? T.gold : T.orange }}>#{rptStats.ranking.avg}</div>
                            <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM }}>AVG RANK</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Distribution bar */}
                            {(() => {
                              const tot = rptStats.ranking.rank1 + rptStats.ranking.rank2to3 + rptStats.ranking.rank4plus;
                              if (tot === 0) return null;
                              const p1 = rptStats.ranking.rank1 / tot * 100;
                              const p2 = rptStats.ranking.rank2to3 / tot * 100;
                              const p3 = rptStats.ranking.rank4plus / tot * 100;
                              return (
                                <div>
                                  <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                                    {p1 > 0 && <div style={{ width: p1 + "%", background: T.green, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>#1</span></div>}
                                    {p2 > 0 && <div style={{ width: p2 + "%", background: T.teal, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>#2-3</span></div>}
                                    {p3 > 0 && <div style={{ width: p3 + "%", background: T.orange, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>4+</span></div>}
                                  </div>
                                  <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: T.fontM }}>
                                    <span style={{ color: T.green }}>Rank #1: {rptStats.ranking.rank1}</span>
                                    <span style={{ color: T.teal }}>#2-3: {rptStats.ranking.rank2to3}</span>
                                    <span style={{ color: T.orange }}>4+: {rptStats.ranking.rank4plus}</span>
                                  </div>
                                </div>
                              );
                            })()}
                            {/* Per-LLM avg rank */}
                            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                              {llms.map(lid => {
                                const ar = rptStats.ranking.perLlm[lid];
                                const meta = LLM_META[lid];
                                return ar !== null ? (
                                  <span key={lid} style={{ fontSize: 10, fontFamily: T.fontM, color: T.muted }}>
                                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta?.color || T.dim, display: "inline-block", marginRight: 3 }} />
                                    {meta?.name || lid}: <span style={{ fontWeight: 700, color: ar <= 2 ? T.green : ar <= 4 ? T.gold : T.orange }}>#{ar}</span>
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* ──── SECTION 3: WHAT IS OUR PERCEPTION? ──── */}
                    {rptStats && (
                      <Card glow={T.purple}>
                        <Label>SECTION 3: WHAT IS OUR PERCEPTION?</Label>
                        {(() => {
                          const s = rptStats.sentiment;
                          const tot = s.positive + s.neutral + s.negative;
                          if (tot === 0) return <div style={{ fontSize: 11, color: T.dim }}>No sentiment data</div>;
                          const pP = Math.round(s.positive / tot * 100);
                          const pN2 = Math.round(s.neutral / tot * 100);
                          const pNeg = 100 - pP - pN2;
                          return (
                            <div>
                              <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                                {pP > 0 && <div style={{ width: pP + "%", background: T.green, display: "flex", alignItems: "center", justifyContent: "center", transition: "width 0.4s" }}><span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{pP}%</span></div>}
                                {pN2 > 0 && <div style={{ width: pN2 + "%", background: T.dim, display: "flex", alignItems: "center", justifyContent: "center", transition: "width 0.4s" }}><span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{pN2}%</span></div>}
                                {pNeg > 0 && <div style={{ width: pNeg + "%", background: T.red, display: "flex", alignItems: "center", justifyContent: "center", transition: "width 0.4s" }}><span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{pNeg}%</span></div>}
                              </div>
                              <div style={{ display: "flex", gap: 16, fontSize: 10, fontFamily: T.fontM, marginBottom: 8 }}>
                                <span style={{ color: T.green }}>Positive: {s.positive}</span>
                                <span style={{ color: T.dim }}>Neutral: {s.neutral}</span>
                                <span style={{ color: T.red }}>Negative: {s.negative}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {llms.map(lid => {
                                  const ls = rptStats.sentPerLlm[lid];
                                  const meta = LLM_META[lid];
                                  const lt = ls.positive + ls.neutral + ls.negative;
                                  if (lt === 0) return null;
                                  return (
                                    <div key={lid} style={{ padding: "3px 8px", borderRadius: 4, background: T.surface, border: "1px solid " + T.border, fontSize: 9, fontFamily: T.fontM, display: "flex", alignItems: "center", gap: 4 }}>
                                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta?.color || T.dim }} />
                                      <span style={{ color: T.muted }}>{meta?.name || lid}:</span>
                                      <span style={{ color: T.green }}>{ls.positive}</span>
                                      <span style={{ color: T.dim }}>{ls.neutral}</span>
                                      <span style={{ color: T.red }}>{ls.negative}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </Card>
                    )}

                    {/* ──── SECTION 4: VS COMPETITORS ──── */}
                    {rptStats && rptStats.competitors.length > 0 && (
                      <Card glow={T.orange}>
                        <Label>SECTION 4: VS COMPETITORS</Label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            {/* Sirion row */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.teal + "10", border: "1px solid " + T.teal + "30", marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.fontM, color: T.teal, flex: 1 }}>Sirion</span>
                              <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.teal }}>{rptStats.sirion.freq}x</span>
                              {rptStats.sirion.avgRank != null && Number.isFinite(rptStats.sirion.avgRank) && <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.teal }}>avg #{rptStats.sirion.avgRank}</span>}
                            </div>
                            {/* Competitor rows */}
                            {rptStats.competitors.slice(0, 8).map((c, ci) => (
                              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 4, marginBottom: 2, background: ci % 2 === 0 ? T.surface : "transparent" }}>
                                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: T.fontM, color: VENDOR_COLORS[c.name] || T.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                                <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.dim }}>{c.freq}x</span>
                                {c.avgRank != null && Number.isFinite(c.avgRank) && <span style={{ fontSize: 10, fontFamily: T.fontM, color: c.avgRank <= 3 ? T.green : T.orange }}>avg #{c.avgRank}</span>}
                              </div>
                            ))}
                          </div>
                          <div>
                            <ResponsiveContainer width="100%" height={Math.min(240, (Math.min(rptStats.competitors.length, 6) + 1) * 30 + 40)}>
                              <BarChart data={[{ name: "Sirion", freq: rptStats.sirion.freq }, ...rptStats.competitors.slice(0, 6)]} layout="vertical" margin={{ left: 70, right: 10, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                                <XAxis type="number" tick={{ fill: T.dim, fontSize: 10 }} />
                                <YAxis dataKey="name" type="category" tick={{ fill: T.muted, fontSize: 10, fontFamily: T.fontM }} width={65} />
                                <Tooltip contentStyle={TIP_STYLE()} />
                                <Bar dataKey="freq" name="Mentions" radius={[0, 3, 3, 0]}>
                                  {[{ name: "Sirion" }, ...rptStats.competitors.slice(0, 6)].map((c, i) => (
                                    <Cell key={i} fill={i === 0 ? T.teal : (VENDOR_COLORS[c.name] || T.dim)} fillOpacity={0.7} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* ──── SECTION 5: TREND ANALYSIS ──── */}
                    {scanHistory.length >= 2 && (
                      <Card glow={T.cyan}>
                        <Label>SECTION 5: TREND ANALYSIS</Label>
                        <div style={{ fontSize: 10, color: T.dim, marginBottom: 8 }}>Per-LLM visibility % across {scanHistory.length} scans</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={scanHistory.slice().reverse().map(scan => {
                            const d = { date: new Date(scan.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
                            (scan.llms || []).forEach(lid => {
                              const tot = (scan.results || []).length;
                              const hit = (scan.results || []).filter(r => r.analyses?.[lid]?.mentioned && !r.analyses[lid]._error).length;
                              d[lid] = tot > 0 ? Math.round(hit / tot * 1000) / 10 : 0;
                            });
                            return d;
                          })}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="date" tick={{ fill: T.dim, fontSize: 10 }} />
                            <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 10 }} />
                            <Tooltip contentStyle={TIP_STYLE()} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: T.fontM }} />
                            {llms.map(lid => (
                              <Line key={lid} type="monotone" dataKey={lid} name={LLM_META[lid]?.name || lid} stroke={LLM_META[lid]?.color || T.dim} strokeWidth={2} dot={{ r: 3 }} />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </Card>
                    )}

                    {/* ──── SECTION 6: BENCHMARK TRACKER ──── */}
                    {rptStats && rptStats.benchmark.count > 0 && (
                      <Card glow={T.purple}>
                        <Label>SECTION 6: BENCHMARK TRACKER</Label>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.fontH, color: rptStats.benchmark.hitRate >= 70 ? T.green : rptStats.benchmark.hitRate >= 40 ? T.gold : T.red }}>{rptStats.benchmark.hitRate}%</div>
                            <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM }}>HIT RATE</div>
                          </div>
                          <div style={{ fontSize: 11, color: T.muted }}>
                            {rptStats.benchmark.hits} of {rptStats.benchmark.count} benchmark questions get Sirion mentioned
                          </div>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              <th style={{ ...rThS(), width: "55%" }}>Question</th>
                              {llms.map(lid => <th key={lid} style={{ ...rThS("center"), width: Math.floor(45 / llms.length) + "%" }}>{LLM_META[lid]?.name || lid}</th>)}
                            </tr></thead>
                            <tbody>
                              {rptStats.benchmark.results.map(r => (
                                <tr key={r.qid} style={{ borderBottom: "1px solid " + T.border }}>
                                  <td style={{ padding: "5px 8px", fontSize: 11, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }} title={r.query}>{r.query}</td>
                                  {llms.map(lid => {
                                    const a = r.analyses?.[lid];
                                    const hit = a && !a._error && a.mentioned;
                                    return (
                                      <td key={lid} style={{ padding: "5px 4px", textAlign: "center" }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.fontM, color: hit ? T.green : T.red }}>{hit ? (a.rank ? "#" + a.rank : "YES") : "NO"}</span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )}

                    {/* ──── PER-QUESTION CEO TABLE ──── */}
                    <Card>
                      <Label>PER-QUESTION INSIGHT ({rptFiltered.length})</Label>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "35%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "5%" }} />
                          </colgroup>
                          <thead><tr>
                            {sortHeader("Query", "query")}
                            {sortHeader("Status", "status", "center")}
                            {sortHeader("Visible", "visibility", "center")}
                            {sortHeader("Rank", "rank", "center")}
                            {sortHeader("Sent.", "sentiment", "center")}
                            {sortHeader("Persona", "persona", "center")}
                            {sortHeader("Stage", "stage", "center")}
                            <th style={rThS("center")}>Comps</th>
                            <th style={rThS("center")}></th>
                          </tr></thead>
                          <tbody>
                            {rptSorted.map((r, ri) => {
                              const qid = r.qid || r.id || ("q-" + ri);
                              const isExp = rptExpanded === qid;
                              const st = queryStatus(r);
                              const visCount = llms.filter(lid => r.analyses?.[lid]?.mentioned && !r.analyses[lid]?._error).length;
                              const ranks = llms.map(lid => r.analyses?.[lid]?.rank).filter(Boolean);
                              const avgR = ranks.length > 0 ? Math.round(ranks.reduce((s, v) => s + v, 0) / ranks.length * 10) / 10 : null;
                              const sent = aggregateSentiment(r);
                              const compSet = new Set();
                              llms.forEach(lid => (r.analyses?.[lid]?.vendors_mentioned || []).forEach(v => { if (!/sirion/i.test(v.name)) compSet.add(v.name); }));

                              return (
                                <React.Fragment key={qid}>
                                  <tr onClick={() => setRptExpanded(rptExpanded === qid ? null : qid)} style={{ borderBottom: isExp ? "none" : "1px solid " + T.border, cursor: "pointer", transition: "background 0.12s", background: isExp ? T.teal + "05" : "transparent" }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.teal + "08"}
                                    onMouseLeave={e => e.currentTarget.style.background = isExp ? T.teal + "05" : "transparent"}>
                                    <td style={{ padding: "6px 8px", fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.query}>{r.query}</td>
                                    <td style={{ padding: "6px 4px", textAlign: "center" }}><span style={statusBadge(st)}>{statusLabel(st)}</span></td>
                                    <td style={{ padding: "6px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, fontFamily: T.fontM, color: visCount === llms.length ? T.green : visCount > 0 ? T.gold : T.red }}>{visCount}/{llms.length}</td>
                                    <td style={{ padding: "6px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, fontFamily: T.fontM, color: avgR !== null ? (avgR <= 2 ? T.green : avgR <= 4 ? T.gold : T.orange) : T.dim }}>{avgR !== null ? "#" + avgR : "--"}</td>
                                    <td style={{ padding: "6px 4px", textAlign: "center" }}><span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: sentimentColor(sent), textTransform: "uppercase" }}>{sent === "absent" ? "--" : sent.slice(0, 3)}</span></td>
                                    <td style={{ padding: "6px 4px", textAlign: "center", fontSize: 10, fontFamily: T.fontM, color: T.purple }}>{r.persona}</td>
                                    <td style={{ padding: "6px 4px", textAlign: "center", fontSize: 10, fontFamily: T.fontM, color: T.muted }}>{r.stage}</td>
                                    <td style={{ padding: "6px 4px", textAlign: "center", fontSize: 10, fontFamily: T.fontM, color: T.orange }}>{compSet.size || "--"}</td>
                                    <td style={{ padding: "6px 4px", textAlign: "center" }}><span style={{ fontSize: 12, color: T.dim, display: "inline-block", transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>{"\u25B8"}</span></td>
                                  </tr>

                                  {/* ── Expanded CEO Card ── */}
                                  {isExp && (
                                    <tr><td colSpan={9} style={{ padding: "0 8px 14px 8px", borderBottom: "1px solid " + T.teal + "25", background: T.teal + "03" }}>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                                        {/* Mini 1: Visible? */}
                                        <div style={{ padding: "8px 10px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>VISIBLE?</div>
                                          {llms.map(lid => {
                                            const la = r.analyses?.[lid];
                                            const present = la && !la._error && la.mentioned;
                                            const meta = LLM_META[lid];
                                            return (
                                              <div key={lid} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta?.color || T.dim }} />
                                                <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.muted, minWidth: 50 }}>{meta?.name || lid}</span>
                                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.fontM, color: present ? T.green : T.red }}>{present ? "YES" : "NO"}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {/* Mini 2: Rank? */}
                                        <div style={{ padding: "8px 10px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>RANK?</div>
                                          {llms.map(lid => {
                                            const la = r.analyses?.[lid];
                                            const rk = la?.rank;
                                            const meta = LLM_META[lid];
                                            return (
                                              <div key={lid} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta?.color || T.dim }} />
                                                <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.muted, minWidth: 50 }}>{meta?.name || lid}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.fontM, color: rk ? (rk === 1 ? T.green : rk <= 3 ? T.teal : T.gold) : T.dim }}>{rk ? "#" + rk : "--"}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {/* Mini 3: Perception? */}
                                        <div style={{ padding: "8px 10px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>PERCEPTION?</div>
                                          {llms.map(lid => {
                                            const s = r.analyses?.[lid]?.sentiment;
                                            const meta = LLM_META[lid];
                                            return (
                                              <div key={lid} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta?.color || T.dim }} />
                                                <span style={{ fontSize: 10, fontFamily: T.fontM, color: T.muted, minWidth: 50 }}>{meta?.name || lid}</span>
                                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.fontM, color: sentimentColor(s || "absent"), textTransform: "uppercase" }}>{s || "--"}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {/* Mini 4: Competitors? */}
                                        <div style={{ padding: "8px 10px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>COMPETITORS?</div>
                                          {(() => {
                                            const vt = buildVendorTable(r);
                                            const comps = vt.filter(v => !v.name.toLowerCase().includes("sirion")).slice(0, 4);
                                            return comps.length > 0 ? comps.map(v => (
                                              <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: T.fontM, color: VENDOR_COLORS[v.name] || T.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                                                <span style={{ fontSize: 9, fontFamily: T.fontM, color: T.dim }}>avg #{v.avgPos.toFixed(1)}</span>
                                              </div>
                                            )) : <div style={{ fontSize: 10, color: T.dim }}>None</div>;
                                          })()}
                                        </div>
                                        {/* Mini 5: Trend? */}
                                        <div style={{ padding: "8px 10px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>TREND?</div>
                                          {scanHistory.length >= 2 ? (
                                            <ResponsiveContainer width="100%" height={60}>
                                              <LineChart data={scanHistory.slice().reverse().map(scan => {
                                                const sr = (scan.results || []).find(x => x.qid === qid);
                                                const hit = sr ? (scan.llms || []).some(lid => sr.analyses?.[lid]?.mentioned) : false;
                                                return { d: new Date(scan.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), v: hit ? 1 : 0 };
                                              })}>
                                                <XAxis dataKey="d" tick={false} axisLine={false} />
                                                <YAxis domain={[0, 1]} tick={false} axisLine={false} width={0} />
                                                <Line type="monotone" dataKey="v" stroke={T.teal} strokeWidth={2} dot={{ r: 2, fill: T.teal }} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          ) : <div style={{ fontSize: 10, color: T.dim }}>Need 2+ scans</div>}
                                        </div>
                                        {/* Mini 6: Benchmark? */}
                                        <div style={{ padding: "8px 10px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>BENCHMARK?</div>
                                          {r.qid?.startsWith("bm-") ? (
                                            <div style={{ fontSize: 10, color: T.purple, fontWeight: 600 }}>Ground-truth question {"\u2713"}</div>
                                          ) : (
                                            <div style={{ fontSize: 10, color: T.dim }}>Not a benchmark question</div>
                                          )}
                                        </div>
                                      </div>
                                    </td></tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </>
                );
              })()}
            </div>
          )}

          {/* ═══ CONTENT GAPS + PLANNING ═══ */}
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
                    {/* S6: Top 5 Content Priorities Hero */}
                    {topG.length > 0 && (
                      <Card glow={T.orange}>
                        <Label>TOP 5 CONTENT PRIORITIES THIS MONTH</Label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 4 }}>
                          {topG.slice(0, 5).map((g, i) => {
                            const qCount = g.n;
                            const pCount = g.ps.size;
                            return (
                              <div key={i} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid " + T.orange + "25", background: T.orange + "06", position: "relative" }}>
                                <div style={{ position: "absolute", top: 8, right: 10, fontSize: 20, fontWeight: 800, color: T.orange + "15", fontFamily: T.fontM }}>#{i + 1}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6, lineHeight: 1.4, paddingRight: 24, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} title={g.gap}>{g.gap}</div>
                                <div style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM, marginBottom: 8 }}>
                                  {qCount} {qCount === 1 ? "query" : "queries"} | {pCount} {pCount === 1 ? "persona" : "personas"}
                                </div>
                                <button style={{ padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: T.fontB, cursor: "pointer", border: "1px solid " + T.orange + "40", background: "transparent", color: T.orange, transition: "all 0.2s" }}>Create Content</button>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {/* Phase 4: Content Planning Panel */}
                    <ContentPlanningPanel T={T} Card={Card} Label={Label} Btn={Btn} Chip={Chip} BadgeEl={BadgeEl} topGaps={topG} company={pipeline.meta?.company || "Sirion"} initialData={pipeline.m2?.contentPipeline} onPersist={(items) => updateModule("m2", { contentPipeline: items })} />

                    <Card glow={T.purple}>
                      <Label>HOW AI FRAMES {(pipeline.meta?.company || "SIRION").toUpperCase()}'S IDENTITY</Label>
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
                      <Label>ALL CONTENT GAPS (by frequency)</Label>
                      {topG.slice(0, 15).map((g, i) => {
                        const priorityColor = i < 5 ? T.red : i < 10 ? T.gold : T.border;
                        const qCount = g.n;
                        const pCount = g.ps.size;
                        return (
                          <div key={i} style={{ padding: "8px 0 8px 10px", borderBottom: i < 14 ? "1px solid " + T.border : "none", borderLeft: "2px solid " + priorityColor, marginBottom: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, color: T.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.gap}>{g.gap}</div>
                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM, marginRight: 4 }}>{qCount} {qCount === 1 ? "query" : "queries"}, {pCount} {pCount === 1 ? "persona" : "personas"}</span>
                                {[...g.ps].map(p => <Chip key={p} text={p} color={T.purple} />)}
                                {[...g.ss].map(s2 => <Chip key={s2} text={s2} color={stageColor(s2)} />)}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: T.orange, fontFamily: T.fontM }}>{g.n}{"\u00D7"}</span>
                              <button style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, fontFamily: T.fontB, cursor: "pointer", border: "1px solid " + T.border, background: "transparent", color: T.dim, transition: "all 0.2s", whiteSpace: "nowrap" }}>Create Content</button>
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                  </>
                );
              })()}
            </div>
          )}

          {/* ═══ TRENDS & DELTA VIEW ═══ */}
          {nav === "trends" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>


              {/* ── DYNAMIC TRENDS FROM REPORT FILTERS ── */}
              {dynamicTrends.length > 0 && dynamicTrends.map(trend => (
                <Card key={trend.id} glow={T.purple}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Label>{trend.name.toUpperCase()} — VISIBILITY ACROSS SCANS</Label>
                    <button onClick={() => setDynamicTrends(prev => prev.filter(t => t.id !== trend.id))}
                      style={{ background: "rgba(255,60,60,0.12)", border: "1px solid rgba(255,60,60,0.25)", color: "#ff6b6b", borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Remove this trend graph">✕</button>
                  </div>
                  <div style={{ fontSize: 9, color: T.dim, marginBottom: 8, fontFamily: T.fontM }}>
                    {trend.data.length} data points | Generated from Report filters
                  </div>
                  {trend.data.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trend.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="date" tick={{ fill: T.dim, fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 11 }} unit="%" />
                        <Tooltip contentStyle={TIP_STYLE()} formatter={(v) => [`${v}%`, "Visibility"]} />
                        <Line type="monotone" dataKey="visibility" name="Visibility %" stroke={T.purple} strokeWidth={2.5} dot={{ r: 3, fill: T.purple }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ fontSize: 11, color: T.dim, padding: 20, textAlign: "center" }}>
                      Need at least 2 scan data points to show a trend line. Currently {trend.data.length} point{trend.data.length !== 1 ? "s" : ""}.
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: T.dim, marginTop: 6, fontFamily: T.fontM }}>
                    Filters: {Object.entries(trend.filters).filter(([, v]) => v !== "All" && v !== "").map(([k, v]) => `${k}: ${v}`).join(" | ") || "None (all questions)"}
                  </div>
                </Card>
              ))}

              {/* ── TIER 2: FULL SCAN TRENDS ── */}
              {scanHistory.length === 0 ? (
                <EmptyState icon={"\u2197\uFE0F"} title="Full Scan Trends" description="Run scans with all queries to see broad visibility trends." action={<Btn primary onClick={() => setNav("scan")}>{"\u26A1"} Run First Scan</Btn>} />
              ) : (
                <>
                  {/* ── TREND LINE CHART ── */}
                  {(() => {
                    // Chart uses all scans
                    const chartScans = scanHistory.slice().reverse();
                    const chartData = chartScans.map(s => {
                      return {
                        d: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                        label: `${s.results?.length || 0}q`,
                        overall: s.scores?.overall || 0,
                        mention: s.scores?.mention || 0,
                        sentiment: s.scores?.sentiment || 0,
                        sov: s.scores?.shareOfVoice || 0,
                        position: s.scores?.position || 0,
                        queries: s.results?.length || 0,
                      };
                    });
                    return chartData.length > 1 ? (
                      <Card glow={T.teal}>
                        <Label>AI VISIBILITY OVER TIME</Label>
                        <div style={{ fontSize: 9, color: T.dim, marginBottom: 8 }}>
                          {chartData.length} scans tracked.
                        </div>
                        <ResponsiveContainer width="100%" height={260}>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="d" tick={{ fill: T.dim, fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 11 }} />
                            <Tooltip
                              contentStyle={TIP_STYLE()}
                              labelFormatter={(v, payload) => {
                                const p = payload?.[0]?.payload;
                                return p ? `${v} (${p.queries} queries)` : v;
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: T.fontM }} />
                            <Line type="monotone" dataKey="overall" name="Overall" stroke={T.teal} strokeWidth={2.5} dot={{ r: 3, fill: T.teal }} />
                            <Line type="monotone" dataKey="mention" name="Mention Rate" stroke={T.green} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                            <Line type="monotone" dataKey="sentiment" name="Sentiment" stroke={T.gold} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                            <Line type="monotone" dataKey="sov" name="Share of Voice" stroke={T.cyan} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                            <Line type="monotone" dataKey="position" name="Position Score" stroke={T.purple} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                          </LineChart>
                        </ResponsiveContainer>
                      </Card>
                    ) : null;
                  })()}

                  {/* ── GRAPH 2: COMPLETE DATABASE OUTLOOK ── */}
                  {(() => {
                    const fullScans = scanHistory.filter(s => (s.results?.length || 0) > 20).slice().reverse();
                    if (fullScans.length < 1) return null;
                    const chartData = fullScans.map(s => {
                      const totalQ = s.results?.length || 0;
                      const presentQ = (s.results || []).filter(r => {
                        return (s.llms || []).some(lid => r.analyses?.[lid]?.mentioned);
                      }).length;
                      const llms = s.llms || [];
                      const perLlm = {};
                      llms.forEach(lid => {
                        const cited = (s.results || []).filter(r => r.analyses?.[lid]?.mentioned).length;
                        perLlm[lid] = totalQ > 0 ? Math.round((cited / totalQ) * 100) : 0;
                      });
                      return {
                        d: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                        overall: totalQ > 0 ? Math.round((presentQ / totalQ) * 100) : 0,
                        queries: totalQ,
                        ...perLlm,
                      };
                    });
                    return (
                      <Card glow={T.teal} style={{ marginBottom: 14, borderLeft: `3px solid ${T.teal}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Complete Database Outlook</div>
                            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                              All {chartData[chartData.length - 1]?.queries || 0}+ dynamic questions — overall visibility % across full scans
                            </div>
                          </div>
                          <SourceTag lens="scan" />
                        </div>
                        {/* Latest stats */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                          <div style={{ padding: "6px 12px", borderRadius: 6, background: T.teal + "08", border: "1px solid " + T.teal + "20" }}>
                            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.fontH, color: T.teal }}>{chartData[chartData.length - 1]?.overall || 0}%</div>
                            <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM }}>Latest Visibility</div>
                          </div>
                          {chartData.length > 1 && (() => {
                            const d = chartData[chartData.length - 1].overall - chartData[0].overall;
                            return (
                              <div style={{ padding: "6px 12px", borderRadius: 6, background: (d >= 0 ? T.green : T.red) + "08", border: "1px solid " + (d >= 0 ? T.green : T.red) + "20" }}>
                                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.fontH, color: d >= 0 ? T.green : T.red }}>{d >= 0 ? "+" : ""}{d}pp</div>
                                <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM }}>Since first scan</div>
                              </div>
                            );
                          })()}
                          <div style={{ padding: "6px 12px", borderRadius: 6, background: T.surface, border: "1px solid " + T.border }}>
                            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.fontH, color: T.text }}>{chartData.length}</div>
                            <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM }}>Full scans</div>
                          </div>
                        </div>
                        {chartData.length > 1 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={chartData}>
                              <defs>
                                <linearGradient id="gradDbOverall" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={T.teal} stopOpacity={0.3} />
                                  <stop offset="100%" stopColor={T.teal} stopOpacity={0.02} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                              <XAxis dataKey="d" tick={{ fill: T.dim, fontSize: 10 }} />
                              <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 10 }} tickFormatter={v => `${v}%`} />
                              <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, fontFamily: T.fontM }} formatter={(v, name) => [`${v}%`, name]} />
                              <Legend wrapperStyle={{ fontSize: 10, fontFamily: T.fontM }} />
                              <Area type="monotone" dataKey="overall" name="Overall Visibility" stroke={T.teal} strokeWidth={2.5} fill="url(#gradDbOverall)" dot={{ r: 3, fill: T.teal }} />
                              <Line type="monotone" dataKey="openai" name="ChatGPT" stroke={T.green} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                              <Line type="monotone" dataKey="gemini" name="Gemini" stroke={T.blue} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                              <Line type="monotone" dataKey="claude" name="Claude" stroke={T_DARK.purple} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ padding: "16px 12px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: T.muted }}>Run a second full scan to see the trend line</div>
                          </div>
                        )}
                      </Card>
                    );
                  })()}

                  {/* ── GRAPH 3: SECTION-WISE LIFECYCLE ANALYSIS ── */}
                  {(() => {
                    const fullScans = scanHistory.filter(s => (s.results?.length || 0) > 20).slice().reverse();
                    if (fullScans.length < 1) return null;
                    const lifecycles = ["pre-signature", "post-signature", "full-stack"];
                    const lcLabels = { "pre-signature": "Pre-Signature", "post-signature": "Post-Signature", "full-stack": "Full-Stack" };
                    const lcColors = { "pre-signature": T.blue, "post-signature": T.gold, "full-stack": T.green };
                    const chartData = fullScans.map(s => {
                      const point = { d: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
                      lifecycles.forEach(lc => {
                        const lcResults = (s.results || []).filter(r => r.lifecycle === lc);
                        if (lcResults.length === 0) { point[lc] = 0; return; }
                        const presentCount = lcResults.filter(r => (s.llms || []).some(lid => r.analyses?.[lid]?.mentioned)).length;
                        point[lc] = Math.round((presentCount / lcResults.length) * 100);
                      });
                      return point;
                    });
                    // Latest values
                    const latest = chartData[chartData.length - 1] || {};
                    return (
                      <Card glow={T.green} style={{ marginBottom: 14, borderLeft: `3px solid ${T.green}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: T.fontH, color: T.text }}>Section-wise Lifecycle Analysis</div>
                            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                              Pre-Signature, Post-Signature, and Full-Stack visibility trends overlaid
                            </div>
                          </div>
                          <SourceTag lens="scan" />
                        </div>
                        {/* Current values */}
                        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                          {lifecycles.map(lc => (
                            <div key={lc} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: lcColors[lc] + "08", border: "1px solid " + lcColors[lc] + "20", textAlign: "center" }}>
                              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: T.fontH, color: lcColors[lc] }}>{latest[lc] || 0}%</div>
                              <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM }}>{lcLabels[lc]}</div>
                              {chartData.length > 1 && (() => {
                                const d = (latest[lc] || 0) - (chartData[0][lc] || 0);
                                return d !== 0 ? <div style={{ fontSize: 9, fontWeight: 700, fontFamily: T.fontM, color: d > 0 ? T.green : T.red, marginTop: 2 }}>{d > 0 ? "+" : ""}{d}pp</div> : null;
                              })()}
                            </div>
                          ))}
                        </div>
                        {chartData.length > 1 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                              <XAxis dataKey="d" tick={{ fill: T.dim, fontSize: 10 }} />
                              <YAxis domain={[0, 100]} tick={{ fill: T.dim, fontSize: 10 }} tickFormatter={v => `${v}%`} />
                              <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, fontFamily: T.fontM }} formatter={(v, name) => [`${v}%`, name]} />
                              <Legend wrapperStyle={{ fontSize: 10, fontFamily: T.fontM }} />
                              {lifecycles.map(lc => (
                                <Line key={lc} type="monotone" dataKey={lc} name={lcLabels[lc]} stroke={lcColors[lc]} strokeWidth={2.5} dot={{ r: 4, fill: lcColors[lc], stroke: lcColors[lc] }} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ padding: "16px 12px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: T.muted }}>Run a second full scan to see lifecycle trend lines</div>
                          </div>
                        )}
                      </Card>
                    );
                  })()}

                  {/* ── SCAN COMPARISON SELECTOR ── */}
                  {scanHistory.length >= 2 && (
                    <Card>
                      <Label>SCAN COMPARISON</Label>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 10 }}>Select a scan to compare against the current view ({scanData ? new Date(scanData.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--"})</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {scanHistory.filter(s => s.id !== scanData?.id).map(s => (
                          <div key={s.id} onClick={() => setCompareScanId(compareScanId === s.id ? null : s.id)} style={{
                            padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: T.fontM,
                            background: compareScanId === s.id ? T.teal + "15" : "rgba(255,255,255,0.02)",
                            border: "1px solid " + (compareScanId === s.id ? T.teal : T.border),
                            color: compareScanId === s.id ? T.teal : T.muted,
                            transition: "all 0.2s",
                          }}>
                            {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.6 }}>Score {s.scores?.overall || 0}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* ── SCORE DELTA CARDS (when comparison scan selected) ── */}
                  {compareScan && scanData && (() => {
                    const metrics = [
                      { key: "overall", label: "Overall", color: T.teal },
                      { key: "mention", label: "Mention Rate", color: T.green },
                      { key: "sentiment", label: "Sentiment", color: T.gold },
                      { key: "shareOfVoice", label: "Share of Voice", color: T.cyan },
                      { key: "position", label: "Position", color: T.purple },
                    ];
                    return (
                      <Card glow={T.blue}>
                        <Label>SCORE COMPARISON</Label>
                        <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>
                          {new Date(compareScan.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {"=>"} {new Date(scanData.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                          {metrics.map(m => {
                            const cur = scanData.scores?.[m.key] || 0;
                            const prv = compareScan.scores?.[m.key] || 0;
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

                  {/* ── NARRATIVE DELTA (how framing shifted) ── */}
                  {narrativeDelta && (
                    <Card>
                      <Label>NARRATIVE SHIFT</Label>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>How AI's framing of {scanData?.company || "Sirion"} changed between scans</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                        {[
                          { l: "Narrative Health", v: narrativeDelta.cur.narrativeScore, d: narrativeDelta.scoreDelta, c: narrativeDelta.scoreDelta >= 0 ? T.green : T.red },
                          { l: "Post-Sig Only", v: narrativeDelta.cur.postSigPct + "%", d: narrativeDelta.postSigDelta, c: narrativeDelta.postSigDelta <= 0 ? T.green : T.red, inv: true },
                          { l: "Full-Stack", v: narrativeDelta.cur.fullStackPct + "%", d: narrativeDelta.fullStackDelta, c: narrativeDelta.fullStackDelta >= 0 ? T.green : T.red },
                          { l: "Pre-Sig", v: narrativeDelta.cur.preSigPct + "%", d: narrativeDelta.preSigDelta, c: narrativeDelta.preSigDelta >= 0 ? T.green : T.red },
                        ].map((m, i) => (
                          <div key={i} style={{ padding: "10px 8px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid " + m.c + "18", textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: T.dim, fontFamily: T.fontM, marginBottom: 3, textTransform: "uppercase" }}>{m.l}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.fontH, color: m.c }}>{m.v}</div>
                            <DeltaBadge val={m.inv ? -m.d : m.d} suffix={typeof m.v === "string" ? "pp" : "pts"} />
                          </div>
                        ))}
                      </div>
                      {/* Per-class breakdown bars */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {NARRATIVE_CLASSES.filter(nc => nc.id !== "absent").map(nc => {
                          const curEntry = (narrativeDelta.cur.breakdown || []).find(b => b.id === nc.id);
                          const prevEntry = (narrativeDelta.prev.breakdown || []).find(b => b.id === nc.id);
                          const curPct = curEntry?.pct || 0, prevPct = prevEntry?.pct || 0;
                          const delta = curPct - prevPct;
                          return (
                            <div key={nc.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: nc.color, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.muted }}>{nc.label}</div>
                              <div style={{ fontFamily: T.fontM, fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>{curPct}%</div>
                              {delta !== 0 && <span style={{ fontSize: 10, fontWeight: 700, color: (nc.id === "post-sig-only" || nc.id === "negative") ? (delta <= 0 ? T.green : T.red) : (delta >= 0 ? T.green : T.red) }}>
                                {delta > 0 ? "+" : ""}{delta}pp
                              </span>}
                            </div>
                          );
                        })}
                      </div>
                      {/* Insight message */}
                      {narrativeDelta.scoreDelta !== 0 && (
                        <div style={{ fontSize: 10, color: narrativeDelta.scoreDelta > 0 ? T.green : T.red, padding: "6px 8px", marginTop: 10, background: (narrativeDelta.scoreDelta > 0 ? T.green : T.red) + "08", borderRadius: 5, lineHeight: 1.5 }}>
                          {narrativeDelta.scoreDelta > 0
                            ? `Narrative health improved by ${narrativeDelta.scoreDelta} points. ${narrativeDelta.fullStackDelta > 0 ? "Full-stack framing is growing." : "Keep pushing full-stack content."}`
                            : `Narrative health declined by ${Math.abs(narrativeDelta.scoreDelta)} points. ${narrativeDelta.postSigDelta > 0 ? "Post-sig framing increased — publish more pre-sig and full-stack content." : "Review what changed in AI responses."}`
                          }
                        </div>
                      )}
                    </Card>
                  )}

                  {/* ── COMPETITOR SHIFT ── */}
                  {competitorShift && competitorShift.length > 0 && (
                    <Card>
                      <Label>COMPETITOR SHIFT</Label>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 10 }}>Vendor mention changes between scans</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {competitorShift.map((v, i) => {
                          const isTarget = v.vendor.includes("sirion");
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, background: isTarget ? T.teal + "08" : "transparent", border: isTarget ? "1px solid " + T.teal + "20" : "none" }}>
                              <div style={{ flex: 1, fontSize: 11, fontWeight: isTarget ? 700 : 500, color: isTarget ? T.teal : T.muted, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.vendor}</div>
                              <div style={{ fontSize: 11, fontFamily: T.fontM, fontWeight: 600, color: T.text }}>{v.cur}</div>
                              <DeltaBadge val={v.delta} />
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {/* ── PER-QUERY CHANGES ── */}
                  {queryDiff && (queryDiff.improved.length > 0 || queryDiff.declined.length > 0) && (
                    <Card>
                      <Label>QUERY-LEVEL CHANGES</Label>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 10 }}>
                        {queryDiff.improved.length} improved, {queryDiff.declined.length} declined, {queryDiff.newQueries.length} new queries
                      </div>
                      {/* Improved */}
                      {queryDiff.improved.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.fontM }}>Improved ({queryDiff.improved.length})</div>
                          {queryDiff.improved.slice(0, 5).map((q, i) => (
                            <div key={q.qid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid " + T.border + "40" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: T.green, fontFamily: T.fontM, flexShrink: 0 }}>+{q.delta}</div>
                              <div style={{ flex: 1, fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</div>
                              <Chip text={q.lifecycle || "full-stack"} color={q.lifecycle === "pre-signature" ? T.blue : q.lifecycle === "post-signature" ? T.gold : T.green} />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Declined */}
                      {queryDiff.declined.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: T.fontM }}>Declined ({queryDiff.declined.length})</div>
                          {queryDiff.declined.slice(0, 5).map((q, i) => (
                            <div key={q.qid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid " + T.border + "40" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: T.red, fontFamily: T.fontM, flexShrink: 0 }}>{q.delta}</div>
                              <div style={{ flex: 1, fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</div>
                              <Chip text={q.lifecycle || "full-stack"} color={q.lifecycle === "pre-signature" ? T.blue : q.lifecycle === "post-signature" ? T.gold : T.green} />
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}

                  {/* ── SCAN HISTORY LIST ── */}
                  <Card>
                    <Label>SCAN HISTORY</Label>
                    {scanHistory.map((s, i) => (
                      <div key={s.id} onClick={() => { setScanData(s); setNav("overview"); }} style={{ padding: "9px 12px", borderRadius: 6, marginBottom: 4, cursor: "pointer", background: scanData?.id === s.id ? T.teal + "08" : "transparent", border: "1px solid " + (scanData?.id === s.id ? T.teal + "25" : T.border), display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{new Date(s.date).toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.count} queries {"\u00B7"} {s.llms?.length || 0} LLMs {"\u00B7"} {s.cost?.display || "--"} {"\u00B7"} {Math.round((s.duration || 0) / 1000)}s</div>
                        </div>
                        <Ring score={s.scores?.overall || 0} size={36} color={T.teal} />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteScan(s.id); }}
                          title="Delete this scan"
                          style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid " + T.border, background: "transparent", color: T.dim, fontSize: 10, fontWeight: 700, fontFamily: T.fontM, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s ease" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.red + "50"; e.currentTarget.style.background = T.red + "10"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "transparent"; }}
                        >{"\u2715"}</button>
                      </div>
                    ))}
                  </Card>

                  {/* ── TRAJECTORY PREDICTION ── */}
                  {scanHistory.length >= 2 && (() => {
                    const full = scanHistory.filter(s => (s.results?.length || 0) > 20);
                    if (full.length < 2) return null;
                    const first = full[full.length - 1], last = full[0];
                    const months = Math.max(0.5, (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24 * 30));
                    const curScore = last.scores?.overall || 0;
                    const rate = (curScore - (first.scores?.overall || 0)) / months;
                    const target = 80;
                    const pct = Math.min(100, Math.round((curScore / target) * 100));
                    const msg = curScore >= target ? "Target already reached!" : rate > 0 ? `At current rate, you'll reach ${target}% visibility in ${Math.ceil((target - curScore) / rate)} months` : "Score is declining \u2014 content strategy needs attention";
                    return (
                      <Card glow={rate > 0 ? T.teal : T.red}>
                        <Label>TRAJECTORY PREDICTION</Label>
                        <div style={{ fontSize: 11, color: rate > 0 ? T.green : T.red, fontWeight: 600, marginBottom: 8 }}>{msg}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.border }}>
                            <div style={{ width: pct + "%", height: "100%", borderRadius: 3, background: curScore >= target ? T.green : rate > 0 ? T.teal : T.red, transition: "width 0.5s ease" }} />
                          </div>
                          <div style={{ fontSize: 9, color: T.dim, fontFamily: T.fontM, flexShrink: 0 }}>{curScore}/{target}</div>
                        </div>
                        <div style={{ fontSize: 9, color: T.dim, marginTop: 6 }}>Rate: {rate > 0 ? "+" : ""}{rate.toFixed(1)} pts/mo {"\u00B7"} {full.length} full scans analyzed</div>
                      </Card>
                    );
                  })()}

                  {/* ── ANOMALIES & ALERTS ── */}
                  {scanHistory.length >= 2 && (() => {
                    const cur = scanHistory[0], prev = scanHistory[1];
                    const metrics = [
                      { key: "overall", label: "Overall Score" },
                      { key: "mention", label: "Mention Rate" },
                      { key: "sentiment", label: "Sentiment" },
                      { key: "shareOfVoice", label: "Share of Voice" },
                      { key: "position", label: "Position" },
                    ];
                    const anomalies = metrics.map(m => {
                      const d = (cur.scores?.[m.key] || 0) - (prev.scores?.[m.key] || 0);
                      return Math.abs(d) > 5 ? { ...m, delta: d } : null;
                    }).filter(Boolean);
                    return (
                      <Card>
                        <Label>ANOMALIES & ALERTS</Label>
                        {anomalies.length === 0
                          ? <div style={{ fontSize: 11, color: T.dim }}>All metrics stable \u2014 no significant changes detected</div>
                          : anomalies.map(a => (
                            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid " + T.border + "30" }}>
                              <div style={{ width: 6, height: 6, borderRadius: 3, background: a.delta > 0 ? T.green : T.red, flexShrink: 0 }} />
                              <div style={{ fontSize: 11, color: a.delta > 0 ? T.green : T.red, fontWeight: 600 }}>{a.label} {a.delta > 0 ? "gained" : "dropped"} {a.delta > 0 ? "+" : ""}{a.delta} pts</div>
                              {a.delta < 0 && <div style={{ fontSize: 9, color: T.dim, marginLeft: "auto" }}>investigate competitor content</div>}
                            </div>
                          ))
                        }
                      </Card>
                    );
                  })()}

                  {/* ── RECOMMENDED SCAN FREQUENCY ── */}
                  {scanHistory.length >= 1 && (() => {
                    const lastDate = new Date(scanHistory[0].date);
                    const daysSince = Math.round((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
                    const hasFastChange = scanHistory.length >= 2 && Math.abs((scanHistory[0].scores?.overall || 0) - (scanHistory[1].scores?.overall || 0)) > 10;
                    const isStable = scanHistory.length >= 2 && ["overall", "mention", "sentiment", "shareOfVoice", "position"].every(k => Math.abs((scanHistory[0].scores?.[k] || 0) - (scanHistory[1].scores?.[k] || 0)) < 5);
                    const rec = scanHistory.length < 3 ? "Scan weekly to build a reliable trend baseline (minimum 3 data points needed)" : hasFastChange ? "Score is volatile \u2014 scan every 3 days to track content impact" : isStable ? "Score is stable \u2014 bi-weekly scans are sufficient to track gradual shifts" : "Weekly scans recommended to maintain visibility tracking";
                    return (
                      <Card>
                        <Label>RECOMMENDED SCAN FREQUENCY</Label>
                        <div style={{ fontSize: 11, color: hasFastChange ? T.gold : T.dim, fontWeight: 600, marginBottom: 6 }}>{rec}</div>
                        <div style={{ fontSize: 9, color: T.dim }}>Last scan: {lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {"\u00B7"} {daysSince === 0 ? "today" : daysSince + " days ago"}</div>
                      </Card>
                    );
                  })()}

                </>
              )}
            </div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {nav === "settings" && (
            <div style={{ animation: "fadeUp 0.35s ease" }}>
              {/* S7: LLM keys managed in global Settings — compact status + link here */}
              <Card glow={T.purple}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <Label>LLM CONNECTIONS</Label>
                  <Btn onClick={handleTestConnections} disabled={testing}>{testing ? "Testing..." : "Test All"}</Btn>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {["claude", "openai", "gemini", "perplexity"].map(id => {
                    const avail = allLLMs.includes(id);
                    const conn = connections[id];
                    const sc = conn === "connected" ? T.green : conn === "error" ? T.red : avail ? T.gold : T.dim;
                    return (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: `${sc}08`, border: `1px solid ${sc}20` }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: T.text }}>{LLM_META[id]?.name}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                  Manage API keys in <span style={{ color: T.teal, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }} onClick={() => { /* navigate handled by parent — keys in global Settings */ }}>Global Settings</span>. Keys are shared across all modules.
                </div>
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

              {/* ── CALIBRATION CONTROLS ── */}
              <CalibrationPanel T={T} Card={Card} Label={Label} Btn={Btn} BadgeEl={BadgeEl} onPersist={(cal) => updateModule("m2", { calibration: cal })} />
            </div>
          )}

          </>)} {/* end hydrating ternary */}
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from "react";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { db } from "./firebase.js";
import { callClaude, callClaudeFast } from "./claudeApi.js";
import {
  questionHash, saveQuestions, getQuestionsForCompany,
  saveMacro, getAllMacros, saveCompanyIntel, getCompanyIntel,
  getKnowledgeBaseStats, savePersona, savePersonas,
  getPersonasForCompany, getAllPersonas, updatePersona, deletePersona,
  hydrateQuestions, hydrateMacros, hydrateCompanyIntel,
} from "./questionDB.js";

/* ═══════════════════════════════════════════════════════
   MODULE 1 — QUESTION GENERATOR + PERSONA RESEARCH
   AI-Powered · Two tabs: Questions & Persona Research
   Exports questions + persona profiles to pipeline
   ═══════════════════════════════════════════════════════ */

// Strip HTML tags (e.g. <cite>, <ref>, <source>) from AI-generated text
function cleanAIText(text) {
  if (!text) return "";
  return text
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/<\/?ref[^>]*>/gi, "")
    .replace(/<\/?source[^>]*>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PERSONAS = [
  { id: "gc", label: "General Counsel", icon: "\u2696", short: "GC" },
  { id: "cpo", label: "Chief Procurement Officer", icon: "\uD83D\uDCCB", short: "CPO" },
  { id: "cio", label: "Chief Information Officer", icon: "\uD83D\uDCBB", short: "CIO" },
  { id: "vplo", label: "VP Legal Operations", icon: "\u2699", short: "VP LO" },
  { id: "cto", label: "VP IT / CTO", icon: "\uD83D\uDD27", short: "CTO" },
  { id: "cm", label: "Contract Manager", icon: "\uD83D\uDCC4", short: "CM" },
  { id: "pd", label: "Procurement Director", icon: "\uD83C\uDFE2", short: "PD" },
  { id: "cfo", label: "CFO", icon: "\uD83D\uDCB0", short: "CFO" },
];

const STAGES = [
  { id: "awareness", label: "Awareness", color: "#a78bfa" },
  { id: "discovery", label: "Discovery", color: "#67e8f9" },
  { id: "consideration", label: "Consideration", color: "#fbbf24" },
  { id: "decision", label: "Decision", color: "#4ade80" },
  { id: "validation", label: "Validation", color: "#fb923c" },
];

const CLUSTERS = [
  "Contract AI / Automation",
  "CLM Platform Selection",
  "Post-Signature / Obligations",
  "Procurement CLM",
  "Enterprise Scale",
  "Financial Services CLM",
  "Implementation & ROI",
  "Analyst Rankings",
  "Agentic CLM",
];

/* ── CLM Lifecycle Stages ──────────────────────────────
   Pre-Signature: Authoring, templates, redlining, negotiation, workflow, approvals
   Post-Signature: Obligation tracking, compliance, SLA, performance, renewals, amendments
   Full-Stack CLM: End-to-end platform, repository, analytics, AI, integrations
   ────────────────────────────────────────────────────── */
const CLM_LIFECYCLE = [
  { id: "pre-signature", label: "Pre-Signature", color: "#3b82f6", icon: "\u270D", desc: "Authoring, negotiation, redlining, approvals" },
  { id: "post-signature", label: "Post-Signature", color: "#10b981", icon: "\u2705", desc: "Obligations, compliance, renewals, SLAs" },
  { id: "full-stack", label: "Full-Stack CLM", color: "#a78bfa", icon: "\u267E", desc: "End-to-end platform, analytics, integrations" },
];

/* Map clusters to their primary lifecycle stage */
const CLUSTER_LIFECYCLE_MAP = {
  "Contract AI / Automation": "pre-signature",
  "CLM Platform Selection": "full-stack",
  "Post-Signature / Obligations": "post-signature",
  "Procurement CLM": "full-stack",
  "Enterprise Scale": "full-stack",
  "Financial Services CLM": "full-stack",
  "Implementation & ROI": "full-stack",
  "Analyst Rankings": "full-stack",
  "Agentic CLM": "pre-signature",
};

/* Pre-built question templates — {company} gets replaced, l = lifecycle stage */
const Q_BANK = [
  // AWARENESS
  { q: "What are the biggest risks of managing enterprise contracts without dedicated CLM software?", p: "gc", s: "awareness", c: "CLM Platform Selection", l: "full-stack" },
  { q: "How is AI changing contract lifecycle management in 2026?", p: "cio", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What is the ROI of implementing a CLM platform for procurement teams?", p: "cpo", s: "awareness", c: "Implementation & ROI", l: "full-stack" },
  { q: "How much revenue leakage occurs from poor contract management?", p: "cfo", s: "awareness", c: "Post-Signature / Obligations", l: "post-signature" },
  { q: "What are the compliance risks of manual contract tracking?", p: "gc", s: "awareness", c: "Post-Signature / Obligations", l: "post-signature" },
  { q: "How does agentic AI apply to contract management workflows?", p: "cto", s: "awareness", c: "Agentic CLM", l: "pre-signature" },
  { q: "What percentage of enterprise contracts are poorly managed?", p: "cm", s: "awareness", c: "CLM Platform Selection", l: "full-stack" },
  { q: "What are the hidden costs of not having a CLM system?", p: "cfo", s: "awareness", c: "Implementation & ROI", l: "full-stack" },
  // PRE-SIGNATURE AWARENESS (new)
  { q: "How can AI automate contract authoring and template management?", p: "vplo", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What are best practices for AI-powered contract redlining and negotiation?", p: "gc", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "How much time do legal teams waste on manual contract drafting and approvals?", p: "vplo", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  // DISCOVERY
  { q: "What are the best CLM software platforms for large enterprises?", p: "cio", s: "discovery", c: "CLM Platform Selection", l: "full-stack" },
  { q: "Which CLM solutions offer the strongest AI-powered contract review?", p: "vplo", s: "discovery", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What CLM platforms integrate best with SAP and Oracle procurement?", p: "cpo", s: "discovery", c: "Procurement CLM", l: "full-stack" },
  { q: "Which contract management tools are best for financial services?", p: "gc", s: "discovery", c: "Financial Services CLM", l: "full-stack" },
  { q: "What are the top contract analytics and reporting tools?", p: "cm", s: "discovery", c: "Contract AI / Automation", l: "full-stack" },
  { q: "Which CLM vendors offer no-code workflow configuration?", p: "cto", s: "discovery", c: "Enterprise Scale", l: "full-stack" },
  { q: "What CLM solutions support multi-entity global contract management?", p: "pd", s: "discovery", c: "Enterprise Scale", l: "full-stack" },
  { q: "What are the leading AI-native contract management platforms?", p: "cio", s: "discovery", c: "Agentic CLM", l: "full-stack" },
  // PRE-SIGNATURE DISCOVERY (new)
  { q: "Which CLM platforms have the best pre-signature contract authoring capabilities?", p: "gc", s: "discovery", c: "CLM Platform Selection", l: "pre-signature" },
  { q: "What CLM tools offer AI-powered clause intelligence and playbook automation?", p: "vplo", s: "discovery", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "Best contract negotiation and collaboration tools for enterprise legal teams?", p: "gc", s: "discovery", c: "Contract AI / Automation", l: "pre-signature" },
  // CONSIDERATION
  { q: "How does {company} compare to Icertis for enterprise CLM?", p: "cio", s: "consideration", c: "CLM Platform Selection", l: "full-stack" },
  { q: "{company} vs Agiloft — which is better for legal teams?", p: "gc", s: "consideration", c: "CLM Platform Selection", l: "full-stack" },
  { q: "What do Gartner analysts say about {company} CLM?", p: "cpo", s: "consideration", c: "Analyst Rankings", l: "full-stack" },
  { q: "{company} pricing and total cost of ownership for CLM", p: "cfo", s: "consideration", c: "Implementation & ROI", l: "full-stack" },
  { q: "Is {company} a Leader in the Gartner Magic Quadrant for CLM?", p: "vplo", s: "consideration", c: "Analyst Rankings", l: "full-stack" },
  { q: "{company} CLM implementation timeline and complexity", p: "cto", s: "consideration", c: "Implementation & ROI", l: "full-stack" },
  { q: "How does {company} handle obligation management and compliance?", p: "gc", s: "consideration", c: "Post-Signature / Obligations", l: "post-signature" },
  { q: "{company} vs DocuSign CLM — feature comparison", p: "cm", s: "consideration", c: "CLM Platform Selection", l: "full-stack" },
  { q: "What industries does {company} CLM support best?", p: "pd", s: "consideration", c: "Enterprise Scale", l: "full-stack" },
  { q: "Does {company} support agentic AI for autonomous contract workflows?", p: "cio", s: "consideration", c: "Agentic CLM", l: "pre-signature" },
  { q: "{company} contract AI capabilities vs competitors", p: "vplo", s: "consideration", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What is {company} CLM's approach to procurement automation?", p: "cpo", s: "consideration", c: "Procurement CLM", l: "full-stack" },
  // PRE-SIGNATURE CONSIDERATION (new)
  { q: "How does {company} pre-signature contract authoring compare to Ironclad?", p: "gc", s: "consideration", c: "CLM Platform Selection", l: "pre-signature" },
  { q: "{company} AI redlining and clause intelligence — how does it work?", p: "vplo", s: "consideration", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "Does {company} offer automated contract negotiation workflows?", p: "cpo", s: "consideration", c: "Contract AI / Automation", l: "pre-signature" },
  // DECISION
  { q: "What do {company} CLM customers say in G2 reviews?", p: "vplo", s: "decision", c: "Analyst Rankings", l: "full-stack" },
  { q: "{company} CLM case studies in financial services", p: "gc", s: "decision", c: "Financial Services CLM", l: "full-stack" },
  { q: "How long does {company} CLM take to show ROI?", p: "cfo", s: "decision", c: "Implementation & ROI", l: "full-stack" },
  { q: "{company} CLM security certifications and compliance", p: "cto", s: "decision", c: "Enterprise Scale", l: "full-stack" },
  { q: "What support and training does {company} provide for CLM?", p: "cm", s: "decision", c: "Implementation & ROI", l: "full-stack" },
  { q: "{company} contract management for global procurement teams", p: "pd", s: "decision", c: "Procurement CLM", l: "full-stack" },
  { q: "How does {company} compare on Forrester Wave for CLM?", p: "cpo", s: "decision", c: "Analyst Rankings", l: "full-stack" },
  { q: "{company} CLM integration with existing enterprise tech stack", p: "cio", s: "decision", c: "Enterprise Scale", l: "full-stack" },
  // VALIDATION
  { q: "Is {company} CLM worth the investment after 1 year?", p: "cfo", s: "validation", c: "Implementation & ROI", l: "full-stack" },
  { q: "{company} CLM user satisfaction and NPS scores", p: "vplo", s: "validation", c: "Analyst Rankings", l: "full-stack" },
  { q: "How to maximize ROI from {company} CLM deployment", p: "cm", s: "validation", c: "Implementation & ROI", l: "full-stack" },
  { q: "{company} CLM roadmap and future AI capabilities", p: "cio", s: "validation", c: "Agentic CLM", l: "pre-signature" },
  { q: "Best practices for scaling {company} CLM across business units", p: "pd", s: "validation", c: "Enterprise Scale", l: "full-stack" },
];

/* ── LinkedIn Cleanup Prompt (reused from M4) ──────────── */
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
      "duration": "Duration text (e.g. 'Jan 2023 - Present')",
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

/* ── Persona Research Prompt ───────────────────────────── */
const PERSONA_RESEARCH_PROMPT = `You are a Senior Sales Psychologist and Decision Maker Profiler specializing in Enterprise CLM (Contract Lifecycle Management).

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

YOUR MISSION: Research this decision maker deeply. Understand their psyche, decision-making DNA, pain points, and buying triggers. Make this SO detailed that anyone reading it can craft perfectly personalized outreach.

RESEARCH PROCESS:
1. USE the LinkedIn profile data provided as primary source
2. SEARCH the web for this person's public activity, interviews, conference talks, published articles
3. SEARCH for their company's challenges in contract management, legal operations, procurement
4. ANALYZE their career trajectory for CLM buying signals
5. PROFILE their decision-making style based on role, experience, and activity

OUTPUT — Respond ONLY with valid JSON (no markdown):
{
  "psycheProfile": {
    "decisionStyle": "analytical|consensus|visionary|pragmatic",
    "riskTolerance": "low|medium|high",
    "innovationAffinity": "conservative|moderate|progressive",
    "buyingTriggers": ["trigger1", "trigger2", "trigger3"],
    "communicationPreference": "data-driven|narrative|peer-validated",
    "motivations": ["What drives this person professionally"],
    "concerns": ["What keeps them up at night re: contracts"]
  },
  "painPoints": [
    { "pain": "Specific pain point description", "severity": "high|medium|low", "relevance": "How this relates to CLM" }
  ],
  "priorities": ["Top 3-5 business priorities for this person"],
  "clmReadiness": 7.5,
  "researchSummary": "3-4 sentence deep profile of this person's mindset, needs, and likely CLM evaluation approach",
  "personalizedQuestionAngles": [
    "Specific angle for generating questions that resonate with this person"
  ],
  "webFindings": [
    "Key finding from web research about this person or their company"
  ]
}

RULES:
- Be SPECIFIC, not generic. Reference actual career details, company situations, industry challenges.
- buyingTriggers: What would make this person evaluate a CLM platform TODAY
- painPoints: Must be role-specific (CPO cares about procurement, GC about legal risk, etc.)
- clmReadiness: 1-10 score based on all signals
- personalizedQuestionAngles: These will be used to generate hyper-personalized questions`;

/* ── AI Question Generation Prompt ─────────────────────── */
const QUESTION_GEN_SYSTEM = `You are a Senior CLM Market Intelligence Analyst specializing in buyer-intent question research for enterprise Contract Lifecycle Management (CLM) platforms.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

YOUR MISSION:
Generate highly specific, research-backed buyer-intent questions that real decision makers would type into AI assistants (ChatGPT, Perplexity, Gemini, Claude) when evaluating CLM solutions.

RESEARCH PROCESS:
1. SEARCH the web for the target company: recent news, funding, product launches, partnerships, customer wins, analyst mentions
2. SEARCH for competitive landscape: head-to-head comparisons, analyst rankings, market positioning
3. SEARCH for current CLM industry trends: new AI capabilities, regulatory changes, market shifts
4. Generate questions incorporating REAL findings

QUESTION TYPES:
- MACRO (industry-wide, ~40%): Apply broadly across CLM industry, no specific vendor mentioned
- MICRO (company-specific, ~60%): Reference the specific company, competitors, recent events, unique differentiators

JOURNEY STAGES:
- awareness: Buyer realizes they have a contract management problem
- discovery: Buyer actively researching CLM solutions and vendors
- consideration: Buyer comparing specific vendors, doing deep evaluation
- decision: Buyer making final choice, looking for validation
- validation: Buyer post-purchase, confirming ROI and adoption

CLM LIFECYCLE STAGES (CRITICAL — tag every question):
- "pre-signature": Authoring, templates, redlining, negotiation, clause intelligence, approvals, collaboration
- "post-signature": Obligation tracking, compliance, SLA monitoring, renewals, amendments, performance management
- "full-stack": End-to-end platform, analytics, vendor selection, integrations, implementation, repository

OUTPUT FORMAT — Respond ONLY with valid JSON (no markdown wrapping):
{
  "companyIntel": {
    "keyFindings": ["finding1", "finding2", "finding3"],
    "competitors": ["comp1", "comp2"],
    "recentNews": ["news1", "news2"],
    "marketPosition": "brief summary"
  },
  "questions": [
    {
      "q": "The full question text",
      "p": "persona_id",
      "s": "stage_id",
      "c": "Topic Cluster Name",
      "l": "pre-signature|post-signature|full-stack",
      "classification": "macro or micro",
      "context": "Brief note on why this question is relevant",
      "confidence": 0.85
    }
  ]
}

RULES:
- Generate 15-25 questions total
- Cover at least 3 different personas from the provided list
- Cover at least 3 different journey stages
- Cover ALL 3 lifecycle stages (pre-signature, post-signature, full-stack) — aim for balanced coverage
- Each question must be 10-30 words
- MICRO questions MUST use the actual company name (not {company})
- MACRO questions must NOT mention any specific company
- Every question must be something a real person would type into AI search
- Avoid generic questions — incorporate real web research findings
- DO NOT duplicate existing questions provided below`;

/* ── Classification Verifier ──────────────────────────── */
const CLM_COMPETITORS = ["icertis", "ironclad", "agiloft", "docusign", "conga", "juro", "contractpodai", "spotdraft", "coupa", "concord"];
function verifyClassification(q, company) {
  const text = q.q.toLowerCase();
  const co = company.toLowerCase();
  if (text.includes(co) || CLM_COMPETITORS.some(c => text.includes(c))) return "micro";
  if (/\b(q[1-4] 202[5-7]|series [a-d]|just announced|recently|new feature)\b/i.test(q.q)) return "micro";
  return q.classification || "macro";
}

/* ── Persona Type Detector (for CSV import) ──────────── */
function detectPersonaType(title) {
  if (!title) return "cm";
  const t = title.toLowerCase();
  if (t.includes("general counsel") || t.includes("chief legal") || (t.includes("legal") && t.includes("head"))) return "gc";
  if ((t.includes("procurement") && (t.includes("chief") || t.includes("vp") || t.includes("head"))) || t.includes("cpo")) return "cpo";
  if (t.includes("cio") || t.includes("chief information") || (t.includes("information") && t.includes("officer"))) return "cio";
  if (t.includes("legal operations") || t.includes("legal ops")) return "vplo";
  if (t.includes("cto") || t.includes("chief technology") || (t.includes("vp") && t.includes("it"))) return "cto";
  if (t.includes("contract manager") || t.includes("contract management") || t.includes("contracts lead")) return "cm";
  if (t.includes("procurement director") || t.includes("sourcing director")) return "pd";
  if (t.includes("cfo") || t.includes("chief financial") || t.includes("finance") && t.includes("officer")) return "cfo";
  return "cm";
}

/* ── AI Progress Steps ────────────────────────────────── */
const AI_STEPS = [
  "Loading knowledge base\u2026",
  "Researching company via web\u2026",
  "Analyzing competitive landscape\u2026",
  "Generating persona-specific questions\u2026",
  "Classifying macro vs micro\u2026",
  "Saving to knowledge base\u2026",
  "Complete",
];

const RESEARCH_STEPS = [
  "Processing LinkedIn data\u2026",
  "Researching decision maker\u2026",
  "Analyzing psyche & pain points\u2026",
  "Building persona profile\u2026",
  "Generating questions from pain points\u2026",
  "Complete",
];

/* ── Pain Points → Questions Prompt ───────────────────── */
const PAIN_TO_QUESTIONS_PROMPT = `You are a Senior CLM Market Intelligence Analyst. Convert decision maker pain points into buyer-intent questions.

RULES:
- Generate exactly 5 high-quality questions (1 per pain point, pick the top 5 pain points)
- Questions must sound like what this person would TYPE into ChatGPT, Perplexity, or Google
- Each question must be specific to the person's role, company, and jurisdiction/region
- Include jurisdiction-aware angles (regulatory environment, local business practices, regional compliance)
- Questions should map to buying journey stages: awareness, consideration, or discovery
- CRITICAL: The "c" field MUST be one of these EXACT cluster names: "Contract AI / Automation", "CLM Platform Selection", "Post-Signature / Obligations", "Procurement CLM", "Enterprise Scale", "Financial Services CLM", "Implementation & ROI", "Analyst Rankings", "Agentic CLM"
- CRITICAL: The "l" field MUST be one of: "pre-signature", "post-signature", "full-stack"
  - pre-signature: Questions about contract authoring, templates, redlining, negotiation, approvals, clause intelligence
  - post-signature: Questions about obligation tracking, compliance, SLA monitoring, renewals, amendments, performance
  - full-stack: Questions about end-to-end CLM platform, analytics, integrations, vendor selection, implementation

OUTPUT — Respond ONLY with valid JSON (no markdown):
{
  "questions": [
    {
      "q": "The full question text",
      "p": "persona_type_id (gc, cpo, cio, vplo, cto, cm, pd, cfo)",
      "s": "awareness|consideration|discovery",
      "c": "One of the exact cluster names listed above",
      "l": "pre-signature|post-signature|full-stack",
      "painRef": "Which pain point this addresses",
      "jurisdiction": "Country or region (e.g. Bahrain, UAE, US, EU, UK, India, Global)",
      "confidence": 0.85
    }
  ]
}`;

/* ── Adaptive CSV Column Mapping Prompt ──────────────── */
const CSV_MAPPING_PROMPT = `You are a data mapping specialist. Given CSV column headers, map them to our target schema.

TARGET FIELDS (map each source column to one of these):
- name: Person's full name
- title: Job title / position
- company: Company / organization name
- linkedin_url: LinkedIn profile URL
- company_url: Company website URL
- location: City, country, or region
- email: Email address (optional)
- phone: Phone number (optional)
- notes: Any additional notes (optional)
- SKIP: Column should be ignored

OUTPUT — Respond ONLY with valid JSON (no markdown):
{
  "mapping": { "source_column_name": "target_field", ... },
  "confidence": 0.95,
  "unmapped": ["columns that don't match any target field"]
}`;

/* ═══════════════════════════════════════════════════════ */
export default function QuestionGenerator({ onNavigate }) {
  const t = useTheme();
  const { pipeline, updateModule } = usePipeline();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState("questions");

  // ── Existing state ──
  const [company, setCompany] = useState("Sirion");
  const [companyUrl, setCompanyUrl] = useState("https://sirion.ai");
  const [industry, setIndustry] = useState("Contract Lifecycle Management");
  const [activePersonas, setActivePersonas] = useState(new Set(PERSONAS.map(p => p.id)));
  const [activeClusters, setActiveClusters] = useState(new Set(CLUSTERS));
  const [generated, setGenerated] = useState(false);
  const [filterStage, setFilterStage] = useState("all");
  const [filterPersona, setFilterPersona] = useState("all");
  const [filterJurisdiction, setFilterJurisdiction] = useState("all");
  const [filterLifecycle, setFilterLifecycle] = useState("all");
  const [exportCopied, setExportCopied] = useState(false);
  const [autoGenMsg, setAutoGenMsg] = useState(""); // notification from auto-question gen
  const [selectedQs, setSelectedQs] = useState(new Set());

  // ── AI generation state ──
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [aiError, setAiError] = useState("");
  const [companyIntel, setCompanyIntel] = useState(null);

  // ── Knowledge base state ──
  const [kbStats, setKbStats] = useState({ totalQuestions: 0, totalMacros: 0, companiesResearched: 0, totalPersonas: 0 });
  const [kbQuestions, setKbQuestions] = useState([]);
  const [creditsUsed, setCreditsUsed] = useState(0);

  // ── Persona Research state ──
  const [personaProfiles, setPersonaProfiles] = useState([]);
  const [linkedinPaste, setLinkedinPaste] = useState("");
  const [importMode, setImportMode] = useState("linkedin"); // "linkedin" | "csv" | "web"
  const [webResearchName, setWebResearchName] = useState("");
  const [webResearchTitle, setWebResearchTitle] = useState("");
  const [webResearchCompany, setWebResearchCompany] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState(0);
  const [importError, setImportError] = useState("");
  const [researchingId, setResearchingId] = useState(null);
  const [researchStep, setResearchStep] = useState(0);
  const [targetPersonaId, setTargetPersonaId] = useState("all"); // for persona-specific question gen
  const fileInputRef = useRef(null);
  const pipelineMigratedRef = useRef(false);

  // ── One-time migration: save pipeline questions to KB so they persist ──
  useEffect(() => {
    if (pipelineMigratedRef.current) return;
    if (!pipeline._loaded) return;
    const pqs = pipeline.m1?.questions;
    if (!pqs || pqs.length === 0) return;
    pipelineMigratedRef.current = true;
    const companyName = pipeline.meta?.company || company;
    const toSave = pqs.map(q => ({
      id: q.id || `q-pipeline-${questionHash(q.query)}`,
      query: q.query,
      persona: q.persona,
      stage: q.stage,
      cluster: q.cw || q.cluster || "",
      lifecycle: q.lifecycle || "full-stack",
      source: q.source || "pipeline",
      classification: q.classification || "macro",
      company: companyName,
      savedAt: new Date().toISOString(),
    }));
    saveQuestions(toSave).catch(() => {});
    // Also persist to Firebase collection so it survives IndexedDB clear
    toSave.forEach(q => {
      db.saveWithId("m1_questions_v2", q.id, q).catch(() => {});
    });
  }, [pipeline._loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load KB stats + personas on mount, hydrate from Firebase ──
  useEffect(() => {
    (async () => {
      // 1. Load local stats first (instant)
      try {
        const stats = await getKnowledgeBaseStats();
        setKbStats(stats);
      } catch {}
      try {
        const personas = await getAllPersonas();
        setPersonaProfiles(personas);
      } catch {}

      // 2. Hydrate from Firebase in background (restores data after cache clear)
      try {
        const [fbQuestions, fbMacros, fbIntel] = await Promise.all([
          db.getAllPaginated("m1_questions_v2"),
          db.getAllPaginated("m1_macros"),
          db.getAllPaginated("m1_company_intel"),
        ]);
        let changed = false;
        if (fbQuestions.length > 0) {
          const added = await hydrateQuestions(fbQuestions);
          if (added > 0) changed = true;
        }
        if (fbMacros.length > 0) {
          await hydrateMacros(fbMacros);
        }
        if (fbIntel.length > 0) {
          await hydrateCompanyIntel(fbIntel);
        }
        // Refresh stats if Firebase had data we didn't have locally
        if (changed) {
          const refreshed = await getKnowledgeBaseStats();
          setKbStats(refreshed);
        }
      } catch (e) {
        console.warn("Firebase hydration skipped:", e.message);
      }
    })();
  }, []);

  // ── Sync persona profiles to pipeline for M4 access ──
  useEffect(() => {
    if (personaProfiles.length > 0) {
      updateModule("m1", {
        personaProfiles: personaProfiles.map(p => ({
          id: p.id,
          name: p.name,
          title: p.title,
          company: p.company,
          companyUrl: p.companyUrl,
          personaType: p.personaType,
          rawLinkedinText: p.rawLinkedinText || "",
          cleanedProfile: p.cleanedProfile || null,
          researchSummary: p.researchSummary || "",
          clmReadiness: p.clmReadiness,
          m4Stage: p.m4Stage,
          m4ReadinessScore: p.m4ReadinessScore,
          m4AnalyzedAt: p.m4AnalyzedAt,
          source: p.source,
        })),
      });
    }
  }, [personaProfiles]);

  // ── Merged questions (static + KB + AI + pipeline) with deduplication ──
  // Pipeline questions (from Firebase) are the source of truth for the full count.
  // This ensures the database always shows the complete set (e.g. 138).
  const pipelineQuestions = pipeline.m1.questions || [];
  const questions = useMemo(() => {
    if (!generated) return [];
    const seen = new Set();
    const merged = [];

    const addQ = (q) => {
      const hash = questionHash(q.query);
      if (!seen.has(hash)) { seen.add(hash); merged.push(q); }
    };

    // Tier 1: Pipeline questions — source of truth, shown in full
    pipelineQuestions.forEach(q => addQ({
      id: q.id,
      query: q.query,
      persona: q.persona,
      stage: q.stage,
      cluster: q.cw || q.cluster,
      lifecycle: q.lifecycle || "full-stack",
      source: q.source || "pipeline",
      classification: q.classification || "macro",
    }));

    // Tier 2: Static Q_BANK — adds any not already in pipeline
    Q_BANK.forEach((q, i) => addQ({
        id: `q-${i + 1}`,
        query: q.q.replace(/\{company\}/g, company),
        persona: q.p, stage: q.s, cluster: q.c,
        lifecycle: q.l || CLUSTER_LIFECYCLE_MAP[q.c] || "full-stack",
        source: "static", classification: "macro",
      }));

    // Tier 3: Cached KB questions (preserve persona-research source)
    kbQuestions
      .forEach(q => addQ({ ...q, source: q.source === "persona-research" ? "persona-research" : "kb" }));

    // Tier 4: Fresh AI questions (generated in current session)
    aiQuestions
      .forEach(q => addQ(q));

    return merged;
  }, [generated, company, aiQuestions, kbQuestions, pipelineQuestions]);

  const filtered = useMemo(() => {
    return questions.filter(q => {
      if (filterStage !== "all" && q.stage !== filterStage) return false;
      if (filterPersona !== "all" && q.persona !== filterPersona) return false;
      if (filterJurisdiction !== "all" && (q.jurisdiction || "Global") !== filterJurisdiction) return false;
      if (filterLifecycle !== "all" && (q.lifecycle || CLUSTER_LIFECYCLE_MAP[q.cluster] || "full-stack") !== filterLifecycle) return false;
      return true;
    });
  }, [questions, filterStage, filterPersona, filterJurisdiction, filterLifecycle]);

  const jurisdictions = useMemo(() => {
    const set = new Set();
    questions.forEach(q => set.add(q.jurisdiction || "Global"));
    return Array.from(set).sort();
  }, [questions]);

  const stageCount = useMemo(() => {
    const counts = {};
    STAGES.forEach(s => { counts[s.id] = questions.filter(q => q.stage === s.id).length; });
    return counts;
  }, [questions]);

  const personaCount = useMemo(() => {
    const counts = {};
    PERSONAS.forEach(p => { counts[p.id] = questions.filter(q => q.persona === p.id).length; });
    return counts;
  }, [questions]);

  const lifecycleCount = useMemo(() => {
    const counts = {};
    CLM_LIFECYCLE.forEach(lc => { counts[lc.id] = questions.filter(q => (q.lifecycle || CLUSTER_LIFECYCLE_MAP[q.cluster] || "full-stack") === lc.id).length; });
    return counts;
  }, [questions]);

  const sourceCounts = useMemo(() => {
    const c = { static: 0, ai: 0, kb: 0 };
    questions.forEach(q => { c[q.source] = (c[q.source] || 0) + 1; });
    return c;
  }, [questions]);

  // ── Auto-export to M2 whenever questions are generated ──
  // Triggers 1.5s after generation completes so M2 always stays in sync
  useEffect(() => {
    if (!generated || questions.length === 0) return;
    const timer = setTimeout(() => exportToM2(), 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated, questions.length]);

  // ══════════════════════════════════════════════════════
  // QUESTION GENERATION
  // ══════════════════════════════════════════════════════

  const handleGenerate = async () => {
    setGenerated(true);
    setAiError("");
    setCompanyIntel(null);

    const staticIds = Q_BANK
      .map((_, i) => `q-${i + 1}`);
    setSelectedQs(new Set(staticIds));

    try {
      const cached = await getQuestionsForCompany(company);
      if (cached.length > 0) {
        setKbQuestions(cached);
        setSelectedQs(prev => {
          const next = new Set(prev);
          cached.forEach(q => next.add(q.id));
          return next;
        });
      }
    } catch {}

    try {
      const intel = await getCompanyIntel(company);
      if (intel) setCompanyIntel(intel);
    } catch {}

    generateAIQuestions();
  };

  const generateAIQuestions = async () => {
    setAiLoading(true);
    setAiStep(0);
    // Preserve persona-research questions, clear only AI-generated ones
    setAiQuestions(prev => prev.filter(q => q.source === "persona-research"));

    try {
      const existing = await getQuestionsForCompany(company);

      setAiStep(1);
      const activeP = PERSONAS.filter(p => activePersonas.has(p.id));
      const activeC = [...activeClusters];

      // Build system prompt
      let systemPrompt = QUESTION_GEN_SYSTEM + "\n\nPERSONAS:\n" +
        activeP.map(p => `- ${p.id}: ${p.label}`).join("\n") +
        "\n\nTOPIC CLUSTERS:\n" + activeC.join(", ");

      // If generating for a specific researched persona, inject their profile
      const targetProfile = targetPersonaId !== "all" ? personaProfiles.find(p => p.id === targetPersonaId) : null;
      if (targetProfile && targetProfile.psycheProfile) {
        systemPrompt += `\n\nTARGET DECISION MAKER (generate questions specifically for this person's psyche):
Name: ${targetProfile.name}
Title: ${targetProfile.title}
Company: ${targetProfile.company}
Decision Style: ${targetProfile.psycheProfile?.decisionStyle || "unknown"}
Risk Tolerance: ${targetProfile.psycheProfile?.riskTolerance || "medium"}
Buying Triggers: ${(targetProfile.psycheProfile?.buyingTriggers || []).join(", ")}
Pain Points: ${(targetProfile.painPoints || []).map(p => p.pain).join("; ")}
Priorities: ${(targetProfile.priorities || []).join(", ")}
Research Summary: ${targetProfile.researchSummary || ""}

CRITICAL: Make questions HYPER-PERSONALIZED to this person. Reference their specific situation, pain points, and priorities. Questions should feel like they were written specifically for ${targetProfile.name}.`;
      }

      if (existing.length > 0) {
        systemPrompt += "\n\nEXISTING QUESTIONS (DO NOT DUPLICATE):\n" +
          existing.slice(0, 30).map((q, i) => `${i + 1}. [${q.persona}/${q.stage}] ${q.query}`).join("\n");
      } else {
        systemPrompt += "\n\nNo existing questions yet \u2014 first generation for this company.";
      }

      let userMsg = `TARGET COMPANY: ${company}\n`;
      if (companyUrl) userMsg += `COMPANY URL: ${companyUrl}\n`;
      userMsg += `INDUSTRY: ${industry}\n\n`;
      userMsg += `ACTIVE PERSONAS: ${activeP.map(p => `${p.id} (${p.label})`).join(", ")}\n`;
      userMsg += `ACTIVE CLUSTERS: ${activeC.join(", ")}\n\n`;
      userMsg += `Research ${company} thoroughly using web search. Focus on their CURRENT market position, recent developments, and competitive dynamics. Generate 15-25 new buyer-intent questions.`;

      const stepTimer = setInterval(() => setAiStep(prev => prev < 4 ? prev + 1 : prev), 10000);
      const result = await callClaude(systemPrompt, userMsg, 120000);
      clearInterval(stepTimer);

      setAiStep(4);
      const now = new Date().toISOString();
      const coKey = company.toLowerCase().replace(/\s+/g, "-");

      const newQs = (result.questions || []).map((q, i) => ({
        id: `ai-${coKey}-${Date.now()}-${i}`,
        query: q.q,
        persona: q.p,
        stage: q.s,
        cluster: q.c,
        lifecycle: q.l || CLUSTER_LIFECYCLE_MAP[q.c] || "full-stack",
        source: "ai",
        classification: verifyClassification(q, company),
        company: company,
        companyUrl: companyUrl,
        generatedAt: now,
        searchContext: q.context || "",
        confidence: q.confidence || 0.8,
        dedupHash: questionHash(q.q),
        targetPersona: targetProfile ? targetProfile.name : null,
      }));

      setAiStep(5);
      await saveQuestions(newQs);

      if (result.companyIntel) {
        const intel = {
          companyKey: coKey,
          companyName: company,
          url: companyUrl,
          industry: industry,
          lastResearchedAt: now,
          ...result.companyIntel,
        };
        await saveCompanyIntel(intel);
        setCompanyIntel(intel);
      }

      for (const q of newQs.filter(q => q.classification === "macro")) {
        await saveMacro(q);
      }

      // Background: sync each question + macros + intel to Firebase
      (async () => {
        for (const q of newQs) {
          try { await db.saveWithId("m1_questions_v2", q.dedupHash, { ...q, updated_at: now }); } catch {}
          await new Promise(r => setTimeout(r, 50));
        }
        for (const q of newQs.filter(q => q.classification === "macro")) {
          try { await db.saveWithId("m1_macros", q.dedupHash, { ...q, updated_at: now }); } catch {}
        }
        if (result.companyIntel) {
          try { await db.saveWithId("m1_company_intel", coKey, { companyKey: coKey, companyName: company, url: companyUrl, industry, lastResearchedAt: now, ...result.companyIntel, updated_at: now }); } catch {}
        }
      })();

      setAiStep(6);
      setAiQuestions(newQs);

      setSelectedQs(prev => {
        const next = new Set(prev);
        newQs.forEach(q => next.add(q.id));
        return next;
      });

      const stats = await getKnowledgeBaseStats();
      setKbStats(stats);
      setCreditsUsed(prev => prev + 0.08);

    } catch (err) {
      setAiError(err.message);
      setAiStep(0);
    } finally {
      setAiLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════
  // PERSONA IMPORT & RESEARCH
  // ══════════════════════════════════════════════════════

  // ── Import from LinkedIn paste ──
  const handleLinkedinImport = async () => {
    if (!linkedinPaste.trim() || linkedinPaste.length < 50) return;
    setImportLoading(true);
    setImportStep(0);
    setImportError("");

    try {
      setImportStep(0);
      const cleaned = await callClaudeFast(
        LINKEDIN_CLEANUP_PROMPT,
        `Extract the structured profile data from this raw LinkedIn copy-paste. Strip all noise. Return ONLY valid JSON.\n\nRAW TEXT:\n${linkedinPaste}`
      );
      setImportStep(1);

      const now = new Date().toISOString();
      const persona = {
        id: `persona-${(cleaned.current_company || company).toLowerCase().replace(/\s+/g, "-")}-${(cleaned.name || "unknown").toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        personaType: detectPersonaType(cleaned.current_title),
        name: cleaned.name || "Unknown",
        title: cleaned.current_title || cleaned.headline || "",
        company: cleaned.current_company || company,
        companyUrl: companyUrl,
        location: cleaned.location || "",
        linkedinUrl: "",
        headline: cleaned.headline || "",
        about: cleaned.about || "",
        experience: cleaned.experience || [],
        education: cleaned.education || [],
        certifications: cleaned.certifications || [],
        skillsTop: cleaned.skills_top || [],
        recentActivity: cleaned.recent_activity || [],
        source: "linkedin-paste",
        rawLinkedinText: linkedinPaste,
        cleanedProfile: cleaned,
        researchSummary: "",
        psycheProfile: null,
        painPoints: [],
        priorities: [],
        clmReadiness: null,
        m4AnalysisId: null,
        m4Stage: null,
        m4ReadinessScore: null,
        m4AnalyzedAt: null,
        createdAt: now,
        updatedAt: now,
        researchedAt: null,
      };

      await savePersona(persona);
      setPersonaProfiles(prev => [persona, ...prev]);
      setLinkedinPaste("");
      setImportStep(2);

      // Refresh stats
      const stats = await getKnowledgeBaseStats();
      setKbStats(stats);
      setCreditsUsed(prev => prev + 0.01);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  // ── Import from CSV/JSON file ──
  // ── Smart CSV Parser — parses CSV with quoted fields ──
  const parseCSVLine = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  // ── Try common column name mappings first (free) ──
  const tryLocalMapping = (headers) => {
    const mapping = {};
    const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    const patterns = {
      name: ["name", "full_name", "person_name", "contact_name", "first_name", "fullname", "person"],
      title: ["title", "job_title", "position", "role", "designation", "job_role"],
      company: ["company", "company_name", "organization", "org", "employer", "firm", "organisation"],
      linkedin_url: ["linkedin_url", "linkedin", "linkedin_profile", "li_url", "profile_url", "linkedin_link"],
      company_url: ["company_url", "website", "company_website", "url", "web", "site", "domain"],
      location: ["location", "city", "country", "region", "geography", "geo", "address", "jurisdiction", "hq"],
      email: ["email", "email_address", "mail", "e_mail"],
    };
    let matched = 0;
    for (const [target, aliases] of Object.entries(patterns)) {
      const idx = lowerHeaders.findIndex(h => aliases.includes(h));
      if (idx >= 0) { mapping[headers[idx]] = target; matched++; }
    }
    // Need at least name to proceed
    return matched >= 1 && Object.values(mapping).includes("name") ? mapping : null;
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportError("");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        let rows = [];
        let headers = [];

        if (file.name.endsWith(".json")) {
          const data = JSON.parse(text);
          rows = Array.isArray(data) ? data : [data];
        } else {
          // CSV parsing with proper quote handling
          const lines = text.split("\n").filter(l => l.trim());
          if (lines.length < 2) throw new Error("CSV must have headers + at least 1 row");
          headers = parseCSVLine(lines[0]);

          // Step 1: Try local column mapping (free, instant)
          let mapping = tryLocalMapping(headers);

          // Step 2: If local mapping fails, use AI to detect columns
          if (!mapping) {
            setImportStep(1); // "AI analyzing columns..."
            const sampleRows = lines.slice(1, 4).map(l => parseCSVLine(l));
            const aiMsg = `CSV HEADERS: ${JSON.stringify(headers)}\n\nSAMPLE DATA (first 3 rows):\n${sampleRows.map((r, i) => `Row ${i + 1}: ${JSON.stringify(r)}`).join("\n")}\n\nMap these columns to our target schema. If a column clearly contains person names, map it to "name", job titles to "title", etc.`;
            const aiResult = await callClaudeFast(CSV_MAPPING_PROMPT, aiMsg, 1000);
            mapping = aiResult.mapping || {};
            setCreditsUsed(prev => prev + 0.01);
          }

          // Reverse mapping: target → source column index
          const colIdx = {};
          for (const [src, target] of Object.entries(mapping)) {
            if (target !== "SKIP") {
              colIdx[target] = headers.indexOf(src);
            }
          }

          const getVal = (vals, target) => {
            const idx = colIdx[target];
            return idx != null && idx >= 0 ? (vals[idx] || "").replace(/^"|"$/g, "").trim() : "";
          };

          rows = lines.slice(1).map(line => {
            const vals = parseCSVLine(line);
            return {
              name: getVal(vals, "name"),
              title: getVal(vals, "title"),
              company: getVal(vals, "company"),
              linkedin_url: getVal(vals, "linkedin_url"),
              company_url: getVal(vals, "company_url"),
              location: getVal(vals, "location"),
              email: getVal(vals, "email"),
            };
          }).filter(r => r.name); // filter out rows with no name
        }

        const now = new Date().toISOString();
        const personas = rows.map((row, i) => {
          const name = row.name || row.full_name || row.person_name || `Person ${i + 1}`;
          const title = row.title || row.job_title || row.position || "";
          const co = row.company || row.company_name || row.organization || company;
          const loc = row.location || row.city || row.country || row.geography || "";
          return {
            id: `persona-${co.toLowerCase().replace(/\s+/g, "-")}-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${i}`,
            personaType: detectPersonaType(title),
            name,
            title,
            company: co,
            companyUrl: row.company_url || row.website || "",
            location: loc,
            linkedinUrl: row.linkedin_url || row.linkedin || "",
            headline: title,
            about: "",
            experience: [],
            education: [],
            certifications: [],
            skillsTop: [],
            recentActivity: [],
            source: "csv-import",
            rawLinkedinText: "",
            cleanedProfile: null,
            researchSummary: "",
            psycheProfile: null,
            painPoints: [],
            priorities: [],
            clmReadiness: null,
            m4AnalysisId: null,
            m4Stage: null,
            m4ReadinessScore: null,
            m4AnalyzedAt: null,
            createdAt: now,
            updatedAt: now,
            researchedAt: null,
          };
        });

        if (personas.length === 0) throw new Error("No valid rows found. Make sure your file has a 'name' column.");

        await savePersonas(personas);
        setPersonaProfiles(prev => [...personas, ...prev]);

        const stats = await getKnowledgeBaseStats();
        setKbStats(stats);
        setAutoGenMsg(`\u2713 ${personas.length} personas imported from ${file.name}`);
        setTimeout(() => setAutoGenMsg(""), 6000);
      } catch (err) {
        setImportError(err.message);
      } finally {
        setImportLoading(false);
        setImportStep(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  // ── Import from AI web research ──
  const handleWebResearchImport = async () => {
    if (!webResearchName.trim() || !webResearchTitle.trim()) return;
    setImportLoading(true);
    setImportStep(0);
    setImportError("");

    try {
      const co = webResearchCompany.trim() || company;
      const now = new Date().toISOString();

      setImportStep(1);
      const result = await callClaude(
        PERSONA_RESEARCH_PROMPT,
        `Research this decision maker:\nName: ${webResearchName.trim()}\nTitle: ${webResearchTitle.trim()}\nCompany: ${co}\n\nSearch the web for information about this person, their role, their company's contract management challenges, and build a complete psyche profile.`,
        90000,
      );
      setImportStep(3);

      const persona = {
        id: `persona-${co.toLowerCase().replace(/\s+/g, "-")}-${webResearchName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        personaType: detectPersonaType(webResearchTitle.trim()),
        name: webResearchName.trim(),
        title: webResearchTitle.trim(),
        company: co,
        companyUrl: companyUrl,
        location: "",
        linkedinUrl: "",
        headline: webResearchTitle.trim(),
        about: "",
        experience: [],
        education: [],
        certifications: [],
        skillsTop: [],
        recentActivity: [],
        source: "web-research",
        rawLinkedinText: "",
        cleanedProfile: null,
        researchSummary: result.researchSummary || "",
        psycheProfile: result.psycheProfile || null,
        painPoints: result.painPoints || [],
        priorities: result.priorities || [],
        clmReadiness: result.clmReadiness || null,
        webFindings: result.webFindings || [],
        m4AnalysisId: null,
        m4Stage: null,
        m4ReadinessScore: null,
        m4AnalyzedAt: null,
        createdAt: now,
        updatedAt: now,
        researchedAt: now,
      };

      await savePersona(persona);
      setPersonaProfiles(prev => [persona, ...prev]);
      setWebResearchName("");
      setWebResearchTitle("");
      setWebResearchCompany("");

      // ── AUTO-GENERATE QUESTIONS FROM PAIN POINTS (with retry for rate limits) ──
      if (persona.painPoints && persona.painPoints.length > 0) {
        setImportStep(4); // "Generating questions from pain points…"
        let autoQs = [];
        const retryDelays = [0, 45000, 75000]; // immediate, then 45s, then 75s (to clear 1-min rate window)
        for (let attempt = 0; attempt < retryDelays.length; attempt++) {
          try {
            if (retryDelays[attempt] > 0) await new Promise(r => setTimeout(r, retryDelays[attempt]));
            autoQs = await generateQuestionsFromPainPoints(persona);
            break; // success
          } catch (qErr) {
            if (attempt < retryDelays.length - 1 && qErr.message?.includes("rate limit")) {
              console.warn(`Rate limited on question gen, retrying in ${retryDelays[attempt + 1] / 1000}s...`);
            } else {
              console.warn("Auto question gen from pain points failed:", qErr);
              break;
            }
          }
        }
        if (autoQs.length > 0) {
          setAutoGenMsg(`\u2713 ${autoQs.length} questions auto-generated from ${persona.name}'s pain points`);
          setTimeout(() => setAutoGenMsg(""), 8000);
        }
      }

      const stats = await getKnowledgeBaseStats();
      setKbStats(stats);
      setCreditsUsed(prev => prev + 0.08);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  // ── Deep AI Research on a persona ──
  // ── Auto-generate questions from persona pain points ──
  const generateQuestionsFromPainPoints = async (persona) => {
    const painPointsText = persona.painPoints.map(pp =>
      `- ${pp.pain} (severity: ${pp.severity}, relevance: ${pp.relevance || "CLM"})`
    ).join("\n");

    const jurisdiction = persona.location || persona.cleanedProfile?.location || "Global";
    const pType = PERSONAS.find(pp => pp.id === persona.personaType);

    const userMsg = `DECISION MAKER:
Name: ${persona.name}
Title: ${persona.title} (${pType?.label || persona.personaType})
Company: ${persona.company}
Location/Jurisdiction: ${jurisdiction}
Industry: ${industry}

PAIN POINTS:
${painPointsText}

PSYCHE PROFILE:
Decision Style: ${persona.psycheProfile?.decisionStyle || "unknown"}
Risk Tolerance: ${persona.psycheProfile?.riskTolerance || "unknown"}
Communication: ${persona.psycheProfile?.communicationPreference || "unknown"}

Generate 5 buyer-intent questions from these pain points. Each question must reflect this person's jurisdiction (${jurisdiction}) and role-specific concerns.`;

    const result = await callClaudeFast(PAIN_TO_QUESTIONS_PROMPT, userMsg, 2000);
    const genQs = result.questions || [];
    if (genQs.length === 0) return [];

    // Normalize AI-returned cluster names to match our predefined CLUSTERS
    const normalizeCluster = (c) => {
      if (!c) return "Contract AI / Automation";
      const match = CLUSTERS.find(cl => cl.toLowerCase() === c.toLowerCase());
      if (match) return match;
      // Fuzzy match common AI variations
      const cl = c.toLowerCase();
      if (cl.includes("automat") || cl.includes("efficien")) return "Contract AI / Automation";
      if (cl.includes("platform") || cl.includes("selection") || cl.includes("evaluat")) return "CLM Platform Selection";
      if (cl.includes("post-sign") || cl.includes("obligat") || cl.includes("complian")) return "Post-Signature / Obligations";
      if (cl.includes("procurement")) return "Procurement CLM";
      if (cl.includes("enterprise") || cl.includes("scale") || cl.includes("global")) return "Enterprise Scale";
      if (cl.includes("financial") || cl.includes("banking")) return "Financial Services CLM";
      if (cl.includes("roi") || cl.includes("implement") || cl.includes("value") || cl.includes("cost")) return "Implementation & ROI";
      if (cl.includes("analyst") || cl.includes("gartner") || cl.includes("ranking")) return "Analyst Rankings";
      if (cl.includes("agentic") || cl.includes("ai-native")) return "Agentic CLM";
      if (cl.includes("risk") || cl.includes("data") || cl.includes("integrat")) return "Post-Signature / Obligations";
      return "Contract AI / Automation"; // safe default
    };

    const now = new Date().toISOString();
    const coKey = company.toLowerCase().replace(/\s+/g, "-");
    const normalizeLifecycle = (l, cluster) => {
      if (l && ["pre-signature", "post-signature", "full-stack"].includes(l)) return l;
      return CLUSTER_LIFECYCLE_MAP[cluster] || "full-stack";
    };

    const newQs = genQs.slice(0, 5).map((q, i) => {
      const cluster = normalizeCluster(q.c);
      return {
        id: `pq-${coKey}-${persona.id.substring(0, 20)}-${Date.now()}-${i}`,
        query: q.q,
        persona: q.p || persona.personaType,
        stage: q.s || "consideration",
        cluster,
        lifecycle: normalizeLifecycle(q.l, cluster),
        source: "persona-research",
        classification: "micro",
        company: persona.company,
        companyUrl: persona.companyUrl || companyUrl,
        generatedAt: now,
        searchContext: `Auto-generated from ${persona.name}'s pain points`,
        confidence: q.confidence || 0.85,
        dedupHash: questionHash(q.q),
        jurisdiction: q.jurisdiction || jurisdiction || "Global",
        painPointRef: q.painRef || "",
        targetPersona: persona.name,
        personaId: persona.id,
      };
    });

    // Dedup against existing questions
    const existingHashes = new Set(questions.map(q => q.dedupHash));
    const deduped = newQs.filter(q => !existingHashes.has(q.dedupHash));

    if (deduped.length > 0) {
      await saveQuestions(deduped);
      // Also save to macro bank
      for (const q of deduped) {
        await saveMacro(q);
      }
      // Background: sync to Firebase
      const syncNow = new Date().toISOString();
      (async () => {
        for (const q of deduped) {
          try { await db.saveWithId("m1_questions_v2", q.dedupHash, { ...q, updated_at: syncNow }); } catch {}
          await new Promise(r => setTimeout(r, 50));
        }
        for (const q of deduped) {
          try { await db.saveWithId("m1_macros", q.dedupHash, { ...q, updated_at: syncNow }); } catch {}
        }
      })();
      // Add to local state
      setAiQuestions(prev => [...prev, ...deduped]);
      setSelectedQs(prev => {
        const next = new Set(prev);
        deduped.forEach(q => next.add(q.id));
        return next;
      });
    }

    setCreditsUsed(prev => prev + 0.01);
    return deduped;
  };

  const handleResearchPersona = async (personaId) => {
    const persona = personaProfiles.find(p => p.id === personaId);
    if (!persona) return;
    setResearchingId(personaId);
    setResearchStep(0);

    try {
      setResearchStep(1);

      let profileContext = "";
      if (persona.cleanedProfile) {
        profileContext = `CLEANED LINKEDIN PROFILE:\n${JSON.stringify(persona.cleanedProfile, null, 2)}`;
      } else {
        profileContext = `Name: ${persona.name}\nTitle: ${persona.title}\nCompany: ${persona.company}\nLocation: ${persona.location || "Unknown"}`;
        if (persona.experience?.length > 0) {
          profileContext += `\nExperience:\n${persona.experience.map(e => `- ${e.title} at ${e.company} (${e.duration})`).join("\n")}`;
        }
        if (persona.certifications?.length > 0) {
          profileContext += `\nCertifications: ${persona.certifications.join(", ")}`;
        }
      }

      setResearchStep(2);
      const result = await callClaude(
        PERSONA_RESEARCH_PROMPT,
        `${profileContext}\n\nCompany URL: ${persona.companyUrl || companyUrl}\n\nResearch this person deeply. Understand their psyche, pain points, and buying triggers for CLM solutions.`,
        90000,
      );

      setResearchStep(3);
      const updates = {
        researchSummary: result.researchSummary || "",
        psycheProfile: result.psycheProfile || null,
        painPoints: result.painPoints || [],
        priorities: result.priorities || [],
        clmReadiness: result.clmReadiness || null,
        webFindings: result.webFindings || [],
        researchedAt: new Date().toISOString(),
      };

      await updatePersona(personaId, updates);
      setPersonaProfiles(prev => prev.map(p => p.id === personaId ? { ...p, ...updates } : p));
      setCreditsUsed(prev => prev + 0.08);

      // ── AUTO-GENERATE QUESTIONS FROM PAIN POINTS (with retry for rate limits) ──
      if (updates.painPoints && updates.painPoints.length > 0) {
        setResearchStep(4); // "Generating questions from pain points..."
        const updatedPersona = { ...persona, ...updates };
        let autoQs = [];
        const retryDelays = [0, 45000, 75000];
        for (let attempt = 0; attempt < retryDelays.length; attempt++) {
          try {
            if (retryDelays[attempt] > 0) await new Promise(r => setTimeout(r, retryDelays[attempt]));
            autoQs = await generateQuestionsFromPainPoints(updatedPersona);
            break;
          } catch (qErr) {
            if (attempt < retryDelays.length - 1 && qErr.message?.includes("rate limit")) {
              console.warn(`Rate limited on question gen, retrying in ${retryDelays[attempt + 1] / 1000}s...`);
            } else {
              console.warn("Auto question gen from pain points failed:", qErr);
              break;
            }
          }
        }
        if (autoQs.length > 0) {
          setAutoGenMsg(`\u2713 ${autoQs.length} questions auto-generated from ${persona.name}'s pain points`);
          setTimeout(() => setAutoGenMsg(""), 8000);
        }
      }

      const stats = await getKnowledgeBaseStats();
      setKbStats(stats);
    } catch (err) {
      setImportError(`Research failed: ${err.message}`);
    } finally {
      setResearchingId(null);
      setResearchStep(0);
    }
  };

  // ── Delete persona ──
  const handleDeletePersona = async (personaId) => {
    await deletePersona(personaId);
    setPersonaProfiles(prev => prev.filter(p => p.id !== personaId));
    const stats = await getKnowledgeBaseStats();
    setKbStats(stats);
  };

  // ── Toggles ──
  const togglePersona = (id) => {
    const next = new Set(activePersonas);
    if (next.has(id)) next.delete(id); else next.add(id);
    setActivePersonas(next);
    if (generated) { setGenerated(false); setAiQuestions([]); setKbQuestions([]); }
  };

  const toggleCluster = (id) => {
    const next = new Set(activeClusters);
    if (next.has(id)) next.delete(id); else next.add(id);
    setActiveClusters(next);
    if (generated) { setGenerated(false); setAiQuestions([]); setKbQuestions([]); }
  };

  const toggleQ = (id) => {
    const next = new Set(selectedQs);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedQs(next);
  };

  // ── Export to M2 ──
  const exportToM2 = () => {
    // Export ALL questions from the bank (ignoring filters/selection)
    // so the pipeline always reflects the full question count
    const exportQs = questions.map(q => ({
      id: q.id,
      persona: PERSONAS.find(p => p.id === q.persona)?.label || q.persona,
      stage: q.stage,
      query: q.query,
      cw: q.cluster,
      source: q.source,
      classification: q.classification,
      lifecycle: q.lifecycle || CLUSTER_LIFECYCLE_MAP[q.cluster] || "full-stack",
    }));
    updateModule("m1", {
      questions: exportQs,
      personas: [...activePersonas],
      clusters: [...activeClusters],
      generatedAt: new Date().toISOString(),
      aiGenerated: sourceCounts.ai,
      kbLoaded: sourceCounts.kb,
      companyIntel: companyIntel,
      personaProfiles: personaProfiles.map(p => ({
        id: p.id, name: p.name, title: p.title, company: p.company,
        companyUrl: p.companyUrl, personaType: p.personaType,
        rawLinkedinText: p.rawLinkedinText || "", cleanedProfile: p.cleanedProfile || null,
        researchSummary: p.researchSummary || "", clmReadiness: p.clmReadiness,
        m4Stage: p.m4Stage, m4ReadinessScore: p.m4ReadinessScore, source: p.source,
      })),
    });
    const payload = JSON.stringify(exportQs, null, 2);
    try { navigator.clipboard.writeText(payload); } catch {}
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2500);
  };

  const exportMarkdown = () => {
    const rows = filtered.filter(q => selectedQs.has(q.id));
    let md = "| # | Question | Persona | Journey Stage | Topic Cluster | Source |\n";
    md += "|---|----------|---------|---------------|---------------|--------|\n";
    rows.forEach((q, i) => {
      const pLabel = PERSONAS.find(p => p.id === q.persona)?.short || q.persona;
      md += `| ${i + 1} | ${q.query} | ${pLabel} | ${q.stage} | ${q.cluster} | ${q.source} |\n`;
    });
    try { navigator.clipboard.writeText(md); } catch {}
  };

  // ── Styles ──
  const inp = {
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8,
    padding: "10px 14px", color: t.text, fontSize: 13, outline: "none", width: "100%",
    fontFamily: "var(--body)", transition: "border-color 0.2s",
  };

  const label = {
    fontSize: 11, color: t.textDim, textTransform: "uppercase", letterSpacing: 1.5,
    fontFamily: "var(--mono)", display: "block", marginBottom: 6, fontWeight: 600,
  };

  const badge = (bg, color) => ({
    display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 11,
    fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: 0.5,
    background: bg, color: color, marginLeft: 6, verticalAlign: "middle",
  });

  const tabBtn = (tab) => ({
    padding: "10px 24px", borderRadius: "8px 8px 0 0", cursor: "pointer",
    background: activeTab === tab ? t.bgCard : "transparent",
    border: `1px solid ${activeTab === tab ? t.border : "transparent"}`,
    borderBottom: activeTab === tab ? `2px solid ${t.brand}` : "1px solid transparent",
    color: activeTab === tab ? t.brand : t.textDim,
    fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)",
    textTransform: "uppercase", letterSpacing: 1,
    transition: "all 0.2s",
  });

  const companyPersonas = personaProfiles.filter(p => p.company.toLowerCase() === company.toLowerCase());

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* ── SETUP ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.sectionNum, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)" }}>Setup</span>
        </div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.text, lineHeight: 1.2, letterSpacing: -0.5 }}>
          Configure Target Company
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
          Define the company, industry, and target personas for question generation and persona research.
        </p>
      </div>

      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={label}>Company Name</label>
            <input style={inp} value={company} onChange={e => { setCompany(e.target.value); if (generated) { setGenerated(false); setAiQuestions([]); setKbQuestions([]); } }} placeholder="e.g. Sirion" />
          </div>
          <div>
            <label style={label}>Company URL</label>
            <input style={inp} value={companyUrl} onChange={e => setCompanyUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label style={label}>Industry / Market</label>
            <input style={inp} value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Contract Lifecycle Management" />
          </div>
        </div>

        {/* Knowledge Base Stats */}
        <div style={{
          padding: "8px 14px", borderRadius: 8,
          background: t.mode === "dark" ? "rgba(167,139,250,0.06)" : "rgba(124,58,237,0.04)",
          border: `1px solid ${t.brand}18`,
          display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.brand, fontFamily: "var(--mono)", letterSpacing: 1 }}>
            KNOWLEDGE BASE
          </span>
          <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
            {Q_BANK.length} seed
          </span>
          <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
            {kbStats.totalQuestions} AI-generated
          </span>
          <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
            {kbStats.totalMacros} macro patterns
          </span>
          <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
            {kbStats.companiesResearched} companies
          </span>
          <span style={{ fontSize: 11, color: "#a78bfa", fontFamily: "var(--mono)", fontWeight: 600 }}>
            {kbStats.totalPersonas} personas
          </span>
          {creditsUsed > 0 && (
            <span style={{ fontSize: 11, color: "#fbbf24", fontFamily: "var(--mono)" }}>
              ~${creditsUsed.toFixed(2)} credits
            </span>
          )}
        </div>
      </div>

      {/* ── TAB NAVIGATION ── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 0 }}>
        <button onClick={() => setActiveTab("questions")} style={tabBtn("questions")}>
          Questions
        </button>
        <button onClick={() => setActiveTab("research")} style={tabBtn("research")}>
          Persona Research
          {personaProfiles.length > 0 && (
            <span style={{
              marginLeft: 8, padding: "1px 6px", borderRadius: 10, fontSize: 11,
              background: t.brand + "20", color: t.brand, fontWeight: 700,
            }}>
              {personaProfiles.length}
            </span>
          )}
        </button>
      </div>
      <div style={{ borderTop: `1px solid ${t.border}`, marginBottom: 28 }} />

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: QUESTIONS                                     */}
      {/* ═══════════════════════════════════════════════════ */}
      {/* Auto-generation notification with animation */}
      {autoGenMsg && (
        <div style={{
          background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
          borderLeft: "3px solid #4ade80",
          borderRadius: 10, padding: "14px 18px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 10, animation: "fadeUp 0.4s ease",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "rgba(74,222,128,0.15)", border: "2px solid #4ade80",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "pulse 1.5s ease infinite", flexShrink: 0,
          }}>
            <span style={{ fontSize: 14 }}>{"\u2728"}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>{autoGenMsg}</span>
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
              Pain points auto-converted to buyer-intent questions and added to your library
            </div>
          </div>
          <span style={{ fontSize: 11, color: t.brand, marginLeft: "auto", fontFamily: "var(--mono)", fontWeight: 600, whiteSpace: "nowrap" }}>
            Questions tab updated
          </span>
        </div>
      )}

      {activeTab === "questions" && (
        <>
          {/* Personas */}
          <label style={{ ...label, marginBottom: 10 }}>Target Personas ({activePersonas.size} selected)</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {PERSONAS.map(p => {
              const on = activePersonas.has(p.id);
              return (
                <button key={p.id} onClick={() => togglePersona(p.id)} style={{
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: on ? (t.mode === "dark" ? "rgba(167,139,250,0.1)" : "rgba(124,58,237,0.06)") : "transparent",
                  border: `1px solid ${on ? t.brand + "40" : t.border}`,
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{p.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: on ? t.text : t.textDim }}>{p.short}</div>
                  <div style={{ fontSize: 11, color: t.textGhost, marginTop: 2 }}>{p.label}</div>
                </button>
              );
            })}
          </div>

          {/* Topic Clusters */}
          <label style={{ ...label, marginBottom: 10 }}>Topic Clusters ({activeClusters.size} selected)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {CLUSTERS.map(c => {
              const on = activeClusters.has(c);
              return (
                <button key={c} onClick={() => toggleCluster(c)} style={{
                  padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                  background: on ? (t.mode === "dark" ? "rgba(167,139,250,0.12)" : "rgba(124,58,237,0.08)") : "transparent",
                  border: `1px solid ${on ? t.brand + "40" : t.border}`,
                  color: on ? t.brand : t.textDim, fontSize: 11, fontWeight: 600,
                  fontFamily: "var(--body)", transition: "all 0.15s",
                }}>
                  {c}
                </button>
              );
            })}
          </div>

          {/* Persona-specific generation selector */}
          {companyPersonas.filter(p => p.researchedAt).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label style={label}>Generate for Specific Persona (optional)</label>
              <select value={targetPersonaId} onChange={e => setTargetPersonaId(e.target.value)}
                style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>
                <option value="all">All Personas (general)</option>
                {companyPersonas.filter(p => p.researchedAt).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.title}) — {PERSONAS.find(pp => pp.id === p.personaType)?.short || p.personaType}
                  </option>
                ))}
              </select>
              {targetPersonaId !== "all" && (
                <span style={{ marginLeft: 12, fontSize: 11, color: "#a78bfa", fontFamily: "var(--mono)" }}>
                  Hyper-personalized mode
                </span>
              )}
            </div>
          )}

          {/* Action Buttons: Show Database (daily) + Generate New (weekly) */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <button onClick={() => { setGenerated(true); (async () => { try { const cached = await getQuestionsForCompany(company); if (cached.length > 0) { setKbQuestions(cached); setSelectedQs(new Set([...Q_BANK.map((_, i) => `q-${i + 1}`), ...cached.map(q => q.id)])); } else { setSelectedQs(new Set(Q_BANK.map((_, i) => `q-${i + 1}`))); } const intel = await getCompanyIntel(company); if (intel) setCompanyIntel(intel); } catch {} })(); }}
              disabled={!company || activePersonas.size === 0}
              style={{
                background: t.bgCard, color: t.brand, border: `1.5px solid ${t.brand}40`, borderRadius: 8,
                padding: "12px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1,
                opacity: (!company || activePersonas.size === 0) ? 0.4 : 1,
                transition: "all 0.2s",
              }}>
              Show Question Database
            </button>
            <button onClick={handleGenerate} disabled={!company || activePersonas.size === 0 || aiLoading}
              style={{
                background: `linear-gradient(135deg, ${t.brand}, ${t.brandDim})`, color: "#fff", border: "none", borderRadius: 8,
                padding: "12px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1,
                opacity: (!company || activePersonas.size === 0 || aiLoading) ? 0.4 : 1,
                transition: "opacity 0.2s",
              }}>
              {aiLoading ? "Generating\u2026" : "Generate New via AI"}
            </button>
            {generated && (
              <span style={{ fontSize: 12, color: t.green, fontFamily: "var(--mono)" }}>
                {questions.length} questions in database
              </span>
            )}
          </div>

          {/* AI PROGRESS */}
          {aiLoading && (
            <div style={{
              background: t.bgCard, border: `1px solid ${t.brand}30`, borderLeft: `3px solid ${t.brand}`,
              borderRadius: 10, padding: 20, marginBottom: 24, animation: "fadeUp 0.3s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", background: t.brand,
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: t.brand, fontFamily: "var(--mono)", letterSpacing: 0.5 }}>
                  AI RESEARCH IN PROGRESS
                </span>
                <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
                  ~$0.08 estimated
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {AI_STEPS.slice(0, -1).map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: i < aiStep ? t.green : i === aiStep ? t.brand : t.border,
                      transition: "background 0.3s",
                    }} />
                    <span style={{
                      fontSize: 11, fontFamily: "var(--mono)",
                      color: i < aiStep ? t.green : i === aiStep ? t.text : t.textGhost,
                      fontWeight: i === aiStep ? 600 : 400,
                    }}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI ERROR */}
          {aiError && !aiLoading && (
            <div style={{
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "12px 16px", marginBottom: 24,
            }}>
              <span style={{ fontSize: 11, color: "#ef4444", fontFamily: "var(--mono)" }}>
                AI generation failed: {aiError}
              </span>
              <span style={{ fontSize: 11, color: t.textDim, marginLeft: 8 }}>
                Showing static questions only.
              </span>
            </div>
          )}

          {/* COMPANY INTEL PANEL */}
          {companyIntel && generated && (
            <div style={{
              background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "3px solid #67e8f9",
              borderRadius: 10, padding: 20, marginBottom: 24,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#67e8f9", fontFamily: "var(--mono)", letterSpacing: 1, marginBottom: 10 }}>
                COMPANY INTELLIGENCE {"\u2014"} {company.toUpperCase()}
              </div>
              {companyIntel.marketPosition && (
                <div style={{ fontSize: 12, color: t.text, lineHeight: 1.6, marginBottom: 12 }}>
                  {companyIntel.marketPosition}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {companyIntel.keyFindings && companyIntel.keyFindings.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 6 }}>KEY FINDINGS</div>
                    {companyIntel.keyFindings.map((f, i) => (
                      <div key={i} style={{ fontSize: 11, color: t.textSec, lineHeight: 1.5, marginBottom: 4 }}>
                        {"\u2022"} {f}
                      </div>
                    ))}
                  </div>
                )}
                {companyIntel.competitors && companyIntel.competitors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 6 }}>COMPETITORS</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {companyIntel.competitors.map((c, i) => (
                        <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: t.mode === "dark" ? "rgba(103,232,249,0.08)" : "rgba(8,145,178,0.06)", color: "#67e8f9", fontFamily: "var(--mono)" }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {companyIntel.recentNews && companyIntel.recentNews.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 6 }}>RECENT NEWS</div>
                    {companyIntel.recentNews.map((n, i) => (
                      <div key={i} style={{ fontSize: 11, color: t.textSec, lineHeight: 1.5, marginBottom: 4 }}>
                        {"\u2022"} {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RESULTS */}
          {generated && questions.length > 0 && (
            <>
              {/* Stage Distribution */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: t.sectionNum, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--mono)" }}>Distribution</span>
                  {sourceCounts.ai > 0 && (
                    <span style={{ fontSize: 11, color: t.brand, fontFamily: "var(--mono)" }}>
                      {sourceCounts.static} seed + {sourceCounts.ai} AI + {sourceCounts.kb} cached
                    </span>
                  )}
                </div>
                <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 700, color: t.text }}>
                  Question Coverage Map
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 1, background: t.border, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                  {STAGES.map(s => (
                    <div key={s.id} style={{ background: t.bgCard, padding: 16, textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "var(--mono)", lineHeight: 1 }}>
                        {stageCount[s.id] || 0}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: t.textDim, marginTop: 6, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)" }}>
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: t.border, borderRadius: 10, overflow: "hidden" }}>
                  {PERSONAS.filter(p => activePersonas.has(p.id)).map(p => (
                    <div key={p.id} style={{ background: t.bgCard, padding: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: t.client, fontFamily: "var(--mono)" }}>
                        {personaCount[p.id] || 0}
                      </div>
                      <div style={{ fontSize: 11, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)" }}>
                        {p.short}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filters & Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                  style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer", background: t.inputBg }}>
                  <option value="all">All Stages</option>
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.label} ({stageCount[s.id] || 0})</option>)}
                </select>

                <select value={filterPersona} onChange={e => setFilterPersona(e.target.value)}
                  style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer", background: t.inputBg }}>
                  <option value="all">All Personas</option>
                  {PERSONAS.filter(p => activePersonas.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.label} ({personaCount[p.id] || 0})</option>)}
                </select>

                <select value={filterLifecycle} onChange={e => setFilterLifecycle(e.target.value)}
                  style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer", background: t.inputBg }}>
                  <option value="all">All Lifecycle Stages</option>
                  {CLM_LIFECYCLE.map(lc => <option key={lc.id} value={lc.id}>{lc.label} ({lifecycleCount[lc.id] || 0})</option>)}
                </select>

                {jurisdictions.length > 1 && (
                  <select value={filterJurisdiction} onChange={e => setFilterJurisdiction(e.target.value)}
                    style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer", background: t.inputBg }}>
                    <option value="all">All Jurisdictions</option>
                    {jurisdictions.map(j => (
                      <option key={j} value={j}>{j} ({questions.filter(q => (q.jurisdiction || "Global") === j).length})</option>
                    ))}
                  </select>
                )}

                <div style={{ flex: 1 }} />

                <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
                  {selectedQs.size} / {filtered.length} selected
                </span>

                <button onClick={() => setSelectedQs(new Set(filtered.map(q => q.id)))}
                  style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.textSec, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)" }}>
                  Select All
                </button>

                <button onClick={exportMarkdown}
                  style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.textSec, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)" }}>
                  Copy Table
                </button>

                <button onClick={exportToM2}
                  style={{
                    padding: "6px 12px", borderRadius: 6,
                    border: `1px solid ${exportCopied ? t.green : t.border}`,
                    background: "transparent",
                    color: exportCopied ? t.green : t.textSec, fontSize: 11, cursor: "pointer",
                    fontFamily: "var(--mono)",
                  }}>
                  {exportCopied ? "\u2713 Synced to M2" : "\u21BB Sync to M2"}
                </button>
              </div>

              {/* Questions Table */}
              <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle(t)}></th>
                      <th style={thStyle(t)}>#</th>
                      <th style={{ ...thStyle(t), textAlign: "left" }}>Question</th>
                      <th style={thStyle(t)}>Persona</th>
                      <th style={thStyle(t)}>Stage</th>
                      <th style={thStyle(t)}>Lifecycle</th>
                      <th style={thStyle(t)}>Source</th>
                      <th style={thStyle(t)}>Jurisdiction</th>
                      <th style={thStyle(t)}>Topic Cluster</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((q, i) => {
                      const persona = PERSONAS.find(p => p.id === q.persona);
                      const stage = STAGES.find(s => s.id === q.stage);
                      const sel = selectedQs.has(q.id);
                      return (
                        <tr key={q.id} onClick={() => toggleQ(q.id)}
                          style={{
                            borderBottom: `1px solid ${t.border}`, cursor: "pointer",
                            background: sel ? (t.mode === "dark" ? "rgba(167,139,250,0.04)" : "rgba(124,58,237,0.03)") : "transparent",
                            transition: "background 0.15s",
                            animation: q.source === "ai" ? "fadeUp 0.4s ease" : undefined,
                          }}>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${sel ? t.brand : t.border}`,
                              background: sel ? t.brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, color: "#fff", transition: "all 0.15s",
                            }}>
                              {sel && "\u2713"}
                            </div>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center", color: t.textGhost, fontFamily: "var(--mono)", fontSize: 11 }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: "10px 12px", color: t.text, fontWeight: 500, lineHeight: 1.5 }}>
                            {q.query}
                            {q.searchContext && q.source === "ai" && (
                              <div style={{ fontSize: 11, color: t.textGhost, marginTop: 3, fontStyle: "italic" }}>
                                {q.searchContext}
                              </div>
                            )}
                            {q.targetPersona && (
                              <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 3 }}>
                                Personalized for: {q.targetPersona}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
                              fontWeight: 700, fontFamily: "var(--mono)", background: t.mode === "dark" ? "rgba(103,232,249,0.1)" : "rgba(8,145,178,0.08)",
                              color: t.client, letterSpacing: 0.5,
                            }}>
                              {persona?.short}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
                              fontWeight: 700, fontFamily: "var(--mono)", background: stage?.color + "18",
                              color: stage?.color, letterSpacing: 0.5,
                            }}>
                              {stage?.label}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            {(() => {
                              const lc = CLM_LIFECYCLE.find(l => l.id === (q.lifecycle || CLUSTER_LIFECYCLE_MAP[q.cluster] || "full-stack"));
                              return lc ? (
                                <span style={{
                                  display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
                                  fontWeight: 700, fontFamily: "var(--mono)", background: lc.color + "18",
                                  color: lc.color, letterSpacing: 0.5, whiteSpace: "nowrap",
                                }}>
                                  {lc.id === "pre-signature" ? "PRE" : lc.id === "post-signature" ? "POST" : "FULL"}
                                </span>
                              ) : null;
                            })()}
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            {q.source === "ai" && <span style={badge("rgba(167,139,250,0.15)", "#a78bfa")}>AI</span>}
                            {q.source === "persona-research" && <span style={badge("rgba(236,72,153,0.12)", "#ec4899")}>PERSONA</span>}
                            {q.source === "kb" && <span style={badge("rgba(103,232,249,0.12)", "#67e8f9")}>KB</span>}
                            {q.source === "static" && <span style={badge("rgba(255,255,255,0.05)", t.textGhost)}>SEED</span>}
                            {q.classification === "micro" && <span style={badge("rgba(251,191,36,0.12)", "#fbbf24")}>MICRO</span>}
                            {q.classification === "macro" && q.source !== "static" && <span style={badge("rgba(74,222,128,0.12)", "#4ade80")}>MACRO</span>}
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            <span style={{ fontSize: 11, color: q.jurisdiction && q.jurisdiction !== "Global" ? "#3b82f6" : t.textGhost, fontFamily: "var(--mono)" }}>
                              {q.jurisdiction || "Global"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
                              {q.cluster}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Export Callout */}
              <div style={{
                background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.brand}`,
                borderRadius: 8, padding: "18px 20px", marginTop: 24,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.brand, marginBottom: 6, fontFamily: "var(--mono)" }}>
                  M1 {"\u2192"} M2 BRIDGE
                </div>
                <div style={{ fontSize: 13, color: t.textSec, lineHeight: 1.7 }}>
                  Click <strong style={{ color: t.text }}>Export to M2</strong> to send all {questions.length} questions to the Perception Monitor.
                  The monitor will test each question across ChatGPT, Gemini, and Claude to measure AI visibility.
                  {sourceCounts.ai > 0 && (
                    <span style={{ color: t.brand }}> Includes {sourceCounts.ai} AI-researched questions.</span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: PERSONA RESEARCH                              */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === "research" && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: t.text }}>
              Decision Maker Research
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
              Import and research decision makers to understand their psyche, pain points, and buying triggers.
              Researched personas flow to M4 (Buying Stage Guide) for deep analysis.
            </p>
          </div>

          {/* Import Mode Selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { id: "linkedin", label: "LinkedIn Paste", icon: "in" },
              { id: "csv", label: "Bulk CSV Import", icon: "\uD83D\uDCC1" },
              { id: "web", label: "AI Web Research", icon: "\uD83D\uDD0D" },
            ].map(m => (
              <button key={m.id} onClick={() => setImportMode(m.id)} style={{
                flex: 1, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                background: importMode === m.id
                  ? (t.mode === "dark" ? "rgba(167,139,250,0.1)" : "rgba(124,58,237,0.06)")
                  : t.bgCard,
                border: `1px solid ${importMode === m.id ? t.brand + "40" : t.border}`,
                textAlign: "center", transition: "all 0.2s",
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: importMode === m.id ? t.brand : t.textDim }}>
                  {m.label}
                </div>
              </button>
            ))}
          </div>

          {/* Import Error */}
          {importError && (
            <div style={{
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            }}>
              <span style={{ fontSize: 11, color: "#ef4444", fontFamily: "var(--mono)" }}>{importError}</span>
              <button onClick={() => setImportError("")} style={{ marginLeft: 12, background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>dismiss</button>
            </div>
          )}

          {/* LinkedIn Paste Mode */}
          {importMode === "linkedin" && (
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <label style={label}>Paste LinkedIn Profile Text</label>
              <p style={{ fontSize: 11, color: t.textDim, margin: "0 0 10px" }}>
                Go to the decision maker's LinkedIn profile {"\u2192"} Ctrl+A (select all) {"\u2192"} Ctrl+C (copy) {"\u2192"} paste below
              </p>
              <textarea
                value={linkedinPaste}
                onChange={e => setLinkedinPaste(e.target.value)}
                placeholder="Paste the full LinkedIn profile text here. Include Experience, Education, Skills, About section..."
                rows={8}
                style={{
                  ...inp, width: "100%", resize: "vertical", minHeight: 140, lineHeight: 1.6,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button onClick={handleLinkedinImport} disabled={importLoading || linkedinPaste.length < 50}
                  style={{
                    background: t.btnBg, color: t.btnText, border: "none", borderRadius: 8,
                    padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--mono)", opacity: (importLoading || linkedinPaste.length < 50) ? 0.4 : 1,
                  }}>
                  {importLoading ? "Processing\u2026" : "Import Persona"}
                </button>
                {linkedinPaste.length > 0 && (
                  <span style={{ fontSize: 11, color: linkedinPaste.length > 100 ? t.green : "#fbbf24", fontFamily: "var(--mono)" }}>
                    {linkedinPaste.length} chars {linkedinPaste.length > 100 ? "\u2713" : "(need more)"}
                  </span>
                )}
                <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>~$0.01</span>
              </div>
            </div>
          )}

          {/* CSV Import Mode */}
          {importMode === "csv" && (
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <label style={label}>Import CSV or JSON File</label>
              <p style={{ fontSize: 11, color: t.textDim, margin: "0 0 12px", lineHeight: 1.6 }}>
                Upload <strong>any</strong> CSV or JSON file with decision maker data.
                Our AI auto-detects your column format {"\u2014"} no need to rename headers.
                Works with Sales Navigator, Phantombuster, Apollo.io, ZoomInfo, or your own spreadsheet.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(74,222,128,0.1)", color: "#4ade80", fontFamily: "var(--mono)", fontWeight: 600 }}>
                  {"\u2713"} ADAPTIVE TEMPLATE
                </span>
                <span style={{ fontSize: 11, color: t.textDim }}>
                  AI maps your columns automatically if standard names aren{"'"}t found
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                onChange={handleFileImport}
                style={{ display: "none" }}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={importLoading}
                style={{
                  background: t.btnBg, color: t.btnText, border: "none", borderRadius: 8,
                  padding: "12px 28px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "var(--mono)", opacity: importLoading ? 0.4 : 1,
                }}>
                {importLoading ? "Importing\u2026" : "\uD83D\uDCC1 Choose File"}
              </button>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: t.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px dashed ${t.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 6 }}>EXAMPLE FORMATS (any of these work):</div>
                <code style={{ fontSize: 11, color: t.textSec, fontFamily: "var(--mono)", lineHeight: 1.8 }}>
                  name,title,company,location,linkedin_url,company_url<br />
                  John Doe,Chief Procurement Officer,Acme Corp,Bahrain,https://linkedin.com/in/johndoe,https://acme.com<br />
                  Jane Smith,General Counsel,TechCo,UAE,https://linkedin.com/in/janesmith,https://techco.io
                </code>
              </div>
            </div>
          )}

          {/* AI Web Research Mode */}
          {importMode === "web" && (
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <label style={label}>AI Web Research (No LinkedIn Needed)</label>
              <p style={{ fontSize: 11, color: t.textDim, margin: "0 0 12px", lineHeight: 1.6 }}>
                Enter the decision maker's name, title, and company. Claude will search the web and build a psyche profile automatically.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ ...label, fontSize: 11 }}>Full Name *</label>
                  <input style={inp} value={webResearchName} onChange={e => setWebResearchName(e.target.value)} placeholder="e.g. John Doe" />
                </div>
                <div>
                  <label style={{ ...label, fontSize: 11 }}>Title *</label>
                  <input style={inp} value={webResearchTitle} onChange={e => setWebResearchTitle(e.target.value)} placeholder="e.g. Chief Procurement Officer" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ ...label, fontSize: 11 }}>Company (defaults to {company})</label>
                <input style={inp} value={webResearchCompany} onChange={e => setWebResearchCompany(e.target.value)} placeholder={company} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={handleWebResearchImport} disabled={importLoading || !webResearchName.trim() || !webResearchTitle.trim()}
                  style={{
                    background: t.btnBg, color: t.btnText, border: "none", borderRadius: 8,
                    padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--mono)", opacity: (importLoading || !webResearchName.trim() || !webResearchTitle.trim()) ? 0.4 : 1,
                  }}>
                  {importLoading ? "Researching\u2026" : "\uD83D\uDD0D Research & Import"}
                </button>
                <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>~$0.08 (includes web search)</span>
              </div>
            </div>
          )}

          {/* Loading indicator for import */}
          {importLoading && (
            <div style={{
              background: t.bgCard, border: `1px solid ${t.brand}30`, borderLeft: `3px solid ${t.brand}`,
              borderRadius: 10, padding: 16, marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.brand, animation: "pulse 1.5s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: t.brand, fontFamily: "var(--mono)" }}>
                  {importMode === "web" ? "AI researching decision maker\u2026" : "Processing profile\u2026"}
                </span>
              </div>
            </div>
          )}

          {/* ── RESEARCHED PERSONAS LIST ── */}
          <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.text }}>
              Personas ({personaProfiles.length})
            </h3>
            {personaProfiles.length > 0 && (
              <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
                {personaProfiles.filter(p => p.researchedAt).length} researched {"\u00B7"} {personaProfiles.filter(p => p.m4AnalyzedAt).length} analyzed in M4
              </span>
            )}
          </div>

          {personaProfiles.length === 0 ? (
            <div style={{
              background: t.bgCard, border: `1px dashed ${t.border}`, borderRadius: 10, padding: 40,
              textAlign: "center", color: t.textDim, fontSize: 13,
            }}>
              No personas imported yet. Use one of the import methods above to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {personaProfiles.map(p => {
                const pType = PERSONAS.find(pp => pp.id === p.personaType);
                const isResearching = researchingId === p.id;
                return (
                  <div key={p.id} style={{
                    background: t.bgCard, borderTop: `1px solid ${t.border}`, borderRight: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, borderRadius: 10,
                    padding: 16, transition: "border-color 0.2s",
                    borderLeft: p.researchedAt ? "3px solid #a78bfa" : p.m4AnalyzedAt ? "3px solid #4ade80" : `3px solid ${t.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>{pType?.icon || "\uD83D\uDC64"}</span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: t.textSec }}>{p.title} {"\u00B7"} {p.company}</div>
                          </div>
                        </div>
                        {/* Status badges */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                          <span style={badge(
                            p.source === "linkedin-paste" ? "rgba(59,130,246,0.12)" : p.source === "csv-import" ? "rgba(251,191,36,0.12)" : "rgba(167,139,250,0.12)",
                            p.source === "linkedin-paste" ? "#3b82f6" : p.source === "csv-import" ? "#fbbf24" : "#a78bfa",
                          )}>
                            {p.source === "linkedin-paste" ? "LINKEDIN" : p.source === "csv-import" ? "CSV" : "WEB"}
                          </span>
                          <span style={badge("rgba(103,232,249,0.12)", "#67e8f9")}>
                            {pType?.short || p.personaType.toUpperCase()}
                          </span>
                          {p.researchedAt && <span style={badge("rgba(167,139,250,0.15)", "#a78bfa")}>RESEARCHED</span>}
                          {p.m4AnalyzedAt && <span style={badge("rgba(74,222,128,0.12)", "#4ade80")}>M4 ANALYZED</span>}
                          {p.clmReadiness != null && (
                            <span style={badge("rgba(251,191,36,0.12)", "#fbbf24")}>
                              CLM READY: {p.clmReadiness}/10
                            </span>
                          )}
                          {p.m4ReadinessScore != null && (
                            <span style={badge("rgba(74,222,128,0.12)", "#4ade80")}>
                              M4: {p.m4ReadinessScore}/10
                            </span>
                          )}
                        </div>
                        {/* Research summary */}
                        {p.researchSummary && (
                          <div style={{ fontSize: 11, color: t.textSec, lineHeight: 1.6, marginTop: 10, padding: "8px 10px", borderRadius: 6, background: t.mode === "dark" ? "rgba(167,139,250,0.04)" : "rgba(124,58,237,0.03)" }}>
                            {cleanAIText(p.researchSummary)}
                          </div>
                        )}
                        {/* Psyche profile */}
                        {p.psycheProfile && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {p.psycheProfile.decisionStyle && (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(167,139,250,0.08)", color: "#a78bfa", fontFamily: "var(--mono)" }}>
                                {p.psycheProfile.decisionStyle}
                              </span>
                            )}
                            {p.psycheProfile.riskTolerance && (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontFamily: "var(--mono)" }}>
                                risk: {p.psycheProfile.riskTolerance}
                              </span>
                            )}
                            {p.psycheProfile.communicationPreference && (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(103,232,249,0.08)", color: "#67e8f9", fontFamily: "var(--mono)" }}>
                                {p.psycheProfile.communicationPreference}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Pain points */}
                        {p.painPoints && p.painPoints.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: t.textDim, fontFamily: "var(--mono)", marginBottom: 4 }}>PAIN POINTS</div>
                            {p.painPoints.slice(0, 3).map((pp, i) => (
                              <div key={i} style={{ fontSize: 11, color: t.textSec, lineHeight: 1.5 }}>
                                {"\u2022"} {cleanAIText(pp.pain)} <span style={{ color: pp.severity === "high" ? "#ef4444" : pp.severity === "medium" ? "#fbbf24" : "#4ade80", fontSize: 11, fontFamily: "var(--mono)" }}>({pp.severity})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 100 }}>
                        {!p.researchedAt && (
                          <button onClick={() => handleResearchPersona(p.id)} disabled={isResearching}
                            style={{
                              padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.brand}40`,
                              background: t.brand + "10", color: t.brand, fontSize: 11,
                              fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                              opacity: isResearching ? 0.5 : 1,
                            }}>
                            {isResearching ? "Researching\u2026" : "\uD83D\uDD0D Research"}
                          </button>
                        )}
                        {p.researchedAt && (
                          <button onClick={() => handleResearchPersona(p.id)} disabled={isResearching}
                            style={{
                              padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.brand}40`,
                              background: t.brand + "10", color: t.brand, fontSize: 11,
                              fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                              opacity: isResearching ? 0.5 : 1,
                            }}>
                            {isResearching ? "Researching\u2026" : "\uD83D\uDD04 Re-research"}
                          </button>
                        )}
                        <button onClick={() => handleDeletePersona(p.id)}
                          style={{
                            padding: "6px 12px", borderRadius: 6, border: `1px solid rgba(239,68,68,0.2)`,
                            background: "rgba(239,68,68,0.05)", color: "#ef4444", fontSize: 11,
                            fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                          }}>
                          Delete
                        </button>
                      </div>
                    </div>
                    {/* Research progress */}
                    {isResearching && (
                      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, background: t.brand + "08", border: `1px solid ${t.brand}20` }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.brand, animation: "pulse 1.5s ease-in-out infinite" }} />
                          <span style={{ fontSize: 11, color: t.brand, fontFamily: "var(--mono)" }}>
                            {RESEARCH_STEPS[researchStep] || "Processing\u2026"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* M1 → M4 Bridge Callout */}
          {personaProfiles.length > 0 && (
            <div style={{
              background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "3px solid #4ade80",
              borderRadius: 8, padding: "18px 20px", marginTop: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", fontFamily: "var(--mono)" }}>
                  M1 {"\u2192"} M4 PERSONA BRIDGE
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate("m4")}
                    style={{
                      padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.3)",
                      background: "rgba(74,222,128,0.08)", color: "#4ade80", fontSize: 11,
                      fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
                      display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(74,222,128,0.15)"; e.currentTarget.style.borderColor = "rgba(74,222,128,0.5)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(74,222,128,0.08)"; e.currentTarget.style.borderColor = "rgba(74,222,128,0.3)"; }}
                  >
                    Go to M4 {"\u2192"}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13, color: t.textSec, lineHeight: 1.7 }}>
                {personaProfiles.length} persona{personaProfiles.length !== 1 ? "s" : ""} available in{" "}
                {onNavigate ? (
                  <strong
                    style={{ color: "#4ade80", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                    onClick={() => onNavigate("m4")}
                  >M4 Buying Stage Guide</strong>
                ) : (
                  <strong style={{ color: t.text }}>M4 Buying Stage Guide</strong>
                )}.
                {" "}Select a persona from the dropdown to run a full analysis with auto-filled LinkedIn data.
                {personaProfiles.filter(p => p.researchedAt).length > 0 && (
                  <span style={{ color: "#a78bfa" }}> {personaProfiles.filter(p => p.researchedAt).length} researched with AI psyche profiles.</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle = (t) => ({
  textAlign: "center", padding: "10px 8px", fontSize: 11, fontWeight: 600,
  color: t.textDim, textTransform: "uppercase", letterSpacing: 1.5,
  fontFamily: "var(--mono)", borderBottom: `1px solid ${t.border}`, whiteSpace: "nowrap",
});

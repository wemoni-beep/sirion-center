import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { db } from "./firebase.js";
import { callClaude, callClaudeFast } from "./claudeApi.js";
import {
  questionHash, saveQuestions, deleteQuestions, getQuestionsForCompany,
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
  { id: "gc", label: "General Counsel", icon: "\u2696", short: "GC", desc: "Owns legal risk, contract policy, and regulatory compliance", avatar: "https://i.pravatar.cc/80?img=60" },
  { id: "cpo", label: "Chief Procurement Officer", icon: "\uD83D\uDCCB", short: "CPO", desc: "Drives sourcing strategy, vendor management, and cost optimization", avatar: "https://i.pravatar.cc/80?img=68" },
  { id: "cio", label: "Chief Information Officer", icon: "\uD83D\uDCBB", short: "CIO", desc: "Leads enterprise IT strategy, digital transformation, and integrations", avatar: "https://i.pravatar.cc/80?img=52" },
  { id: "vplo", label: "VP Legal Operations", icon: "\u2699", short: "VP LO", desc: "Streamlines legal workflows, technology adoption, and team efficiency", avatar: "https://i.pravatar.cc/80?img=47" },
  { id: "cto", label: "VP IT / CTO", icon: "\uD83D\uDD27", short: "CTO", desc: "Evaluates technical architecture, APIs, security, and scalability", avatar: "https://i.pravatar.cc/80?img=11" },
  { id: "cm", label: "Contract Manager", icon: "\uD83D\uDCC4", short: "CM", desc: "Handles day-to-day contract authoring, tracking, and obligations", avatar: "https://i.pravatar.cc/80?img=32" },
  { id: "pd", label: "Procurement Director", icon: "\uD83C\uDFE2", short: "PD", desc: "Manages procurement operations, supplier relationships, and spend", avatar: "https://i.pravatar.cc/80?img=57" },
  { id: "cfo", label: "CFO", icon: "\uD83D\uDCB0", short: "CFO", desc: "Oversees financial risk, contract value leakage, and ROI accountability", avatar: "https://i.pravatar.cc/80?img=13" },
];

const STAGES = [
  { id: "awareness", label: "Awareness", color: "#a78bfa" },
  { id: "discovery", label: "Discovery", color: "#67e8f9" },
  { id: "consideration", label: "Consideration", color: "#fbbf24" },
  { id: "decision", label: "Decision", color: "#4ade80" },
  { id: "validation", label: "Validation", color: "#fb923c" },
];

const CLUSTERS_META = [
  { name: "Contract AI / Automation", weight: 95, trend: "rising", color: "#a78bfa", desc: "AI-powered contract drafting, clause extraction, risk scoring, and automated workflows", why: "AI in CLM market at 26.5% CAGR — 80% of enterprises will have GenAI by 2026" },
  { name: "CLM Platform Selection", weight: 85, trend: "rising", color: "#60a5fa", desc: "Evaluating and comparing CLM vendors, feature matrices, and analyst rankings", why: "40%+ of buyers replace first CLM within 3 years — constant re-evaluation cycle" },
  { name: "Post-Signature / Obligations", weight: 88, trend: "rising", color: "#34d399", desc: "Obligation tracking, compliance monitoring, SLA management, and renewal automation", why: "9.2% of annual contract value lost post-signature per World Commerce & Contracting" },
  { name: "Procurement CLM", weight: 74, trend: "rising", color: "#fbbf24", desc: "Contract management for procurement teams, supplier risk, and spend optimization", why: "80% of CPOs plan GenAI deployment — AI in procurement market projected $39B by 2035" },
  { name: "Enterprise Scale", weight: 65, trend: "stable", color: "#f472b6", desc: "Large-scale deployments, multi-entity support, global compliance, and integrations", why: "Table-stakes for Fortune 500 — cloud-native multi-entity is expected, not differentiating" },
  { name: "Financial Services CLM", weight: 58, trend: "stable", color: "#38bdf8", desc: "Regulatory compliance, ISDA agreements, fund administration, and banking contracts", why: "Banking compliance costs up 60% per Deloitte — high-value but narrow audience" },
  { name: "Implementation & ROI", weight: 78, trend: "rising", color: "#fb923c", desc: "Deployment timelines, total cost of ownership, measurable ROI, and success metrics", why: "Integration costs can exceed license costs — 40% CLM failure rate drives TCO anxiety" },
  { name: "Analyst Rankings", weight: 62, trend: "stable", color: "#c084fc", desc: "Gartner, Forrester, IDC, and Spend Matters evaluations and positioning", why: "Forrester Wave Q1 2025 evaluated 12 CLM vendors — influential but buyers start with GenAI search" },
  { name: "Agentic CLM", weight: 82, trend: "rising", color: "#4ade80", desc: "Autonomous AI agents for contract negotiation, auto-remediation, and intelligent workflows", why: "Hottest trend per KPMG and DocuSign — but still emerging, not yet mainstream revenue" },
];
const CLUSTERS = CLUSTERS_META.map(c => c.name);

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

/* ── Question Cleanup Prompt ────────────────────────────── */
const QUESTION_CLEANUP_PROMPT = `You are a Question Bank Editor for a B2B CLM (Contract Lifecycle Management) content strategy team.

YOUR TASK: Review a list of buyer-intent questions and identify groups of highly similar or near-duplicate questions.

SIMILARITY CRITERIA:
- Same core intent (even if phrased differently)
- Same buyer concern answered from the same angle
- One is a subset or minor rephrasing of another
- 85%+ semantic overlap

FOR EACH GROUP:
- Pick the BEST question to keep (most specific, most search-intent aligned, clearest)
- List the others as remove candidates

OUTPUT — valid JSON only:
{
  "groups": [
    {
      "keep": { "id": "question_id", "query": "The question to keep", "reason": "Why this is the best" },
      "remove": [
        { "id": "question_id", "query": "Near-duplicate to remove" }
      ]
    }
  ],
  "totalRemoved": 5,
  "summary": "One sentence summary of what was cleaned up"
}

RULES:
- Only flag questions that are genuinely similar (85%+ overlap)
- If all questions are distinct, return { "groups": [], "totalRemoved": 0, "summary": "No duplicates found" }
- Do NOT merge questions from different personas or different buying stages
- Keep the more specific, more search-intent aligned version`;

/* ── Find Similar Prompt ────────────────────────────────── */
const FIND_SIMILAR_PROMPT = `You are a Senior B2B Market Intelligence Analyst specializing in CLM (Contract Lifecycle Management) buyers.

YOUR MISSION: Given a researched decision maker, find 8-10 similar CLM-relevant people at comparable companies. Use web search to find real people.

SIMILARITY CRITERIA:
- Same or adjacent industry
- Revenue within 0.5x–2x of source company
- Same geographic market (same country / region)
- Similar contract complexity: enterprise B2B, multi-department, high volume

PERSONA COVERAGE: Mix buyer roles — GC, CPO, CIO, VP Legal Ops, CFO, CTO, Contract Manager, Procurement Director. Prioritize the buying committee most relevant to this industry.

LINKEDIN URL RULES:
- Confirmed person with known profile: use https://linkedin.com/in/firstname-lastname format
- Otherwise: use https://www.linkedin.com/search/results/people/?keywords=FirstName+LastName+CompanyName
- confidence 0.85+ = you found a real profile URL; 0.6 = best-guess search

OUTPUT — valid JSON only, no markdown:
{
  "sourceContext": "One sentence: why these targets match",
  "suggestions": [{
    "name": "First Last",
    "title": "Chief Procurement Officer",
    "company": "CompanyName",
    "companyUrl": "https://company.com",
    "linkedinUrl": "https://linkedin.com/in/...",
    "linkedinSearchUrl": "https://www.linkedin.com/search/results/people/?keywords=First+Last+CompanyName",
    "location": "City, Country",
    "companySize": "1,000–5,000",
    "companyRevenue": "$200M–$500M",
    "industry": "Enterprise Software",
    "personaType": "cpo",
    "clmSignals": "10K+ contracts/year; dedicated contract ops team hired 2024",
    "confidence": 0.85,
    "reason": "Same SaaS vertical, similar revenue, CPO is primary CLM buyer"
  }]
}`;

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

/* ── Per-Persona Role Contexts ────────────────────────── */
// Defines the cognitive lens, KPIs, vocabulary, and boundaries for each persona.
// Each persona's questions are generated FROM this mindset, not labeled with it after the fact.
const PERSONA_CONTEXTS = {
  gc: {
    title: "General Counsel",
    lens: "Legal risk, regulatory compliance, and contract governance",
    kpis: ["contract dispute rate", "clause risk exposure", "time to negotiate", "legal spend per contract"],
    priorities: [
      "Enforcing playbook standards on inbound third-party paper at scale",
      "Reducing litigation risk from ambiguous or missing contract terms",
      "GDPR, DPA, and regulatory compliance across all agreements",
      "M&A contract due diligence velocity and completeness",
      "Controlling external counsel spend through better self-serve tooling",
    ],
    language: ["indemnification", "governing law", "playbook", "redlines", "material breach", "force majeure", "regulatory exposure", "third-party paper", "clause risk", "obligations"],
    wouldAsk: ["third-party paper handling", "clause risk scoring", "litigation prevention", "playbook enforcement", "regulatory compliance"],
    wouldNotAsk: ["procurement savings", "supplier performance", "IT integration specs", "board ROI presentation"],
  },
  cpo: {
    title: "Chief Procurement Officer",
    lens: "Procurement performance, supplier accountability, and spend optimization",
    kpis: ["savings realized vs contracted", "supplier SLA compliance %", "spend under management", "on-time renewal %"],
    priorities: [
      "Visibility into whether suppliers are actually delivering what contracts commit to",
      "Tracking obligation milestones and renewal dates automatically",
      "Eliminating rogue spend and off-contract buying across business units",
      "Supplier risk management and ESG compliance obligations",
      "Connecting contract terms to real procurement outcomes and savings",
    ],
    language: ["spend under management", "supplier performance", "obligation tracking", "rogue spend", "vendor governance", "sourcing", "contract compliance", "renewal"],
    wouldAsk: ["supplier obligation tracking", "spend analysis from contracts", "vendor compliance", "auto-renewal alerts", "procurement efficiency"],
    wouldNotAsk: ["legal clause redlining", "playbook governance", "IT API specs", "financial statement impact"],
  },
  cio: {
    title: "Chief Information Officer",
    lens: "Technology infrastructure, data security, and enterprise integration",
    kpis: ["integration completeness", "security posture", "IT contract spend", "implementation success rate"],
    priorities: [
      "Integrating CLM with existing ERP/CRM/HRIS stack (Salesforce, SAP, Workday, ServiceNow)",
      "Data security, residency, and sovereignty of contract content at rest and in transit",
      "Managing the IT contract lifecycle for software, cloud, and SaaS agreements",
      "Change management and user adoption across the enterprise",
      "AI governance and responsible AI policies applied to contract workflows",
    ],
    language: ["API", "integration", "SSO", "data residency", "security posture", "tech stack", "scalability", "cloud", "SaaS", "change management", "implementation"],
    wouldAsk: ["ERP/CRM integration", "security certifications", "API capabilities", "data privacy compliance", "implementation roadmap"],
    wouldNotAsk: ["legal playbook governance", "procurement savings", "external counsel spend", "clause risk scoring"],
  },
  vplo: {
    title: "VP Legal Operations",
    lens: "Legal department efficiency, process automation, and measurable output",
    kpis: ["cost per contract", "cycle time", "contracts per headcount", "legal team utilization rate"],
    priorities: [
      "Automating repetitive contract workflows to free lawyers for high-value work",
      "Building dashboard visibility into legal department performance and throughput",
      "Rationalizing the legal tech stack — fewer point solutions, more integration",
      "Scaling contract volume without scaling headcount",
      "Data-driven reporting on legal operations metrics to GC and CFO",
    ],
    language: ["workflow automation", "cycle time", "matter management", "legal ops metrics", "self-service", "intake", "playbook automation", "tech stack rationalization"],
    wouldAsk: ["workflow automation", "legal metrics dashboards", "self-service contract tools", "tech stack consolidation", "headcount efficiency"],
    wouldNotAsk: ["supplier performance", "IT security architecture", "board-level ROI", "procurement compliance"],
  },
  cto: {
    title: "VP IT / CTO",
    lens: "Technical architecture, AI/ML capabilities, and build-vs-buy decisions",
    kpis: ["system uptime", "API response time", "AI model accuracy", "deployment velocity"],
    priorities: [
      "Evaluating AI/ML training data quality and model explainability in CLM platforms",
      "Build vs buy decisions for contract intelligence and extraction features",
      "Enterprise scalability, multi-tenant architecture, and performance under load",
      "Security architecture: SOC 2, penetration testing, zero-trust access model",
      "Developer-friendly APIs for custom integrations with internal systems",
    ],
    language: ["machine learning", "NLP", "API-first", "microservices", "SOC 2", "AI model", "training data", "inference", "scalability", "architecture"],
    wouldAsk: ["AI model quality and training approach", "API-first architecture", "enterprise scalability", "security architecture", "technical implementation requirements"],
    wouldNotAsk: ["legal playbook governance", "procurement savings", "financial statement impact", "supplier management"],
  },
  cm: {
    title: "Contract Manager",
    lens: "Day-to-day contract execution, turnaround speed, and deadline management",
    kpis: ["contract turnaround time", "on-time renewals %", "template compliance rate", "amendment cycle time"],
    priorities: [
      "Getting contracts executed faster with fewer manual steps and email chains",
      "Never missing a renewal deadline, milestone obligation, or expiry date",
      "Managing amendment cycles and version control without creating chaos",
      "Having a single searchable repository for all executed contracts",
      "Reducing back-and-forth with counterparties and internal approvers",
    ],
    language: ["template", "turnaround", "renewal reminder", "amendment", "version control", "approval workflow", "counterparty", "executed contract", "repository", "clause library"],
    wouldAsk: ["template management", "renewal alerts", "approval workflow speed", "amendment tracking", "contract search and repository"],
    wouldNotAsk: ["board reporting", "enterprise security architecture", "AI model training", "financial risk exposure"],
  },
  pd: {
    title: "Procurement Director",
    lens: "Vendor negotiation, contract compliance, and sourcing process efficiency",
    kpis: ["negotiation cycle time", "savings vs target", "contract compliance rate", "vendor onboarding time"],
    priorities: [
      "Speeding up vendor contract negotiation without sacrificing favorable terms",
      "Tracking whether vendor deliverables actually match contracted commitments",
      "Managing a growing vendor base across multiple spend categories",
      "Standardizing contract templates for common vendor types",
      "Avoiding auto-renewal traps and identifying expiring contracts proactively",
    ],
    language: ["vendor", "negotiation", "sourcing", "RFP", "supplier contract", "deliverables", "auto-renewal", "spend category", "preferred supplier", "contract terms"],
    wouldAsk: ["vendor negotiation support", "procurement templates", "supplier contract compliance", "auto-renewal management", "category spend from contracts"],
    wouldNotAsk: ["legal risk management", "IT security specs", "financial statement impact", "AI model architecture"],
  },
  cfo: {
    title: "CFO",
    lens: "Financial risk, revenue recognition, and contract-driven P&L impact",
    kpis: ["contract-driven revenue at risk", "obligation cost exposure", "contract leakage $", "renewal revenue retained"],
    priorities: [
      "Understanding total financial exposure hidden in contract obligations across the portfolio",
      "Revenue recognition compliance (ASC 606/IFRS 15) tied to contract milestones and deliverables",
      "Identifying and capturing contract value leakage — missed discounts, SLA credits, price escalations",
      "Board-level reporting on contract portfolio risk and unrealized value",
      "Justifying CLM ROI to the CEO with concrete financial metrics",
    ],
    language: ["revenue recognition", "financial exposure", "contract value leakage", "obligation cost", "P&L impact", "ASC 606", "risk-adjusted", "financial controls", "ROI", "board reporting"],
    wouldAsk: ["financial risk from contracts", "revenue recognition compliance", "contract leakage", "ROI calculation", "CFO dashboard for contract portfolio"],
    wouldNotAsk: ["legal playbook governance", "IT API specs", "supplier management", "legal team efficiency metrics"],
  },
};

/* ── Per-Persona Prompt Builder ────────────────────────── */
function buildPersonaQuestionPrompt(ctx, persona, clusters, company, existing, alreadyGenerated, matchedProfile) {
  let prompt = `You generate buyer-intent questions that a ${ctx.title} would type into AI assistants (ChatGPT, Perplexity, Claude, Gemini) when evaluating CLM software.

PERSONA LENS — ${ctx.title.toUpperCase()}:
${ctx.lens}

KPIs they are measured on: ${ctx.kpis.join(", ")}
Their priorities:
${ctx.priorities.map(p => `- ${p}`).join("\n")}

Their vocabulary: ${ctx.language.join(", ")}
They WOULD ask about: ${ctx.wouldAsk.join(", ")}
They would NEVER ask about: ${ctx.wouldNotAsk.join(", ")}`;

  if (matchedProfile?.psycheProfile) {
    prompt += `\n\nREAL DECISION MAKER PROFILE — make questions hyper-specific to this person:
Name: ${matchedProfile.name} — ${matchedProfile.title} at ${matchedProfile.company}
Decision style: ${matchedProfile.psycheProfile.decisionStyle}
Risk tolerance: ${matchedProfile.psycheProfile.riskTolerance}
Buying triggers: ${(matchedProfile.psycheProfile.buyingTriggers || []).join(", ")}
Pain points: ${(matchedProfile.painPoints || []).slice(0, 3).map(p => p.pain).join("; ")}
Priorities: ${(matchedProfile.priorities || []).join(", ")}
Profile: ${matchedProfile.researchSummary || ""}`;
  }

  prompt += `\n\nTOPIC CLUSTERS TO COVER: ${clusters.join(", ")}

QUESTION TYPES:
- MACRO (~40%): Industry-wide, no specific vendor mentioned
- MICRO (~60%): Reference ${company} or specific competitors

JOURNEY STAGES: awareness, discovery, consideration, decision, validation
CLM LIFECYCLE: pre-signature, post-signature, full-stack

RULES:
- Generate exactly 12 questions
- EVERY question must authentically reflect the ${ctx.title}'s cognitive lens and vocabulary
- Questions must sound like what THIS specific role would type — not what any generic executive asks
- 10-30 words each, natural phrasing (as typed into a search bar, not formal language)
- Cover at least 3 different journey stages and all 3 lifecycle stages`;

  const allExisting = [...existing, ...alreadyGenerated];
  if (allExisting.length > 0) {
    prompt += `\n\nDO NOT DUPLICATE THESE QUESTIONS:\n${allExisting.slice(0, 30).map((q, i) => `${i + 1}. ${q.query || q.q}`).join("\n")}`;
  }

  prompt += `\n\nOUTPUT — valid JSON only, no markdown:
{"companyIntel":{"keyFindings":[],"competitors":[],"recentNews":[],"marketPosition":""},"questions":[{"q":"...","s":"stage","c":"cluster","l":"lifecycle","classification":"macro|micro","context":"why this persona would ask this","confidence":0.9}]}`;

  return prompt;
}

/* ── Decision Criteria per Persona ───────────────────── */
const DECISION_CRITERIA = {
  gc: [
    { id: "playbook_enforcement", label: "Playbook Enforcement at Scale", weight: 9 },
    { id: "third_party_paper", label: "Third-Party Paper Handling", weight: 8 },
    { id: "regulatory_compliance", label: "Regulatory Compliance (GDPR/DPA)", weight: 9 },
    { id: "clause_risk_scoring", label: "Clause Risk Scoring", weight: 7 },
    { id: "ma_due_diligence", label: "M&A Due Diligence Velocity", weight: 7 },
    { id: "litigation_prevention", label: "Litigation Risk Prevention", weight: 8 },
    { id: "external_counsel_control", label: "External Counsel Spend Control", weight: 6 },
  ],
  cpo: [
    { id: "supplier_obligation_tracking", label: "Supplier Obligation Tracking", weight: 9 },
    { id: "spend_visibility", label: "Spend Under Management Visibility", weight: 8 },
    { id: "rogue_spend_control", label: "Rogue Spend Control", weight: 7 },
    { id: "auto_renewal_mgmt", label: "Auto-Renewal Management", weight: 8 },
    { id: "vendor_compliance", label: "Vendor Compliance Tracking", weight: 7 },
    { id: "supplier_risk", label: "Supplier Risk & ESG Compliance", weight: 6 },
  ],
  cio: [
    { id: "erp_crm_integration", label: "ERP/CRM Integration Depth", weight: 9 },
    { id: "data_security", label: "Data Security & Residency", weight: 9 },
    { id: "api_capabilities", label: "API Capabilities", weight: 8 },
    { id: "sso_access", label: "SSO & Access Management", weight: 7 },
    { id: "ai_governance", label: "AI Governance & Explainability", weight: 7 },
    { id: "change_management", label: "Change Management & Adoption", weight: 6 },
  ],
  vplo: [
    { id: "workflow_automation", label: "Workflow Automation", weight: 9 },
    { id: "cycle_time_reduction", label: "Cycle Time Reduction", weight: 9 },
    { id: "self_service_contracts", label: "Self-Service Contract Tools", weight: 8 },
    { id: "headcount_efficiency", label: "Headcount Efficiency (contracts/FTE)", weight: 8 },
    { id: "legal_metrics_dashboard", label: "Legal Metrics Dashboard", weight: 7 },
    { id: "tech_stack_consolidation", label: "Tech Stack Rationalization", weight: 7 },
  ],
  cto: [
    { id: "ai_model_quality", label: "AI Model Quality & Accuracy", weight: 9 },
    { id: "security_architecture", label: "Security Architecture (SOC 2)", weight: 9 },
    { id: "api_first_architecture", label: "API-First Architecture", weight: 8 },
    { id: "enterprise_scalability", label: "Enterprise Scalability", weight: 8 },
    { id: "ai_training_data", label: "AI Training Data Quality", weight: 7 },
    { id: "build_vs_buy", label: "Build vs Buy Flexibility", weight: 7 },
  ],
  cm: [
    { id: "renewal_alerts", label: "Renewal & Deadline Alerts", weight: 9 },
    { id: "approval_workflow_speed", label: "Approval Workflow Speed", weight: 9 },
    { id: "template_management", label: "Template Management", weight: 8 },
    { id: "amendment_tracking", label: "Amendment & Version Control", weight: 8 },
    { id: "contract_repository", label: "Contract Search & Repository", weight: 8 },
    { id: "counterparty_collab", label: "Counterparty Collaboration", weight: 7 },
  ],
  pd: [
    { id: "vendor_negotiation_support", label: "Vendor Negotiation Support", weight: 8 },
    { id: "auto_renewal_traps", label: "Auto-Renewal Trap Detection", weight: 8 },
    { id: "supplier_contract_compliance", label: "Supplier Contract Compliance", weight: 8 },
    { id: "procurement_templates", label: "Procurement Templates", weight: 7 },
    { id: "category_spend_analysis", label: "Category Spend from Contracts", weight: 7 },
    { id: "vendor_onboarding", label: "Vendor Onboarding Speed", weight: 6 },
  ],
  cfo: [
    { id: "financial_exposure", label: "Financial Exposure Visibility", weight: 9 },
    { id: "revenue_recognition", label: "Revenue Recognition Compliance (ASC 606)", weight: 9 },
    { id: "contract_leakage", label: "Contract Value Leakage Detection", weight: 9 },
    { id: "roi_measurement", label: "CLM ROI Measurement", weight: 8 },
    { id: "board_reporting", label: "Board-Level Portfolio Reporting", weight: 7 },
    { id: "financial_controls", label: "Financial Controls Integration", weight: 7 },
  ],
};

/* ── Intent type display config ──────────────────────── */
const INTENT_CONFIG = {
  generic:   { label: "Generic",   color: "#94a3b8", bg: "rgba(148,163,184,0.12)", desc: "Industry-wide, no vendor" },
  category:  { label: "Category",  color: "#67e8f9", bg: "rgba(103,232,249,0.12)", desc: "CLM category-level" },
  vendor:    { label: "Vendor",    color: "#a78bfa", bg: "rgba(167,139,250,0.12)", desc: "Mentions specific vendor" },
  decision:  { label: "Decision",  color: "#4ade80", bg: "rgba(74,222,128,0.12)",  desc: "Evaluation/comparison" },
};
const VOLUME_CONFIG = {
  high:   { label: "High Vol",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  medium: { label: "Med Vol",   color: "#67e8f9", bg: "rgba(103,232,249,0.10)" },
  niche:  { label: "Niche",     color: "#a78bfa", bg: "rgba(167,139,250,0.10)" },
};

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
  const [hoveredBubble, setHoveredBubble] = useState(null);

  // ── Cluster recalibration state ──
  const [clusterWeights, setClusterWeights] = useState(() => {
    try { const s = localStorage.getItem("xt_cluster_cal"); if (s) return JSON.parse(s).weights; } catch {} return null;
  });
  const [lastCalibrated, setLastCalibrated] = useState(() => {
    try { const s = localStorage.getItem("xt_cluster_cal"); if (s) return JSON.parse(s).ts; } catch {} return null;
  });
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState("");
  const [generated, setGenerated] = useState(false);
  const [filterStage, setFilterStage] = useState("all");
  const [filterPersona, setFilterPersona] = useState("all");
  const [filterJurisdiction, setFilterJurisdiction] = useState("all");
  const [filterLifecycle, setFilterLifecycle] = useState("all");
  const [exportCopied, setExportCopied] = useState(false);
  const [autoGenMsg, setAutoGenMsg] = useState(""); // notification from auto-question gen
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState(null); // { groups: [{keep, remove[]}], totalRemoved }
  const [selectedQs, setSelectedQs] = useState(new Set());

  // ── AI generation state ──
  const isGeneratingRef = useRef(false); // prevents double-click triggering duplicate API calls
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [aiCurrentPersona, setAiCurrentPersona] = useState(null); // { id, short, idx, total }
  const [aiError, setAiError] = useState("");
  const [companyIntel, setCompanyIntel] = useState(null);

  // ── Enrichment state ──
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ done: 0, total: 0 });
  const [enrichmentStep, setEnrichmentStep] = useState(""); // current phase label
  const [enrichmentLog, setEnrichmentLog] = useState([]); // running log lines
  const [enrichmentStartTime, setEnrichmentStartTime] = useState(null);
  const [enrichmentElapsed, setEnrichmentElapsed] = useState(0);
  const [enrichmentResult, setEnrichmentResult] = useState(null); // { count, total } on complete
  const [autoEnrichPending, setAutoEnrichPending] = useState(false); // auto-trigger after generation
  const [filterIntentType, setFilterIntentType] = useState("all");
  const [filterVolumeTier, setFilterVolumeTier] = useState("all");

  // ── Decision Matrix state ──
  const [activeMatrixPersona, setActiveMatrixPersona] = useState("gc");
  const [decisionScores, setDecisionScores] = useState(() => {
    // Priority: localStorage first (fast), then pipeline fallback (survives cross-domain deploy)
    try { const s = localStorage.getItem("xt_decision_scores"); if (s) return JSON.parse(s); } catch {}
    return {};
  }); // key: "gc.criterion_id" → score 1-10
  const [expandedCriterion, setExpandedCriterion] = useState(null); // key of expanded row
  const [autoGrading, setAutoGrading] = useState(false);
  const [autoGradeSource, setAutoGradeSource] = useState(null); // { scoredAt, count }

  // ── Knowledge base state ──
  const [kbStats, setKbStats] = useState({ totalQuestions: 0, totalMacros: 0, companiesResearched: 0, totalPersonas: 0 });
  const [kbQuestions, setKbQuestions] = useState([]);
  const [creditsUsed, setCreditsUsed] = useState(0);

  // ── Persona Research state ──
  const [personaProfiles, setPersonaProfiles] = useState([]);
  const [linkedinPaste, setLinkedinPaste] = useState("");
  const [importMode, setImportMode] = useState("linkedin"); // "linkedin" | "csv"
  // ── Find Similar state ──
  const [personaGeneratedQs, setPersonaGeneratedQs] = useState({}); // { [personaId]: Question[] }
  const [findSimilarId, setFindSimilarId] = useState(null);
  const [findSimilarLoading, setFindSimilarLoading] = useState(false);
  const [findSimilarResults, setFindSimilarResults] = useState({});  // { [personaId]: suggestion[] }
  const [similarRowStates, setSimilarRowStates] = useState({});       // { [rowKey]: { expanded, paste, loading, done, error, step } }
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState(0);
  const [importError, setImportError] = useState("");
  const [webResearchName, setWebResearchName] = useState("");
  const [webResearchTitle, setWebResearchTitle] = useState("");
  const [webResearchCompany, setWebResearchCompany] = useState("");
  const [researchingId, setResearchingId] = useState(null);
  const [researchStep, setResearchStep] = useState(0);
  const [targetPersonaId, setTargetPersonaId] = useState("all"); // for persona-specific question gen
  const fileInputRef = useRef(null);
  const pipelineMigratedRef = useRef(false);

  // ── Enrichment elapsed timer ──
  useEffect(() => {
    if (!enrichmentLoading) return;
    const interval = setInterval(() => {
      setEnrichmentElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [enrichmentLoading]);

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
      intentType: q.intentType || null,
      personaFit: q.personaFit != null ? q.personaFit : null,
      bestPersona: q.bestPersona || null,
      volumeTier: q.volumeTier || null,
      criterion: q.criterion || null,
      enrichedAt: q.enrichedAt || null,
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
      let loadedPersonas = []; // shared with hydration block below
      try {
        // Primary: Firebase / file store (survives code changes + Vite rebuilds)
        const filePersonas = await db.getAll("m1_personas");
        // Only accept personas that have a name field (skip generic types like {id:"cio",label:"..."})
        const realPersonas = filePersonas.filter(p => p.name && p.name.length > 0);
        if (realPersonas.length > 0) {
          loadedPersonas = realPersonas;
          setPersonaProfiles(realPersonas);
          console.info(`[Personas] Loaded ${realPersonas.length} from Firebase/file store`);
          savePersonas(realPersonas).catch(() => {}); // sync to IndexedDB as secondary
          // Refresh kbStats after saving to IndexedDB
          setTimeout(async () => {
            try { setKbStats(await getKnowledgeBaseStats()); } catch {}
          }, 500);
        } else {
          // Fallback: IndexedDB (in case file store is empty)
          const idbPersonas = await getAllPersonas();
          const realIdb = idbPersonas.filter(p => p.name && p.name.length > 0);
          if (realIdb.length > 0) {
            loadedPersonas = realIdb;
            setPersonaProfiles(realIdb);
            console.info(`[Personas] Loaded ${realIdb.length} from IndexedDB`);
            realIdb.forEach(p => db.saveWithId("m1_personas", p.id, p).catch(() => {}));
          }
          // If both sources are empty, do NOT clear personaProfiles — let pipeline restore handle it
        }
      } catch (e) {
        console.warn("[Personas] Load failed:", e.message);
      }

      // 2. Hydrate from file store in background (restores data after cache clear)
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
          // Restore persona-generated question panels (survives page reload + Vite rebuilds)
          // 3-tier fallback: personaId field → targetPersona name → question ID prefix match
          const nameToPersonaId = {};
          const prefixToPersonaId = {};
          loadedPersonas.forEach(p => {
            if (p.name) nameToPersonaId[p.name.toLowerCase().trim()] = p.id;
            // Question IDs embed first 20 chars of persona ID: pq-{co}-{personaId[0:20]}-{ts}-{i}
            prefixToPersonaId[p.id.substring(0, 20)] = p.id;
          });
          const byPersona = {};
          fbQuestions.forEach(q => {
            if (q.source === "persona-research") {
              let pid = q.personaId;
              if (!pid && q.targetPersona) {
                pid = nameToPersonaId[q.targetPersona.toLowerCase().trim()];
              }
              if (!pid && q.id) {
                // Extract embedded persona ID prefix from question ID
                const pos = q.id.indexOf("persona-");
                if (pos >= 0) pid = prefixToPersonaId[q.id.substring(pos, pos + 20)];
              }
              if (pid) {
                if (!byPersona[pid]) byPersona[pid] = [];
                byPersona[pid].push({ ...q, personaId: pid });
              }
            }
          });
          if (Object.keys(byPersona).length > 0) {
            setPersonaGeneratedQs(byPersona);
          }
        }
        if (fbMacros.length > 0) {
          await hydrateMacros(fbMacros);
        }
        if (fbIntel.length > 0) {
          await hydrateCompanyIntel(fbIntel);
        }
        // Always refresh stats after hydration (personas may have been saved to IndexedDB)
        const refreshed = await getKnowledgeBaseStats();
        setKbStats(refreshed);
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

  // ── Restore decision scores from pipeline when localStorage is empty (cross-domain deploy) ──
  useEffect(() => {
    if (!pipeline._loaded) return;
    const pScores = pipeline.m1?.decisionScores;
    if (pScores && Object.keys(pScores).length > 0) {
      setDecisionScores(prev => {
        if (Object.keys(prev).length > 0) return prev; // local already has data
        try { localStorage.setItem("xt_decision_scores", JSON.stringify(pScores)); } catch {}
        return pScores;
      });
    }
  }, [pipeline._loaded]); // eslint-disable-line

  // ── Restore persona profiles from pipeline when Firebase + IndexedDB are both empty ──
  useEffect(() => {
    if (!pipeline._loaded) return;
    if (personaProfiles.length > 0) return; // already loaded
    const pProfiles = pipeline.m1?.personaProfiles;
    if (pProfiles && pProfiles.length > 0) {
      // Only restore real profiles (have name field), not generic types like {id:"cio",label:"..."}
      const realProfiles = pProfiles.filter(p => p.name && p.name.length > 0);
      if (realProfiles.length > 0) {
        setPersonaProfiles(realProfiles);
        console.info(`[Personas] Restored ${realProfiles.length} from pipeline`);
        // Also write back to IndexedDB + Firebase so future loads are instant
        savePersonas(realProfiles).catch(() => {});
        realProfiles.forEach(p => db.saveWithId("m1_personas", p.id, p).catch(() => {}));
        // Refresh kbStats after saving
        setTimeout(async () => {
          try { setKbStats(await getKnowledgeBaseStats()); } catch {}
        }, 500);
      }
    }
  }, [pipeline._loaded, personaProfiles.length]); // eslint-disable-line

  // ── Debounced sync: decision scores → pipeline (covers manual input) ──
  const scoreTimerRef = useRef(null);
  useEffect(() => {
    if (!pipeline._loaded) return;
    if (Object.keys(decisionScores).length === 0) return;
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    scoreTimerRef.current = setTimeout(() => {
      updateModule("m1", { decisionScores });
    }, 2000); // 2s debounce for manual typing
    return () => { if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current); };
  }, [decisionScores]); // eslint-disable-line

  // ── Merged questions (static + KB + AI + pipeline) with deduplication ──
  // Pipeline questions (from Firebase) are the source of truth for the full count.
  // This ensures the database always shows the complete set (e.g. 138).
  const pipelineQuestions = pipeline.m1.questions || [];

  // ── Auto-restore question bank after page refresh ──
  // generated resets to false on every reload. If the pipeline already has questions,
  // restore the bank automatically so the user doesn't have to click "Load KB" again.
  useEffect(() => {
    if (!generated && pipeline._loaded && pipelineQuestions.length > 0) {
      setGenerated(true);
      getQuestionsForCompany(company).then(cached => {
        if (cached.length > 0) setKbQuestions(cached);
      }).catch(() => {});
    }
  }, [pipeline._loaded, pipelineQuestions.length]); // eslint-disable-line
  const questions = useMemo(() => {
    if (!generated) return [];
    const seenMap = new Map(); // hash → index in merged
    const merged = [];

    // Adds a new question OR merges fields into an existing one with the same text hash.
    // mergeMetadata: fill in missing persona/stage/cluster from later tiers (e.g. static bank)
    // mergeEnrichment: always overwrite enrichment fields (personaFit, intentType, etc.) from KB
    const addQ = (q, { mergeMetadata = false, mergeEnrichment = false } = {}) => {
      const hash = questionHash(q.query);
      if (!seenMap.has(hash)) {
        seenMap.set(hash, merged.length);
        merged.push({ ...q });
      } else {
        const existing = merged[seenMap.get(hash)];
        // Always propagate id — pipeline questions often have id:undefined, later tiers restore it
        if (q.id && !existing.id) existing.id = q.id;
        // Always propagate dedupHash — needed to delete from file store (filename = dedupHash)
        if (q.dedupHash && !existing.dedupHash) existing.dedupHash = q.dedupHash;
        // Always propagate personaId — pipeline tier strips it, persona tier restores it
        if (q.personaId && !existing.personaId) existing.personaId = q.personaId;
        if (mergeMetadata) {
          if (!existing.persona && q.persona) existing.persona = q.persona;
          if (!existing.stage && q.stage) existing.stage = q.stage;
          if (!existing.cluster && q.cluster) existing.cluster = q.cluster;
          if (!existing.lifecycle && q.lifecycle) existing.lifecycle = q.lifecycle;
          if (!existing.classification && q.classification) existing.classification = q.classification;
        }
        if (mergeEnrichment) {
          if (q.personaFit != null) existing.personaFit = q.personaFit;
          if (q.bestPersona) existing.bestPersona = q.bestPersona;
          if (q.intentType) existing.intentType = q.intentType;
          if (q.volumeTier) existing.volumeTier = q.volumeTier;
          if (q.criterion) existing.criterion = q.criterion;
          if (q.enrichedAt) existing.enrichedAt = q.enrichedAt;
        }
      }
    };

    // Tier 1: Pipeline questions — source of truth for identity/ordering
    // Normalize persona: pipeline may have stored label ("General Counsel") instead of id ("gc")
    pipelineQuestions.forEach(q => addQ({
      id: q.id,
      query: q.query,
      persona: PERSONAS.find(p => p.id === q.persona || p.label === q.persona)?.id || q.persona,
      stage: q.stage,
      cluster: q.cw || q.cluster,
      lifecycle: q.lifecycle || "full-stack",
      source: q.source || "pipeline",
      classification: q.classification || "macro",
      intentType: q.intentType || null,
      personaFit: q.personaFit || null,
      bestPersona: q.bestPersona || null,
      volumeTier: q.volumeTier || null,
      criterion: q.criterion || null,
      enrichedAt: q.enrichedAt || null,
    }));

    // Tier 2: Static Q_BANK — fills missing persona/stage on pipeline questions that lost metadata
    Q_BANK.forEach((q, i) => addQ({
        id: `q-${i + 1}`,
        query: q.q.replace(/\{company\}/g, company),
        persona: q.p, stage: q.s, cluster: q.c,
        lifecycle: q.l || CLUSTER_LIFECYCLE_MAP[q.c] || "full-stack",
        source: "static", classification: "macro",
      }, { mergeMetadata: true }));

    // Tier 3: Cached KB questions — merges enrichment fields into existing questions
    kbQuestions.forEach(q => addQ(
      { ...q, source: q.source === "persona-research" ? "persona-research" : "kb" },
      { mergeMetadata: true, mergeEnrichment: true }
    ));

    // Tier 4: Fresh AI questions (generated in current session)
    aiQuestions.forEach(q => addQ(q, { mergeEnrichment: true }));

    return merged;
  }, [generated, company, aiQuestions, kbQuestions, pipelineQuestions]);

  // ── Auto-enrich after generation completes ──
  // Must live AFTER questions useMemo so questions.length is defined in the dependency array
  useEffect(() => {
    if (!autoEnrichPending || aiLoading || enrichmentLoading || questions.length === 0) return;
    setAutoEnrichPending(false);
    enrichQuestions();
  }, [autoEnrichPending, aiLoading, enrichmentLoading, questions.length]); // eslint-disable-line

  // Count questions per specific persona profile (for sub-filter in dropdown + coverage map)
  // Uses personaGeneratedQs directly — not the main questions list — so the count is accurate
  // regardless of whether persona questions are merged into the main bank.
  const profileQuestionCount = useMemo(() => {
    const counts = {};
    Object.entries(personaGeneratedQs).forEach(([pid, qs]) => {
      if (qs.length > 0) counts[pid] = qs.length;
    });
    return counts;
  }, [personaGeneratedQs]);

  const filtered = useMemo(() => {
    return questions.filter(q => {
      if (filterStage !== "all" && q.stage !== filterStage) return false;
      if (filterPersona !== "all") {
        const isPersonaType = PERSONAS.some(p => p.id === filterPersona);
        if (isPersonaType) {
          if (q.persona !== filterPersona) return false;
        } else {
          if (q.personaId !== filterPersona) return false;
        }
      }
      if (filterJurisdiction !== "all" && (q.jurisdiction || "Global") !== filterJurisdiction) return false;
      if (filterLifecycle !== "all" && (q.lifecycle || CLUSTER_LIFECYCLE_MAP[q.cluster] || "full-stack") !== filterLifecycle) return false;
      if (filterIntentType !== "all" && q.intentType !== filterIntentType) return false;
      if (filterVolumeTier !== "all" && q.volumeTier !== filterVolumeTier) return false;
      return true;
    });
  }, [questions, filterStage, filterPersona, filterJurisdiction, filterLifecycle, filterIntentType, filterVolumeTier]);

  // When a specific profile is selected in the filter, show that persona's questions
  // (they live in personaGeneratedQs, not the main bank). Otherwise show filtered bank questions.
  const displayQuestions = useMemo(() => {
    const isProfile = filterPersona !== "all" && !PERSONAS.some(p => p.id === filterPersona);
    if (isProfile) return personaGeneratedQs[filterPersona] || [];
    return filtered;
  }, [filtered, filterPersona, personaGeneratedQs]);

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
  // CLUSTER IMPORTANCE RECALIBRATION (web search)
  // ══════════════════════════════════════════════════════
  const CALIBRATION_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  const canRecalibrate = !lastCalibrated || (Date.now() - lastCalibrated > CALIBRATION_COOLDOWN_MS);

  const nextCalibrationDate = lastCalibrated
    ? new Date(lastCalibrated + CALIBRATION_COOLDOWN_MS).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const handleRecalibrate = async () => {
    if (!canRecalibrate || calibrating) return;
    setCalibrating(true);
    setCalibrationStep("Searching market data...");
    try {
      const clusterNames = CLUSTERS_META.map(c => c.name).join(", ");
      const systemPrompt = `You are a B2B SaaS market analyst specializing in Contract Lifecycle Management (CLM). You will receive a list of CLM topic clusters. For each cluster, use current web data to assess its MARKET IMPORTANCE (0-100) and TREND (rising/stable/declining).

Base your scores on:
- Search volume and buyer interest signals
- Analyst report mentions (Gartner, Forrester, IDC)
- Industry news and investment activity
- Community discussions (Reddit, LinkedIn, G2)
- Vendor marketing emphasis

Return ONLY a valid JSON array, no markdown, no explanation:
[{"name":"exact cluster name","weight":number,"trend":"rising|stable|declining","evidence":"one sentence citing specific data"}]

The weight should reflect RELATIVE importance to CLM buyers right now. The highest-demand cluster should be 90-98, the lowest 45-65. Be precise — don't cluster them all around 70-80.`;

      const userMsg = `Analyze the current market importance of these CLM topic clusters as of ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}:\n\n${clusterNames}\n\nUse web search to find current data on each cluster's demand, growth, and buyer interest in the CLM market.`;

      setCalibrationStep("Analyzing CLM market signals...");
      const raw = await callClaude(systemPrompt, userMsg, 90000);

      setCalibrationStep("Processing results...");
      // Extract JSON from response
      let parsed;
      try {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      } catch (e) {
        throw new Error("Could not parse recalibration response");
      }

      // Validate and merge — only update clusters we recognize
      const weightMap = {};
      for (const item of parsed) {
        const match = CLUSTERS_META.find(c => c.name.toLowerCase() === item.name?.toLowerCase());
        if (match && typeof item.weight === "number" && item.weight >= 0 && item.weight <= 100) {
          weightMap[match.name] = {
            weight: Math.round(item.weight),
            trend: ["rising", "stable", "declining"].includes(item.trend) ? item.trend : match.trend,
            evidence: item.evidence || "",
          };
        }
      }

      if (Object.keys(weightMap).length < 5) {
        throw new Error(`Only ${Object.keys(weightMap).length} clusters matched — expected at least 5`);
      }

      const ts = Date.now();
      const calData = { weights: weightMap, ts };
      localStorage.setItem("xt_cluster_cal", JSON.stringify(calData));
      setClusterWeights(weightMap);
      setLastCalibrated(ts);
      setCalibrationStep("");
    } catch (err) {
      console.error("[Recalibrate]", err);
      setCalibrationStep("Error: " + (err.message || "recalibration failed"));
      setTimeout(() => setCalibrationStep(""), 5000);
    } finally {
      setCalibrating(false);
    }
  };

  // Build effective cluster data (merge defaults with calibrated weights)
  const effectiveClusters = CLUSTERS_META.map(c => {
    const cal = clusterWeights?.[c.name];
    return cal ? { ...c, weight: cal.weight, trend: cal.trend, evidence: cal.evidence } : c;
  });

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

  // ── Enrich & Map Questions (retroactive classification) ──
  const enrichQuestions = async () => {
    const allQs = [...questions];
    if (allQs.length === 0) return;

    // Reset all animation state
    setEnrichmentLoading(true);
    setEnrichmentProgress({ done: 0, total: allQs.length });
    setEnrichmentStep("Preparing enrichment...");
    setEnrichmentLog([]);
    setEnrichmentStartTime(Date.now());
    setEnrichmentElapsed(0);
    setEnrichmentResult(null);
    setAiError("");

    const BATCH = 15;
    const batches = [];
    for (let i = 0; i < allQs.length; i += BATCH) batches.push(allQs.slice(i, i + BATCH));

    const allCriteria = Object.entries(DECISION_CRITERIA)
      .flatMap(([pid, crit]) => crit.map(c => `${pid}.${c.id}`)).join(", ");

    const systemPrompt = `You classify CLM buyer-intent questions. Return a JSON array. Each element has:
idx (integer), personaFit (1-10), bestPersona (gc|cpo|cio|vplo|cto|cm|pd|cfo), intentType (generic|category|vendor|decision), volumeTier (high|medium|niche), criterion (string or null).

intentType: generic=no vendor/category; category=CLM topic, no specific vendor; vendor=names a vendor; decision=comparison/ROI/evaluation
volumeTier: high=broad awareness (thousands/month); medium=category evaluation; niche=specific evaluation (dozens/month)
criterion must be one of: ${allCriteria}

Respond with ONLY a valid JSON array. No markdown, no explanation.
Example: [{"idx":0,"personaFit":7,"bestPersona":"gc","intentType":"vendor","volumeTier":"niche","criterion":"gc.playbook_enforcement"},{"idx":1,"personaFit":4,"bestPersona":"cio","intentType":"generic","volumeTier":"high","criterion":null}]`;

    const enrichmentMap = new Map();
    const now = new Date().toISOString();
    let batchErrors = 0;

    setEnrichmentStep("Mapping intent & fit scores...");
    setEnrichmentLog([`Starting ${batches.length} batches · ${allQs.length} questions total`]);

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const userMsg = batch.map((q, i) => `${i}: [${q.persona||"?"}] ${q.query}`).join("\n");

      try {
        const raw = await callClaudeFast(systemPrompt, userMsg, 3000);
        let results = Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);

        if (results.length === 0) {
          batchErrors++;
          setEnrichmentLog(prev => [...prev, `Batch ${bi + 1}/${batches.length} — empty response, retrying next`]);
        } else {
          results.forEach(r => {
            if (typeof r.idx !== "number") return;
            const q = batch[r.idx];
            if (!q) return;
            enrichmentMap.set(questionHash(q.query), {
              personaFit: typeof r.personaFit === "number" ? Math.min(10, Math.max(1, r.personaFit)) : null,
              bestPersona: r.bestPersona || q.persona,
              intentType: ["generic","category","vendor","decision"].includes(r.intentType) ? r.intentType : null,
              volumeTier: ["high","medium","niche"].includes(r.volumeTier) ? r.volumeTier : null,
              criterion: typeof r.criterion === "string" ? r.criterion : null,
              enrichedAt: now,
            });
          });
          setEnrichmentLog(prev => [...prev, `Batch ${bi + 1}/${batches.length} — ${results.length} questions classified`]);
        }
      } catch (e) {
        batchErrors++;
        setEnrichmentLog(prev => [...prev, `Batch ${bi + 1}/${batches.length} — error: ${e.message.slice(0, 60)}`]);
      }

      setEnrichmentProgress({ done: Math.min((bi + 1) * BATCH, allQs.length), total: allQs.length });
    }

    if (batchErrors === batches.length) {
      setAiError(`Enrichment failed: all ${batches.length} API calls returned no results. Check API key.`);
      setEnrichmentStep("");
      setEnrichmentLoading(false);
      setEnrichmentProgress({ done: 0, total: 0 });
      return;
    }
    if (enrichmentMap.size === 0) {
      setAiError("Enrichment returned no classifications. Try again.");
      setEnrichmentStep("");
      setEnrichmentLoading(false);
      setEnrichmentProgress({ done: 0, total: 0 });
      return;
    }

    // Phase 2: save enriched questions
    setEnrichmentStep("Filling FIT scores & criteria...");
    setEnrichmentLog(prev => [...prev, `${enrichmentMap.size} questions classified — writing to local database...`]);

    const toSave = allQs
      .map(q => {
        const hash = questionHash(q.query);
        const enrichment = enrichmentMap.get(hash);
        if (!enrichment) return null;
        return { ...q, company: q.company || company, dedupHash: q.dedupHash || hash, ...enrichment };
      })
      .filter(Boolean);

    try {
      await saveQuestions(toSave);
      setEnrichmentLog(prev => [...prev, `Saved ${toSave.length} enriched questions to local DB`]);
    } catch (saveErr) {
      setAiError(`Failed to save enriched questions: ${saveErr.message}`);
      setEnrichmentStep("");
      setEnrichmentLoading(false);
      setEnrichmentProgress({ done: 0, total: 0 });
      return;
    }

    // Phase 3: Firebase background sync
    setEnrichmentStep("Building decision matrix...");
    setEnrichmentLog(prev => [...prev, `Syncing ${toSave.length} questions to cloud...`]);

    (async () => {
      for (const q of toSave) {
        try { await db.saveWithId("m1_questions_v2", q.dedupHash, { ...q, updated_at: now }); } catch {}
        await new Promise(r => setTimeout(r, 30));
      }
      setEnrichmentLog(prev => [...prev, `Cloud sync complete`]);
    })();

    // Phase 4: reload KB and complete
    try {
      setEnrichmentLog(prev => [...prev, `Rebuilding question index...`]);
      const refreshed = await getQuestionsForCompany(company);
      setKbQuestions(refreshed);
      setEnrichmentStep("Complete");
      setEnrichmentResult({ count: toSave.length, total: allQs.length });
      setEnrichmentLog(prev => [...prev, `Done — ${toSave.length} of ${allQs.length} questions enriched`]);
      // Auto-sync enriched data to M2 pipeline so Perception Monitor gets updated questions
      setTimeout(() => exportToM2(), 500);
    } catch (e) {
      setAiError(`Enrichment saved but reload failed: ${e.message}`);
      setEnrichmentStep("");
    }

    setEnrichmentLoading(false);
    setEnrichmentProgress({ done: toSave.length, total: allQs.length });
  };

  const generateAIQuestions = async () => {
    if (isGeneratingRef.current) return; // prevent double-click / concurrent calls
    isGeneratingRef.current = true;
    setAiLoading(true);
    setAiStep(0);
    setAiCurrentPersona(null);
    // Preserve persona-research questions, clear only AI-generated ones
    setAiQuestions(prev => prev.filter(q => q.source === "persona-research"));

    try {
      const existing = await getQuestionsForCompany(company);
      const now = new Date().toISOString();
      const coKey = company.toLowerCase().replace(/\s+/g, "-");
      const activeP = PERSONAS.filter(p => activePersonas.has(p.id));
      const activeC = [...activeClusters];

      // ── SPECIFIC PERSON MODE: single call with psyche profile (unchanged behavior) ──
      const targetProfile = targetPersonaId !== "all" ? personaProfiles.find(p => p.id === targetPersonaId) : null;
      if (targetProfile && targetProfile.psycheProfile) {
        setAiCurrentPersona({ id: targetProfile.personaType, short: targetProfile.name.split(" ")[0], idx: 0, total: 1 });
        let systemPrompt = QUESTION_GEN_SYSTEM + "\n\nPERSONAS:\n" +
          activeP.map(p => `- ${p.id}: ${p.label}`).join("\n") +
          "\n\nTOPIC CLUSTERS:\n" + activeC.join(", ");
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
        if (existing.length > 0) {
          systemPrompt += "\n\nEXISTING QUESTIONS (DO NOT DUPLICATE):\n" +
            existing.slice(0, 30).map((q, i) => `${i + 1}. [${q.persona}/${q.stage}] ${q.query}`).join("\n");
        }
        let userMsg = `TARGET COMPANY: ${company}\n`;
        if (companyUrl) userMsg += `COMPANY URL: ${companyUrl}\n`;
        userMsg += `INDUSTRY: ${industry}\n\nResearch ${company} thoroughly. Generate 15-20 hyper-personalized buyer-intent questions for ${targetProfile.name}.`;
        const stepTimer = setInterval(() => setAiStep(prev => prev < 4 ? prev + 1 : prev), 10000);
        const result = await callClaude(systemPrompt, userMsg, 120000);
        clearInterval(stepTimer);
        setAiStep(5);
        const newQs = (result.questions || []).map((q, i) => ({
          id: `ai-${coKey}-${targetProfile.personaType}-${Date.now()}-${i}`,
          query: q.q, persona: q.p || targetProfile.personaType, stage: q.s, cluster: q.c,
          lifecycle: q.l || CLUSTER_LIFECYCLE_MAP[q.c] || "full-stack",
          source: "ai", classification: verifyClassification(q, company),
          company, companyUrl, generatedAt: now,
          searchContext: q.context || "", confidence: q.confidence || 0.85,
          dedupHash: questionHash(q.q), targetPersona: targetProfile.name,
        }));
        await saveQuestions(newQs);
        if (result.companyIntel) { await saveCompanyIntel({ companyKey: coKey, companyName: company, url: companyUrl, industry, lastResearchedAt: now, ...result.companyIntel }); setCompanyIntel(result.companyIntel); }
        (async () => { for (const q of newQs) { try { await db.saveWithId("m1_questions_v2", q.dedupHash, { ...q, updated_at: now }); } catch {} await new Promise(r => setTimeout(r, 50)); } })();
        setAiStep(6);
        setAiQuestions(newQs);
        setSelectedQs(prev => { const next = new Set(prev); newQs.forEach(q => next.add(q.id)); return next; });
        const stats = await getKnowledgeBaseStats(); setKbStats(stats);
        setCreditsUsed(prev => prev + 0.08);
        setAutoEnrichPending(true); // auto-trigger enrichment after single-persona generation
        return;
      }

      // ── PER-PERSONA MODE: 1 API call per persona, each from their own cognitive lens ──
      setAiStep(1);
      let allNewQs = [];
      let companyIntelSaved = false;

      for (let pi = 0; pi < activeP.length; pi++) {
        const persona = activeP[pi];
        const ctx = PERSONA_CONTEXTS[persona.id];
        if (!ctx) continue;

        setAiCurrentPersona({ id: persona.id, short: persona.short, idx: pi, total: activeP.length });

        // Inject researched profile if one exists for this persona type
        const matchedProfile = personaProfiles.find(p => p.personaType === persona.id && p.psycheProfile);

        const systemPrompt = buildPersonaQuestionPrompt(ctx, persona, activeC, company, existing, allNewQs, matchedProfile);
        const userMsg = `TARGET COMPANY: ${company}
COMPANY URL: ${companyUrl || ""}
INDUSTRY: ${industry}
PERSONA: ${persona.label}

Research ${company} and generate exactly 12 buyer-intent questions from the authentic mindset of a ${ctx.title}.
${!companyIntelSaved ? "Include companyIntel in your response." : "Omit companyIntel field (already captured)."}`;

        const result = await callClaude(systemPrompt, userMsg, 90000);

        const personaQs = (result.questions || []).map((q, i) => ({
          id: `ai-${coKey}-${persona.id}-${Date.now()}-${i}`,
          query: q.q,
          persona: persona.id,
          stage: q.s,
          cluster: q.c,
          lifecycle: q.l || CLUSTER_LIFECYCLE_MAP[q.c] || "full-stack",
          source: "ai",
          classification: verifyClassification(q, company),
          company, companyUrl, generatedAt: now,
          searchContext: q.context || "",
          confidence: q.confidence || 0.85,
          dedupHash: questionHash(q.q),
          targetPersona: matchedProfile ? matchedProfile.name : null,
        }));

        allNewQs = [...allNewQs, ...personaQs];

        // Capture company intel from whichever persona call returns it first
        if (!companyIntelSaved && result.companyIntel) {
          const intel = { companyKey: coKey, companyName: company, url: companyUrl, industry, lastResearchedAt: now, ...result.companyIntel };
          await saveCompanyIntel(intel);
          setCompanyIntel(intel);
          companyIntelSaved = true;
        }
      }

      setAiCurrentPersona(null);
      setAiStep(5);
      await saveQuestions(allNewQs);

      // Background Firebase sync
      (async () => {
        for (const q of allNewQs) {
          try { await db.saveWithId("m1_questions_v2", q.dedupHash, { ...q, updated_at: now }); } catch {}
          await new Promise(r => setTimeout(r, 50));
        }
        for (const q of allNewQs.filter(q => q.classification === "macro")) {
          try { await db.saveWithId("m1_macros", q.dedupHash, { ...q, updated_at: now }); } catch {}
        }
      })();

      setAiStep(6);
      setAiQuestions(allNewQs);
      setSelectedQs(prev => { const next = new Set(prev); allNewQs.forEach(q => next.add(q.id)); return next; });

      const stats = await getKnowledgeBaseStats();
      setKbStats(stats);
      setCreditsUsed(prev => prev + 0.08 * activeP.length);
      setAutoEnrichPending(true); // auto-trigger Intent/Fit/Criterion mapping after generation

    } catch (err) {
      setAiError(err.message);
      setAiStep(0);
    } finally {
      isGeneratingRef.current = false;
      setAiLoading(false);
      setAiCurrentPersona(null);
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
      db.saveWithId("m1_personas", persona.id, persona).catch(() => {});
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
        personas.forEach(p => db.saveWithId("m1_personas", p.id, p).catch(() => {}));
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
      db.saveWithId("m1_personas", persona.id, persona).catch(() => {});
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
          setPersonaGeneratedQs(prev => ({ ...prev, [persona.id]: autoQs }));
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
    setImportError(""); // clear any stale error before new research run

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
      db.saveWithId("m1_personas", personaId, { ...personaProfiles.find(p => p.id === personaId), ...updates }).catch(() => {});
      setPersonaProfiles(prev => prev.map(p => p.id === personaId ? { ...p, ...updates } : p));
      setCreditsUsed(prev => prev + 0.08);

      // ── AUTO-GENERATE QUESTIONS FROM PAIN POINTS ──
      if (updates.painPoints && updates.painPoints.length > 0) {
        // Check if this persona already has questions — don't regenerate
        const existingPersonaQs = questions.filter(q => q.personaId === personaId);
        if (existingPersonaQs.length > 0) {
          setPersonaGeneratedQs(prev => ({ ...prev, [personaId]: existingPersonaQs }));
          setAutoGenMsg(`\u2713 ${existingPersonaQs.length} existing questions for ${persona.name}`);
          setTimeout(() => setAutoGenMsg(""), 5000);
        } else {
          setResearchStep(4);
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
            setPersonaGeneratedQs(prev => ({ ...prev, [personaId]: autoQs }));
            setAutoGenMsg(`\u2713 ${autoQs.length} questions generated from ${persona.name}'s pain points`);
            setTimeout(() => setAutoGenMsg(""), 8000);
          }
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

  // ── Question Cleanup ──
  const handleQuestionCleanup = async () => {
    if (questions.length === 0) return;
    setCleanupLoading(true);
    setCleanupPreview(null);
    try {
      const qList = questions.map((q, i) => `${i + 1}. [ID:${q.id}] [${q.persona?.toUpperCase() || "?"}] [${q.stage || "?"}] ${q.query}`).join("\n");
      const result = await callClaudeFast(QUESTION_CLEANUP_PROMPT, `QUESTION BANK (${questions.length} questions):\n\n${qList}`, 4000);
      setCleanupPreview(result);
    } catch (e) {
      console.warn("[Cleanup]", e.message);
    }
    setCleanupLoading(false);
  };

  const applyCleanup = async () => {
    if (!cleanupPreview?.groups?.length) return;
    const removeIds = new Set(cleanupPreview.groups.flatMap(g => g.remove.map(r => r.id)));
    const removedQs = questions.filter(q => removeIds.has(q.id));
    const kept = questions.filter(q => !removeIds.has(q.id));

    // 1. Update pipeline state (in-memory + debounced file save via PipelineContext)
    updateModule("m1", { questions: kept });

    // 2. Update in-memory question states so UI reflects change immediately
    setAiQuestions(prev => prev.filter(q => !removeIds.has(q.id)));
    setKbQuestions(prev => prev.filter(q => !removeIds.has(q.id)));
    setPersonaGeneratedQs(prev => {
      const updated = {};
      Object.entries(prev).forEach(([pid, qs]) => {
        const remaining = qs.filter(q => !removeIds.has(q.id));
        if (remaining.length > 0) updated[pid] = remaining;
      });
      return updated;
    });

    // 3. Delete removed questions from IndexedDB (saveQuestions only puts — never deletes)
    const removeIdList = removedQs.map(q => q.id).filter(Boolean);
    await deleteQuestions(removeIdList);

    // 4. Re-save kept list so IndexedDB is consistent
    await saveQuestions(kept);

    // 5. Delete removed questions from file store so they don't re-hydrate on next reload
    // File store keys are dedupHashes (base36), not question IDs — compute if needed
    removedQs.forEach(q => {
      const fileKey = q.dedupHash || (q.query ? questionHash(q.query) : null);
      if (fileKey) db.delete("m1_questions_v2", fileKey).catch(() => {});
    });

    setCleanupPreview(null);
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
      persona: q.persona,  // keep as id (gc/cpo/etc), not label — label lookup on read
      stage: q.stage,
      query: q.query,
      cluster: q.cluster,
      source: q.source,
      classification: q.classification,
      lifecycle: q.lifecycle || CLUSTER_LIFECYCLE_MAP[q.cluster] || "full-stack",
      intentType: q.intentType || null,
      personaFit: q.personaFit != null ? q.personaFit : null,
      bestPersona: q.bestPersona || null,
      volumeTier: q.volumeTier || null,
      criterion: q.criterion || null,
      enrichedAt: q.enrichedAt || null,
    }));
    updateModule("m1", {
      questions: exportQs,
      personas: [...activePersonas],
      clusters: [...activeClusters],
      generatedAt: new Date().toISOString(),
      // Phase 3: Generation tracking — downstream modules (M2, M3) use this to detect staleness
      generationId: new Date().toISOString(),
      aiGenerated: sourceCounts.ai,
      kbLoaded: sourceCounts.kb,
      companyIntel: companyIntel,
      // Decision scores — persist to pipeline so they survive cross-domain deploy
      decisionScores: decisionScores,
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

  // ── Find Similar Decision Makers ──
  const handleFindSimilar = async (personaId) => {
    const persona = personaProfiles.find(p => p.id === personaId);
    if (!persona) return;
    setFindSimilarId(personaId);
    setFindSimilarLoading(true);
    setFindSimilarResults(prev => ({ ...prev, [personaId]: [] }));
    try {
      const userMsg = `SOURCE DECISION MAKER:
Name: ${persona.name} | Title: ${persona.title} | Company: ${persona.company}
URL: ${persona.companyUrl || ""} | Industry: ${industry} | Location: ${persona.location || "Unknown"}
CLM Readiness: ${persona.clmReadiness != null ? persona.clmReadiness + "/10" : "Unknown"}

SUMMARY: ${persona.researchSummary || "N/A"}
WEB SIGNALS: ${(persona.webFindings || []).slice(0, 5).join(" | ") || "None"}
PAIN POINTS: ${(persona.painPoints || []).slice(0, 3).map(pp => pp.pain).join("; ") || "None"}

Find 8-10 decision makers at companies similar to ${persona.company}. Cover different CLM buyer roles.`;
      const result = await callClaude(FIND_SIMILAR_PROMPT, userMsg, 60000);
      setFindSimilarResults(prev => ({ ...prev, [personaId]: result.suggestions || [] }));
    } catch (e) {
      console.warn("[FindSimilar]", e.message);
    }
    setFindSimilarLoading(false);
  };

  // ── Import + auto-research a single row from Find Similar results ──
  const handleSimilarRowImport = async (rowKey, pasteText, suggestion) => {
    setSimilarRowStates(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], loading: true, error: null, step: "Parsing\u2026" } }));
    try {
      const now = new Date().toISOString();
      let cleaned = null;
      if (pasteText && pasteText.trim().length > 50) {
        cleaned = await callClaudeFast(LINKEDIN_CLEANUP_PROMPT, pasteText.trim(), 8000);
      }
      const name = cleaned?.name || suggestion.name;
      const title = cleaned?.title || suggestion.title;
      const coName = cleaned?.company || suggestion.company;
      const pid = `persona-${coName.toLowerCase().replace(/\s+/g, "-")}-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const persona = {
        id: pid, personaType: detectPersonaType(title), name, title,
        company: coName, companyUrl: cleaned?.companyUrl || suggestion.companyUrl || "",
        location: cleaned?.location || suggestion.location || "",
        linkedinUrl: cleaned?.linkedinUrl || suggestion.linkedinUrl || "",
        headline: cleaned?.headline || "", about: cleaned?.about || "",
        experience: cleaned?.experience || [], education: cleaned?.education || [],
        skillsTop: cleaned?.skillsTop || [], rawLinkedinText: pasteText || "",
        cleanedProfile: cleaned, source: pasteText ? "linkedin-paste" : "find-similar",
        createdAt: now, updatedAt: now, researchedAt: null,
      };
      await savePersona(persona);
      db.saveWithId("m1_personas", pid, persona).catch(() => {});
      setPersonaProfiles(prev => [persona, ...prev]);

      setSimilarRowStates(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], step: "Researching\u2026" } }));
      const ctx = cleaned
        ? `Name: ${name}\nTitle: ${title}\nCompany: ${coName}\nAbout: ${cleaned.about || ""}\nExperience: ${(cleaned.experience || []).slice(0, 2).map(e => `${e.title || ""} at ${e.company || ""}`).join("; ")}`
        : `Name: ${name}\nTitle: ${title}\nCompany: ${coName}\nLocation: ${suggestion.location || ""}\nCLM Signals: ${suggestion.clmSignals || ""}`;
      const res = await callClaude(PERSONA_RESEARCH_PROMPT, ctx, 90000);
      const updates = {
        researchSummary: res.researchSummary || "", psycheProfile: res.psycheProfile || null,
        painPoints: res.painPoints || [], priorities: res.priorities || [],
        clmReadiness: res.clmReadiness || null, webFindings: res.webFindings || [],
        researchedAt: now,
      };
      await updatePersona(pid, updates);
      db.saveWithId("m1_personas", pid, { ...persona, ...updates }).catch(() => {});
      setPersonaProfiles(prev => prev.map(p => p.id === pid ? { ...p, ...updates } : p));
      setCreditsUsed(prev => prev + 0.09);

      // Auto-generate questions from pain points (same as Research flow)
      if (updates.painPoints && updates.painPoints.length > 0) {
        setSimilarRowStates(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], step: "Generating questions\u2026" } }));
        try {
          const fullPersona = { ...persona, ...updates };
          const autoQs = await generateQuestionsFromPainPoints(fullPersona);
          if (autoQs.length > 0) {
            setPersonaGeneratedQs(prev => ({ ...prev, [pid]: autoQs }));
          }
        } catch (qErr) {
          console.warn("[SimilarRowImport] question gen failed:", qErr.message);
        }
      }

      setSimilarRowStates(prev => ({ ...prev, [rowKey]: { expanded: false, loading: false, done: true, error: null } }));
    } catch (e) {
      setSimilarRowStates(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], loading: false, error: e.message } }));
    }
  };

  // ── Auto-grade Sirion scores from M2 scan results ──
  // Matches scan results to criteria via: (1) question criterion tag, (2) query text match, (3) per-persona average fallback.
  const handleAutoGrade = async () => {
    setAutoGrading(true);
    try {
      const scanResults = await db.getAllPaginated("m2_scan_results");
      if (scanResults.length === 0) { setAutoGrading(false); return; }

      // Normalize persona labels to IDs
      const LABEL_TO_ID = {
        "general counsel": "gc", "gc": "gc",
        "chief procurement officer": "cpo", "cpo": "cpo",
        "chief information officer": "cio", "cio": "cio",
        "vp legal operations": "vplo", "vplo": "vplo", "vp legal ops": "vplo",
        "vp it / cto": "cto", "cto": "cto",
        "contract manager": "cm", "cm": "cm",
        "procurement director": "pd", "pd": "pd",
        "cfo": "cfo", "chief financial officer": "cfo",
      };

      // Build: queryText → avg positioning, persona → [positioning scores]
      const queryScore = {};
      const personaScoreList = {};

      scanResults.forEach(r => {
        if (!r.analyses) return;
        const positions = Object.values(r.analyses)
          .filter(a => a && !a._error && typeof a.positioning === "number" && a.positioning > 0)
          .map(a => a.positioning);
        if (positions.length === 0) return;
        const avg = positions.reduce((s, p) => s + p, 0) / positions.length;

        if (r.query) queryScore[r.query.toLowerCase().trim()] = avg;

        const pid = LABEL_TO_ID[(r.persona || "").toLowerCase().trim()];
        if (pid) {
          if (!personaScoreList[pid]) personaScoreList[pid] = [];
          personaScoreList[pid].push(avg);
        }
      });

      // Per-persona average (fallback when no question-level match)
      const personaAvg = {};
      Object.keys(personaScoreList).forEach(pid => {
        const arr = personaScoreList[pid];
        personaAvg[pid] = arr.reduce((s, v) => s + v, 0) / arr.length;
      });

      const newScores = { ...decisionScores };
      let scoredCount = 0;

      PERSONAS.forEach(persona => {
        (DECISION_CRITERIA[persona.id] || []).forEach(c => {
          const key = `${persona.id}.${c.id}`;

          // Try 1: questions tagged with this criterion key → match their query text to scan results
          const taggedQs = questions.filter(q => q.criterion === key);
          if (taggedQs.length > 0) {
            const scores = taggedQs.map(q => queryScore[q.query?.toLowerCase().trim()]).filter(s => s != null);
            if (scores.length > 0) {
              newScores[key] = Math.max(1, Math.min(10, Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)));
              scoredCount++;
              return;
            }
          }

          // Try 2: all questions for this persona → match their query text to scan results
          const personaQs = questions.filter(q => q.persona === persona.id);
          if (personaQs.length > 0) {
            const scores = personaQs.map(q => queryScore[q.query?.toLowerCase().trim()]).filter(s => s != null);
            if (scores.length > 0) {
              newScores[key] = Math.max(1, Math.min(10, Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)));
              scoredCount++;
              return;
            }
          }

          // Try 3: persona-level average from scan results
          if (personaAvg[persona.id] != null) {
            newScores[key] = Math.max(1, Math.min(10, Math.round(personaAvg[persona.id])));
            scoredCount++;
          }
        });
      });

      setDecisionScores(newScores);
      try { localStorage.setItem("xt_decision_scores", JSON.stringify(newScores)); } catch {}
      // Persist to pipeline so scores survive cross-domain deploy
      updateModule("m1", { decisionScores: newScores });
      setAutoGradeSource({ scoredAt: new Date().toLocaleTimeString(), count: scoredCount });
    } catch (e) {
      console.warn("[AutoGrade] failed:", e.message);
    }
    setAutoGrading(false);
  };

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
        <button onClick={() => setActiveTab("matrix")} style={tabBtn("matrix")}>
          Decision Matrix
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
            {PERSONAS.map(p => {
              const on = activePersonas.has(p.id);
              return (
                <button key={p.id} onClick={() => togglePersona(p.id)} title={p.desc} style={{
                  padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12,
                  background: on ? (t.mode === "dark" ? "rgba(167,139,250,0.1)" : "rgba(124,58,237,0.06)") : "transparent",
                  border: `1px solid ${on ? t.brand + "40" : t.border}`,
                  transition: "all 0.15s",
                }}>
                  <img src={p.avatar} alt={p.short} style={{
                    width: 42, height: 42, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                    border: `2px solid ${on ? t.brand + "60" : t.border}`,
                    filter: on ? "none" : "grayscale(0.4) opacity(0.75)",
                    transition: "all 0.2s",
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: on ? t.text : t.textDim, lineHeight: 1.2 }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: t.textGhost, marginTop: 2, fontFamily: "var(--mono)" }}>{p.short}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Topic Clusters — Bubble Chart */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <label style={{ ...label, marginBottom: 0 }}>Topic Clusters ({activeClusters.size} selected)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {lastCalibrated && (
                <span style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)" }}>
                  Calibrated {new Date(lastCalibrated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              <button onClick={handleRecalibrate} disabled={!canRecalibrate || calibrating}
                style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: 0.5,
                  padding: "5px 12px", borderRadius: 6, border: "none", cursor: canRecalibrate && !calibrating ? "pointer" : "default",
                  background: canRecalibrate && !calibrating
                    ? "linear-gradient(135deg, #818cf8, #6366f1)"
                    : (t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"),
                  color: canRecalibrate && !calibrating ? "#fff" : t.textGhost,
                  opacity: canRecalibrate && !calibrating ? 1 : 0.5,
                  transition: "all 0.2s",
                  boxShadow: canRecalibrate && !calibrating ? "0 2px 8px rgba(99,102,241,0.3)" : "none",
                }}>
                {calibrating ? calibrationStep || "Calibrating..." : canRecalibrate ? "Recalibrate Importance" : `Next: ${nextCalibrationDate}`}
              </button>
            </div>
          </div>
          {(() => {
            const W = 800, H = 400;
            const sorted = [...effectiveClusters].sort((a, b) => b.weight - a.weight);
            const wMin = Math.min(...sorted.map(c => c.weight));
            const wMax = Math.max(...sorted.map(c => c.weight));
            const minR = 44, maxR = 82;
            const bubbles = sorted.map(c => ({
              ...c, r: minR + ((c.weight - wMin) / (wMax - wMin || 1)) * (maxR - minR),
            }));
            // Force-relaxation packing: place all, then push apart iteratively
            const placed = [];
            const pad = 8;
            // Initial placement: distribute across width with jitter
            const cols = Math.ceil(Math.sqrt(bubbles.length * (W / H)));
            const rows = Math.ceil(bubbles.length / cols);
            bubbles.forEach((b, i) => {
              const col = i % cols, row = Math.floor(i / cols);
              const cellW = W / cols, cellH = H / rows;
              b.cx = cellW * (col + 0.5) + (Math.sin(i * 7.3) * cellW * 0.15);
              b.cy = cellH * (row + 0.5) + (Math.cos(i * 5.1) * cellH * 0.15);
              b.cx = Math.max(b.r + pad, Math.min(W - b.r - pad, b.cx));
              b.cy = Math.max(b.r + pad, Math.min(H - b.r - pad, b.cy));
            });
            // Relaxation: push overlapping circles apart, pull toward center gently
            for (let iter = 0; iter < 120; iter++) {
              bubbles.forEach((a, i) => {
                let fx = 0, fy = 0;
                bubbles.forEach((b, j) => {
                  if (i === j) return;
                  const dx = a.cx - b.cx, dy = a.cy - b.cy;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const minDist = a.r + b.r + pad;
                  if (dist < minDist) {
                    const push = (minDist - dist) * 0.35;
                    fx += (dx / dist) * push;
                    fy += (dy / dist) * push;
                  }
                });
                // Gentle gravity toward center
                fx += (W / 2 - a.cx) * 0.003;
                fy += (H / 2 - a.cy) * 0.004;
                a.cx += fx; a.cy += fy;
                a.cx = Math.max(a.r + pad, Math.min(W - a.r - pad, a.cx));
                a.cy = Math.max(a.r + pad, Math.min(H - a.r - pad, a.cy));
              });
            }
            // Word-wrap: try font size, if all words fit in 3 lines keep it, else shrink
            const wrapText = (name, r) => {
              const words = name.split(" ");
              const tryWrap = (fs) => {
                const charW = fs * 0.52;
                const maxChars = Math.floor((r * 1.6) / charW);
                const lines = [];
                let cur = "";
                words.forEach(w => {
                  if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
                  else { if (cur) lines.push(cur); cur = w; }
                });
                if (cur) lines.push(cur);
                return lines;
              };
              // Try preferred size first, shrink if >3 lines
              const pref = r >= 65 ? 10 : r >= 50 ? 9 : 8;
              let lines = tryWrap(pref);
              let fontSize = pref;
              if (lines.length > 3) { fontSize = pref - 1.5; lines = tryWrap(fontSize); }
              if (lines.length > 3) { fontSize = pref - 2.5; lines = tryWrap(fontSize); }
              return { lines: lines.slice(0, 4), fontSize };
            };
            const hb = hoveredBubble ? bubbles.find(b => b.name === hoveredBubble) : null;
            return (
              <div style={{ width: "100%", marginBottom: 20, position: "relative" }}>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}
                  onMouseLeave={() => setHoveredBubble(null)}>
                  <defs>
                    {bubbles.map(b => (
                      <clipPath key={`clip-${b.name}`} id={`bclip-${b.name.replace(/[^a-z0-9]/gi, "")}`}>
                        <circle cx={b.cx} cy={b.cy} r={b.r - 4} />
                      </clipPath>
                    ))}
                  </defs>
                  <style>{`
                    @keyframes bripple { 0% { transform: scale(0.8); opacity: 0.6; } 100% { transform: scale(1.4); opacity: 0; } }
                    .bubble-g .bubble-ring { transform-origin: center; transform-box: fill-box; }
                    .bubble-g:hover .bubble-ring { animation: bripple 0.6s ease-out; }
                    .bubble-g:hover .bubble-main { filter: brightness(1.2); transition: filter 0.15s; }
                  `}</style>
                  {bubbles.map(b => {
                    const on = activeClusters.has(b.name);
                    const { lines, fontSize } = wrapText(b.name, b.r);
                    const clipId = `bclip-${b.name.replace(/[^a-z0-9]/gi, "")}`;
                    const baseColor = b.color;
                    const fillColor = on
                      ? baseColor + (t.mode === "dark" ? "22" : "18")
                      : (t.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)");
                    const strokeColor = on ? baseColor + "90" : (t.mode === "dark" ? baseColor + "30" : baseColor + "20");
                    const textColor = on ? (t.mode === "dark" ? "#fff" : "#1e1b4b") : t.textDim;
                    const lineH = fontSize + 2.5;
                    const textBlockH = lines.length * lineH;
                    const textStartY = b.cy - textBlockH / 2 + fontSize * 0.35;
                    return (
                      <g key={b.name} className="bubble-g" onClick={() => toggleCluster(b.name)}
                        onMouseEnter={() => setHoveredBubble(b.name)} style={{ cursor: "pointer" }}>
                        <circle cx={b.cx} cy={b.cy} r={b.r} className="bubble-main" fill={fillColor} stroke={strokeColor}
                          strokeWidth={on ? 1.5 : 0.8} opacity={on ? 1 : 0.7}
                          style={{ transition: "all 0.25s ease" }} />
                        <circle className="bubble-ring" cx={b.cx} cy={b.cy} r={b.r}
                          fill="none" stroke={baseColor} strokeWidth={1} opacity={0} />
                        {on && <circle cx={b.cx} cy={b.cy} r={b.r + 3} fill="none" stroke={baseColor + "20"}
                          strokeWidth={0.5} style={{ transition: "all 0.25s" }} />}
                        <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
                          {lines.map((ln, i) => (
                            <text key={i} x={b.cx} y={textStartY + i * lineH}
                              textAnchor="middle" dominantBaseline="central"
                              fill={textColor} fontSize={fontSize} fontWeight={500}
                              fontFamily="var(--mono)" opacity={on ? 1 : 0.7}>
                              {ln}
                            </text>
                          ))}
                        </g>
                        {b.trend === "rising" && (
                          <g style={{ pointerEvents: "none" }}>
                            <circle cx={b.cx + b.r * 0.55} cy={b.cy - b.r * 0.55} r={b.r >= 60 ? 10 : 8}
                              fill={on ? "#059669" : (t.mode === "dark" ? "#064e3b" : "#d1fae5")}
                              stroke={on ? "#34d39960" : "#34d39930"} strokeWidth={1} />
                            <text x={b.cx + b.r * 0.55} y={b.cy - b.r * 0.55 + 0.5}
                              textAnchor="middle" dominantBaseline="central"
                              fill={on ? "#ecfdf5" : "#6ee7b780"} fontSize={b.r >= 60 ? 11 : 9} fontWeight={900}>
                              {"\u2191"}
                            </text>
                          </g>
                        )}
                        <text x={b.cx} y={b.cy + b.r * 0.6} textAnchor="middle" dominantBaseline="central"
                          fill={on ? baseColor : baseColor + "50"} fontSize={7} fontWeight={500}
                          fontFamily="var(--mono)" style={{ pointerEvents: "none" }}
                          clipPath={`url(#${clipId})`}>
                          {b.weight}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                {/* Styled tooltip */}
                {hb && (() => {
                  const pctX = (hb.cx / W) * 100;
                  const pctY = (hb.cy / H) * 100;
                  const onRight = pctX < 55;
                  return (
                    <div style={{
                      position: "absolute", top: `${pctY}%`,
                      ...(onRight ? { left: `${pctX + 6}%` } : { right: `${100 - pctX + 6}%` }),
                      transform: "translateY(-50%)", zIndex: 20, pointerEvents: "none",
                      background: t.mode === "dark" ? "rgba(15,15,30,0.95)" : "rgba(255,255,255,0.97)",
                      border: `1px solid ${hb.color}40`, borderRadius: 10,
                      padding: "12px 16px", maxWidth: 260, minWidth: 180,
                      boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${hb.color}15`,
                      backdropFilter: "blur(12px)", animation: "fadeUp 0.15s ease",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: hb.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.text, fontFamily: "var(--mono)" }}>{hb.name}</span>
                        {hb.trend === "rising" && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", fontFamily: "var(--mono)",
                            background: "rgba(74,222,128,0.1)", padding: "1px 6px", borderRadius: 6 }}>RISING</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: t.textDim, lineHeight: 1.5, marginBottom: 8 }}>{hb.desc}</div>
                      <div style={{ fontSize: 10, color: hb.color, lineHeight: 1.4, fontStyle: "italic" }}>{hb.why}</div>
                      {hb.evidence && (
                        <div style={{ fontSize: 9, color: t.textGhost, lineHeight: 1.4, marginTop: 4, borderTop: `1px solid ${t.border}`, paddingTop: 4 }}>
                          {hb.evidence}
                        </div>
                      )}
                      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)" }}>IMPORTANCE</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 48, height: 4, borderRadius: 2, background: t.border, overflow: "hidden" }}>
                            <div style={{ width: `${hb.weight}%`, height: "100%", borderRadius: 2, background: hb.color }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: hb.color, fontFamily: "var(--mono)" }}>{hb.weight}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

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

          {/* ── Enrichment animated panel ── */}
          {(enrichmentLoading || enrichmentResult) && (() => {
            const PHASES = ["Mapping intent & fit scores...", "Filling FIT scores & criteria...", "Building decision matrix...", "Complete"];
            const currentPhaseIdx = PHASES.indexOf(enrichmentStep);
            const pct = enrichmentProgress.total > 0 ? enrichmentProgress.done / enrichmentProgress.total : (enrichmentStep === "Complete" ? 1 : 0);
            const R = 38;
            const CIRC = 2 * Math.PI * R;
            const isComplete = enrichmentStep === "Complete";
            const mm = Math.floor(enrichmentElapsed / 60).toString().padStart(2, "0");
            const ss = (enrichmentElapsed % 60).toString().padStart(2, "0");
            return (
              <div style={{
                background: t.bgCard, border: `1px solid ${isComplete ? "#4ade8040" : "#fbbf2440"}`,
                borderRadius: 12, padding: "20px 24px", marginBottom: 16, animation: "fadeUp 0.3s ease",
                transition: "border-color 0.5s ease",
              }}>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

                  {/* Circular progress ring */}
                  <div style={{ flexShrink: 0, position: "relative", width: 88, height: 88 }}>
                    <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="44" cy="44" r={R} fill="none" stroke={t.border} strokeWidth="6" />
                      <circle
                        cx="44" cy="44" r={R} fill="none"
                        stroke={isComplete ? "#4ade80" : "#fbbf24"}
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={CIRC * (1 - pct)}
                        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      {isComplete ? (
                        <div style={{ fontSize: 24, color: "#4ade80" }}>✓</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "#fbbf24", fontFamily: "var(--mono)", lineHeight: 1 }}>
                            {Math.round(pct * 100)}%
                          </div>
                          <div style={{ fontSize: 9, color: t.textDim, fontFamily: "var(--mono)", marginTop: 3 }}>
                            {enrichmentProgress.done}/{enrichmentProgress.total}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: label + phases + log */}
                  <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Title row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      {!isComplete && (
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fbbf24", animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, fontFamily: "var(--mono)", color: isComplete ? "#4ade80" : "#fbbf24" }}>
                        {enrichmentStep || "Enriching questions..."}
                      </span>
                      <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)", marginLeft: "auto" }}>
                        {mm}:{ss}
                      </span>
                    </div>

                    {/* Phase progress strips */}
                    <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
                      {PHASES.map((phase, i) => {
                        const done = isComplete || currentPhaseIdx > i;
                        const active = currentPhaseIdx === i && !isComplete;
                        return (
                          <div key={phase} title={phase} style={{
                            flex: 1, height: 4, borderRadius: 2,
                            background: done ? (isComplete && i === PHASES.length - 1 ? "#4ade80" : "#fbbf24") : active ? "#fbbf2466" : t.border,
                            transition: "background 0.4s ease",
                          }} />
                        );
                      })}
                    </div>

                    {/* Running log */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 90, overflowY: "auto" }}>
                      {enrichmentLog.slice(-6).map((line, i) => (
                        <div key={i} style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)", lineHeight: 1.5 }}>
                          <span style={{ color: "#fbbf2460", marginRight: 6 }}>›</span>{line}
                        </div>
                      ))}
                    </div>

                    {/* Completion result */}
                    {enrichmentResult && (
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "#4ade80", fontFamily: "var(--mono)", fontWeight: 600 }}>
                          ✓ {enrichmentResult.count} of {enrichmentResult.total} questions enriched — Intent · Fit · Criterion mapped
                        </span>
                        <button onClick={() => setEnrichmentResult(null)} style={{
                          marginLeft: "auto", fontSize: 11, color: t.textDim, background: "none",
                          cursor: "pointer", fontFamily: "var(--mono)", padding: "2px 8px",
                          borderRadius: 4, border: `1px solid ${t.border}`,
                        }}>Dismiss</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

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
            {generated && questions.length > 0 && (
              <button
                onClick={enrichQuestions}
                disabled={enrichmentLoading || aiLoading}
                title="Map all questions to personas, intent types, and decision criteria using AI. Runs automatically after generation."
                style={{
                  padding: "12px 20px", borderRadius: 8,
                  cursor: (enrichmentLoading || aiLoading) ? "not-allowed" : "pointer",
                  background: "transparent", border: `1px solid #fbbf2440`, color: "#fbbf24",
                  fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", textTransform: "uppercase",
                  letterSpacing: 1, opacity: (enrichmentLoading || aiLoading) ? 0.4 : 1, transition: "all 0.2s",
                }}>
                {enrichmentLoading ? "Mapping\u2026" : autoEnrichPending ? "Auto-mapping\u2026" : "\u2728 Re-enrich"}
              </button>
            )}
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
                  ~${(0.08 * (activePersonas.size || 1)).toFixed(2)} estimated
                </span>
              </div>
              {aiCurrentPersona ? (
                <>
                  <div style={{ fontSize: 12, color: t.brand, fontWeight: 600, fontFamily: "var(--mono)" }}>
                    Generating {aiCurrentPersona.short} questions...
                  </div>
                  <div style={{ fontSize: 11, color: t.textSec, marginTop: 4, fontFamily: "var(--mono)" }}>
                    {aiCurrentPersona.idx + 1} of {aiCurrentPersona.total} personas
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 4, borderRadius: 2, background: t.border, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${((aiCurrentPersona.idx + 1) / aiCurrentPersona.total) * 100}%`,
                        background: t.brand, transition: "width 0.5s ease", borderRadius: 2,
                      }} />
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: t.brand, fontFamily: "var(--mono)" }}>{AI_STEPS[aiStep]}</div>
              )}
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
                  {PERSONAS.filter(p => activePersonas.has(p.id)).map(p => {
                    const profilesWithQs = personaProfiles
                      .filter(pp => pp.personaType === p.id && (profileQuestionCount[pp.id] || 0) > 0)
                      .sort((a, b) => (profileQuestionCount[b.id] || 0) - (profileQuestionCount[a.id] || 0));
                    const isActive = filterPersona === p.id;
                    return (
                      <div key={p.id}
                        onClick={() => setFilterPersona(isActive ? "all" : p.id)}
                        style={{
                          background: isActive ? t.brand + "10" : t.bgCard,
                          padding: 12, textAlign: "center", cursor: "pointer",
                          outline: isActive ? `1px solid ${t.brand}40` : "none",
                          transition: "background 0.15s",
                        }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: isActive ? t.brand : t.client, fontFamily: "var(--mono)" }}>
                          {personaCount[p.id] || 0}
                        </div>
                        <div style={{ fontSize: 11, color: isActive ? t.brand : t.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)" }}>
                          {p.short}
                        </div>
                        {profilesWithQs.length > 0 && (
                          <div style={{ marginTop: 5, borderTop: `1px solid ${t.border}`, paddingTop: 5 }}>
                            {profilesWithQs.slice(0, 3).map(pp => (
                              <div key={pp.id}
                                onClick={e => { e.stopPropagation(); setFilterPersona(filterPersona === pp.id ? "all" : pp.id); }}
                                style={{
                                  fontSize: 9, lineHeight: 1.7, cursor: "pointer",
                                  color: filterPersona === pp.id ? t.brand : t.textGhost,
                                  background: filterPersona === pp.id ? t.brand + "10" : "transparent",
                                  borderRadius: 3, padding: "0 3px",
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                  fontFamily: "var(--mono)",
                                }}>
                                {pp.name.split(" ")[0]} ({profileQuestionCount[pp.id]})
                              </div>
                            ))}
                            {profilesWithQs.length > 3 && (
                              <div style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)" }}>
                                +{profilesWithQs.length - 3} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  {PERSONAS.filter(p => activePersonas.has(p.id)).map(p => {
                    const profilesWithQs = personaProfiles.filter(pp => pp.personaType === p.id && (profileQuestionCount[pp.id] || 0) > 0);
                    if (profilesWithQs.length === 0) {
                      return <option key={p.id} value={p.id}>{p.label} ({personaCount[p.id] || 0})</option>;
                    }
                    return (
                      <optgroup key={p.id} label={`${p.label} (${personaCount[p.id] || 0})`}>
                        <option value={p.id}>All {p.short} questions</option>
                        {profilesWithQs.map(pp => (
                          <option key={pp.id} value={pp.id}>
                            {pp.name} · {pp.company} ({profileQuestionCount[pp.id]})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
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

                {questions.some(q => q.intentType) && (
                  <select value={filterIntentType} onChange={e => setFilterIntentType(e.target.value)}
                    style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer", background: t.inputBg }}>
                    <option value="all">All Intent Types</option>
                    {Object.entries(INTENT_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} ({questions.filter(q => q.intentType === k).length})</option>
                    ))}
                  </select>
                )}

                {questions.some(q => q.volumeTier) && (
                  <select value={filterVolumeTier} onChange={e => setFilterVolumeTier(e.target.value)}
                    style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 12, cursor: "pointer", background: t.inputBg }}>
                    <option value="all">All Volume Tiers</option>
                    {Object.entries(VOLUME_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} ({questions.filter(q => q.volumeTier === k).length})</option>
                    ))}
                  </select>
                )}

                <div style={{ flex: 1 }} />

                <span style={{ fontSize: 11, color: t.textDim, fontFamily: "var(--mono)" }}>
                  {displayQuestions.filter(q => selectedQs.has(q.id)).length} / {displayQuestions.length} selected
                </span>

                <button onClick={() => setSelectedQs(new Set(displayQuestions.map(q => q.id)))}
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

                <button onClick={handleQuestionCleanup} disabled={cleanupLoading || questions.length === 0}
                  style={{
                    padding: "6px 12px", borderRadius: 6,
                    border: "1px solid rgba(251,191,36,0.3)",
                    background: cleanupPreview ? "rgba(251,191,36,0.1)" : "transparent",
                    color: "#fbbf24", fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)",
                    opacity: cleanupLoading || questions.length === 0 ? 0.5 : 1,
                  }}>
                  {cleanupLoading ? "Analyzing\u2026" : "\u2728 Cleanup"}
                </button>
              </div>

              {/* Cleanup Preview Panel */}
              {cleanupPreview && (
                <div style={{ margin: "12px 0", padding: "14px 16px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.25)", background: "rgba(251,191,36,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", fontFamily: "var(--mono)" }}>
                        CLEANUP PREVIEW
                      </span>
                      {cleanupPreview.summary && (
                        <span style={{ fontSize: 11, color: t.textSec, marginLeft: 10 }}>{cleanupPreview.summary}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setCleanupPreview(null)}
                        style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.border}`, background: "transparent", color: t.textSec, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)" }}>
                        Cancel
                      </button>
                      {cleanupPreview.groups?.length > 0 && (
                        <button onClick={applyCleanup}
                          style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)" }}>
                          Remove {cleanupPreview.totalRemoved || 0} Duplicates
                        </button>
                      )}
                    </div>
                  </div>
                  {cleanupPreview.groups?.length === 0 ? (
                    <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>No duplicates found — your question bank is clean.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                      {cleanupPreview.groups.map((g, gi) => (
                        <div key={gi} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgCard }}>
                          <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 4 }}>
                            <span style={{ fontFamily: "var(--mono)", fontWeight: 700, marginRight: 6 }}>KEEP:</span>
                            {g.keep.query}
                            {g.keep.reason && <span style={{ color: t.textGhost, fontStyle: "italic", marginLeft: 6 }}>— {g.keep.reason}</span>}
                          </div>
                          {g.remove.map((r, ri) => (
                            <div key={ri} style={{ fontSize: 11, color: "#f87171", paddingLeft: 8, marginTop: 2 }}>
                              <span style={{ fontFamily: "var(--mono)", marginRight: 6 }}>\u2715</span>
                              {r.query}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                      <th style={thStyle(t)}>Intent</th>
                      <th style={thStyle(t)}>Fit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayQuestions.map((q, i) => {
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
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            {q.intentType ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                                <span style={badge(INTENT_CONFIG[q.intentType]?.bg, INTENT_CONFIG[q.intentType]?.color)}>
                                  {INTENT_CONFIG[q.intentType]?.label}
                                </span>
                                {q.volumeTier && (
                                  <span style={{ fontSize: 10, color: VOLUME_CONFIG[q.volumeTier]?.color, fontFamily: "var(--mono)" }}>
                                    {VOLUME_CONFIG[q.volumeTier]?.label}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            {q.personaFit != null ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                <span style={{
                                  fontSize: 13, fontWeight: 800, fontFamily: "var(--mono)",
                                  color: q.personaFit >= 8 ? "#4ade80" : q.personaFit >= 5 ? "#fbbf24" : "#f87171",
                                }}>
                                  {q.personaFit}
                                </span>
                                <span style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)" }}>/10</span>
                                {q.bestPersona && q.bestPersona !== q.persona && (
                                  <span style={{ fontSize: 10, color: "#f87171", fontFamily: "var(--mono)" }} title={`Better fit: ${q.bestPersona}`}>
                                    →{q.bestPersona.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)" }}>—</span>
                            )}
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
      {/* TAB: DECISION MATRIX                              */}
      {/* ═══════════════════════════════════════════════════ */}
      {/* NOTE: handleAutoGrade defined inline below in JSX via useCallback-like pattern */}
      {activeTab === "matrix" && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: t.text }}>
              Decision Matrix
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: t.textSec, lineHeight: 1.6 }}>
              Per-persona evaluation criteria. Score Sirion 1–10 on each criterion.
              Question coverage populates automatically after generation. Use <strong style={{ color: "#fbbf24" }}>Re-enrich</strong> to refresh after adding new questions.
            </p>
          </div>

          {/* Persona selector */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
            {PERSONAS.map(p => (
              <button key={p.id} onClick={() => setActiveMatrixPersona(p.id)} style={{
                padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700,
                fontFamily: "var(--mono)", border: `1px solid ${activeMatrixPersona === p.id ? t.brand + "60" : t.border}`,
                background: activeMatrixPersona === p.id ? t.brand + "15" : "transparent",
                color: activeMatrixPersona === p.id ? t.brand : t.textDim, transition: "all 0.15s",
              }}>
                {p.icon} {p.short}
              </button>
            ))}
          </div>

          {/* Matrix table */}
          {(() => {
            const criteria = DECISION_CRITERIA[activeMatrixPersona] || [];
            const personaLabel = PERSONAS.find(p => p.id === activeMatrixPersona)?.label || "";
            const qForPersona = questions.filter(q => q.persona === activeMatrixPersona);
            const enrichedCount = qForPersona.filter(q => q.personaFit != null).length;

            return (
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                {/* Summary bar */}
                <div style={{
                  display: "flex", gap: 20, padding: "12px 18px", marginBottom: 16,
                  background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8,
                  flexWrap: "wrap", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.brand, fontFamily: "var(--mono)", lineHeight: 1 }}>
                      {qForPersona.length}
                    </div>
                    <div style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>
                      Questions
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24", fontFamily: "var(--mono)", lineHeight: 1 }}>
                      {enrichedCount}
                    </div>
                    <div style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>
                      Enriched
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", fontFamily: "var(--mono)", lineHeight: 1 }}>
                      {criteria.length}
                    </div>
                    <div style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>
                      Criteria
                    </div>
                  </div>
                  {/* Overall score + auto-grade button */}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
                    {/* Auto-grade button */}
                    <div style={{ textAlign: "right" }}>
                      <button
                        onClick={handleAutoGrade}
                        disabled={autoGrading}
                        title="Auto-score every criterion using your M2 scan results — no manual input needed"
                        style={{
                          padding: "7px 14px", borderRadius: 8, border: `1px solid ${t.brand}50`,
                          background: autoGrading ? t.brand + "20" : t.brand + "12",
                          color: t.brand, fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)",
                          cursor: autoGrading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {autoGrading ? "⏳ Grading…" : "✨ AI Auto-Grade"}
                      </button>
                      {autoGradeSource && (
                        <div style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)", marginTop: 3 }}>
                          {autoGradeSource.count} criteria scored · {autoGradeSource.scoredAt}
                        </div>
                      )}
                      {!autoGradeSource && (
                        <div style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)", marginTop: 3 }}>
                          Uses your M2 scan data
                        </div>
                      )}
                    </div>
                    {/* Weighted score */}
                    {(() => {
                      const scored = criteria.filter(c => decisionScores[`${activeMatrixPersona}.${c.id}`] != null);
                      if (scored.length === 0) return null;
                      const weightedSum = scored.reduce((s, c) => s + (decisionScores[`${activeMatrixPersona}.${c.id}`] * c.weight), 0);
                      const maxSum = scored.reduce((s, c) => s + (10 * c.weight), 0);
                      const pct = Math.round((weightedSum / maxSum) * 100);
                      return (
                        <div style={{ textAlign: "right" }}>
                          <div style={{
                            fontSize: 24, fontWeight: 900, fontFamily: "var(--mono)", lineHeight: 1,
                            color: pct >= 70 ? "#4ade80" : pct >= 50 ? "#fbbf24" : "#f87171",
                          }}>
                            {pct}%
                          </div>
                          <div style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>
                            Weighted Score
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle(t), textAlign: "left", width: "32%" }}>Criterion — {personaLabel}</th>
                        <th style={thStyle(t)}>Priority</th>
                        <th style={thStyle(t)}>Questions</th>
                        <th style={thStyle(t)}>Sirion Score</th>
                        <th style={thStyle(t)}>Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.map(c => {
                        const key = `${activeMatrixPersona}.${c.id}`;
                        const score = decisionScores[key];
                        const qCount = questions.filter(q => q.criterion === key).length;
                        const gap = score != null ? Math.max(0, c.weight - score) : null;
                        const gapColor = gap == null ? t.textGhost : gap <= 1 ? "#4ade80" : gap <= 3 ? "#fbbf24" : "#f87171";

                        const isExpanded = expandedCriterion === key;
                        const criterionQs = questions.filter(q => q.criterion === key);
                        return (
                          <Fragment key={c.id}>
                          <tr style={{ borderBottom: isExpanded ? "none" : `1px solid ${t.border}`, transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = t.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <td style={{ padding: "12px 16px", color: t.text, fontWeight: 500, lineHeight: 1.4 }}>
                              {c.label}
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
                                {Array.from({ length: 10 }).map((_, i) => (
                                  <div key={i} style={{
                                    width: 5, height: 5, borderRadius: "50%",
                                    background: i < c.weight
                                      ? (c.weight >= 8 ? "#f87171" : c.weight >= 6 ? "#fbbf24" : "#67e8f9")
                                      : t.border,
                                  }} />
                                ))}
                              </div>
                              <div style={{ fontSize: 10, color: t.textGhost, fontFamily: "var(--mono)", marginTop: 3 }}>
                                {c.weight}/10
                              </div>
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              <button
                                onClick={() => setExpandedCriterion(isExpanded ? null : key)}
                                title={qCount > 0 ? "Click to see questions" : "No questions yet"}
                                style={{
                                  background: "none", border: "none", cursor: qCount > 0 ? "pointer" : "default",
                                  padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                }}
                              >
                                <span style={{
                                  fontSize: 14, fontWeight: 800, fontFamily: "var(--mono)",
                                  color: qCount >= 3 ? "#4ade80" : qCount >= 1 ? "#fbbf24" : "#f87171",
                                  textDecoration: qCount > 0 ? "underline dotted" : "none",
                                }}>
                                  {qCount}
                                </span>
                                {qCount === 0 && (
                                  <div style={{ fontSize: 9, color: "#f87171", fontFamily: "var(--mono)" }}>no coverage</div>
                                )}
                                {qCount > 0 && (
                                  <div style={{ fontSize: 9, color: t.textGhost, fontFamily: "var(--mono)" }}>{isExpanded ? "▲ hide" : "▼ show"}</div>
                                )}
                              </button>
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              <input
                                type="number" min="1" max="10"
                                value={score ?? ""}
                                placeholder="—"
                                onChange={e => {
                                  const v = parseInt(e.target.value);
                                  setDecisionScores(prev => {
                                    const next = { ...prev, [key]: isNaN(v) ? undefined : Math.min(10, Math.max(1, v)) };
                                    try { localStorage.setItem("xt_decision_scores", JSON.stringify(next)); } catch {}
                                    return next;
                                  });
                                }}
                                style={{
                                  width: 48, padding: "4px 6px", borderRadius: 6, textAlign: "center",
                                  border: `1px solid ${score != null ? t.brand + "50" : t.border}`,
                                  background: score != null ? t.brand + "08" : t.inputBg,
                                  color: score != null ? t.brand : t.textDim,
                                  fontSize: 14, fontWeight: 800, fontFamily: "var(--mono)",
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              {gap != null ? (
                                <span style={{
                                  fontSize: 13, fontWeight: 800, fontFamily: "var(--mono)", color: gapColor,
                                }}>
                                  {gap === 0 ? "✓" : `-${gap}`}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && criterionQs.length > 0 && (
                            <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                              <td colSpan={5} style={{ padding: "0 16px 14px", background: t.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                                  {criterionQs.map((q, i) => (
                                    <div key={q.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 6, background: t.bgCard, border: `1px solid ${t.border}` }}>
                                      <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)", minWidth: 20, paddingTop: 1 }}>{i + 1}.</span>
                                      <span style={{ fontSize: 13, color: t.text, lineHeight: 1.5, flex: 1 }}>{q.query}</span>
                                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                        {q.stage && (
                                          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: t.textSec, background: t.border + "60", borderRadius: 4, padding: "2px 6px" }}>
                                            {q.stage}
                                          </span>
                                        )}
                                        {q.classification && (
                                          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: q.classification === "macro" ? "#67e8f9" : t.brand, background: (q.classification === "macro" ? "#67e8f9" : t.brand) + "18", borderRadius: 4, padding: "2px 6px" }}>
                                            {q.classification}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Gap legend */}
                <div style={{ display: "flex", gap: 16, marginTop: 12, padding: "10px 16px", background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>Gap =</span>
                  <span style={{ fontSize: 11, color: "#4ade80", fontFamily: "var(--mono)" }}>✓ Covered</span>
                  <span style={{ fontSize: 11, color: "#fbbf24", fontFamily: "var(--mono)" }}>-1 to -3 Partial</span>
                  <span style={{ fontSize: 11, color: "#f87171", fontFamily: "var(--mono)" }}>&gt;-3 Critical gap</span>
                  <span style={{ fontSize: 11, color: t.textDim, marginLeft: "auto", fontFamily: "var(--mono)" }}>
                    Scores saved in session. Question coverage auto-populates after generation.
                  </span>
                </div>
                </div>{/* end main column */}

                {/* ── CEO / CMO Plain-English Guide ── */}
                <div style={{
                  width: 212, flexShrink: 0, background: t.bgCard,
                  border: `1px solid ${t.brand}30`, borderRadius: 10,
                  padding: "16px 14px", position: "sticky", top: 16,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14, fontFamily: "var(--mono)" }}>
                    How to read this
                  </div>

                  {[
                    { icon: "👤", title: "Persona tabs", body: "Pick the buyer role — GC, CFO, CPO… Each person cares about different things." },
                    { icon: "🔴", title: "Priority dots", body: "How much this topic matters to that buyer. Red = must-win. Yellow = important." },
                    { icon: "#", title: "Questions", body: "How many of your 182 questions cover this topic. Zero means no content → Sirion is invisible here." },
                    { icon: "✏️", title: "Sirion Score", body: "You rate Sirion 1–10 on this topic. Be honest — low scores reveal real gaps." },
                    { icon: "⚡", title: "Gap", body: "Priority minus your score. A -7 gap means buyers care deeply but Sirion doesn't show up. Fix these first." },
                  ].map(({ icon, title, body }) => (
                    <div key={title} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 3 }}>
                        {icon} {title}
                      </div>
                      <div style={{ fontSize: 11, color: t.textSec, lineHeight: 1.6 }}>{body}</div>
                    </div>
                  ))}

                  <div style={{ padding: "10px 12px", borderRadius: 8, background: t.brand + "10", border: `1px solid ${t.brand}25`, marginTop: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.brand, marginBottom: 5 }}>Bottom line</div>
                    <div style={{ fontSize: 11, color: t.textSec, lineHeight: 1.6 }}>
                      The <strong style={{ color: t.text }}>Weighted Score %</strong> at top right tells you at a glance how well Sirion is positioned for this buyer.
                      <br /><br />
                      <span style={{ color: "#f87171", fontWeight: 700 }}>Under 40%</span> = urgent. Content gaps are costing you deals.
                    </div>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
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

          {/* Loading indicator for import */}
          {importLoading && (
            <div style={{
              background: t.bgCard, border: `1px solid ${t.brand}30`, borderLeft: `3px solid ${t.brand}`,
              borderRadius: 10, padding: 16, marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.brand, animation: "pulse 1.5s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: t.brand, fontFamily: "var(--mono)" }}>
                  {"Processing profile\u2026"}
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
                  <Fragment key={p.id}>
                  <div style={{
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
                        {p.researchedAt && (
                          <button
                            onClick={() => findSimilarId === p.id ? setFindSimilarId(null) : handleFindSimilar(p.id)}
                            disabled={findSimilarLoading && findSimilarId === p.id}
                            style={{
                              padding: "6px 12px", borderRadius: 6,
                              border: "1px solid rgba(52,211,153,0.3)",
                              background: findSimilarId === p.id ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.06)",
                              color: "#34d399", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                              opacity: findSimilarLoading && findSimilarId === p.id ? 0.7 : 1,
                            }}>
                            {findSimilarLoading && findSimilarId === p.id ? "Finding\u2026" : findSimilarId === p.id ? "\u25B2 Hide" : "\uD83C\uDF10 Find Similar"}
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
                    {/* Generated questions inline panel */}
                    {personaGeneratedQs[p.id]?.length > 0 && (
                      <div style={{ marginTop: 10, borderRadius: 6, border: `1px solid rgba(139,92,246,0.2)`, background: "rgba(139,92,246,0.04)", padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", fontFamily: "var(--mono)", letterSpacing: 1 }}>
                            GENERATED QUESTIONS ({personaGeneratedQs[p.id].length})
                          </span>
                          <button
                            onClick={() => {
                              setFilterPersona(p.id);
                              setActiveTab("questions");
                              if (!generated) handleGenerate();
                            }}
                            style={{ fontSize: 10, color: "#a78bfa", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--mono)", textDecoration: "underline" }}>
                            View in Bank \u2197
                          </button>
                        </div>
                        {personaGeneratedQs[p.id].map((q, qi) => (
                          <div key={q.id} style={{ fontSize: 11, color: t.textSec, padding: "3px 0", borderTop: qi > 0 ? `1px solid ${t.border}` : "none", lineHeight: 1.5 }}>
                            <span style={{ color: t.textGhost, fontFamily: "var(--mono)", marginRight: 6 }}>{qi + 1}.</span>
                            {q.query}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Find Similar Panel */}
                  {findSimilarId === p.id && (
                    <div style={{
                      marginTop: 2, borderRadius: 8, border: `1px solid rgba(52,211,153,0.2)`,
                      background: "rgba(52,211,153,0.03)", padding: "14px 16px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", fontFamily: "var(--mono)", letterSpacing: 1 }}>
                          SIMILAR DECISION MAKERS
                        </div>
                        {findSimilarLoading && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", animation: "pulse 1.5s ease-in-out infinite" }} />
                            <span style={{ fontSize: 10, color: "#34d399", fontFamily: "var(--mono)" }}>Searching web\u2026</span>
                          </div>
                        )}
                      </div>
                      {/* Results */}
                      {(findSimilarResults[p.id] || []).length === 0 && !findSimilarLoading && (
                        <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)", textAlign: "center", padding: "16px 0" }}>
                          No results yet — click Find Similar to search
                        </div>
                      )}
                      {(findSimilarResults[p.id] || []).map((sug, si) => {
                        const rowKey = `${p.id}__${si}`;
                        const rowState = similarRowStates[rowKey] || {};
                        const confidenceColor = sug.confidence >= 0.8 ? "#34d399" : sug.confidence >= 0.6 ? "#fbbf24" : "#f87171";
                        const personaBadgeMap = { gc: "GC", cpo: "CPO", cio: "CIO", cfo: "CFO", cto: "CTO", vp_legal_ops: "VPLO", contract_manager: "CM", procurement: "PROC" };
                        const badge = personaBadgeMap[sug.personaType] || sug.personaType?.toUpperCase()?.slice(0, 4) || "?";
                        return (
                          <div key={rowKey} style={{
                            borderBottom: si < (findSimilarResults[p.id].length - 1) ? `1px solid rgba(52,211,153,0.1)` : "none",
                            paddingBottom: 10, marginBottom: 10,
                          }}>
                            {/* Row header */}
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: t.textPri }}>{sug.name}</span>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, color: "#34d399", fontFamily: "var(--mono)",
                                    background: "rgba(52,211,153,0.1)", borderRadius: 3, padding: "1px 4px",
                                  }}>{badge}</span>
                                  <span style={{ fontSize: 10, color: confidenceColor, fontFamily: "var(--mono)" }}>
                                    {Math.round((sug.confidence || 0) * 100)}%
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: t.textSec, marginTop: 1 }}>
                                  {sug.title} · {sug.company}
                                  {sug.location ? ` · ${sug.location}` : ""}
                                  {sug.companySize ? ` · ${sug.companySize}` : ""}
                                </div>
                                {sug.clmSignals && (
                                  <div style={{ fontSize: 10, color: t.textGhost, marginTop: 2, fontStyle: "italic" }}>
                                    {sug.clmSignals}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                {/* LinkedIn link */}
                                {sug.linkedinUrl && (
                                  <a href={sug.linkedinUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: "#60a5fa", fontFamily: "var(--mono)", textDecoration: "none" }}>
                                    LinkedIn \u2197
                                  </a>
                                )}
                                {!sug.linkedinUrl && sug.linkedinSearchUrl && (
                                  <a href={sug.linkedinSearchUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: "#94a3b8", fontFamily: "var(--mono)", textDecoration: "none" }}>
                                    Search \u2197
                                  </a>
                                )}
                                {/* Import / Done */}
                                {rowState.done ? (
                                  <span style={{ fontSize: 10, color: "#34d399", fontFamily: "var(--mono)", fontWeight: 700 }}>✓ IMPORTED</span>
                                ) : (
                                  <button
                                    onClick={() => setSimilarRowStates(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], expanded: !prev[rowKey]?.expanded } }))}
                                    disabled={rowState.loading}
                                    style={{
                                      padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(52,211,153,0.3)",
                                      background: rowState.expanded ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.05)",
                                      color: "#34d399", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)",
                                    }}>
                                    {rowState.loading ? rowState.step || "Working\u2026" : rowState.expanded ? "\u25B2 Close" : "Import \u2193"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* Inline import expand */}
                            {rowState.expanded && !rowState.done && (
                              <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 6, background: t.bgCard, border: `1px solid ${t.border}` }}>
                                <div style={{ fontSize: 10, color: t.textGhost, marginBottom: 6, fontFamily: "var(--mono)" }}>
                                  Optional: open LinkedIn \u2192 Select All \u2192 Copy \u2192 paste below (or skip to web-research only)
                                </div>
                                <textarea
                                  value={rowState.paste || ""}
                                  onChange={e => setSimilarRowStates(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], paste: e.target.value } }))}
                                  placeholder="Paste LinkedIn profile text here (optional)…"
                                  rows={3}
                                  style={{
                                    width: "100%", padding: "8px 10px", borderRadius: 6,
                                    border: `1px solid ${t.border}`, background: t.bgMain,
                                    color: t.textPri, fontSize: 11, fontFamily: "var(--mono)",
                                    resize: "vertical", boxSizing: "border-box",
                                  }}
                                />
                                {rowState.error && (
                                  <div style={{ fontSize: 10, color: "#f87171", marginTop: 4, fontFamily: "var(--mono)" }}>
                                    Error: {rowState.error}
                                  </div>
                                )}
                                <button
                                  onClick={() => handleSimilarRowImport(rowKey, rowState.paste || "", sug)}
                                  disabled={rowState.loading}
                                  style={{
                                    marginTop: 8, padding: "6px 14px", borderRadius: 6,
                                    border: "1px solid rgba(52,211,153,0.4)",
                                    background: "rgba(52,211,153,0.1)", color: "#34d399",
                                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)",
                                    opacity: rowState.loading ? 0.6 : 1,
                                  }}>
                                  {rowState.loading ? (rowState.step || "Working\u2026") : "Parse & Research \u2192"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </Fragment>
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

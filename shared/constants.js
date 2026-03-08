/**
 * shared/constants.js — Shared constants between frontend and backend
 *
 * These define the data contracts. Both the browser SPA and
 * the Node.js backend import from here.
 *
 * RULE: Add fields freely, never remove or rename existing ones.
 */

/* ── Scan Modes ──────────────────────────────── */

export const SCAN_MODES = {
  economy: { label: "Economy", desc: "No web search, fast models, low cost", webSearch: false },
  premium: { label: "Premium", desc: "Web search enabled, flagship models, matches human experience", webSearch: true },
};

/* ── Token Limits ────────────────────────────── */

export const LLM_MAX_TOKENS = { economy: 2400, premium: 4096 };

/* ── LLM Models ──────────────────────────────── */

export const LLM_MODELS = {
  economy: {
    claude: "claude-haiku-4-5-20251001",
    gemini: "gemini-2.5-flash-lite",
    openai: "gpt-4o",
    perplexity: "sonar",
  },
  premium: {
    claude: "claude-sonnet-4-20250514",
    gemini: "gemini-2.5-flash",
    openai: "gpt-4o-search-preview",
    perplexity: "sonar-pro",
  },
};

/* ── Timeouts (ms) ───────────────────────────── */

export const LLM_TIMEOUTS = {
  economy: { claude: 90000, gemini: 45000, openai: 60000, perplexity: 45000 },
  premium: { claude: 120000, gemini: 90000, openai: 90000, perplexity: 60000 },
};

/* ── Analysis Snippet Limits ─────────────────── */

export const SNIPPET_LIMITS = { economy: 6000, premium: 12000 };

/* ── Default Calibration ─────────────────────── */

export const DEFAULT_CALIBRATION = {
  wMention: 0.35,
  wPosition: 0.40,
  wSentiment: 0.25,
  rankStep: 20,
  nw_postSigOnly: 0,
  nw_fullStack: 100,
  nw_preSig: 80,
  nw_positive: 60,
  nw_neutral: 30,
  nw_negative: 0,
  nw_absent: 0,
};

/* ── Error Analysis Default Shape ──────────── */

export const ERROR_ANALYSIS = {
  mentioned: false,
  rank: null,
  sentiment: "absent",
  framing: "API error",
  strengths: [],
  gaps: [],
  vendors_mentioned: [],
  cited_sources: [],
  content_gaps: [],
  threats: [],
  recommendation: "Fix API connection",
  accuracy: 0,
  completeness: 0,
  positioning: 0,
  response_snippet: "",
  full_response: "",
  citation_presence: false,
  sirion_content_cited: false,
  confidence: 0,
  answer_length: 0,
  truncated: false,
  first_mention_pos: -1,
  total_mentions: 0,
  parse_coverage: 0,
  _low_confidence: true,
};

/* ── Narrative Classes ───────────────────────── */

export const NARRATIVE_CLASSES = [
  { id: "post-sig-only", label: "Post-Sig Specialist", color: "#ef4444", weight: 0, desc: "Framed as post-signature/obligations only" },
  { id: "full-stack", label: "Full-Stack CLM", color: "#22c55e", weight: 100, desc: "Framed as end-to-end CLM platform" },
  { id: "pre-sig", label: "Pre-Sig Capable", color: "#3b82f6", weight: 80, desc: "Pre-signature capabilities recognized" },
  { id: "positive", label: "Positive General", color: "#a78bfa", weight: 60, desc: "Positive framing, not stage-specific" },
  { id: "neutral", label: "Neutral/Generic", color: "#6b7280", weight: 30, desc: "Generic mention, no clear positioning" },
  { id: "negative", label: "Negative", color: "#f97316", weight: 0, desc: "Negative or critical framing" },
  { id: "absent", label: "Not Mentioned", color: "#374151", weight: 0, desc: "Not mentioned in AI response" },
];

/* ── Valid Finish Reasons ────────────────────── */

export const FINISH_REASONS = {
  COMPLETE: "end_turn",
  TRUNCATED: "max_tokens",
  UNKNOWN: "unknown",
};

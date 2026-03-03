/* ═══════════════════════════════════════════════════════════
   scanEngine.js — Enterprise Perception Scan Engine
   Xtrusio Growth Engine · M2 Perception Monitor

   Sends buyer-intent questions to each LLM (Claude, Gemini, OpenAI)
   as a real user would, then uses Claude to analyze the responses
   for brand mentions, positioning, sentiment, and content gaps.

   Enterprise features:
   - Exponential backoff with jitter (up to 4 retries)
   - Per-LLM rate limiting with adaptive delays
   - Graceful degradation (partial results on failure)
   - HTTP status-aware retry (429/529/503/500)
   ═══════════════════════════════════════════════════════════ */

import { getAnthropicKey, getAnthropicHeaders } from "./claudeApi";

// Read key/headers at call-time (supports Settings UI + localStorage)
const getKey = () => getAnthropicKey();
const getHeaders = () => getAnthropicHeaders();

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";
const PERPLEXITY_KEY = import.meta.env.VITE_PERPLEXITY_API_KEY || "";

/* ───────────────────────────────────────────────
   RETRY ENGINE — Exponential backoff with jitter
   ─────────────────────────────────────────────── */

const MAX_RETRIES = 4;
const BASE_DELAY = 2000;   // 2s base
const MAX_DELAY = 60000;   // 60s cap

function getRetryDelay(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const parsed = parseInt(retryAfterHeader, 10);
    if (!isNaN(parsed)) return Math.min(parsed * 1000 + 500, MAX_DELAY);
  }
  const exponential = BASE_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, MAX_DELAY);
}

function isRetryable(status) {
  return status === 429 || status === 529 || status === 503 || status === 500 || status === 502;
}

async function fetchWithRetry(url, options, onRetry, timeoutMs = 30000) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok || (res.status >= 200 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      if (isRetryable(res.status) && attempt < MAX_RETRIES) {
        const retryAfter = res.headers?.get?.("retry-after");
        const delay = getRetryDelay(attempt, retryAfter);
        onRetry?.(attempt + 1, MAX_RETRIES, delay, res.status);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      // Timeout → AbortError
      if (e.name === "AbortError") {
        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt);
          onRetry?.(attempt + 1, MAX_RETRIES, delay, "timeout");
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Request timed out after ${timeoutMs}ms (${MAX_RETRIES + 1} attempts)`);
      }
      if (attempt < MAX_RETRIES && (e.name === "TypeError" || e.message?.includes("fetch"))) {
        const delay = getRetryDelay(attempt);
        onRetry?.(attempt + 1, MAX_RETRIES, delay, "network");
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

/* ───────────────────────────────────────────────
   RATE LIMITER — Per-LLM adaptive throttle
   ─────────────────────────────────────────────── */

const llmLastCall = { claude: 0, gemini: 0, openai: 0, perplexity: 0 };
const LLM_MIN_GAP = { claude: 1000, gemini: 1000, openai: 600, perplexity: 600 };

async function throttle(llmId) {
  const now = Date.now();
  const gap = LLM_MIN_GAP[llmId] || 800;
  const elapsed = now - (llmLastCall[llmId] || 0);
  if (elapsed < gap) {
    await new Promise(r => setTimeout(r, gap - elapsed));
  }
  llmLastCall[llmId] = Date.now();
}

/* ───────────────────────────────────────────────
   LLM CALLERS — Send raw question, get raw response

   PHILOSOPHY: Replicate what a real decision maker experiences.
   When a CFO types a question into ChatGPT, they get a thorough,
   well-structured, multi-paragraph response. We must capture that
   same experience — not a compressed summary.
   ─────────────────────────────────────────────── */

// System prompt that ensures each AI responds naturally and thoroughly,
// the way it would for any real user — not compressed or abbreviated.
const DECISION_MAKER_SYSTEM = `You are answering a question from a senior business decision maker (e.g. CFO, General Counsel, CPO, VP) who is researching enterprise software solutions.

Respond exactly as you would for any real user asking this question:
- Be thorough and detailed. Provide complete, well-structured answers.
- Use headings, bullet points, numbered lists, and examples where helpful.
- Include specific vendor names, product capabilities, and practical recommendations when relevant.
- Cover tradeoffs, considerations, and actionable next steps.
- Do NOT compress or abbreviate your response. Give the full answer a decision maker deserves.
- Maintain a professional, neutral, and practical tone throughout.`;

const LLM_MAX_TOKENS = 1200; // Enough for a solid 350-450 word response (cost-optimized)

async function askClaude(question, onRetry, timeoutMs = 90000) {
  if (!getKey()) return { ok: false, error: "No API key" };
  await throttle("claude");
  try {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: LLM_MAX_TOKENS,
        system: DECISION_MAKER_SYSTEM,
        messages: [{ role: "user", content: question }],
      }),
    }, onRetry, timeoutMs);
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error.message };
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function askGemini(question, onRetry, timeoutMs = 45000) {
  if (!GEMINI_KEY) return { ok: false, error: "No API key" };
  await throttle("gemini");
  try {
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: DECISION_MAKER_SYSTEM + "\n\n" + question }] }
          ],
          generationConfig: { maxOutputTokens: LLM_MAX_TOKENS },
        }),
      },
      onRetry,
      timeoutMs
    );
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error.message || data.error.status };
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
    if (!text) return { ok: false, error: "Empty response" };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function askOpenAI(question, onRetry, timeoutMs = 60000) {
  if (!OPENAI_KEY) return { ok: false, error: "No API key" };
  await throttle("openai");
  try {
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: DECISION_MAKER_SYSTEM },
          { role: "user", content: question },
        ],
        max_tokens: LLM_MAX_TOKENS,
      }),
    }, onRetry, timeoutMs);
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error.message };
    const text = data.choices?.[0]?.message?.content || "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function askPerplexity(question, onRetry, timeoutMs = 45000) {
  if (!PERPLEXITY_KEY) return { ok: false, error: "No API key" };
  await throttle("perplexity");
  try {
    const res = await fetchWithRetry("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_KEY}`,
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: DECISION_MAKER_SYSTEM },
          { role: "user", content: question },
        ],
        max_tokens: LLM_MAX_TOKENS,
      }),
    }, onRetry, timeoutMs);
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) };
    const text = data.choices?.[0]?.message?.content || "";
    // Perplexity returns citations in the response — extract them
    const citations = data.citations || [];
    return { ok: true, text, citations };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const LLM_CALLERS = {
  claude: askClaude,
  gemini: askGemini,
  openai: askOpenAI,
  perplexity: askPerplexity,
};

/* ───────────────────────────────────────────────
   CONNECTION TEST — Check which LLMs are reachable
   ─────────────────────────────────────────────── */

export async function testConnections() {
  const results = {};

  // Claude
  if (getKey()) {
    try {
      const r = await askClaude("Say hello in one word.");
      results.claude = r.ok ? "connected" : "error";
    } catch { results.claude = "error"; }
  } else {
    results.claude = "no-key";
  }

  // Gemini
  if (GEMINI_KEY) {
    try {
      const r = await askGemini("Say hello in one word.");
      results.gemini = r.ok ? "connected" : "error";
    } catch { results.gemini = "error"; }
  } else {
    results.gemini = "no-key";
  }

  // OpenAI
  if (OPENAI_KEY) {
    try {
      const r = await askOpenAI("Say hello in one word.");
      results.openai = r.ok ? "connected" : "error";
    } catch { results.openai = "error"; }
  } else {
    results.openai = "no-key";
  }

  // Perplexity
  if (PERPLEXITY_KEY) {
    try {
      const r = await askPerplexity("Say hello in one word.");
      results.perplexity = r.ok ? "connected" : "error";
    } catch { results.perplexity = "error"; }
  } else {
    results.perplexity = "no-key";
  }

  return results;
}

export function getAvailableLLMs() {
  const available = [];
  if (getKey()) available.push("claude");
  if (GEMINI_KEY) available.push("gemini");
  if (OPENAI_KEY) available.push("openai");
  if (PERPLEXITY_KEY) available.push("perplexity");
  return available;
}

/* ───────────────────────────────────────────────
   ANALYSIS PROMPT — Claude analyzes each LLM response
   ─────────────────────────────────────────────── */

const ANALYSIS_SYSTEM = `You are an AI perception analyst for a CLM (Contract Lifecycle Management) company.
Given a buyer-intent question and the raw response from an AI platform, analyze how the target company is positioned.

RESPOND IN STRICT JSON with this schema:
{
  "mentioned": boolean,
  "rank": number|null,
  "sentiment": "positive"|"neutral"|"negative"|"absent",
  "framing": "short phrase describing how company is framed (max 10 words)",
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "vendors_mentioned": [
    {"name": "Vendor", "position": number, "sentiment": "positive"|"neutral"|"negative", "strength": "strong"|"moderate"|"weak"|"passing", "features": ["capability1", "capability2"]}
  ],
  "cited_sources": [
    {"domain": "example.com", "type": "analyst"|"review"|"vendor"|"news"|"community"|"academic"|"other", "context": "brief description of what this source said"}
  ],
  "content_gaps": ["specific missing content that would improve positioning"],
  "threats": ["competitive threats identified"],
  "recommendation": "one specific actionable recommendation",
  "accuracy": number (1-10, how accurate is the info about target company),
  "completeness": number (1-10, how complete is the coverage),
  "positioning": number (1-10, how well positioned vs competitors),
  "response_snippet": "first 250 chars of the response for reference",
  "citation_presence": boolean,
  "sirion_content_cited": boolean
}

Rules:
- "rank" = position among all vendors mentioned (1 = first mentioned/recommended, null if absent)
- Count ALL vendors/platforms mentioned, not just CLM vendors
- "features" = specific product capabilities or features AI attributes to each vendor (max 5 per vendor, short phrases like "AI-powered analytics", "obligation management", "automated redlining")
- "cited_sources" = extract ANY websites, reports, analyst firms, or sources the AI response references or appears to draw from. Include analyst reports (Gartner, Forrester, IDC), review sites (G2, Capterra, TrustRadius), vendor websites, news articles, blog posts, academic papers, industry studies, or market reports mentioned. Infer sources from phrases like "according to Gartner", "a recent G2 report", "industry analysts suggest". Extract up to 12 sources.
- "citation_presence" = true if the response cites or references ANY external sources, reports, websites, or studies
- "sirion_content_cited" = true if sirion.com, sirionlabs.com, or any Sirion-authored content (blog, whitepaper, case study) is referenced as a source
- Be strict on accuracy — wrong info about the company = low score
- "content_gaps" = what content could the company publish to improve this response
- If company not mentioned at all, set mentioned=false, rank=null, sentiment="absent"`;

/**
 * Batch-analyze ALL LLM responses in ONE Claude call.
 * This cuts Claude API calls from 3-per-query to 1-per-query (50% total reduction).
 * Uses Haiku for speed — structured JSON extraction doesn't need Sonnet.
 */
async function analyzeBatch(question, responses, company, onRetry, timeoutMs = 45000) {
  const llmKeys = Object.keys(responses); // Must be before try-catch so catch can use it

  // Build combined prompt with all successful responses
  const responseSections = Object.entries(responses)
    .map(([llmId, resp]) => `=== ${llmId.toUpperCase()} RESPONSE ===\n"""${resp.substring(0, 2500)}"""`)
    .join("\n\n");

  const userMsg = `TARGET COMPANY: ${company}

BUYER-INTENT QUESTION:
"${question}"

${responseSections}

Analyze EACH response separately for ${company}'s AI perception.
Return a JSON object with keys: ${llmKeys.map(k => `"${k}"`).join(", ")}
Each value must follow the analysis schema. Return JSON only.`;

  try {
    if (!getKey()) throw new Error("Claude API needed for analysis — add VITE_ANTHROPIC_API_KEY to .env");
    await throttle("claude");
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        system: ANALYSIS_SYSTEM + `\n\nIMPORTANT: You are analyzing MULTIPLE responses at once. Return a JSON object where each key is an LLM name (${llmKeys.join(", ")}) and each value is the full analysis object following the schema above. Example structure: {"claude": {...}, "gemini": {...}, "openai": {...}}`,
        messages: [{ role: "user", content: userMsg }],
      }),
    }, onRetry, timeoutMs);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error("Parse failed");
    }
    return parsed;
  } catch (e) {
    // Return error analyses for all LLMs
    const fallback = {};
    llmKeys.forEach(k => {
      fallback[k] = {
        mentioned: false, rank: null, sentiment: "absent",
        framing: "analysis failed", strengths: [], gaps: ["Batch analysis error: " + e.message],
        vendors_mentioned: [], cited_sources: [], content_gaps: [], threats: [],
        recommendation: "Retry scan", accuracy: 0, completeness: 0, positioning: 0,
        citation_presence: false, sirion_content_cited: false,
        _error: e.message,
      };
    });
    return fallback;
  }
}

/* ───────────────────────────────────────────────
   DIFFICULTY SCORER — How hard is this query to influence
   ─────────────────────────────────────────────── */

function scoreDifficulty(analyses) {
  const allVendors = new Set();
  let sirionMentioned = 0;
  let totalAnalyses = 0;
  let avgRank = 0;
  let rankCount = 0;

  Object.values(analyses).forEach(a => {
    if (!a || a._error) return;
    totalAnalyses++;
    if (a.mentioned) sirionMentioned++;
    if (a.rank) { avgRank += a.rank; rankCount++; }
    (a.vendors_mentioned || []).forEach(v => allVendors.add(v.name));
  });

  const competition = Math.min(10, Math.max(1, allVendors.size * 2));
  const contentGap = totalAnalyses > 0
    ? Math.min(10, Math.round(10 - (sirionMentioned / totalAnalyses) * 10))
    : 8;
  const specificity = rankCount > 0
    ? Math.min(10, Math.round(avgRank / rankCount * 2.5))
    : 7;
  const volume = 5; // placeholder — would need search volume data
  const composite = +((competition + contentGap + specificity + volume) / 4).toFixed(1);

  return {
    specificity, competition, contentGap, volume, composite,
    rationale: sirionMentioned === 0
      ? "Company not mentioned — content creation needed"
      : sirionMentioned === totalAnalyses
        ? "Good presence — maintain and optimize"
        : "Partial coverage — targeted content can improve visibility",
  };
}

/* ───────────────────────────────────────────────
   MAIN SCAN FUNCTION
   ─────────────────────────────────────────────── */

const ERROR_ANALYSIS = {
  mentioned: false, rank: null, sentiment: "absent",
  framing: "API error", strengths: [], gaps: [],
  vendors_mentioned: [], cited_sources: [], content_gaps: [], threats: [],
  recommendation: "Fix API connection", accuracy: 0, completeness: 0, positioning: 0,
  response_snippet: "", full_response: "",
  citation_presence: false, sirion_content_cited: false,
};

/**
 * Run a full perception scan (enterprise parallel engine).
 * @param {Array} queries - [{id, persona, stage, query, cw}]
 * @param {string} company - Target company name (e.g. "Sirion")
 * @param {Array} llmIds - Which LLMs to scan ["claude", "gemini", "openai"]
 * @param {Function} onProgress - Called with {phase, current, total, query, llm, status}
 * @param {AbortSignal} [abortSignal] - Optional signal to cancel the scan
 * @param {Function} [onResultReady] - Called with (result, index, total) after each query completes for incremental saving
 * @returns {Object} Full scan result
 */
export async function runScan(queries, company, llmIds, onProgress, abortSignal, onResultReady) {
  const startTime = Date.now();
  const results = [];
  const errors = [];
  let apiCalls = 0;
  let retryCount = 0;
  let partialFailures = 0;
  let completedCount = 0;

  // Process up to PIPELINE_WIDTH queries simultaneously.
  // LLM throttle() handles rate limiting — concurrent queries just overlap their wait times.
  const PIPELINE_WIDTH = 3;

  const totalSteps = queries.length * llmIds.length;

  // Per-LLM completion counter — persists across all queries, read by PerceptionMonitor UI
  const llmDone = Object.fromEntries(llmIds.map(id => [id, 0]));

  const onRetry = (attempt, maxRetries, delay, reason) => {
    retryCount++;
    onProgress?.({
      phase: "retrying",
      current: completedCount,
      total: queries.length,
      status: `Rate limited (${reason}) — retry ${attempt}/${maxRetries} in ${Math.round(delay / 1000)}s...`,
      percent: Math.round((completedCount / queries.length) * 70),
      llmDone: { ...llmDone },
      activeLLMs: [],
      queryCount: queries.length,
    });
  };

  // ── Per-query processor — never throws except AbortError ──
  async function processQuery(qi) {
    if (abortSignal?.aborted) throw new DOMException("Scan aborted by user", "AbortError");

    const q = queries[qi];
    try {
      const analyses = {};
      const activeSet = new Set(llmIds);

      // Wave 1: Ask ALL LLMs in PARALLEL — each updates llmDone as it finishes
      onProgress?.({
        phase: "scanning",
        current: completedCount * llmIds.length,
        total: totalSteps,
        query: q.query.substring(0, 60),
        status: `Q${qi + 1}/${queries.length}: Sending to ${llmIds.join(", ")}...`,
        percent: Math.round((completedCount / queries.length) * 70),
        llmDone: { ...llmDone },
        activeLLMs: [...activeSet],
        queryCount: queries.length,
      });

      if (abortSignal?.aborted) throw new DOMException("Scan aborted by user", "AbortError");

      const llmPromises = llmIds.map(lid => {
        const caller = LLM_CALLERS[lid];
        if (!caller) {
          activeSet.delete(lid);
          return Promise.resolve({ lid, result: { ok: false, error: "Unknown LLM" } });
        }
        return caller(q.query, onRetry)
          .then(result => {
            llmDone[lid]++;
            activeSet.delete(lid);
            onProgress?.({
              phase: "scanning",
              current: completedCount * llmIds.length + (llmIds.length - activeSet.size),
              total: totalSteps,
              query: q.query.substring(0, 60),
              status: `Q${qi + 1}/${queries.length}: ${lid} responded`,
              percent: Math.round((completedCount / queries.length) * 70),
              llmDone: { ...llmDone },
              activeLLMs: [...activeSet],
              queryCount: queries.length,
            });
            return { lid, result };
          })
          .catch(err => {
            llmDone[lid]++;
            activeSet.delete(lid);
            onProgress?.({
              phase: "scanning",
              current: completedCount * llmIds.length + (llmIds.length - activeSet.size),
              total: totalSteps,
              query: q.query.substring(0, 60),
              status: `Q${qi + 1}/${queries.length}: ${lid} error`,
              percent: Math.round((completedCount / queries.length) * 70),
              llmDone: { ...llmDone },
              activeLLMs: [...activeSet],
              queryCount: queries.length,
            });
            return { lid, result: { ok: false, error: err.message } };
          });
      });

      const askResultsList = await Promise.all(llmPromises);
      apiCalls += llmIds.length;

      // Wave 2: Batch-analyze ALL responses in ONE Claude call
      onProgress?.({
        phase: "analyzing",
        current: completedCount * llmIds.length + llmIds.length,
        total: totalSteps,
        query: q.query.substring(0, 60),
        status: `Q${qi + 1}/${queries.length}: Analyzing responses...`,
        percent: Math.round((completedCount / queries.length) * 70),
        llmDone: { ...llmDone },
        activeLLMs: [],
        queryCount: queries.length,
      });

      const successfulResponses = {};
      const responseTexts = {};
      askResultsList.forEach(({ lid, result }) => {
        if (result?.ok) {
          successfulResponses[lid] = result.text;
          responseTexts[lid] = result;
        } else {
          const errMsg = result?.error || "LLM call failed";
          errors.push({ qid: q.id, llm: lid, error: errMsg });
          partialFailures++;
          analyses[lid] = { ...ERROR_ANALYSIS, gaps: [errMsg], _error: errMsg };
        }
      });

      if (Object.keys(successfulResponses).length > 0) {
        apiCalls++;
        const batchResult = await analyzeBatch(q.query, successfulResponses, company, onRetry, 45000);

        Object.entries(batchResult).forEach(([llmId, analysis]) => {
          if (!analysis || analysis._error) {
            analyses[llmId] = analysis || { ...ERROR_ANALYSIS, _error: "Missing from batch" };
            return;
          }
          const resp = responseTexts[llmId];
          analysis.response_snippet = resp?.text?.substring(0, 300) || "";
          analysis.full_response = resp?.text || "";
          if (resp?.citations?.length > 0) {
            const existing = new Set((analysis.cited_sources || []).map(s => s.domain));
            resp.citations.forEach(url => {
              try {
                const d = new URL(url).hostname.replace(/^www\./, "");
                if (!existing.has(d)) {
                  (analysis.cited_sources = analysis.cited_sources || []).push({ domain: d, type: "other", context: "Cited by Perplexity", url });
                  existing.add(d);
                }
              } catch {}
            });
          }
          const sources = analysis.cited_sources || [];
          if (typeof analysis.citation_presence !== "boolean") analysis.citation_presence = sources.length > 0;
          if (typeof analysis.sirion_content_cited !== "boolean") {
            analysis.sirion_content_cited = sources.some(s => /sirion/i.test(s.domain) || /sirionlabs/i.test(s.domain));
          }
          analyses[llmId] = analysis;
        });

        llmIds.forEach(id => {
          if (!analyses[id]) analyses[id] = { ...ERROR_ANALYSIS, _error: "Not in batch result" };
        });
      }

      const difficulty = scoreDifficulty(analyses);
      const resultItem = {
        qid: q.id, query: q.query, persona: q.persona, stage: q.stage,
        cw: q.cw, lifecycle: q.lifecycle || "full-stack", analyses, difficulty,
      };
      results.push(resultItem);

      if (onResultReady) {
        try { await onResultReady(resultItem, qi, queries.length); }
        catch (e) { errors.push({ qid: q.id, llm: "_save", error: "Incremental save failed: " + e.message }); }
      }

      completedCount++;
      onProgress?.({
        phase: "analyzed",
        current: completedCount,
        total: queries.length,
        query: q.query.substring(0, 60),
        status: `${completedCount}/${queries.length} questions done`,
        percent: 70 + Math.round((completedCount / queries.length) * 30),
        llmDone: { ...llmDone },
        activeLLMs: [],
        queryCount: queries.length,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e; // always propagate user cancellation
      // Any unexpected error → record as failed result so the scan continues
      console.warn(`[processQuery Q${qi + 1}] Unexpected error, continuing scan:`, e.message);
      const fallbackAnalyses = {};
      llmIds.forEach(id => { fallbackAnalyses[id] = { ...ERROR_ANALYSIS, _error: e.message }; });
      partialFailures++;
      const resultItem = {
        qid: q.id, query: q.query, persona: q.persona, stage: q.stage,
        cw: q.cw, lifecycle: q.lifecycle || "full-stack",
        analyses: fallbackAnalyses, difficulty: scoreDifficulty(fallbackAnalyses),
      };
      results.push(resultItem);
      if (onResultReady) {
        try { await onResultReady(resultItem, qi, queries.length); } catch (e) { console.warn(`[processQuery Q${qi + 1}] onResultReady save failed:`, e.message); }
      }
      completedCount++;
    }
  }

  // ── Sliding window: keep PIPELINE_WIDTH queries in flight simultaneously ──
  // As each query finishes, the next one starts immediately — no idle gaps.
  // The per-LLM throttle() handles rate limiting transparently.
  const inFlight = new Set();
  for (let qi = 0; qi < queries.length; qi++) {
    if (abortSignal?.aborted) throw new DOMException("Scan aborted by user", "AbortError");

    const p = processQuery(qi);
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));

    if (inFlight.size >= PIPELINE_WIDTH) {
      // Wait for the fastest in-flight query to finish before queuing another
      await Promise.race([...inFlight]);
    }
  }
  // Drain remaining in-flight queries
  await Promise.all([...inFlight]);

  // Compute aggregate scores
  const scores = computeScores(results, llmIds);

  const scanResult = {
    id: "scan-" + Date.now(),
    date: new Date().toISOString(),
    count: results.length,
    llms: llmIds,
    company,
    results,
    scores,
    errors,
    retries: retryCount,
    partialFailures,
    cost: {
      apiCalls,
      estimated: +(apiCalls * 0.004).toFixed(2),
      display: (apiCalls * 0.004).toFixed(2),
    },
    duration: Date.now() - startTime,
  };

  onProgress?.({
    phase: "complete",
    current: totalSteps,
    total: totalSteps,
    status: partialFailures > 0
      ? `Scan complete! (${partialFailures} partial failures, ${retryCount} retries)`
      : retryCount > 0
        ? `Scan complete! (${retryCount} retries handled)`
        : "Scan complete!",
    percent: 100,
    llmDone: { ...llmDone },
    activeLLMs: [],
    queryCount: queries.length,
  });

  return scanResult;
}

/* ───────────────────────────────────────────────
   SCORE AGGREGATION
   ─────────────────────────────────────────────── */

export function computeScores(results, llmIds) {
  let mc = 0, ps = 0, pc = 0, ss = 0, as2 = 0, cs = 0, pos2 = 0, n = 0;

  results.forEach(r => {
    llmIds.forEach(lid => {
      const a = r.analyses[lid];
      if (!a || a._error) return;
      n++;
      if (a.mentioned) mc++;
      if (a.rank) { ps += Math.max(0, 100 - (a.rank - 1) * 20); pc++; }
      ss += a.sentiment === "positive" ? 100 : a.sentiment === "neutral" ? 50 : a.sentiment === "absent" ? 0 : 20;
      as2 += (a.accuracy || 0) * 10;
      cs += (a.completeness || 0) * 10;
      pos2 += (a.positioning || 0) * 10;
    });
  });

  if (!n) return { overall: 0, mention: 0, position: 0, sentiment: 0, accuracy: 0, completeness: 0, positioning: 0 };

  const mention = Math.round((mc / n) * 100);
  const position = pc ? Math.round(ps / pc) : 0;
  const sentiment = Math.round(ss / n);
  const accuracy = Math.round(as2 / n);
  const completeness = Math.round(cs / n);
  const positioning = Math.round(pos2 / n);
  const overall = Math.round(mention * 0.35 + position * 0.40 + sentiment * 0.25);

  // Share of Voice = Sirion mentions / total vendor mentions across all queries
  let sirionMentions = 0, totalVendorMentions = 0;
  results.forEach(r => {
    llmIds.forEach(lid => {
      const a = r.analyses[lid];
      if (!a || a._error) return;
      const vendors = a.vendors_mentioned || [];
      totalVendorMentions += vendors.length;
      if (a.mentioned) sirionMentions++;
    });
  });
  const shareOfVoice = totalVendorMentions > 0 ? Math.round((sirionMentions / totalVendorMentions) * 100) : 0;

  return { overall, mention, position, sentiment, accuracy, completeness, positioning, shareOfVoice };
}

/* ───────────────────────────────────────────────
   EXPORT BUILDER — For M2→M3 bridge
   ─────────────────────────────────────────────── */

export function buildExportPayload(scanData) {
  const qData = scanData.results.map(r => {
    const a = r.analyses.claude || r.analyses.gemini || r.analyses.openai || null;
    if (!a) return null;
    const topComps = (a.vendors_mentioned || [])
      .filter(v => v.name !== scanData.company)
      .sort((x, y) => x.position - y.position)
      .map(v => ({ name: v.name, position: v.position, sentiment: v.sentiment, features: v.features || [] }));
    return {
      id: r.qid,
      query: r.query,
      persona: r.persona,
      stage: r.stage,
      sirionMentioned: a.mentioned || false,
      sirionRank: a.rank || null,
      sirionSentiment: a.sentiment || "absent",
      difficulty: r.difficulty?.composite || null,
      contentGaps: a.content_gaps || [],
      threats: a.threats || [],
      recommendation: a.recommendation || "",
      topCompetitors: topComps,
    };
  }).filter(Boolean);

  const personaBk = {};
  const stageBk = {};
  qData.forEach(q => {
    if (!personaBk[q.persona]) personaBk[q.persona] = { total: 0, mentioned: 0 };
    personaBk[q.persona].total++;
    if (q.sirionMentioned) personaBk[q.persona].mentioned++;
    if (!stageBk[q.stage]) stageBk[q.stage] = { total: 0, mentioned: 0 };
    stageBk[q.stage].total++;
    if (q.sirionMentioned) stageBk[q.stage].mentioned++;
  });

  const allGaps = [];
  const allRecs = [];
  qData.forEach(q => {
    q.contentGaps.forEach(g => { if (!allGaps.includes(g)) allGaps.push(g); });
    if (q.recommendation && !allRecs.includes(q.recommendation)) allRecs.push(q.recommendation);
  });

  return {
    source: "xtrusio-perception-monitor",
    exportDate: new Date().toISOString(),
    company: scanData.company,
    scores: scanData.scores,
    totalQueries: qData.length,
    queries: qData,
    personaBreakdown: Object.entries(personaBk).map(([p, d]) => ({
      persona: p,
      mentionRate: d.total ? Math.round((d.mentioned / d.total) * 100) : 0,
      total: d.total,
    })),
    stageBreakdown: Object.entries(stageBk).map(([s, d]) => ({
      stage: s,
      mentionRate: d.total ? Math.round((d.mentioned / d.total) * 100) : 0,
      total: d.total,
    })),
    allContentGaps: allGaps,
    allRecommendations: allRecs,
  };
}

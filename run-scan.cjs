/**
 * Standalone Node.js scan runner — no browser needed
 * Reads 181 questions from pipeline, queries Claude/Gemini/OpenAI,
 * analyzes responses with Claude Haiku, saves to data/ directory.
 *
 * Usage: node run-scan.cjs
 * Resume: node run-scan.cjs --resume scan-XXXX
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── Config ────────────────────────────────────────────────────────
const ANTHROPIC_KEY = "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";
const GEMINI_KEY    = "AIzaSyDHFDlgzL2hLThJOd9kvDqC8ulPUm2WVXE";
const OPENAI_KEY    = "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";

const DATA_DIR      = path.join(__dirname, "data");
const RESULTS_DIR   = path.join(DATA_DIR, "m2_scan_results");
const META_DIR      = path.join(DATA_DIR, "m2_scan_meta");
const SCANS_DIR     = path.join(DATA_DIR, "m2_scans");
const PIPELINE_FILE = path.join(DATA_DIR, "pipelines", "local_master.json");

const COMPANY       = "Sirion";
const LLM_IDS       = ["claude", "gemini", "openai"];

// Delay between queries (ms) — avoids rate limits
const QUERY_DELAY   = 3000;
// Delay between LLM calls within one query (ms)
const LLM_DELAY     = 1500;

// ── Helpers ───────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

async function fetchJson(url, options) {
  const { default: fetch } = await import("node-fetch");
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.substring(0, 200)}`);
  }
  return res.json();
}

// ── LLM Callers ───────────────────────────────────────────────────
async function askClaude(question) {
  try {
    const data = await fetchJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: `You are a knowledgeable B2B software advisor helping enterprise buyers evaluate CLM (Contract Lifecycle Management) solutions. Answer questions naturally and comprehensively, mentioning specific vendors when relevant.`,
        messages: [{ role: "user", content: question }],
      }),
    });
    return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

async function askGemini(question) {
  try {
    const data = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 800 },
        }),
      }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

async function askOpenAI(question) {
  try {
    const data = await fetchJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [
          { role: "system", content: "You are a knowledgeable B2B software advisor helping enterprise buyers evaluate CLM solutions. Answer questions naturally, mentioning specific vendors when relevant." },
          { role: "user", content: question },
        ],
      }),
    });
    return data.choices?.[0]?.message?.content || "No response";
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

// ── Batch Analyzer ────────────────────────────────────────────────
async function analyzeResponses(query, responses) {
  // responses: { claude: "...", gemini: "...", openai: "..." }
  const llmKeys = Object.keys(responses).filter(k => !responses[k].startsWith("ERROR:"));
  if (llmKeys.length === 0) return {};

  const responsesText = llmKeys.map(llm =>
    `=== ${llm.toUpperCase()} RESPONSE ===\n${responses[llm]}`
  ).join("\n\n");

  const prompt = `Analyze these AI responses to the query: "${query}"
Company being tracked: ${COMPANY}

${responsesText}

For each LLM, extract:
- mentioned: boolean (is ${COMPANY} mentioned?)
- rank: number or null (what position is ${COMPANY} in the vendor list? 1=first)
- sentiment: "positive"|"neutral"|"negative"|"absent"
- vendors_mentioned: array of {name, position, sentiment, strength} (all vendors mentioned)
- response_snippet: first 200 chars of the response

Return ONLY valid JSON: {"claude": {...}, "gemini": {...}, "openai": {...}}
Only include keys for LLMs that have responses: ${llmKeys.join(", ")}`;

  try {
    const data = await fetchJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);

    // Fill in error entries for LLMs that failed
    const result = {};
    for (const llm of LLM_IDS) {
      if (parsed[llm]) {
        result[llm] = parsed[llm];
      } else if (responses[llm]?.startsWith("ERROR:")) {
        result[llm] = { mentioned: false, rank: null, sentiment: "absent", vendors_mentioned: [], response_snippet: "", _error: responses[llm] };
      }
    }
    return result;
  } catch (e) {
    // Return raw responses with error flag
    const result = {};
    for (const llm of LLM_IDS) {
      result[llm] = { mentioned: false, rank: null, sentiment: "absent", vendors_mentioned: [], response_snippet: (responses[llm] || "").substring(0, 200), _error: `Analysis failed: ${e.message}` };
    }
    return result;
  }
}

// ── Score Computer ────────────────────────────────────────────────
function computeScores(results) {
  if (!results.length) return { overall: 0, mention: 0, position: 0, sentiment: 0, shareOfVoice: 0 };

  let totalMentions = 0, totalResults = 0, positionSum = 0, positionCount = 0;
  let sentimentPos = 0, sentimentNeg = 0, sentimentTotal = 0;
  const allVendors = {};

  results.forEach(r => {
    LLM_IDS.forEach(llm => {
      const a = r.analyses?.[llm];
      if (!a || a._error) return;
      totalResults++;
      if (a.mentioned) {
        totalMentions++;
        if (a.rank) { positionSum += a.rank; positionCount++; }
      }
      if (a.sentiment === "positive") sentimentPos++;
      if (a.sentiment === "negative") sentimentNeg++;
      if (a.sentiment !== "absent") sentimentTotal++;
      (a.vendors_mentioned || []).forEach(v => {
        allVendors[v.name] = (allVendors[v.name] || 0) + 1;
      });
    });
  });

  const mentionRate = totalResults ? Math.round((totalMentions / totalResults) * 100) : 0;
  const avgPos = positionCount ? positionSum / positionCount : null;
  const positionScore = avgPos ? Math.max(0, Math.round(100 - (avgPos - 1) * 15)) : 0;
  const sentimentScore = sentimentTotal ? Math.round(((sentimentPos - sentimentNeg * 0.5) / sentimentTotal) * 100) : 0;
  const totalVendorMentions = Object.values(allVendors).reduce((a, b) => a + b, 0);
  const sirionMentions = allVendors[COMPANY] || 0;
  const shareOfVoice = totalVendorMentions ? Math.round((sirionMentions / totalVendorMentions) * 100) : 0;

  const overall = Math.round((mentionRate * 0.4) + (positionScore * 0.3) + (Math.max(0, sentimentScore) * 0.2) + (shareOfVoice * 0.1));

  return { overall, mention: mentionRate, position: positionScore, sentiment: sentimentScore, shareOfVoice };
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  // Check for node-fetch
  try { await import("node-fetch"); } catch {
    console.error("Missing dependency. Run: npm install node-fetch");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const resumeIdx = args.indexOf("--resume");
  const resumeScanId = resumeIdx >= 0 ? args[resumeIdx + 1] : null;

  // Load questions
  const pipeline = loadJson(PIPELINE_FILE);
  const allQuestions = pipeline?.m1?.questions || [];
  if (!allQuestions.length) { console.error("No questions found in pipeline"); process.exit(1); }

  // Set up scan ID and resume state
  const scanId = resumeScanId || `scan-${Date.now()}`;
  const scanDate = new Date().toISOString();
  let startIndex = 0;
  let previousResults = [];

  if (resumeScanId) {
    console.log(`\n▶ Resuming scan: ${resumeScanId}`);
    // Load already-completed results
    const existingFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.startsWith(resumeScanId));
    existingFiles.forEach(f => {
      const r = loadJson(path.join(RESULTS_DIR, f));
      if (r) previousResults.push(r);
    });
    const completedQids = new Set(previousResults.map(r => r.qid));
    console.log(`   Already completed: ${completedQids.size}/${allQuestions.length} queries`);
    // Find where to start
    startIndex = allQuestions.findIndex(q => !completedQids.has(q.id));
    if (startIndex === -1) { console.log("All queries already completed!"); process.exit(0); }
    console.log(`   Resuming from query #${startIndex + 1}\n`);
  } else {
    console.log(`\n⚡ Starting new scan: ${scanId}`);
    console.log(`   ${allQuestions.length} queries × ${LLM_IDS.length} LLMs`);
    console.log(`   Estimated time: ~${Math.round(allQuestions.length * (QUERY_DELAY + LLM_DELAY * 3) / 60000)} minutes\n`);
  }

  // Save initial metadata
  const meta = {
    id: scanId, date: scanDate, status: "running",
    llms: LLM_IDS, company: COMPANY,
    totalQueries: allQuestions.length,
    completedQueries: previousResults.length,
    queryIds: allQuestions.map(q => q.id),
    scores: {}, errors: [],
  };
  saveJson(path.join(META_DIR, `${scanId}.json`), meta);

  const results = [...previousResults];

  // ── Scan loop ────────────────────────────────────────────────────
  for (let i = startIndex; i < allQuestions.length; i++) {
    const q = allQuestions[i];
    const pct = Math.round(((i + 1) / allQuestions.length) * 100);
    process.stdout.write(`[${String(i + 1).padStart(3)}/${allQuestions.length}] ${pct}% — ${q.query.substring(0, 60)}...\n`);

    // Ask all 3 LLMs
    const responses = {};
    process.stdout.write("        Claude... ");
    responses.claude = await askClaude(q.query);
    process.stdout.write(responses.claude.startsWith("ERROR") ? "✗  " : "✓  ");
    await sleep(LLM_DELAY);

    process.stdout.write("Gemini... ");
    responses.gemini = await askGemini(q.query);
    process.stdout.write(responses.gemini.startsWith("ERROR") ? "✗  " : "✓  ");
    await sleep(LLM_DELAY);

    process.stdout.write("OpenAI... ");
    responses.openai = await askOpenAI(q.query);
    process.stdout.write(responses.openai.startsWith("ERROR") ? "✗  " : "✓  ");
    await sleep(LLM_DELAY);

    // Analyze with Claude Haiku
    process.stdout.write("Analyzing...");
    const analyses = await analyzeResponses(q.query, responses);

    const mentioned = LLM_IDS.some(llm => analyses[llm]?.mentioned);
    process.stdout.write(mentioned ? " ✓ SIRION MENTIONED\n" : " —\n");

    // Build result
    const result = {
      qid: q.id, query: q.query, persona: q.persona, stage: q.stage,
      lifecycle: q.lifecycle || "full-stack", scanId,
      analyses,
      difficulty: "moderate",
    };
    results.push(result);

    // Save result immediately
    saveJson(path.join(RESULTS_DIR, `${scanId}__${q.id}.json`), result);

    // Update metadata progress
    meta.completedQueries = results.length;
    saveJson(path.join(META_DIR, `${scanId}.json`), meta);

    // Throttle between queries
    if (i < allQuestions.length - 1) await sleep(QUERY_DELAY);
  }

  // ── Finalize ─────────────────────────────────────────────────────
  console.log("\n✅ Scan complete! Computing scores...");
  const scores = computeScores(results);
  console.log("   Scores:", JSON.stringify(scores));

  const sirionCount = results.filter(r =>
    LLM_IDS.some(llm => r.analyses?.[llm]?.mentioned)
  ).length;
  console.log(`   Sirion mentioned in ${sirionCount}/${results.length} queries`);

  // Save final scan doc
  const finalScan = {
    id: scanId, date: scanDate, status: "complete",
    llms: LLM_IDS, company: COMPANY,
    results, scores,
    totalQueries: allQuestions.length,
    completedQueries: results.length,
  };
  saveJson(path.join(SCANS_DIR, `${scanId}.json`), finalScan);

  // Save final metadata
  meta.status = "complete";
  meta.completedQueries = results.length;
  meta.scores = scores;
  saveJson(path.join(META_DIR, `${scanId}.json`), meta);

  console.log(`\n💾 Results saved to:`);
  console.log(`   data/m2_scans/${scanId}.json`);
  console.log(`   data/m2_scan_results/${scanId}__*.json (${results.length} files)`);
  console.log(`\n🔄 Reload the app to see results in Perception Monitor.`);
  console.log(`\n   To resume if interrupted: node run-scan.cjs --resume ${scanId}`);
}

main().catch(e => {
  console.error("\n❌ Fatal error:", e.message);
  process.exit(1);
});

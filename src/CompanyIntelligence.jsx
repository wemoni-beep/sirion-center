import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { callClaude } from "./claudeApi.js";
import { FONT } from "./typography";

/* ═══════════════════════════════════════════════════════
   COMPANY INTELLIGENCE — Phase 0: Demand Map Engine
   Research company → Identify personas → Build demand map
   ═══════════════════════════════════════════════════════ */

/* ── Design Tokens ── */
const T_DARK = {
  bg: "#060A0E", card: "#111921", border: "rgba(45,212,191,0.08)",
  text: "#E8ECF1", textDim: "#8B95A5", textGhost: "#4B5563",
  brand: "#2dd4bf", brandDim: "#0d9488", brandBg: "rgba(45,212,191,0.06)",
  accent2: "#818cf8", accent3: "#f59e0b", danger: "#ef4444", success: "#22c55e",
  info: "#3b82f6", competitive: "#f97316", authority: "#a78bfa",
  inputBg: "#0C1318", inputBorder: "rgba(45,212,191,0.15)",
};
const T_LIGHT = {
  ...T_DARK,
  bg: "#f7f7f8", card: "#ffffff", border: "rgba(0,0,0,0.08)",
  text: "#18181b", textDim: "#52525b", textGhost: "#a1a1aa",
  brand: "#0d9488", brandDim: "#0d9488", brandBg: "rgba(13,148,136,0.06)",
  inputBg: "#ffffff", inputBorder: "rgba(0,0,0,0.15)",
};
let T = { ...T_DARK };

/* ── System Prompts ── */
const COMPANY_RESEARCH_PROMPT = `You are an expert B2B market research analyst with deep industry knowledge.

Research the target company thoroughly using web search. Produce a comprehensive intelligence report.

OUTPUT FORMAT — Respond ONLY with valid JSON:
{
  "overview": "2-3 paragraph company description covering what they do, their market position, and recent trajectory",
  "productsServices": [
    { "name": "Product Name", "description": "What it does and who uses it", "category": "primary|secondary|emerging" }
  ],
  "targetMarket": {
    "segments": ["Enterprise", "Mid-Market"],
    "geography": ["North America", "Europe"],
    "companySize": ["1000+ employees"],
    "industries": ["Financial Services", "Healthcare"]
  },
  "competitors": [
    { "name": "Competitor", "url": "https://...", "differentiator": "Their key advantage", "threatLevel": "high|medium|low", "overlap": "Where they compete directly" }
  ],
  "recentNews": [
    { "headline": "Brief headline", "date": "YYYY-MM or YYYY-MM-DD", "relevance": "Why it matters for competitive positioning" }
  ],
  "marketPosition": "One paragraph on market standing, analyst recognition, and trajectory",
  "keyFindings": ["finding1", "finding2", "finding3", "finding4", "finding5"]
}

RULES:
- Research the actual company website and recent web sources
- Identify 5-8 direct competitors with real differentiators
- Recent news from last 12 months only
- Be specific and factual, not generic
- If URL is provided, fetch and analyze it
- Focus on B2B positioning and competitive dynamics`;

const PERSONA_RESEARCH_PROMPT = `You are a senior B2B sales intelligence analyst. Given a company profile, identify the key decision makers and build buyer personas.

You will receive:
- Company overview, products, market, and competitors from prior research

For each persona, assign a "decisionWeight" from 0-100 representing their influence in the buying process. Weights MUST sum to 100 across all personas.

OUTPUT FORMAT — Respond ONLY with valid JSON:
{
  "decisionMakers": [
    {
      "title": "Chief Procurement Officer",
      "role": "Primary budget holder and strategic decision maker",
      "influence": "high|medium|low",
      "buyingCriteria": ["ROI", "integration", "compliance"],
      "painPoints": ["manual processes", "lack of visibility"],
      "goals": ["reduce cycle time", "improve compliance"]
    }
  ],
  "buyerPersonas": [
    {
      "id": "cpo",
      "label": "CPO / Head of Procurement",
      "title": "Chief Procurement Officer",
      "decisionWeight": 45,
      "description": "Owns procurement strategy and vendor relationships",
      "painPoints": ["Manual contract workflows", "No spend visibility"],
      "goals": ["Automate procurement", "Reduce contract cycle time"],
      "buyingCriteria": ["ROI within 12 months", "Integration with ERP"],
      "informationNeeds": ["Vendor comparisons", "ROI calculators", "Case studies"],
      "preferredChannels": ["Analyst reports", "Peer reviews", "Demo sessions"]
    }
  ]
}

RULES:
- Identify 3-6 distinct personas (typical B2B buying committee)
- Decision weights MUST sum to 100
- Higher weight = more influence on final decision
- Pain points and goals must be specific to THIS company's industry
- Include both economic buyers (budget) and technical evaluators`;

function buildDemandMapPrompt(persona, competitors, questionCount, demandSplit) {
  return `You are an AI search behavior analyst. Generate ${questionCount} buyer-intent queries that real people would type into ChatGPT, Gemini, or Claude when researching solutions.

TARGET PERSONA: ${persona.label} (${persona.title})
- Decision Weight: ${persona.decisionWeight}%
- Pain Points: ${persona.painPoints?.join(", ")}
- Goals: ${persona.goals?.join(", ")}
- Buying Criteria: ${persona.buyingCriteria?.join(", ")}

COMPETITORS: ${competitors.map(c => c.name).join(", ")}

Generate EXACTLY:
- ${demandSplit.information} INFORMATION DEMAND queries (awareness/discovery stage)
  These are category-level searches: "best [category] for [use case]", "what is [concept]", "top [vendors] for [industry]"
- ${demandSplit.competitive} COMPETITIVE DEMAND queries (consideration/evaluation stage)
  These are comparison searches: "[vendor] vs [competitor]", "alternatives to [vendor]", "[vendor] pricing"
- ${demandSplit.authority} AUTHORITY DEMAND queries (evaluation/decision stage)
  These are trust/validation searches: "[vendor] reviews", "[category] analyst reports", "[vendor] case studies"

OUTPUT FORMAT — Respond ONLY with valid JSON:
{
  "questions": [
    {
      "question": "The exact query a buyer would type into AI",
      "demandType": "information|competitive|authority",
      "stage": "awareness|discovery|consideration|evaluation|decision",
      "competitor": null or "CompetitorName",
      "cluster": "topic cluster keyword",
      "lifecycle": "pre-signature|post-signature|full-stack",
      "confidence": 0.85
    }
  ]
}

RULES:
- Write as REAL SEARCH QUERIES, not academic questions
- Each stage (awareness, discovery, consideration, evaluation, decision) must have at least 1 question
- Competitive queries must reference specific competitor names
- Authority queries must reference the target company by name
- Lifecycle maps to: pre-signature (authoring, negotiation), post-signature (obligations, compliance), full-stack (end-to-end)
- Confidence: 0.9+ for high-volume queries, 0.7-0.9 for niche, 0.5-0.7 for speculative`;
}

/* ── Demand Map Allocation Engine ── */
function computeDemandAllocation(personas) {
  const BASE_PER_PERSONA = 5;
  const BONUS_POOL = 15; // distributed by weight
  const totalBase = personas.length * BASE_PER_PERSONA;

  const allocation = personas.map(p => {
    const bonus = Math.round((p.decisionWeight / 100) * BONUS_POOL);
    const total = BASE_PER_PERSONA + bonus;
    const info = Math.round(total * 0.40);
    const comp = Math.round(total * 0.35);
    const auth = total - info - comp; // remainder ensures sum = total
    return {
      persona: p.label,
      personaId: p.id,
      weight: p.decisionWeight,
      baseCount: BASE_PER_PERSONA,
      bonusCount: bonus,
      totalCount: total,
      infoCount: info,
      compCount: comp,
      authCount: auth,
    };
  });

  const totalQuestions = allocation.reduce((s, a) => s + a.totalCount, 0);
  const dimensions = {
    information: allocation.reduce((s, a) => s + a.infoCount, 0),
    competitive: allocation.reduce((s, a) => s + a.compCount, 0),
    authority: allocation.reduce((s, a) => s + a.authCount, 0),
  };

  return { totalQuestions, dimensions, perPersona: allocation };
}

/* ── Hash for dedup ── */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ════════════════════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════════════════════ */

export default function CompanyIntelligence({ onNavigate }) {
  const _globalTheme = useTheme();
  T = _globalTheme.mode === "light" ? { ...T_LIGHT } : { ...T_DARK };

  const { pipeline, updateModule, updateMeta } = usePipeline();
  const intel = pipeline?.intel || {};

  /* ── Local State ── */
  const [companyName, setCompanyName] = useState(intel.companyName || pipeline?.meta?.company || "");
  const [companyUrl, setCompanyUrl] = useState(intel.companyUrl || pipeline?.meta?.url || "");
  const [industry, setIndustry] = useState(intel.industry || pipeline?.meta?.industry || "");
  const [activeTab, setActiveTab] = useState("overview");
  const [researchPhase, setResearchPhase] = useState(intel.researchPhase || "idle");
  const [progress, setProgress] = useState({ step: 0, total: 0, message: "" });
  const [error, setError] = useState(intel.error || null);
  const [expandedPersona, setExpandedPersona] = useState(null);
  const [questionFilter, setQuestionFilter] = useState({ persona: "all", demandType: "all", stage: "all" });
  const [pushResult, setPushResult] = useState(null);
  const abortRef = useRef(false);

  // Stage coverage heatmap data (for Demand Map tab)
  const heatmapData = useMemo(() => {
    const qs = intel.questions || [];
    const personas = intel.buyerPersonas || [];
    const stages = ["awareness", "discovery", "consideration", "evaluation", "decision"];
    const map = {};
    personas.forEach(p => {
      map[p.label] = {};
      stages.forEach(s => { map[p.label][s] = 0; });
    });
    qs.forEach(q => {
      if (map[q.persona] && map[q.persona][q.stage] !== undefined) {
        map[q.persona][q.stage]++;
      }
    });
    return map;
  }, [intel.questions, intel.buyerPersonas]);

  // Sync from pipeline on load
  useEffect(() => {
    if (intel.companyName && !companyName) setCompanyName(intel.companyName);
    if (intel.companyUrl && !companyUrl) setCompanyUrl(intel.companyUrl);
    if (intel.industry && !industry) setIndustry(intel.industry);
    if (intel.researchPhase === "complete") setResearchPhase("complete");
  }, [intel.companyName]);

  const hasResults = researchPhase === "complete" && intel.companyName;

  /* ── Research Flow ── */
  const runResearch = useCallback(async () => {
    if (!companyName.trim()) { setError("Enter a company name"); return; }
    abortRef.current = false;
    setError(null);
    setResearchPhase("researching");
    setProgress({ step: 1, total: 3, message: "Researching company..." });

    try {
      // ── Call 1: Company Research ──
      const userMsg = `Research this company:\nName: ${companyName.trim()}\n${companyUrl ? `URL: ${companyUrl.trim()}\n` : ""}${industry ? `Industry: ${industry.trim()}` : ""}`;
      const r1 = await callClaude(COMPANY_RESEARCH_PROMPT, userMsg);
      if (abortRef.current) return;

      // Save partial results
      updateModule("intel", {
        companyName: companyName.trim(),
        companyUrl: companyUrl.trim() || null,
        industry: industry.trim() || r1.targetMarket?.industries?.[0] || null,
        overview: r1.overview || null,
        productsServices: r1.productsServices || [],
        targetMarket: r1.targetMarket || null,
        competitors: r1.competitors || [],
        recentNews: r1.recentNews || [],
        marketPosition: r1.marketPosition || null,
        keyFindings: r1.keyFindings || [],
        researchPhase: "researching",
      });

      // ── Call 2: Decision Makers & Personas ──
      setProgress({ step: 2, total: 3, message: "Identifying decision makers..." });
      await new Promise(r => setTimeout(r, 2000)); // rate limit delay

      const context2 = `Company: ${companyName}\nIndustry: ${industry || r1.targetMarket?.industries?.[0] || "B2B Software"}\n\nOverview: ${r1.overview}\n\nProducts: ${JSON.stringify(r1.productsServices?.slice(0, 5))}\n\nCompetitors: ${r1.competitors?.map(c => c.name).join(", ")}`;
      const r2 = await callClaude(PERSONA_RESEARCH_PROMPT, context2);
      if (abortRef.current) return;

      const personas = r2.buyerPersonas || [];

      // Save personas
      updateModule("intel", {
        decisionMakers: r2.decisionMakers || [],
        buyerPersonas: personas,
      });

      // ── Call 3: Demand Map Generation (per persona) ──
      setResearchPhase("generating");
      const demandMap = computeDemandAllocation(personas);
      const allQuestions = [];

      for (let i = 0; i < personas.length; i++) {
        if (abortRef.current) return;
        const p = personas[i];
        const alloc = demandMap.perPersona[i];
        setProgress({
          step: 3,
          total: 3,
          message: `Generating questions for ${p.label} (${i + 1}/${personas.length})...`,
        });

        if (i > 0) await new Promise(r => setTimeout(r, 2000)); // rate limit delay

        const prompt = buildDemandMapPrompt(
          p,
          r1.competitors || [],
          alloc.totalCount,
          { information: alloc.infoCount, competitive: alloc.compCount, authority: alloc.authCount }
        );

        try {
          const r3 = await callClaude(prompt, `Generate ${alloc.totalCount} buyer-intent queries for ${p.label} at ${companyName}`);
          const qs = (r3.questions || []).map((q, idx) => ({
            ...q,
            id: `intel-${djb2(q.question)}-${Date.now()}-${idx}`,
            persona: p.label,
            personaId: p.id,
            personaWeight: p.decisionWeight,
          }));
          allQuestions.push(...qs);
        } catch (err) {
          console.warn(`[Intel] Question gen failed for ${p.label}:`, err.message);
          // Continue with other personas
        }
      }

      // ── Save final results ──
      const genId = crypto.randomUUID ? crypto.randomUUID() : `gen-${Date.now()}`;
      const now = new Date().toISOString();

      updateModule("intel", {
        demandMap,
        questions: allQuestions,
        researchedAt: now,
        generationId: genId,
        researchPhase: "complete",
        error: null,
      });

      // Update global meta
      updateMeta({
        company: companyName.trim(),
        url: companyUrl.trim() || pipeline?.meta?.url,
        industry: industry.trim() || pipeline?.meta?.industry,
      });

      setResearchPhase("complete");
      setProgress({ step: 3, total: 3, message: "Complete" });
      setActiveTab("overview");

    } catch (err) {
      console.error("[Intel] Research failed:", err);
      setError(err.message || "Research failed");
      setResearchPhase("error");
      updateModule("intel", { researchPhase: "error", error: err.message });
    }
  }, [companyName, companyUrl, industry, updateModule, updateMeta, pipeline?.meta]);

  /* ── Push to M1 ── */
  const pushToM1 = useCallback(() => {
    const intelQs = intel.questions || [];
    if (!intelQs.length) return;

    const existingQs = pipeline?.m1?.questions || [];
    const existingHashes = new Set(existingQs.map(q => q.dedupHash || djb2(q.query || q.question || "")));

    const newQs = intelQs
      .filter(q => !existingHashes.has(djb2(q.question)))
      .map((q, i) => ({
        id: `intel-${djb2(q.question)}-${Date.now()}-${i}`,
        query: q.question,
        persona: q.persona,
        stage: q.stage,
        cluster: q.cluster,
        lifecycle: q.lifecycle,
        source: "intel",
        demandType: q.demandType,
        personaWeight: q.personaWeight,
        confidence: q.confidence,
        competitor: q.competitor || null,
        company: intel.companyName,
        companyUrl: intel.companyUrl,
        generatedAt: intel.researchedAt,
        dedupHash: djb2(q.question),
      }));

    if (newQs.length > 0) {
      updateModule("m1", { questions: [...existingQs, ...newQs] });
    }

    return newQs.length;
  }, [intel, pipeline?.m1?.questions, updateModule]);

  /* ── Filtered Questions ── */
  const filteredQuestions = useMemo(() => {
    return (intel.questions || []).filter(q => {
      if (questionFilter.persona !== "all" && q.persona !== questionFilter.persona) return false;
      if (questionFilter.demandType !== "all" && q.demandType !== questionFilter.demandType) return false;
      if (questionFilter.stage !== "all" && q.stage !== questionFilter.stage) return false;
      return true;
    });
  }, [intel.questions, questionFilter]);

  /* ── Styles ── */
  const card = (extra = {}) => ({
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px", ...extra,
  });
  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.inputBorder}`,
    background: T.inputBg, color: T.text, fontSize: 14, fontFamily: FONT.body,
    outline: "none", boxSizing: "border-box",
  };
  const btnPrimary = (disabled = false) => ({
    padding: "12px 28px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? T.textGhost : T.brand, color: "#fff", fontSize: 14, fontWeight: 700,
    fontFamily: FONT.body, opacity: disabled ? 0.5 : 1, transition: "all 0.2s",
  });
  const btnSecondary = {
    padding: "8px 18px", borderRadius: 6, border: `1px solid ${T.border}`, cursor: "pointer",
    background: "transparent", color: T.textDim, fontSize: 12, fontWeight: 600, fontFamily: FONT.mono,
  };
  const demandColor = (type) => type === "information" ? T.info : type === "competitive" ? T.competitive : T.authority;
  const stageLabel = { awareness: "Awareness", discovery: "Discovery", consideration: "Consideration", evaluation: "Evaluation", decision: "Decision" };

  /* ════════════════════════════════════════════
     RENDER — Input Form (Empty State)
     ════════════════════════════════════════════ */
  const renderInputForm = () => (
    <div style={{ maxWidth: 600, margin: "60px auto 0" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.brand, letterSpacing: 2, fontFamily: FONT.mono, textTransform: "uppercase", marginBottom: 8 }}>
          Phase 0
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, fontFamily: FONT.heading }}>
          Company Intelligence
        </h2>
        <p style={{ fontSize: 13, color: T.textDim, marginTop: 8, lineHeight: 1.5 }}>
          Research your target company to build a demand map. AI will identify competitors, buyer personas, and generate strategic queries.
        </p>
      </div>

      <div style={card({ padding: "28px 32px" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: T.textDim, fontFamily: FONT.mono, letterSpacing: 1, display: "block", marginBottom: 6 }}>
              COMPANY NAME *
            </label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g., Sirion" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: T.textDim, fontFamily: FONT.mono, letterSpacing: 1, display: "block", marginBottom: 6 }}>
              COMPANY URL
            </label>
            <input value={companyUrl} onChange={e => setCompanyUrl(e.target.value)}
              placeholder="https://sirion.ai" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: T.textDim, fontFamily: FONT.mono, letterSpacing: 1, display: "block", marginBottom: 6 }}>
              INDUSTRY
            </label>
            <input value={industry} onChange={e => setIndustry(e.target.value)}
              placeholder="e.g., Contract Lifecycle Management" style={inputStyle} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 6, background: "rgba(239,68,68,0.1)", color: T.danger, fontSize: 12, fontFamily: FONT.mono }}>
            {error}
          </div>
        )}

        <button onClick={runResearch} disabled={!companyName.trim() || researchPhase === "researching" || researchPhase === "generating"}
          style={{ ...btnPrimary(!companyName.trim()), width: "100%", marginTop: 20 }}>
          Research Company
        </button>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════
     RENDER — Progress (Researching State)
     ════════════════════════════════════════════ */
  const renderProgress = () => {
    const steps = [
      { n: 1, label: "Company Research", desc: "Analyzing website and market position" },
      { n: 2, label: "Decision Makers", desc: "Identifying key personas and decision weights" },
      { n: 3, label: "Demand Map", desc: "Generating buyer-intent queries per persona" },
    ];
    const current = progress.step || 1;

    return (
      <div style={{ maxWidth: 600, margin: "60px auto 0" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: FONT.heading }}>
            Researching {companyName}...
          </h2>
          <p style={{ fontSize: 12, color: T.textDim, marginTop: 6 }}>
            {progress.message}
          </p>
        </div>

        <div style={card({ padding: "24px 28px" })}>
          {steps.map((s, i) => {
            const isDone = current > s.n;
            const isActive = current === s.n;
            const isPending = current < s.n;
            return (
              <div key={s.n} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: i < steps.length - 1 ? 20 : 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, fontFamily: FONT.mono, flexShrink: 0,
                  background: isDone ? T.success : isActive ? T.brand : "transparent",
                  color: isDone || isActive ? "#fff" : T.textGhost,
                  border: isPending ? `1px solid ${T.border}` : "none",
                }}>
                  {isDone ? "\u2713" : s.n}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isPending ? T.textGhost : T.text }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                    {isActive ? progress.message : isPending ? "Waiting..." : "Complete"}
                  </div>
                  {isActive && (
                    <div style={{ marginTop: 8, height: 3, background: T.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        width: researchPhase === "generating" ? "60%" : "50%",
                        height: "100%", background: T.brand, borderRadius: 2,
                        animation: "pulse 1.5s ease-in-out infinite",
                      }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={() => { abortRef.current = true; setResearchPhase("idle"); }}
          style={{ ...btnSecondary, display: "block", margin: "16px auto 0" }}>
          Cancel
        </button>
      </div>
    );
  };

  /* ════════════════════════════════════════════
     RENDER — Results (Complete State)
     ════════════════════════════════════════════ */
  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "competitors", label: `Competitors (${(intel.competitors || []).length})` },
    { id: "personas", label: `Personas (${(intel.buyerPersonas || []).length})` },
    { id: "demandmap", label: `Demand Map (${(intel.questions || []).length})` },
  ];

  const renderTabBar = () => (
    <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
      {TABS.map(tab => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
          padding: "10px 18px", border: "none", cursor: "pointer",
          background: activeTab === tab.id ? T.brandBg : "transparent",
          color: activeTab === tab.id ? T.brand : T.textDim,
          fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
          fontFamily: FONT.mono, borderBottom: activeTab === tab.id ? `2px solid ${T.brand}` : "2px solid transparent",
          transition: "all 0.15s",
        }}>
          {tab.label}
        </button>
      ))}
    </div>
  );

  /* ── Tab: Overview ── */
  const renderOverview = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary */}
      <div style={card()}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 8 }}>COMPANY OVERVIEW</div>
        <div style={{ fontSize: 13, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{intel.overview || "No overview available"}</div>
      </div>

      {/* Products Grid */}
      {intel.productsServices?.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 12 }}>PRODUCTS & SERVICES</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
            {intel.productsServices.map((p, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.brandBg }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 4, lineHeight: 1.4 }}>{p.description}</div>
                {p.category && <span style={{ fontSize: 9, color: T.brand, fontFamily: FONT.mono, marginTop: 6, display: "inline-block" }}>{p.category.toUpperCase()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Position + Target Market */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={card()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 8 }}>MARKET POSITION</div>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{intel.marketPosition || "Not available"}</div>
        </div>
        <div style={card()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 8 }}>TARGET MARKET</div>
          {intel.targetMarket ? (
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.8 }}>
              {intel.targetMarket.segments?.length > 0 && <div><span style={{ color: T.textDim }}>Segments:</span> {intel.targetMarket.segments.join(", ")}</div>}
              {intel.targetMarket.geography?.length > 0 && <div><span style={{ color: T.textDim }}>Geography:</span> {intel.targetMarket.geography.join(", ")}</div>}
              {intel.targetMarket.industries?.length > 0 && <div><span style={{ color: T.textDim }}>Industries:</span> {intel.targetMarket.industries.join(", ")}</div>}
            </div>
          ) : <div style={{ color: T.textDim }}>Not available</div>}
        </div>
      </div>

      {/* Key Findings */}
      {intel.keyFindings?.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 10 }}>KEY FINDINGS</div>
          {intel.keyFindings.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: T.brandBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.brand, fontFamily: FONT.mono, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent News */}
      {intel.recentNews?.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 10 }}>RECENT NEWS</div>
          {intel.recentNews.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10, paddingBottom: 10, borderBottom: i < intel.recentNews.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: 10, color: T.textGhost, fontFamily: FONT.mono, whiteSpace: "nowrap", minWidth: 60 }}>{n.date}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{n.headline}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{n.relevance}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── Tab: Competitors ── */
  const renderCompetitors = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
      {(intel.competitors || []).map((c, i) => {
        const threatColors = { high: T.danger, medium: T.accent3, low: T.success };
        return (
          <div key={i} style={card({ position: "relative" })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{c.name}</div>
                {c.url && <div style={{ fontSize: 10, color: T.textGhost, fontFamily: FONT.mono, marginTop: 2 }}>{c.url}</div>}
              </div>
              <span style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FONT.mono,
                color: threatColors[c.threatLevel] || T.textDim,
                background: `${threatColors[c.threatLevel] || T.textGhost}18`,
                textTransform: "uppercase",
              }}>
                {c.threatLevel}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5 }}>{c.differentiator}</div>
            {c.overlap && <div style={{ fontSize: 11, color: T.textGhost, marginTop: 6, fontStyle: "italic" }}>Overlap: {c.overlap}</div>}
          </div>
        );
      })}
    </div>
  );

  /* ── Tab: Personas ── */
  const renderPersonas = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Decision Weight Summary */}
      <div style={card()}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 12 }}>DECISION WEIGHT DISTRIBUTION</div>
        <div style={{ display: "flex", gap: 4, height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
          {(intel.buyerPersonas || []).map((p, i) => {
            const colors = [T.brand, T.accent2, T.info, T.accent3, T.success, T.competitive];
            return <div key={i} style={{ width: `${p.decisionWeight}%`, background: colors[i % colors.length], borderRadius: 2 }} />;
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {(intel.buyerPersonas || []).map((p, i) => {
            const colors = [T.brand, T.accent2, T.info, T.accent3, T.success, T.competitive];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[i % colors.length] }} />
                <span style={{ fontSize: 11, color: T.text }}>{p.label}</span>
                <span style={{ fontSize: 10, color: T.textGhost, fontFamily: FONT.mono }}>{p.decisionWeight}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Persona Cards */}
      {(intel.buyerPersonas || []).map((p, i) => {
        const isExpanded = expandedPersona === i;
        const colors = [T.brand, T.accent2, T.info, T.accent3, T.success, T.competitive];
        const color = colors[i % colors.length];
        return (
          <div key={i} style={card({ cursor: "pointer", borderLeft: `3px solid ${color}` })} onClick={() => setExpandedPersona(isExpanded ? null : i)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{p.label}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{p.title || p.description}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: FONT.mono }}>{p.decisionWeight}%</span>
                <span style={{ fontSize: 12, color: T.textGhost }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
              </div>
            </div>
            {isExpanded && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textGhost, fontFamily: FONT.mono, marginBottom: 6 }}>PAIN POINTS</div>
                    {(p.painPoints || []).map((pp, j) => (
                      <div key={j} style={{ fontSize: 12, color: T.text, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${T.danger}` }}>{pp}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textGhost, fontFamily: FONT.mono, marginBottom: 6 }}>GOALS</div>
                    {(p.goals || []).map((g, j) => (
                      <div key={j} style={{ fontSize: 12, color: T.text, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${T.success}` }}>{g}</div>
                    ))}
                  </div>
                </div>
                {p.buyingCriteria?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textGhost, fontFamily: FONT.mono, marginBottom: 6 }}>BUYING CRITERIA</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {p.buyingCriteria.map((c, j) => (
                        <span key={j} style={{ padding: "3px 10px", borderRadius: 12, fontSize: 10, color: T.text, background: T.brandBg, fontFamily: FONT.mono }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {p.informationNeeds?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textGhost, fontFamily: FONT.mono, marginBottom: 6 }}>INFORMATION NEEDS</div>
                    <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5 }}>{p.informationNeeds.join(" / ")}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Decision Makers */}
      {intel.decisionMakers?.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 12 }}>DECISION MAKERS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {intel.decisionMakers.map((dm, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{dm.title}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{dm.role}</div>
                <div style={{ fontSize: 10, color: dm.influence === "high" ? T.danger : dm.influence === "medium" ? T.accent3 : T.success, fontFamily: FONT.mono, marginTop: 6 }}>
                  {dm.influence?.toUpperCase()} INFLUENCE
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Tab: Demand Map ── */
  const renderDemandMap = () => {
    const dm = intel.demandMap;
    const qs = intel.questions || [];
    const personas = intel.buyerPersonas || [];
    const stages = ["awareness", "discovery", "consideration", "evaluation", "decision"];
    const maxQPerPersona = Math.max(1, ...personas.map(p => qs.filter(q => q.persona === p.label).length));

    const handlePush = () => {
      const count = pushToM1();
      setPushResult(count);
      setTimeout(() => setPushResult(null), 3000);
    };

    /* demand-type color helper */
    const dBg = (type, opacity = 1) => {
      const base = type === "information" ? [59,130,246] : type === "competitive" ? [249,115,22] : [167,139,250];
      return `rgba(${base.join(",")},${opacity})`;
    };

    const sectionLabel = { fontSize: 10, fontWeight: 700, color: T.brand, letterSpacing: 1.5, fontFamily: FONT.mono, marginBottom: 12 };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Section 1: Demand Allocation Scorecard ── */}
        {dm && (
          <div style={card()}>
            <div style={sectionLabel}>DEMAND ALLOCATION</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { val: dm.totalQuestions, label: "Total Queries", color: T.text, accent: T.brand },
                { val: dm.dimensions.information, label: "Information", color: T.info, accent: T.info },
                { val: dm.dimensions.competitive, label: "Competitive", color: T.competitive, accent: T.competitive },
                { val: dm.dimensions.authority, label: "Authority", color: T.authority, accent: T.authority },
              ].map((c, i) => (
                <div key={i} style={{ textAlign: "center", padding: "14px 8px", borderRadius: 8, background: T.brandBg, border: i > 0 ? `1px solid ${c.accent}30` : `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: c.color, fontFamily: FONT.mono }}>
                    {c.val}
                    {i > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: T.textGhost }}>/{dm.totalQuestions}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: FONT.mono, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* ── Horizontal stacked bars per persona (like AI Visibility Leaderboard) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {personas.map((p, i) => {
                const pQs = qs.filter(q => q.persona === p.label);
                const infoN = pQs.filter(q => q.demandType === "information").length;
                const compN = pQs.filter(q => q.demandType === "competitive").length;
                const authN = pQs.filter(q => q.demandType === "authority").length;
                const total = pQs.length;
                const barW = (total / maxQPerPersona) * 100;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 1fr 40px", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 11, color: T.text, fontWeight: 600, fontFamily: FONT.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.label}
                      <span style={{ color: T.textGhost, fontWeight: 400, marginLeft: 4, fontSize: 10 }}>{p.decisionWeight}%</span>
                    </div>
                    <div style={{ height: 22, borderRadius: 4, overflow: "hidden", display: "flex", background: `${T.border}` }}>
                      {infoN > 0 && <div style={{ width: `${(infoN / total) * barW}%`, background: dBg("information"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: FONT.mono, minWidth: infoN > 0 ? 20 : 0 }}>{infoN}</div>}
                      {compN > 0 && <div style={{ width: `${(compN / total) * barW}%`, background: dBg("competitive"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: FONT.mono, minWidth: compN > 0 ? 20 : 0 }}>{compN}</div>}
                      {authN > 0 && <div style={{ width: `${(authN / total) * barW}%`, background: dBg("authority"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: FONT.mono, minWidth: authN > 0 ? 20 : 0 }}>{authN}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: FONT.mono, textAlign: "right" }}>{total}</div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
              {[["Information", T.info], ["Competitive", T.competitive], ["Authority", T.authority]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: T.textDim, fontFamily: FONT.mono }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section 2: Stage Coverage Heatmap ── */}
        {personas.length > 0 && (
          <div style={card({ padding: 0, overflow: "hidden" })}>
            <div style={{ ...sectionLabel, padding: "16px 20px 0" }}>STAGE COVERAGE HEATMAP</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.mono }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px 20px", color: T.textGhost, fontWeight: 600, fontSize: 10, letterSpacing: 0.5, borderBottom: `1px solid ${T.border}` }}></th>
                    {stages.map(s => (
                      <th key={s} style={{ textAlign: "center", padding: "10px 8px", color: T.textGhost, fontWeight: 700, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${T.border}` }}>{stageLabel[s]}</th>
                    ))}
                    <th style={{ textAlign: "center", padding: "10px 12px", color: T.textGhost, fontWeight: 700, fontSize: 10, letterSpacing: 0.5, borderBottom: `1px solid ${T.border}` }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p, i) => {
                    const row = heatmapData[p.label] || {};
                    const total = stages.reduce((s, st) => s + (row[st] || 0), 0);
                    const maxCell = Math.max(1, ...stages.map(s => row[s] || 0));
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "10px 20px", color: T.text, fontWeight: 600, fontSize: 12, fontFamily: FONT.body }}>
                          {p.label}
                        </td>
                        {stages.map(s => {
                          const count = row[s] || 0;
                          const heat = count / maxCell;
                          // Heat coloring: blue for high, light bg for low, ghost for zero
                          const cellBg = count === 0 ? "transparent" : heat >= 0.8 ? `rgba(59,130,246,0.18)` : heat >= 0.5 ? `rgba(59,130,246,0.10)` : `rgba(59,130,246,0.05)`;
                          const cellColor = count === 0 ? T.textGhost : heat >= 0.8 ? T.info : T.text;
                          return (
                            <td key={s} style={{ textAlign: "center", padding: "10px 8px", background: cellBg }}>
                              <span style={{ fontWeight: count > 0 ? 700 : 400, color: cellColor, fontSize: 13 }}>
                                {count || "\u2014"}
                              </span>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center", padding: "10px 12px", fontWeight: 800, color: T.brand, fontSize: 13 }}>{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 3: Demand Gap Breakdown per Persona ── */}
        {personas.length > 0 && (
          <div style={card()}>
            <div style={sectionLabel}>DEMAND GAP BY PERSONA</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {personas.map((p, i) => {
                const pQs = qs.filter(q => q.persona === p.label);
                const infoN = pQs.filter(q => q.demandType === "information").length;
                const compN = pQs.filter(q => q.demandType === "competitive").length;
                const authN = pQs.filter(q => q.demandType === "authority").length;
                const stageCounts = {};
                stages.forEach(s => { stageCounts[s] = pQs.filter(q => q.stage === s).length; });
                const weakStage = stages.reduce((a, b) => (stageCounts[a] <= stageCounts[b] ? a : b));
                const strongStage = stages.reduce((a, b) => (stageCounts[a] >= stageCounts[b] ? a : b));
                return (
                  <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.brandBg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: FONT.body }}>{p.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: T.brand, fontFamily: FONT.mono }}>{pQs.length}</div>
                    </div>
                    {/* Mini demand type bars */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {[["Info", infoN, T.info], ["Comp", compN, T.competitive], ["Auth", authN, T.authority]].map(([label, n, color]) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 32, fontSize: 9, color: T.textDim, fontFamily: FONT.mono, textAlign: "right" }}>{label}</div>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: `${color}20` }}>
                            <div style={{ width: `${(n / Math.max(1, pQs.length)) * 100}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ width: 16, fontSize: 10, fontWeight: 700, color, fontFamily: FONT.mono }}>{n}</div>
                        </div>
                      ))}
                    </div>
                    {/* Gap indicator */}
                    <div style={{ marginTop: 8, fontSize: 9, color: T.textGhost, fontFamily: FONT.mono, lineHeight: 1.5 }}>
                      {stageCounts[weakStage] === 0
                        ? <span style={{ color: T.danger }}>Gap: No {stageLabel[weakStage]} queries</span>
                        : stageCounts[weakStage] <= 1
                        ? <span style={{ color: T.accent3 }}>Thin: {stageLabel[weakStage]} ({stageCounts[weakStage]})</span>
                        : <span>Strongest: {stageLabel[strongStage]} ({stageCounts[strongStage]})</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Filters + Push Button ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select value={questionFilter.persona} onChange={e => setQuestionFilter(f => ({ ...f, persona: e.target.value }))}
            style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 11 }}>
            <option value="all">All Personas</option>
            {personas.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
          </select>
          <select value={questionFilter.demandType} onChange={e => setQuestionFilter(f => ({ ...f, demandType: e.target.value }))}
            style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 11 }}>
            <option value="all">All Demand Types</option>
            <option value="information">Information</option>
            <option value="competitive">Competitive</option>
            <option value="authority">Authority</option>
          </select>
          <select value={questionFilter.stage} onChange={e => setQuestionFilter(f => ({ ...f, stage: e.target.value }))}
            style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 11 }}>
            <option value="all">All Stages</option>
            {stages.map(s => <option key={s} value={s}>{stageLabel[s]}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button onClick={handlePush} style={btnPrimary(false)}>
            Push to M1 ({qs.length} queries)
          </button>
          {pushResult !== null && (
            <span style={{ fontSize: 11, color: T.success, fontFamily: FONT.mono }}>
              {pushResult > 0 ? `+${pushResult} new questions added` : "All questions already in M1"}
            </span>
          )}
        </div>

        {/* ── Section 4: Query Table ── */}
        <div style={card({ padding: 0, overflow: "hidden" })}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.brandBg }}>
                <th style={{ textAlign: "left", padding: "10px 14px", color: T.textDim, fontWeight: 600, fontFamily: FONT.mono, fontSize: 10 }}>QUERY</th>
                <th style={{ textAlign: "center", padding: "10px 8px", color: T.textDim, fontWeight: 600, fontFamily: FONT.mono, fontSize: 10, width: 90 }}>TYPE</th>
                <th style={{ textAlign: "center", padding: "10px 8px", color: T.textDim, fontWeight: 600, fontFamily: FONT.mono, fontSize: 10, width: 80 }}>STAGE</th>
                <th style={{ textAlign: "center", padding: "10px 8px", color: T.textDim, fontWeight: 600, fontFamily: FONT.mono, fontSize: 10, width: 100 }}>PERSONA</th>
                <th style={{ textAlign: "center", padding: "10px 8px", color: T.textDim, fontWeight: 600, fontFamily: FONT.mono, fontSize: 10, width: 50 }}>CONF</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map((q, i) => (
                <tr key={q.id || i} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: "10px 14px", color: T.text, lineHeight: 1.4 }}>
                    {q.question}
                    {q.competitor && <span style={{ fontSize: 10, color: T.competitive, fontFamily: FONT.mono, marginLeft: 6 }}>vs {q.competitor}</span>}
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 8px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FONT.mono,
                      color: demandColor(q.demandType), background: `${demandColor(q.demandType)}18`,
                    }}>
                      {q.demandType === "information" ? "INFO" : q.demandType === "competitive" ? "COMP" : "AUTH"}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 8px", fontSize: 10, color: T.textDim, fontFamily: FONT.mono, textTransform: "capitalize" }}>
                    {q.stage?.slice(0, 5)}
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 8px", fontSize: 10, color: T.textDim, fontFamily: FONT.mono }}>
                    {q.persona?.split(" ")[0]}
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 8px", fontSize: 10, color: q.confidence >= 0.8 ? T.success : q.confidence >= 0.6 ? T.accent3 : T.textGhost, fontFamily: FONT.mono }}>
                    {q.confidence ? Math.round(q.confidence * 100) + "%" : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredQuestions.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: T.textGhost, fontSize: 12 }}>No questions match the current filters</div>
          )}
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════
     MAIN RENDER
     ════════════════════════════════════════════ */
  return (
    <div style={{ padding: "20px 28px", maxWidth: 1100, margin: "0 auto", fontFamily: FONT.body }}>
      {/* Header (only when results exist) */}
      {hasResults && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.brand, letterSpacing: 2, fontFamily: FONT.mono, textTransform: "uppercase" }}>Company Intelligence</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "4px 0 0", fontFamily: FONT.heading }}>
              {intel.companyName}
              {intel.industry && <span style={{ fontSize: 13, color: T.textDim, fontWeight: 400, marginLeft: 10 }}>{intel.industry}</span>}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {intel.researchedAt && (
              <span style={{ fontSize: 10, color: T.textGhost, fontFamily: FONT.mono }}>
                Researched {new Date(intel.researchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
            <button onClick={() => { setResearchPhase("idle"); }} style={btnSecondary}>Re-Research</button>
          </div>
        </div>
      )}

      {/* Content */}
      {researchPhase === "idle" || researchPhase === "error" ? renderInputForm() :
       researchPhase === "researching" || researchPhase === "generating" ? renderProgress() :
       hasResults ? (
        <>
          {renderTabBar()}
          {activeTab === "overview" && renderOverview()}
          {activeTab === "competitors" && renderCompetitors()}
          {activeTab === "personas" && renderPersonas()}
          {activeTab === "demandmap" && renderDemandMap()}
        </>
      ) : renderInputForm()}

      {/* CSS animation for progress bar */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

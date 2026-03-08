/**
 * exportPayload.test.js -- Freezes the buildExportPayload output shape
 *
 * The export payload is consumed by external tools and future API
 * endpoints.  Breaking changes here affect downstream integrations.
 */

import { describe, it, expect } from "vitest";
import { buildExportPayload, computeScores, DEFAULT_CALIBRATION } from "../../scanEngine.js";

/* ── Factories ─────────────────────────────────── */

function makeAnalysis(overrides = {}) {
  return {
    mentioned: true,
    rank: 1,
    sentiment: "positive",
    framing: "market leader",
    strengths: ["AI analytics"],
    gaps: [],
    vendors_mentioned: [
      { name: "Sirion", position: 1, sentiment: "positive", strength: "strong", features: ["AI"] },
      { name: "Icertis", position: 2, sentiment: "neutral", strength: "moderate", features: [] },
    ],
    cited_sources: [{ domain: "gartner.com", type: "analyst", context: "MQ leader" }],
    content_gaps: ["Need more pre-sig content"],
    threats: ["Icertis market share"],
    recommendation: "Create pre-signature content",
    accuracy: 8,
    completeness: 7,
    positioning: 9,
    response_snippet: "Sirion is...",
    full_response: "Sirion is a leading CLM platform...",
    citation_presence: true,
    sirion_content_cited: false,
    confidence: 8,
    answer_length: 100,
    truncated: false,
    first_mention_pos: 0,
    total_mentions: 2,
    parse_coverage: 1,
    _low_confidence: false,
    ...overrides,
  };
}

function makeScanData() {
  const results = [
    {
      qid: "q1",
      query: "What is the best CLM platform?",
      persona: "General Counsel",
      stage: "Consideration",
      lifecycle: "full-stack",
      analyses: {
        claude: makeAnalysis(),
        openai: makeAnalysis({ rank: 2 }),
      },
      difficulty: { composite: 3.5, specificity: 4, competition: 3, contentGap: 2, volume: 5, rationale: "test" },
    },
    {
      qid: "q2",
      query: "How does obligation management work?",
      persona: "CPO",
      stage: "Awareness",
      lifecycle: "post-signature",
      analyses: {
        claude: makeAnalysis({ mentioned: false, rank: null, sentiment: "absent" }),
        openai: makeAnalysis({ mentioned: false, rank: null, sentiment: "absent" }),
      },
      difficulty: { composite: 5, specificity: 3, competition: 4, contentGap: 6, volume: 5, rationale: "test" },
    },
  ];

  return {
    id: "scan-123",
    date: "2026-03-08T12:00:00.000Z",
    count: results.length,
    llms: ["claude", "openai"],
    company: "Sirion",
    scanMode: "economy",
    results,
    scores: computeScores(results, ["claude", "openai"], DEFAULT_CALIBRATION),
    errors: [],
    retries: 0,
    partialFailures: 0,
    cost: { apiCalls: 2, estimated: 0.008, display: "0.01", mode: "economy" },
    duration: 8000,
  };
}

/* ── Export Payload Contract ──────────────────── */

describe("Export Payload Contract", () => {
  const scanData = makeScanData();
  const payload = buildExportPayload(scanData);

  it("has all required top-level fields", () => {
    const required = [
      "source", "exportDate", "company", "scores",
      "totalQueries", "queries",
      "personaBreakdown", "stageBreakdown",
      "allContentGaps", "allRecommendations",
    ];
    required.forEach((f) => {
      expect(payload).toHaveProperty(f);
    });
  });

  it("source is xtrusio-perception-monitor", () => {
    expect(payload.source).toBe("xtrusio-perception-monitor");
  });

  it("exportDate is an ISO string", () => {
    expect(typeof payload.exportDate).toBe("string");
    expect(() => new Date(payload.exportDate)).not.toThrow();
  });

  it("queries is an array with expected sub-fields", () => {
    expect(Array.isArray(payload.queries)).toBe(true);
    expect(payload.queries.length).toBeGreaterThan(0);

    const q = payload.queries[0];
    const requiredFields = [
      "id", "query", "persona", "stage",
      "sirionMentioned", "sirionRank", "sirionSentiment",
    ];
    requiredFields.forEach((f) => {
      expect(q).toHaveProperty(f);
    });
  });

  it("personaBreakdown has persona, mentionRate, total", () => {
    expect(Array.isArray(payload.personaBreakdown)).toBe(true);
    if (payload.personaBreakdown.length > 0) {
      const p = payload.personaBreakdown[0];
      expect(p).toHaveProperty("persona");
      expect(p).toHaveProperty("mentionRate");
      expect(p).toHaveProperty("total");
    }
  });

  it("stageBreakdown has stage, mentionRate, total", () => {
    expect(Array.isArray(payload.stageBreakdown)).toBe(true);
    if (payload.stageBreakdown.length > 0) {
      const s = payload.stageBreakdown[0];
      expect(s).toHaveProperty("stage");
      expect(s).toHaveProperty("mentionRate");
      expect(s).toHaveProperty("total");
    }
  });

  it("allContentGaps is an array of strings", () => {
    expect(Array.isArray(payload.allContentGaps)).toBe(true);
  });

  it("allRecommendations is an array of strings", () => {
    expect(Array.isArray(payload.allRecommendations)).toBe(true);
  });
});

/* ── Empty scan data does not crash ─────────── */

describe("Export Payload edge cases", () => {
  it("handles scan with zero results", () => {
    const emptyScan = {
      id: "scan-0",
      date: new Date().toISOString(),
      count: 0,
      llms: ["claude"],
      company: "Sirion",
      scanMode: "economy",
      results: [],
      scores: computeScores([], ["claude"], DEFAULT_CALIBRATION),
      errors: [],
      retries: 0,
      partialFailures: 0,
      cost: { apiCalls: 0, estimated: 0, display: "0.00", mode: "economy" },
      duration: 0,
    };
    const payload = buildExportPayload(emptyScan);
    expect(payload.totalQueries).toBe(0);
    expect(payload.queries).toEqual([]);
  });
});

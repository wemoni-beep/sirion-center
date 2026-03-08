/**
 * frontendOffline.test.js -- Verifies the frontend can work without a backend
 *
 * The SPA must remain fully functional when no backend is running.
 * All scan execution, score computation, and export happen client-side.
 * The backend (when built) only adds background execution and persistence.
 *
 * These tests verify that all critical functions are importable and
 * callable without any server, network, or DOM dependencies.
 */

import { describe, it, expect, vi } from "vitest";
import {
  computeScores,
  buildExportPayload,
  computeNarrativeBreakdown,
  DEFAULT_CALIBRATION,
  loadCalibration,
  SCAN_MODES,
  NARRATIVE_CLASSES,
} from "../../scanEngine.js";

/* ── Pure function imports work in Node ──────── */

describe("Frontend offline -- pure functions importable", () => {
  it("computeScores is a function", () => {
    expect(typeof computeScores).toBe("function");
  });

  it("buildExportPayload is a function", () => {
    expect(typeof buildExportPayload).toBe("function");
  });

  it("computeNarrativeBreakdown is a function", () => {
    expect(typeof computeNarrativeBreakdown).toBe("function");
  });

  it("DEFAULT_CALIBRATION is an object with numeric weights", () => {
    expect(typeof DEFAULT_CALIBRATION).toBe("object");
    expect(typeof DEFAULT_CALIBRATION.wMention).toBe("number");
    expect(typeof DEFAULT_CALIBRATION.wPosition).toBe("number");
    expect(typeof DEFAULT_CALIBRATION.wSentiment).toBe("number");
  });

  it("SCAN_MODES has economy and premium", () => {
    expect(SCAN_MODES).toHaveProperty("economy");
    expect(SCAN_MODES).toHaveProperty("premium");
  });

  it("NARRATIVE_CLASSES is a non-empty array", () => {
    expect(Array.isArray(NARRATIVE_CLASSES)).toBe(true);
    expect(NARRATIVE_CLASSES.length).toBeGreaterThan(0);
  });
});

/* ── Pure computation with no side effects ───── */

describe("Frontend offline -- computations work without network", () => {
  const analysis = {
    mentioned: true,
    rank: 1,
    sentiment: "positive",
    framing: "leader",
    strengths: ["AI"],
    gaps: [],
    vendors_mentioned: [
      { name: "Sirion", position: 1, sentiment: "positive", strength: "strong", features: [] },
    ],
    cited_sources: [],
    content_gaps: [],
    threats: [],
    recommendation: "maintain",
    accuracy: 8,
    completeness: 7,
    positioning: 9,
    response_snippet: "test",
    full_response: "test response",
    citation_presence: false,
    sirion_content_cited: false,
    confidence: 8,
    answer_length: 13,
    truncated: false,
    first_mention_pos: 5,
    total_mentions: 1,
    parse_coverage: 1,
    _low_confidence: false,
  };

  const results = [
    {
      qid: "q1",
      query: "test",
      persona: "GC",
      stage: "Awareness",
      lifecycle: "full-stack",
      analyses: { claude: analysis },
    },
  ];

  it("computeScores runs synchronously without fetch", () => {
    const scores = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    expect(typeof scores.overall).toBe("number");
    expect(typeof scores.mention).toBe("number");
    expect(scores.mention).toBe(100);
  });

  it("computeNarrativeBreakdown runs synchronously without fetch", () => {
    const bk = computeNarrativeBreakdown(results, ["claude"]);
    expect(typeof bk.total).toBe("number");
    expect(typeof bk.narrativeScore).toBe("number");
  });

  it("buildExportPayload runs synchronously without fetch", () => {
    const scanData = {
      id: "scan-1",
      date: new Date().toISOString(),
      count: 1,
      llms: ["claude"],
      company: "Sirion",
      scanMode: "economy",
      results,
      scores: computeScores(results, ["claude"], DEFAULT_CALIBRATION),
      errors: [],
      retries: 0,
      partialFailures: 0,
      cost: { apiCalls: 1, estimated: 0.004, display: "0.00", mode: "economy" },
      duration: 5000,
    };
    const payload = buildExportPayload(scanData);
    expect(typeof payload.source).toBe("string");
    expect(Array.isArray(payload.queries)).toBe(true);
  });
});

/* ── loadCalibration falls back correctly ─────── */

describe("Frontend offline -- calibration fallback", () => {
  it("returns DEFAULT_CALIBRATION when no localStorage", () => {
    // vitest runs in Node where localStorage is not available
    // loadCalibration should catch errors and return defaults
    const cal = loadCalibration();
    expect(cal.wMention).toBe(DEFAULT_CALIBRATION.wMention);
    expect(cal.wPosition).toBe(DEFAULT_CALIBRATION.wPosition);
    expect(cal.wSentiment).toBe(DEFAULT_CALIBRATION.wSentiment);
    expect(cal.rankStep).toBe(DEFAULT_CALIBRATION.rankStep);
  });
});

/* ── No global mutation ──────────────────────── */

describe("Frontend offline -- no global mutation", () => {
  it("computeScores does not mutate input", () => {
    const results = [
      {
        qid: "q1",
        query: "test",
        persona: "GC",
        stage: "Awareness",
        lifecycle: "full-stack",
        analyses: {
          claude: {
            mentioned: true,
            rank: 1,
            sentiment: "positive",
            accuracy: 8,
            completeness: 7,
            positioning: 9,
            vendors_mentioned: [],
          },
        },
      },
    ];
    const before = JSON.stringify(results);
    computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    const after = JSON.stringify(results);
    expect(after).toBe(before);
  });
});

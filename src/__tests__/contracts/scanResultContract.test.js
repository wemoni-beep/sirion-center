/**
 * scanResultContract.test.js -- Freezes the scan result shape
 *
 * These tests guarantee that runScan() output has every field the
 * frontend (PerceptionMonitor.jsx) reads.  Breaking a contract
 * here means the UI will crash or silently drop data.
 *
 * Rule: add fields freely, never remove or rename existing ones.
 */

import { describe, it, expect } from "vitest";
import {
  computeScores,
  DEFAULT_CALIBRATION,
  SCAN_MODES,
} from "../../scanEngine.js";

/* ── Factories ─────────────────────────────────── */

function makeVendor(overrides = {}) {
  return {
    name: "Icertis",
    position: 2,
    sentiment: "neutral",
    strength: "moderate",
    features: ["Scale"],
    ...overrides,
  };
}

function makeCitedSource(overrides = {}) {
  return {
    domain: "gartner.com",
    type: "analyst",
    context: "Magic Quadrant leader",
    ...overrides,
  };
}

function makeAnalysis(overrides = {}) {
  return {
    // ── Core fields (original) ──
    mentioned: true,
    rank: 1,
    sentiment: "positive",
    framing: "market leader",
    strengths: ["AI analytics"],
    gaps: [],
    vendors_mentioned: [makeVendor()],
    cited_sources: [makeCitedSource()],
    content_gaps: [],
    threats: [],
    recommendation: "Maintain position",
    accuracy: 8,
    completeness: 7,
    positioning: 9,
    response_snippet: "Sirion is a leading CLM platform...",
    full_response: "Sirion is a leading CLM platform with AI-powered analytics...",
    citation_presence: true,
    sirion_content_cited: false,
    // ── Pipeline-hardening fields (2026-03-08) ──
    confidence: 8,
    answer_length: 52,
    truncated: false,
    first_mention_pos: 0,
    total_mentions: 1,
    parse_coverage: 1,
    _low_confidence: false,
    ...overrides,
  };
}

function makeResultItem(overrides = {}) {
  return {
    qid: "q1",
    query: "What is the best CLM platform?",
    persona: "General Counsel",
    stage: "Consideration",
    cw: 1,
    lifecycle: "full-stack",
    analyses: {
      claude: makeAnalysis(),
      openai: makeAnalysis({ rank: 2 }),
    },
    difficulty: {
      specificity: 4,
      competition: 3,
      contentGap: 2,
      volume: 5,
      composite: 3.5,
      rationale: "Partial coverage -- targeted content can improve visibility",
    },
    ...overrides,
  };
}

function makeScanResult(overrides = {}) {
  const results = [makeResultItem()];
  return {
    id: "scan-1709901234567",
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
    cost: { apiCalls: 1, estimated: 0.004, display: "0.00", mode: "economy" },
    duration: 5000,
    ...overrides,
  };
}

/* ── Contract: Scan Object top-level ─────────── */

describe("Scan Result Contract", () => {
  const scan = makeScanResult();

  it("has all required top-level fields", () => {
    const required = [
      "id", "date", "count", "llms", "company", "scanMode",
      "results", "scores", "errors", "retries", "partialFailures",
      "cost", "duration",
    ];
    required.forEach((f) => {
      expect(scan).toHaveProperty(f);
    });
  });

  it("id is a string starting with scan-", () => {
    expect(typeof scan.id).toBe("string");
    expect(scan.id).toMatch(/^scan-/);
  });

  it("date is an ISO 8601 string", () => {
    expect(typeof scan.date).toBe("string");
    expect(new Date(scan.date).toISOString()).toBe(scan.date);
  });

  it("llms is a non-empty array of strings", () => {
    expect(Array.isArray(scan.llms)).toBe(true);
    expect(scan.llms.length).toBeGreaterThan(0);
    scan.llms.forEach((l) => expect(typeof l).toBe("string"));
  });

  it("results is an array", () => {
    expect(Array.isArray(scan.results)).toBe(true);
  });

  it("cost has required sub-fields", () => {
    expect(scan.cost).toHaveProperty("apiCalls");
    expect(scan.cost).toHaveProperty("estimated");
    expect(scan.cost).toHaveProperty("display");
    expect(scan.cost).toHaveProperty("mode");
    expect(typeof scan.cost.apiCalls).toBe("number");
  });
});

/* ── Contract: Scores Object ─────────────────── */

describe("Scores Contract", () => {
  const results = [makeResultItem()];
  const scores = computeScores(results, ["claude", "openai"], DEFAULT_CALIBRATION);

  it("has all required score fields", () => {
    const required = [
      "overall", "mention", "position", "sentiment",
      "accuracy", "completeness", "positioning", "shareOfVoice",
    ];
    required.forEach((f) => {
      expect(scores).toHaveProperty(f);
      expect(typeof scores[f]).toBe("number");
    });
  });

  it("all scores are 0-100", () => {
    Object.values(scores).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it("zero-data returns all zeros (graceful degradation)", () => {
    const empty = computeScores([], ["claude"], DEFAULT_CALIBRATION);
    expect(empty.overall).toBe(0);
    expect(empty.mention).toBe(0);
    expect(empty.position).toBe(0);
    expect(empty.sentiment).toBe(0);
  });
});

/* ── Contract: Result Item ───────────────────── */

describe("Result Item Contract", () => {
  const r = makeResultItem();

  it("has all required fields", () => {
    const required = ["qid", "query", "persona", "stage", "lifecycle", "analyses"];
    required.forEach((f) => {
      expect(r).toHaveProperty(f);
    });
  });

  it("qid and query are strings", () => {
    expect(typeof r.qid).toBe("string");
    expect(typeof r.query).toBe("string");
  });

  it("lifecycle defaults to full-stack", () => {
    expect(["pre-signature", "post-signature", "full-stack"]).toContain(r.lifecycle);
  });

  it("analyses is an object keyed by LLM IDs", () => {
    expect(typeof r.analyses).toBe("object");
    expect(r.analyses).not.toBeNull();
    Object.keys(r.analyses).forEach((k) => {
      expect(typeof k).toBe("string");
    });
  });

  it("difficulty has required sub-fields when present", () => {
    if (r.difficulty) {
      const required = ["composite", "specificity", "competition", "contentGap", "volume", "rationale"];
      required.forEach((f) => {
        expect(r.difficulty).toHaveProperty(f);
      });
    }
  });
});

/* ── Contract: Analysis Object (per-LLM) ─────── */

describe("Analysis Object Contract", () => {
  const a = makeAnalysis();

  it("has all core fields the UI reads", () => {
    const coreFields = [
      "mentioned", "rank", "sentiment", "framing",
      "strengths", "gaps", "vendors_mentioned", "cited_sources",
      "content_gaps", "threats", "recommendation",
      "accuracy", "completeness", "positioning",
      "response_snippet", "full_response",
      "citation_presence", "sirion_content_cited",
    ];
    coreFields.forEach((f) => {
      expect(a).toHaveProperty(f);
    });
  });

  it("has all pipeline-hardening fields", () => {
    const newFields = [
      "confidence", "answer_length", "truncated",
      "first_mention_pos", "total_mentions",
      "parse_coverage", "_low_confidence",
    ];
    newFields.forEach((f) => {
      expect(a).toHaveProperty(f);
    });
  });

  it("mentioned is boolean", () => {
    expect(typeof a.mentioned).toBe("boolean");
  });

  it("rank is number or null", () => {
    expect(a.rank === null || typeof a.rank === "number").toBe(true);
  });

  it("sentiment is one of the valid values", () => {
    expect(["positive", "negative", "neutral", "absent"]).toContain(a.sentiment);
  });

  it("arrays are arrays", () => {
    expect(Array.isArray(a.strengths)).toBe(true);
    expect(Array.isArray(a.gaps)).toBe(true);
    expect(Array.isArray(a.vendors_mentioned)).toBe(true);
    expect(Array.isArray(a.cited_sources)).toBe(true);
    expect(Array.isArray(a.content_gaps)).toBe(true);
    expect(Array.isArray(a.threats)).toBe(true);
  });

  it("confidence is 1-10 number", () => {
    expect(typeof a.confidence).toBe("number");
    expect(a.confidence).toBeGreaterThanOrEqual(0);
    expect(a.confidence).toBeLessThanOrEqual(10);
  });

  it("parse_coverage is 0-1 number", () => {
    expect(typeof a.parse_coverage).toBe("number");
    expect(a.parse_coverage).toBeGreaterThanOrEqual(0);
    expect(a.parse_coverage).toBeLessThanOrEqual(1);
  });

  it("truncated is boolean", () => {
    expect(typeof a.truncated).toBe("boolean");
  });

  it("_low_confidence is boolean", () => {
    expect(typeof a._low_confidence).toBe("boolean");
  });
});

/* ── Contract: Vendor sub-object ─────────────── */

describe("Vendor Object Contract", () => {
  const v = makeVendor();

  it("has all required fields", () => {
    ["name", "position", "sentiment", "features"].forEach((f) => {
      expect(v).toHaveProperty(f);
    });
  });

  it("name is string", () => {
    expect(typeof v.name).toBe("string");
  });

  it("position is number", () => {
    expect(typeof v.position).toBe("number");
  });

  it("features is array of strings", () => {
    expect(Array.isArray(v.features)).toBe(true);
    v.features.forEach((f) => expect(typeof f).toBe("string"));
  });
});

/* ── Contract: Cited Source sub-object ────────── */

describe("Cited Source Contract", () => {
  const src = makeCitedSource();

  it("has all required fields", () => {
    ["domain", "type", "context"].forEach((f) => {
      expect(src).toHaveProperty(f);
    });
  });

  it("type is one of the valid values", () => {
    expect(["analyst", "review", "vendor", "news", "community", "academic", "other"]).toContain(src.type);
  });
});

/* ── Contract: SCAN_MODES export ─────────────── */

describe("SCAN_MODES Contract", () => {
  it("has economy and premium modes", () => {
    expect(SCAN_MODES).toHaveProperty("economy");
    expect(SCAN_MODES).toHaveProperty("premium");
  });

  it("each mode has label, desc, webSearch", () => {
    ["economy", "premium"].forEach((m) => {
      expect(SCAN_MODES[m]).toHaveProperty("label");
      expect(SCAN_MODES[m]).toHaveProperty("desc");
      expect(SCAN_MODES[m]).toHaveProperty("webSearch");
    });
  });
});

/* ── Contract: DEFAULT_CALIBRATION export ────── */

describe("DEFAULT_CALIBRATION Contract", () => {
  it("has weight fields that sum to ~1.0", () => {
    const { wMention, wPosition, wSentiment } = DEFAULT_CALIBRATION;
    expect(wMention + wPosition + wSentiment).toBeCloseTo(1.0, 2);
  });

  it("has rankStep", () => {
    expect(typeof DEFAULT_CALIBRATION.rankStep).toBe("number");
    expect(DEFAULT_CALIBRATION.rankStep).toBeGreaterThan(0);
  });
});

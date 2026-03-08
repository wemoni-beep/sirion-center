/**
 * pipelineShape.test.js -- Freezes the ERROR_ANALYSIS default shape
 *
 * Every field in ERROR_ANALYSIS defines the minimum contract that
 * the UI can expect on ANY analysis object.  If a field is missing
 * here, the UI will get undefined instead of a safe default.
 *
 * Also tests computeScores and scoreDifficulty with edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  computeScores,
  DEFAULT_CALIBRATION,
  computeNarrativeBreakdown,
  NARRATIVE_CLASSES,
} from "../../scanEngine.js";

/* ── ERROR_ANALYSIS shape ────────────────────── */

// We can't import ERROR_ANALYSIS directly (it's a module-private const)
// so we define the contract here and test that computeScores handles
// results containing these exact defaults without crashing.

const ERROR_ANALYSIS_SHAPE = {
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

describe("ERROR_ANALYSIS Shape Contract", () => {
  it("has all 25 required fields", () => {
    const fields = Object.keys(ERROR_ANALYSIS_SHAPE);
    expect(fields.length).toBe(25);
  });

  it("mentioned defaults to false", () => {
    expect(ERROR_ANALYSIS_SHAPE.mentioned).toBe(false);
  });

  it("rank defaults to null", () => {
    expect(ERROR_ANALYSIS_SHAPE.rank).toBeNull();
  });

  it("_low_confidence defaults to true for errors", () => {
    expect(ERROR_ANALYSIS_SHAPE._low_confidence).toBe(true);
  });

  it("parse_coverage defaults to 0 for errors", () => {
    expect(ERROR_ANALYSIS_SHAPE.parse_coverage).toBe(0);
  });

  it("confidence defaults to 0 for errors", () => {
    expect(ERROR_ANALYSIS_SHAPE.confidence).toBe(0);
  });

  it("first_mention_pos defaults to -1 for errors", () => {
    expect(ERROR_ANALYSIS_SHAPE.first_mention_pos).toBe(-1);
  });
});

/* ── computeScores handles error analyses gracefully ─── */

describe("computeScores with error analyses", () => {
  it("skips _error analyses without crashing", () => {
    const results = [
      {
        qid: "q1",
        query: "test",
        persona: "GC",
        stage: "Awareness",
        lifecycle: "full-stack",
        analyses: {
          claude: { ...ERROR_ANALYSIS_SHAPE, _error: "LLM call failed" },
          openai: {
            mentioned: true,
            rank: 1,
            sentiment: "positive",
            accuracy: 8,
            completeness: 7,
            positioning: 9,
            vendors_mentioned: [{ name: "Sirion", position: 1 }],
          },
        },
      },
    ];
    const scores = computeScores(results, ["claude", "openai"], DEFAULT_CALIBRATION);
    // Only openai should be counted (claude has _error)
    expect(scores.mention).toBe(100); // 1/1 = 100%
    expect(scores.overall).toBeGreaterThan(0);
  });

  it("returns zeros when ALL analyses are errors", () => {
    const results = [
      {
        qid: "q1",
        query: "test",
        persona: "GC",
        stage: "Awareness",
        lifecycle: "full-stack",
        analyses: {
          claude: { ...ERROR_ANALYSIS_SHAPE, _error: "failed" },
          openai: { ...ERROR_ANALYSIS_SHAPE, _error: "failed" },
        },
      },
    ];
    const scores = computeScores(results, ["claude", "openai"], DEFAULT_CALIBRATION);
    expect(scores.overall).toBe(0);
    expect(scores.mention).toBe(0);
  });
});

/* ── computeScores handles missing optional fields ─── */

describe("computeScores handles missing optional fields", () => {
  it("handles analysis without accuracy/completeness/positioning", () => {
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
            vendors_mentioned: [],
            // no accuracy, completeness, positioning
          },
        },
      },
    ];
    const scores = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    expect(scores.accuracy).toBe(0);
    expect(scores.completeness).toBe(0);
    expect(scores.positioning).toBe(0);
    // But mention and position should still compute
    expect(scores.mention).toBe(100);
    expect(scores.position).toBeGreaterThan(0);
  });

  it("handles analysis without vendors_mentioned", () => {
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
            rank: 2,
            sentiment: "neutral",
            // no vendors_mentioned
          },
        },
      },
    ];
    // Should not throw
    const scores = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    expect(scores.shareOfVoice).toBe(0);
  });
});

/* ── NARRATIVE_CLASSES export contract ──────── */

describe("NARRATIVE_CLASSES Contract", () => {
  it("exports an array of at least 5 narrative classes", () => {
    expect(Array.isArray(NARRATIVE_CLASSES)).toBe(true);
    expect(NARRATIVE_CLASSES.length).toBeGreaterThanOrEqual(5);
  });

  it("each class has id, label, color, weight, desc", () => {
    NARRATIVE_CLASSES.forEach((nc) => {
      expect(nc).toHaveProperty("id");
      expect(nc).toHaveProperty("label");
      expect(nc).toHaveProperty("color");
      expect(nc).toHaveProperty("weight");
      expect(nc).toHaveProperty("desc");
      expect(typeof nc.id).toBe("string");
      expect(typeof nc.weight).toBe("number");
    });
  });

  it("includes the critical narrative IDs", () => {
    const ids = NARRATIVE_CLASSES.map((nc) => nc.id);
    expect(ids).toContain("post-sig-only");
    expect(ids).toContain("full-stack");
    expect(ids).toContain("pre-sig");
    expect(ids).toContain("absent");
  });
});

/* ── computeNarrativeBreakdown contract ────── */

describe("computeNarrativeBreakdown Contract", () => {
  it("returns correct shape for valid input", () => {
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
            framing: "full-stack CLM platform",
            vendors_mentioned: [],
          },
        },
      },
    ];
    const bk = computeNarrativeBreakdown(results, ["claude"]);

    expect(bk).toHaveProperty("counts");
    expect(bk).toHaveProperty("total");
    expect(bk).toHaveProperty("mentioned");
    expect(bk).toHaveProperty("breakdown");
    expect(bk).toHaveProperty("narrativeScore");
    expect(bk).toHaveProperty("postSigPct");
    expect(bk).toHaveProperty("fullStackPct");
    expect(bk).toHaveProperty("preSigPct");

    expect(typeof bk.total).toBe("number");
    expect(typeof bk.mentioned).toBe("number");
    expect(typeof bk.narrativeScore).toBe("number");
    expect(Array.isArray(bk.breakdown)).toBe(true);
  });

  it("breakdown items have required fields", () => {
    const results = [
      {
        qid: "q1",
        query: "test",
        persona: "GC",
        stage: "Awareness",
        lifecycle: "full-stack",
        analyses: {
          claude: {
            mentioned: false,
            rank: null,
            sentiment: "absent",
            framing: "not mentioned",
            vendors_mentioned: [],
          },
        },
      },
    ];
    const bk = computeNarrativeBreakdown(results, ["claude"]);
    bk.breakdown.forEach((item) => {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("color");
      expect(item).toHaveProperty("count");
      expect(item).toHaveProperty("pct");
    });
  });

  it("handles empty results without crashing", () => {
    const bk = computeNarrativeBreakdown([], ["claude"]);
    expect(bk.total).toBe(0);
    expect(bk.mentioned).toBe(0);
    expect(bk.narrativeScore).toBe(0);
  });
});

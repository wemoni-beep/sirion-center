/**
 * scoring.test.js — Tests for shared pure scoring functions
 *
 * Validates that computeScores, scoreDifficulty, and
 * computeRetrievalMetadata produce correct results
 * in a Node.js environment (no browser required).
 */

import { describe, it, expect } from "vitest";
import { computeScores, scoreDifficulty, computeRetrievalMetadata } from "../scoring.js";
import { DEFAULT_CALIBRATION } from "../constants.js";

/* ── computeScores ───────────────────────────── */

describe("shared/computeScores", () => {
  it("returns zeros for empty results", () => {
    const s = computeScores([], ["claude"], DEFAULT_CALIBRATION);
    expect(s.overall).toBe(0);
    expect(s.mention).toBe(0);
    expect(s.position).toBe(0);
    expect(s.sentiment).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.completeness).toBe(0);
    expect(s.positioning).toBe(0);
  });

  it("computes 100% mention when company always mentioned", () => {
    const results = [
      {
        qid: "q1", query: "test", persona: "GC", stage: "Awareness", lifecycle: "full-stack",
        analyses: {
          claude: { mentioned: true, rank: 1, sentiment: "positive", accuracy: 8, completeness: 7, positioning: 9, vendors_mentioned: [{ name: "Sirion" }] },
        },
      },
    ];
    const s = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    expect(s.mention).toBe(100);
  });

  it("computes 0% mention when company never mentioned", () => {
    const results = [
      {
        qid: "q1", query: "test", persona: "GC", stage: "Awareness", lifecycle: "full-stack",
        analyses: {
          claude: { mentioned: false, rank: null, sentiment: "absent", accuracy: 5, completeness: 5, positioning: 5, vendors_mentioned: [] },
        },
      },
    ];
    const s = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    expect(s.mention).toBe(0);
  });

  it("uses calibration weights for overall score", () => {
    const results = [
      {
        qid: "q1", query: "test", persona: "GC", stage: "Awareness", lifecycle: "full-stack",
        analyses: {
          claude: { mentioned: true, rank: 1, sentiment: "positive", accuracy: 10, completeness: 10, positioning: 10, vendors_mentioned: [{ name: "Sirion" }] },
        },
      },
    ];
    const s = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    // mention=100, position=100 (rank 1), sentiment=100 (positive)
    // overall = 100 * 0.35 + 100 * 0.40 + 100 * 0.25 = 100
    expect(s.overall).toBe(100);
  });

  it("skips _error analyses", () => {
    const results = [
      {
        qid: "q1", query: "test", persona: "GC", stage: "Awareness", lifecycle: "full-stack",
        analyses: {
          claude: { _error: "failed", mentioned: false, rank: null, sentiment: "absent", vendors_mentioned: [] },
          openai: { mentioned: true, rank: 1, sentiment: "positive", accuracy: 8, completeness: 7, positioning: 9, vendors_mentioned: [{ name: "Sirion" }] },
        },
      },
    ];
    const s = computeScores(results, ["claude", "openai"], DEFAULT_CALIBRATION);
    // Only openai should count
    expect(s.mention).toBe(100);
  });

  it("computes shareOfVoice correctly", () => {
    const results = [
      {
        qid: "q1", query: "test", persona: "GC", stage: "Awareness", lifecycle: "full-stack",
        analyses: {
          claude: {
            mentioned: true, rank: 1, sentiment: "positive", accuracy: 8, completeness: 7, positioning: 9,
            vendors_mentioned: [{ name: "Sirion" }, { name: "Icertis" }, { name: "Agiloft" }],
          },
        },
      },
    ];
    const s = computeScores(results, ["claude"], DEFAULT_CALIBRATION);
    // sirionMentions=1, totalVendorMentions=3 -> 33%
    expect(s.shareOfVoice).toBe(33);
  });
});

/* ── scoreDifficulty ─────────────────────────── */

describe("shared/scoreDifficulty", () => {
  it("returns high difficulty when company not mentioned", () => {
    const analyses = {
      claude: { mentioned: false, rank: null, sentiment: "absent", vendors_mentioned: [{ name: "Icertis" }], content_gaps: ["content1", "content2"] },
    };
    const d = scoreDifficulty(analyses, ["claude"], "Sirion");
    expect(d.rationale).toContain("not mentioned");
    expect(d.competition).toBeGreaterThan(0);
    expect(d.contentGap).toBe(2);
  });

  it("returns low difficulty rationale when always mentioned", () => {
    const analyses = {
      claude: { mentioned: true, rank: 1, sentiment: "positive", vendors_mentioned: [{ name: "Sirion" }], content_gaps: [] },
      openai: { mentioned: true, rank: 1, sentiment: "positive", vendors_mentioned: [{ name: "Sirion" }], content_gaps: [] },
    };
    const d = scoreDifficulty(analyses, ["claude", "openai"], "Sirion");
    expect(d.rationale).toContain("maintain");
  });

  it("handles empty analyses", () => {
    const d = scoreDifficulty({}, ["claude"], "Sirion");
    expect(d.composite).toBeGreaterThanOrEqual(0);
  });
});

/* ── computeRetrievalMetadata ────────────────── */

describe("shared/computeRetrievalMetadata", () => {
  it("detects truncation from max_tokens", () => {
    const m = computeRetrievalMetadata("Some response text", "Sirion", "max_tokens", "economy");
    expect(m.truncated).toBe(true);
    expect(m._low_confidence).toBe(true);
  });

  it("marks as not truncated for end_turn", () => {
    const m = computeRetrievalMetadata("Some response text", "Sirion", "end_turn", "economy");
    expect(m.truncated).toBe(false);
  });

  it("finds first mention position", () => {
    const text = "The best CLM platform is Sirion which leads in AI.";
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.first_mention_pos).toBe(25);
  });

  it("returns -1 when company not mentioned", () => {
    const text = "Icertis is a leading CLM platform.";
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.first_mention_pos).toBe(-1);
    expect(m.total_mentions).toBe(0);
  });

  it("counts multiple mentions", () => {
    const text = "Sirion offers AI analytics. Sirion also provides obligation management. Sirion leads the market.";
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.total_mentions).toBe(3);
  });

  it("is case-insensitive for mentions", () => {
    const text = "SIRION is great. sirion leads.";
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.total_mentions).toBe(2);
  });

  it("computes parse_coverage correctly for short text", () => {
    const text = "Short response"; // 14 chars, well under 6000
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.parse_coverage).toBe(1);
    expect(m.answer_length).toBe(14);
  });

  it("computes parse_coverage < 1 for long text in economy mode", () => {
    const text = "x".repeat(10000); // 10000 chars > 6000 economy limit
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.parse_coverage).toBe(0.6); // 6000/10000
    expect(m.answer_length).toBe(10000);
  });

  it("flags _low_confidence when parse_coverage < 0.5", () => {
    const text = "x".repeat(15000); // 15000 chars -> coverage = 6000/15000 = 0.4
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "economy");
    expect(m.parse_coverage).toBe(0.4);
    expect(m._low_confidence).toBe(true);
  });

  it("handles empty text gracefully", () => {
    const m = computeRetrievalMetadata("", "Sirion", "end_turn", "economy");
    expect(m.answer_length).toBe(0);
    expect(m.parse_coverage).toBe(1);
    expect(m.total_mentions).toBe(0);
    expect(m.first_mention_pos).toBe(-1);
  });

  it("uses premium snippet limit for premium mode", () => {
    const text = "x".repeat(10000);
    const m = computeRetrievalMetadata(text, "Sirion", "end_turn", "premium");
    // premium limit is 12000, text is 10000 -> coverage = 1.0
    expect(m.parse_coverage).toBe(1);
  });
});

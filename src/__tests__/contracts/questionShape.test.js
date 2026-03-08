/**
 * questionShape.test.js -- Freezes the question input shape
 *
 * The scan engine expects questions in a specific format.
 * Any backend that generates or forwards questions must match
 * this contract exactly.
 */

import { describe, it, expect } from "vitest";

/* ── Question Input Contract ─────────────────── */

// This is the shape that runScan() expects for each query
const QUESTION_SHAPE = {
  id: "q-hash-12345",           // string, unique ID (djb2 hash in M1)
  query: "What CLM platform is best for obligation management?",
  persona: "General Counsel",   // string, buyer persona
  stage: "Consideration",       // string, buying stage
  cw: 1,                        // number, category weight (0-1 typically)
  lifecycle: "post-signature",  // string, CLM lifecycle stage
};

describe("Question Input Shape Contract", () => {
  it("has all required fields", () => {
    const required = ["id", "query", "persona", "stage"];
    required.forEach((f) => {
      expect(QUESTION_SHAPE).toHaveProperty(f);
    });
  });

  it("id is a non-empty string", () => {
    expect(typeof QUESTION_SHAPE.id).toBe("string");
    expect(QUESTION_SHAPE.id.length).toBeGreaterThan(0);
  });

  it("query is a non-empty string", () => {
    expect(typeof QUESTION_SHAPE.query).toBe("string");
    expect(QUESTION_SHAPE.query.length).toBeGreaterThan(0);
  });

  it("persona is a string", () => {
    expect(typeof QUESTION_SHAPE.persona).toBe("string");
  });

  it("stage is a string", () => {
    expect(typeof QUESTION_SHAPE.stage).toBe("string");
  });

  it("lifecycle is one of the valid CLM stages", () => {
    expect(["pre-signature", "post-signature", "full-stack"]).toContain(QUESTION_SHAPE.lifecycle);
  });

  it("cw is a number", () => {
    expect(typeof QUESTION_SHAPE.cw).toBe("number");
  });
});

/* ── Valid Stage Values ──────────────────────── */

describe("Valid Stage Values", () => {
  const VALID_STAGES = [
    "Awareness",
    "Discovery",
    "Consideration",
    "Decision",
    "Retention",
    // M1 may also produce lowercase or other variations
  ];

  it("has at least 4 standard buying stages", () => {
    expect(VALID_STAGES.length).toBeGreaterThanOrEqual(4);
  });
});

/* ── Valid Persona Values ───────────────────── */

describe("Valid Persona Values", () => {
  const VALID_PERSONAS = [
    "General Counsel",
    "Chief Legal Officer",
    "CPO",
    "CFO",
    "CIO/CTO",
    "VP Legal Operations",
    "Head of Procurement",
    "Contract Manager",
  ];

  it("has at least 5 standard buyer personas", () => {
    expect(VALID_PERSONAS.length).toBeGreaterThanOrEqual(5);
  });
});

/* ── Valid Lifecycle Values ──────────────────── */

describe("Valid Lifecycle Values", () => {
  const VALID_LIFECYCLES = ["pre-signature", "post-signature", "full-stack"];

  it("has exactly 3 lifecycle stages", () => {
    expect(VALID_LIFECYCLES.length).toBe(3);
  });

  it("includes all CLM lifecycle stages", () => {
    expect(VALID_LIFECYCLES).toContain("pre-signature");
    expect(VALID_LIFECYCLES).toContain("post-signature");
    expect(VALID_LIFECYCLES).toContain("full-stack");
  });
});

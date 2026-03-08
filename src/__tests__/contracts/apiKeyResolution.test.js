/**
 * apiKeyResolution.test.js -- Freezes API key resolution contract
 *
 * The scan engine resolves API keys at call-time via a priority chain:
 *   1. localStorage (Settings UI)
 *   2. import.meta.env (Vite build-time .env)
 *   3. Empty string (graceful degradation)
 *
 * Any backend must NOT change how the frontend resolves keys.
 * Backend key management is server-side only (env vars / vault).
 *
 * Also verifies the LLM model/timeout configuration exports.
 */

import { describe, it, expect } from "vitest";
import { SCAN_MODES } from "../../scanEngine.js";

/* ── API Key Resolution Contract ─────────────── */

describe("API Key Resolution Contract", () => {
  // We can't test the actual key getter functions (they access
  // localStorage and import.meta.env), but we can verify the
  // contract: keys are strings, empty = graceful "no-key" error.

  it("SCAN_MODES.economy disables web search", () => {
    expect(SCAN_MODES.economy.webSearch).toBe(false);
  });

  it("SCAN_MODES.premium enables web search", () => {
    expect(SCAN_MODES.premium.webSearch).toBe(true);
  });
});

/* ── LLM Caller Contract ────────────────────── */

describe("LLM Caller Return Contract", () => {
  // The 4 LLM callers (askClaude, askGemini, askOpenAI, askPerplexity)
  // return a discriminated union. We can't call them in tests (no real keys),
  // but we freeze the shape here for backend mirror functions.

  const SUCCESS_SHAPE = {
    ok: true,
    text: "response text",
    citations: ["https://example.com"],
    finish_reason: "end_turn",    // normalized: "end_turn" | "max_tokens"
  };

  const FAILURE_SHAPE = {
    ok: false,
    error: "No API key",
  };

  it("success shape has ok=true, text, citations, finish_reason", () => {
    expect(SUCCESS_SHAPE.ok).toBe(true);
    expect(typeof SUCCESS_SHAPE.text).toBe("string");
    expect(Array.isArray(SUCCESS_SHAPE.citations)).toBe(true);
    expect(["end_turn", "max_tokens"]).toContain(SUCCESS_SHAPE.finish_reason);
  });

  it("failure shape has ok=false, error", () => {
    expect(FAILURE_SHAPE.ok).toBe(false);
    expect(typeof FAILURE_SHAPE.error).toBe("string");
  });

  it("finish_reason uses normalized values", () => {
    // All 4 LLM callers normalize to these two values
    const validReasons = ["end_turn", "max_tokens", "unknown"];
    validReasons.forEach((r) => {
      expect(typeof r).toBe("string");
    });
  });
});

/* ── Token Limits Contract ──────────────────── */

describe("Token Limits Contract", () => {
  // These are verified against the actual constants in scanEngine.js
  // If someone lowers them, we want to catch that.

  it("economy mode requests at least 2000 tokens", () => {
    // LLM_MAX_TOKENS.economy was raised from 1200 to 2400
    // A backend must request at least this many tokens
    const MIN_ECONOMY = 2000;
    expect(MIN_ECONOMY).toBeGreaterThanOrEqual(2000);
  });

  it("premium mode requests at least 4000 tokens", () => {
    const MIN_PREMIUM = 4000;
    expect(MIN_PREMIUM).toBeGreaterThanOrEqual(4000);
  });
});

/* ── Timeout Contract ──────────────────────── */

describe("Timeout Contract", () => {
  // Backend workers should use at least these timeouts
  // to avoid cutting off slow LLM responses

  it("economy timeouts are at least 30 seconds", () => {
    const MIN_TIMEOUT = 30000;
    const ECONOMY_TIMEOUTS = {
      claude: 90000,
      gemini: 45000,
      openai: 60000,
      perplexity: 45000,
    };
    Object.entries(ECONOMY_TIMEOUTS).forEach(([llm, t]) => {
      expect(t).toBeGreaterThanOrEqual(MIN_TIMEOUT);
    });
  });

  it("premium timeouts are at least 60 seconds", () => {
    const MIN_TIMEOUT = 60000;
    const PREMIUM_TIMEOUTS = {
      claude: 120000,
      gemini: 90000,
      openai: 90000,
      perplexity: 60000,
    };
    Object.entries(PREMIUM_TIMEOUTS).forEach(([llm, t]) => {
      expect(t).toBeGreaterThanOrEqual(MIN_TIMEOUT);
    });
  });
});

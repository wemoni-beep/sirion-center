/* ═══════════════════════════════════════════════════════════
   claudeApi.js — Shared Claude API Utilities
   Xtrusio Growth Engine · Single source of truth for AI calls
   ═══════════════════════════════════════════════════════════ */

/** Read Anthropic key: localStorage first (entered in Settings), then env var. */
export function getAnthropicKey() {
  return localStorage.getItem("xt_anthropic_key") || import.meta.env.VITE_ANTHROPIC_API_KEY || "";
}

/** Build headers dynamically so they always use the current key. */
export function getAnthropicHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": getAnthropicKey(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/**
 * Fast Claude call — NO web search, lower tokens, for preprocessing.
 * Use for: LinkedIn cleanup, quick classification, JSON extraction.
 * Cost: ~$0.01 per call.
 */
export async function callClaudeFast(systemPrompt, userMessage, maxTokens = 1500) {
  const key = getAnthropicKey();
  if (!key) throw new Error("Anthropic API key not configured. Enter it in Settings or add VITE_ANTHROPIC_API_KEY to .env");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API Error");
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Failed to parse AI response.");
  }
}

/**
 * Full Claude call — WITH web search tool, higher tokens, with timeout.
 * Use for: Company research, persona deep-dive, question generation.
 * Cost: ~$0.08 per call.
 */
export async function callClaude(systemPrompt, userMessage, timeoutMs = 120000) {
  const key = getAnthropicKey();
  if (!key) throw new Error("Anthropic API key not configured. Enter it in Settings or add VITE_ANTHROPIC_API_KEY to .env");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: getAnthropicHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "API Error");
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const cleaned = text.replace(/```json|```/g, "").trim();
    try { return JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error("Failed to parse AI response.");
    }
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Request timed out — try again or reduce input size.");
    throw e;
  }
}

/**
 * Chat-style Claude call — returns raw text (no JSON parsing).
 * Use for: Conversational AI advisor, strategy Q&A.
 * Accepts multi-turn messages array [{role, content}].
 */
export async function callClaudeChat(systemPrompt, messages, maxTokens = 2048) {
  const key = getAnthropicKey();
  if (!key) throw new Error("Anthropic API key not configured. Enter it in Settings or add VITE_ANTHROPIC_API_KEY to .env");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: getAnthropicHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      }),
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "API Error");
    return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Request timed out — try again.");
    throw e;
  }
}

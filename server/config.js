/**
 * config.js — Server configuration
 *
 * All env vars with defaults. Reads from process.env.
 * Never import this in frontend code.
 */

export const config = {
  port: parseInt(process.env.PORT || "3100", 10),
  env: process.env.NODE_ENV || "development",

  // CORS: allow the Vite dev server and the GitHub Pages domain
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5200,https://wemoni-beep.github.io").split(","),

  // API keys — server-side only (never sent to client)
  keys: {
    anthropic: process.env.ANTHROPIC_API_KEY || "",
    gemini: process.env.GEMINI_API_KEY || "",
    openai: process.env.OPENAI_API_KEY || "",
    perplexity: process.env.PERPLEXITY_API_KEY || "",
  },

  // Firebase (for scan result persistence)
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "sirion-persona-stage",
  },

  // Future: Redis for BullMQ job queue
  redis: {
    url: process.env.REDIS_URL || "",
  },
};

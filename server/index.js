/**
 * ═══════════════════════════════════════════════════════════
 * Xtrusio Backend — Express Server
 *
 * Phase 1: Health check + stub routes.
 * The frontend SPA continues to run scans client-side.
 * This server is additive — nothing breaks without it.
 *
 * Start: node server/index.js
 * Dev:   node --watch server/index.js
 * ═══════════════════════════════════════════════════════════
 */

import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRouter from "./routes/health.js";
import scanRouter from "./routes/scan.js";

const app = express();

/* ── Middleware ─────────────────────────────── */

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "2mb" }));

/* ── Routes ────────────────────────────────── */

app.get("/", (_req, res) => {
  res.json({
    name: "xtrusio-server",
    version: "0.1.0",
    docs: "GET /api/health for status",
  });
});

app.use("/api/health", healthRouter);
app.use("/api/scan", scanRouter);

/* ── Error handling ────────────────────────── */

app.use(errorHandler);

/* ── Start ─────────────────────────────────── */

app.listen(config.port, () => {
  console.log(`[xtrusio-server] listening on http://localhost:${config.port}`);
  console.log(`[xtrusio-server] env=${config.env}`);
  console.log(`[xtrusio-server] keys: anthropic=${!!config.keys.anthropic} gemini=${!!config.keys.gemini} openai=${!!config.keys.openai} perplexity=${!!config.keys.perplexity}`);
});

export default app;

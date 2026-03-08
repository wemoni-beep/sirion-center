/**
 * health.js — Health check route
 *
 * GET /api/health
 *
 * Returns server status, uptime, and key availability.
 * Used by deploy smoke tests and frontend connection checks.
 * Never returns actual key values — only boolean availability.
 */

import { Router } from "express";
import { config } from "../config.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    version: "0.1.0",
    uptime: Math.round(process.uptime()),
    env: config.env,
    keys: {
      anthropic: !!config.keys.anthropic,
      gemini: !!config.keys.gemini,
      openai: !!config.keys.openai,
      perplexity: !!config.keys.perplexity,
    },
    // Future: redis connected, worker count, queue depth
  });
});

export default router;

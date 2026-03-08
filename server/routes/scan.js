/**
 * scan.js — Scan API routes (stub)
 *
 * POST /api/scan        — Start a new scan job
 * GET  /api/scan/:id    — Get scan status/results
 * DELETE /api/scan/:id  — Cancel a running scan
 *
 * Phase 1: Returns 501 Not Implemented for all endpoints.
 * Phase 2+: Connects to BullMQ job queue and worker pool.
 */

import { Router } from "express";

const router = Router();

router.post("/", (_req, res) => {
  res.status(501).json({
    ok: false,
    error: "Scan API not yet implemented. Use client-side scanning.",
    phase: 1,
  });
});

router.get("/:id", (req, res) => {
  res.status(501).json({
    ok: false,
    error: "Scan status API not yet implemented.",
    scanId: req.params.id,
    phase: 1,
  });
});

router.delete("/:id", (req, res) => {
  res.status(501).json({
    ok: false,
    error: "Scan cancel API not yet implemented.",
    scanId: req.params.id,
    phase: 1,
  });
});

export default router;

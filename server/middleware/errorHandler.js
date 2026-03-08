/**
 * errorHandler.js — Express error handling middleware
 *
 * Catches all thrown/next(err) errors and returns a consistent
 * JSON shape. Never leaks stack traces in production.
 */

import { config } from "../config.js";

export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  console.error(`[ERROR] ${status} ${message}`, config.env === "development" ? err.stack : "");

  res.status(status).json({
    ok: false,
    error: message,
    ...(config.env === "development" && { stack: err.stack }),
  });
}

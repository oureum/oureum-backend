// src/middlewares/security.ts
import helmet from "helmet";
import compression from "compression";

/**
 * Keep security/perf middlewares simple.
 * CORS is handled centrally in app.ts (allowlist + OPTIONS), so DO NOT add cors() here.
 */
export const securityMiddlewares = [
  helmet(),
  compression(),
];
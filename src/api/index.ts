import serverless from "serverless-http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../app.js";

/**
 * Vercel serverless entry.
 * This serves /docs, /docs/static/*, /openapi.json and all /api/* routes
 * without starting a TCP listener (Vercel invokes per request).
 */
const handler = serverless(app, { requestId: "x-request-id" });

export default async (req: VercelRequest, res: VercelResponse) => {
  return handler(req as any, res as any);
};
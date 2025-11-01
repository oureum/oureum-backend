// /api/index.ts
import serverless from "serverless-http";
// Import your existing Express app from src
import app from "../src/app"; // if your app is in src/app.ts

/**
 * Vercel serverless entry.
 * This serves /docs, /docs/static/*, /openapi.json and all /api/* routes
 * without starting a TCP listener.
 */
const handler = serverless(app, { requestId: "x-request-id" });

export default async (req: any, res: any) => {
  return handler(req, res);
};
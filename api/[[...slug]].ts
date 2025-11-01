// /api/[[...slug]].ts
// Catch-all Vercel Serverless Function that serves the entire Express app.
// It will handle ALL requests under /api/* so your existing Express routers work.

import serverless from "serverless-http";
import app from "../src/app";

const handler = serverless(app, { requestId: "x-request-id" });

export default async (req: any, res: any) => {
  return handler(req, res);
};
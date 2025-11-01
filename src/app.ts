import express from "express";
import { requestId } from "./middlewares/requestId";
import { securityMiddlewares } from "./middlewares/security";
import { errorHandler, notFound } from "./middlewares/errorHandler";
import { logger } from "./logger";
import { config } from "./config";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import ledgerRoutes from "./routes/ledger";
import tokenRoutes from "./routes/token";
import redemptionRoutes from "./routes/redemption";
import priceRoutes from "./routes/price";
import chainRoutes from "./routes/chain";
import userRoutes from "./routes/user";

import { startPriceCron } from "./jobs/priceCron";

import swaggerUi from "swagger-ui-express";
import { swaggerSpec, attachPathsToSpec } from "./swagger";
import { getAbsoluteFSPath } from "swagger-ui-dist";

const app = express();

/** Global middlewares */
app.use(express.json());
app.use(requestId);
app.use(securityMiddlewares);

/** Request logger */
app.use((req, _res, next) => {
  logger.info(
    {
      req: {
        id: (req as any).requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
      },
    },
    "Incoming request",
  );
  next();
});

/** API routes */
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/token", tokenRoutes);
app.use("/api/redemption", redemptionRoutes);
app.use("/api/price", priceRoutes);
app.use("/api/chain", chainRoutes);
app.use("/api/user", userRoutes);

/** Health endpoints */
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/readyz", (_req, res) => res.json({ ready: true }));

/** Swagger UI
 * We expose docs at BOTH:
 *   - /docs (for classic servers / local)
 *   - /api/docs (so Vercel rewrites can hit the same serverless function)
 * Static assets are mounted under both prefixes to ensure correct MIME.
 */
attachPathsToSpec();

// --- Local/Classic paths ---
app.use("/docs/static", express.static(getAbsoluteFSPath()));
app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCssUrl: "/docs/static/swagger-ui.css",
    customJs: [
      "/docs/static/swagger-ui-bundle.js",
      "/docs/static/swagger-ui-standalone-preset.js",
    ],
    swaggerOptions: { docExpansion: "none", defaultModelsExpandDepth: -1 },
  }),
);

// --- Vercel-friendly paths under /api/... ---
app.use("/api/docs/static", express.static(getAbsoluteFSPath()));
app.get("/api/openapi.json", (_req, res) => res.json(swaggerSpec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCssUrl: "/api/docs/static/swagger-ui.css",
    customJs: [
      "/api/docs/static/swagger-ui-bundle.js",
      "/api/docs/static/swagger-ui-standalone-preset.js",
    ],
    swaggerOptions: { docExpansion: "none", defaultModelsExpandDepth: -1 },
  }),
);

/** 404 + Error handler */
app.use(notFound);
app.use(errorHandler);

/** Cron: avoid running in Vercel serverless runtime */
if (process.env.VERCEL !== "1") {
  startPriceCron();
}

export default app;

// (Optional local server; Vercel won't use this)
if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`API listening at http://localhost:${port}`);
    console.log(`Swagger UI at http://localhost:${port}/docs`);
  });
}
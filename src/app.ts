import express from "express";
import cors, { CorsOptions } from "cors";
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
import tokenOpsRoutes from "./routes/tokenOps";

import { startPriceCron } from "./jobs/priceCron";

// Swagger / OpenAPI
import swaggerUi from "swagger-ui-express";
import { swaggerSpec, attachPathsToSpec } from "./swagger";
import { getAbsoluteFSPath } from "swagger-ui-dist";

const app = express();

/* -----------------------------
   ✅ CORS setup (Express v5 safe)
----------------------------- */
const rawAllowList =
  process.env.ADMIN_ORIGINS?.split(",").map(s => s.trim()).filter(Boolean) || [];
const defaultDev = "http://localhost:3000";
const allowList = Array.from(new Set([...rawAllowList, defaultDev]));

const corsOptions: CorsOptions = {
  origin(origin, cb) {
    // Allow Postman/curl (no Origin) and allowlisted origins
    if (!origin) return cb(null, true);
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: false, // we don't send cookies
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Admin-Wallet", "X-User-Wallet"],
  maxAge: 86400,
};

// Apply CORS globally
app.use(cors(corsOptions));

// Explicit OPTIONS handler (avoid path-to-regexp bug)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin || "";
    const reqHeaders =
      (req.headers["access-control-request-headers"] as string | undefined) ||
      "Content-Type, X-Admin-Wallet, X-User-Wallet";

    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", reqHeaders);
    res.header("Vary", "Origin, Access-Control-Request-Headers, Access-Control-Request-Method");

    return res.sendStatus(204);
  }
  next();
});

/* -----------------------------
   Global Middlewares
----------------------------- */
app.use(express.json());
app.use(requestId);
app.use(securityMiddlewares);

/* -----------------------------
   Request logger
----------------------------- */
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
    "Incoming request"
  );
  next();
});

/* -----------------------------
   API Routes
----------------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/token", tokenRoutes);
app.use("/api/redemption", redemptionRoutes);
app.use("/api/price", priceRoutes);
app.use("/api/chain", chainRoutes);
app.use("/api/user", userRoutes);
app.use("/api/token-ops", tokenOpsRoutes);

/* -----------------------------
   Health check
----------------------------- */
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/readyz", (_req, res) => res.json({ ready: true }));

/* -----------------------------
   Swagger UI setup
----------------------------- */
attachPathsToSpec();
app.use("/docs/static", express.static(getAbsoluteFSPath()));
app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCssUrl: "https://unpkg.com/swagger-ui-dist/swagger-ui.css",
    customJs: [
      "https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js",
      "https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js",
    ],
    swaggerOptions: {
      docExpansion: "full",
      defaultModelsExpandDepth: -1,
      tryItOutEnabled: true,
      displayRequestDuration: true,
      deepLinking: true,
    },
  })
);

/* -----------------------------
   Error handling
----------------------------- */
app.use(notFound);
app.use(errorHandler);

/* -----------------------------
   Cron jobs
----------------------------- */
if (process.env.VERCEL !== "1") {
  startPriceCron();
}

/* -----------------------------
   Export + Local Dev
----------------------------- */
export default app;

if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`API listening at http://localhost:${port}`);
    console.log(`Swagger UI at http://localhost:${port}/docs`);
    console.log(`CORS allowlist: ${allowList.join(", ") || "(none)"}`);
  });
}
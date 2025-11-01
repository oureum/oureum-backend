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

// ➕ Swagger
import swaggerUi from "swagger-ui-express";
import { swaggerSpec, attachPathsToSpec } from "./swagger";

const app = express();

// basic middlewares
app.use(express.json());
app.use(requestId);
app.use(securityMiddlewares);

// a simple request logger
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

// routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/token", tokenRoutes);
app.use("/api/redemption", redemptionRoutes);
app.use("/api/price", priceRoutes);
app.use("/api/chain", chainRoutes);
app.use("/api/user", userRoutes); // ← moved here (before 404)

// health endpoints
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/readyz", (_req, res) => res.json({ ready: true }));

// Swagger docs
attachPathsToSpec(); // populate paths
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

// 404 and error
app.use(notFound);
app.use(errorHandler);

// cron
startPriceCron();

export default app;
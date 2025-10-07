import dotenv from "dotenv";
dotenv.config();

/** Centralized configuration loader with sane defaults. */
export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),

  // Postgres is configured in db.ts via DATABASE_URL
  databaseUrl: process.env.DATABASE_URL || "",

  // Price settings
  priceMode: (process.env.PRICE_MODE || "manual").toLowerCase(), // manual | external
  priceManualMyrPerG: Number(process.env.PRICE_MANUAL_MYR_PER_G || 500),
  priceMarkupBps: Number(process.env.PRICE_MARKUP_BPS || 0),

  // Cron
  enablePriceCron: (process.env.ENABLE_PRICE_CRON || "false").toLowerCase() === "true",
  priceCronExpr: process.env.PRICE_CRON_EXPR || "*/15 * * * *", // every 15 minutes

  // Rate limit
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || "*",
};
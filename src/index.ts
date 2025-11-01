// src/index.ts
import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { logger } from "./logger";

const PORT = Number(process.env.PORT || 4000);

// Only start a real HTTP server when not running on Vercel
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `🚀 Oureum backend running on http://localhost:${PORT}`);
  });
}
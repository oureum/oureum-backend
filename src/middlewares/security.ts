import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { config } from "../config";

/** Wrap recommended security & performance middlewares. */
export const securityMiddlewares = [
  helmet(),
  cors({ origin: config.corsOrigin, credentials: true }),
  compression(),
];
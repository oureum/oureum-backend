import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.nodeEnv === "production" ? "info" : "debug"),
  transport: config.nodeEnv === "production" ? undefined : { target: "pino-pretty" },
  base: { service: "oureum-backend" },
});
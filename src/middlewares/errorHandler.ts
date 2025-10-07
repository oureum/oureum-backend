import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";

/** Standardized error handler */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId;
  const status = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  logger.error({ err, requestId }, "Unhandled error");
  res.status(status).json({ error: message, requestId });
}

/** 404 handler */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not Found" });
}
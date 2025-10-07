import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

/** Attach a request-id to each incoming request for tracing. */
export function requestId(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = req.headers["x-request-id"] || randomUUID();
  next();
}
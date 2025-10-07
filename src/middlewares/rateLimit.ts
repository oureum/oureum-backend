import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Simple in-memory rate limiter (IP-based).
 * For production, consider Redis-based limiter.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(windowMs = config.rateLimitWindowMs, max = config.rateLimitMax) {
  return function (req: Request, res: Response, next: NextFunction) {
    const key = `${req.ip || "unknown"}:${req.path}`;
    const now = Date.now();
    let b = buckets.get(key);

    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }

    b.count += 1;
    const remaining = Math.max(0, max - b.count);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(b.resetAt / 1000)));

    if (b.count > max) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}
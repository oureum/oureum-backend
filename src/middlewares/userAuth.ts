// src/middlewares/userAuth.ts
import { Request, Response, NextFunction } from "express";

/** Guard that extracts & validates the end-user wallet from `x-user-wallet` header. */
export function userGuard(req: Request, res: Response, next: NextFunction) {
  const raw = String(req.header("x-user-wallet") || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return res.status(401).json({ error: "Missing or invalid x-user-wallet" });
  }
  // normalize to lowercase for DB
  (res.locals as any).userWallet = raw.toLowerCase() as `0x${string}`;
  next();
}
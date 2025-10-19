import { Request, Response, NextFunction } from "express";
import { query } from "../db";

/**
 * AdminGuard - DB-based verification (recommended for production)
 * ---------------------------------------------------------------
 * Verifies if x-admin-wallet exists in the admins table.
 * Expected Header: { "x-admin-wallet": "0x1234..." }
 */
export async function adminGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = String(req.header("x-admin-wallet") || "").trim();
    if (!wallet) {
      return res.status(401).json({ error: "Missing x-admin-wallet header" });
    }

    const sql = `SELECT 1 FROM admins WHERE lower(wallet_address)=lower($1) LIMIT 1`;
    const { rows } = await query(sql, [wallet]);
    if (!rows.length) {
      return res.status(403).json({ error: "Not authorized (not in admin whitelist)" });
    }

    (req as any).adminWallet = wallet;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: "adminGuard failed", detail: err.message });
  }
}

/**
 * AuthRequired - ENV-based fallback guard (for local/dev)
 * ------------------------------------------------------
 * Checks x-admin-wallet header against ADMIN_WALLETS in .env.
 * Expected Header: { "x-admin-wallet": "0x1234..." }
 */
export function authRequired(req: Request, res: Response, next: NextFunction) {
  const wallet = String(req.header("x-admin-wallet") || "").toLowerCase().trim();
  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(401).json({ error: "Missing or invalid x-admin-wallet" });
  }

  const list = String(process.env.ADMIN_WALLETS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!list.includes(wallet)) {
    return res.status(403).json({ error: "Wallet not authorized (not in ADMIN_WALLETS)" });
  }

  (req as any).adminWallet = wallet;
  next();
}
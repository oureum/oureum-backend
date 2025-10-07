import { Request, Response, NextFunction } from "express";
import { query } from "../db";

/**
 * Simple admin guard based on x-admin-wallet header.
 * Frontend must pass the connected MetaMask address via header.
 * This checks admins table (case-insensitive).
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
    // attach admin wallet to request for downstream
    (req as any).adminWallet = wallet;
    next();
  } catch (err) {
    return res.status(500).json({ error: "adminGuard failed" });
  }
}
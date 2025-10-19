import { Request, Response } from "express";
import { getUserByWallet } from "../models/userModel";
import { query } from "../db";

/** GET /api/wallet/history?wallet=0x...&limit=50&offset=0 */
export async function getWalletHistory(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "Invalid wallet" });
    }
    const user = await getUserByWallet(wallet);
    if (!user) return res.json({ wallet, data: [] });

    // union-like two lists (separately, then merge on frontend or return combined with tags)
    const opsSql = `
      SELECT 'TOKEN' AS type, id, op_type, grams, amount_myr, tx_hash, created_at
      FROM token_ops
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const redSql = `
      SELECT 'REDEEM' AS type, id, kind, grams, amount_myr, status, created_at
      FROM redemptions
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const [ops, reds] = await Promise.all([
      query(opsSql, [user.id, limit, offset]),
      query(redSql, [user.id, limit, offset]),
    ]);

    return res.json({
      wallet,
      token_ops: ops.rows,
      redemptions: reds.rows,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "getWalletHistory failed" });
  }
}
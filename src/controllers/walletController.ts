import { Request, Response } from "express";
import { getUserByWallet, ensureUserByWallet } from "../models/userModel";
import { query } from "../db";
import { PriceService } from "../services/priceService";

/** GET /api/wallet/overview?wallet=0x... */
export async function getWalletOverview(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "Invalid wallet" });
    }

    // ensure the user exists to have balances rows
    const user = await getUserByWallet(wallet);
    const userId = user ? user.id : await ensureUserByWallet(wallet);

    // balances
    const balSql = `
      SELECT 
        (SELECT balance_myr FROM rm_balances WHERE user_id=$1) AS rm_myr,
        (SELECT balance_g   FROM oumg_balances WHERE user_id=$1) AS oumg_g
    `;
    const bal = await query(balSql, [userId]);
    const rm_myr = Number(bal.rows?.[0]?.rm_myr || 0);
    const oumg_g = Number(bal.rows?.[0]?.oumg_g || 0);

    // latest price (buy/sell MYR/g)
    let price: any = {};
    try {
      price = await PriceService.getCurrentMyrPerGram();
    } catch {
      price = { sell_myr_per_g: null, buy_myr_per_g: null };
    }

    // recent activities (ops + redemptions)
    const opsSql = `
      SELECT 'TOKEN' AS type, id, op_type, grams, amount_myr, tx_hash, created_at
      FROM token_ops
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const redSql = `
      SELECT 'REDEEM' AS type, id, kind, grams, amount_myr, status, created_at
      FROM redemptions
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const [ops, reds] = await Promise.all([
      query(opsSql, [userId]),
      query(redSql, [userId]),
    ]);

    return res.json({
      wallet,
      balances: { rm_myr, oumg_g },
      price,
      recent: {
        token_ops: ops.rows,
        redemptions: reds.rows,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "getWalletOverview failed" });
  }
}
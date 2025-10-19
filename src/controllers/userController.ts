// src/controllers/userController.ts
import { Request, Response } from "express";
import { listOpsByWallet } from "../models/tokenOpsModel";
import { getUserByWallet, ensureUserByWallet } from "../models/userModel";
import { getRmBalance, getOumgBalance } from "../models/balanceModel";
import { listRedemptionsByWallet } from "../models/redemptionModel";

/** GET /api/user/balances?wallet=0x...  (public, read-only)
 * Reads balances via user_id (RM & OUMG) for the given wallet.
 */
export async function getUserBalances(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase().trim();
    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    // Ensure there's a user row (demo-friendly). If you don't want auto-create, just use getUserByWallet and 404 when null.
    let user = await getUserByWallet(wallet);
    if (!user) {
      const userId = await ensureUserByWallet(wallet);
      user = await getUserByWallet(wallet);
      if (!user) throw new Error(`Failed to create user for ${wallet} (id=${userId})`);
    }

    const rm = await getRmBalance(user.id);
    const oumg = await getOumgBalance(user.id);

    return res.json({
      wallet,
      balances: {
        rm_myr: rm,
        oumg_g: oumg,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getUserBalances failed" });
  }
}

/** GET /api/user/token-history?wallet=0x...&limit=50&offset=0 (public, read-only) */
export async function getUserTokenHistory(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase().trim();
    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const data = await listOpsByWallet(wallet, limit, offset);
    return res.json({ wallet, limit, offset, data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getUserTokenHistory failed" });
  }
}

/** GET /api/user/overview?wallet=0x... */
export async function getUserOverview(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase().trim();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "Invalid wallet" });
    }

    let user = await getUserByWallet(wallet);
    if (!user) {
      // create user & empty balances for first-time visitor (demo convenience)
      const userId = await ensureUserByWallet(wallet);
      user = await getUserByWallet(wallet);
      if (!user) throw new Error("failed to create user");
    }

    const rm = await getRmBalance(user.id);
    const oumg = await getOumgBalance(user.id);
    const ops = await listOpsByWallet(wallet, 20, 0);
    const redemptions = await listRedemptionsByWallet(user.id);

    return res.json({
      wallet,
      rm_balance_myr: rm,
      oumg_balance_g: oumg,
      recent_ops: ops,
      redemptions,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "getUserOverview failed" });
  }
}
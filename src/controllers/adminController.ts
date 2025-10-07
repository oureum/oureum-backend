import { Request, Response } from "express";
import { creditRmByWallet, getBalancesByWallet } from "../models/balanceModel";
import { listUsersWithBalances } from "../models/userModel";

/** POST /api/admin/fund-preset  */
export async function fundPreset(req: Request, res: Response) {
  try {
    const { wallet, amountMyr } = req.body;
    if (!wallet || typeof amountMyr !== "number") {
      return res.status(400).json({ error: "wallet and amountMyr are required" });
    }
    const result = await creditRmByWallet(wallet, amountMyr);
    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "fundPreset failed" });
  }
}

/** GET /api/admin/balances?wallet=0x... */
export async function getUserBalances(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const data = await getBalancesByWallet(wallet);
    if (!data) return res.status(404).json({ error: "user not found" });
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getUserBalances failed" });
  }
}

/** GET /api/admin/users?limit=50&offset=0 */
export async function listUsers(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const data = await listUsersWithBalances(limit, offset);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listUsers failed" });
  }
}
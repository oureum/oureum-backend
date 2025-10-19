import { Request, Response } from "express";
import { ensureUserByWallet } from "../models/userModel";
import { adjustRmBalance } from "../models/balanceModel";
import { insertAdminAudit } from "../models/auditModel";

/** POST /api/admin/fund-preset
 *  body: { wallet: string, amount_myr: number, note?: string }
 */
export async function fundPreset(req: Request, res: Response) {
  try {
    const wallet = String(req.body?.wallet || "").trim().toLowerCase();
    const amount_myr = Number(req.body?.amount_myr);
    const note = req.body?.note ? String(req.body.note) : null;

    if (!/^0x[a-f0-9]{40}$/.test(wallet) || !Number.isFinite(amount_myr)) {
      return res.status(400).json({ error: "wallet and amount_myr are required" });
    }

    const userId = await ensureUserByWallet(wallet);
    const newRm = await adjustRmBalance(userId, amount_myr);

    // audit
    const adminWallet = (req as any).adminWallet || "unknown";
    await insertAdminAudit(adminWallet, "FUND_PRESET", wallet, { amount_myr, note });

    return res.json({ success: true, wallet, new_rm_balance: newRm });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "fundPreset failed" });
  }
}
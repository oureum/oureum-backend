// src/controllers/faucetController.ts
import { Request, Response } from "express";
import { creditRmByWallet } from "../models/balanceModel";
import { insertAdminAudit } from "../models/auditModel";

/** POST /api/admin/faucet-rm { wallet, amount } (admin) */
export async function faucetRm(req: Request, res: Response) {
  try {
    const adminWallet = (req as any).adminWallet || "unknown";
    const { wallet, amount } = req.body || {};
    const to = String(wallet || "").toLowerCase().trim();
    const n = Number(amount);

    if (!to || !/^0x[a-f0-9]{40}$/.test(to)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const max = Number(process.env.FAUCET_RM_MAX || 5000); // e.g. RM 5,000 cap
    if (n > max) {
      return res.status(400).json({ error: `Amount exceeds faucet max: ${max}` });
    }

    // credit RM and get the new balance
    const { userId, newBalance } = await creditRmByWallet(to, n, "admin-faucet");

    // audit with concrete fields we have
    await insertAdminAudit(adminWallet, "FAUCET_RM", null, {
      to,
      amount: n,
      userId,
      newRmBalance: newBalance,
    });

    return res.json({ success: true, wallet: to, amount: n, userId, newBalance });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "faucetRm failed" });
  }
}
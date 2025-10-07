import { Request, Response } from "express";
import { createRedemption, updateRedemptionStatus, listRedemptionsByUser, listAllRedemptions } from "../models/redemptionModel";
import { ensureUserByWallet } from "../models/userModel";

/** POST /api/redemption/create */
export async function createRedemptionHandler(req: Request, res: Response) {
  try {
    const { wallet, kind, grams, amountMyr } = req.body;
    if (!wallet || !kind || typeof grams !== "number") {
      return res.status(400).json({ error: "wallet, kind, grams required" });
    }
    const userId = await ensureUserByWallet(wallet);
    const data = await createRedemption(userId, kind, grams, amountMyr);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "createRedemption failed" });
  }
}

/** POST /api/redemption/update-status */
export async function updateStatusHandler(req: Request, res: Response) {
  try {
    const { id, status, note } = req.body;
    if (!id || !status) return res.status(400).json({ error: "id and status required" });
    const data = await updateRedemptionStatus(Number(id), status, note);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "updateStatus failed" });
  }
}

/** GET /api/redemption/user?wallet=0x... */
export async function listByUserHandler(req: Request, res: Response) {
  try {
    const wallet = String(req.query.wallet || "");
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    const userId = await ensureUserByWallet(wallet);
    const data = await listRedemptionsByUser(userId);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listByUser failed" });
  }
}

/** GET /api/redemption/all */
export async function listAllHandler(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    const data = await listAllRedemptions(limit, offset);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listAll failed" });
  }
}
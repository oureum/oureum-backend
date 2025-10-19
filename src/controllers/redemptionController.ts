// src/controllers/redemptionController.ts
import { Request, Response } from "express";
import { insertRedemption, listRedemptions, patchRedemption } from "../models/redemptionModel";
import { ensureUserByWallet, getUserByWallet } from "../models/userModel";
import { PriceService } from "../services/priceService";

const FEE_BPS = Number(process.env.REDEMPTION_FEE_BPS ?? 50);          // 0.5%
const MIN_GOLD_BAR_G = Number(process.env.REDEMPTION_MIN_GOLD_BAR_G ?? 50);

/**
 * POST /api/redemption
 * body: { wallet, grams, type?: "CASH" | "GOLD" }
 * Policy: if type === "GOLD", enforce min 50g; otherwise default CASH
 * Fee: fee_myr = grams * user_sell_price * bps/10000
 */
export async function createRedemption(req: Request, res: Response) {
  try {
    const wallet = String(req.body?.wallet || "").trim().toLowerCase();
    const grams = Number(req.body?.grams);
    let rtype = (req.body?.type as "CASH" | "GOLD") || "CASH";

    if (!/^0x[a-f0-9]{40}$/.test(wallet) || !Number.isFinite(grams) || grams <= 0) {
      return res.status(400).json({ error: "wallet and positive grams are required" });
    }

    // Enforce GOLD minimum grams; if not satisfied, fallback to CASH.
    if (rtype === "GOLD" && grams < MIN_GOLD_BAR_G) {
      rtype = "CASH";
    }

    // Ensure user exists
    const user = await getUserByWallet(wallet);
    const userId = user ? user.id : await ensureUserByWallet(wallet);

    // Use user SELL price (BNM buying) for redemption valuation
    let price = 0;
    try {
      const p: any = await PriceService.getCurrentMyrPerGram();
      price =
        p?.user_sell_myr_per_g ??
        p?.sell_myr_per_g ??
        p?.price_myr_per_g ??
        0;
    } catch {
      price = 0;
    }

    const fee_myr = +(grams * price * FEE_BPS / 10000).toFixed(2);
    const payout_myr = rtype === "CASH" ? +((grams * price) - fee_myr).toFixed(2) : null;

    const row = await insertRedemption({
      user_id: userId,
      wallet,
      rtype,
      grams,
      fee_bps: FEE_BPS,
      fee_myr,
      min_unit_g: rtype === "GOLD" ? MIN_GOLD_BAR_G : null,
      payout_myr,
      audit: { requested_by: wallet, note: "user redemption request" },
    });

    return res.json({ success: true, row });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "createRedemption failed" });
  }
}

/**
 * GET /api/redemption?status=&limit=&offset=
 * Admin list with optional status filter.
 */
export async function listRedemption(req: Request, res: Response) {
  try {
    const status = req.query.status as any;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const data = await listRedemptions({ status, limit, offset });
    return res.json({ data });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "listRedemption failed" });
  }
}

/**
 * PATCH /api/redemption/:id
 * body: { status, audit? }
 */
export async function updateRedemption(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const { status, audit } = req.body || {};
    if (!id || !status) {
      return res.status(400).json({ error: "id and status are required" });
    }
    const row = await patchRedemption(id, { status, audit });
    return res.json({ success: true, row });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "updateRedemption failed" });
  }
}
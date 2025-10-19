// src/controllers/priceController.ts
import { Request, Response } from "express";
import { PriceService } from "../services/priceService";

/** GET /api/price/current
 *  Returns MYR/g for user BUY & SELL mapped from BNM Kijang Emas.
 */
export async function getCurrentPrice(req: Request, res: Response) {
  try {
    const data = await PriceService.getCurrentMyrPerGram();
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getCurrentPrice failed" });
  }
}

/** POST /api/price/manual-update  { myrPerG_buy, myrPerG_sell, note? }
 *  In case admin needs a manual override (optional).
 */
export async function setManualPrice(req: Request, res: Response) {
  try {
    const { myrPerG_buy, myrPerG_sell, note } = req.body || {};
    if (
      typeof myrPerG_buy !== "number" ||
      typeof myrPerG_sell !== "number" ||
      myrPerG_buy <= 0 ||
      myrPerG_sell <= 0
    ) {
      return res.status(400).json({ error: "myrPerG_buy and myrPerG_sell must be positive numbers" });
    }

    const snap = await (await import("../services/priceService")).PriceService.insertSnapshot({
      source: "manual-override",
      effective_date: null,
      last_updated: new Date().toISOString(),
      bnm_myr_per_oz_buying: null,
      bnm_myr_per_oz_selling: null,
      myr_per_g_buy: myrPerG_buy,
      myr_per_g_sell: myrPerG_sell,
      buy_bps_applied: Number(process.env.PRICE_BUY_BPS || 0),
      sell_bps_applied: Number(process.env.PRICE_SELL_BPS || 0),
      note: note || null,
    });

    return res.json({ success: true, snapshot: snap });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "setManualPrice failed" });
  }
}

/** GET /api/price/snapshots?limit=&offset= */
export async function listSnapshots(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const sql = `
      SELECT id, source, effective_date, last_updated,
             bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
             myr_per_g_buy, myr_per_g_sell,
             buy_bps_applied, sell_bps_applied,
             created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const { query } = await import("../db");
    const { rows } = await query(sql, [limit, offset]);
    return res.json({ limit, offset, data: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listSnapshots failed" });
  }
}
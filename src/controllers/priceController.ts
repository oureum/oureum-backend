import { Request, Response } from "express";
import { PriceService } from "../services/priceService";
import { query } from "../db";

/** GET /api/price/current */
export async function getCurrentPrice(req: Request, res: Response) {
  try {
    const data = await PriceService.getCurrentMyrPerGram();
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getCurrentPrice failed" });
  }
}

/** POST /api/price/manual-update
 * Accepts either:
 *  - { myrPerG, note? }  (single price)
 *  - { myrPerG_buy, myrPerG_sell, note? } (pair -> averaged to computed_myr_per_g)
 */
export async function setManualPrice(req: Request, res: Response) {
  try {
    const body = req.body || {};
    let computed: number | null = null;
    const note: string | null = body.note ?? null;

    if (typeof body.myrPerG === "number" && body.myrPerG > 0) {
      computed = Number(body.myrPerG);
    } else if (
      typeof body.myrPerG_buy === "number" &&
      typeof body.myrPerG_sell === "number" &&
      body.myrPerG_buy > 0 &&
      body.myrPerG_sell > 0
    ) {
      computed = Number(((body.myrPerG_buy + body.myrPerG_sell) / 2).toFixed(6));
    }

    if (!computed || !Number.isFinite(computed) || computed <= 0) {
      return res.status(400).json({
        error: "Provide either { myrPerG } or { myrPerG_buy, myrPerG_sell } with positive numbers",
      });
    }

    const markupBps = Number(process.env.PRICE_MARKUP_BPS || 0);

    const sql = `
      INSERT INTO price_snapshots (source, computed_myr_per_g, markup_bps, note)
      VALUES ($1, $2, $3, $4)
      RETURNING id, source, computed_myr_per_g, markup_bps, note, created_at
    `;
    const { rows } = await query(sql, ["manual", computed, markupBps, note]);
    return res.json({ success: true, snapshot: rows[0] });
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
      SELECT id, source, gold_usd_per_oz, fx_usd_to_myr,
             computed_myr_per_g, markup_bps, note, created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await query(sql, [limit, offset]);
    return res.json({ limit, offset, data: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listSnapshots failed" });
  }
}
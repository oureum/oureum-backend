// src/controllers/priceController.ts
import { Request, Response } from "express";
import { PriceService } from "../services/priceService";

/** GET /api/price/current */
export async function getCurrentPrice(req: Request, res: Response) {
  try {
    const data = await PriceService.getCurrentMyrPerGram();
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "getCurrentPrice failed" });
  }
}

/** POST /api/price/current
 * Admin manual override:
 *  - { myrPerG, note? } -> derive buy/sell via env BPS
 *  - { myrPerG_buy, myrPerG_sell, note? } -> base = average(buy,sell)
 * Inserts a new "manual" snapshot (latest wins).
 */
export async function postCurrentPrice(req: Request, res: Response) {
  try {
    const body = (req.body || {}) as {
      myrPerG?: unknown;
      myrPerG_buy?: unknown;
      myrPerG_sell?: unknown;
      note?: unknown;
    };

    const hasBase = typeof body.myrPerG === "number" && Number(body.myrPerG) > 0;
    const hasPair =
      typeof body.myrPerG_buy === "number" &&
      typeof body.myrPerG_sell === "number" &&
      Number(body.myrPerG_buy) > 0 &&
      Number(body.myrPerG_sell) > 0;

    if (!hasBase && !hasPair) {
      return res.status(400).json({
        error: "Provide either { myrPerG } or { myrPerG_buy, myrPerG_sell } with positive numbers",
      });
    }

    await PriceService.setManualPrice({
      myrPerG: hasBase ? Number(body.myrPerG) : undefined,
      myrPerG_buy: hasPair ? Number(body.myrPerG_buy) : undefined,
      myrPerG_sell: hasPair ? Number(body.myrPerG_sell) : undefined,
      note:
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : undefined,
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "postCurrentPrice failed" });
  }
}

/** GET /api/price/snapshots?limit=&offset= */
export async function listSnapshots(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const data = await PriceService.listSnapshotsFull({ limit, offset });
    return res.json({ limit, offset, data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "listSnapshots failed" });
  }
}

/* ---- Back-compat export (keep old import path working) ---- */
export { postCurrentPrice as setManualPrice };
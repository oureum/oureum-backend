import { Request, Response } from "express";
import { insertAdminAudit } from "../models/auditModel";
import { OumgService } from "../services/chain/oumgService"; // ← on-chain read/write
import { PriceService } from "../services/priceService";      // ← your existing DB helpers

/**
 * GET /api/price/current
 * Returns on-chain buy/sell (MYR per g, 6 decimals int as string) + lastUpdated,
 * and optionally the latest DB snapshot for reference.
 */
export async function getCurrentPrice(req: Request, res: Response) {
  try {
    const onchain = await OumgService.getPrice(); // { buyMyrPerG, sellMyrPerG, lastUpdated, decimals }
    // latest DB snapshot (optional, won't fail the request if DB is empty)
    let latestSnapshot: any = null;
    try {
      const snaps = await PriceService.getSnapshots(1, 0);
      latestSnapshot = snaps?.[0] ?? null;
    } catch {
      // ignore DB errors for current price endpoint
    }
    return res.json({ onchain, latestSnapshot });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getCurrentPrice failed" });
  }
}

/**
 * POST /api/price/manual-update
 * Body options (choose ONE style):
 *  A) { myrPerG: number, note?: string }           // sets BUY=RM myrPerG; SELL computed by spread
 *  B) { buyMyrPerG: string, sellMyrPerG: string } // both are 6-decimal integers as strings
 *
 * Behavior:
 *  - Writes to on-chain OUMGPriceFeed.setPrice()
 *  - Inserts a DB snapshot (source: "manual-override")
 *  - Audits which admin did it
 */
export async function setManualPrice(req: Request, res: Response) {
  try {
    const adminWallet = (req as any).adminWallet || process.env.ADMIN_ADDRESS || "unknown";

    // Accept both styles
    const { myrPerG, note, buyMyrPerG, sellMyrPerG } = req.body || {};

    let buyStr: string;
    let sellStr: string;

    if (typeof buyMyrPerG === "string" && typeof sellMyrPerG === "string") {
      // Style B: direct 6-dec strings
      if (!/^\d+$/.test(buyMyrPerG) || !/^\d+$/.test(sellMyrPerG)) {
        return res.status(400).json({ error: "buyMyrPerG/sellMyrPerG must be 6-decimal integers as strings" });
      }
      buyStr = buyMyrPerG;
      sellStr = sellMyrPerG;
    } else {
      // Style A: RM number → compute 6-dec strings and sell by spread
      if (typeof myrPerG !== "number" || !(myrPerG > 0)) {
        return res.status(400).json({ error: "myrPerG must be a positive number" });
      }

      // Prefer on-chain spread; fallback to env PRICE_SPREAD_BPS or 350 bps
      let spreadBps = 350;
      try {
        const info = await OumgService.getInfo(); // has spreadBps
        spreadBps = Number.isFinite(info?.spreadBps) ? info.spreadBps : spreadBps;
      } catch {
        spreadBps = Number(process.env.PRICE_SPREAD_BPS || "350");
      }

      const buyFloat = myrPerG; // BUY price shown to users
      const sellFloat = buyFloat * (1 - spreadBps / 10_000); // SELL price (bid) with spread

      // to 6 decimals integer strings
      buyStr = Math.round(buyFloat * 1_000_000).toString();
      sellStr = Math.round(sellFloat * 1_000_000).toString();
    }

    // 1) Write on-chain
    const { txHash } = await OumgService.setPrice({ buyMyrPerG: buyStr, sellMyrPerG: sellStr });

    // 2) Insert DB snapshot (keep your old shape for compatibility)
    //    We store human-readable floats as well for analytics.
    const buyFloatHuman = Number(buyStr) / 1_000_000;
    const sellFloatHuman = Number(sellStr) / 1_000_000;

    const snap = await PriceService.insertSnapshot({
      source: "manual-override",
      gold_usd_per_oz: null,           // not applicable in manual override
      fx_usd_to_myr: null,             // not applicable in manual override
      computed_myr_per_g: buyFloatHuman, // keep same column name for compatibility
      markup_bps: 0,                // legacy field; not used here
      note: note || `onchain_tx=${txHash}; buy=${buyFloatHuman}; sell=${sellFloatHuman}`,
    });

    // 3) Audit
    await insertAdminAudit(adminWallet, "PRICE_UPDATE", null, {
      buyMyrPerG: buyStr,
      sellMyrPerG: sellStr,
      txHash,
      note: note || null,
    });

    return res.json({
      success: true,
      txHash,
      onchain: { buyMyrPerG: buyStr, sellMyrPerG: sellStr },
      snapshot: snap,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "setManualPrice failed" });
  }
}

/**
 * GET /api/price/snapshots?limit=50&offset=0
 * Returns DB history (unchanged from your previous behavior).
 */
export async function listSnapshots(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const data = await PriceService.getSnapshots(limit, offset);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listSnapshots failed" });
  }
}
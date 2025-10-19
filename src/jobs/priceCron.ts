// src/jobs/priceCron.ts
import cron from "node-cron";
import { PriceService } from "../services/priceService";
import { logger } from "../logger";

/** Run the job once (used by the scheduler and manual kick). */
async function runOnce() {
  try {
    // 1) Fetch BNM Kijang Emas (MYR/oz)
    const bnm = await PriceService.fetchBnmKijangEmas();

    // 2) Convert to MYR/g with per-side bps
    const grams = PriceService.ozToGramWithBps({
      myr_per_oz_buying: bnm.myr_per_oz_buying,
      myr_per_oz_selling: bnm.myr_per_oz_selling,
    });

    // Both sides must exist to compute snapshot
    if (grams.buy == null || grams.sell == null) {
      throw new Error("BNM response missing buy/sell values");
    }

    // 3) Average for computed_myr_per_g (required non-null column)
    const avg = Number(((grams.buy + grams.sell) / 2).toFixed(6));

    // 4) Insert snapshot
    await PriceService.insertSnapshot({
      source: "bnm-kijang-emas",
      effective_date: bnm.effective_date,
      last_updated: bnm.last_updated,
      bnm_myr_per_oz_buying: bnm.myr_per_oz_buying,
      bnm_myr_per_oz_selling: bnm.myr_per_oz_selling,
      myr_per_g_buy: grams.buy,
      myr_per_g_sell: grams.sell,
      computed_myr_per_g: avg,
      buy_bps_applied: Number(process.env.PRICE_BUY_BPS || 0),
      sell_bps_applied: Number(process.env.PRICE_SELL_BPS || 0),
      note: null,
    });

    logger.info("[priceCron] snapshot inserted");
  } catch (err: any) {
    logger.error({ err: String(err?.message || err) }, "Price cron failed");
  }
}

/** Start cron if ENABLE_PRICE_CRON=true (every 30 minutes, plus an immediate run). */
export function startPriceCron() {
  if (String(process.env.ENABLE_PRICE_CRON).toLowerCase() !== "true") {
    logger.info("Price cron disabled");
    return;
  }

  // run immediately once on boot
  runOnce().catch(() => { /* already logged inside */ });

  // then schedule every 30 minutes (UTC)
  cron.schedule("*/30 * * * *", () => {
    runOnce().catch(() => { /* already logged inside */ });
  }, { timezone: "UTC" });

  logger.info("Price cron started (*/30 * * * * UTC)");
}
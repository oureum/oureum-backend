// src/jobs/priceCron.ts
import cron from "node-cron";
import { PriceService } from "../services/priceService";
import { logger } from "../logger";

/** Pull BNM Kijang Emas hourly and insert a snapshot. */
export function startPriceCron() {
  // At minute 5 of every hour
  cron.schedule("5 * * * *", async () => {
    try {
      const bnm = await PriceService.fetchBnmKijangEmas();
      const grams = PriceService.ozToGramWithBps({
        myr_per_oz_buying: bnm.myr_per_oz_buying,
        myr_per_oz_selling: bnm.myr_per_oz_selling,
      });

      await PriceService.insertSnapshot({
        source: "bnm-kijang-emas",
        effective_date: bnm.effective_date,
        last_updated: bnm.last_updated,
        bnm_myr_per_oz_buying: bnm.myr_per_oz_buying,
        bnm_myr_per_oz_selling: bnm.myr_per_oz_selling,
        myr_per_g_buy: grams.myr_per_g_buy,
        myr_per_g_sell: grams.myr_per_g_sell,
        buy_bps_applied: Number(process.env.PRICE_BUY_BPS || 0),
        sell_bps_applied: Number(process.env.PRICE_SELL_BPS || 0),
        note: null,
      });

      logger.info(
        {
          source: "bnm-kijang-emas",
          effective_date: bnm.effective_date,
          last_updated: bnm.last_updated,
          myr_per_g_buy: grams.myr_per_g_buy,
          myr_per_g_sell: grams.myr_per_g_sell,
        },
        "Price cron: snapshot inserted"
      );
    } catch (e: any) {
      logger.error({ err: e?.message }, "Price cron failed");
    }
  });
}
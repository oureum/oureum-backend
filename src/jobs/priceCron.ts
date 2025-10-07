import cron from "node-cron";
import { config } from "../config";
import { PriceService } from "../services/priceService";
import { logger } from "../logger";

/**
 * Periodically refresh price snapshot (manual/external placeholder).
 * This mainly demonstrates how you could schedule price sampling.
 */
export function startPriceCron() {
  if (!config.enablePriceCron) {
    logger.info("Price cron disabled");
    return;
  }
  logger.info({ expr: config.priceCronExpr }, "Starting price cron");

  cron.schedule(config.priceCronExpr, async () => {
    try {
      const { price_myr_per_g } = await PriceService.getCurrentMyrPerGram();
      logger.info({ price_myr_per_g }, "Price snapshot recorded by cron");
    } catch (err: any) {
      logger.error({ err }, "Price cron failed");
    }
  });
}
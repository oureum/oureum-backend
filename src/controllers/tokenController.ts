import { Request, Response } from "express";
import { buyAndMint, sellAndBurn, recordTokenOp } from "../models/tokenOpsModel";
import { ensureUserByWallet, getUserByWallet } from "../models/userModel";
import { ChainService } from "../services/chainService";
import { insertAdminAudit } from "../models/auditModel";
import { PriceService } from "../services/priceService";

const FALLBACK_PRICE = Number(process.env.PRICE_MANUAL_MYR_PER_G || 500);

/** POST /api/token/buy-mint */
export async function buyMintHandler(req: Request, res: Response) {
  try {
    const { wallet, grams } = req.body;
    if (!wallet || typeof grams !== "number" || grams <= 0) {
      return res.status(400).json({ error: "wallet and positive grams are required" });
    }

    // price from service (manual or external placeholder)
    const { price_myr_per_g } = await PriceService.getCurrentMyrPerGram().catch(() => ({
      price_myr_per_g: FALLBACK_PRICE,
    }));

    const userId = await ensureUserByWallet(wallet);

    // optional on-chain mint
    const chain = await ChainService.mintOUMG({ to: wallet, grams });
    const result = await buyAndMint(userId, grams, price_myr_per_g);

    // overwrite the last token_ops row with tx hash (or you can record another row)
    await recordTokenOp(userId, "BUY_MINT", grams, grams * price_myr_per_g, price_myr_per_g, chain.txHash);

    // audit admin
    const adminWallet = (req as any).adminWallet || "unknown";
    await insertAdminAudit(adminWallet, "MINT", wallet, {
      grams,
      price_myr_per_g,
      txHash: chain.txHash,
    });

    return res.json({
      success: true,
      price: price_myr_per_g,
      txHash: chain.txHash,
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "buyMint failed" });
  }
}

/** POST /api/token/sell-burn */
export async function sellBurnHandler(req: Request, res: Response) {
  try {
    const { wallet, grams } = req.body;
    if (!wallet || typeof grams !== "number" || grams <= 0) {
      return res.status(400).json({ error: "wallet and positive grams are required" });
    }

    const { price_myr_per_g } = await PriceService.getCurrentMyrPerGram().catch(() => ({
      price_myr_per_g: FALLBACK_PRICE,
    }));

    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "user not found" });

    // optional on-chain burn
    const chain = await ChainService.burnOUMG({ from: wallet, grams });
    const result = await sellAndBurn(user.id, grams, price_myr_per_g);

    await recordTokenOp(user.id, "SELL_BURN", grams, grams * price_myr_per_g, price_myr_per_g, chain.txHash);

    // audit admin
    const adminWallet = (req as any).adminWallet || "unknown";
    await insertAdminAudit(adminWallet, "BURN", wallet, {
      grams,
      price_myr_per_g,
      txHash: chain.txHash,
    });

    return res.json({
      success: true,
      price: price_myr_per_g,
      txHash: chain.txHash,
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "sellBurn failed" });
  }
}
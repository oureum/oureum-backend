// src/controllers/tokenController.ts
import { Request, Response } from "express";
import {
  buyAndMint,
  sellAndBurn,
  updateTokenOpTxHash,
  listAllOps,
} from "../models/tokenOpsModel";
import { ensureUserByWallet, getUserByWallet } from "../models/userModel";
import { ChainService } from "../services/chainService";
import { insertAdminAudit } from "../models/auditModel";
import { PriceService } from "../services/priceService";

// Fallbacks (env 可覆盖；否则买=500，卖=480 仅供演示)
const FALLBACK_BUY = Number(process.env.PRICE_FALLBACK_BUY_MYR_PER_G ?? 500);
const FALLBACK_SELL = Number(process.env.PRICE_FALLBACK_SELL_MYR_PER_G ?? 480);

/**
 * Normalize wallet to lowercase 0x…40
 */
function normWallet(w: string | undefined): string | null {
  if (!w) return null;
  const s = String(w).trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(s) ? s : null;
}

/** POST /api/token/buy-mint
 * body: { wallet: string, grams: number }
 * 结算价：使用“用户买入价”(BNM selling -> MYR/g -> 可加 markup)
 */
export async function buyMintHandler(req: Request, res: Response) {
  try {
    const wallet = normWallet(req.body?.wallet);
    const grams = Number(req.body?.grams);

    if (!wallet || !Number.isFinite(grams) || grams <= 0) {
      return res
        .status(400)
        .json({ error: "wallet (EVM address) and positive grams are required" });
    }

    // 拿价格：优先 PriceService，失败回退 FALLBACK_BUY
    let buyPrice = FALLBACK_BUY;
    try {
      const p = await PriceService.getCurrentMyrPerGram();
      // 兼容：若服务只返回 price_myr_per_g 就用它；否则优先 buy_myr_per_g
      buyPrice =
        (p as any).buy_myr_per_g ??
        (p as any).price_myr_per_g ??
        FALLBACK_BUY;
    } catch {
      // keep fallback
    }

    // 确保用户存在（有 rm/oumg 余额行）
    const userId = await ensureUserByWallet(wallet);

    // 先记账（rm-、oumg+、token_ops 新增）
    const result = await buyAndMint(userId, grams, buyPrice); // 要求返回 { opId, newRm, newOumg } 或包含 op.id
    const opId: number | undefined =
      (result as any)?.opId ?? (result as any)?.op?.id;

    // 链上 mint（可失败但不阻塞业务）
    let txHash: string | null = null;
    try {
      const chain = await ChainService.mintOUMG({ to: wallet, grams });
      txHash = chain.txHash || null;
    } catch (_e) {
      // 链上失败不回滚账本（demo）——如要强一致，可改为抛错
      txHash = null;
    }

    // 把 txHash 写回 token_ops
    if (opId && txHash) {
      await updateTokenOpTxHash(opId, txHash);
    }

    // 审计
    const adminWallet = (req as any).adminWallet || "unknown";
    await insertAdminAudit(adminWallet, "MINT", wallet, {
      grams,
      price_myr_per_g: buyPrice,
      txHash,
    });

    return res.json({
      success: true,
      price_myr_per_g: buyPrice,
      txHash,
      result,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "buyMint failed" });
  }
}

/** POST /api/token/sell-burn
 * body: { wallet: string, grams: number }
 * 结算价：使用“用户卖出价”(BNM buying -> MYR/g -> 可加/减 markup 策略)
 */
export async function sellBurnHandler(req: Request, res: Response) {
  try {
    const wallet = normWallet(req.body?.wallet);
    const grams = Number(req.body?.grams);

    if (!wallet || !Number.isFinite(grams) || grams <= 0) {
      return res
        .status(400)
        .json({ error: "wallet (EVM address) and positive grams are required" });
    }

    // 先确认用户存在
    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "user not found" });

    // 拿价格：优先 PriceService，失败回退 FALLBACK_SELL
    let sellPrice = FALLBACK_SELL;
    try {
      const p = await PriceService.getCurrentMyrPerGram();
      // 兼容：若服务只返回 price_myr_per_g 也可用；否则优先 sell_myr_per_g
      sellPrice =
        (p as any).sell_myr_per_g ??
        (p as any).price_myr_per_g ??
        FALLBACK_SELL;
    } catch {
      // keep fallback
    }

    // 先记账（oumg-、rm+、token_ops 新增）
    const result = await sellAndBurn(user.id, grams, sellPrice);
    const opId: number | undefined =
      (result as any)?.opId ?? (result as any)?.op?.id;

    // 链上 burn（可失败但不阻塞业务）
    let txHash: string | null = null;
    try {
      const chain = await ChainService.burnOUMG({ from: wallet, grams });
      txHash = chain.txHash || null;
    } catch (_e) {
      txHash = null;
    }

    // 把 txHash 写回 token_ops
    if (opId && txHash) {
      await updateTokenOpTxHash(opId, txHash);
    }

    // 审计
    const adminWallet = (req as any).adminWallet || "unknown";
    await insertAdminAudit(adminWallet, "BURN", wallet, {
      grams,
      price_myr_per_g: sellPrice,
      txHash,
    });

    return res.json({
      success: true,
      price_myr_per_g: sellPrice,
      txHash,
      result,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "sellBurn failed" });
  }
}

/** GET /api/token/ops?limit=50&offset=0  (admin) */
export async function listTokenOps(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const data = await listAllOps(limit, offset);
    return res.json({ limit, offset, data });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "listTokenOps failed" });
  }
}
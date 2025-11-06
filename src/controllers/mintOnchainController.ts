// src/controllers/mintOnchainController.ts
// On-chain mint + DB sync controller.
// If tx_hash is missing, server will mint on-chain first using admin PK (.env),
// then record the operation (deduct RM, add OUMG, insert token_ops, attach tx_hash).

import { Request, Response } from "express";
import { buyAndMint, updateTokenOpTxHash } from "../models/tokenOpsModel";
import { ensureUserByWallet } from "../models/userModel";
import { insertAdminAudit } from "../models/auditModel";
import { serverMintOumg } from "../lib/chain.server";

export async function mintOnchainController(
  req: Request,
  res: Response,
  opts: {
    role: "admin" | "user";
    adminWallet?: string | null;     // used for audit trail
    authUserWallet?: string | null;  // enforce wallet match on user route
  }
) {
  try {
    const { wallet, grams, unit_price_myr_per_g, tx_hash, note } = req.body || {};

    // Basic validations
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "wallet required" });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ error: "invalid wallet format" });
    }

    const g = Number(grams);
    const p = Number(unit_price_myr_per_g);
    if (!Number.isFinite(g) || g <= 0) {
      return res.status(400).json({ error: "grams must be > 0" });
    }
    if (!Number.isFinite(p) || p <= 0) {
      return res.status(400).json({ error: "unit_price_myr_per_g must be > 0" });
    }

    // Enforce wallet match on user endpoint if provided
    if (opts.role === "user" && opts.authUserWallet) {
      if (opts.authUserWallet.toLowerCase() !== wallet.toLowerCase()) {
        return res.status(403).json({ error: "wallet mismatch" });
      }
    }

    // Step 1: if tx_hash is not provided, mint on-chain now (server-signed)
    let finalTxHash: string;
    if (!tx_hash) {
      finalTxHash = await serverMintOumg(wallet.toLowerCase() as `0x${string}`, g);
    } else {
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(tx_hash))) {
        return res.status(400).json({ error: "invalid tx_hash format (0x + 64 hex)" });
      }
      finalTxHash = String(tx_hash);
    }

    // Step 2: ensure user rows exist, then do atomic RM- -> OUMG+
    const userId = await ensureUserByWallet(wallet);
    const { opId, newRm, newOumg } = await buyAndMint(userId, g, p);

    // Step 3: attach tx_hash to token_ops
    await updateTokenOpTxHash(opId, finalTxHash);

    // Step 4: optional admin audit
    if (opts.role === "admin") {
      const adminWallet = opts.adminWallet || "0x0000000000000000000000000000000000000000";
      await insertAdminAudit(adminWallet, "MINT", wallet, {
        grams: g,
        unit_price_myr_per_g: p,
        tx_hash: finalTxHash,
        note: note || null,
        source: "api/admin/mint-onchain",
      });
    }

    return res.json({
      ok: true,
      op_id: opId,
      wallet,
      tx_hash: finalTxHash,
      new_balances: {
        rm_credit_myr: newRm,
        oumg_g: newOumg,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "mint-onchain failed" });
  }
}
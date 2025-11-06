import { Request, Response } from "express";
import {
  listUsersWithBalances,
  createUser,
  creditUserByWallet,
  recordPurchaseByWallet,
} from "../models/userModel";
import { insertAdminAudit } from "../models/auditModel";
import { adminPurchaseSchema } from "../schemas";

/**
 * GET /api/admin/users
 * Query: limit?, offset?, q?
 */
export async function getAdminUsers(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit ?? 200);
    const offset = Number(req.query.offset ?? 0);
    const q = typeof req.query.q === "string" ? req.query.q : undefined;

    const rows = await listUsersWithBalances(limit, offset, q);
    res.json({ data: rows, limit, offset, q: q ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to list users" });
  }
}

/**
 * POST /api/admin/users
 * Body: { wallet: string, note?: string }
 */
export async function postCreateUser(req: Request, res: Response) {
  try {
    const admin = String(req.headers["x-admin-wallet"] || "");
    const wallet = String(req.body?.wallet || "").trim();
    const note = req.body?.note ? String(req.body.note) : null;

    // Basic wallet validation
    if (!wallet || !wallet.startsWith("0x") || wallet.length < 6) {
      return res.status(400).json({ error: "Invalid wallet" });
    }

    const row = await createUser(wallet, note);
    await insertAdminAudit(admin, "USER_CREATED", wallet, { note });

    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create user" });
  }
}

/**
 * POST /api/admin/users/:wallet/credit
 * Body: { amount_myr: number, note?: string }
 */
export async function postCreditUser(req: Request, res: Response) {
  try {
    const admin = String(req.headers["x-admin-wallet"] || "");
    const wallet = String(req.params.wallet || "").trim();
    const amount = Number(req.body?.amount_myr || 0);
    const note = req.body?.note ? String(req.body.note) : null;

    // Basic validation
    if (!wallet || !wallet.startsWith("0x")) {
      return res.status(400).json({ error: "Invalid wallet" });
    }
    if (!(amount > 0)) {
      return res.status(400).json({ error: "amount_myr must be > 0" });
    }

    const row = await creditUserByWallet(wallet, amount, note);
    await insertAdminAudit(admin, "USER_CREDITED", wallet, { amount_myr: amount, note });

    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to credit user" });
  }
}

/**
 * POST /api/admin/users/:wallet/purchase
 * Purpose:
 *  - Deduct RM credit based on grams * unit_price_myr_per_g
 *  - Increase OUMG grams
 *  - Optionally persist tx_hash in audit detail (so UI can link explorer)
 *
 * Body (validated by zod):
 *  {
 *    grams: number > 0,
 *    unit_price_myr_per_g: number > 0,
 *    note?: string,
 *    tx_hash?: "0x" + 64 hex
 *  }
 */
export async function postRecordPurchase(req: Request, res: Response) {
  try {
    const admin = String(req.headers["x-admin-wallet"] || "");
    const wallet = String(req.params.wallet || "").trim();

    // Basic wallet validation
    if (!wallet || !wallet.startsWith("0x")) {
      return res.status(400).json({ error: "Invalid wallet" });
    }

    // Validate and parse body with zod
    const parseResult = adminPurchaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      const msg = parseResult.error.issues?.[0]?.message || "Invalid payload";
      return res.status(400).json({ error: msg });
    }
    const { grams, unit_price_myr_per_g: unitPrice, note, tx_hash } = parseResult.data;

    // Core business: deduct RM, add grams (idempotent ensures both rows)
    const row = await recordPurchaseByWallet(wallet, grams, unitPrice, note ?? null);

    // Write admin audit. We store tx_hash in the JSON detail for traceability.
    await insertAdminAudit(admin, "USER_PURCHASED", wallet, {
      grams,
      unit_price_myr_per_g: unitPrice,
      cost_myr: grams * unitPrice,
      note: note ?? null,
      tx_hash: tx_hash ?? null,
    });

    // Respond with the updated snapshot and echo tx_hash for the UI
    res.json({ ...row, tx_hash: tx_hash ?? null });
  } catch (err: any) {
    const msg = err?.message ?? "Failed to record purchase";
    const status = msg.includes("insufficient RM credit") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
}
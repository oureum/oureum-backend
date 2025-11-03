import { Request, Response } from "express";
import {
  listUsersWithBalances,
  createUser,
  creditUserByWallet,
  recordPurchaseByWallet,
} from "../models/userModel";
import { insertAdminAudit } from "../models/auditModel";

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
 * Body: { grams: number, unit_price_myr_per_g: number, note?: string }
 */
export async function postRecordPurchase(req: Request, res: Response) {
  try {
    const admin = String(req.headers["x-admin-wallet"] || "");
    const wallet = String(req.params.wallet || "").trim();
    const grams = Number(req.body?.grams || 0);
    const unitPrice = Number(req.body?.unit_price_myr_per_g || 0);
    const note = req.body?.note ? String(req.body.note) : null;

    if (!wallet || !wallet.startsWith("0x")) {
      return res.status(400).json({ error: "Invalid wallet" });
    }
    if (!(grams > 0)) {
      return res.status(400).json({ error: "grams must be > 0" });
    }
    if (!(unitPrice > 0)) {
      return res.status(400).json({ error: "unit_price_myr_per_g must be > 0" });
    }

    const row = await recordPurchaseByWallet(wallet, grams, unitPrice, note);
    await insertAdminAudit(admin, "USER_PURCHASED", wallet, {
      grams,
      unit_price_myr_per_g: unitPrice,
      cost_myr: grams * unitPrice,
      note,
    });

    res.json(row);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to record purchase";
    const status = msg.includes("insufficient RM credit") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
}
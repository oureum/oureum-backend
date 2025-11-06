// src/controllers/userController.ts
import { Request, Response } from "express";
import { query } from "../db";
import { PriceService } from "../services/priceService";
import { serverMintOumg, serverBurnOumg } from "../lib/chain.server";

// -----------------------------
// Helpers
// -----------------------------
function normalizeWallet(addr: unknown): `0x${string}` {
  const s = String(addr || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(s)) throw new Error("Invalid wallet address");
  return s as `0x${string}`;
}

function toNum(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function toFixedNum(n: number, dp = 6): number {
  return Number(n.toFixed(dp));
}

/** Return pooled client if available (optional helper) */
async function getClientIfAvailable(): Promise<any | null> {
  return ((query as unknown) as { getClient?: () => Promise<any> }).getClient
    ? await ((query as unknown) as { getClient: () => Promise<any> }).getClient()
    : null;
}

/** Basic user row by wallet */
async function getUserByWallet(wallet: `0x${string}`) {
  const sql = `SELECT id, wallet_address, email, created_at, rm_spent, updated_at
               FROM users WHERE wallet_address = $1 LIMIT 1`;
  const { rows } = await query(sql, [wallet]);
  return rows?.[0] || null;
}

/** Ensure user + balance rows exist (idempotent) */
async function ensureUserAndBalances(client: any, wallet: `0x${string}`, email?: string | null) {
  // upsert user
  let user = await getUserByWalletWithClient(client, wallet);
  if (!user) {
    const ins = `
      INSERT INTO users (wallet_address, email, rm_spent)
      VALUES ($1, $2, 0)
      RETURNING id, wallet_address, email, created_at, rm_spent, updated_at
    `;
    const { rows } = await client.query(ins, [wallet, email ?? null]);
    user = rows[0];
  }

  // rm_balances
  const selRm = `SELECT id, user_id, balance_myr, updated_at FROM rm_balances WHERE user_id = $1 LIMIT 1`;
  let rm = (await client.query(selRm, [user.id])).rows?.[0] || null;
  if (!rm) {
    const insRm = `
      INSERT INTO rm_balances (user_id, balance_myr)
      VALUES ($1, 0)
      RETURNING id, user_id, balance_myr, updated_at
    `;
    rm = (await client.query(insRm, [user.id])).rows?.[0] || null;
  }

  // oumg_balances
  const selG = `SELECT id, user_id, balance_g, updated_at FROM oumg_balances WHERE user_id = $1 LIMIT 1`;
  let oumg = (await client.query(selG, [user.id])).rows?.[0] || null;
  if (!oumg) {
    const insG = `
      INSERT INTO oumg_balances (user_id, balance_g)
      VALUES ($1, 0)
      RETURNING id, user_id, balance_g, updated_at
    `;
    oumg = (await client.query(insG, [user.id])).rows?.[0] || null;
  }

  return { user, rm, oumg };
}

async function getUserByWalletWithClient(client: any, wallet: `0x${string}`) {
  const sql = `SELECT id, wallet_address, email, created_at, rm_spent, updated_at
               FROM users WHERE wallet_address = $1 LIMIT 1`;
  const { rows } = await client.query(sql, [wallet]);
  return rows?.[0] || null;
}

async function getBalancesByUserId(userId: number): Promise<{ rm: number; g: number }> {
  const rmQ = await query(
    `SELECT balance_myr FROM rm_balances WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const gQ = await query(
    `SELECT balance_g FROM oumg_balances WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return {
    rm: toNum(rmQ.rows?.[0]?.balance_myr, 0),
    g: toNum(gQ.rows?.[0]?.balance_g, 0),
  };
}

// -----------------------------
// Controllers
// -----------------------------

/**
 * POST /api/user/register
 * Header: X-User-Wallet
 * Body: { email? }
 * - Create user if not exist; also ensure rm_balances / oumg_balances rows.
 * - Returns { success: true }
 */
export async function registerUser(req: Request, res: Response) {
  try {
    const wallet = normalizeWallet(req.header("x-user-wallet"));
    const email =
      typeof req.body?.email === "string" && req.body.email.trim()
        ? req.body.email.trim()
        : null;

    const client = await getClientIfAvailable();
    if (client) {
      await client.query("BEGIN");
      try {
        await ensureUserAndBalances(client, wallet, email);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release?.();
      }
    } else {
      // Fallback（非事务）
      const fakeClient = { query };
      await ensureUserAndBalances(fakeClient, wallet, email);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "registerUser failed" });
  }
}

/**
 * GET /api/user/me
 * Header: X-User-Wallet
 * - Returns { data: userRow }
 */
export async function getMe(req: Request, res: Response) {
  try {
    const wallet = normalizeWallet(req.header("x-user-wallet"));
    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ data: user });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "getMe failed" });
  }
}

/**
 * GET /api/user/balances
 * Header: X-User-Wallet
 * - Returns { data: { rm_balance_myr, oumg_balance_g } }
 */
export async function getBalances(req: Request, res: Response) {
  try {
    const wallet = normalizeWallet(req.header("x-user-wallet"));
    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "User not found" });

    // idempotent ensure
    const fakeClient = { query };
    await ensureUserAndBalances(fakeClient, wallet, null);

    const b = await getBalancesByUserId(Number(user.id));
    return res.json({
      data: {
        rm_balance_myr: b.rm,
        oumg_balance_g: b.g,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "getBalances failed" });
  }
}

/**
 * GET /api/user/activity?limit=&offset=
 * Header: X-User-Wallet
 * - Returns { limit, offset, data: ActivityItem[] }
 */

export async function getActivity(req: Request, res: Response) {
  try {
    const wallet = normalizeWallet(req.header("x-user-wallet"));
    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "User not found" });

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    // Cast numeric -> float8 to avoid pg string returns
    const { rows } = await query(
      `SELECT
         id,
         user_id,
         op_type,
         (grams)::float8              AS grams,
         (amount_myr)::float8         AS amount_myr,
         (price_myr_per_g)::float8    AS price_myr_per_g,
         tx_hash,
         created_at,
         wallet_address,
         note
       FROM token_ops
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [Number(user.id), limit, offset]
    );

    return res.json({ limit, offset, data: rows || [] });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "getActivity failed" });
  }
}

/**
 * POST /api/user/mint
 * Header: X-User-Wallet
 * Body: { grams?: number, amountMyr?: number, note?: string }
 * - Uses BUY price (user side).
 * - Deducts RM, adds OUMG, writes token_ops (op_type=BUY_MINT), mints on chain.
 * - Returns { txHash, grams, amountMyr, price_myr_per_g }
 */
export async function userMint(req: Request, res: Response) {
  try {
    const wallet = normalizeWallet(req.header("x-user-wallet"));
    const { grams: gramsRaw, amountMyr: amountRaw } = req.body || {};
    const note =
      typeof req.body?.note === "string" && req.body.note.trim()
        ? req.body.note.trim()
        : null;

    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "User not found. Call /api/user/register first." });

    // Price (BUY)
    const price = await PriceService.getCurrentMyrPerGram();
    const buy = Number(price.user_buy_myr_per_g);
    if (!(buy > 0)) return res.status(500).json({ error: "Invalid price (BUY side)" });

    // Derive grams/amount
    let grams: number | null = typeof gramsRaw === "number" ? gramsRaw : null;
    let amountMyr: number | null = typeof amountRaw === "number" ? amountRaw : null;

    if (grams == null && amountMyr == null) {
      return res.status(400).json({ error: "Provide grams or amountMyr" });
    }
    if (grams == null && amountMyr != null) grams = toFixedNum(amountMyr / buy, 6);
    if (amountMyr == null && grams != null) amountMyr = toFixedNum(grams * buy, 2);

    if (!(grams! > 0) || !(amountMyr! > 0)) {
      return res.status(400).json({ error: "Invalid grams/amountMyr" });
    }

    // Check RM balance
    const rmBal = await query(
      `SELECT balance_myr FROM rm_balances WHERE user_id = $1 LIMIT 1`,
      [user.id]
    ).then(r => toNum(r.rows?.[0]?.balance_myr, 0));

    if (rmBal < amountMyr!) {
      return res.status(400).json({ error: "Insufficient RM balance" });
    }

    // On-chain mint first
    const txHash = await serverMintOumg(wallet, grams!);

    // DB transaction
    const client = await getClientIfAvailable();
    if (client) {
      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE rm_balances SET balance_myr = balance_myr - $1, updated_at = NOW() WHERE user_id = $2`,
          [amountMyr, user.id]
        );
        await client.query(
          `UPDATE oumg_balances SET balance_g = balance_g + $1, updated_at = NOW() WHERE user_id = $2`,
          [grams, user.id]
        );
        await client.query(
          `UPDATE users SET rm_spent = COALESCE(rm_spent,0) + $1, updated_at = NOW() WHERE id = $2`,
          [amountMyr, user.id]
        );
        await client.query(
          `INSERT INTO token_ops
             (user_id, op_type, grams, amount_myr, price_myr_per_g, tx_hash, wallet_address, note)
           VALUES ($1, 'BUY_MINT', $2, $3, $4, $5, $6, $7)`,
          [user.id, grams, amountMyr, buy, txHash, wallet, note]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release?.();
      }
    } else {
      // 非事务 fallback
      await query(
        `UPDATE rm_balances SET balance_myr = balance_myr - $1, updated_at = NOW() WHERE user_id = $2`,
        [amountMyr, user.id]
      );
      await query(
        `UPDATE oumg_balances SET balance_g = balance_g + $1, updated_at = NOW() WHERE user_id = $2`,
        [grams, user.id]
      );
      await query(
        `UPDATE users SET rm_spent = COALESCE(rm_spent,0) + $1, updated_at = NOW() WHERE id = $2`,
        [amountMyr, user.id]
      );
      await query(
        `INSERT INTO token_ops
           (user_id, op_type, grams, amount_myr, price_myr_per_g, tx_hash, wallet_address, note)
         VALUES ($1, 'BUY_MINT', $2, $3, $4, $5, $6, $7)`,
        [user.id, grams, amountMyr, buy, txHash, wallet, note]
      );
    }

    return res.json({
      txHash,
      grams: grams!,
      amountMyr: amountMyr!,
      price_myr_per_g: buy,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "userMint failed" });
  }
}

/**
 * POST /api/user/burn
 * Header: X-User-Wallet
 * Body: { grams: number, note?: string }
 * - Uses SELL price (user side).
 * - Subtracts OUMG, credits RM, writes token_ops (op_type=SELL_BURN), burns on chain.
 * - Returns { txHash, grams, amountMyr, price_myr_per_g }
 */
export async function userBurn(req: Request, res: Response) {
  try {
    const wallet = normalizeWallet(req.header("x-user-wallet"));
    const grams = Number(req.body?.grams);
    const note =
      typeof req.body?.note === "string" && req.body.note.trim()
        ? req.body.note.trim()
        : null;

    if (!(grams > 0)) {
      return res.status(400).json({ error: "grams must be > 0" });
    }

    const user = await getUserByWallet(wallet);
    if (!user) return res.status(404).json({ error: "User not found. Call /api/user/register first." });

    // Price (SELL)
    const price = await PriceService.getCurrentMyrPerGram();
    const sell = Number(price.user_sell_myr_per_g);
    if (!(sell > 0)) return res.status(500).json({ error: "Invalid price (SELL side)" });

    // Check OUMG balance
    const gBal = await query(
      `SELECT balance_g FROM oumg_balances WHERE user_id = $1 LIMIT 1`,
      [user.id]
    ).then(r => toNum(r.rows?.[0]?.balance_g, 0));

    if (gBal < grams) {
      return res.status(400).json({ error: "Insufficient OUMG balance" });
    }

    const creditMyr = toFixedNum(grams * sell, 2);

    // On-chain burn
    const txHash = await serverBurnOumg(wallet, grams);

    // DB transaction
    const client = await getClientIfAvailable();
    if (client) {
      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE rm_balances SET balance_myr = balance_myr + $1, updated_at = NOW() WHERE user_id = $2`,
          [creditMyr, user.id]
        );
        await client.query(
          `UPDATE oumg_balances SET balance_g = balance_g - $1, updated_at = NOW() WHERE user_id = $2`,
          [grams, user.id]
        );
        await client.query(
          `INSERT INTO token_ops
             (user_id, op_type, grams, amount_myr, price_myr_per_g, tx_hash, wallet_address, note)
           VALUES ($1, 'SELL_BURN', $2, $3, $4, $5, $6, $7)`,
          [user.id, grams, creditMyr, sell, txHash, wallet, note]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release?.();
      }
    } else {
      // 非事务 fallback
      await query(
        `UPDATE rm_balances SET balance_myr = balance_myr + $1, updated_at = NOW() WHERE user_id = $2`,
        [creditMyr, user.id]
      );
      await query(
        `UPDATE oumg_balances SET balance_g = balance_g - $1, updated_at = NOW() WHERE user_id = $2`,
        [grams, user.id]
      );
      await query(
        `INSERT INTO token_ops
           (user_id, op_type, grams, amount_myr, price_myr_per_g, tx_hash, wallet_address, note)
         VALUES ($1, 'SELL_BURN', $2, $3, $4, $5, $6, $7)`,
        [user.id, grams, creditMyr, sell, txHash, wallet, note]
      );
    }

    return res.json({
      txHash,
      grams,
      amountMyr: creditMyr,
      price_myr_per_g: sell,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "userBurn failed" });
  }
}
// src/models/userModel.ts
import { query } from "../db";

/**
 * Ensure a user row exists (by wallet, case-insensitive) and also ensure
 * both balance rows exist. Returns user_id. Wallet is stored lowercased.
 */
export async function ensureUserByWallet(wallet: string): Promise<number> {
  const w = wallet.toLowerCase();

  const upsertUserSql = `
    INSERT INTO users (wallet_address)
    VALUES ($1)
    ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
    RETURNING id
  `;
  const { rows } = await query<{ id: number }>(upsertUserSql, [w]);
  const userId = rows[0].id;

  await ensureBalanceRows(userId);
  return userId;
}

/** Ensure rm_balances & oumg_balances rows exist for a given user_id (idempotent). */
async function ensureBalanceRows(userId: number) {
  await query(
    `INSERT INTO rm_balances (user_id, balance_myr)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  await query(
    `INSERT INTO oumg_balances (user_id, balance_g)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

/** Fetch a user by wallet (case-insensitive). */
export async function getUserByWallet(wallet: string) {
  const sql = `
    SELECT id, wallet_address, created_at
    FROM users
    WHERE lower(wallet_address)=lower($1)
    LIMIT 1
  `;
  const { rows } = await query(sql, [wallet]);
  return rows[0] || null;
}

/**
 * List users with balances (from the view).
 * Supports optional text query (wallet like), limit/offset.
 * Returns fields that match the admin Users UI.
 */
export async function listUsersWithBalances(
  limit = 50,
  offset = 0,
  q?: string
) {
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
  const safeOffset = Math.max(Number(offset || 0), 0);

  const params: any[] = [];
  let where = "";
  if (q && q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    // v_users_with_balances exposes "wallet"
    where = `WHERE lower(wallet) LIKE $${params.length}`;
  }

  const sql = `
    SELECT
      id,
      wallet,
      rm_credit,
      rm_spent,
      oumg_grams,
      note,
      updated_at
    FROM v_users_with_balances
    ${where}
    ORDER BY id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(safeLimit, safeOffset);

  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Create a user by wallet (idempotent). Returns the unified user+balances shape
 * from the view (so rm_spent is present).
 */
export async function createUser(wallet: string, note?: string | null) {
  const userId = await ensureUserByWallet(wallet);

  const row = await query(
    `
    SELECT
      id,
      wallet,
      rm_credit,
      rm_spent,
      oumg_grams,
      note,
      updated_at
    FROM v_users_with_balances
    WHERE id = $1
    `,
    [userId]
  );

  return row.rows[0];
}

/**
 * Credit RM to a wallet (add funds).
 * - Ensures user exists (upsert)
 * - Ensures rm_balances row exists (idempotent)
 * - Increments rm_balances.balance_myr
 * - Returns the updated snapshot from the view (includes rm_spent)
 */
export async function creditUserByWallet(wallet: string, amountMyr: number, note?: string | null) {
  const w = wallet.toLowerCase();
  if (!(amountMyr > 0)) {
    throw new Error("amount_myr must be > 0");
  }

  await query("BEGIN");
  try {
    // Ensure user exists and get id
    const userRes = await query<{ id: number }>(
      `INSERT INTO users (wallet_address)
       VALUES ($1)
       ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
       RETURNING id`,
      [w]
    );
    const userId = userRes.rows[0].id;

    // Ensure rm_balances row exists
    await query(
      `INSERT INTO rm_balances (user_id, balance_myr)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Add credit (no updated_at column mutation)
    await query(
      `UPDATE rm_balances
       SET balance_myr = balance_myr + $1
       WHERE user_id = $2`,
      [amountMyr, userId]
    );

    // (Optional) persist note elsewhere if needed.

    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }

  // Return updated snapshot from the view
  const row = await query(
    `
    SELECT
      id,
      wallet,
      rm_credit,
      rm_spent,
      oumg_grams,
      note,
      updated_at
    FROM v_users_with_balances
    WHERE lower(wallet) = lower($1)
    `,
    [w]
  );

  return row.rows[0];
}

/**
 * Record a purchase (off-chain bookkeeping path):
 *  - Ensures user & both balance rows exist
 *  - Deducts RM credit (cost = grams * unit_price)
 *  - Increases OUMG grams
 *  - Accumulates users.rm_spent (so the view shows it immediately)
 *  - Returns updated snapshot from the view
 */
export async function recordPurchaseByWallet(
  wallet: string,
  grams: number,
  unitPriceMyrPerG: number,
  note?: string | null
) {
  const w = wallet.toLowerCase();
  if (!(grams > 0)) throw new Error("grams must be > 0");
  if (!(unitPriceMyrPerG > 0)) throw new Error("unit_price_myr_per_g must be > 0");

  const cost = grams * unitPriceMyrPerG;

  await query("BEGIN");
  try {
    // Ensure user exists (idempotent)
    const userRes = await query<{ id: number }>(
      `INSERT INTO users (wallet_address)
       VALUES ($1)
       ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
       RETURNING id`,
      [w]
    );
    const userId = userRes.rows[0].id;

    // Ensure BOTH balance rows exist
    await ensureBalanceRows(userId);

    // Lock RM row for deduction
    const balRes = await query<{ balance_myr: string }>(
      `SELECT balance_myr FROM rm_balances WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const current = Number(balRes.rows[0]?.balance_myr ?? 0);
    if (current < cost) {
      throw new Error("insufficient RM credit");
    }

    // Deduct RM (no updated_at column mutation)
    await query(
      `UPDATE rm_balances
       SET balance_myr = balance_myr - $1
       WHERE user_id = $2`,
      [cost, userId]
    );

    // Increase OUMG grams (no updated_at column mutation)
    await query(
      `UPDATE oumg_balances
       SET balance_g = balance_g + $1
       WHERE user_id = $2`,
      [grams, userId]
    );

    // Accumulate rm_spent so the view reflects it immediately
    await query(
      `UPDATE users
       SET rm_spent = COALESCE(rm_spent,0) + $1
       WHERE id = $2`,
      [cost, userId]
    );

    // (Optional) persist note to audit/notes.

    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }

  // Return updated snapshot from the view
  const row = await query(
    `
    SELECT
      id,
      wallet,
      rm_credit,
      rm_spent,
      oumg_grams,
      note,
      updated_at
    FROM v_users_with_balances
    WHERE lower(wallet) = lower($1)
    `,
    [w]
  );

  return row.rows[0];
}
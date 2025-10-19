// src/models/balanceModel.ts
import { pool, query } from "../db";
import { ensureUserByWallet } from "./userModel";

/** Ensure rm_balances row exists for this user; create with 0 if missing. */
async function ensureRmRow(userId: number) {
  await query(
    `INSERT INTO rm_balances (user_id, balance_myr)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

/** Ensure oumg_balances row exists for this user; create with 0 if missing. */
async function ensureOumgRow(userId: number) {
  await query(
    `INSERT INTO oumg_balances (user_id, balance_g)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

/** Read RM balance (MYR) by user_id. Auto-creates a zero row if missing. */
export async function getRmBalance(userId: number): Promise<number> {
  await ensureRmRow(userId);
  const { rows } = await query(
    `SELECT balance_myr
     FROM rm_balances
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return rows.length ? Number(rows[0].balance_myr) : 0;
}

/** Read OUMG balance (grams) by user_id. Auto-creates a zero row if missing. */
export async function getOumgBalance(userId: number): Promise<number> {
  await ensureOumgRow(userId);
  const { rows } = await query(
    `SELECT balance_g
     FROM oumg_balances
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return rows.length ? Number(rows[0].balance_g) : 0;
}

/**
 * Adjust RM balance by delta (can be positive or negative).
 * Returns the new RM balance.
 */
export async function adjustRmBalance(
  userId: number,
  deltaMyr: number
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO rm_balances (user_id, balance_myr)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const { rows } = await client.query(
      `UPDATE rm_balances
       SET balance_myr = balance_myr + $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_myr`,
      [deltaMyr, userId]
    );
    await client.query("COMMIT");
    if (!rows.length) throw new Error(`RM balance not found for user_id=${userId}`);
    return Number(rows[0].balance_myr);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Adjust OUMG balance by delta (grams, positive or negative).
 * Returns the new OUMG balance.
 */
export async function adjustOumgBalance(
  userId: number,
  deltaGrams: number
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO oumg_balances (user_id, balance_g)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const { rows } = await client.query(
      `UPDATE oumg_balances
       SET balance_g = balance_g + $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_g`,
      [deltaGrams, userId]
    );
    await client.query("COMMIT");
    if (!rows.length) throw new Error(`OUMG balance not found for user_id=${userId}`);
    return Number(rows[0].balance_g);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Get both RM credits and OUMG grams by wallet (public read helper).
 * If user doesn't exist, returns zeros.
 */
export async function getBalancesByWallet(wallet: string): Promise<{
  rmCredits: number;
  oumgGrams: number;
}> {
  const w = wallet.toLowerCase().trim();
  const client = await pool.connect();
  try {
    const userRes = await client.query(
      `SELECT id FROM users WHERE lower(wallet_address) = $1 LIMIT 1`,
      [w]
    );
    if (userRes.rowCount === 0) {
      return { rmCredits: 0, oumgGrams: 0 };
    }
    const userId = userRes.rows[0].id as number;

    const rm = await getRmBalance(userId);
    const oumg = await getOumgBalance(userId);
    return { rmCredits: rm, oumgGrams: oumg };
  } finally {
    client.release();
  }
}

/**
 * Credit RM by wallet (ensure user exists). Returns new balance.
 * `reason` is accepted to match controller signature; auditing is expected elsewhere.
 */
export async function creditRmByWallet(
  wallet: string,
  amount: number,
  _reason?: string
): Promise<{ userId: number; newBalance: number }> {
  const w = wallet.toLowerCase().trim();
  if (!/^0x[a-f0-9]{40}$/.test(w)) throw new Error("Invalid wallet");
  if (!Number.isFinite(amount)) throw new Error("Invalid amount");

  const userId = await ensureUserByWallet(w);
  const newBalance = await adjustRmBalance(userId, amount);
  return { userId, newBalance };
}
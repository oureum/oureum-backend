import { query } from "../db";

/**
 * Ensure a user row (and balance rows) exist for a given wallet.
 * Returns user_id. Wallet is stored lowercased.
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

  // Ensure balance rows exist (idempotent)
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

  return userId;
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
 * List users with balances.
 * Supports optional text query (wallet like), limit/offset.
 * Returns fields compatible with the admin Users UI (aliases provided).
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
    where = `WHERE lower(u.wallet_address) LIKE $${params.length}`;
  }

  // rm_spent is often a derived metric (sum of purchases).
  // If you do not maintain a purchases table, we alias 0 for now.
  const sql = `
    SELECT
      u.id,
      u.wallet_address AS wallet,
      COALESCE(rm.balance_myr, 0) AS rm_credit,
      0::numeric               AS rm_spent,   -- alias 0 if you don't keep a ledger
      COALESCE(og.balance_g, 0) AS oumg_grams,
      NULL::text               AS note,        -- optional note placeholder
      COALESCE(u.updated_at, u.created_at) AS updated_at
    FROM users u
    LEFT JOIN rm_balances rm ON rm.user_id = u.id
    LEFT JOIN oumg_balances og ON og.user_id = u.id
    ${where}
    ORDER BY u.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(safeLimit, safeOffset);

  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Create a user by wallet (idempotent). Returns the unified user+balances shape.
 */
export async function createUser(wallet: string, note?: string | null) {
  const userId = await ensureUserByWallet(wallet);

  // Optional: persist note if you have a column for it. If not, skip.
  // Example (uncomment if users.note exists):
  // await query(`UPDATE users SET note = COALESCE($1, note), updated_at = NOW() WHERE id = $2`, [note ?? null, userId]);

  // Return the same shape as list
  const row = await query(
    `
    SELECT
      u.id,
      u.wallet_address AS wallet,
      COALESCE(rm.balance_myr, 0) AS rm_credit,
      0::numeric               AS rm_spent,
      COALESCE(og.balance_g, 0) AS oumg_grams,
      NULL::text               AS note,
      COALESCE(u.updated_at, u.created_at) AS updated_at
    FROM users u
    LEFT JOIN rm_balances rm ON rm.user_id = u.id
    LEFT JOIN oumg_balances og ON og.user_id = u.id
    WHERE u.id = $1
    `,
    [userId]
  );

  return row.rows[0];
}

/**
 * Credit RM to a wallet.
 * - Increments rm_balances.balance_myr by amount
 * - Returns the updated user+balances shape
 */
export async function creditUserByWallet(wallet: string, amountMyr: number, note?: string | null) {
  const w = wallet.toLowerCase();
  if (!(amountMyr > 0)) {
    throw new Error("amount_myr must be > 0");
  }

  // Begin transaction
  await query("BEGIN");
  try {
    const user = await getUserByWallet(w);
    const userId = user ? user.id : await ensureUserByWallet(w);

    await query(
      `
      UPDATE rm_balances
      SET balance_myr = balance_myr + $1
      WHERE user_id = $2
      `,
      [amountMyr, userId]
    );

    // Optional: store note somewhere if you have a notes table/column.

    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }

  // Return updated snapshot
  const row = await query(
    `
    SELECT
      u.id,
      u.wallet_address AS wallet,
      COALESCE(rm.balance_myr, 0) AS rm_credit,
      0::numeric               AS rm_spent,
      COALESCE(og.balance_g, 0) AS oumg_grams,
      NULL::text               AS note,
      COALESCE(u.updated_at, u.created_at) AS updated_at
    FROM users u
    LEFT JOIN rm_balances rm ON rm.user_id = u.id
    LEFT JOIN oumg_balances og ON og.user_id = u.id
    WHERE lower(u.wallet_address) = lower($1)
    `,
    [w]
  );

  return row.rows[0];
}

/**
 * Record a purchase:
 * - Deducts RM credit (cost = grams * unit_price)
 * - Increases OUMG grams
 * - Returns updated user+balances shape
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
    const user = await getUserByWallet(w);
    const userId = user ? user.id : await ensureUserByWallet(w);

    // Fetch current RM balance
    const balRes = await query<{ balance_myr: string }>(
      `SELECT balance_myr FROM rm_balances WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const current = Number(balRes.rows[0]?.balance_myr ?? 0);
    if (current < cost) {
      throw new Error("insufficient RM credit");
    }

    // Deduct RM
    await query(
      `UPDATE rm_balances SET balance_myr = balance_myr - $1 WHERE user_id = $2`,
      [cost, userId]
    );

    // Increase OUMG grams
    await query(
      `
      UPDATE oumg_balances
      SET balance_g = balance_g + $1
      WHERE user_id = $2
      `,
      [grams, userId]
    );

    // Optional: persist note somewhere if needed.

    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }

  const row = await query(
    `
    SELECT
      u.id,
      u.wallet_address AS wallet,
      COALESCE(rm.balance_myr, 0) AS rm_credit,
      0::numeric               AS rm_spent,
      COALESCE(og.balance_g, 0) AS oumg_grams,
      NULL::text               AS note,
      COALESCE(u.updated_at, u.created_at) AS updated_at
    FROM users u
    LEFT JOIN rm_balances rm ON rm.user_id = u.id
    LEFT JOIN oumg_balances og ON og.user_id = u.id
    WHERE lower(u.wallet_address) = lower($1)
    `,
    [w]
  );

  return row.rows[0];
}
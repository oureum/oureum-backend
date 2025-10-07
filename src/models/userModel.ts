import { query } from "../db";

/** Ensure a user row exists by wallet address; returns user_id */
export async function ensureUserByWallet(wallet: string): Promise<number> {
  const upsertUserSql = `
    INSERT INTO users (wallet_address)
    VALUES ($1)
    ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
    RETURNING id
  `;
  const { rows } = await query<{ id: number }>(upsertUserSql, [wallet]);
  const userId = rows[0].id;

  // ensure balance rows exist
  await query(
    `INSERT INTO rm_balances (user_id, balance_myr)
     VALUES ($1, 0)
     ON CONFLICT DO NOTHING`,
    [userId]
  );
  await query(
    `INSERT INTO oumg_balances (user_id, balance_g)
     VALUES ($1, 0)
     ON CONFLICT DO NOTHING`,
    [userId]
  );
  return userId;
}

export async function getUserByWallet(wallet: string) {
  const sql = `SELECT id, wallet_address, created_at FROM users WHERE lower(wallet_address)=lower($1) LIMIT 1`;
  const { rows } = await query(sql, [wallet]);
  return rows[0] || null;
}

export async function listUsersWithBalances(limit = 50, offset = 0) {
  const sql = `
    SELECT
      u.id,
      u.wallet_address,
      COALESCE(rm.balance_myr,0) AS balance_myr,
      COALESCE(og.balance_g,0)   AS balance_g,
      u.created_at
    FROM users u
    LEFT JOIN rm_balances rm ON rm.user_id = u.id
    LEFT JOIN oumg_balances og ON og.user_id = u.id
    ORDER BY u.id DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await query(sql, [limit, offset]);
  return rows;
}
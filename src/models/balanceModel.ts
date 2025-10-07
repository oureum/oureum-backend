import { pool, query } from "../db";

/** Credit RM to user (create user if not exists). Returns new balance. */
export async function creditRmByWallet(wallet: string, amountMyr: number) {
  if (amountMyr <= 0) throw new Error("amount must be positive");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ensure user
    const upsertUser = `
      INSERT INTO users (wallet_address)
      VALUES ($1)
      ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
      RETURNING id
    `;
    const userRes = await client.query(upsertUser, [wallet]);
    const userId: number = userRes.rows[0].id;

    // ensure balance row
    await client.query(
      `INSERT INTO rm_balances (user_id, balance_myr)
       VALUES ($1, 0)
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    // update balance
    const upd = await client.query(
      `UPDATE rm_balances
       SET balance_myr = balance_myr + $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_myr`,
      [amountMyr, userId]
    );

    await client.query("COMMIT");
    return { userId, balance_myr: upd.rows[0].balance_myr as number };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getBalancesByWallet(wallet: string) {
  const sql = `
    SELECT
      u.id,
      u.wallet_address,
      COALESCE(rm.balance_myr,0) AS balance_myr,
      COALESCE(og.balance_g,0)   AS balance_g
    FROM users u
    LEFT JOIN rm_balances rm ON rm.user_id = u.id
    LEFT JOIN oumg_balances og ON og.user_id = u.id
    WHERE lower(u.wallet_address)=lower($1)
    LIMIT 1
  `;
  const { rows } = await query(sql, [wallet]);
  return rows[0] || null;
}
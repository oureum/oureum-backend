// src/models/tokenOpsModel.ts
import { pool } from "../db";

/**
 * Insert a token operation row (generic helper).
 * Prefer using buyAndMint / sellAndBurn which also move balances in a transaction.
 * - Persists wallet_address by reading it from users table to de-normalize for quick filtering.
 * - Supports optional txHash and note.
 */
export async function recordTokenOp(
  userId: number,
  opType: "BUY_MINT" | "SELL_BURN",
  grams: number,
  amountMyr: number,
  pricePerGram: number,
  txHash?: string,
  note?: string | null
) {
  const q = await pool.query(
    `
    INSERT INTO token_ops (
      user_id,
      wallet_address,
      op_type,
      grams,
      amount_myr,
      price_myr_per_g,
      tx_hash,
      note
    )
    VALUES (
      $1,
      (SELECT wallet_address FROM users WHERE id = $1),
      $2, $3, $4, $5, $6, $7
    )
    RETURNING id, wallet_address, created_at
    `,
    [userId, opType, grams, amountMyr, pricePerGram, txHash || null, note || null]
  );

  return q.rows[0] as { id: number; wallet_address: string; created_at: string };
}

/**
 * Perform a full BUY + MINT in a single DB transaction:
 *  - Deduct RM (rm_balances)
 *  - Increase OUMG (oumg_balances)
 *  - Accumulate users.rm_spent
 *  - Insert token_ops (with wallet_address + note)
 * Returns new balances and op id for later tx_hash attachment.
 */
export async function buyAndMint(
  userId: number,
  grams: number,
  pricePerGram: number,
  note?: string | null
) {
  const spend = grams * pricePerGram;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Deduct RM credit
    const rmRes = await client.query(
      `
      UPDATE rm_balances
      SET balance_myr = balance_myr - $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING balance_myr
      `,
      [spend, userId]
    );
    if (rmRes.rowCount === 0) throw new Error("User RM balance missing");
    if (Number(rmRes.rows[0].balance_myr) < 0) throw new Error("Insufficient RM balance");

    // 2) Increase OUMG grams
    const oumgRes = await client.query(
      `
      UPDATE oumg_balances
      SET balance_g = balance_g + $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING balance_g
      `,
      [grams, userId]
    );
    if (oumgRes.rowCount === 0) throw new Error("User OUMG balance missing");

    // 3) Accumulate user's cumulative spend
    await client.query(
      `
      UPDATE users
      SET rm_spent = COALESCE(rm_spent, 0) + $1,
          updated_at = NOW()
      WHERE id = $2
      `,
      [spend, userId]
    );

    // 4) Log operation (BUY_MINT)
    const op = await client.query(
      `
      INSERT INTO token_ops (
        user_id,
        wallet_address,
        op_type,
        grams,
        amount_myr,
        price_myr_per_g,
        note
      )
      VALUES (
        $1,
        (SELECT wallet_address FROM users WHERE id = $1),
        'BUY_MINT',
        $2,
        $3,
        $4,
        $5
      )
      RETURNING id, wallet_address, created_at
      `,
      [userId, grams, spend, pricePerGram, note || null]
    );

    await client.query("COMMIT");
    return {
      opId: op.rows[0].id as number,
      newRm: Number(rmRes.rows[0].balance_myr),
      newOumg: Number(oumgRes.rows[0].balance_g),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Perform a full SELL + BURN in a single DB transaction:
 *  - Deduct OUMG (oumg_balances)
 *  - Credit RM (rm_balances)
 *  - Insert token_ops (with wallet_address + note)
 * Returns new balances and op id for later tx_hash attachment.
 *
 * NOTE: rm_spent is NOT decreased here; if you need a separate metric for refunds,
 *       add another column like rm_refunded and maintain it symmetrically.
 */
export async function sellAndBurn(
  userId: number,
  grams: number,
  pricePerGram: number,
  note?: string | null
) {
  const refund = grams * pricePerGram;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Deduct OUMG grams
    const oumgRes = await client.query(
      `
      UPDATE oumg_balances
      SET balance_g = balance_g - $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING balance_g
      `,
      [grams, userId]
    );
    if (oumgRes.rowCount === 0) throw new Error("User OUMG balance missing");
    if (Number(oumgRes.rows[0].balance_g) < 0) throw new Error("Insufficient OUMG balance");

    // 2) Credit RM
    const rmRes = await client.query(
      `
      UPDATE rm_balances
      SET balance_myr = balance_myr + $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING balance_myr
      `,
      [refund, userId]
    );
    if (rmRes.rowCount === 0) throw new Error("User RM balance missing");

    // 3) Log operation (SELL_BURN)
    const op = await client.query(
      `
      INSERT INTO token_ops (
        user_id,
        wallet_address,
        op_type,
        grams,
        amount_myr,
        price_myr_per_g,
        note
      )
      VALUES (
        $1,
        (SELECT wallet_address FROM users WHERE id = $1),
        'SELL_BURN',
        $2,
        $3,
        $4,
        $5
      )
      RETURNING id, wallet_address, created_at
      `,
      [userId, grams, refund, pricePerGram, note || null]
    );

    await client.query("COMMIT");
    return {
      opId: op.rows[0].id as number,
      newRm: Number(rmRes.rows[0].balance_myr),
      newOumg: Number(oumgRes.rows[0].balance_g),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Update tx_hash for a specific token_ops row. */
export async function updateTokenOpTxHash(opId: number, txHash: string) {
  const q = await pool.query(
    `UPDATE token_ops SET tx_hash = $2 WHERE id = $1 RETURNING id, tx_hash`,
    [opId, txHash]
  );
  return q.rows[0] as { id: number; tx_hash: string };
}

/**
 * Public list: token ops by wallet (pagination).
 * - Use lower() on the filter to be case-insensitive.
 */
export async function listOpsByWallet(wallet: string, limit = 50, offset = 0) {
  const q = await pool.query(
    `
    SELECT
      id,
      wallet_address,
      op_type,
      grams,
      amount_myr,
      price_myr_per_g,
      tx_hash,
      note,
      created_at
    FROM token_ops
    WHERE lower(wallet_address) = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [wallet.toLowerCase(), limit, offset]
  );
  return q.rows;
}

/** Admin list: all token ops (pagination). */
export async function listAllOps(limit = 50, offset = 0) {
  const q = await pool.query(
    `
    SELECT
      id,
      wallet_address,
      op_type,
      grams,
      amount_myr,
      price_myr_per_g,
      tx_hash,
      created_at
    FROM token_ops
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );
  return q.rows;
}
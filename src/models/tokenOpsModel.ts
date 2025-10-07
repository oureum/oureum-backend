import { pool, query } from "../db";

/** 
 * Record a token operation (buy→mint / sell→burn).
 * SC integration placeholder is left for later (txHash can be provided by service).
 */
export async function recordTokenOp(
  userId: number,
  opType: "BUY_MINT" | "SELL_BURN",
  grams: number,
  amountMyr: number,
  pricePerGram: number,
  txHash?: string
) {
  const sql = `
    INSERT INTO token_ops (user_id, op_type, grams, amount_myr, price_myr_per_g, tx_hash)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, created_at
  `;
  const { rows } = await query(sql, [
    userId,
    opType,
    grams,
    amountMyr,
    pricePerGram,
    txHash || null,
  ]);
  return rows[0];
}

/** 
 * Perform a full buy+mint (deduct RM, add OUMG).
 * This uses a single transaction block.
 */
export async function buyAndMint(
  userId: number,
  grams: number,
  pricePerGram: number
) {
  const spend = grams * pricePerGram;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // deduct RM balance
    const rmRes = await client.query(
      `UPDATE rm_balances
       SET balance_myr = balance_myr - $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_myr`,
      [spend, userId]
    );
    if (rmRes.rowCount === 0) throw new Error("User RM balance missing");
    if (rmRes.rows[0].balance_myr < 0)
      throw new Error("Insufficient RM balance");

    // add OUMG
    const oumgRes = await client.query(
      `UPDATE oumg_balances
       SET balance_g = balance_g + $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_g`,
      [grams, userId]
    );

    // log op
    const op = await client.query(
      `INSERT INTO token_ops (user_id, op_type, grams, amount_myr, price_myr_per_g)
       VALUES ($1,'BUY_MINT',$2,$3,$4)
       RETURNING id, created_at`,
      [userId, grams, spend, pricePerGram]
    );

    await client.query("COMMIT");
    return { newRm: rmRes.rows[0].balance_myr, newOumg: oumgRes.rows[0].balance_g, op: op.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Perform a sell+burn (deduct OUMG, credit RM).
 */
export async function sellAndBurn(
  userId: number,
  grams: number,
  pricePerGram: number
) {
  const refund = grams * pricePerGram;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // deduct OUMG
    const oumgRes = await client.query(
      `UPDATE oumg_balances
       SET balance_g = balance_g - $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_g`,
      [grams, userId]
    );
    if (oumgRes.rowCount === 0) throw new Error("User OUMG balance missing");
    if (oumgRes.rows[0].balance_g < 0)
      throw new Error("Insufficient OUMG balance");

    // add RM
    const rmRes = await client.query(
      `UPDATE rm_balances
       SET balance_myr = balance_myr + $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance_myr`,
      [refund, userId]
    );

    // log op
    const op = await client.query(
      `INSERT INTO token_ops (user_id, op_type, grams, amount_myr, price_myr_per_g)
       VALUES ($1,'SELL_BURN',$2,$3,$4)
       RETURNING id, created_at`,
      [userId, grams, refund, pricePerGram]
    );

    await client.query("COMMIT");
    return { newRm: rmRes.rows[0].balance_myr, newOumg: oumgRes.rows[0].balance_g, op: op.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
import { query } from "../db";

/** Create a redemption request */
export async function createRedemption(
  userId: number,
  kind: "CASH" | "GOLD",
  grams: number,
  amountMyr?: number
) {
  const sql = `
    INSERT INTO redemptions (user_id, kind, grams, amount_myr, status)
    VALUES ($1,$2,$3,$4,'PENDING')
    RETURNING id, kind, grams, amount_myr, status, created_at
  `;
  const { rows } = await query(sql, [userId, kind, grams, amountMyr || null]);
  return rows[0];
}

/** Admin updates redemption status */
export async function updateRedemptionStatus(
  redemptionId: number,
  status: "APPROVED" | "REJECTED" | "COMPLETED",
  note?: string
) {
  const sql = `
    UPDATE redemptions
    SET status=$1, note=$2, updated_at=NOW()
    WHERE id=$3
    RETURNING *
  `;
  const { rows } = await query(sql, [status, note || null, redemptionId]);
  return rows[0];
}

/** List redemptions by user */
export async function listRedemptionsByUser(userId: number) {
  const sql = `
    SELECT id, kind, grams, amount_myr, status, note, created_at, updated_at
    FROM redemptions
    WHERE user_id=$1
    ORDER BY created_at DESC
  `;
  const { rows } = await query(sql, [userId]);
  return rows;
}

/** Admin list all */
export async function listAllRedemptions(limit = 100, offset = 0) {
  const sql = `
    SELECT r.*, u.wallet_address
    FROM redemptions r
    JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await query(sql, [limit, offset]);
  return rows;
}
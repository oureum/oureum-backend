// src/models/redemptionModel.ts
import { query } from "../db";

export type RedemptionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";

export type InsertRedemptionParams = {
  user_id: number;
  wallet: string;
  rtype: "CASH" | "GOLD";
  grams: number;
  fee_bps: number;
  fee_myr: number;
  min_unit_g: number | null;
  payout_myr: number | null;
  audit?: any; // JSON payload for audit trail
};

export async function insertRedemption(p: InsertRedemptionParams) {
  const sql = `
    INSERT INTO redemptions
      (user_id, wallet_address, kind, grams, amount_myr, fee_bps, fee_myr, min_unit_g, payout_myr, status, note, audit, created_at, updated_at)
    VALUES
      ($1,       $2,             $3,   $4,    NULL,       $5,      $6,      $7,         $8,         'PENDING', NULL, $9,    NOW(),     NOW())
    RETURNING id, user_id, wallet_address, kind, grams, amount_myr, fee_bps, fee_myr, min_unit_g, payout_myr, status, note, audit, created_at, updated_at
  `;
  const { rows } = await query(sql, [
    p.user_id,
    p.wallet.toLowerCase(),
    p.rtype,
    p.grams,
    p.fee_bps,
    p.fee_myr,
    p.min_unit_g,
    p.payout_myr,
    p.audit ?? {},
  ]);
  return rows[0];
}

export async function listRedemptions(opts?: {
  status?: RedemptionStatus;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(Number(opts?.limit ?? 50), 1), 200);
  const offset = Math.max(Number(opts?.offset ?? 0), 0);

  const params: any[] = [];
  let where = "";
  if (opts?.status) {
    where = `WHERE r.status = $1`;
    params.push(opts.status);
  }

  const sql = `
    SELECT
      r.*,
      u.wallet_address AS user_wallet -- (redundant with r.wallet_address, but helpful if you ever remove the column)
    FROM redemptions r
    JOIN users u ON u.id = r.user_id
    ${where}
    ORDER BY r.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(limit, offset);

  const { rows } = await query(sql, params);
  return rows;
}

export async function patchRedemption(
  id: number,
  patch: {
    status: RedemptionStatus;
    note?: string | null;
    audit?: any;
  }
) {
  const sql = `
    UPDATE redemptions
    SET status = $1,
        note   = COALESCE($2, note),
        audit  = COALESCE($3, audit),
        updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `;
  const { rows } = await query(sql, [patch.status, patch.note ?? null, patch.audit ?? null, id]);
  return rows[0];
}

/** List redemptions by user_id (most common for user-facing history). */
export async function listRedemptionsByWallet(userId: number) {
  const sql = `
    SELECT id, kind, grams, amount_myr, fee_bps, fee_myr, min_unit_g, payout_myr,
           status, note, audit, created_at, updated_at
    FROM redemptions
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;
  const { rows } = await query(sql, [userId]);
  return rows;
}
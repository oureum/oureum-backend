// src/models/tokenOpsAuditModel.ts
// DB accessors for TOKEN_OPS logs inside the `audits` table

import { query } from "../db";

/** Insert a TOKEN_OPS audit row */
export async function insertTokenOpsAudit(
  adminWallet: string,
  action: "PAUSE" | "RESUME",
  txHash: string,
  note: string
) {
  const sql = `
    INSERT INTO audits (type, action, operator, detail)
    VALUES ('TOKEN_OPS', $1, $2, $3::jsonb)
    RETURNING id, action, operator, detail, created_at
  `;
  const detail = JSON.stringify({
    source: `API/ADMIN/${action}`,
    tx_hash: txHash,
    note,
  });
  const { rows } = await query(sql, [action, adminWallet, detail]);
  return rows[0];
}

/** List TOKEN_OPS audit rows with optional filters */
export async function listTokenOpsAudit(
  limit = 100,
  offset = 0,
  action?: string,
  operator?: string
) {
  const params: any[] = [];
  const where: string[] = [`type = 'TOKEN_OPS'`];

  if (action && action.trim()) {
    params.push(action.trim().toUpperCase());
    where.push(`action = $${params.length}`);
  }
  if (operator && operator.trim()) {
    params.push(operator.trim().toLowerCase());
    where.push(`lower(operator) = $${params.length}`);
  }

  params.push(limit);
  params.push(offset);

  const sql = `
    SELECT id, action, operator, detail, created_at
    FROM audits
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await query(sql, params);
  return rows;
}
import { query } from "../db";

/** Insert admin audit log */
export async function insertAdminAudit(
  adminWallet: string,
  action: string,
  target: string | null,
  detail?: any
) {
  const sql = `
    INSERT INTO admin_audit_logs (admin_wallet, action, target, detail)
    VALUES ($1,$2,$3,$4)
    RETURNING id, created_at
  `;
  const { rows } = await query(sql, [
    adminWallet,
    action,
    target || null,
    detail ? JSON.stringify(detail) : null,
  ]);
  return rows[0];
}

/** List admin audits */
export async function listAdminAudits(limit = 100, offset = 0) {
  const sql = `
    SELECT id, admin_wallet, action, target, detail, created_at
    FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await query(sql, [limit, offset]);
  return rows;
}
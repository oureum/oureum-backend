// src/controllers/adminTokenOpsController.ts
// Controller for admin token operations (pause/resume/status + logs list)
// Uses on-chain calls from src/lib/chain.server.ts
// Persists DB state and logs into the generic `audits` table with type='TOKEN_OPS'.

import { Request, Response } from "express";
import { serverPause, serverResume, serverGetPaused } from "../lib/chain.server";
import { pool } from "../db"; // pg.Pool instance

/** Normalize and validate admin wallet header */
function readAdminWallet(req: Request): string | null {
  const w = String(req.header("x-admin-wallet") || "").toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(w) ? w : null;
}

/** Helper: insert a TOKEN_OPS audit row into `audits` */
async function insertTokenOpsAuditRow(
  operator: string,
  action: "PAUSE" | "RESUME",
  txHash: string,
  note: string
) {
  const sql = `
    INSERT INTO audits (type, action, operator, detail)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING id, created_at
  `;
  const detail = JSON.stringify({
    source: `API/ADMIN/${action}`,
    tx_hash: txHash,
    note,
  });
  await pool.query(sql, ["TOKEN_OPS", action, operator, detail]);
}

/** POST /api/token-ops/pause */
export async function pauseContract(req: Request, res: Response) {
  const adminWallet = readAdminWallet(req);
  if (!adminWallet) {
    return res.status(401).json({ ok: false, error: "Missing or invalid x-admin-wallet" });
  }

  const client = await pool.connect();
  try {
    // 1) On-chain
    const txHash = await serverPause();

    // 2) DB state
    await client.query("BEGIN");
    await client.query(
      `UPDATE contract_state
         SET paused = TRUE, updated_by = $1, updated_at = NOW()
       WHERE id = 1`,
      [adminWallet]
    );
    await client.query("COMMIT");

    // 3) Audit
    await insertTokenOpsAuditRow(adminWallet, "PAUSE", txHash, "Contract paused successfully");

    return res.json({ ok: true, action: "pause", txHash });
  } catch (err: any) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Pause error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Pause failed" });
  } finally {
    client.release();
  }
}

/** POST /api/token-ops/resume */
export async function resumeContract(req: Request, res: Response) {
  const adminWallet = readAdminWallet(req);
  if (!adminWallet) {
    return res.status(401).json({ ok: false, error: "Missing or invalid x-admin-wallet" });
  }

  const client = await pool.connect();
  try {
    // 1) On-chain
    const txHash = await serverResume();

    // 2) DB state
    await client.query("BEGIN");
    await client.query(
      `UPDATE contract_state
         SET paused = FALSE, updated_by = $1, updated_at = NOW()
       WHERE id = 1`,
      [adminWallet]
    );
    await client.query("COMMIT");

    // 3) Audit
    await insertTokenOpsAuditRow(adminWallet, "RESUME", txHash, "Contract resumed successfully");

    return res.json({ ok: true, action: "resume", txHash });
  } catch (err: any) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Resume error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Resume failed" });
  } finally {
    client.release();
  }
}

/** GET /api/token-ops/status */
export async function getContractStatus(_req: Request, res: Response) {
  try {
    // Prefer on-chain
    const paused = await serverGetPaused();
    return res.json({ ok: true, paused });
  } catch (err: any) {
    console.error("Status error (chain):", err);
    // Fallback to DB
    try {
      const q = await pool.query(`SELECT paused FROM contract_state WHERE id = 1`);
      return res.json({ ok: true, paused: q.rows[0]?.paused ?? false });
    } catch (e: any) {
      console.error("Status error (db):", e);
      return res
        .status(500)
        .json({ ok: false, error: err?.message || e?.message || "Status check failed" });
    }
  }
}

/**
 * GET /api/token-ops/logs
 * Query TOKEN_OPS audit logs from `audits`.
 * Supports: ?limit=100&offset=0&action=PAUSE|RESUME&operator=0x...&date_from=ISO&date_to=ISO
 */
export async function listTokenOpsLogs(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const actionRaw = typeof req.query.action === "string" ? req.query.action : "";
    const operatorRaw = typeof req.query.operator === "string" ? req.query.operator : "";
    const dateFromRaw = typeof req.query.date_from === "string" ? req.query.date_from : "";
    const dateToRaw = typeof req.query.date_to === "string" ? req.query.date_to : "";

    const action = actionRaw.trim().toUpperCase();
    const operator = operatorRaw.trim().toLowerCase();
    const dateFrom = dateFromRaw.trim();
    const dateTo = dateToRaw.trim();

    const where: string[] = [`type = 'TOKEN_OPS'`]; // always scope to TOKEN_OPS
    const params: any[] = [];

    if (action) {
      params.push(action);
      where.push(`action = $${params.length}`);
    }
    if (operator) {
      params.push(operator);
      where.push(`lower(operator) = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    params.push(limit, offset);
    const sql = `
      SELECT id, operator, action, detail, created_at
      FROM audits
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const { rows } = await pool.query(sql, params);

    // Return as-is; `detail` is JSONB which frontend can render/formatt
    return res.json({ data: rows, limit, offset });
  } catch (err: any) {
    console.error("listTokenOpsLogs error:", err);
    return res.status(500).json({ error: err?.message || "listTokenOpsLogs failed" });
  }
}
// src/controllers/adminTokenOpsController.ts
// Controller for admin token operations (pause/resume/status + unified logs list)
// Uses on-chain calls from src/lib/chain.server.ts
// Persists DB state and logs into the generic `audits` table with type='TOKEN_OPS'.
// Also reads `token_ops` table to unify MINT/BURN logs into a single endpoint.

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
 * Unified logs: TOKEN_OPS (audits) + MINT/BURN (token_ops)
 *
 * Query params:
 *   ?limit=10&offset=0
 *   &action=PAUSE|RESUME|BUY_MINT|SELL_BURN   (optional)
 *   &operator=0x...                           (optional, case-insensitive)
 *   &date_from=YYYY-MM-DD or ISO              (optional)
 *   &date_to=YYYY-MM-DD or ISO                (optional)
 *
 * Return shape:
 *   { data: [{ id, type, action, operator, detail(json), created_at }], limit, offset }
 *
 * Notes:
 *  - `id` is a string prefixed by table source, e.g. "audits:123" or "token_ops:456"
 *  - `type` is "TOKEN_OPS" for audits; "MINT_BURN" for token_ops
 *  - `action` is PAUSE/RESUME for audits; BUY_MINT/SELL_BURN for token_ops
 *  - `operator` is audits.operator or token_ops.wallet_address
 *  - `detail` is jsonb; token_ops packs { tx_hash, grams }
 */
export async function listTokenOpsLogs(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const actionRaw = typeof req.query.action === "string" ? req.query.action : "";
    const operatorRaw = typeof req.query.operator === "string" ? req.query.operator : "";
    const dateFromRaw = typeof req.query.date_from === "string" ? req.query.date_from : "";
    const dateToRaw = typeof req.query.date_to === "string" ? req.query.date_to : "";

    // Normalize filters
    const action = actionRaw.trim().toUpperCase(); // PAUSE | RESUME | BUY_MINT | SELL_BURN
    const operator = operatorRaw.trim().toLowerCase(); // 0x...
    const dateFrom = dateFromRaw.trim();
    const dateTo = dateToRaw.trim();

    // WHERE for unified rows
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (action) {
      where.push(`u.action = $${i++}`);
      params.push(action);
    }
    if (operator) {
      // audits.operator / token_ops.wallet_address normalized to unified.operator
      where.push(`LOWER(u.operator) = $${i++}`);
      params.push(operator);
    }
    if (dateFrom) {
      where.push(`u.created_at >= $${i++}::timestamptz`);
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push(`u.created_at <= $${i++}::timestamptz`);
      params.push(dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Build unified dataset:
    // - audits (type=TOKEN_OPS) → actions PAUSE/RESUME
    // - token_ops (op_type=BUY_MINT/SELL_BURN) → type MINT_BURN + detail {tx_hash, grams}
    const sql = `
      WITH a AS (
        SELECT 
          ('audits:' || a.id)::text AS id,
          'TOKEN_OPS'::text AS type,
          a.action::text AS action,
          a.operator::text AS operator,
          a.detail::jsonb AS detail,
          a.created_at
        FROM audits a
        WHERE a.type = 'TOKEN_OPS'
      ),
      t AS (
        SELECT
          ('token_ops:' || t.id)::text AS id,
          'MINT_BURN'::text AS type,
          t.op_type::text AS action,               -- BUY_MINT | SELL_BURN
          t.wallet_address::text AS operator,
          jsonb_build_object(
            'tx_hash', t.tx_hash,
            'grams', t.grams
          ) AS detail,
          t.created_at
        FROM token_ops t
      ),
      unified AS (
        SELECT * FROM a
        UNION ALL
        SELECT * FROM t
      )
      SELECT u.id, u.type, u.action, u.operator, u.detail, u.created_at
      FROM unified u
      ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);
    return res.json({ data: rows, limit, offset });
  } catch (err: any) {
    console.error("listTokenOpsLogs unified error:", err);
    return res.status(500).json({ error: err?.message || "listTokenOpsLogs failed" });
  }
}
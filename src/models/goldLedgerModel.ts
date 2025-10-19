import { pool } from "../db";

export type GoldLedgerInsert = {
  entry_date: string;  // ISO date: YYYY-MM-DD
  intake_g: number;
  source?: string | null;
  purity_bp?: number | null;
  serial?: string | null;
  batch?: string | null;
  storage?: string | null;
  custody?: string | null;
  insurance?: string | null;
  audit_ref?: string | null;
  note?: string | null;
};

export async function insertGoldLedger(row: GoldLedgerInsert) {
  const q = await pool.query(
    `INSERT INTO gold_ledger
     (entry_date, intake_g, source, purity_bp, serial, batch, storage, custody, insurance, audit_ref, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      row.entry_date, row.intake_g, row.source ?? null, row.purity_bp ?? null,
      row.serial ?? null, row.batch ?? null, row.storage ?? null, row.custody ?? null,
      row.insurance ?? null, row.audit_ref ?? null, row.note ?? null
    ]
  );
  return q.rows[0];
}

export async function listGoldLedger(params: { from?: string; to?: string; source?: string; limit?: number; offset?: number; }) {
  const limit = Math.min(Math.max(Number(params.limit ?? 50),1),200);
  const offset = Math.max(Number(params.offset ?? 0),0);

  const cond: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (params.from) { cond.push(`entry_date >= $${i++}`); vals.push(params.from); }
  if (params.to)   { cond.push(`entry_date <= $${i++}`); vals.push(params.to); }
  if (params.source) { cond.push(`source = $${i++}`); vals.push(params.source); }

  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

  const q = await pool.query(
    `SELECT * FROM gold_ledger ${where}
     ORDER BY entry_date DESC, id DESC
     LIMIT ${limit} OFFSET ${offset}`, vals
  );
  return q.rows;
}
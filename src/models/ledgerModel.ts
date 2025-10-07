import { query } from "../db";

export async function addGoldIntake(intakeDate: string, source: string, purity: string, grams: number) {
  const sql = `
    INSERT INTO gold_ledger (intake_date, source, purity, grams)
    VALUES ($1, $2, $3, $4)
    RETURNING id, intake_date, source, purity, grams, created_at
  `;
  const { rows } = await query(sql, [intakeDate, source, purity, grams]);
  return rows[0];
}

export async function listGoldIntake(limit = 100, offset = 0) {
  const sql = `
    SELECT id, intake_date, source, purity, grams, created_at
    FROM gold_ledger
    ORDER BY intake_date DESC, id DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await query(sql, [limit, offset]);
  return rows;
}
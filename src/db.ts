// src/db.ts
import { Pool, QueryResult, QueryResultRow } from "pg";

/**
 * Database connection pool for Supabase (PostgreSQL).
 * - Prefer DATABASE_URL (recommended for Supabase connection pooling)
 * - Fallback to discrete PG* env vars if needed
 * - Always enable SSL (no CA verification) to avoid self-signed cert errors
 */
const pooledUrl = process.env.DATABASE_URL;

export const pool = pooledUrl
  ? new Pool({
      connectionString: pooledUrl,
      ssl: { rejectUnauthorized: false }, // required for Supabase pooled endpoints
    })
  : new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl:
        String(process.env.PGSSLMODE || "").toLowerCase()
          ? { rejectUnauthorized: String(process.env.PGSSLMODE).toLowerCase() !== "no-verify" }
          : undefined,
    });

/**
 * Typed query helper.
 * Example:
 *   const { rows } = await query<{ id: number }>("select id from users");
 */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * For manual transactions:
 * const client = await pool.connect();
 * try {
 *   await client.query('BEGIN');
 *   // ...queries
 *   await client.query('COMMIT');
 * } catch (e) {
 *   await client.query('ROLLBACK');
 *   throw e;
 * } finally {
 *   client.release();
 * }
 */
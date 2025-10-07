import { query } from "../db";

/**
 * PriceService composes (gold USD/oz * USD->MYR) / 31.1034768  then applies markup bps.
 * Supports "manual" mode for quick demos.
 */
export namespace PriceService {
  // troy ounce to gram
  const OZ_TO_G = 31.1034768;

  export type PriceSnapshot = {
    id: number;
    source: string;
    gold_usd_per_oz: number | null;
    fx_usd_to_myr: number | null;
    computed_myr_per_g: number;
    markup_bps: number;
    note: string | null;
    created_at: string;
  };

  function getEnvNum(name: string, fallback?: number): number | undefined {
    const v = process.env[name];
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  export async function getCurrentMyrPerGram(): Promise<{
    price_myr_per_g: number;
    snapshot?: PriceSnapshot;
  }> {
    const mode = (process.env.PRICE_MODE || "manual").toLowerCase();
    const markupBps = getEnvNum("PRICE_MARKUP_BPS", 0) || 0;

    if (mode === "manual") {
      // manual mode for demo
      const manual = getEnvNum("PRICE_MANUAL_MYR_PER_G", 500) || 500;
      const price = applyMarkup(manual, markupBps);

      // optional: record snapshot (source=manual)
      const snap = await insertSnapshot({
        source: "manual",
        gold_usd_per_oz: null,
        fx_usd_to_myr: null,
        computed_myr_per_g: price,
        markup_bps: markupBps,
        note: "manual price",
      });

      return { price_myr_per_g: price, snapshot: snap };
    }

    // external mode placeholder:
    // Here you could fetch gold USD/oz and USD->MYR from external APIs, compute MYR/g then apply markup.
    // We leave actual HTTP fetch out for now; this is a placeholder returning manual fallback.
    const manualFallback = getEnvNum("PRICE_MANUAL_MYR_PER_G", 500) || 500;
    const computed = applyMarkup(manualFallback, markupBps);

    const snap = await insertSnapshot({
      source: "external-placeholder",
      gold_usd_per_oz: null,
      fx_usd_to_myr: null,
      computed_myr_per_g: computed,
      markup_bps: markupBps,
      note: "external placeholder -> fallback manual",
    });

    return { price_myr_per_g: computed, snapshot: snap };
  }

  export function applyMarkup(base: number, markupBps: number): number {
    // bps: 100 bps = 1%
    return round6(base * (1 + markupBps / 10000));
  }

  export function round6(n: number): number {
    return Math.round(n * 1e6) / 1e6;
  }

  type InsertSnapshotParams = {
    source: string;
    gold_usd_per_oz: number | null;
    fx_usd_to_myr: number | null;
    computed_myr_per_g: number;
    markup_bps: number;
    note?: string | null;
  };

  export async function insertSnapshot(p: InsertSnapshotParams): Promise<PriceSnapshot> {
    const sql = `
      INSERT INTO price_snapshots (source, gold_usd_per_oz, fx_usd_to_myr, computed_myr_per_g, markup_bps, note)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, source, gold_usd_per_oz, fx_usd_to_myr, computed_myr_per_g, markup_bps, note, created_at
    `;
    const { rows } = await query<PriceSnapshot>(sql, [
      p.source,
      p.gold_usd_per_oz,
      p.fx_usd_to_myr,
      p.computed_myr_per_g,
      p.markup_bps,
      p.note || null,
    ]);
    return rows[0];
  }

  export async function getSnapshots(limit = 50, offset = 0) {
    const sql = `
      SELECT id, source, gold_usd_per_oz, fx_usd_to_myr, computed_myr_per_g, markup_bps, note, created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await query<PriceSnapshot>(sql, [limit, offset]);
    return rows;
  }
}
// src/services/priceService.ts
import { query } from "../db";
import { fetchWithTimeout } from "../utils/http";

/**
 * PriceService
 * - Reads the latest snapshot from DB (price_snapshots).
 * - If snapshot is missing/incomplete AND PRICE_MODE !== "manual",
 *   it may fetch BNM Kijang Emas once to seed a snapshot (optional path).
 * - Otherwise falls back to MANUAL_BASE and inserts a manual snapshot.
 *
 * DB column names we use (match table):
 *   - buy_myr_per_g
 *   - sell_myr_per_g
 *   - computed_myr_per_g
 *   - effective_date
 *   - last_updated
 *   - bnm_myr_per_oz_buying
 *   - bnm_myr_per_oz_selling
 */

const OUNCE_TO_GRAM = 31.1034768;

// Per-side bps from env
const BUY_BPS  = Number(process.env.PRICE_BUY_BPS  || 0); // applied on user BUY
const SELL_BPS = Number(process.env.PRICE_SELL_BPS || 0); // applied on user SELL

// Manual fallback (MYR/g) used when no valid snapshot exists
const MANUAL_BASE = Number(process.env.PRICE_MANUAL_MYR_PER_G || 500);

// BNM endpoint + headers
const BNM_URL = "https://api.bnm.gov.my/public/kijang-emas";
const BNM_ACCEPT = "application/vnd.BNM.API.v1+json";

// Fetch settings (configurable in .env)
const FETCH_TIMEOUT_MS = Number(process.env.PRICE_FETCH_TIMEOUT_MS || 8000);
const FETCH_RETRIES    = Number(process.env.PRICE_FETCH_RETRIES || 2);
const FETCH_RETRY_WAIT = Number(process.env.PRICE_FETCH_RETRY_DELAY_MS || 1500);

/** Payload for inserting one row into price_snapshots. */
type InsertSnapshotParams = {
  source: string; // "manual" | "bnm-kijang-emas" | "external"
  effective_date?: string | null;
  last_updated?: string | null;
  bnm_myr_per_oz_buying?: number | null;
  bnm_myr_per_oz_selling?: number | null;

  // NOTE: keep param names (myr_per_g_buy/sell) but map them to DB columns (buy_myr_per_g/sell_myr_per_g)
  myr_per_g_buy: number;
  myr_per_g_sell: number;

  computed_myr_per_g: number; // required non-null column (e.g. avg of buy/sell)
  buy_bps_applied?: number | null;
  sell_bps_applied?: number | null;
  note?: string | null;
};

type BnmResponse = {
  data: {
    effective_date: string;
    one_oz: { buying: number; selling: number };
  };
  meta: { last_updated: string; total_result: number };
};

export class PriceService {
  /**
   * Fetch raw BNM Kijang Emas (MYR/oz).
   * Only used when we need to seed a snapshot and PRICE_MODE !== "manual".
   */
  static async fetchBnmKijangEmas(): Promise<{
    effective_date: string | null;
    last_updated: string | null;
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }> {
    const res = await fetchWithTimeout(
      BNM_URL,
      { headers: { Accept: BNM_ACCEPT }, cache: "no-store", timeoutMs: FETCH_TIMEOUT_MS },
      FETCH_RETRIES,
      FETCH_RETRY_WAIT
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`BNM HTTP ${res.status} ${res.statusText} | body: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as BnmResponse;
    return {
      effective_date: json?.data?.effective_date ?? null,
      last_updated: json?.meta?.last_updated ?? null,
      myr_per_oz_buying: json?.data?.one_oz?.buying ?? null,
      myr_per_oz_selling: json?.data?.one_oz?.selling ?? null,
    };
  }

  /**
   * Convert oz→g and apply per-side bps.
   * - User BUY derives from BNM "selling" (oz→g, then +BUY_BPS).
   * - User SELL derives from BNM "buying" (oz→g, then +SELL_BPS).
   */
  static ozToGramWithBps(opts: {
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }): { buy: number | null; sell: number | null } {
    const rawBuy  = opts.myr_per_oz_selling != null ? opts.myr_per_oz_selling / OUNCE_TO_GRAM : null;
    const rawSell = opts.myr_per_oz_buying  != null ? opts.myr_per_oz_buying  / OUNCE_TO_GRAM : null;

    const buy  = rawBuy  != null ? +(rawBuy  * (1 + BUY_BPS  / 10_000)).toFixed(6) : null;
    const sell = rawSell != null ? +(rawSell * (1 + SELL_BPS / 10_000)).toFixed(6) : null;
    return { buy, sell };
  }

  /**
   * Insert one snapshot into DB (ALWAYS sets computed_myr_per_g).
   * Maps param names to actual DB columns.
   */
  static async insertSnapshot(p: InsertSnapshotParams) {
    const sql = `
      INSERT INTO price_snapshots
        (source, effective_date, last_updated,
         bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
         buy_myr_per_g, sell_myr_per_g, computed_myr_per_g,
         buy_bps_applied, sell_bps_applied, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `;
    const params = [
      p.source,
      p.effective_date ?? null,
      p.last_updated ?? null,
      p.bnm_myr_per_oz_buying ?? null,
      p.bnm_myr_per_oz_selling ?? null,
      p.myr_per_g_buy,   // mapped to buy_myr_per_g
      p.myr_per_g_sell,  // mapped to sell_myr_per_g
      p.computed_myr_per_g,
      p.buy_bps_applied ?? BUY_BPS,
      p.sell_bps_applied ?? SELL_BPS,
      p.note ?? null,
    ];
    const { rows } = await query(sql, params);
    return rows[0];
  }

  /** Read the most recent snapshot from DB. */
  static async getLatestSnapshot() {
    const sql = `
      SELECT id, source, effective_date, last_updated,
             bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
             buy_myr_per_g, sell_myr_per_g, computed_myr_per_g,
             buy_bps_applied, sell_bps_applied, created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await query(sql);
    return rows[0] || null;
  }

  /**
   * Get current prices (MYR/g) with spread info.
   * Logic:
   * 1) Try latest snapshot from DB and return it if complete.
   * 2) If missing/incomplete and PRICE_MODE !== "manual", attempt to fetch BNM once to seed a snapshot.
   * 3) If still missing, use MANUAL_BASE to create a manual snapshot and return it.
   *
   * NOTE: For your requirement “/api/price/current should NOT call vendor”,
   *       set PRICE_MODE=manual so step (2) is skipped entirely.
   */
  static async getCurrentMyrPerGram(): Promise<{
    buy_myr_per_g: number;
    sell_myr_per_g: number;
    spread_myr_per_g: number;
    spread_bps: number;
    source: string;
    effective_date: string | null;
    last_updated: string | null;
  }> {
    // 1) Try latest snapshot
    let snap = await this.getLatestSnapshot();

    // 2) Optionally fetch BNM only if PRICE_MODE !== "manual" and snapshot incomplete
    const mode = String(process.env.PRICE_MODE || "manual").toLowerCase();
    if ((!snap || snap.buy_myr_per_g == null || snap.sell_myr_per_g == null) && mode !== "manual") {
      try {
        const bnm = await this.fetchBnmKijangEmas();
        const grams = this.ozToGramWithBps({
          myr_per_oz_buying: bnm.myr_per_oz_buying,
          myr_per_oz_selling: bnm.myr_per_oz_selling,
        });
        if (grams.buy != null && grams.sell != null) {
          const computed = +(((grams.buy + grams.sell) / 2)).toFixed(6);
          await this.insertSnapshot({
            source: "bnm-kijang-emas",
            effective_date: bnm.effective_date,
            last_updated: bnm.last_updated,
            bnm_myr_per_oz_buying: bnm.myr_per_oz_buying,
            bnm_myr_per_oz_selling: bnm.myr_per_oz_selling,
            myr_per_g_buy: grams.buy,
            myr_per_g_sell: grams.sell,
            computed_myr_per_g: computed,
            buy_bps_applied: BUY_BPS,
            sell_bps_applied: SELL_BPS,
            note: null,
          });
          snap = await this.getLatestSnapshot();
        }
      } catch {
        // swallow; we will fall back to manual below
      }
    }

    // 3) If still missing, create a manual snapshot and return it
    if (!snap || snap.buy_myr_per_g == null || snap.sell_myr_per_g == null) {
      const base   = MANUAL_BASE;
      const buy    = +(base * (1 + BUY_BPS  / 10_000)).toFixed(6);
      const sell   = +(base * (1 + SELL_BPS / 10_000)).toFixed(6);
      const avg    = +(((buy + sell) / 2)).toFixed(6);
      snap = await this.insertSnapshot({
        source: "manual",
        myr_per_g_buy: buy,
        myr_per_g_sell: sell,
        computed_myr_per_g: avg,
        note: "fallback-manual",
      });
    }

    // Normalize response
    const buy = Number(snap.buy_myr_per_g);
    const sell = Number(snap.sell_myr_per_g);
    const spread = +(buy - sell).toFixed(6);
    const spreadBps = sell > 0 ? Math.round(((buy - sell) / sell) * 10_000) : 0;

    return {
      buy_myr_per_g: buy,
      sell_myr_per_g: sell,
      spread_myr_per_g: spread,
      spread_bps: spreadBps,
      source: snap.source,
      effective_date: snap.effective_date ?? null,
      last_updated: snap.last_updated ?? null,
    };
  }
}
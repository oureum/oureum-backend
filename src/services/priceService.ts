// src/services/priceService.ts
import { query } from "../db";

/** Troy ounce to gram conversion constant. */
const OUNCE_TO_GRAM = 31.1034768;

/** Optional per-side bps. */
const BUY_BPS  = Number(process.env.PRICE_BUY_BPS  || 0);  // applied on user BUY
const SELL_BPS = Number(process.env.PRICE_SELL_BPS || 0);  // applied on user SELL

/** Manual fallback base (MYR/g) when table empty and BNM fails or PRICE_MODE=manual. */
const MANUAL_BASE = Number(process.env.PRICE_MANUAL_MYR_PER_G || 500);

/** BNM endpoint + headers. */
const BNM_URL = "https://api.bnm.gov.my/public/kijang-emas";
const BNM_ACCEPT = "application/vnd.BNM.API.v1+json";

type InsertSnapshotParams = {
  source: string; // "manual" | "bnm-kijang-emas" | "external"
  effective_date?: string | null;
  last_updated?: string | null;
  bnm_myr_per_oz_buying?: number | null;
  bnm_myr_per_oz_selling?: number | null;

  // per-gram prices (after bps if applicable)
  myr_per_g_buy: number;   // NOT NULL in practice (we ensure it)
  myr_per_g_sell: number;  // NOT NULL in practice

  // stored to satisfy legacy NOT NULL constraint
  computed_myr_per_g: number; // = (buy+sell)/2, ALWAYS filled

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
  /** Fetch raw BNM Kijang Emas (MYR/oz). */
  static async fetchBnmKijangEmas(): Promise<{
    effective_date: string | null;
    last_updated: string | null;
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }> {
    const res = await fetch(BNM_URL, { headers: { Accept: BNM_ACCEPT }, cache: "no-store" });
    if (!res.ok) throw new Error(`BNM HTTP ${res.status}`);
    const json = (await res.json()) as BnmResponse;
    return {
      effective_date: json?.data?.effective_date ?? null,
      last_updated: json?.meta?.last_updated ?? null,
      myr_per_oz_buying: json?.data?.one_oz?.buying ?? null,
      myr_per_oz_selling: json?.data?.one_oz?.selling ?? null,
    };
  }

  /** Map oz→g and apply per-side bps. */
  static ozToGramWithBps(opts: {
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }): { buy: number | null; sell: number | null } {
    const rawBuy  = opts.myr_per_oz_selling != null ? opts.myr_per_oz_selling / OUNCE_TO_GRAM : null; // user BUY from BNM selling
    const rawSell = opts.myr_per_oz_buying  != null ? opts.myr_per_oz_buying  / OUNCE_TO_GRAM : null; // user SELL from BNM buying
    const buy  = rawBuy  != null ? +(rawBuy  * (1 + BUY_BPS  / 10_000)).toFixed(6) : null;
    const sell = rawSell != null ? +(rawSell * (1 + SELL_BPS / 10_000)).toFixed(6) : null;
    return { buy, sell };
  }

  /** Insert snapshot (ALWAYS sets computed_myr_per_g). */
  static async insertSnapshot(p: InsertSnapshotParams) {
    const sql = `
      INSERT INTO price_snapshots
        (source, effective_date, last_updated,
         bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
         myr_per_g_buy, myr_per_g_sell, computed_myr_per_g,
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
      p.myr_per_g_buy,
      p.myr_per_g_sell,
      p.computed_myr_per_g,
      p.buy_bps_applied ?? BUY_BPS,
      p.sell_bps_applied ?? SELL_BPS,
      p.note ?? null,
    ];
    const { rows } = await query(sql, params);
    return rows[0];
  }

  /** Latest snapshot. */
  static async getLatestSnapshot() {
    const sql = `
      SELECT id, source, effective_date, last_updated,
             bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
             myr_per_g_buy, myr_per_g_sell, computed_myr_per_g,
             buy_bps_applied, sell_bps_applied, created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await query(sql);
    return rows[0] || null;
  }

  /** Ensure a valid snapshot exists and return current prices (MYR/g). */
  static async getCurrentMyrPerGram(): Promise<{
    buy_myr_per_g: number;
    sell_myr_per_g: number;
    spread_myr_per_g: number;
    spread_bps: number;
    source: string;
    effective_date: string | null;
    last_updated: string | null;
  }> {
    // Try latest
    let snap = await this.getLatestSnapshot();

    // If missing/incomplete, try fetch BNM (unless PRICE_MODE=manual)
    const mode = String(process.env.PRICE_MODE || "manual").toLowerCase();
    if ((!snap || snap.myr_per_g_buy == null || snap.myr_per_g_sell == null) && mode !== "manual") {
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
        // swallow; fall back to manual
      }
    }

    // If still no valid snapshot, use manual fallback and upsert one snapshot
    if (!snap || snap.myr_per_g_buy == null || snap.myr_per_g_sell == null) {
      const base = MANUAL_BASE;
      const buy  = +(base * (1 + BUY_BPS  / 10_000)).toFixed(6);
      const sell = +(base * (1 + SELL_BPS / 10_000)).toFixed(6);
      const computed = +(((buy + sell) / 2)).toFixed(6);
      const row = await this.insertSnapshot({
        source: "manual",
        myr_per_g_buy: buy,
        myr_per_g_sell: sell,
        computed_myr_per_g: computed,
        note: "fallback-manual",
      });
      snap = row;
    }

    // Return normalized response
    const buy = Number(snap.myr_per_g_buy);
    const sell = Number(snap.myr_per_g_sell);
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
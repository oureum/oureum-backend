// src/services/priceService.ts
import { query } from "../db";

/** Troy ounce to gram conversion constant. */
const OUNCE_TO_GRAM = 31.1034768;

/** Optional per-side markup (basis points). */
const BUY_BPS = Number(process.env.PRICE_BUY_BPS || 0);   // applied on user BUY (BNM selling)
const SELL_BPS = Number(process.env.PRICE_SELL_BPS || 0); // applied on user SELL (BNM buying)

/** BNM endpoint + headers */
const BNM_URL = "https://api.bnm.gov.my/public/kijang-emas";
const BNM_ACCEPT = "application/vnd.BNM.API.v1+json";

/** DB insert type for price_snapshots table. You can adapt field names to your schema. */
type InsertSnapshotParams = {
  source: string;               // e.g. "bnm-kijang-emas"
  effective_date: string | null;
  last_updated: string | null;
  bnm_myr_per_oz_buying: number | null;  // BNM buying (MYR / oz)
  bnm_myr_per_oz_selling: number | null; // BNM selling (MYR / oz)
  myr_per_g_buy: number | null;          // user BUY (BNM selling)  MYR/g (after bps)
  myr_per_g_sell: number | null;         // user SELL (BNM buying)  MYR/g (after bps)
  buy_bps_applied: number;               // from env
  sell_bps_applied: number;              // from env
  note?: string | null;
};

type BnmResponse = {
  data: {
    effective_date: string; // "2025-10-16"
    one_oz: { buying: number; selling: number };
    half_oz?: { buying: number; selling: number };
    quarter_oz?: { buying: number; selling: number };
  };
  meta: {
    last_updated: string; // "2025-10-16 01:00:04"
    total_result: number;
  };
};

export class PriceService {
  /** Fetch raw BNM Kijang Emas (MYR / oz) and map to our structure. */
  static async fetchBnmKijangEmas(): Promise<{
    effective_date: string | null;
    last_updated: string | null;
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }> {
    const res = await fetch(BNM_URL, {
      headers: { Accept: BNM_ACCEPT },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`BNM HTTP ${res.status}`);
    }
    const json = (await res.json()) as BnmResponse;
    const eff = json?.data?.effective_date ?? null;
    const last = json?.meta?.last_updated ?? null;
    const buying = json?.data?.one_oz?.buying ?? null;
    const selling = json?.data?.one_oz?.selling ?? null;
    return {
      effective_date: eff,
      last_updated: last,
      myr_per_oz_buying: buying,
      myr_per_oz_selling: selling,
    };
  }

  /** Convert oz to g and apply per-side bps if provided. */
  static ozToGramWithBps(opts: {
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }): { myr_per_g_buy: number | null; myr_per_g_sell: number | null } {
    const { myr_per_oz_buying, myr_per_oz_selling } = opts;

    // User BUY = BNM selling (per oz) / 31.1034768
    const rawBuy = myr_per_oz_selling != null ? myr_per_oz_selling / OUNCE_TO_GRAM : null;
    // User SELL = BNM buying (per oz) / 31.1034768
    const rawSell = myr_per_oz_buying != null ? myr_per_oz_buying / OUNCE_TO_GRAM : null;

    const buy = rawBuy != null ? rawBuy * (1 + BUY_BPS / 10000) : null;
    const sell = rawSell != null ? rawSell * (1 + SELL_BPS / 10000) : null;

    return {
      myr_per_g_buy: buy != null ? Number(buy.toFixed(4)) : null,
      myr_per_g_sell: sell != null ? Number(sell.toFixed(4)) : null,
    };
  }

  /** Insert a new price snapshot row. */
  static async insertSnapshot(p: InsertSnapshotParams) {
    const sql = `
      INSERT INTO price_snapshots
        (source, effective_date, last_updated,
         bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
         myr_per_g_buy, myr_per_g_sell,
         buy_bps_applied, sell_bps_applied, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, created_at
    `;
    const { rows } = await query(sql, [
      p.source,
      p.effective_date,
      p.last_updated,
      p.bnm_myr_per_oz_buying,
      p.bnm_myr_per_oz_selling,
      p.myr_per_g_buy,
      p.myr_per_g_sell,
      p.buy_bps_applied,
      p.sell_bps_applied,
      p.note || null,
    ]);
    return rows[0];
  }

  /** Get the latest snapshot (most recent). */
  static async getLatestSnapshot() {
    const sql = `
      SELECT id, source, effective_date, last_updated,
             bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
             myr_per_g_buy, myr_per_g_sell,
             buy_bps_applied, sell_bps_applied,
             created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await query(sql, []);
    return rows[0] || null;
  }

  /**
   * Return current MYR/g buy & sell.
   * If there is no recent snapshot, fetch BNM now and insert a fresh one.
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

    // 2) If missing or incomplete, fetch BNM and insert
    if (!snap || snap.myr_per_g_buy == null || snap.myr_per_g_sell == null) {
      const bnm = await this.fetchBnmKijangEmas();
      const grams = this.ozToGramWithBps({
        myr_per_oz_buying: bnm.myr_per_oz_buying,
        myr_per_oz_selling: bnm.myr_per_oz_selling,
      });

      await this.insertSnapshot({
        source: "bnm-kijang-emas",
        effective_date: bnm.effective_date,
        last_updated: bnm.last_updated,
        bnm_myr_per_oz_buying: bnm.myr_per_oz_buying,
        bnm_myr_per_oz_selling: bnm.myr_per_oz_selling,
        myr_per_g_buy: grams.myr_per_g_buy,
        myr_per_g_sell: grams.myr_per_g_sell,
        buy_bps_applied: BUY_BPS,
        sell_bps_applied: SELL_BPS,
        note: null,
      });

      snap = await this.getLatestSnapshot();
    }

    if (!snap || snap.myr_per_g_buy == null || snap.myr_per_g_sell == null) {
      throw new Error("No valid price snapshot available");
    }

    const buy = Number(snap.myr_per_g_buy);
    const sell = Number(snap.myr_per_g_sell);
    const spread = Number((buy - sell).toFixed(4));
    const spreadBps = sell > 0 ? Math.round(((buy - sell) / sell) * 10000) : 0;

    return {
      buy_myr_per_g: buy,
      sell_myr_per_g: sell,
      spread_myr_per_g: spread,
      spread_bps: spreadBps,
      source: snap.source,
      effective_date: snap.effective_date,
      last_updated: snap.last_updated,
    };
  }
}
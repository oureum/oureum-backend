// src/services/priceService.ts
import { query } from "../db";
import { fetchWithTimeout } from "../utils/http";

/**
 * Pricing service (DB-first with optional BNM seeding).
 *
 * Public API (static):
 *   - PriceService.getCurrentMyrPerGram()
 *   - PriceService.setManualPrice(input)
 *   - PriceService.listSnapshotsFull({ limit, offset })
 *
 * Internal helpers (static/private):
 *   - PriceService.fetchBnmKijangEmas()
 *   - PriceService.ozToGramWithBps()
 *   - PriceService.insertSnapshot()
 *   - PriceService.getLatestSnapshot()
 *
 * Conventions:
 *   - All prices in MYR per gram.
 *   - "Latest snapshot wins": the newest row (created_at DESC) is the current effective price.
 *   - If PRICE_MODE=manual, vendor (BNM) is NEVER called by getCurrentMyrPerGram().
 *   - Manual override always inserts a new row (source="manual").
 */

const OUNCE_TO_GRAM = 31.1034768;

// -------- Env knobs --------
const BUY_BPS  = Number(process.env.PRICE_BUY_BPS  || 0);   // bps applied to user BUY side
const SELL_BPS = Number(process.env.PRICE_SELL_BPS || 0);   // bps applied to user SELL side
const MANUAL_BASE = Number(process.env.PRICE_MANUAL_MYR_PER_G || 500);
const PRICE_MODE  = String(process.env.PRICE_MODE || "manual").toLowerCase(); // "manual" | "auto"

// -------- Vendor (BNM Kijang Emas) --------
const BNM_URL = "https://api.bnm.gov.my/public/kijang-emas";
const BNM_ACCEPT = "application/vnd.BNM.API.v1+json";
const FETCH_TIMEOUT_MS = Number(process.env.PRICE_FETCH_TIMEOUT_MS || 8000);
const FETCH_RETRIES    = Number(process.env.PRICE_FETCH_RETRIES || 2);
const FETCH_RETRY_WAIT = Number(process.env.PRICE_FETCH_RETRY_DELAY_MS || 1500);

// -------- Types --------
type BnmResponse = {
  data?: {
    effective_date?: string;
    one_oz?: { buying?: number; selling?: number };
  };
  meta?: { last_updated?: string; total_result?: number };
};

type SnapshotRow = {
  id: number;
  source: string;
  effective_date: string | null;
  last_updated: string | null;
  bnm_myr_per_oz_buying: number | null;
  bnm_myr_per_oz_selling: number | null;
  buy_myr_per_g: number | null;
  sell_myr_per_g: number | null;
  computed_myr_per_g: number | null;
  buy_bps_applied?: number | null;
  sell_bps_applied?: number | null;
  note?: string | null;
  created_at: string;
};

type InsertSnapshotParams = {
  source: "manual" | "bnm-kijang-emas" | "external";
  effective_date?: string | null;
  last_updated?: string | null;
  bnm_myr_per_oz_buying?: number | null;
  bnm_myr_per_oz_selling?: number | null;
  buy_myr_per_g: number;        // user BUY (after bps)
  sell_myr_per_g: number;       // user SELL (after bps)
  computed_myr_per_g: number;   // base (avg of raw sides or any definition you choose)
  buy_bps_applied?: number | null;
  sell_bps_applied?: number | null;
  note?: string | null;
};

type ListParams = { limit: number; offset: number };

// -------- Small math helpers --------
function toNum(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Given a base price (MYR/g) and per-side bps, derive user BUY/SELL + spreads.
 * NOTE:
 *  - BUY = base * (1 + BUY_BPS/10000)
 *  - SELL = base * (1 - SELL_BPS/10000)
 *  - spreadMYR = |BUY - SELL|
 *  - spreadBps  = spreadMYR / base * 10000 (denominator uses base for consistency)
 */
function calcFromBase(base: number, buyBps = BUY_BPS, sellBps = SELL_BPS) {
  const buy  = round6(base * (1 + buyBps / 10_000));
  const sell = round6(base * (1 - sellBps / 10_000));
  const spreadMYR = round6(Math.abs(buy - sell));
  const spreadBps = base > 0 ? Math.round((spreadMYR / base) * 10_000) : 0;
  return { buy, sell, spreadMYR, spreadBps };
}

/** oz → g conversion (no bps inside this function). */
function ozToGram(oz: number): number {
  return oz / OUNCE_TO_GRAM;
}

/** Defensive average (keeps precision to 6 decimals). */
function avg6(a: number, b: number): number {
  return round6((a + b) / 2);
}

/** Whether a snapshot row has both sides. */
function isCompleteSnap(s?: SnapshotRow | null): s is SnapshotRow {
  return Boolean(s && s.buy_myr_per_g != null && s.sell_myr_per_g != null);
}

/** Build normalized response payload from a snapshot row. */
function normalizeFromSnapshot(s: SnapshotRow) {
  const base =
    toNum(s.computed_myr_per_g) ??
    avg6(Number(s.buy_myr_per_g || 0), Number(s.sell_myr_per_g || 0));
  const buy = Number(s.buy_myr_per_g ?? base);
  const sell = Number(s.sell_myr_per_g ?? base);
  const spread_myr_per_g = round6(Math.abs(buy - sell));
  const spread_bps = base > 0 ? Math.round((spread_myr_per_g / base) * 10_000) : 0;

  return {
    source: s.source,
    price_myr_per_g: base,   // base (for frontend "Base")
    buy_myr_per_g: buy,      // internal/user BUY
    sell_myr_per_g: sell,    // internal/user SELL
    user_buy_myr_per_g: buy,   // alias for frontend
    user_sell_myr_per_g: sell, // alias for frontend
    spread_myr_per_g,
    spread_bps,
    effective_date: s.effective_date,
    last_updated: s.last_updated,
    note: s.note ?? null,
    created_at: s.created_at,
  };
}

// ============================================================================
// Service implementation
// ============================================================================
export class PriceService {
  // ---------------- DB helpers ----------------
  /** Insert a full snapshot row. Always returns the inserted row. */
  static async insertSnapshot(p: InsertSnapshotParams): Promise<SnapshotRow> {
    const sql = `
      INSERT INTO price_snapshots
        (source, effective_date, last_updated,
         bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
         buy_myr_per_g, sell_myr_per_g, computed_myr_per_g,
         buy_bps_applied, sell_bps_applied, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, source, effective_date, last_updated,
                bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
                buy_myr_per_g, sell_myr_per_g, computed_myr_per_g,
                buy_bps_applied, sell_bps_applied, note, created_at
    `;
    const params = [
      p.source,
      p.effective_date ?? null,
      p.last_updated ?? null,
      p.bnm_myr_per_oz_buying ?? null,
      p.bnm_myr_per_oz_selling ?? null,
      p.buy_myr_per_g,
      p.sell_myr_per_g,
      p.computed_myr_per_g,
      p.buy_bps_applied ?? BUY_BPS,
      p.sell_bps_applied ?? SELL_BPS,
      p.note ?? null,
    ];
    const { rows } = await query(sql, params);
    return rows[0] as SnapshotRow;
  }

  /** Get newest snapshot (created_at DESC LIMIT 1). */
  static async getLatestSnapshot(): Promise<SnapshotRow | null> {
    const sql = `
      SELECT id, source, effective_date, last_updated,
             bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
             buy_myr_per_g, sell_myr_per_g, computed_myr_per_g,
             buy_bps_applied, sell_bps_applied, note, created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await query(sql);
    return (rows?.[0] as SnapshotRow) || null;
  }

  /** Paginated history (newest first). */
  static async listSnapshotsFull(params: ListParams) {
    const sql = `
      SELECT id, source, effective_date, last_updated,
             bnm_myr_per_oz_buying, bnm_myr_per_oz_selling,
             buy_myr_per_g, sell_myr_per_g, computed_myr_per_g,
             buy_bps_applied, sell_bps_applied, note, created_at
      FROM price_snapshots
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await query(sql, [params.limit, params.offset]);
    return (rows as SnapshotRow[]).map(normalizeFromSnapshot);
  }

  // ---------------- Vendor (optional) ----------------
  /**
   * Fetch BNM Kijang Emas (MYR/oz).
   * Controller should NOT call this directly; getCurrentMyrPerGram() encapsulates the logic.
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
      myr_per_oz_buying: toNum(json?.data?.one_oz?.buying),
      myr_per_oz_selling: toNum(json?.data?.one_oz?.selling),
    };
  }

  /**
   * Derive BUY/SELL (MYR/g) after bps from vendor oz prices.
   * - User BUY derives from vendor "selling"
   * - User SELL derives from vendor "buying"
   */
  static ozToGramWithBps(opts: {
    myr_per_oz_buying: number | null;
    myr_per_oz_selling: number | null;
  }): { buy: number | null; sell: number | null; base: number | null } {
    const rawBuyG  = opts.myr_per_oz_selling != null ? ozToGram(opts.myr_per_oz_selling) : null;
    const rawSellG = opts.myr_per_oz_buying  != null ? ozToGram(opts.myr_per_oz_buying)  : null;
    if (rawBuyG == null || rawSellG == null) return { buy: null, sell: null, base: null };

    const base = avg6(rawBuyG, rawSellG);
    const d = calcFromBase(base, BUY_BPS, SELL_BPS);
    return { buy: d.buy, sell: d.sell, base };
  }

  // ---------------- Public APIs ----------------
  /**
   * Admin manual override (inserts a new "manual" snapshot).
   * Accept EITHER:
   *   - { myrPerG } -> derive per-side using env bps
   *   - { myrPerG_buy, myrPerG_sell } -> compute base as avg
   */
  static async setManualPrice(input: {
    myrPerG?: number;
    myrPerG_buy?: number;
    myrPerG_sell?: number;
    note?: string;
  }) {
    const base = toNum(input.myrPerG);
    let buy = toNum(input.myrPerG_buy);
    let sell = toNum(input.myrPerG_sell);

    if (buy == null || sell == null) {
      if (base == null) {
        throw new Error("Provide either { myrPerG } or { myrPerG_buy, myrPerG_sell } with positive numbers.");
      }
      const d = calcFromBase(base, BUY_BPS, SELL_BPS);
      buy = d.buy;
      sell = d.sell;
    }

    const computed = avg6(buy as number, sell as number);
    const snap = await this.insertSnapshot({
      source: "manual",
      buy_myr_per_g: buy as number,
      sell_myr_per_g: sell as number,
      computed_myr_per_g: computed,
      note: input.note ?? null,
    });
    return normalizeFromSnapshot(snap);
  }

  /**
   * Current effective price:
   *   1) Use latest DB snapshot if complete.
   *   2) If incomplete AND PRICE_MODE !== "manual": try once to seed from BNM.
   *   3) If still missing: synthesize from MANUAL_BASE and insert a manual snapshot.
   *
   * Frontend expectations:
   *   - Shows table columns:
   *       Updated | Source | Base | Buy | Sell | User Buy | User Sell | Spread (MYR) | Spread (bps) | Note
   *   - "Effective Price" = Buy price for user (they specifically want to treat BUY as effective).
   */
  static async getCurrentMyrPerGram(): Promise<{
    source: string;
    price_myr_per_g: number;
    buy_myr_per_g: number;
    sell_myr_per_g: number;
    user_buy_myr_per_g: number;
    user_sell_myr_per_g: number;
    spread_myr_per_g: number;
    spread_bps: number;
    effective_date: string | null;
    last_updated: string | null;
    note?: string | null;
    created_at: string;
  }> {
    // Case 1: latest complete -> return
    let snap = await this.getLatestSnapshot();
    if (isCompleteSnap(snap)) {
      return normalizeFromSnapshot(snap);
    }

    // Case 2: optionally seed from BNM (skip entirely if PRICE_MODE=manual)
    if (PRICE_MODE !== "manual") {
      try {
        const bnm = await this.fetchBnmKijangEmas();
        const sides = this.ozToGramWithBps({
          myr_per_oz_buying: bnm.myr_per_oz_buying,
          myr_per_oz_selling: bnm.myr_per_oz_selling,
        });
        if (sides.buy != null && sides.sell != null && sides.base != null) {
          snap = await this.insertSnapshot({
            source: "bnm-kijang-emas",
            effective_date: bnm.effective_date,
            last_updated: bnm.last_updated,
            bnm_myr_per_oz_buying: bnm.myr_per_oz_buying,
            bnm_myr_per_oz_selling: bnm.myr_per_oz_selling,
            buy_myr_per_g: sides.buy,
            sell_myr_per_g: sides.sell,
            computed_myr_per_g: sides.base,
            note: "auto-seeded-from-bnm",
          });
          return normalizeFromSnapshot(snap);
        }
      } catch {
        // Swallow vendor errors; we will fallback to manual below
      }
    }

    // Case 3: still missing -> synthesize from MANUAL_BASE
    const d = calcFromBase(MANUAL_BASE, BUY_BPS, SELL_BPS);
    snap = await this.insertSnapshot({
      source: "manual",
      buy_myr_per_g: d.buy,
      sell_myr_per_g: d.sell,
      computed_myr_per_g: MANUAL_BASE,
      note: "manual-fallback",
    });
    return normalizeFromSnapshot(snap);
  }
}

// Keep default export for convenience (optional)
export default PriceService;
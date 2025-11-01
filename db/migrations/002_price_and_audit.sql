-- =========================================
-- 002_price_and_audit.sql
-- Price snapshots + Admin audit logs
-- Idempotent for both fresh and existing DBs
-- =========================================

-- 1) Price snapshots
--    Cache gold price (USD/oz), FX (USD->MYR), computed MYR/g,
--    plus per-side buy/sell and effective_date from BNM.
CREATE TABLE IF NOT EXISTS price_snapshots (
  id                 BIGSERIAL PRIMARY KEY,
  source             TEXT NOT NULL,                -- "manual" | "bnm" | "external"
  gold_usd_per_oz    NUMERIC(18,6),                -- nullable (legacy, kept)
  fx_usd_to_myr      NUMERIC(18,6),                -- nullable (legacy, kept)
  computed_myr_per_g NUMERIC(18,6) NOT NULL,       -- base MYR/g after FX/oz->g
  markup_bps         INTEGER DEFAULT 0,            -- global markup (bps)
  note               TEXT,                         -- free-form note

  -- newer columns used by services/cron
  effective_date     DATE,                         -- e.g. BNM effective date
  buy_myr_per_g      NUMERIC(18,6),                -- user BUY (what user pays)
  sell_myr_per_g     NUMERIC(18,6),                -- user SELL (what user receives)
  last_updated       TEXT,                         -- vendor-provided "last updated" (BNM meta)

  -- optional vendor raw fields for audit/debug
  bnm_myr_per_oz_buying  NUMERIC(18,6),
  bnm_myr_per_oz_selling NUMERIC(18,6),

  -- per-side bps actually applied
  buy_bps_applied   INTEGER,
  sell_bps_applied  INTEGER,

  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_price_snapshots_created    ON price_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_effective  ON price_snapshots (effective_date);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_source     ON price_snapshots (source);

-- Backward-compatible ALTERs (safe if columns already exist)
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS effective_date          DATE;
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS buy_myr_per_g           NUMERIC(18,6);
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS sell_myr_per_g          NUMERIC(18,6);
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS last_updated            TEXT;
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS bnm_myr_per_oz_buying   NUMERIC(18,6);
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS bnm_myr_per_oz_selling  NUMERIC(18,6);
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS buy_bps_applied         INTEGER;
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS sell_bps_applied        INTEGER;
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS note                    TEXT;

-- 2) Admin audit logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  admin_wallet  TEXT NOT NULL,
  action        TEXT NOT NULL,        -- e.g. FUND_PRESET | PRICE_UPDATE | MINT | BURN | REDEMPTION_STATUS_UPDATE
  target        TEXT,                 -- optional: target wallet/id etc.
  detail        JSONB,                -- optional payload snapshot
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_wallet_lower ON admin_audit_logs (lower(admin_wallet));
CREATE INDEX IF NOT EXISTS idx_admin_audit_action       ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created      ON admin_audit_logs (created_at DESC);
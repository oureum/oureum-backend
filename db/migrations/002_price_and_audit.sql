-- price_snapshots: optional cache for gold price and fx
CREATE TABLE IF NOT EXISTS price_snapshots (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,                    -- e.g. "manual", "coingecko", "custom-api"
  gold_usd_per_oz NUMERIC(18,6),          -- optional
  fx_usd_to_myr NUMERIC(18,6),            -- optional
  computed_myr_per_g NUMERIC(18,6) NOT NULL,
  markup_bps INTEGER DEFAULT 0,            -- admin markup in basis points (e.g. 150 = 1.5%)
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_created ON price_snapshots (created_at DESC);

-- admin_audit_logs: record sensitive admin actions (who did what)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL PRIMARY KEY,
  admin_wallet TEXT NOT NULL,
  action TEXT NOT NULL,        -- e.g. FUND_PRESET, PRICE_UPDATE, MINT, BURN, REDEMPTION_STATUS_UPDATE
  target TEXT,                 -- optional: target user wallet, redemption id, etc.
  detail JSONB,                -- optional payload snapshot
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_wallet ON admin_audit_logs (lower(admin_wallet));
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs (action);
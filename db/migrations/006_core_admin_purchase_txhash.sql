-- 006_core_admin_purchase_txhash.sql
-- Purpose:
-- 1) Ensure core tables exist: users, rm_balances, oumg_balances, admin_audit_logs
-- 2) Enforce wallet lowercase + uniqueness and FK integrity
-- 3) Add helpful indexes including JSONB GIN for admin_audit_logs.detail (to query tx_hash)
-- 4) Backfill: lowercase all existing wallet_address values (once)

BEGIN;

-- 1) users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enforce lowercase discipline at DB-level to match app logic
  CONSTRAINT users_wallet_lowercase_chk CHECK (wallet_address = LOWER(wallet_address))
);

-- Optional: if older DB didn’t have the CHECK, try to add it (ignore if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_wallet_lowercase_chk'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_wallet_lowercase_chk CHECK (wallet_address = LOWER(wallet_address));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- ignore
END $$;

-- 2) rm_balances
CREATE TABLE IF NOT EXISTS rm_balances (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_myr NUMERIC(18, 6) NOT NULL DEFAULT 0
);

-- 3) oumg_balances
CREATE TABLE IF NOT EXISTS oumg_balances (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_g NUMERIC(24, 6) NOT NULL DEFAULT 0
);

-- 4) admin_audit_logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_wallet VARCHAR(64) NOT NULL,
  action TEXT NOT NULL,
  target TEXT NULL,
  detail JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Backfill: force-lowercase existing wallet_address (one-time safe op)
UPDATE users
SET wallet_address = LOWER(wallet_address)
WHERE wallet_address <> LOWER(wallet_address);

-- 6) Indexes (idempotent)
-- users: (wallet_address) already unique; add quick lookup by created_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_users_created_at' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_users_created_at ON users (created_at DESC);
  END IF;
END $$;

-- admin_audit_logs: created_at, admin_wallet, target, and GIN on detail for tx_hash queries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relname = 'idx_audit_created_at_desc' AND n.nspname = 'public') THEN
    CREATE INDEX idx_audit_created_at_desc ON admin_audit_logs (created_at DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relname = 'idx_audit_admin_wallet' AND n.nspname = 'public') THEN
    CREATE INDEX idx_audit_admin_wallet ON admin_audit_logs (admin_wallet);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relname = 'idx_audit_target' AND n.nspname = 'public') THEN
    CREATE INDEX idx_audit_target ON admin_audit_logs (target);
  END IF;

  -- JSONB GIN index to query by keys inside detail (e.g., {"tx_hash":"0x..."} )
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relname = 'idx_audit_detail_gin' AND n.nspname = 'public') THEN
    CREATE INDEX idx_audit_detail_gin ON admin_audit_logs USING GIN (detail);
  END IF;
END $$;

-- 7) Helpful view (optional) for quick admin listing (mirrors app join)
--    Safe to create; drop+create to keep definition current.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_users_with_balances') THEN
    DROP VIEW v_users_with_balances;
  END IF;
END $$;

CREATE VIEW v_users_with_balances AS
SELECT
  u.id,
  u.wallet_address AS wallet,
  COALESCE(rm.balance_myr, 0)::NUMERIC(18,6) AS rm_credit,
  0::NUMERIC(18,6)                            AS rm_spent,
  COALESCE(og.balance_g, 0)::NUMERIC(24,6)    AS oumg_grams,
  NULL::TEXT                                   AS note,
  u.created_at                                 AS updated_at
FROM users u
LEFT JOIN rm_balances rm ON rm.user_id = u.id
LEFT JOIN oumg_balances og ON og.user_id = u.id;

COMMIT;
-- =========================================
-- 003_unique_balances_and_views.sql
-- Enforce one-row-per-user for balances + helper view
-- =========================================

-- Backfill one row if missing
INSERT INTO rm_balances (user_id, balance_myr)
SELECT u.id, 0
FROM users u
LEFT JOIN rm_balances r ON r.user_id = u.id
WHERE r.user_id IS NULL;

INSERT INTO oumg_balances (user_id, balance_g)
SELECT u.id, 0
FROM users u
LEFT JOIN oumg_balances b ON b.user_id = u.id
WHERE b.user_id IS NULL;

-- Remove duplicates (keep latest id)
WITH dup AS (
  SELECT user_id, id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
  FROM rm_balances
)
DELETE FROM rm_balances USING dup
WHERE rm_balances.id = dup.id AND dup.rn > 1;

WITH dup AS (
  SELECT user_id, id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
  FROM oumg_balances
)
DELETE FROM oumg_balances USING dup
WHERE oumg_balances.id = dup.id AND dup.rn > 1;

-- Enforce unique (one row per user) — Postgres doesn't support "ADD CONSTRAINT IF NOT EXISTS"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_rm_balances_user'
      AND conrelid = 'rm_balances'::regclass
  ) THEN
    ALTER TABLE rm_balances
      ADD CONSTRAINT uq_rm_balances_user UNIQUE (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_oumg_balances_user'
      AND conrelid = 'oumg_balances'::regclass
  ) THEN
    ALTER TABLE oumg_balances
      ADD CONSTRAINT uq_oumg_balances_user UNIQUE (user_id);
  END IF;
END $$;

-- Helper view for dashboard/APIs
CREATE OR REPLACE VIEW v_user_balances AS
SELECT
  u.id AS user_id,
  u.wallet_address,
  u.email,
  COALESCE(r.balance_myr, 0) AS balance_myr,
  COALESCE(o.balance_g, 0)   AS balance_g,
  u.created_at
FROM users u
LEFT JOIN rm_balances r ON r.user_id = u.id
LEFT JOIN oumg_balances o ON o.user_id = u.id;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet_lower ON users (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_rm_balances_user ON rm_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_oumg_balances_user ON oumg_balances (user_id);
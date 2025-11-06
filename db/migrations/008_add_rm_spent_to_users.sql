-- 008_add_rm_spent_to_users.sql
-- Purpose:
--  1) Add users.rm_spent if missing
--  2) Add users.updated_at if missing (with trigger)
--  3) Backfill rm_spent from token_ops (BUY_MINT)
--  4) Recreate v_users_with_balances (no dependency on rm/og created_at)

BEGIN;

-- Step 1: Add rm_spent (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='rm_spent'
  ) THEN
    ALTER TABLE users
      ADD COLUMN rm_spent numeric(18,2) DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add note column to token_ops for app inserts
BEGIN;

ALTER TABLE token_ops
  ADD COLUMN IF NOT EXISTS note text;

-- Step 2: Add updated_at (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='updated_at'
  ) THEN
    ALTER TABLE users
      ADD COLUMN updated_at timestamptz DEFAULT now() NOT NULL;
  END IF;
END $$;

-- Step 3: Auto-update trigger for users.updated_at
CREATE OR REPLACE FUNCTION set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_users_updated_at();

-- Step 4: Backfill rm_spent from token_ops (BUY_MINT)
WITH spent AS (
  SELECT user_id, COALESCE(SUM(amount_myr),0)::numeric(18,2) AS total_spent
  FROM token_ops
  WHERE op_type = 'BUY_MINT'
  GROUP BY user_id
)
UPDATE users u
SET rm_spent = s.total_spent
FROM spent s
WHERE s.user_id = u.id;

-- Step 5: Recreate the canonical view (no reliance on note column anywhere)
DROP VIEW IF EXISTS v_users_with_balances;

CREATE VIEW v_users_with_balances AS
SELECT
  u.id,
  u.wallet_address AS wallet,
  COALESCE(rm.balance_myr, 0)::numeric(18,6) AS rm_credit,
  COALESCE(u.rm_spent, 0)::numeric(18,6)      AS rm_spent,
  COALESCE(og.balance_g, 0)::numeric(24,6)    AS oumg_grams,
  NULL::text                                   AS note,
  u.updated_at                                 AS updated_at
FROM users u
LEFT JOIN rm_balances   rm ON rm.user_id = u.id
LEFT JOIN oumg_balances og ON og.user_id = u.id;

COMMIT;
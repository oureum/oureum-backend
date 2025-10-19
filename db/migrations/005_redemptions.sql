-- =========================================
-- 005_redemptions.sql (enum-based, consistent with code)
-- =========================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'redemption_type') THEN
    CREATE TYPE redemption_type AS ENUM ('CASH', 'GOLD');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'redemption_status') THEN
    CREATE TYPE redemption_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS redemptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  rtype redemption_type NOT NULL,
  grams NUMERIC(18,6) NOT NULL CHECK (grams > 0),
  fee_bps INTEGER NOT NULL DEFAULT 50,
  fee_myr NUMERIC(18,2) NOT NULL DEFAULT 0,
  min_unit_g NUMERIC(18,6),
  payout_myr NUMERIC(18,2),
  status redemption_status NOT NULL DEFAULT 'PENDING',
  audit JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);
-- =========================================
-- 001_init.sql (baseline schema)
-- =========================================

-- admins: admin whitelist (with role)
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- users: end users (identified by wallet or user_id)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT UNIQUE,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- rm_balances: one row per user (custodial Ringgit credits)
CREATE TABLE IF NOT EXISTS rm_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_myr NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- oumg_balances: one row per user (custodial OUMG grams)
CREATE TABLE IF NOT EXISTS oumg_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_g NUMERIC(24,8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- token_ops: buy->mint / sell->burn audit log (join to users for wallet)
CREATE TABLE IF NOT EXISTS token_ops (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL CHECK (op_type IN ('BUY_MINT','SELL_BURN')),
  grams NUMERIC(24,8) NOT NULL,
  amount_myr NUMERIC(18,2) NOT NULL,
  price_myr_per_g NUMERIC(18,6) NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- gold_ledger: daily intake / inventory (normalized columns)
CREATE TABLE IF NOT EXISTS gold_ledger (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,                 -- normalized name
  intake_g NUMERIC(18,6) NOT NULL CHECK (intake_g >= 0),
  source TEXT,                              -- LBMA / PAMP / local bank / jeweler
  purity_bp INTEGER,                        -- 999 for 99.9%
  serial TEXT,
  batch TEXT,
  storage TEXT,                             -- e.g. "Local vault (MY)"
  custody TEXT,                             -- e.g. "unallocated"
  insurance TEXT,
  audit_ref TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- NOTE: DO NOT create redemptions here (kept in 005 with enums)

-- helper indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet_lower ON users (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_admins_wallet_lower ON admins (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_rm_balances_user ON rm_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_oumg_balances_user ON oumg_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_token_ops_user ON token_ops (user_id);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_date ON gold_ledger (entry_date);

-- optional seed (change to your address)
-- INSERT INTO admins(wallet_address, role)
-- VALUES ('0x21Dd60982155a0182d94bcAAACC1C61550c99C69', 'SUPERADMIN')
-- ON CONFLICT (wallet_address) DO NOTHING;
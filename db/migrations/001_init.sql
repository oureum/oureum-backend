-- admins: admin whitelist
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- users: end users (identified by wallet or user_id)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT UNIQUE,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- rm_balances: custodial Ringgit credits
CREATE TABLE IF NOT EXISTS rm_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_myr NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- oumg_balances: custodial OUMG grams (demo balance)
CREATE TABLE IF NOT EXISTS oumg_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_g NUMERIC(24,8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- gold_ledger: daily intake (source, purity, grams)
CREATE TABLE IF NOT EXISTS gold_ledger (
  id SERIAL PRIMARY KEY,
  intake_date DATE NOT NULL,
  source TEXT NOT NULL,
  purity TEXT NOT NULL,
  grams NUMERIC(24,8) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- token_ops: buy->mint / sell->burn audit log
CREATE TABLE IF NOT EXISTS token_ops (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL CHECK (op_type IN ('BUY_MINT','SELL_BURN')),
  grams NUMERIC(24,8) NOT NULL,
  amount_myr NUMERIC(18,2) NOT NULL,
  price_myr_per_g NUMERIC(18,6) NOT NULL,
  tx_hash TEXT,                   -- optional demo tx hash
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- redemptions: cash / gold redemption requests
CREATE TABLE IF NOT EXISTS redemptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('CASH','GOLD')),
  grams NUMERIC(24,8) NOT NULL,   -- for GOLD, grams to redeem; for CASH we can store computed grams->cash in amount_myr if needed
  amount_myr NUMERIC(18,2),       -- for CASH option
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','COMPLETED')) DEFAULT 'PENDING',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- helper indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_admins_wallet ON admins (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_rm_balances_user ON rm_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_oumg_balances_user ON oumg_balances (user_id);
CREATE INDEX IF NOT EXISTS idx_token_ops_user ON token_ops (user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions (user_id);

-- seed: optional admin (you可以改成你的地址)
-- INSERT INTO admins(wallet_address) VALUES ('0x0bf3E5F98d659BCe08C3aeD0AD5F373Ba1cEb24f') ON CONFLICT DO NOTHING;
-- INSERT INTO admins(wallet_address) VALUES ('0x21Dd60982155a0182d94bcAAACC1C61550c99C69') ON CONFLICT DO NOTHING;
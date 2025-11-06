-- 009_token_ops_state_and_audits.sql
-- Purpose:
--  1) Persist contract pause/resume state in DB (single-row table)
--  2) Persist admin actions (pause/resume/mint/burn/…) in audits table
--  3) Provide useful index for listing recent TOKEN_OPS logs

BEGIN;

-- 1) Current contract state (single row with id=1)
CREATE TABLE IF NOT EXISTS contract_state (
  id          int PRIMARY KEY DEFAULT 1,
  paused      boolean NOT NULL DEFAULT false,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO contract_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2) Audits table for admin/operator actions
CREATE TABLE IF NOT EXISTS audits (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,          -- e.g. 'TOKEN_OPS'
  action     text NOT NULL,          -- e.g. 'PAUSE'|'RESUME'|'MINT_ONCHAIN'|...
  operator   text,                   -- admin wallet or system user
  detail     jsonb,                  -- flexible payload: { tx_hash, note, source, grams, price, ... }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Helpful index: list latest logs by type
CREATE INDEX IF NOT EXISTS idx_audits_type_created
  ON audits(type, created_at DESC);

COMMIT;
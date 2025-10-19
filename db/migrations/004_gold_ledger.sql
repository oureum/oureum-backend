-- =========================================
-- 004_gold_ledger.sql (idempotent safety)
-- =========================================

-- Ensure columns exist with normalized names/types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='entry_date') THEN
    ALTER TABLE gold_ledger ADD COLUMN entry_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='intake_g') THEN
    ALTER TABLE gold_ledger ADD COLUMN intake_g NUMERIC(18,6);
  END IF;

  -- If legacy columns exist, migrate and drop
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='gold_ledger' AND column_name='intake_date') THEN
    UPDATE gold_ledger SET entry_date = entry_date
      WHERE entry_date IS NOT NULL; -- no-op if already migrated
    UPDATE gold_ledger SET entry_date = intake_date WHERE entry_date IS NULL;
    ALTER TABLE gold_ledger DROP COLUMN intake_date;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='gold_ledger' AND column_name='grams') THEN
    UPDATE gold_ledger SET intake_g = grams WHERE intake_g IS NULL;
    ALTER TABLE gold_ledger DROP COLUMN grams;
  END IF;

  -- Other columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='purity_bp') THEN
    ALTER TABLE gold_ledger ADD COLUMN purity_bp INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='source') THEN
    ALTER TABLE gold_ledger ADD COLUMN source TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='serial') THEN
    ALTER TABLE gold_ledger ADD COLUMN serial TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='batch') THEN
    ALTER TABLE gold_ledger ADD COLUMN batch TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='storage') THEN
    ALTER TABLE gold_ledger ADD COLUMN storage TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='custody') THEN
    ALTER TABLE gold_ledger ADD COLUMN custody TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='insurance') THEN
    ALTER TABLE gold_ledger ADD COLUMN insurance TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='audit_ref') THEN
    ALTER TABLE gold_ledger ADD COLUMN audit_ref TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gold_ledger' AND column_name='note') THEN
    ALTER TABLE gold_ledger ADD COLUMN note TEXT;
  END IF;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_gold_ledger_date ON gold_ledger(entry_date);
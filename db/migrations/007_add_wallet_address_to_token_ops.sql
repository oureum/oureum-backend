-- 007_add_wallet_address_to_token_ops.sql
-- Add wallet_address to token_ops and backfill from users using whichever column exists.

BEGIN;

ALTER TABLE public.token_ops
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

DO $$
BEGIN
  -- Try users.wallet
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'wallet'
  ) THEN
    EXECUTE $Q$
      UPDATE public.token_ops t
      SET wallet_address = u.wallet
      FROM public.users u
      WHERE t.user_id = u.id
        AND (t.wallet_address IS NULL OR t.wallet_address = '')
    $Q$;
  -- Else try users.wallet_address
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'wallet_address'
  ) THEN
    EXECUTE $Q$
      UPDATE public.token_ops t
      SET wallet_address = u.wallet_address
      FROM public.users u
      WHERE t.user_id = u.id
        AND (t.wallet_address IS NULL OR t.wallet_address = '')
    $Q$;
  -- Else try users.address
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'address'
  ) THEN
    EXECUTE $Q$
      UPDATE public.token_ops t
      SET wallet_address = u.address
      FROM public.users u
      WHERE t.user_id = u.id
        AND (t.wallet_address IS NULL OR t.wallet_address = '')
    $Q$;
  END IF;
END
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_token_ops_wallet_address
  ON public.token_ops (wallet_address);

COMMIT;
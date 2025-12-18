
BEGIN;

ALTER TABLE public.betslips
  ADD COLUMN IF NOT EXISTS user_username text,
  ADD COLUMN IF NOT EXISTS "gameId" text,
  ADD COLUMN IF NOT EXISTS "betValue" text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS "gameInfoTime" text,
  ADD COLUMN IF NOT EXISTS "gameInfoTeams" text,
  ADD COLUMN IF NOT EXISTS line text,
  ADD COLUMN IF NOT EXISTS odds text,
  ADD COLUMN IF NOT EXISTS player text,
  ADD COLUMN IF NOT EXISTS "playerId" text,
  ADD COLUMN IF NOT EXISTS prop text,
  ADD COLUMN IF NOT EXISTS "statType" text,
  ADD COLUMN IF NOT EXISTS team text,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS betslip_data jsonb,
  ADD COLUMN IF NOT EXISTS total_stake numeric,
  ADD COLUMN IF NOT EXISTS potential_payout numeric,
  ADD COLUMN IF NOT EXISTS total_odds numeric,
  ADD COLUMN IF NOT EXISTS gameId text,
  ADD COLUMN IF NOT EXISTS betValue text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS gameInfoTime text,
  ADD COLUMN IF NOT EXISTS gameInfoTeams jsonb,
  ADD COLUMN IF NOT EXISTS line text,
  ADD COLUMN IF NOT EXISTS odds text,
  ADD COLUMN IF NOT EXISTS player text,
  ADD COLUMN IF NOT EXISTS playerId text,
  ADD COLUMN IF NOT EXISTS prop text,
  ADD COLUMN IF NOT EXISTS statType text,
  ADD COLUMN IF NOT EXISTS team text,
  ADD COLUMN IF NOT EXISTS type text;

CREATE INDEX IF NOT EXISTS idx_betslips_user_created ON public.betslips (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_betslips_gameId ON public.betslips ("gameId");
CREATE INDEX IF NOT EXISTS idx_betslips_created_at ON betslips(created_at);
CREATE INDEX IF NOT EXISTS idx_betslips_user_username ON betslips(user_username);

COMMIT;

-- Example RLS policy snippets (adjust as needed for your project)
-- Allow authenticated users to insert rows for themselves
-- Note: run these in Supabase SQL editor as a privileged user (service_role) if needed

-- Enable RLS on table if not already enabled
-- ALTER TABLE public.betslips ENABLE ROW LEVEL SECURITY;

-- Policy: allow insert when auth.uid() == new.user_id
-- CREATE POLICY "Allow insert for owner" ON public.betslips
--   FOR INSERT
--   WITH CHECK (auth.uid() = new.user_id);

-- Policy: allow select for owner
-- CREATE POLICY "Allow select for owner" ON public.betslips
--   FOR SELECT
--   USING (auth.uid() = user_id);

-- After applying migration, client can insert a single JSON object in `betslip_data` containing the full `bets` array,
-- e.g. { bets: [ { id, gameId, player, playerId, prop, statType, type, odds, amount, ... } ], meta: {...} }

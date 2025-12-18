-- Migration: replace/normalize betslips table to structured per-bet rows
-- Creates `betslips_new`, migrates data from existing `betslips` (legacy and JSONB),
-- and provides safe rename steps (commented out) so you can verify before switching.

BEGIN;

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the new structured table
CREATE TABLE IF NOT EXISTS public.betslips_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_username text,
  gameId text,
  betValue text,
  description text,
  gameInfoTime text,
  gameInfoTeams text,
  line text,
  odds text,
  player text,
  playerId text,
  prop text,
  statType text,
  team text,
  type text,
  createdAt timestamptz DEFAULT now(),
  total_stake numeric,
  potential_payout numeric,
  betslip_data jsonb,
  status text,
  legacy_row_id uuid
);

-- Migrate legacy rows (rows where betslip_data is NULL)
INSERT INTO public.betslips_new (
  id, user_id, user_username, gameId, betValue, description, gameInfoTime, gameInfoTeams,
  line, odds, player, playerId, prop, statType, team, type, createdAt, total_stake, potential_payout, betslip_data, status, legacy_row_id
)
SELECT
  id,
  user_id,
  user_username,
  game_id AS gameId,
  NULL::text AS betValue,
  selection AS description,
  NULL::text AS gameInfoTime,
  NULL::text AS gameInfoTeams,
  NULL::text AS line,
  odds::text,
  NULL::text AS player,
  NULL::text AS playerId,
  NULL::text AS prop,
  NULL::text AS statType,
  NULL::text AS team,
  NULL::text AS type,
  created_at AS createdAt,
  total_stake,
  potential_payout,
  betslip_data,
  status,
  id as legacy_row_id
FROM public.betslips
WHERE betslip_data IS NULL;

-- Migrate JSON-aggregated rows: unnest betslip_data->'bets' into per-bet rows
INSERT INTO public.betslips_new (
  id, user_id, user_username, gameId, betValue, description, gameInfoTime, gameInfoTeams,
  line, odds, player, playerId, prop, statType, team, type, createdAt, total_stake, potential_payout, betslip_data, status, legacy_row_id
)
SELECT
  gen_random_uuid() AS id,
  b.user_id,
  b.user_username,
  (bet ->> 'gameId')::text AS gameId,
  (bet ->> 'betValue')::text AS betValue,
  (bet ->> 'description')::text AS description,
  COALESCE((bet -> 'gameInfo') ->> 'time', (b.betslip_data -> 'meta') ->> 'time')::text AS gameInfoTime,
  COALESCE((bet -> 'gameInfo') ->> 'teams', (b.betslip_data -> 'meta') ->> 'teams')::text AS gameInfoTeams,
  (bet ->> 'line')::text AS line,
  (bet ->> 'odds')::text AS odds,
  (bet ->> 'player')::text AS player,
  (bet ->> 'playerId')::text AS playerId,
  (bet ->> 'prop')::text AS prop,
  (bet ->> 'statType')::text AS statType,
  (bet ->> 'team')::text AS team,
  (bet ->> 'type')::text AS type,
  COALESCE((bet ->> 'createdAt')::timestamptz, b.created_at) AS createdAt,
  b.total_stake,
  b.potential_payout,
  b.betslip_data,
  b.status,
  b.id as legacy_row_id
FROM public.betslips b,
LATERAL jsonb_array_elements(COALESCE(b.betslip_data->'bets', '[]'::jsonb)) AS bet;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_betslips_new_user_created ON public.betslips_new (user_id, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_betslips_new_gameId ON public.betslips_new (gameId);

COMMIT;

-- SAFETY: verify data in `betslips_new` before swapping.
-- Once verified, you can rename tables (UNCOMMENT and run as separate step):
-- BEGIN;
-- DROP TABLE IF EXISTS public.betslips_old;
-- ALTER TABLE public.betslips RENAME TO betslips_old;
-- ALTER TABLE public.betslips_new RENAME TO betslips;
-- COMMIT;

-- OPTIONAL: re-create RLS policies for new table (example):
-- ALTER TABLE public.betslips ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow select for owner" ON public.betslips
--   FOR SELECT USING (auth.uid() = user_id::text);
-- CREATE POLICY "Allow insert for owner" ON public.betslips
--   FOR INSERT WITH CHECK (auth.uid() = new.user_id::text);

-- NOTE: Running the rename steps will change your app behavior immediately. Backup your DB or run this in a staging environment first.

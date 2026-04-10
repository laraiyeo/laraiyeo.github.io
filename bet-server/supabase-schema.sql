-- Supabase schema and helper functions for Live Sports Tracker
-- Run this file in Supabase SQL editor to ensure schema, RPCs and policies are present.

-- 1) updated_at helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Tables (create if missing) - core tables derived from 7.txt
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  username text NOT NULL,
  password text NULL,
  credits numeric NOT NULL DEFAULT 2500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  phone text NOT NULL,
  -- Daily reward tracking: which day is currently available (1-7), whether claimed,
  -- timestamp when claimed, and when the next day becomes available.
  daily_available_day integer NOT NULL DEFAULT 1,
  daily_claimed boolean NOT NULL DEFAULT false,
  daily_claimed_at timestamptz NULL,
  daily_next_available_at timestamptz NULL,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_phone_key UNIQUE (phone),
  CONSTRAINT profiles_username_key UNIQUE (username),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE
);

-- Live Activity push-to-start tokens: maps app bundle and/or fixture to a push-to-start token
CREATE TABLE IF NOT EXISTS public.live_activity_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bundle_id text NULL,
  token text NOT NULL,
  fixture_id text NULL,
  -- type distinguishes token kinds to avoid NULL/NULL uniqueness issues
  type text NOT NULL DEFAULT 'activity',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_activity_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT live_activity_tokens_type_check CHECK (type IN ('bundle','fixture','activity'))
);

-- Unique constraint to avoid duplicate rows for the same (bundle, token, fixture)
-- Ensure `type` column, check constraint, unique constraint and indexes exist.
DO $$
BEGIN
  -- add `type` column if missing (safe for existing deployments)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_activity_tokens' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.live_activity_tokens ADD COLUMN type text NOT NULL DEFAULT 'activity';
  END IF;

  -- add check constraint for type values if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'live_activity_tokens_type_check'
  ) THEN
    ALTER TABLE public.live_activity_tokens ADD CONSTRAINT live_activity_tokens_type_check CHECK (type IN ('bundle','fixture','activity'));
  END IF;

  -- add unique constraint across (type, bundle_id, token, fixture_id) if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_live_activity_type_bundle_token_fixture'
  ) THEN
    ALTER TABLE public.live_activity_tokens ADD CONSTRAINT uniq_live_activity_type_bundle_token_fixture UNIQUE (type, bundle_id, token, fixture_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_live_activity_tokens_bundle ON public.live_activity_tokens USING btree (type, bundle_id);
CREATE INDEX IF NOT EXISTS idx_live_activity_tokens_fixture ON public.live_activity_tokens USING btree (type, fixture_id);

-- Ensure legacy deployments that already added `password` manually are safe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'password'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN password text NULL;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.betslips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_id text,
  selection text,
  amount numeric,
  odds double precision,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  betslip_data jsonb NULL,
  total_stake numeric NULL,
  potential_payout numeric NULL,
  user_username text NULL,
  "gameId" text NULL,
  "betValue" text NULL,
  description text NULL,
  "gameInfoTime" text NULL,
  "gameInfoTeams" text NULL,
  line text NULL,
  player text NULL,
  "playerId" text NULL,
  prop text NULL,
  "statType" text NULL,
  team text NULL,
  type text NULL,
  "createdAt" timestamptz NULL,
  total_odds numeric NULL,
  betslip_url text NULL,
  payout numeric DEFAULT 0,
  result text NULL,
  settled_at timestamptz NULL,
  bets jsonb NULL,
  CONSTRAINT betslips_pkey PRIMARY KEY (id),
  CONSTRAINT betslips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.bet_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  betslip_id uuid NULL,
  change_amount numeric NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bet_history_pkey PRIMARY KEY (id),
  CONSTRAINT bet_history_betslip_id_fkey FOREIGN KEY (betslip_id) REFERENCES betslips (id) ON DELETE CASCADE,
  CONSTRAINT bet_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  expo_push_token text NOT NULL,
  platform text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT push_tokens_user_id_key UNIQUE (user_id),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

-- Ledger for credit changes (audit)
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  betslip_id uuid NULL,
  change numeric NOT NULL,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3) Indexes (create if missing)
CREATE INDEX IF NOT EXISTS idx_bet_history_user_id ON public.bet_history USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bet_history_betslip_id ON public.bet_history USING btree (betslip_id);
CREATE INDEX IF NOT EXISTS idx_betslips_user_id ON public.betslips USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_betslips_status ON public.betslips USING btree (status);
CREATE INDEX IF NOT EXISTS idx_betslips_user_created ON public.betslips USING btree (user_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_betslips_gameid ON public.betslips USING btree ("gameId");
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger USING btree (user_id);

-- 4) Triggers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at'
  ) THEN
    CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_betslips_updated_at'
  ) THEN
    CREATE TRIGGER update_betslips_updated_at
    BEFORE UPDATE ON betslips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;

-- 5) Functions / RPCs
-- Single-leg place_bet (maintain for backward compatibility)
CREATE OR REPLACE FUNCTION place_bet(
  p_game_id text,
  p_selection text,
  p_amount numeric,
  p_odds double precision,
  p_bets jsonb DEFAULT NULL,
  p_betslip_data jsonb DEFAULT NULL,
  p_betslip_url text DEFAULT NULL,
  p_user_username text DEFAULT NULL,
  p_total_odds numeric DEFAULT NULL,
  p_potential_payout numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user_credits numeric;
  v_betslip_id uuid;
  v_total_odds numeric;
  v_potential numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT credits INTO v_user_credits
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_user_credits < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE profiles
  SET credits = credits - p_amount
  WHERE id = v_user_id;

  -- determine totals
  v_total_odds := COALESCE(p_total_odds, p_odds);
  v_potential := COALESCE(p_potential_payout, (p_amount * v_total_odds));

  INSERT INTO betslips (
    user_id, game_id, selection, amount, odds, status,
    bets, betslip_data, betslip_url, user_username,
    total_stake, potential_payout, total_odds
  )
  VALUES (
    v_user_id, p_game_id, p_selection, p_amount, p_odds, 'pending',
    p_bets, p_betslip_data, p_betslip_url, p_user_username,
    p_amount, v_potential, v_total_odds
  )
  RETURNING id INTO v_betslip_id;

  INSERT INTO credit_ledger (user_id, betslip_id, change, reason)
  VALUES (v_user_id, v_betslip_id, -p_amount, 'Bet placed');

  INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
  VALUES (v_user_id, v_betslip_id, -p_amount, 'Bet placed');

  RETURN v_betslip_id;
END;
$$;

-- Atomic multi-leg place_betslip
CREATE OR REPLACE FUNCTION place_betslip(
  p_stake numeric,
  p_bets jsonb,
  p_betslip_data jsonb DEFAULT NULL,
  p_potential_payout numeric DEFAULT NULL,
  p_betslip_url text DEFAULT NULL,
  p_user_username text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user_credits numeric;
  v_betslip_id uuid;
  v_game_id text;
  v_first jsonb;
  v_selection text;
  v_amount numeric;
  v_odds double precision;
  v_total_odds numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT credits INTO v_user_credits
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_user_credits < p_stake THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE profiles
  SET credits = credits - p_stake
  WHERE id = v_user_id;

  -- derive a game_id from the first bet if available to satisfy DB constraints
  v_game_id := NULL;
  IF p_bets IS NOT NULL THEN
    BEGIN
      v_game_id := COALESCE(p_bets->0->>'gameId', p_bets->0->>'game_id', NULL);
      v_first := p_bets->0;
      v_selection := COALESCE(v_first->>'description', v_first->>'selection', v_first->>'team', NULL);
      -- amount for multi-leg stored as the stake
      v_amount := p_stake;
      -- try to coerce odds from first bet if present
      BEGIN
        IF v_first ? 'odds' THEN
          v_odds := (v_first->>'odds')::double precision;
        ELSE
          v_odds := NULL;
        END IF;
      EXCEPTION WHEN others THEN
        v_odds := NULL;
      END;
      -- compute approximate total odds if possible (multiply decimal odds)
      BEGIN
        v_total_odds := 1;
        FOR i IN 0 .. jsonb_array_length(p_bets) - 1 LOOP
          v_total_odds := v_total_odds * (
            CASE
              WHEN (p_bets->i->>'odds') IS NULL THEN 1
              WHEN (p_bets->i->>'odds') ~ '^[+-]?\\d+$' THEN -- american-like integer (accept +/-)
                (
                  CASE
                    WHEN (p_bets->i->>'odds')::double precision >= 100 THEN ( (p_bets->i->>'odds')::double precision / 100.0 + 1 )
                    WHEN (p_bets->i->>'odds')::double precision <= -100 THEN (100.0 / abs((p_bets->i->>'odds')::double precision) + 1)
                    ELSE (p_bets->i->>'odds')::double precision
                  END
                )
              ELSE
                -- try numeric interpretation (assume already decimal)
                (p_bets->i->>'odds')::double precision
            END
          );
        END LOOP;
      EXCEPTION WHEN others THEN
        v_total_odds := NULL;
      END;
    EXCEPTION WHEN others THEN
      v_game_id := NULL;
    END;
  END IF;

  INSERT INTO betslips (
    user_id, game_id, bets, betslip_data, total_stake, potential_payout, status,
    betslip_url, user_username, selection, amount, odds, total_odds
  )
  VALUES (
    v_user_id,
    NULLIF(v_game_id, ''),
    p_bets,
    p_betslip_data,
    p_stake,
    p_potential_payout,
    'pending',
    p_betslip_url,
    p_user_username,
    NULLIF(v_selection, ''),
    v_amount,
    v_odds,
    v_total_odds
  )
  RETURNING id INTO v_betslip_id;

  INSERT INTO credit_ledger (user_id, betslip_id, change, reason)
  VALUES (v_user_id, v_betslip_id, -p_stake, 'Bet placed');

  INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
  VALUES (v_user_id, v_betslip_id, -p_stake, 'Bet placed');

  RETURN v_betslip_id;
END;
$$;

-- RPC: Authenticate user by username and password (bypasses RLS)
-- Returns phone number if credentials are valid, null otherwise.
-- This function runs with SECURITY DEFINER to bypass RLS during login.
-- WARNING: Storing plaintext passwords is unsafe; consider hashing.
CREATE OR REPLACE FUNCTION public.authenticate_user(uname text, pass text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone text;
  v_password text;
BEGIN
  -- Query the profile (bypasses RLS due to SECURITY DEFINER)
  SELECT phone, password INTO v_phone, v_password
  FROM public.profiles
  WHERE username = uname
  LIMIT 1;

  -- If no profile found or password doesn't match, return null
  IF v_phone IS NULL OR v_password IS NULL OR v_password != pass THEN
    RETURN NULL;
  END IF;

  -- Credentials valid - return phone
  RETURN v_phone;
END;
$$;

-- Grant execute to anon so unauthenticated clients can call this during login
GRANT EXECUTE ON FUNCTION public.authenticate_user(text, text) TO anon;

-- Settlement RPC (atomic)
CREATE OR REPLACE FUNCTION settle_betslip(
  p_betslip_id uuid,
  p_result text -- 'won','lost','push','void'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_stake numeric;
  v_potential numeric;
  v_payout numeric := 0;
  v_status text;
BEGIN
  -- Lock the betslip row and read required fields
  SELECT user_id, total_stake, potential_payout, status
  INTO v_user_id, v_stake, v_potential, v_status
  FROM betslips
  WHERE id = p_betslip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Betslip not found';
  END IF;

  -- Only settle pending betslips
  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Betslip already settled';
  END IF;

  -- Compute payout according to result
  IF p_result = 'won' THEN
    v_payout := COALESCE(v_potential, 0);
  ELSIF p_result IN ('push','void') THEN
    v_payout := COALESCE(v_stake, 0);
  ELSE
    v_payout := 0;
  END IF;

  -- Round payout to 2 decimal places for ledger and profile update
  v_payout := ROUND(COALESCE(v_payout, 0)::numeric, 2);

  -- If there is a positive payout, credit the user's profile and record ledger/history
  IF v_payout > 0 THEN
    UPDATE profiles SET credits = credits + v_payout WHERE id = v_user_id;
    INSERT INTO credit_ledger (user_id, betslip_id, change, reason)
    VALUES (v_user_id, p_betslip_id, v_payout, 'Bet won');
    INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
    VALUES (v_user_id, p_betslip_id, v_payout, 'Bet settled - payout');
  ELSE
    -- Still record settlement in bet_history for audit (zero change for loss)
    INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
    VALUES (v_user_id, p_betslip_id, 0, 'Bet settled - no payout');
  END IF;

  -- Mark betslip settled
  -- Mark betslip settled. Some DBs may not have a dedicated `result` column;
  -- set `status` to the final result (won/lost/push/void) so application
  -- logic (which expects status like 'won'/'lost') behaves consistently.
  UPDATE betslips
  SET status = p_result, payout = v_payout, settled_at = now()
  WHERE id = p_betslip_id;
END;
$$;

-- RPC: Claim daily reward (atomic update + ledger insert)
-- Call this from clients using their Supabase access token: it runs as SECURITY DEFINER
CREATE OR REPLACE FUNCTION claim_daily_reward(
  p_amount numeric,
  p_reason text DEFAULT 'Daily reward'
)
RETURNS TABLE(id uuid, credits numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current numeric;
  v_amount numeric := ROUND(COALESCE(p_amount,0)::numeric, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT profiles.credits INTO v_current
  FROM profiles
  WHERE profiles.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  UPDATE profiles
  SET credits = ROUND(COALESCE(profiles.credits,0) + v_amount, 2)
  WHERE profiles.id = v_user_id;

  INSERT INTO credit_ledger (user_id, change, reason)
  VALUES (v_user_id, v_amount, COALESCE(p_reason, 'Daily reward'));

  RETURN QUERY SELECT profiles.id, profiles.credits FROM profiles WHERE profiles.id = v_user_id;
END;
$$;

-- 6) Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.betslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

-- Policies
-- Profiles: read/insert own (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own profile' AND tablename = 'profiles'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can read own profile"
      ON public.profiles
      FOR SELECT
      USING (auth.uid() = id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own profile' AND tablename = 'profiles'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can insert own profile"
      ON public.profiles
      FOR INSERT
      WITH CHECK (auth.uid() = id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'profiles'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can update own profile"
      ON public.profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
    $sql$;
  END IF;
END$$;

-- No public update policy for profiles to protect credits

-- Betslips policies
-- Betslips policies (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own betslips' AND tablename = 'betslips'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can read own betslips"
      ON public.betslips
      FOR SELECT
      USING (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own betslips' AND tablename = 'betslips'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can insert own betslips"
      ON public.betslips
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own betslips' AND tablename = 'betslips'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can update own betslips"
      ON public.betslips
      FOR UPDATE
      USING (auth.uid() = user_id);
    $sql$;
  END IF;
END$$;

-- Bet history policies
-- Bet history policies (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own bet history' AND tablename = 'bet_history'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can read own bet history"
      ON public.bet_history
      FOR SELECT
      USING (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own bet history' AND tablename = 'bet_history'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can insert own bet history"
      ON public.bet_history
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    $sql$;
  END IF;
END$$;

-- Push tokens policies
-- Push tokens policies (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own push tokens' AND tablename = 'push_tokens'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can read own push tokens"
      ON public.push_tokens
      FOR SELECT
      USING (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own push tokens' AND tablename = 'push_tokens'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can insert own push tokens"
      ON public.push_tokens
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own push tokens' AND tablename = 'push_tokens'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can update own push tokens"
      ON public.push_tokens
      FOR UPDATE
      USING (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own push tokens' AND tablename = 'push_tokens'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can delete own push tokens"
      ON public.push_tokens
      FOR DELETE
      USING (auth.uid() = user_id);
    $sql$;
  END IF;
END$$;

-- Credit ledger: restrict read/insert to service role only; create a permissive policy only if running admin tasks
-- By default, do NOT create a policy allowing non-admin clients to modify ledger.

-- OPTIONAL: create policies to allow users to insert/read their own ledger rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own credit ledger' AND tablename = 'credit_ledger'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can read own credit ledger"
      ON public.credit_ledger
      FOR SELECT
      USING (auth.uid() = user_id);
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own credit ledger' AND tablename = 'credit_ledger'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Users can insert own credit ledger"
      ON public.credit_ledger
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    $sql$;
  END IF;
END$$;

-- 7) Verification queries (optional)
-- SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';

-- 8) Compatibility: rename the old simple `place_bet` (4-arg) function
-- to avoid PostgREST overload ambiguity. This block is safe to run
-- multiple times and will silently skip if the function doesn't exist.
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.place_bet(text, text, numeric, double precision)
    RENAME TO place_bet_simple;
  EXCEPTION WHEN undefined_function THEN
    -- function not present; nothing to rename
    NULL;
  END;
END$$;

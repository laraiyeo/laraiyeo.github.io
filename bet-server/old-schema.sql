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
  credits numeric NOT NULL DEFAULT 2500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  phone text NOT NULL,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_phone_key UNIQUE (phone),
  CONSTRAINT profiles_username_key UNIQUE (username),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE
);

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
  p_odds double precision
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user_credits numeric;
  v_betslip_id uuid;
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

  INSERT INTO betslips (user_id, game_id, selection, amount, odds, status)
  VALUES (v_user_id, p_game_id, p_selection, p_amount, p_odds, 'pending')
  RETURNING id INTO v_betslip_id;

  INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
  VALUES (v_user_id, v_betslip_id, -p_amount, 'Bet placed');

  RETURN v_betslip_id;
END;
$$;

-- Atomic multi-leg place_betslip
CREATE OR REPLACE FUNCTION place_betslip(
  p_stake numeric,
  p_bets jsonb,
  p_potential_payout numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user_credits numeric;
  v_betslip_id uuid;
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

  INSERT INTO betslips (user_id, bets, total_stake, potential_payout, status)
  VALUES (v_user_id, p_bets, p_stake, p_potential_payout, 'pending')
  RETURNING id INTO v_betslip_id;

  INSERT INTO credit_ledger (user_id, betslip_id, change, reason)
  VALUES (v_user_id, v_betslip_id, -p_stake, 'Bet placed');

  INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
  VALUES (v_user_id, v_betslip_id, -p_stake, 'Bet placed');

  RETURN v_betslip_id;
END;
$$;

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
  SELECT user_id, total_stake, potential_payout, status
  INTO v_user_id, v_stake, v_potential, v_status
  FROM betslips
  WHERE id = p_betslip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Betslip not found';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Betslip already settled';
  END IF;

  IF p_result = 'won' THEN
    v_payout := v_potential;
  ELSIF p_result IN ('push','void') THEN
    v_payout := v_stake;
  ELSE
    v_payout := 0;
  END IF;

  IF v_payout > 0 THEN
    UPDATE profiles SET credits = credits + v_payout WHERE id = v_user_id;
    INSERT INTO credit_ledger (user_id, betslip_id, change, reason)
      VALUES (v_user_id, p_betslip_id, v_payout, 'bet_settlement');
    INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
      VALUES (v_user_id, p_betslip_id, v_payout, 'Bet settlement payout');
  ELSE
    INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
      VALUES (v_user_id, p_betslip_id, 0, 'Bet settlement - no payout');
  END IF;

  UPDATE betslips
  SET status = 'settled', result = p_result, payout = v_payout, settled_at = now()
  WHERE id = p_betslip_id;
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

-- 7) Verification queries (optional)
-- SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';

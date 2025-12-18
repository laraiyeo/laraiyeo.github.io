-- SUPABASE DATABASE SETUP
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Profiles table (user data)
CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  phone text UNIQUE NOT NULL,
  credits integer DEFAULT 2500 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- Betslips table
CREATE TABLE betslips (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  game_id text NOT NULL,
  selection text NOT NULL,
  amount numeric NOT NULL,
  odds float8 NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- Bet history table
CREATE TABLE bet_history (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  betslip_id uuid REFERENCES betslips(id) ON DELETE CASCADE,
  change_amount numeric NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- Push tokens table
CREATE TABLE push_tokens (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  expo_push_token text NOT NULL,
  platform text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX idx_betslips_user_id ON betslips(user_id);
CREATE INDEX idx_betslips_status ON betslips(status);
CREATE INDEX idx_bet_history_user_id ON bet_history(user_id);
CREATE INDEX idx_bet_history_betslip_id ON bet_history(betslip_id);
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);

-- ============================================
-- 3. CREATE UPDATED_AT TRIGGER
-- ============================================

-- Function to auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles table
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for betslips table
CREATE TRIGGER update_betslips_updated_at
BEFORE UPDATE ON betslips
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. CREATE CREDIT MANAGEMENT FUNCTIONS
-- ============================================

-- Function to deduct credits when placing a bet (called by app)
CREATE OR REPLACE FUNCTION place_bet(
  p_game_id text,
  p_selection text,
  p_amount numeric,
  p_odds float8
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges
AS $$
DECLARE
  v_user_id uuid;
  v_user_credits integer;
  v_betslip_id uuid;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user has enough credits
  SELECT credits INTO v_user_credits
  FROM profiles
  WHERE id = v_user_id;

  IF v_user_credits < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- Deduct credits
  UPDATE profiles
  SET credits = credits - p_amount
  WHERE id = v_user_id;

  -- Create betslip
  INSERT INTO betslips (user_id, game_id, selection, amount, odds, status)
  VALUES (v_user_id, p_game_id, p_selection, p_amount, p_odds, 'pending')
  RETURNING id INTO v_betslip_id;

  -- Record in bet history
  INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
  VALUES (v_user_id, v_betslip_id, -p_amount, 'Bet placed');

  RETURN v_betslip_id;
END;
$$;

-- Function to settle a bet (admin only - call from Supabase dashboard)
CREATE OR REPLACE FUNCTION settle_bet(
  p_betslip_id uuid,
  p_won boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_betslip betslips%ROWTYPE;
  v_payout numeric;
BEGIN
  -- Get betslip details
  SELECT * INTO v_betslip
  FROM betslips
  WHERE id = p_betslip_id;

  IF v_betslip.status != 'pending' THEN
    RAISE EXCEPTION 'Bet already settled';
  END IF;

  IF p_won THEN
    -- Calculate payout (original amount + winnings)
    v_payout := v_betslip.amount * v_betslip.odds;
    
    -- Add credits
    UPDATE profiles
    SET credits = credits + v_payout
    WHERE id = v_betslip.user_id;

    -- Update betslip status
    UPDATE betslips
    SET status = 'won'
    WHERE id = p_betslip_id;

    -- Record in bet history
    INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
    VALUES (v_betslip.user_id, p_betslip_id, v_payout, 'Bet won');
  ELSE
    -- Update betslip status (no payout)
    UPDATE betslips
    SET status = 'lost'
    WHERE id = p_betslip_id;

    -- Record in bet history
    INSERT INTO bet_history (user_id, betslip_id, change_amount, reason)
    VALUES (v_betslip.user_id, p_betslip_id, 0, 'Bet lost');
  END IF;
END;
$$;

-- ============================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE betslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CREATE RLS POLICIES
-- ============================================

-- Profiles policies
CREATE POLICY "Users can read own profile"
ON profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Note: No UPDATE policy - users cannot modify their profiles (especially credits)
-- Only admins can update credits directly from Supabase dashboard

-- Betslips policies
CREATE POLICY "Users can read own betslips"
ON betslips
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own betslips"
ON betslips
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own betslips"
ON betslips
FOR UPDATE
USING (auth.uid() = user_id);

-- Bet history policies
CREATE POLICY "Users can read own bet history"
ON bet_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bet history"
ON bet_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Push tokens policies
CREATE POLICY "Users can read own push tokens"
ON push_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push tokens"
ON push_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push tokens"
ON push_tokens
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push tokens"
ON push_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- List all tables
SELECT tablename FROM pg_catalog.pg_tables 
WHERE schemaname = 'public';

-- Check profiles table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles';

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- List all policies
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public';

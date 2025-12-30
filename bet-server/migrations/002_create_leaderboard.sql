-- Migration: 002_create_leaderboard.sql
-- Adds `leaderboard` table to track per-user multiplier and bet counts.
-- Also enforces decimal `odds`/`total_odds` on insert/update and provides
-- a function to clear the leaderboard weekly. If `pg_cron` is available
-- this migration will attempt to schedule the weekly truncate job.

BEGIN;

-- 1) Leaderboard table
CREATE TABLE IF NOT EXISTS public.leaderboard (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  multiplier numeric NOT NULL DEFAULT 0,
  total_bets integer NOT NULL DEFAULT 0,
  username text NULL,
  first_bet timestamptz NULL,
  credits_start numeric NULL,
  credits_current numeric NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_multiplier ON public.leaderboard USING btree (multiplier DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_total_bets ON public.leaderboard USING btree (total_bets DESC);

-- 2) Function to ensure odds fields are decimal (coerce american odds like +150 / -120)
CREATE OR REPLACE FUNCTION public.ensure_betslip_odds_decimal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_odds numeric;
  v_total numeric;
BEGIN
  -- Coerce single `odds` field if present
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    BEGIN
      IF NEW.odds IS NOT NULL THEN
        v_odds := NEW.odds::numeric;
        -- If value looks like american-style integer magnitude (>=100 or <=-100)
        IF abs(v_odds) >= 100 THEN
          IF v_odds >= 100 THEN
            NEW.odds := (v_odds / 100.0) + 1;
          ELSE
            NEW.odds := (100.0 / abs(v_odds)) + 1;
          END IF;
        ELSE
          -- keep as-is (assume already decimal)
          NEW.odds := v_odds;
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      -- on parse error, leave NEW.odds unchanged
      NEW.odds := NEW.odds;
    END;

    -- Coerce total_odds field similarly
    BEGIN
      IF NEW.total_odds IS NOT NULL THEN
        v_total := NEW.total_odds::numeric;
        IF abs(v_total) >= 100 THEN
          IF v_total >= 100 THEN
            NEW.total_odds := (v_total / 100.0) + 1;
          ELSE
            NEW.total_odds := (100.0 / abs(v_total)) + 1;
          END IF;
        ELSE
          NEW.total_odds := v_total;
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      NEW.total_odds := NEW.total_odds;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to apply coercion before insert or update
DROP TRIGGER IF EXISTS trg_betslip_coerce_odds ON public.betslips;
CREATE TRIGGER trg_betslip_coerce_odds
BEFORE INSERT OR UPDATE ON public.betslips
FOR EACH ROW
EXECUTE FUNCTION public.ensure_betslip_odds_decimal();

-- 3) Trigger function to update leaderboard on settlement
CREATE OR REPLACE FUNCTION public.update_leaderboard_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := NULL;
  v_credits_current numeric := NULL;
  v_credits_start numeric := NULL;
  v_username text := NULL;
  v_multiplier numeric := 0;
BEGIN
  -- Only react to status changes to a terminal settlement state
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status IN ('won','lost','push','void')) THEN
      v_user := NEW.user_id;

      -- Read current profile credits (profiles updated by settlement function earlier in the same transaction)
      SELECT credits INTO v_credits_current FROM public.profiles WHERE id = v_user LIMIT 1;
      -- Read username for display
      SELECT username INTO v_username FROM public.profiles WHERE id = v_user LIMIT 1;

      -- If there's already a leaderboard row, read credits_start
      SELECT credits_start INTO v_credits_start FROM public.leaderboard WHERE user_id = v_user LIMIT 1;

      -- If credits_start is null (e.g. first bet after reset not recorded at insert), set it to current credits
      IF v_credits_start IS NULL THEN
        v_credits_start := v_credits_current;
      END IF;

      -- Compute multiplier as (current / start) rounded to 2 decimals; protect divide-by-zero
      IF v_credits_start IS NULL OR v_credits_start = 0 THEN
        v_multiplier := 0;
      ELSE
        v_multiplier := ROUND((v_credits_current::numeric / v_credits_start::numeric)::numeric, 2);
      END IF;

      -- Upsert: save credits_current and computed multiplier. Do NOT increment total_bets here (we count placed bets on insert).
      INSERT INTO public.leaderboard (user_id, username, multiplier, total_bets, first_bet, credits_start, credits_current, updated_at)
      VALUES (v_user, v_username, v_multiplier, 0, NEW.created_at, v_credits_start, v_credits_current, now())
      ON CONFLICT (user_id) DO UPDATE
      SET multiplier = ROUND((EXCLUDED.credits_current::numeric / COALESCE(public.leaderboard.credits_start, EXCLUDED.credits_start))::numeric, 2),
          credits_current = EXCLUDED.credits_current,
          username = COALESCE(EXCLUDED.username, public.leaderboard.username),
          first_bet = COALESCE(public.leaderboard.first_bet, EXCLUDED.first_bet),
          updated_at = now();
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach trigger AFTER UPDATE on betslips (so payout/profile updates in same transaction are OK)
DROP TRIGGER IF EXISTS trg_update_leaderboard_on_settlement ON public.betslips;
CREATE TRIGGER trg_update_leaderboard_on_settlement
AFTER UPDATE ON public.betslips
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won','lost','push','void'))
EXECUTE FUNCTION public.update_leaderboard_on_settlement();

-- 3a) Ensure we capture the user's credits at the time they place their first bet after a reset.
CREATE OR REPLACE FUNCTION public.ensure_leaderboard_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := NULL;
  v_credits numeric := NULL;
  v_username text := NULL;
BEGIN
  -- On bet insertion, capture the user's current credits as the "start" if not already present
  v_user := NEW.user_id;
  SELECT credits INTO v_credits FROM public.profiles WHERE id = v_user LIMIT 1;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_user LIMIT 1;

  -- If no leaderboard row exists, create one counting this placed bet (total_bets = 1).
  -- If a row already exists, increment total_bets to reflect this placed bet.
  INSERT INTO public.leaderboard (user_id, username, multiplier, total_bets, first_bet, credits_start, credits_current, updated_at)
  VALUES (v_user, v_username, 0, 1, NEW.created_at, v_credits, v_credits, now())
  ON CONFLICT (user_id) DO UPDATE
  SET total_bets = public.leaderboard.total_bets + 1,
      credits_current = EXCLUDED.credits_current,
      username = COALESCE(public.leaderboard.username, EXCLUDED.username),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_leaderboard_on_insert ON public.betslips;
CREATE TRIGGER trg_ensure_leaderboard_on_insert
AFTER INSERT ON public.betslips
FOR EACH ROW
WHEN (NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.ensure_leaderboard_on_insert();

-- 4) Weekly clearing function (truncate) and optional scheduling with pg_cron
CREATE OR REPLACE FUNCTION public.clear_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE public.leaderboard;
END;
$$;

-- If pg_cron is available, try to schedule weekly job at Sunday 02:00 PST (approx.)
-- NOTE: pg_cron uses the database timezone. If the DB timezone is UTC, adjust schedule accordingly.
-- The following tries to create extension and schedule job; silently continues if pg_cron not present or scheduling fails.
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
    IF NOT FOUND THEN
      -- Try to install it (may fail on hosted Supabase where extension isn't allowed)
      BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
      EXCEPTION WHEN others THEN
        -- ignore
      END;
    END IF;
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  -- If pg_cron is present, schedule the truncate job weekly on Sunday at 02:00 (server local TZ)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      -- remove prior job with same name if exists (ignore failures)
      PERFORM cron.unschedule('clear_leaderboard_weekly');
    EXCEPTION WHEN others THEN
      -- ignore if unschedule not present or fails
    END;

    BEGIN
      -- Use a distinct dollar-quote tag to avoid collisions
      PERFORM cron.schedule('clear_leaderboard_weekly', '0 2 * * SUN', $cmd$SELECT public.clear_leaderboard();$cmd$);
    EXCEPTION WHEN others THEN
      -- ignore scheduling errors
    END;
  END IF;
END;
$$;

COMMIT;

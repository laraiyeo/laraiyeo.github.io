-- Migration: 002_create_leaderboard.sql
-- Adds `leaderboard` table to track per-user multiplier and bet counts.
-- Enforces decimal odds coercion and schedules a weekly leaderboard reset.
-- Designed to work correctly on Supabase + pg_cron.

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

CREATE INDEX IF NOT EXISTS idx_leaderboard_multiplier
  ON public.leaderboard USING btree (multiplier DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_total_bets
  ON public.leaderboard USING btree (total_bets DESC);

-- 2) Function to ensure odds fields are decimal
CREATE OR REPLACE FUNCTION public.ensure_betslip_odds_decimal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_odds numeric;
  v_total numeric;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    BEGIN
      IF NEW.odds IS NOT NULL THEN
        v_odds := NEW.odds::numeric;
        IF abs(v_odds) >= 100 THEN
          IF v_odds >= 100 THEN
            NEW.odds := (v_odds / 100.0) + 1;
          ELSE
            NEW.odds := (100.0 / abs(v_odds)) + 1;
          END IF;
        ELSE
          NEW.odds := v_odds;
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      -- ignore
    END;

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
      -- ignore
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_betslip_coerce_odds ON public.betslips;
CREATE TRIGGER trg_betslip_coerce_odds
BEFORE INSERT OR UPDATE ON public.betslips
FOR EACH ROW
EXECUTE FUNCTION public.ensure_betslip_odds_decimal();

-- 3) Update leaderboard on settlement
CREATE OR REPLACE FUNCTION public.update_leaderboard_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid;
  v_credits_current numeric;
  v_credits_start numeric;
  v_username text;
  v_multiplier numeric := 0;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('won','lost','push','void')
  THEN
    v_user := NEW.user_id;

    SELECT credits, username
      INTO v_credits_current, v_username
      FROM public.profiles
      WHERE id = v_user;

    SELECT credits_start
      INTO v_credits_start
      FROM public.leaderboard
      WHERE user_id = v_user;

    IF v_credits_start IS NULL THEN
      v_credits_start := v_credits_current;
    END IF;

    IF v_credits_current IS NOT NULL AND v_credits_start IS NOT NULL THEN
      IF v_credits_current < v_credits_start THEN
        v_multiplier :=
          ROUND((GREATEST(v_credits_start,1) / GREATEST(v_credits_current,1)) * -1, 2);
      ELSE
        v_multiplier :=
          ROUND((GREATEST(v_credits_current,1) / GREATEST(v_credits_start,1)), 2);
      END IF;
    END IF;

    INSERT INTO public.leaderboard (
      user_id, username, multiplier, total_bets,
      first_bet, credits_start, credits_current, updated_at
    )
    VALUES (
      v_user, v_username, v_multiplier, 0,
      NEW.created_at, v_credits_start, v_credits_current, now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET multiplier = EXCLUDED.multiplier,
        credits_current = EXCLUDED.credits_current,
        username = COALESCE(EXCLUDED.username, leaderboard.username),
        first_bet = COALESCE(leaderboard.first_bet, EXCLUDED.first_bet),
        updated_at = now();
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_leaderboard_on_settlement ON public.betslips;
CREATE TRIGGER trg_update_leaderboard_on_settlement
AFTER UPDATE ON public.betslips
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won','lost','push','void'))
EXECUTE FUNCTION public.update_leaderboard_on_settlement();

-- 3a) Capture leaderboard row on bet placement
CREATE OR REPLACE FUNCTION public.ensure_leaderboard_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits numeric;
  v_username text;
BEGIN
  SELECT credits, username
    INTO v_credits, v_username
    FROM public.profiles
    WHERE id = NEW.user_id;

  INSERT INTO public.leaderboard (
    user_id, username, multiplier, total_bets,
    first_bet, credits_start, credits_current, updated_at
  )
  VALUES (
    NEW.user_id, v_username, 0, 1,
    NEW.created_at, v_credits, v_credits, now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET total_bets = leaderboard.total_bets + 1,
      credits_current = EXCLUDED.credits_current,
      username = COALESCE(leaderboard.username, EXCLUDED.username),
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

-- 4) Clear leaderboard
CREATE OR REPLACE FUNCTION public.clear_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE public.leaderboard;
END;
$$;

-- 5) Supabase-safe pg_cron scheduling (hourly poll, LA timezone)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- NOTE: Supabase does not support unschedule-by-name reliably
    -- Create ONE hourly job that conditionally clears at Sunday 02:00 LA time
    PERFORM cron.schedule(
      '0 * * * *',
      $cmd$
      DO $inner$
      BEGIN
        IF date_part('dow', now() AT TIME ZONE 'America/Los_Angeles') = 0
           AND date_part('hour', now() AT TIME ZONE 'America/Los_Angeles') = 2
        THEN
          PERFORM public.clear_leaderboard();
        END IF;
      END
      $inner$;
      $cmd$
    );
  END IF;
END;
$$;

COMMIT;

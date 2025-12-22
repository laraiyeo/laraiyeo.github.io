-- Migration: add is_pro to profiles and add promo_codes + revenue_events table
-- Run in Supabase SQL editor or via psql

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS promo_codes (
  code text PRIMARY KEY,
  uses integer DEFAULT 1,
  max_uses integer DEFAULT 1,
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  revenuecat_id text,
  event_type text,
  product_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

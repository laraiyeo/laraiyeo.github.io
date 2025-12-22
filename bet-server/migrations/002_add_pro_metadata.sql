-- Migration: add pro_expires_at, pro_product_id, pro_source to profiles
-- Run in Supabase SQL editor or via psql

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pro_product_id text NULL,
  ADD COLUMN IF NOT EXISTS pro_source text NULL;

-- Backfill: leave pro_expires_at NULL for existing rows; optionally set pro_source='manual' for existing is_pro=true rows
UPDATE profiles SET pro_source='manual' WHERE is_pro = true AND (pro_source IS NULL OR pro_source = '');

-- Simple promo_codes table and example insert
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS promo_codes (
  code text PRIMARY KEY,
  uses integer DEFAULT 0,
  type text,
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Example promo code: freelifetime with 1000 uses
INSERT INTO promo_codes (code, uses, type)
VALUES ('freelifetime', 1000, 'lifetime')
ON CONFLICT (code) DO NOTHING;

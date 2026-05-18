-- Farm Admin Multi-Farm Support
-- Run once in Supabase SQL Editor

-- Links a farm_admin user to multiple farms they manage
CREATE TABLE IF NOT EXISTS farm_admin_farms (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  TEXT        NOT NULL,          -- references users(id)
  farm_id        UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(admin_user_id, farm_id)
);

CREATE INDEX IF NOT EXISTS idx_farm_admin_farms_user
  ON farm_admin_farms(admin_user_id);

-- RLS
ALTER TABLE farm_admin_farms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm admins can read their own farm links"
  ON farm_admin_farms FOR SELECT
  TO authenticated
  USING (admin_user_id = auth.uid()::text);

CREATE POLICY "Farm admins can insert their own farm links"
  ON farm_admin_farms FOR INSERT
  TO authenticated
  WITH CHECK (admin_user_id = auth.uid()::text);

-- Make sure farms table has these columns (add if missing)
ALTER TABLE farms ADD COLUMN IF NOT EXISTS name    TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS address TEXT;

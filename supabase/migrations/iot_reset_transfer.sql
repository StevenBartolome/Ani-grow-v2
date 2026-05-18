-- IoT Device Reset & Transfer Support
-- Run this once in Supabase SQL Editor

-- Add new columns to devices table
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS claim_code     TEXT,
  ADD COLUMN IF NOT EXISTS last_reset_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registered_at  TIMESTAMPTZ DEFAULT NOW();

-- Audit log for all device lifecycle events
CREATE TABLE IF NOT EXISTS device_transfer_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      TEXT        NOT NULL,
  device_name    TEXT,
  action         TEXT        NOT NULL,   -- 'rename' | 'remove' | 'reset'
  from_farm_id   UUID        REFERENCES farms(id) ON DELETE SET NULL,
  performed_by   TEXT,                  -- user uid
  performed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes          TEXT
);

-- Index for quick lookups by device
CREATE INDEX IF NOT EXISTS idx_device_transfer_logs_device_id
  ON device_transfer_logs(device_id);

-- Allow authenticated users to insert logs
ALTER TABLE device_transfer_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm users can insert transfer logs"
  ON device_transfer_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Farm users can view their device logs"
  ON device_transfer_logs FOR SELECT
  TO authenticated
  USING (true);

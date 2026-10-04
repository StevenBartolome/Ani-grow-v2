-- ══════════════════════════════════════════════════════════════════════
-- Migration — Independent AniFeed device support
--
-- The feeder is being moved off Board1/Board2 onto its own standalone
-- ESP32 with its own WiFi, its own `devices` row (type='anifeed'), 3
-- feed-level sensors, and a relay driving the auger. This adds the
-- server-side pieces its firmware needs, all following the exact same
-- patterns already used by board1.ino:
--
--   1. devices.feed_level — reported via the SAME record_device_heartbeat
--      RPC used today, extended with one more optional parameter (same
--      approach migration_005 used for weighing_active).
--   2. device_commands — extend the existing tare/start/stop/reset queue
--      (migration_003/004) with 'dispense', so "Dispense Now" from the
--      app works over the cloud, not just LAN — same relay pattern.
--   3. record_dispense — a new RPC, shaped exactly like
--      record_weigh_session, for the board to log a completed dispense
--      into dispense_records.
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Feed level reporting ────────────────────────────────────────────────
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS feed_level TEXT CHECK (feed_level IN ('low', 'mid', 'high'));

DROP FUNCTION IF EXISTS public.record_device_heartbeat(TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.record_device_heartbeat(
  p_chip_id TEXT,
  p_weighing_active BOOLEAN DEFAULT NULL,
  p_feed_level TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.devices
  SET last_seen = NOW(),
      weighing_active = COALESCE(p_weighing_active, weighing_active),
      feed_level = COALESCE(p_feed_level, feed_level)
  WHERE unique_code = p_chip_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_device_heartbeat(TEXT, BOOLEAN, TEXT) TO anon;

-- 2. "Dispense Now" as a cloud-relayed command ──────────────────────────
ALTER TABLE public.device_commands DROP CONSTRAINT IF EXISTS device_commands_command_check;
ALTER TABLE public.device_commands
  ADD CONSTRAINT device_commands_command_check
  CHECK (command IN ('tare', 'start', 'stop', 'reset', 'dispense'));

-- 3. Logging a completed dispense ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_dispense(
  p_chip_id TEXT,
  p_grams_dispensed INT,
  p_status TEXT DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id   UUID;
  v_farm_id     UUID;
  v_housing_id  UUID;
  v_animal_type TEXT;
  v_feed_id     UUID;
BEGIN
  SELECT id, farm_id, housing_id INTO v_device_id, v_farm_id, v_housing_id
    FROM public.devices WHERE unique_code = p_chip_id LIMIT 1;
  IF v_device_id IS NULL OR v_farm_id IS NULL THEN RETURN; END IF;

  IF v_housing_id IS NOT NULL THEN
    SELECT animal_type INTO v_animal_type FROM public.housings WHERE id = v_housing_id;
  END IF;

  -- Best-effort: whichever feed this device is currently scheduled to
  -- dispense, if any — left NULL if none is configured yet.
  SELECT feed_id INTO v_feed_id FROM public.feed_schedules
    WHERE device_id = v_device_id
    ORDER BY adjusted_at DESC LIMIT 1;

  INSERT INTO public.dispense_records (
    device_id, farm_id, feed_id, housing_id, animal_type,
    grams_dispensed, status, triggered_by, dispensed_at
  ) VALUES (
    v_device_id, v_farm_id, v_feed_id, v_housing_id, v_animal_type,
    p_grams_dispensed, p_status, 'manual', NOW()
  );

  UPDATE public.devices SET last_seen = NOW() WHERE id = v_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_dispense(TEXT, INT, TEXT) TO anon;

-- 4. Reading the schedule the app set up ─────────────────────────────────
-- Same "narrow RPC only, no direct table access" rule as everything else
-- the board calls — it can ask "what's my schedule" but never SELECT
-- feed_schedules directly. Returns the most recently-adjusted schedule row
-- for this device (a device isn't expected to carry more than one active
-- schedule at a time today).
CREATE OR REPLACE FUNCTION public.get_feed_schedule(p_chip_id TEXT)
RETURNS TABLE(dispense_times TEXT[], grams_per_dispense INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT fs.dispense_times, fs.grams_per_dispense
  FROM public.feed_schedules fs
  JOIN public.devices d ON d.id = fs.device_id
  WHERE d.unique_code = p_chip_id
  ORDER BY fs.adjusted_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_schedule(TEXT) TO anon;

-- ══════════════════════════════════════════════════════════════════════
-- Migration — devices.sensor_low / sensor_mid / sensor_high
--
-- AniFeedScreen's "LIVE TEST" section currently only works when the phone
-- is on the same WiFi as the board (it polls /sensors directly over LAN
-- every 1.5s). To make it work from anywhere, the board reports its raw
-- per-sensor state here too — same "extend with one more optional
-- parameter" approach already used for weighing_active/feed_level/last_ip
-- — and the app subscribes to Realtime updates on this row instead of
-- polling the board directly. The board posts an update immediately
-- whenever a sensor's state changes (not just once per 30s heartbeat), so
-- this stays close to live without hammering Supabase during normal
-- operation where the sensors rarely change.
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS sensor_low  BOOLEAN,
  ADD COLUMN IF NOT EXISTS sensor_mid  BOOLEAN,
  ADD COLUMN IF NOT EXISTS sensor_high BOOLEAN;

DROP FUNCTION IF EXISTS public.record_device_heartbeat(TEXT, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_device_heartbeat(
  p_chip_id TEXT,
  p_weighing_active BOOLEAN DEFAULT NULL,
  p_feed_level TEXT DEFAULT NULL,
  p_last_ip TEXT DEFAULT NULL,
  p_sensor_low BOOLEAN DEFAULT NULL,
  p_sensor_mid BOOLEAN DEFAULT NULL,
  p_sensor_high BOOLEAN DEFAULT NULL
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
      feed_level = COALESCE(p_feed_level, feed_level),
      last_ip = COALESCE(p_last_ip, last_ip),
      sensor_low = COALESCE(p_sensor_low, sensor_low),
      sensor_mid = COALESCE(p_sensor_mid, sensor_mid),
      sensor_high = COALESCE(p_sensor_high, sensor_high)
  WHERE unique_code = p_chip_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_device_heartbeat(TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO anon;

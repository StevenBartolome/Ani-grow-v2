-- ══════════════════════════════════════════════════════════════════════
-- Migration — devices.last_ip
--
-- Android's default network stack (what React Native's fetch uses) has
-- no built-in mDNS resolver, so "<name>.local" hostnames never resolve
-- there (unlike iOS, which has native Bonjour support) — confirmed by
-- testing: the board's /sensors endpoint loads fine when hit by its real
-- IP directly from an Android phone's browser, but times out through the
-- app's ".local" URL. The board already reports in successfully via
-- record_device_heartbeat every 30s, so it can report its current LAN IP
-- the same way, and the app can try that real IP before falling back to
-- mDNS/AP-mode — same "extend with one more optional parameter" approach
-- already used for weighing_active and feed_level.
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS last_ip TEXT;

DROP FUNCTION IF EXISTS public.record_device_heartbeat(TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.record_device_heartbeat(
  p_chip_id TEXT,
  p_weighing_active BOOLEAN DEFAULT NULL,
  p_feed_level TEXT DEFAULT NULL,
  p_last_ip TEXT DEFAULT NULL
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
      last_ip = COALESCE(p_last_ip, last_ip)
  WHERE unique_code = p_chip_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_device_heartbeat(TEXT, BOOLEAN, TEXT, TEXT) TO anon;

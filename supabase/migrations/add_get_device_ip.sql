-- ══════════════════════════════════════════════════════════════════════
-- Migration — get_device_ip RPC
--
-- anifeed.ino needs Board1's current LAN IP to relay dispense/jog commands
-- to it (see BOARD1_CHIP_ID comment in anifeed.ino). The devices table
-- itself isn't open to direct anon reads — same "narrow RPC only, no
-- direct table access" rule already used for get_feed_schedule — so a
-- raw `GET /rest/v1/devices?...` with the anon key returns nothing. This
-- adds a purpose-built RPC instead, mirroring get_feed_schedule's shape.
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_device_ip(p_chip_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT;
BEGIN
  SELECT last_ip INTO v_ip FROM public.devices WHERE unique_code = p_chip_id LIMIT 1;
  RETURN v_ip;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_device_ip(TEXT) TO anon;

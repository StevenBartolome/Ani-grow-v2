-- ══════════════════════════════════════════════════════════════════════
-- Migration — get_weight_threshold RPC
--
-- board1.ino only ever received weight range updates (underweight/
-- overweight cutoffs) via a direct LAN call from the app
-- (syncThresholdToDevice in AniWeighScreen.tsx) — if the phone wasn't on
-- the same WiFi as the board at that exact moment, the update never
-- reached it, and the board kept using whatever it last had (or the
-- compiled-in default of 1000g/3000g if never once synced). This looks
-- identical to a hardcoded range from the user's side, even though it's
-- technically a variable — same class of bug already fixed for the
-- feeder's dispense schedule.
--
-- weight_thresholds' own RLS (see fix_weight_thresholds_rls.sql) only
-- grants `authenticated` access, not `anon` (what the board uses), so a
-- direct table read from the board would return nothing — hence a
-- narrow RPC, same "no direct table access" rule used everywhere else
-- the board talks to Supabase.
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_weight_threshold(p_chip_id TEXT, p_animal_type TEXT)
RETURNS TABLE(underweight_max_grams INT, overweight_min_grams INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id UUID;
BEGIN
  SELECT id INTO v_device_id FROM public.devices WHERE unique_code = p_chip_id LIMIT 1;
  IF v_device_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT wt.underweight_max_grams, wt.overweight_min_grams
  FROM public.weight_thresholds wt
  WHERE wt.device_id = v_device_id AND wt.animal_type = p_animal_type
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_weight_threshold(TEXT, TEXT) TO anon;

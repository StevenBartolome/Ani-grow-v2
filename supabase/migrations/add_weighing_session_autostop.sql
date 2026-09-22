-- ══════════════════════════════════════════════════════════════════════
-- Migration — record_weigh_session now returns session progress
--
-- board1.ino currently has no concept of "how many animals am I supposed
-- to weigh" or "stop automatically once I've weighed them all" — it just
-- keeps weighing until a human manually presses Stop. weighing_sessions
-- already tracks expected_quantity/completed_quantity (see
-- add_weighing_sessions.sql) and record_weigh_session already increments
-- completed_quantity on every reading — it just never told the board what
-- the new totals were. This changes it from RETURNS void to returning
-- both counts, so board1.ino can check after every reading whether the
-- session is now complete and stop itself.
--
-- NOTE: this repo doesn't have this function's exact currently-deployed
-- source tracked anywhere (it was applied directly via the Supabase SQL
-- editor) — the body below is reconstructed from the project's own
-- documented design for it. The core logic (resolve device -> farm/
-- housing, attach to the active gated weighing_sessions row if one
-- exists else fall back to the housing's active batch, insert into
-- weigh_sessions, bump completed_quantity) is unchanged; only the return
-- type changed. If this doesn't match what's actually live, tell me and
-- I'll reconcile it against the real definition instead of guessing.
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.record_weigh_session(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.record_weigh_session(
  p_chip_id TEXT, p_net_weight_grams INT, p_status TEXT
) RETURNS TABLE(completed_quantity INT, expected_quantity INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_device_id UUID; v_farm_id UUID; v_housing_id UUID; v_batch_id UUID; v_animal_type TEXT;
  v_active_session RECORD;
BEGIN
  SELECT id, farm_id, housing_id INTO v_device_id, v_farm_id, v_housing_id
    FROM devices WHERE unique_code = p_chip_id LIMIT 1;
  IF v_device_id IS NULL OR v_farm_id IS NULL THEN RETURN; END IF;

  -- Prefer the admin-confirmed active session (set via the app's
  -- pre-weighing gate) — strictly more reliable than guessing the "most
  -- recent active batch for this housing".
  SELECT * INTO v_active_session FROM weighing_sessions
    WHERE device_id = v_device_id AND status = 'in_progress'
    ORDER BY created_at DESC LIMIT 1;

  IF v_active_session.id IS NOT NULL THEN
    v_batch_id := v_active_session.batch_id;
    v_animal_type := v_active_session.animal_type;
  ELSIF v_housing_id IS NOT NULL THEN
    -- Fallback only — no gated session in progress.
    SELECT animal_type INTO v_animal_type FROM housings WHERE id = v_housing_id;
    SELECT id INTO v_batch_id FROM batches
      WHERE housing_id = v_housing_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  INSERT INTO weigh_sessions (device_id, farm_id, batch_id, weighing_session_id, weigh_mode, animal_type,
      animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams,
      avg_weight_grams, status, recorded_at)
    VALUES (v_device_id, v_farm_id, v_batch_id, v_active_session.id, 'individual', v_animal_type,
      1, p_net_weight_grams, 0, p_net_weight_grams, p_net_weight_grams, p_status, NOW());

  IF v_active_session.id IS NOT NULL THEN
    UPDATE weighing_sessions SET completed_quantity = weighing_sessions.completed_quantity + 1
      WHERE id = v_active_session.id
      RETURNING weighing_sessions.completed_quantity, weighing_sessions.expected_quantity
      INTO completed_quantity, expected_quantity;
  END IF;

  UPDATE devices SET last_seen = NOW() WHERE id = v_device_id;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_weigh_session(TEXT, INT, TEXT) TO anon;

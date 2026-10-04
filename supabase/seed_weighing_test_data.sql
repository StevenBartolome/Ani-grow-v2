-- =====================================================================
-- ONE-TIME DEV/TEST SEED — Weighing Sessions + Report feature
-- =====================================================================
-- Run manually once (Supabase SQL editor or `supabase db execute`), AFTER
-- add_weighing_sessions.sql has been applied. NOT a migration — safe to
-- skip in production. Creates a dedicated demo Housing + Batch (10 pigs,
-- arrived 35 "days" ago) with 4 historical weighing sessions (Day 1, 10,
-- 20, 30) and ~34 days of feed-dispense history, so the report/growth/AI
-- screens have real, varied data to render immediately. Deliberately
-- leaves Day 35 (today) un-weighed — that's the live 5th session to
-- record by hand in the app, to exercise the full flow end-to-end.
--
-- Targets the FIRST farm found in public.farms. To target a specific
-- farm instead, uncomment the line below and paste its farm_id.
-- =====================================================================

DO $$
DECLARE
  v_farm_id           UUID;
  -- v_farm_id := 'PASTE-A-SPECIFIC-FARM-ID-HERE'::uuid;  -- SET THIS to override
  v_housing_id        UUID;
  v_batch_id          UUID;
  v_weigh_device_id   UUID;
  v_feed_device_id    UUID;
  v_feed_id           UUID;
  v_arrival_date      DATE := CURRENT_DATE - INTERVAL '35 days';
  v_session_id        UUID;
  v_day               INTEGER;
  v_weights           INTEGER[];
  v_under_max         INTEGER;
  v_over_min          INTEGER;
  v_w                 INTEGER;
  v_status             TEXT;
  v_i                 INTEGER;
  v_total_g           BIGINT;
BEGIN
  -- Bail out quietly if the demo housing already exists — this script is
  -- meant to be run once; re-running it should be a harmless no-op.
  IF EXISTS (SELECT 1 FROM public.housings WHERE name = 'Demo House — Weighing Test') THEN
    RAISE NOTICE 'Demo housing already exists — skipping seed (nothing inserted).';
    RETURN;
  END IF;

  SELECT id INTO v_farm_id FROM public.farms ORDER BY created_at ASC LIMIT 1;
  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm found in public.farms — create a farm first, then re-run this script.';
  END IF;

  -- ── Demo housing + batch ──────────────────────────────────────────
  INSERT INTO public.housings (farm_id, name, animal_type, capacity, current_count, status, notes)
    VALUES (v_farm_id, 'Demo House — Weighing Test', 'pig', 20, 10, 'Active', 'Seeded by seed_weighing_test_data.sql for report/AI testing.')
    RETURNING id INTO v_housing_id;

  INSERT INTO public.batches (farm_id, housing_id, name, animal_type, estimated_count, current_count, arrival_date, supplier, status, notes, age_at_arrival_days, sold_count)
    VALUES (v_farm_id, v_housing_id, 'Demo Batch 1', 'pig', 10, 10, v_arrival_date, 'Demo Supplier', 'active', 'Seeded by seed_weighing_test_data.sql.', 0, 0)
    RETURNING id INTO v_batch_id;

  -- ── Demo devices (weigh scale + feeder) ───────────────────────────
  INSERT INTO public.devices (farm_id, housing_id, name, type, serial_number, status, firmware_version, last_seen, weighing_active, unique_code, registered_at)
    VALUES (v_farm_id, v_housing_id, 'Demo AniWeigh', 'aniweigh', 'DEMO-WEIGH-0001', 'online', '1.0.0', NOW(), false, 'DEMO-WEIGH-0001', NOW())
    RETURNING id INTO v_weigh_device_id;

  INSERT INTO public.devices (farm_id, housing_id, name, type, serial_number, status, firmware_version, last_seen, unique_code, registered_at)
    VALUES (v_farm_id, v_housing_id, 'Demo AniFeed', 'anifeed', 'DEMO-FEED-0001', 'online', '1.0.0', NOW(), 'DEMO-FEED-0001', NOW())
    RETURNING id INTO v_feed_device_id;

  -- Weight threshold sized for this demo batch's Day-1 weight range —
  -- static/non-age-adjusted, same as every other device in this app
  -- (weight_thresholds has no age dimension). Historical session rows
  -- below have their status set explicitly to show realistic variety
  -- across the batch's full weight range instead of being entirely
  -- swallowed by one fixed band as the pigs outgrow it.
  INSERT INTO public.weight_thresholds (device_id, farm_id, animal_type, underweight_max_grams, normal_min_grams, normal_max_grams, overweight_min_grams, updated_at)
    VALUES (v_weigh_device_id, v_farm_id, 'pig', 2700, 2701, 3400, 3401, NOW());

  -- ── Demo feed + schedule ───────────────────────────────────────────
  INSERT INTO public.feeds (farm_id, name, brand, category, animal_type, stock_kg, supplier, notes)
    VALUES (v_farm_id, 'Grower Feed', 'Demo Feeds Co.', 'Grower', 'pig', 500, 'Demo Supplier', 'Seeded by seed_weighing_test_data.sql.')
    RETURNING id INTO v_feed_id;

  INSERT INTO public.feed_schedules (device_id, farm_id, housing_id, feed_id, batch_id, animal_type, times_per_day, grams_per_dispense, dispense_times)
    VALUES (v_feed_device_id, v_farm_id, v_housing_id, v_feed_id, v_batch_id, 'pig', 3, 500, ARRAY['08:00','12:00','18:00']);

  -- ── Historical weighing sessions: Day 1 / 10 / 20 / 30 ────────────
  -- Weights trend up with per-pig variance (not identical, not linear)
  -- and a shifting under/normal/overweight mix per §12 of the spec.
  FOR v_day IN SELECT unnest(ARRAY[1, 10, 20, 30]) LOOP
    v_weights := CASE v_day
      WHEN 1  THEN ARRAY[2450,2600,2900,2950,3000,3050,3100,3150,3300,3700]
      WHEN 10 THEN ARRAY[4700,4900,5200,5300,5400,5500,5600,5700,5900,6300]
      WHEN 20 THEN ARRAY[8200,8500,9000,9200,9400,9600,9700,9900,10200,10800]
      WHEN 30 THEN ARRAY[12500,13000,13600,13800,14000,14200,14400,14600,15000,15800]
    END;
    v_under_max := CASE v_day WHEN 1 THEN 2700 WHEN 10 THEN 5000 WHEN 20 THEN 8600 WHEN 30 THEN 13200 END;
    v_over_min  := CASE v_day WHEN 1 THEN 3400 WHEN 10 THEN 6000 WHEN 20 THEN 10000 WHEN 30 THEN 15000 END;

    INSERT INTO public.weighing_sessions (farm_id, housing_id, batch_id, device_id, animal_type, farm_day, expected_quantity, completed_quantity, status, created_at, completed_at)
      VALUES (v_farm_id, v_housing_id, v_batch_id, v_weigh_device_id, 'pig', v_day, 10, 10, 'completed',
              v_arrival_date + (v_day || ' days')::interval, v_arrival_date + (v_day || ' days')::interval)
      RETURNING id INTO v_session_id;

    FOR v_i IN 1..10 LOOP
      v_w := v_weights[v_i];
      v_status := CASE WHEN v_w < v_under_max THEN 'underweight' WHEN v_w >= v_over_min THEN 'overweight' ELSE 'normal' END;

      INSERT INTO public.weigh_sessions (device_id, farm_id, batch_id, weighing_session_id, weigh_mode, animal_type, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, animal_label, recorded_at)
        VALUES (v_weigh_device_id, v_farm_id, v_batch_id, v_session_id, 'individual', 'pig', 1, v_w, 0, v_w, v_w::numeric,
                v_status, 'Pig ' || LPAD(v_i::text, 3, '0'), v_arrival_date + (v_day || ' days')::interval);
    END LOOP;
  END LOOP;

  -- ── Feed history: one row per day from Day 1 through Day 34 ───────
  -- (today, Day 35, is left with no feed/weigh row — the live test day).
  -- Daily total per pig scales from ~150g/day up to ~600g/day as the
  -- batch grows, ×10 pigs, so consumption trends up alongside weight
  -- instead of sitting flat.
  FOR v_day IN 1..34 LOOP
    v_total_g := (150 + ROUND(450.0 * v_day / 34))::bigint * 10;
    INSERT INTO public.dispense_records (device_id, farm_id, feed_id, housing_id, batch_id, animal_type, grams_dispensed, status, triggered_by, dispensed_at)
      VALUES (v_feed_device_id, v_farm_id, v_feed_id, v_housing_id, v_batch_id, 'pig', v_total_g, 'success', 'schedule',
              v_arrival_date + (v_day || ' days')::interval + INTERVAL '8 hours');
  END LOOP;

  RAISE NOTICE 'Seed complete — demo housing_id=%, batch_id=%', v_housing_id, v_batch_id;
END $$;

-- =====================================================================
-- ONE-TIME DEV/TEST SEED — Bulk housings/batches for report testing
-- =====================================================================
-- Run manually once (Supabase SQL editor), AFTER add_weighing_sessions.sql.
-- Separate from seed_weighing_test_data.sql — that one's single demo
-- house/batch stays untouched; this adds 6 more houses (3 pig, 3 chicken),
-- each with 3 batches, so there's plenty to pick from when generating
-- Weighing History & Reports.
--
-- Each housing gets 3 batches with deliberately different amounts of
-- history, so you can also see how the report/growth screens behave with
-- rich data vs. very little:
--   Batch 1 — "rich":    full history (pig: 4 sessions over 90 days,
--                         chicken: 3 sessions over 30 days)
--   Batch 2 — "partial": some history (2 sessions) — enough for a
--                         previous-vs-current comparison, not a full trend
--   Batch 3 — "new":     just arrived, only 1 early session — exercises
--                         the "not enough data yet" messaging
--
-- Targets the FIRST farm found in public.farms (same as
-- seed_weighing_test_data.sql). Safe to re-run — skips if 'Pig House A'
-- already exists.
-- =====================================================================

DO $$
DECLARE
  v_farm_id      UUID;
  v_housing_id   UUID;
  v_device_id    UUID;
  v_feed_id      UUID;
  v_batch_id     UUID;
  v_session_id   UUID;
  v_housing_num  INTEGER;
  v_batch_num    INTEGER;
  v_arrival_date DATE;
  v_days         INTEGER[];
  v_day          INTEGER;
  v_i            INTEGER;
  v_base_g       INTEGER;
  v_w            INTEGER;
  v_status       TEXT;
  v_letter       TEXT;
  v_total_g      BIGINT;
  v_max_day      INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.housings WHERE name = 'Pig House A') THEN
    RAISE NOTICE 'Bulk demo housings already exist — skipping seed (nothing inserted).';
    RETURN;
  END IF;

  SELECT id INTO v_farm_id FROM public.farms ORDER BY created_at ASC LIMIT 1;
  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm found in public.farms — create a farm first, then re-run this script.';
  END IF;

  -- =====================================================================
  -- PIGS — 3 houses x 3 batches, individual weigh_mode
  -- =====================================================================
  FOR v_housing_num IN 1..3 LOOP
    v_letter := CHR(64 + v_housing_num); -- A, B, C

    INSERT INTO public.housings (farm_id, name, animal_type, capacity, current_count, status, notes)
      VALUES (v_farm_id, 'Pig House ' || v_letter, 'pig', 20, 10, 'Active', 'Seeded by seed_bulk_housings_batches.sql.')
      RETURNING id INTO v_housing_id;

    INSERT INTO public.devices (farm_id, housing_id, name, type, serial_number, status, firmware_version, last_seen, weighing_active, unique_code, registered_at)
      VALUES (v_farm_id, v_housing_id, 'AniWeigh — Pig House ' || v_letter, 'aniweigh', 'DEMO-PIG-' || v_letter || '-WEIGH', 'online', '1.0.0', NOW(), false, 'DEMO-PIG-' || v_letter || '-WEIGH', NOW())
      RETURNING id INTO v_device_id;

    INSERT INTO public.weight_thresholds (device_id, farm_id, animal_type, underweight_max_grams, normal_min_grams, normal_max_grams, overweight_min_grams, updated_at)
      VALUES (v_device_id, v_farm_id, 'pig', 13200, 13201, 15000, 15001, NOW());

    INSERT INTO public.feeds (farm_id, name, brand, category, animal_type, stock_kg, supplier, notes)
      VALUES (v_farm_id, 'Grower Feed — House ' || v_letter, 'Demo Feeds Co.', 'Grower', 'pig', 500, 'Demo Supplier', 'Seeded by seed_bulk_housings_batches.sql.')
      RETURNING id INTO v_feed_id;

    FOR v_batch_num IN 1..3 LOOP
      -- Case profile per batch number (same across all 3 houses)
      IF v_batch_num = 1 THEN
        v_arrival_date := CURRENT_DATE - INTERVAL '90 days';
        v_days := ARRAY[10, 30, 60, 90];
      ELSIF v_batch_num = 2 THEN
        v_arrival_date := CURRENT_DATE - INTERVAL '40 days';
        v_days := ARRAY[10, 30];
      ELSE
        v_arrival_date := CURRENT_DATE - INTERVAL '5 days';
        v_days := ARRAY[3];
      END IF;

      INSERT INTO public.batches (farm_id, housing_id, name, animal_type, estimated_count, current_count, arrival_date, supplier, status, notes, age_at_arrival_days, sold_count)
        VALUES (v_farm_id, v_housing_id, 'Batch ' || v_batch_num, 'pig', 10, 10, v_arrival_date, 'Demo Supplier', 'active', 'Seeded by seed_bulk_housings_batches.sql.', 0, 0)
        RETURNING id INTO v_batch_id;

      FOREACH v_day IN ARRAY v_days LOOP
        v_base_g := CASE v_day WHEN 10 THEN 5000 WHEN 30 THEN 15000 WHEN 60 THEN 35000 WHEN 90 THEN 65000 ELSE 1800 END;

        INSERT INTO public.weighing_sessions (farm_id, housing_id, batch_id, device_id, animal_type, farm_day, expected_quantity, completed_quantity, status, created_at, completed_at)
          VALUES (v_farm_id, v_housing_id, v_batch_id, v_device_id, 'pig', v_day, 10, 10, 'completed',
                  v_arrival_date + (v_day || ' days')::interval, v_arrival_date + (v_day || ' days')::interval)
          RETURNING id INTO v_session_id;

        FOR v_i IN 1..10 LOOP
          -- Spread each pig from -15% to +12% of the day's base weight —
          -- deterministic, not random, but still varied per animal.
          v_w := ROUND(v_base_g * (0.85 + 0.03 * (v_i - 1)))::integer;
          v_status := CASE WHEN v_i <= 2 THEN 'underweight' WHEN v_i >= 9 THEN 'overweight' ELSE 'normal' END;

          INSERT INTO public.weigh_sessions (device_id, farm_id, batch_id, weighing_session_id, weigh_mode, animal_type, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, animal_label, recorded_at)
            VALUES (v_device_id, v_farm_id, v_batch_id, v_session_id, 'individual', 'pig', 1, v_w, 0, v_w, v_w::numeric,
                    v_status, 'Pig ' || LPAD(v_i::text, 3, '0'), v_arrival_date + (v_day || ' days')::interval);
        END LOOP;
      END LOOP;

      -- Feed history from arrival through the last weighing day (or a
      -- week, for the brand-new batch), scaling up with age.
      v_max_day := (SELECT MAX(d) FROM unnest(v_days) AS d);
      IF v_max_day IS NULL THEN v_max_day := 7; END IF;
      FOR v_day IN 1..v_max_day LOOP
        v_total_g := (150 + ROUND(600.0 * v_day / GREATEST(v_max_day, 1)))::bigint * 10;
        INSERT INTO public.dispense_records (device_id, farm_id, feed_id, housing_id, batch_id, animal_type, grams_dispensed, status, triggered_by, dispensed_at)
          VALUES (v_device_id, v_farm_id, v_feed_id, v_housing_id, v_batch_id, 'pig', v_total_g, 'success', 'schedule',
                  v_arrival_date + (v_day || ' days')::interval + INTERVAL '8 hours');
      END LOOP;
    END LOOP;
  END LOOP;

  -- =====================================================================
  -- CHICKENS — 3 houses x 3 batches, batch/group weigh_mode (whole flock
  -- weighed together each session, matching the app's by-group model —
  -- see WeighingSessionsScreen.tsx's chicken handling)
  -- =====================================================================
  FOR v_housing_num IN 1..3 LOOP
    v_letter := CHR(64 + v_housing_num);

    INSERT INTO public.housings (farm_id, name, animal_type, capacity, current_count, status, notes)
      VALUES (v_farm_id, 'Chicken House ' || v_letter, 'chicken', 200, 100, 'Active', 'Seeded by seed_bulk_housings_batches.sql.')
      RETURNING id INTO v_housing_id;

    INSERT INTO public.devices (farm_id, housing_id, name, type, serial_number, status, firmware_version, last_seen, weighing_active, unique_code, registered_at)
      VALUES (v_farm_id, v_housing_id, 'AniWeigh — Chicken House ' || v_letter, 'aniweigh', 'DEMO-CHK-' || v_letter || '-WEIGH', 'online', '1.0.0', NOW(), false, 'DEMO-CHK-' || v_letter || '-WEIGH', NOW())
      RETURNING id INTO v_device_id;

    INSERT INTO public.weight_thresholds (device_id, farm_id, animal_type, underweight_max_grams, normal_min_grams, normal_max_grams, overweight_min_grams, updated_at)
      VALUES (v_device_id, v_farm_id, 'chicken', 1500, 1501, 2200, 2201, NOW());

    INSERT INTO public.feeds (farm_id, name, brand, category, animal_type, stock_kg, supplier, notes)
      VALUES (v_farm_id, 'Broiler Feed — House ' || v_letter, 'Demo Feeds Co.', 'Broiler', 'chicken', 800, 'Demo Supplier', 'Seeded by seed_bulk_housings_batches.sql.')
      RETURNING id INTO v_feed_id;

    FOR v_batch_num IN 1..3 LOOP
      IF v_batch_num = 1 THEN
        v_arrival_date := CURRENT_DATE - INTERVAL '30 days';
        v_days := ARRAY[5, 15, 25];
      ELSIF v_batch_num = 2 THEN
        v_arrival_date := CURRENT_DATE - INTERVAL '15 days';
        v_days := ARRAY[5, 12];
      ELSE
        v_arrival_date := CURRENT_DATE - INTERVAL '3 days';
        v_days := ARRAY[2];
      END IF;

      INSERT INTO public.batches (farm_id, housing_id, name, animal_type, estimated_count, current_count, arrival_date, supplier, status, notes, age_at_arrival_days, sold_count)
        VALUES (v_farm_id, v_housing_id, 'Batch ' || v_batch_num, 'chicken', 100, 100, v_arrival_date, 'Demo Supplier', 'active', 'Seeded by seed_bulk_housings_batches.sql.', 0, 0)
        RETURNING id INTO v_batch_id;

      FOREACH v_day IN ARRAY v_days LOOP
        v_base_g := CASE v_day WHEN 5 THEN 180 WHEN 12 THEN 650 WHEN 15 THEN 900 WHEN 25 THEN 1900 ELSE 120 END;
        v_w := v_base_g * 100; -- whole-flock net weight = per-bird avg x 100 birds

        INSERT INTO public.weighing_sessions (farm_id, housing_id, batch_id, device_id, animal_type, weigh_mode, farm_day, expected_quantity, completed_quantity, status, created_at, completed_at)
          VALUES (v_farm_id, v_housing_id, v_batch_id, v_device_id, 'chicken', 'batch', v_day, 100, 100, 'completed',
                  v_arrival_date + (v_day || ' days')::interval, v_arrival_date + (v_day || ' days')::interval)
          RETURNING id INTO v_session_id;

        INSERT INTO public.weigh_sessions (device_id, farm_id, batch_id, weighing_session_id, weigh_mode, animal_type, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, recorded_at)
          VALUES (v_device_id, v_farm_id, v_batch_id, v_session_id, 'batch', 'chicken', 100, v_w, 0, v_w, v_base_g::numeric,
                  'normal', v_arrival_date + (v_day || ' days')::interval);
      END LOOP;

      v_max_day := (SELECT MAX(d) FROM unnest(v_days) AS d);
      IF v_max_day IS NULL THEN v_max_day := 5; END IF;
      FOR v_day IN 1..v_max_day LOOP
        v_total_g := (20 + ROUND(80.0 * v_day / GREATEST(v_max_day, 1)))::bigint * 100;
        INSERT INTO public.dispense_records (device_id, farm_id, feed_id, housing_id, batch_id, animal_type, grams_dispensed, status, triggered_by, dispensed_at)
          VALUES (v_device_id, v_farm_id, v_feed_id, v_housing_id, v_batch_id, 'chicken', v_total_g, 'success', 'schedule',
                  v_arrival_date + (v_day || ' days')::interval + INTERVAL '8 hours');
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Bulk seed complete — 3 pig houses + 3 chicken houses, 3 batches each.';
END $$;

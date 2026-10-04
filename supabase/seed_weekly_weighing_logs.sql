-- =====================================================================
-- ONE-TIME DEV/TEST SEED — Replace with clean weekly-cadence logs
-- =====================================================================
-- Run manually once, AFTER seed_bulk_housings_batches.sql. Replaces the
-- "Batch 1" (rich) and "Batch 2" (partial) weighing history in each of
-- the 4 remaining bulk-seeded houses (Pig House B/C, Chicken House B/C)
-- with a clean weekly cadence — exactly 7 days apart, matching real
-- weekly weighing schedules — instead of the original day10/30/60/90
-- spacing. Also gives real underweight/normal/overweight variety ACROSS
-- weeks (previously chicken sessions were all flagged 'normal').
--
-- Batch 1 -> 4 weekly sessions (Day 7/14/21/28) — full month of history,
--            status progression: underweight -> normal -> normal -> overweight
-- Batch 2 -> 2 weekly sessions (Day 7/14) — exactly the "week 1 vs week 2,
--            same batch" comparison case
-- Batch 3 ("new") is untouched — still the "not enough data yet" case.
--
-- Safe to re-run — clears old logs for these batches before re-inserting.
-- =====================================================================

DO $$
DECLARE
  v_farm_id     UUID;
  v_housing_id  UUID;
  v_device_id   UUID;
  v_feed_id     UUID;
  v_batch_id    UUID;
  v_session_id  UUID;
  v_arrival     DATE;
  v_animal      TEXT;
  v_housing_name TEXT;
  v_week        INTEGER;
  v_day         INTEGER;
  v_num_weeks   INTEGER;
  v_base_g      INTEGER;
  v_status      TEXT;
  v_i           INTEGER;
  v_w           INTEGER;
  v_total_g     BIGINT;
  v_rec         RECORD;
BEGIN
  SELECT id INTO v_farm_id FROM public.farms ORDER BY created_at ASC LIMIT 1;
  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm found in public.farms.';
  END IF;

  -- Iterate the 4 remaining houses x their Batch 1 (4 weeks) and Batch 2 (2 weeks)
  FOR v_rec IN
    SELECT h.id AS housing_id, h.name AS housing_name, h.animal_type,
           b.id AS batch_id, b.name AS batch_name, b.arrival_date, b.age_at_arrival_days
    FROM public.batches b
    JOIN public.housings h ON h.id = b.housing_id
    WHERE h.name IN ('Pig House B', 'Pig House C', 'Chicken House B', 'Chicken House C')
      AND b.name IN ('Batch 1', 'Batch 2')
  LOOP
    v_housing_id := v_rec.housing_id;
    v_housing_name := v_rec.housing_name;
    v_animal := v_rec.animal_type;
    v_batch_id := v_rec.batch_id;
    v_arrival := v_rec.arrival_date;
    v_num_weeks := CASE WHEN v_rec.batch_name = 'Batch 1' THEN 4 ELSE 2 END;

    -- Find this housing's demo AniWeigh device (created by
    -- seed_bulk_housings_batches.sql) and its feed row.
    SELECT id INTO v_device_id FROM public.devices
      WHERE housing_id = v_housing_id AND type = 'aniweigh' LIMIT 1;
    SELECT id INTO v_feed_id FROM public.feeds
      WHERE farm_id = v_farm_id AND name LIKE '%' || v_housing_name || '%' LIMIT 1;

    -- Clear this batch's old logs before re-inserting a clean weekly set.
    DELETE FROM public.weigh_sessions WHERE batch_id = v_batch_id;
    DELETE FROM public.weighing_sessions WHERE batch_id = v_batch_id;
    DELETE FROM public.dispense_records WHERE batch_id = v_batch_id;

    FOR v_week IN 1..v_num_weeks LOOP
      v_day := v_week * 7;

      IF v_animal = 'pig' THEN
        v_base_g := CASE v_week WHEN 1 THEN 3500 WHEN 2 THEN 5000 WHEN 3 THEN 7000 ELSE 9500 END;
      ELSE
        v_base_g := CASE v_week WHEN 1 THEN 250 WHEN 2 THEN 700 WHEN 3 THEN 1400 ELSE 2200 END;
      END IF;

      INSERT INTO public.weighing_sessions (farm_id, housing_id, batch_id, device_id, animal_type, weigh_mode, farm_day, expected_quantity, completed_quantity, status, created_at, completed_at)
        VALUES (v_farm_id, v_housing_id, v_batch_id, v_device_id, v_animal,
                CASE WHEN v_animal = 'pig' THEN 'individual' ELSE 'batch' END,
                v_day,
                CASE WHEN v_animal = 'pig' THEN 10 ELSE 100 END,
                CASE WHEN v_animal = 'pig' THEN 10 ELSE 100 END,
                'completed',
                v_arrival + (v_day || ' days')::interval, v_arrival + (v_day || ' days')::interval)
        RETURNING id INTO v_session_id;

      IF v_animal = 'pig' THEN
        FOR v_i IN 1..10 LOOP
          v_w := ROUND(v_base_g * (0.85 + 0.03 * (v_i - 1)))::integer;
          v_status := CASE WHEN v_i <= 2 THEN 'underweight' WHEN v_i >= 9 THEN 'overweight' ELSE 'normal' END;

          INSERT INTO public.weigh_sessions (device_id, farm_id, batch_id, weighing_session_id, weigh_mode, animal_type, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, animal_label, recorded_at)
            VALUES (v_device_id, v_farm_id, v_batch_id, v_session_id, 'individual', 'pig', 1, v_w, 0, v_w, v_w::numeric,
                    v_status, 'Pig ' || LPAD(v_i::text, 3, '0'), v_arrival + (v_day || ' days')::interval);
        END LOOP;
      ELSE
        -- Whole-flock group reading — one status per week, giving real
        -- underweight/normal/overweight variety ACROSS dates (previously
        -- every chicken session was hardcoded 'normal').
        v_status := CASE v_week WHEN 1 THEN 'underweight' WHEN 2 THEN 'normal' WHEN 3 THEN 'normal' ELSE 'overweight' END;
        v_w := v_base_g * 100;

        INSERT INTO public.weigh_sessions (device_id, farm_id, batch_id, weighing_session_id, weigh_mode, animal_type, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, recorded_at)
          VALUES (v_device_id, v_farm_id, v_batch_id, v_session_id, 'batch', 'chicken', 100, v_w, 0, v_w, v_base_g::numeric,
                  v_status, v_arrival + (v_day || ' days')::interval);
      END IF;
    END LOOP;

    -- Feed history spanning the new weekly range (daily totals through
    -- the last weigh-in day), scaled by animal type.
    IF v_feed_id IS NOT NULL THEN
      FOR v_day IN 1..(v_num_weeks * 7) LOOP
        IF v_animal = 'pig' THEN
          v_total_g := (150 + ROUND(450.0 * v_day / (v_num_weeks * 7)))::bigint * 10;
        ELSE
          v_total_g := (20 + ROUND(60.0 * v_day / (v_num_weeks * 7)))::bigint * 100;
        END IF;
        INSERT INTO public.dispense_records (device_id, farm_id, feed_id, housing_id, batch_id, animal_type, grams_dispensed, status, triggered_by, dispensed_at)
          VALUES (v_device_id, v_farm_id, v_feed_id, v_housing_id, v_batch_id, v_animal, v_total_g, 'success', 'schedule',
                  v_arrival + (v_day || ' days')::interval + INTERVAL '8 hours');
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE 'Weekly-cadence reseed complete for Batch 1 (4 weeks) and Batch 2 (2 weeks) in all 4 remaining houses.';
END $$;

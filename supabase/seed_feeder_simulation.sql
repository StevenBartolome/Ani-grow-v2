-- =====================================================================
-- ONE-TIME DEV/TEST SEED — Feeder simulation (no real hardware needed)
-- =====================================================================
-- Run manually once, AFTER seed_bulk_housings_batches.sql AND
-- add_feed_dates.sql have both been applied.
--
-- Adds a demo AniFeed device + a default feed_schedule to each of the 4
-- remaining houses (Pig House B/C, Chicken House B/C) — these currently
-- only have an AniWeigh device, so AniFeedScreen has nothing to open for
-- them. This "simulates" a configured feeder: the schedule/dispense-time
-- editor and Manual Dispense in AniFeedScreen both already work against
-- a device with no real board behind it (they just write straight to the
-- database), so this is all that's needed to test the feeder flow without
-- hardware.
--
-- Also backfills date_started/expiry_date on the feeds rows created by
-- seed_bulk_housings_batches.sql (they predate those columns).
--
-- Safe to re-run — skips any housing that already has an anifeed device.
-- =====================================================================

DO $$
DECLARE
  v_housing        RECORD;
  v_feed_device_id UUID;
  v_letter         TEXT;
  v_animal_type    TEXT;
  v_feed_id        UUID;
BEGIN
  FOR v_housing IN
    SELECT id, farm_id, name, animal_type
    FROM public.housings
    WHERE name IN ('Pig House B', 'Pig House C', 'Chicken House B', 'Chicken House C')
  LOOP
    IF EXISTS (SELECT 1 FROM public.devices WHERE housing_id = v_housing.id AND type = 'anifeed') THEN
      CONTINUE;
    END IF;

    v_letter      := RIGHT(v_housing.name, 1);
    v_animal_type := v_housing.animal_type;

    INSERT INTO public.devices (farm_id, housing_id, name, type, serial_number, status, firmware_version, last_seen, unique_code, registered_at)
      VALUES (v_housing.farm_id, v_housing.id, 'AniFeed — ' || v_housing.name, 'anifeed',
              'DEMO-' || UPPER(LEFT(v_animal_type, 3)) || '-' || v_letter || '-FEED', 'online', '1.0.0', NOW(),
              'DEMO-' || UPPER(LEFT(v_animal_type, 3)) || '-' || v_letter || '-FEED', NOW())
      RETURNING id INTO v_feed_device_id;

    -- Find the demo feed already seeded for this housing (by
    -- seed_bulk_housings_batches.sql: "Grower Feed — House X" / "Broiler
    -- Feed — House X") so the new schedule has something real to point at.
    SELECT id INTO v_feed_id
      FROM public.feeds
     WHERE farm_id = v_housing.farm_id
       AND animal_type = v_animal_type
       AND name LIKE '%House ' || v_letter
     LIMIT 1;

    IF v_feed_id IS NOT NULL THEN
      INSERT INTO public.feed_schedules (device_id, farm_id, housing_id, feed_id, animal_type, times_per_day, grams_per_dispense, dispense_times)
        VALUES (v_feed_device_id, v_housing.farm_id, v_housing.id, v_feed_id, v_animal_type, 3,
                CASE WHEN v_animal_type = 'pig' THEN 500 ELSE 300 END,
                ARRAY['08:00', '12:00', '18:00']);
    END IF;
  END LOOP;

  -- Backfill: the demo feeds from seed_bulk_housings_batches.sql predate
  -- date_started/expiry_date. Give them sensible values instead of blanks.
  UPDATE public.feeds
     SET date_started = CURRENT_DATE - INTERVAL '20 days',
         expiry_date  = CURRENT_DATE + INTERVAL '40 days'
   WHERE date_started IS NULL
     AND name LIKE '% House %';

  RAISE NOTICE 'Feeder simulation seed complete.';
END $$;

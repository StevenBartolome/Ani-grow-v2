-- Weighing session envelope: tracks one "weigh this batch" event —
-- expected vs completed head count, so a session can't be saved
-- partially- or over-filled. Individual weight rows still live in
-- weigh_sessions (see columns added below); this just groups them.
CREATE TABLE IF NOT EXISTS public.weighing_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id            UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  housing_id         UUID NOT NULL REFERENCES public.housings(id) ON DELETE CASCADE,
  batch_id           UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  device_id          UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  animal_type        TEXT NOT NULL CHECK (animal_type IN ('chicken', 'pig')),
  farm_day           INTEGER,             -- snapshot of days-since-arrival at session start
  expected_quantity  INTEGER NOT NULL,    -- snapshot of batches.current_count at session start
  completed_quantity INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_weighing_sessions_batch_id ON public.weighing_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_weighing_sessions_farm_id  ON public.weighing_sessions(farm_id);

ALTER TABLE public.weighing_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weighing_sessions: farm members read own" ON public.weighing_sessions;
CREATE POLICY "weighing_sessions: farm members read own"
  ON public.weighing_sessions FOR SELECT TO authenticated
  USING (public.same_farm(farm_id));

DROP POLICY IF EXISTS "weighing_sessions: staff insert" ON public.weighing_sessions;
CREATE POLICY "weighing_sessions: staff insert"
  ON public.weighing_sessions FOR INSERT TO authenticated
  WITH CHECK (public.same_farm(farm_id) AND public.get_my_role() IN ('farm_admin','flockman','caretaker'));

DROP POLICY IF EXISTS "weighing_sessions: staff update own farm" ON public.weighing_sessions;
CREATE POLICY "weighing_sessions: staff update own farm"
  ON public.weighing_sessions FOR UPDATE TO authenticated
  USING (public.same_farm(farm_id) AND public.get_my_role() IN ('farm_admin','flockman','caretaker'));

DROP POLICY IF EXISTS "weighing_sessions: super_admin sees all" ON public.weighing_sessions;
CREATE POLICY "weighing_sessions: super_admin sees all"
  ON public.weighing_sessions FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Realtime, matching the pattern used for weigh_sessions/device_commands
-- elsewhere in this app — guarded so re-running this file is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'weighing_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weighing_sessions;
  END IF;
END $$;

-- Two additive, nullable columns on the existing weigh_sessions table —
-- IoT-inserted rows (via record_weigh_session RPC) leave both NULL,
-- completely unaffected. Manual entries from the new screens set them.
ALTER TABLE public.weigh_sessions ADD COLUMN IF NOT EXISTS weighing_session_id UUID REFERENCES public.weighing_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.weigh_sessions ADD COLUMN IF NOT EXISTS animal_label TEXT; -- e.g. "Pig 003", individual/pig mode only

CREATE INDEX IF NOT EXISTS idx_weigh_sessions_weighing_session_id ON public.weigh_sessions(weighing_session_id);

-- Closes the feed-side gap: dispense_records/feed_schedules only ever
-- linked to housing_id, so consumption couldn't be attributed to a
-- specific batch once a housing hosts more than one batch over time.
-- Nullable + additive — every existing row simply has batch_id = NULL
-- and is excluded from batch-scoped feed totals, which is correct
-- (we can't retroactively know which batch ate it).
ALTER TABLE public.dispense_records ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL;
ALTER TABLE public.feed_schedules   ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dispense_records_batch_id ON public.dispense_records(batch_id);

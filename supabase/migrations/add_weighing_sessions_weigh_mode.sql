-- Tracks whether a weighing session is being done bird-by-bird
-- ("individual") or crate/tray-by-tray ("batch") — chosen at the
-- mandatory pre-weighing gate for chicken runs (pigs are always
-- individual, no choice shown). Defaults to 'individual' so every
-- existing row (all pig, all pre-dating this column) stays correct
-- without needing a backfill.
ALTER TABLE public.weighing_sessions
  ADD COLUMN IF NOT EXISTS weigh_mode TEXT NOT NULL DEFAULT 'individual'
  CHECK (weigh_mode IN ('individual', 'batch'));

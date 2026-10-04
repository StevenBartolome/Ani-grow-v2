-- Live, ephemeral sampling-progress state for the AniWeigh live-scaling
-- display — updated by the board on every one of its 5 internal samples
-- (see report_sample_progress RPC + board1.ino's postSampleProgress()).
-- Nullable, no default — nothing depends on this having a value; it's
-- purely a UI nicety, never read by any classification/recording logic.
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS sample_progress JSONB;

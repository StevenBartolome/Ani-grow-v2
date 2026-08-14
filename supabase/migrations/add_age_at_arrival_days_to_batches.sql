-- Add age_at_arrival_days column to batches
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS age_at_arrival_days integer DEFAULT 0 NOT NULL;

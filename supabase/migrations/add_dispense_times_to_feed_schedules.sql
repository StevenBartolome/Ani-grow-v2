-- Add dispense_times TEXT[] column to public.feed_schedules
ALTER TABLE public.feed_schedules 
  ADD COLUMN IF NOT EXISTS dispense_times text[] DEFAULT ARRAY['08:00', '12:00', '18:00']::text[];

-- Tracks when a feed stock was put into use and when it expires — required
-- going forward at the app layer (ManageFeedsScreen.tsx validates both on
-- add/edit), left nullable here so existing rows aren't broken by this
-- migration alone.
ALTER TABLE public.feeds ADD COLUMN IF NOT EXISTS date_started DATE;
ALTER TABLE public.feeds ADD COLUMN IF NOT EXISTS expiry_date DATE;

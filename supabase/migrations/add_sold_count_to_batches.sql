-- Add sold_count column to public.batches table
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS sold_count integer DEFAULT 0 NOT NULL;

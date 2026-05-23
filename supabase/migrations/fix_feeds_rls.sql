-- ──────────────────────────────────────────────────────────────────────────────
-- Fix: Add missing RLS policies for the `feeds` table
-- The INSERT policy was missing, causing "new row violates row-level security
-- policy" when a mobile user tried to add a new feed.
--
-- Note: farm_admin_farms.admin_user_id is stored as TEXT, so we cast
--       auth.uid() to text when querying that table. The users table uses
--       UUID for its id column, so no cast is needed there.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Make sure RLS is enabled
ALTER TABLE public.feeds ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies first (idempotent re-run safety)
DROP POLICY IF EXISTS "feeds_select_policy"  ON public.feeds;
DROP POLICY IF EXISTS "feeds_insert_policy"  ON public.feeds;
DROP POLICY IF EXISTS "feeds_update_policy"  ON public.feeds;
DROP POLICY IF EXISTS "feeds_delete_policy"  ON public.feeds;

-- 3. SELECT
CREATE POLICY "feeds_select_policy"
ON public.feeds
FOR SELECT
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 4. INSERT  ← this was the missing policy causing the error
CREATE POLICY "feeds_insert_policy"
ON public.feeds
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 5. UPDATE
CREATE POLICY "feeds_update_policy"
ON public.feeds
FOR UPDATE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
)
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 6. DELETE
CREATE POLICY "feeds_delete_policy"
ON public.feeds
FOR DELETE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

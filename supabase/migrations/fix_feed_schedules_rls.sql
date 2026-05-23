-- ──────────────────────────────────────────────────────────────────────────────
-- Fix: Add missing RLS policies for the `feed_schedules` table
-- Lacking RLS policies on `feed_schedules` causes a 403 Forbidden error
-- when trying to set/update a feed brand or daily schedule.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Enable Row Level Security
ALTER TABLE public.feed_schedules ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies first
DROP POLICY IF EXISTS "feed_schedules_select_policy" ON public.feed_schedules;
DROP POLICY IF EXISTS "feed_schedules_insert_policy" ON public.feed_schedules;
DROP POLICY IF EXISTS "feed_schedules_update_policy" ON public.feed_schedules;
DROP POLICY IF EXISTS "feed_schedules_delete_policy" ON public.feed_schedules;

-- 3. SELECT policy
CREATE POLICY "feed_schedules_select_policy"
ON public.feed_schedules
FOR SELECT
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 4. INSERT policy
CREATE POLICY "feed_schedules_insert_policy"
ON public.feed_schedules
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 5. UPDATE policy
CREATE POLICY "feed_schedules_update_policy"
ON public.feed_schedules
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

-- 6. DELETE policy
CREATE POLICY "feed_schedules_delete_policy"
ON public.feed_schedules
FOR DELETE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

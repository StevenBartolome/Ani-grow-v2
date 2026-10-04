-- ──────────────────────────────────────────────────────────────────────────────
-- Fix: Add comprehensive, resilient RLS policies for `weighing_sessions` table
-- Resolves error 42501: "new row violates row-level security policy for table weighing_sessions"
-- 
-- Allows authenticated users belonging to the farm (via users.farm_id or 
-- farm_admin_farms) or super_admins or the session creator to insert, select,
-- and update weighing sessions.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Enable Row Level Security
ALTER TABLE public.weighing_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Drop all legacy/restrictive policies
DROP POLICY IF EXISTS "weighing_sessions: farm members read own"    ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions: staff insert"              ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions: staff update own farm"     ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions: super_admin sees all"      ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions_select_policy"              ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions_insert_policy"              ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions_update_policy"              ON public.weighing_sessions;
DROP POLICY IF EXISTS "weighing_sessions_delete_policy"              ON public.weighing_sessions;

-- 3. SELECT Policy
CREATE POLICY "weighing_sessions_select_policy"
ON public.weighing_sessions
FOR SELECT
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR created_by = auth.uid()
);

-- 4. INSERT Policy (Fixes 42501 RLS violation)
CREATE POLICY "weighing_sessions_insert_policy"
ON public.weighing_sessions
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR created_by = auth.uid()
);

-- 5. UPDATE Policy
CREATE POLICY "weighing_sessions_update_policy"
ON public.weighing_sessions
FOR UPDATE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR created_by = auth.uid()
)
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR created_by = auth.uid()
);

-- 6. DELETE Policy
CREATE POLICY "weighing_sessions_delete_policy"
ON public.weighing_sessions
FOR DELETE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR created_by = auth.uid()
);

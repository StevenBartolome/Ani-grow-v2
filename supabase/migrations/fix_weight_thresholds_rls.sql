-- ──────────────────────────────────────────────────────────────────────────────
-- Fix: Add missing RLS policies for the `weight_thresholds` table
-- Lacking RLS policies on `weight_thresholds` causes a 403 Forbidden error
-- when trying to set/update underweight or overweight configurations.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Enable Row Level Security
ALTER TABLE public.weight_thresholds ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies first
DROP POLICY IF EXISTS "weight_thresholds_select_policy" ON public.weight_thresholds;
DROP POLICY IF EXISTS "weight_thresholds_insert_policy" ON public.weight_thresholds;
DROP POLICY IF EXISTS "weight_thresholds_update_policy" ON public.weight_thresholds;
DROP POLICY IF EXISTS "weight_thresholds_delete_policy" ON public.weight_thresholds;

-- 3. SELECT policy
CREATE POLICY "weight_thresholds_select_policy"
ON public.weight_thresholds
FOR SELECT
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 4. INSERT policy
CREATE POLICY "weight_thresholds_insert_policy"
ON public.weight_thresholds
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 5. UPDATE policy
CREATE POLICY "weight_thresholds_update_policy"
ON public.weight_thresholds
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
CREATE POLICY "weight_thresholds_delete_policy"
ON public.weight_thresholds
FOR DELETE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

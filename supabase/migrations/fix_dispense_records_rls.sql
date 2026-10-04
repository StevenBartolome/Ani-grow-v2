-- ──────────────────────────────────────────────────────────────────────────────
-- Fix: Add comprehensive, resilient RLS policies for `dispense_records` table
-- Resolves error 42501: "new row violates row-level security policy for table dispense_records"
-- 
-- The previous policy `dispense_insert_field_staff` restricted insert to:
--   same_farm(farm_id) AND get_my_role() IN ('farm_admin', 'flockman', 'caretaker')
-- This blocked:
--   1. super_admin users (role is 'super_admin' and users.farm_id is null)
--   2. users whose farm assignment is in farm_admin_farms
--   3. users with permissions under other roles (e.g. veterinarian, all_around, flockman_assistants)
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Enable Row Level Security
ALTER TABLE public.dispense_records ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies (both legacy and previous names)
DROP POLICY IF EXISTS "dispense_insert_field_staff"       ON public.dispense_records;
DROP POLICY IF EXISTS "dispense_select_member"             ON public.dispense_records;
DROP POLICY IF EXISTS "dispense_select_super_admin"        ON public.dispense_records;
DROP POLICY IF EXISTS "dispense_records_select_policy"     ON public.dispense_records;
DROP POLICY IF EXISTS "dispense_records_insert_policy"     ON public.dispense_records;
DROP POLICY IF EXISTS "dispense_records_update_policy"     ON public.dispense_records;
DROP POLICY IF EXISTS "dispense_records_delete_policy"     ON public.dispense_records;

-- 3. SELECT policy: farm members, farm admins, super_admins, or device owners
CREATE POLICY "dispense_records_select_policy"
ON public.dispense_records
FOR SELECT
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR device_id IN (
        SELECT id FROM public.devices
        WHERE farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
           OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    )
);

-- 4. INSERT policy: allows manual dispense and device logs
CREATE POLICY "dispense_records_insert_policy"
ON public.dispense_records
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR device_id IN (
        SELECT id FROM public.devices
        WHERE farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
           OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    )
);

-- 5. UPDATE policy: allows status changes (e.g. cancelling in-progress dispenses)
CREATE POLICY "dispense_records_update_policy"
ON public.dispense_records
FOR UPDATE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 6. DELETE policy
CREATE POLICY "dispense_records_delete_policy"
ON public.dispense_records
FOR DELETE
TO authenticated
USING (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

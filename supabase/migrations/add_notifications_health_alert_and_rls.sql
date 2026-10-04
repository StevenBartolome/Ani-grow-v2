-- ──────────────────────────────────────────────────────────────────────────────
-- Wire up the `notifications` table for real use (mobile notifications
-- feature): it already existed with a read-side UI (NotificationScreen,
-- HomeScreen bell badge) but nothing ever INSERTed a row into it.
--
-- 1. Add a 'health_alert' category (mortality/illness alerts) — the existing
--    CHECK only allowed farm_registered/device_alert/weight_alert/feed_alert/
--    system/invite/ai_suggestion.
-- 2. Add RLS policies (same shape as fix_weight_thresholds_rls.sql) so an
--    authenticated farm member's client can actually INSERT/SELECT/UPDATE
--    farm-wide notification rows.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Extend the category CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
    CHECK (category = ANY (ARRAY[
        'farm_registered'::text, 'device_alert'::text, 'weight_alert'::text,
        'feed_alert'::text, 'health_alert'::text, 'system'::text,
        'invite'::text, 'ai_suggestion'::text
    ]));

-- 2. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies first (idempotent re-run)
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;

-- 4. SELECT — a user sees notifications addressed to them directly, or
--    farm-wide ones (user_id IS NULL) for any farm they belong to.
CREATE POLICY "notifications_select_policy"
ON public.notifications
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 5. INSERT — the mobile/web client creates farm-wide notification rows
--    (user_id left NULL) only for a farm the caller actually belongs to.
CREATE POLICY "notifications_insert_policy"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 6. UPDATE — marking as read (own notifications or farm-wide ones for a
--    farm the caller belongs to).
CREATE POLICY "notifications_update_policy"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
)
WITH CHECK (
    user_id = auth.uid()
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 7. DELETE — same scope, in case a future "clear notification" action is added.
CREATE POLICY "notifications_delete_policy"
ON public.notifications
FOR DELETE
TO authenticated
USING (
    user_id = auth.uid()
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

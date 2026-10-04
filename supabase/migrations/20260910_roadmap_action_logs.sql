-- ==============================================================================
-- Migration: Roadmap Action Logs & AI Feedback Loop Table
-- Description: Records user task completion, skips, and rejections with required
--              reasons for production roadmap tasks (default SOP & AI suggestions),
--              enabling AniBot to adapt recommendations based on outcome history.
-- ==============================================================================

-- 1. Create the roadmap_action_logs table
CREATE TABLE IF NOT EXISTS public.roadmap_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
    animal_type TEXT NOT NULL CHECK (animal_type = ANY (ARRAY['pig'::text, 'chicken'::text])),
    phase_id TEXT NOT NULL,
    action_text TEXT NOT NULL,
    day_tag TEXT,
    farm_day INTEGER,
    status TEXT NOT NULL CHECK (status = ANY (ARRAY['completed'::text, 'skipped'::text, 'rejected'::text])),
    is_ai_suggestion BOOLEAN NOT NULL DEFAULT false,
    reason_notes TEXT, -- Required when status is 'skipped' or 'rejected', optional for 'completed'
    recorded_by UUID REFERENCES public.users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_roadmap_action_log UNIQUE (farm_id, batch_id, phase_id, action_text, farm_day)
);

-- 2. Create indexes for fast lookups by batch, phase, and date
CREATE INDEX IF NOT EXISTS idx_roadmap_action_logs_batch 
ON public.roadmap_action_logs (farm_id, batch_id, farm_day);

CREATE INDEX IF NOT EXISTS idx_roadmap_action_logs_phase 
ON public.roadmap_action_logs (farm_id, phase_id, status);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.roadmap_action_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DROP POLICY IF EXISTS "Users can view roadmap action logs for accessible farms" ON public.roadmap_action_logs;
CREATE POLICY "Users can view roadmap action logs for accessible farms"
ON public.roadmap_action_logs
FOR SELECT
USING (
    farm_id IN (
        SELECT farm_id FROM public.users WHERE id = auth.uid()
        UNION
        SELECT id FROM public.farms WHERE admin_id = auth.uid()
        UNION
        SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text
    )
);

DROP POLICY IF EXISTS "Users can insert roadmap action logs for accessible farms" ON public.roadmap_action_logs;
CREATE POLICY "Users can insert roadmap action logs for accessible farms"
ON public.roadmap_action_logs
FOR INSERT
WITH CHECK (
    farm_id IN (
        SELECT farm_id FROM public.users WHERE id = auth.uid()
        UNION
        SELECT id FROM public.farms WHERE admin_id = auth.uid()
        UNION
        SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text
    )
);

DROP POLICY IF EXISTS "Users can update roadmap action logs for accessible farms" ON public.roadmap_action_logs;
CREATE POLICY "Users can update roadmap action logs for accessible farms"
ON public.roadmap_action_logs
FOR UPDATE
USING (
    farm_id IN (
        SELECT farm_id FROM public.users WHERE id = auth.uid()
        UNION
        SELECT id FROM public.farms WHERE admin_id = auth.uid()
        UNION
        SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text
    )
);

-- ==============================================================================
-- Migration: Farm AI Insights Table & Caching System
-- Description: Stores daily AniBot & AI insights per farm and category (health,
--              growth, feed, prediction, devices) with auto daily-refresh logic.
-- ==============================================================================

-- 1. Create the farm_ai_insights table
CREATE TABLE IF NOT EXISTS public.farm_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- 'health_report', 'growth_report', 'feed_report', 'prediction_report', 'weigh_device', 'feed_device', etc.
    sub_key TEXT DEFAULT '', -- optional sub-key (housing_id, device_id, etc.)
    insight_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title TEXT,
    headline TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    content TEXT NOT NULL,
    context_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_farm_ai_insights UNIQUE (farm_id, category, sub_key, insight_date)
);

-- 2. Create indexes for fast daily lookups
CREATE INDEX IF NOT EXISTS idx_farm_ai_insights_lookup 
ON public.farm_ai_insights (farm_id, category, sub_key, insight_date);

CREATE INDEX IF NOT EXISTS idx_farm_ai_insights_date 
ON public.farm_ai_insights (insight_date);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.farm_ai_insights ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DROP POLICY IF EXISTS "Users can view AI insights for accessible farms" ON public.farm_ai_insights;
CREATE POLICY "Users can view AI insights for accessible farms"
ON public.farm_ai_insights
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

DROP POLICY IF EXISTS "Users can insert AI insights for accessible farms" ON public.farm_ai_insights;
CREATE POLICY "Users can insert AI insights for accessible farms"
ON public.farm_ai_insights
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

DROP POLICY IF EXISTS "Users can update AI insights for accessible farms" ON public.farm_ai_insights;
CREATE POLICY "Users can update AI insights for accessible farms"
ON public.farm_ai_insights
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

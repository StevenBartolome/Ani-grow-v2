-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add animal_target_weights table for weekly growth benchmarks
-- Allows storing weekly target weights, underweight maximums, and overweight
-- minimums per animal type (chicken, pig) for automated scale threshold configuration.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.animal_target_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE,
    animal_type TEXT NOT NULL CHECK (animal_type IN ('pig', 'chicken')),
    week_number INT NOT NULL CHECK (week_number >= 1),
    target_weight_grams INT NOT NULL,
    underweight_max_grams INT NOT NULL,
    overweight_min_grams INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index for farm-specific customized standards
CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_target_weights_farm
    ON public.animal_target_weights (farm_id, animal_type, week_number)
    WHERE farm_id IS NOT NULL;

-- Unique index for global default template standards (farm_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_target_weights_global
    ON public.animal_target_weights (animal_type, week_number)
    WHERE farm_id IS NULL;

-- Enable Row Level Security
ALTER TABLE public.animal_target_weights ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "animal_target_weights_select_policy" ON public.animal_target_weights;
DROP POLICY IF EXISTS "animal_target_weights_insert_policy" ON public.animal_target_weights;
DROP POLICY IF EXISTS "animal_target_weights_update_policy" ON public.animal_target_weights;
DROP POLICY IF EXISTS "animal_target_weights_delete_policy" ON public.animal_target_weights;

-- 1. SELECT policy: authenticated users can read global defaults and their farm's records
CREATE POLICY "animal_target_weights_select_policy"
ON public.animal_target_weights
FOR SELECT
TO authenticated
USING (
    farm_id IS NULL
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 2. INSERT policy: authenticated users can insert records for their farm or global templates
CREATE POLICY "animal_target_weights_insert_policy"
ON public.animal_target_weights
FOR INSERT
TO authenticated
WITH CHECK (
    farm_id IS NULL
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 3. UPDATE policy
CREATE POLICY "animal_target_weights_update_policy"
ON public.animal_target_weights
FOR UPDATE
TO authenticated
USING (
    farm_id IS NULL
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
)
WITH CHECK (
    farm_id IS NULL
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- 4. DELETE policy
CREATE POLICY "animal_target_weights_delete_policy"
ON public.animal_target_weights
FOR DELETE
TO authenticated
USING (
    farm_id IS NULL
    OR farm_id IN (SELECT farm_id FROM public.users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_admin_farms WHERE admin_user_id = auth.uid()::text)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- SEED DATA: Global Industry Standard Growth Benchmarks (farm_id = NULL)
-- ──────────────────────────────────────────────────────────────────────────────

-- Broiler Chickens (Weeks 1 to 8, standard commercial broiler Ross 308 / Cobb 500 curve)
INSERT INTO public.animal_target_weights (farm_id, animal_type, week_number, target_weight_grams, underweight_max_grams, overweight_min_grams, notes)
VALUES
    (NULL, 'chicken', 1, 180,  150,  220,  'Day 1-7: Brooding phase'),
    (NULL, 'chicken', 2, 450,  380,  520,  'Day 8-14: Starter phase'),
    (NULL, 'chicken', 3, 900,  800,  1050, 'Day 15-21: Early grower phase'),
    (NULL, 'chicken', 4, 1500, 1350, 1700, 'Day 22-28: Active grower phase'),
    (NULL, 'chicken', 5, 2100, 1900, 2350, 'Day 29-35: Late grower phase'),
    (NULL, 'chicken', 6, 2700, 2450, 3000, 'Day 36-42: Finisher phase'),
    (NULL, 'chicken', 7, 3300, 3000, 3650, 'Day 43-49: Heavy finisher phase'),
    (NULL, 'chicken', 8, 3800, 3450, 4200, 'Day 50-56: Harvest maturity')
ON CONFLICT DO NOTHING;

-- Swine / Pigs (Weeks 1 to 24, Nursery -> Grower -> Finisher market curve)
INSERT INTO public.animal_target_weights (farm_id, animal_type, week_number, target_weight_grams, underweight_max_grams, overweight_min_grams, notes)
VALUES
    (NULL, 'pig', 1,  1500,   1200,   1800,   'Week 1 (1.5 kg): Farrowing / Colostrum nursing'),
    (NULL, 'pig', 2,  3000,   2400,   3600,   'Week 2 (3.0 kg): Early nursing / Creep intro'),
    (NULL, 'pig', 3,  5000,   4000,   6000,   'Week 3 (5.0 kg): Creep booster feeding'),
    (NULL, 'pig', 4,  7500,   6000,   9000,   'Week 4 (7.5 kg): Weaning transition'),
    (NULL, 'pig', 5,  10500,  8500,   12500,  'Week 5 (10.5 kg): Nursery starter phase'),
    (NULL, 'pig', 6,  14000,  11500,  16500,  'Week 6 (14.0 kg): Nursery phase'),
    (NULL, 'pig', 7,  18000,  15000,  21000,  'Week 7 (18.0 kg): Late nursery phase'),
    (NULL, 'pig', 8,  22500,  19000,  26000,  'Week 8 (22.5 kg): Grower transition'),
    (NULL, 'pig', 9,  27500,  23500,  31500,  'Week 9 (27.5 kg): Grower stage 1'),
    (NULL, 'pig', 10, 33000,  28500,  37500,  'Week 10 (33.0 kg): Grower stage 1'),
    (NULL, 'pig', 11, 39000,  34000,  44000,  'Week 11 (39.0 kg): Rapid bone & muscle development'),
    (NULL, 'pig', 12, 45500,  40000,  51000,  'Week 12 (45.5 kg): Grower stage 2'),
    (NULL, 'pig', 13, 52000,  46000,  58000,  'Week 13 (52.0 kg): Grower stage 2'),
    (NULL, 'pig', 14, 59000,  52500,  65500,  'Week 14 (59.0 kg): Mid-grower'),
    (NULL, 'pig', 15, 66000,  59000,  73000,  'Week 15 (66.0 kg): Finisher transition'),
    (NULL, 'pig', 16, 73000,  65500,  80500,  'Week 16 (73.0 kg): Finisher stage 1'),
    (NULL, 'pig', 17, 80500,  72500,  88500,  'Week 17 (80.5 kg): Finisher stage 1'),
    (NULL, 'pig', 18, 88000,  79500,  96500,  'Week 18 (88.0 kg): Rapid flesh marbling'),
    (NULL, 'pig', 19, 95500,  86500,  104500, 'Week 19 (95.5 kg): Late finisher'),
    (NULL, 'pig', 20, 103000, 93500,  112500, 'Week 20 (103.0 kg): Heavy finisher'),
    (NULL, 'pig', 21, 110500, 100500, 120500, 'Week 21 (110.5 kg): Market readiness'),
    (NULL, 'pig', 22, 118000, 107500, 128500, 'Week 22 (118.0 kg): Prime market hog'),
    (NULL, 'pig', 23, 125000, 114000, 136000, 'Week 23 (125.0 kg): Extended market harvest'),
    (NULL, 'pig', 24, 132000, 120000, 144000, 'Week 24 (132.0 kg): Heavy market harvest')
ON CONFLICT DO NOTHING;

import { supabase } from '@/lib/supabase';

export type AnimalType = 'pig' | 'chicken';

export interface GrowthStandard {
    id?: string;
    farm_id?: string | null;
    animal_type: AnimalType;
    week_number: number;
    target_weight_grams: number;
    underweight_max_grams: number;
    overweight_min_grams: number;
    notes?: string | null;
}

// ─── Default Industry Standards (Ross 308/Cobb 500 & Commercial Swine) ────────

export const DEFAULT_CHICKEN_STANDARDS: GrowthStandard[] = [
    { animal_type: 'chicken', week_number: 1, target_weight_grams: 180,  underweight_max_grams: 150,  overweight_min_grams: 220,  notes: 'Day 1-7: Brooding phase' },
    { animal_type: 'chicken', week_number: 2, target_weight_grams: 450,  underweight_max_grams: 380,  overweight_min_grams: 520,  notes: 'Day 8-14: Starter phase' },
    { animal_type: 'chicken', week_number: 3, target_weight_grams: 900,  underweight_max_grams: 800,  overweight_min_grams: 1050, notes: 'Day 15-21: Early grower phase' },
    { animal_type: 'chicken', week_number: 4, target_weight_grams: 1500, underweight_max_grams: 1350, overweight_min_grams: 1700, notes: 'Day 22-28: Active grower phase' },
    { animal_type: 'chicken', week_number: 5, target_weight_grams: 2100, underweight_max_grams: 1900, overweight_min_grams: 2350, notes: 'Day 29-35: Late grower phase' },
    { animal_type: 'chicken', week_number: 6, target_weight_grams: 2700, underweight_max_grams: 2450, overweight_min_grams: 3000, notes: 'Day 36-42: Finisher phase' },
    { animal_type: 'chicken', week_number: 7, target_weight_grams: 3300, underweight_max_grams: 3000, overweight_min_grams: 3650, notes: 'Day 43-49: Heavy finisher phase' },
    { animal_type: 'chicken', week_number: 8, target_weight_grams: 3800, underweight_max_grams: 3450, overweight_min_grams: 4200, notes: 'Day 50-56: Harvest maturity' },
];

export const DEFAULT_PIG_STANDARDS: GrowthStandard[] = [
    { animal_type: 'pig', week_number: 1,  target_weight_grams: 1500,   underweight_max_grams: 1200,   overweight_min_grams: 1800,   notes: 'Week 1 (1.5 kg): Farrowing / Colostrum nursing' },
    { animal_type: 'pig', week_number: 2,  target_weight_grams: 3000,   underweight_max_grams: 2400,   overweight_min_grams: 3600,   notes: 'Week 2 (3.0 kg): Early nursing / Creep intro' },
    { animal_type: 'pig', week_number: 3,  target_weight_grams: 5000,   underweight_max_grams: 4000,   overweight_min_grams: 6000,   notes: 'Week 3 (5.0 kg): Creep booster feeding' },
    { animal_type: 'pig', week_number: 4,  target_weight_grams: 7500,   underweight_max_grams: 6000,   overweight_min_grams: 9000,   notes: 'Week 4 (7.5 kg): Weaning transition' },
    { animal_type: 'pig', week_number: 5,  target_weight_grams: 10500,  underweight_max_grams: 8500,   overweight_min_grams: 12500,  notes: 'Week 5 (10.5 kg): Nursery starter phase' },
    { animal_type: 'pig', week_number: 6,  target_weight_grams: 14000,  underweight_max_grams: 11500,  overweight_min_grams: 16500,  notes: 'Week 6 (14.0 kg): Nursery phase' },
    { animal_type: 'pig', week_number: 7,  target_weight_grams: 18000,  underweight_max_grams: 15000,  overweight_min_grams: 21000,  notes: 'Week 7 (18.0 kg): Late nursery phase' },
    { animal_type: 'pig', week_number: 8,  target_weight_grams: 22500,  underweight_max_grams: 19000,  overweight_min_grams: 26000,  notes: 'Week 8 (22.5 kg): Grower transition' },
    { animal_type: 'pig', week_number: 9,  target_weight_grams: 27500,  underweight_max_grams: 23500,  overweight_min_grams: 31500,  notes: 'Week 9 (27.5 kg): Grower stage 1' },
    { animal_type: 'pig', week_number: 10, target_weight_grams: 33000,  underweight_max_grams: 28500,  overweight_min_grams: 37500,  notes: 'Week 10 (33.0 kg): Grower stage 1' },
    { animal_type: 'pig', week_number: 11, target_weight_grams: 39000,  underweight_max_grams: 34000,  overweight_min_grams: 44000,  notes: 'Week 11 (39.0 kg): Rapid bone & muscle growth' },
    { animal_type: 'pig', week_number: 12, target_weight_grams: 45500,  underweight_max_grams: 40000,  overweight_min_grams: 51000,  notes: 'Week 12 (45.5 kg): Grower stage 2' },
    { animal_type: 'pig', week_number: 13, target_weight_grams: 52000,  underweight_max_grams: 46000,  overweight_min_grams: 58000,  notes: 'Week 13 (52.0 kg): Grower stage 2' },
    { animal_type: 'pig', week_number: 14, target_weight_grams: 59000,  underweight_max_grams: 52500,  overweight_min_grams: 65500,  notes: 'Week 14 (59.0 kg): Mid-grower' },
    { animal_type: 'pig', week_number: 15, target_weight_grams: 66000,  underweight_max_grams: 59000,  overweight_min_grams: 73000,  notes: 'Week 15 (66.0 kg): Finisher transition' },
    { animal_type: 'pig', week_number: 16, target_weight_grams: 73000,  underweight_max_grams: 65500,  overweight_min_grams: 80500,  notes: 'Week 16 (73.0 kg): Finisher stage 1' },
    { animal_type: 'pig', week_number: 17, target_weight_grams: 80500,  underweight_max_grams: 72500,  overweight_min_grams: 88500,  notes: 'Week 17 (80.5 kg): Finisher stage 1' },
    { animal_type: 'pig', week_number: 18, target_weight_grams: 88000,  underweight_max_grams: 79500,  overweight_min_grams: 96500,  notes: 'Week 18 (88.0 kg): Rapid flesh marbling' },
    { animal_type: 'pig', week_number: 19, target_weight_grams: 95500,  underweight_max_grams: 86500,  overweight_min_grams: 104500, notes: 'Week 19 (95.5 kg): Late finisher' },
    { animal_type: 'pig', week_number: 20, target_weight_grams: 103000, underweight_max_grams: 93500,  overweight_min_grams: 112500, notes: 'Week 20 (103.0 kg): Heavy finisher' },
    { animal_type: 'pig', week_number: 21, target_weight_grams: 110500, underweight_max_grams: 100500, overweight_min_grams: 120500, notes: 'Week 21 (110.5 kg): Market readiness' },
    { animal_type: 'pig', week_number: 22, target_weight_grams: 118000, underweight_max_grams: 107500, overweight_min_grams: 128500, notes: 'Week 22 (118.0 kg): Prime market hog' },
    { animal_type: 'pig', week_number: 23, target_weight_grams: 125000, underweight_max_grams: 114000, overweight_min_grams: 136000, notes: 'Week 23 (125.0 kg): Extended market harvest' },
    { animal_type: 'pig', week_number: 24, target_weight_grams: 132000, underweight_max_grams: 120000, overweight_min_grams: 144000, notes: 'Week 24 (132.0 kg): Heavy market harvest' },
];

export function getDefaultStandards(animalType: AnimalType): GrowthStandard[] {
    return animalType === 'pig' ? [...DEFAULT_PIG_STANDARDS] : [...DEFAULT_CHICKEN_STANDARDS];
}

/**
 * Resolves the growth standard for a specific rearing week.
 * Looks in provided custom list first; falls back to industry defaults.
 */
export function getStandardForWeek(
    animalType: AnimalType,
    weekNumber: number,
    customList?: GrowthStandard[]
): GrowthStandard {
    const list = customList && customList.length > 0 ? customList : getDefaultStandards(animalType);
    const found = list.find(s => s.week_number === weekNumber);
    if (found) return found;

    // If beyond listed weeks, take the last week entry
    if (list.length > 0) {
        const sorted = [...list].sort((a, b) => a.week_number - b.week_number);
        if (weekNumber > sorted[sorted.length - 1].week_number) {
            return sorted[sorted.length - 1];
        }
        if (weekNumber < sorted[0].week_number) {
            return sorted[0];
        }
    }

    // Ultimate fallback
    return animalType === 'pig'
        ? { animal_type: 'pig', week_number: weekNumber, target_weight_grams: 30000, underweight_max_grams: 25000, overweight_min_grams: 35000 }
        : { animal_type: 'chicken', week_number: weekNumber, target_weight_grams: 1500, underweight_max_grams: 1350, overweight_min_grams: 1700 };
}

/**
 * Format weight in grams into human readable string (kg or g)
 */
export function formatWeightDisplay(grams: number, animalType: AnimalType, unit?: 'kg' | 'g'): string {
    const effectiveUnit = unit || (animalType === 'pig' ? 'kg' : (grams >= 1000 ? 'kg' : 'g'));
    if (effectiveUnit === 'kg') {
        return `${(grams / 1000).toFixed(2)} kg`;
    }
    return `${Math.round(grams)} g`;
}

/**
 * Fetches target weights for a farm and animal type.
 * Gracefully falls back to default industry standards if table not migrated or empty.
 */
export async function fetchTargetWeights(
    farmId?: string | null,
    animalType: AnimalType = 'pig'
): Promise<GrowthStandard[]> {
    try {
        let query = supabase
            .from('animal_target_weights')
            .select('*')
            .eq('animal_type', animalType)
            .order('week_number', { ascending: true });

        if (farmId) {
            // Check farm-specific standards or global templates (farm_id is null)
            query = query.or(`farm_id.eq.${farmId},farm_id.is.null`);
        } else {
            query = query.is('farm_id', null);
        }

        const { data, error } = await query;
        if (error) {
            console.warn('[fetchTargetWeights] Database query notice (using defaults):', error.message);
            return getDefaultStandards(animalType);
        }

        if (!data || data.length === 0) {
            return getDefaultStandards(animalType);
        }

        // Prefer farm-specific records over global templates for the same week_number
        const weekMap = new Map<number, GrowthStandard>();
        // First add globals
        data.filter((r: any) => !r.farm_id).forEach((r: any) => weekMap.set(r.week_number, r));
        // Then override with farm-specific
        if (farmId) {
            data.filter((r: any) => r.farm_id === farmId).forEach((r: any) => weekMap.set(r.week_number, r));
        }

        const merged = Array.from(weekMap.values()).sort((a, b) => a.week_number - b.week_number);
        return merged.length > 0 ? merged : getDefaultStandards(animalType);
    } catch (err: any) {
        console.warn('[fetchTargetWeights] Exception caught, falling back to defaults:', err?.message || err);
        return getDefaultStandards(animalType);
    }
}

/**
 * Upsert target weight record for a farm
 */
export async function saveTargetWeight(
    standard: GrowthStandard,
    farmId?: string | null
): Promise<{ success: boolean; data?: GrowthStandard; error?: string }> {
    try {
        const payload = {
            farm_id: farmId || null,
            animal_type: standard.animal_type,
            week_number: standard.week_number,
            target_weight_grams: Math.round(standard.target_weight_grams),
            underweight_max_grams: Math.round(standard.underweight_max_grams),
            overweight_min_grams: Math.round(standard.overweight_min_grams),
            notes: standard.notes || null,
            updated_at: new Date().toISOString(),
        };

        let result;
        if (standard.id) {
            result = await supabase
                .from('animal_target_weights')
                .update(payload)
                .eq('id', standard.id)
                .select('*')
                .single();
        } else {
            result = await supabase
                .from('animal_target_weights')
                .upsert(payload, { onConflict: farmId ? 'farm_id,animal_type,week_number' : 'animal_type,week_number' })
                .select('*')
                .single();
        }

        if (result.error) {
            return { success: false, error: result.error.message };
        }

        return { success: true, data: result.data as GrowthStandard };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to save target weight' };
    }
}

/**
 * Delete a customized target weight record
 */
export async function deleteTargetWeight(id: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('animal_target_weights')
            .delete()
            .eq('id', id);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Synchronize farm target weights to active devices when standards are updated
 */
export async function syncFarmTargetWeightsToDevices(
    farmId: string,
    animalType: AnimalType
) {
    if (!farmId) return;
    try {
        const { data: devices } = await supabase
            .from('devices')
            .select('id, unique_code, housing_id')
            .eq('farm_id', farmId)
            .eq('type', 'aniweigh');

        if (!devices || devices.length === 0) return;

        const farmStds = await fetchTargetWeights(farmId, animalType);

        for (const dev of devices) {
            const { data: session } = await supabase
                .from('weighing_sessions')
                .select('batch_id, animal_type')
                .eq('device_id', dev.id)
                .eq('status', 'in_progress')
                .maybeSingle();

            let batchId = session?.batch_id ?? null;
            let resolvedWeek = 1;

            if (batchId) {
                const { data: batch } = await supabase
                    .from('batches')
                    .select('arrival_date, age_at_arrival_days')
                    .eq('id', batchId)
                    .maybeSingle();

                if (batch?.arrival_date) {
                    const arr = new Date(batch.arrival_date);
                    const now = new Date();
                    arr.setHours(0, 0, 0, 0);
                    now.setHours(0, 0, 0, 0);
                    const diffDays = Math.floor((now.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
                    const ageDays = Math.max(0, diffDays) + (batch.age_at_arrival_days || 0);
                    resolvedWeek = Math.max(1, Math.ceil(ageDays / 7));
                }
            }

            const weekStd = getStandardForWeek(animalType, resolvedWeek, farmStds);
            const finalUnder = Math.round(weekStd.underweight_max_grams);
            const finalOver = Math.round(weekStd.overweight_min_grams);

            const dbAnimalKey = animalType.toLowerCase();
            const threshPayload = {
                device_id: dev.id,
                farm_id: farmId,
                animal_type: dbAnimalKey,
                underweight_max_grams: finalUnder,
                normal_min_grams: finalUnder + 1,
                normal_max_grams: finalOver - 1,
                overweight_min_grams: finalOver,
                updated_at: new Date().toISOString(),
            };

            const { data: existing } = await supabase
                .from('weight_thresholds')
                .select('id')
                .eq('device_id', dev.id)
                .eq('animal_type', dbAnimalKey)
                .maybeSingle();

            if (existing?.id) {
                await supabase.from('weight_thresholds').update(threshPayload).eq('id', existing.id);
            } else {
                await supabase.from('weight_thresholds').insert(threshPayload);
            }
        }
    } catch (err) {
        console.warn('[syncFarmTargetWeightsToDevices] error:', err);
    }
}


import { getStandardForWeek } from '@/constants/growthStandards';

export interface BatchHarvestInput {
    id: string;
    name: string;
    animal_type?: 'pig' | 'chicken' | string;
    housing_id?: string;
    arrival_date?: string | null;
    age_at_arrival_days?: number | null;
    harvest_target_kg?: number | null;
    estimated_count?: number;
    current_count?: number;
    status?: string;
    notes?: string | null;
}

export interface WeighSessionInput {
    id: string;
    batch_id?: string | null;
    net_weight_grams?: number | null;
    recorded_at?: string;
    status?: string;
    weighing_session_id?: string | null;
}

export interface WeighingSessionEnvelopeInput {
    id: string;
    batch_id?: string | null;
    housing_id?: string | null;
    farm_day?: number | null;
    expected_quantity?: number | null;
    completed_quantity?: number | null;
    status?: string;
    created_at?: string;
    completed_at?: string | null;
}

export interface BatchHarvestPrediction {
    batchId: string;
    batchName: string;
    animalType: 'pig' | 'chicken';
    currentCount: number;
    housingId: string;
    housingName: string;
    targetWeightKg: number;
    currentAvgWeightKg: number | null;
    dailyGainKg: number;
    daysToHarvest: number;
    harvestDateStr: string; // YYYY-MM-DD
    isTargetMet: boolean;
    progressPct: number;
    adgGrams: number;
}

export function formatLocalDateKey(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseDateKey(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
        return formatLocalDateKey(d);
    } catch (_) {
        return String(dateStr).slice(0, 10);
    }
}

export function parseLocalDate(dateInput?: string | Date | null): Date {
    if (!dateInput) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return now;
    }
    if (dateInput instanceof Date) {
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }
    const str = String(dateInput).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        return new Date(year, month, day);
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return now;
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Computes canonical harvest readiness and prediction metrics for a batch.
 * Guarantees 100% 1:1 mathematical alignment across Calendar, Dashboard, and Prediction screens.
 */
export function computeBatchHarvestPrediction(
    batch: BatchHarvestInput,
    weighSessions: WeighSessionInput[],
    envelopes: WeighingSessionEnvelopeInput[] = [],
    housingMap?: Map<string, any>
): BatchHarvestPrediction {
    const isPig = batch.animal_type === 'pig';
    const animalType: 'pig' | 'chicken' = isPig ? 'pig' : 'chicken';
    const defaultTarget = isPig ? 95 : 2.2;
    const targetWeightKg = batch.harvest_target_kg != null && Number(batch.harvest_target_kg) > 0
        ? Number(batch.harvest_target_kg)
        : defaultTarget;

    const hVal = batch.housing_id ? housingMap?.get(batch.housing_id) : undefined;
    const housingName = typeof hVal === 'string' ? hVal : (hVal?.name || 'Unassigned Facility');

    // 1. Filter completed weighing session envelopes (1:1 with Web PredictionReportScreen)
    const activeEnvelopes = envelopes
        .filter(env => {
            const isMatchBatch = !env.batch_id || env.batch_id === batch.id;
            const isValidDate = !!env.created_at;
            const hasAnimals = (env.completed_quantity ?? 0) > 0;
            const notCancelled = env.status !== 'in_progress' && env.status !== 'cancelled';
            return isMatchBatch && isValidDate && hasAnimals && notCancelled;
        })
        .sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());

    let sessionStatsList: Array<{
        id: string;
        farmDay: number | null;
        date: string;
        avgWeightKg: number;
        count: number;
    }> = [];

    if (activeEnvelopes.length > 0) {
        sessionStatsList = activeEnvelopes.map(env => {
            const envDateKey = parseDateKey(env.created_at);
            const matching = weighSessions.filter(s => {
                if (s.batch_id !== batch.id || s.status === 'invalid') return false;
                if (s.weighing_session_id && s.weighing_session_id === env.id) return true;
                const recordDateKey = parseDateKey(s.recorded_at);
                return recordDateKey === envDateKey;
            });

            const totalGrams = matching.reduce((sum, s) => sum + (s.net_weight_grams || 0), 0);
            const count = matching.length;
            const avgWeightKg = count > 0 ? (totalGrams / count) / 1000 : 0;

            return {
                id: env.id,
                farmDay: env.farm_day ?? null,
                date: env.created_at || '',
                avgWeightKg,
                count,
            };
        }).filter(s => s.count > 0 && s.avgWeightKg > 0);
    } else {
        // Fallback: aggregate valid weigh logs by calendar day
        const dateMap = new Map<string, WeighSessionInput[]>();
        weighSessions
            .filter(s => s.batch_id === batch.id && s.status !== 'invalid' && !!s.recorded_at)
            .sort((a, b) => new Date(a.recorded_at || '').getTime() - new Date(b.recorded_at || '').getTime())
            .forEach(s => {
                const dk = parseDateKey(s.recorded_at);
                if (!dateMap.has(dk)) dateMap.set(dk, []);
                dateMap.get(dk)!.push(s);
            });

        sessionStatsList = Array.from(dateMap.entries()).map(([dk, logs]) => {
            const totalGrams = logs.reduce((sum, s) => sum + (s.net_weight_grams || 0), 0);
            const count = logs.length;
            const avgWeightKg = count > 0 ? (totalGrams / count) / 1000 : 0;
            return {
                id: dk,
                farmDay: null,
                date: dk,
                avgWeightKg,
                count,
            };
        }).filter(s => s.count > 0 && s.avgWeightKg > 0);
    }

    // Latest session & observed average weight
    const latestSession = sessionStatsList.length > 0
        ? sessionStatsList[sessionStatsList.length - 1]
        : null;
    const latestAvgWeightKg = latestSession && latestSession.avgWeightKg > 0
        ? latestSession.avgWeightKg
        : null;

    // 2. Standard Breed Benchmark Fallback
    let currentAgeDays: number;
    if (batch.arrival_date) {
        const arr = new Date(batch.arrival_date);
        const now = new Date();
        arr.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diffDays = Math.max(0, Math.floor((now.getTime() - arr.getTime()) / 86400000));
        currentAgeDays = diffDays + (batch.age_at_arrival_days || 0);
    } else {
        currentAgeDays = batch.age_at_arrival_days || (animalType === 'pig' ? 60 : 20);
    }

    const currentWeekNumber = Math.max(1, Math.min(24, Math.ceil(Math.max(1, currentAgeDays) / 7)));
    const std = getStandardForWeek(animalType, currentWeekNumber);
    const benchmarkWeightKg = (std.target_weight_grams || 0) / 1000;
    const nextStd = getStandardForWeek(animalType, Math.min(24, currentWeekNumber + 1));
    const weeklyDiffGrams = (nextStd.target_weight_grams || 0) - (std.target_weight_grams || 0);
    const benchmarkAdgKg = weeklyDiffGrams > 0
        ? (weeklyDiffGrams / 7 / 1000)
        : (animalType === 'pig' ? 0.75 : 0.065);

    // 3. Compute Robust Average Daily Gain (ADG)
    let dailyGainKg: number | null = null;
    if (latestAvgWeightKg !== null && sessionStatsList.length >= 2) {
        const first = sessionStatsList[0];
        const latest = sessionStatsList[sessionStatsList.length - 1];

        let totalDays = 1;
        if (first.farmDay != null && latest.farmDay != null && latest.farmDay > first.farmDay) {
            totalDays = latest.farmDay - first.farmDay;
        } else {
            try {
                const d1 = new Date(first.date);
                const d2 = new Date(latest.date);
                const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
                if (diff > 0) totalDays = diff;
            } catch (_) {}
        }

        const totalGainKg = latest.avgWeightKg - first.avgWeightKg;
        const rawAdgKg = totalDays > 0 ? totalGainKg / totalDays : 0;
        const minRealistic = animalType === 'pig' ? 0.20 : 0.020;
        const maxRealistic = animalType === 'pig' ? 1.50 : 0.150;

        if (totalDays >= 2 && rawAdgKg >= minRealistic && rawAdgKg <= maxRealistic) {
            dailyGainKg = rawAdgKg;
        }
    }

    const effectiveAdgKg = dailyGainKg !== null && dailyGainKg > 0
        ? dailyGainKg
        : benchmarkAdgKg;

    const effectiveWeightKg = latestAvgWeightKg !== null && latestAvgWeightKg > 0
        ? latestAvgWeightKg
        : benchmarkWeightKg;

    // 4. Compute Remaining Weight and Harvest Timing
    const readySession = sessionStatsList.find(s => s.avgWeightKg >= targetWeightKg);

    let daysToHarvest: number;
    let harvestDateStr: string;
    let isTargetMet: boolean;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (readySession) {
        harvestDateStr = parseDateKey(readySession.date);
        daysToHarvest = 0;
        isTargetMet = true;
    } else {
        let baseDateStr: string;
        let baseWeightKg: number;

        if (latestSession && latestSession.avgWeightKg > 0) {
            baseDateStr = parseDateKey(latestSession.date);
            baseWeightKg = latestSession.avgWeightKg;
        } else if (batch.arrival_date) {
            baseDateStr = parseDateKey(batch.arrival_date);
            baseWeightKg = benchmarkWeightKg;
        } else {
            baseDateStr = formatLocalDateKey(today);
            baseWeightKg = benchmarkWeightKg;
        }

        const remainingKg = Math.max(0, targetWeightKg - baseWeightKg);

        if (remainingKg <= 0) {
            harvestDateStr = baseDateStr;
            daysToHarvest = 0;
            isTargetMet = true;
        } else {
            const effectiveGain = Math.max(animalType === 'pig' ? 0.35 : 0.03, effectiveAdgKg);
            const daysNeededFromBase = Math.ceil(remainingKg / effectiveGain);
            const baseDate = parseLocalDate(baseDateStr);
            const projectedDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + daysNeededFromBase);
            harvestDateStr = formatLocalDateKey(projectedDate);

            const targetD = parseLocalDate(harvestDateStr);
            targetD.setHours(0, 0, 0, 0);
            const diffDays = Math.round((targetD.getTime() - today.getTime()) / 86400000);

            if (diffDays <= 0) {
                daysToHarvest = 0;
                isTargetMet = true;
            } else {
                daysToHarvest = diffDays;
                isTargetMet = false;
            }
        }
    }

    const progressPct = isTargetMet
        ? 100
        : Math.min(99, Math.round((effectiveWeightKg / targetWeightKg) * 100));

    return {
        batchId: batch.id,
        batchName: batch.name || 'Unnamed Batch',
        animalType,
        currentCount: batch.current_count ?? batch.estimated_count ?? 0,
        housingId: batch.housing_id || '',
        housingName,
        targetWeightKg: parseFloat(targetWeightKg.toFixed(2)),
        currentAvgWeightKg: latestAvgWeightKg !== null ? parseFloat(latestAvgWeightKg.toFixed(2)) : null,
        dailyGainKg: parseFloat(effectiveAdgKg.toFixed(3)),
        daysToHarvest,
        harvestDateStr,
        isTargetMet,
        progressPct,
        adgGrams: Math.round(effectiveAdgKg * 1000),
    };
}

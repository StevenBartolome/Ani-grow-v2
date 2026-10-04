import { supabase } from './supabase';

export interface ConnectedDataResult {
    canDelete: boolean;
    reasons: string[];
}

/**
 * Checks whether a batch has any connected records or historical data that
 * prevent it from being deleted.
 */
export async function checkBatchConnectedData(
    batchId: string,
    batchMeta?: {
        soldCount?: number;
        deceasedCount?: number;
        estimatedCount?: number;
        currentCount?: number;
    }
): Promise<ConnectedDataResult> {
    if (!batchId) {
        return { canDelete: false, reasons: ['Invalid batch identifier.'] };
    }

    try {
        const [
            weighingRes,
            weighRes,
            healthRes,
            dispenseRes,
            vaccRecRes,
            vaccSchedRes,
            feedSchedRes
        ] = await Promise.all([
            supabase.from('weighing_sessions').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
            supabase.from('weigh_sessions').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
            supabase.from('health_records').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).is('deleted_at', null),
            supabase.from('dispense_records').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
            supabase.from('vaccination_records').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
            supabase.from('vaccine_schedules').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
            supabase.from('feed_schedules').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
        ]);

        const weighingCount = (weighingRes.count ?? 0) + (weighRes.count ?? 0);
        const healthCount   = healthRes.count ?? 0;
        const dispenseCount = dispenseRes.count ?? 0;
        const vaccCount     = (vaccRecRes.count ?? 0) + (vaccSchedRes.count ?? 0);
        const feedSchedCount = feedSchedRes.count ?? 0;

        const reasons: string[] = [];

        if (weighingCount > 0) {
            reasons.push(`${weighingCount} weighing session${weighingCount > 1 ? 's' : ''}`);
        }
        if (healthCount > 0) {
            reasons.push(`${healthCount} health/mortality log${healthCount > 1 ? 's' : ''}`);
        }
        if (dispenseCount > 0) {
            reasons.push(`${dispenseCount} feed dispense record${dispenseCount > 1 ? 's' : ''}`);
        }
        if (vaccCount > 0) {
            reasons.push(`${vaccCount} vaccination record${vaccCount > 1 ? 's' : ''}`);
        }
        if (feedSchedCount > 0) {
            reasons.push(`${feedSchedCount} feed schedule${feedSchedCount > 1 ? 's' : ''}`);
        }

        // Check if animals were deducted or sold
        if (batchMeta) {
            if ((batchMeta.soldCount ?? 0) > 0) {
                reasons.push(`${batchMeta.soldCount} recorded sold/harvested animal${(batchMeta.soldCount ?? 0) > 1 ? 's' : ''}`);
            }
        }

        return {
            canDelete: reasons.length === 0,
            reasons,
        };
    } catch (err) {
        console.error('[checkBatchConnectedData] Error checking dependencies:', err);
        return {
            canDelete: false,
            reasons: ['Could not verify batch dependencies due to a network or server error.'],
        };
    }
}

/**
 * Checks whether a housing has any connected batches, devices, schedules, or logs
 * that prevent it from being deleted.
 */
export async function checkHousingConnectedData(housingId: string): Promise<ConnectedDataResult> {
    if (!housingId) {
        return { canDelete: false, reasons: ['Invalid housing identifier.'] };
    }

    try {
        const [
            batchesRes,
            devicesRes,
            weighingRes,
            healthRes,
            dispenseRes,
            feedSchedRes
        ] = await Promise.all([
            supabase.from('batches').select('id, name', { count: 'exact' }).eq('housing_id', housingId),
            supabase.from('devices').select('id, name', { count: 'exact' }).eq('housing_id', housingId),
            supabase.from('weighing_sessions').select('id', { count: 'exact', head: true }).eq('housing_id', housingId),
            supabase.from('health_records').select('id', { count: 'exact', head: true }).eq('housing_id', housingId).is('deleted_at', null),
            supabase.from('dispense_records').select('id', { count: 'exact', head: true }).eq('housing_id', housingId),
            supabase.from('feed_schedules').select('id', { count: 'exact', head: true }).eq('housing_id', housingId),
        ]);

        const batchCount    = batchesRes.count ?? (batchesRes.data?.length ?? 0);
        const deviceCount   = devicesRes.count ?? (devicesRes.data?.length ?? 0);
        const weighingCount = weighingRes.count ?? 0;
        const healthCount   = healthRes.count ?? 0;
        const dispenseCount = dispenseRes.count ?? 0;
        const feedSchedCount = feedSchedRes.count ?? 0;

        const reasons: string[] = [];

        if (batchCount > 0) {
            reasons.push(`${batchCount} batch${batchCount > 1 ? 'es' : ''}`);
        }
        if (deviceCount > 0) {
            reasons.push(`${deviceCount} assigned device${deviceCount > 1 ? 's' : ''}`);
        }
        if (weighingCount > 0) {
            reasons.push(`${weighingCount} weighing session${weighingCount > 1 ? 's' : ''}`);
        }
        if (healthCount > 0) {
            reasons.push(`${healthCount} health/mortality record${healthCount > 1 ? 's' : ''}`);
        }
        if (dispenseCount > 0) {
            reasons.push(`${dispenseCount} feed dispense record${dispenseCount > 1 ? 's' : ''}`);
        }
        if (feedSchedCount > 0) {
            reasons.push(`${feedSchedCount} feed schedule${feedSchedCount > 1 ? 's' : ''}`);
        }

        return {
            canDelete: reasons.length === 0,
            reasons,
        };
    } catch (err) {
        console.error('[checkHousingConnectedData] Error checking dependencies:', err);
        return {
            canDelete: false,
            reasons: ['Could not verify housing dependencies due to a network or server error.'],
        };
    }
}

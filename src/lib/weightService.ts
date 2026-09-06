import { supabase } from './supabase';

export interface BatchWeightSummary {
  latestAvgWeightKg: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  recordCount: number;
  latestRecordedAt: string | null;
}

/**
 * Fetch the latest weight stats for a batch from weigh_sessions.
 * Converts net_weight_grams into kg.
 */
export async function getLatestBatchWeight(batchId: string | null | undefined): Promise<BatchWeightSummary> {
  if (!batchId || batchId.startsWith('demo-')) {
    return {
      latestAvgWeightKg: null,
      minWeightKg: null,
      maxWeightKg: null,
      recordCount: 0,
      latestRecordedAt: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from('weigh_sessions')
      .select('id, net_weight_grams, status, recorded_at')
      .eq('batch_id', batchId)
      .not('status', 'eq', 'cancelled')
      .order('recorded_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[weightService] Error querying weigh_sessions:', error);
      return {
        latestAvgWeightKg: null,
        minWeightKg: null,
        maxWeightKg: null,
        recordCount: 0,
        latestRecordedAt: null,
      };
    }

    if (!data || data.length === 0) {
      return {
        latestAvgWeightKg: null,
        minWeightKg: null,
        maxWeightKg: null,
        recordCount: 0,
        latestRecordedAt: null,
      };
    }

    const weightsKg = data
      .map(row => (typeof row.net_weight_grams === 'number' ? row.net_weight_grams / 1000 : null))
      .filter((w): w is number => w !== null && w > 0);

    if (weightsKg.length === 0) {
      return {
        latestAvgWeightKg: null,
        minWeightKg: null,
        maxWeightKg: null,
        recordCount: data.length,
        latestRecordedAt: data[0]?.recorded_at ?? null,
      };
    }

    const sum = weightsKg.reduce((acc, curr) => acc + curr, 0);
    const avg = Number((sum / weightsKg.length).toFixed(2));
    const min = Number(Math.min(...weightsKg).toFixed(2));
    const max = Number(Math.max(...weightsKg).toFixed(2));

    return {
      latestAvgWeightKg: avg,
      minWeightKg: min,
      maxWeightKg: max,
      recordCount: weightsKg.length,
      latestRecordedAt: data[0]?.recorded_at ?? null,
    };
  } catch (err) {
    console.error('[weightService] getLatestBatchWeight caught error:', err);
    return {
      latestAvgWeightKg: null,
      minWeightKg: null,
      maxWeightKg: null,
      recordCount: 0,
      latestRecordedAt: null,
    };
  }
}

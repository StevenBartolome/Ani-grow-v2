import { supabase } from './supabase';
import {
  PIG_GUIDE_DATA,
  CHICKEN_GUIDE_DATA,
  type GuidePhaseItem,
  type SOPAction,
  type ActionDetail,
} from '@/constants/guideMockData';

export interface RoadmapDBRow {
  id?: string;
  farm_id: string;
  animal_type: 'pig' | 'chicken';
  version: number;
  batch_id: string | null;
  is_ai_adjusted: boolean;
  source_id?: string | null;
  phase_id: string;
  phase_name: string;
  day_start: number;
  day_end: number;
  day_range: string;
  target_weight_min?: number | null;
  target_weight_max?: number | null;
  target_temp_min?: number | null;
  target_temp_max?: number | null;
  target_weight_raw?: string | null;
  target_temp_raw?: string | null;
  timeline_description?: string | null;
  card_description?: string | null;
  today_action?: string | null;
  ai_recommendation?: string | null;
  action_details?: ActionDetail[] | null;
  full_guide_actions?: SOPAction[] | string[] | null;
  sort_order?: number;
  ai_reason?: string | null;
  created_at?: string;
}

/**
 * Extracts a numeric sort key from a dayTag string (e.g. 'Pre-Arrival' -> 0, 'Day 1' -> 1, 'Day 6–30' -> 6)
 */
export function parseDaySortOrder(dayTag: string | undefined): number {
  if (!dayTag) return 999;
  const tag = dayTag.trim().toLowerCase();
  if (tag === 'pre-arrival') return 0;
  if (tag === 'pre-haul' || tag === 'pre-catch') return 990;
  if (tag.includes('harvest')) return 999;

  // Single number: "Day 3"
  const single = tag.match(/day\s*(\d+)/i);
  // Range: "Day 6-10" or "Day 6–30"
  const range = tag.match(/day\s*(\d+)\s*[-–—to]+\s*(\d+)/i);
  if (range) {
    return parseInt(range[1], 10);
  }
  if (single) {
    return parseInt(single[1], 10);
  }
  return 500;
}

/**
 * Sorts an array of SOPAction items chronologically by day.
 */
export function sortActionsByDay(actions: SOPAction[]): SOPAction[] {
  return [...actions].sort((a, b) => parseDaySortOrder(a.dayTag) - parseDaySortOrder(b.dayTag));
}

/**
 * Normalizes fullGuideActions into SOPAction[] format and ensures they are sorted by day.
 */
export function normalizeSOPActions(raw: any, phase: GuidePhaseItem): SOPAction[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return sortActionsByDay(phase.fullGuideActions || []);
  }
  const mapped = raw.map((item, idx) => {
    if (typeof item === 'string') {
      const match = phase.fullGuideActions?.[idx];
      return {
        action: item,
        dayTag: match?.dayTag || phase.dayRange,
      };
    }
    return {
      action: item.action || '',
      dayTag: item.dayTag || phase.dayRange,
    };
  });
  return sortActionsByDay(mapped);
}

/**
 * Converts a database row to a GuidePhaseItem
 */
function rowToGuidePhaseItem(row: RoadmapDBRow, fallbackPhase: GuidePhaseItem): GuidePhaseItem {
  const fullGuideActions = normalizeSOPActions(row.full_guide_actions, fallbackPhase);

  return {
    id: row.phase_id || fallbackPhase.id,
    name: row.phase_name || fallbackPhase.name,
    dayRange: row.day_range || fallbackPhase.dayRange,
    dayStart: row.day_start ?? fallbackPhase.dayStart,
    dayEnd: row.day_end ?? fallbackPhase.dayEnd,
    targetTemp: row.target_temp_raw || fallbackPhase.targetTemp,
    targetWeight: row.target_weight_raw || fallbackPhase.targetWeight,
    targetWeightMin: row.target_weight_min ?? fallbackPhase.targetWeightMin,
    targetWeightMax: row.target_weight_max ?? fallbackPhase.targetWeightMax,
    targetTempMin: row.target_temp_min ?? fallbackPhase.targetTempMin,
    targetTempMax: row.target_temp_max ?? fallbackPhase.targetTempMax,
    timelineDescription: row.timeline_description || fallbackPhase.timelineDescription,
    cardDescription: row.card_description || fallbackPhase.cardDescription,
    actionable: fallbackPhase.actionable,
    todayAction: row.today_action || fallbackPhase.todayAction,
    actionDetails: (row.action_details as ActionDetail[]) || fallbackPhase.actionDetails,
    aiRecommendation: row.ai_recommendation || fallbackPhase.aiRecommendation,
    fullGuideActions,
    version: row.version ?? 1,
    is_ai_adjusted: row.is_ai_adjusted ?? false,
    ai_reason: row.ai_reason ?? undefined,
    batch_id: row.batch_id ?? null,
  };
}

/**
 * Seeds the original roadmap SOPs into the database for a farm and animal type if not yet present.
 * These original rows (version = 1, is_ai_adjusted = false, batch_id = null) are never modified.
 */
export async function seedRoadmapIfEmpty(
  farmId: string,
  animalType: 'pig' | 'chicken'
): Promise<void> {
  if (!farmId) return;

  try {
    const { data: existing, error: checkError } = await supabase
      .from('production_roadmaps')
      .select('id, phase_id')
      .eq('farm_id', farmId)
      .eq('animal_type', animalType)
      .eq('is_ai_adjusted', false)
      .is('batch_id', null);

    if (checkError) {
      if ((checkError as any)?.code !== 'PGRST205') {
        console.warn('[roadmapService] check existing error:', checkError);
      }
      return;
    }

    if (existing && existing.length > 0) {
      // Already seeded
      return;
    }

    const mockData = animalType === 'pig' ? PIG_GUIDE_DATA : CHICKEN_GUIDE_DATA;

    const rowsToInsert: RoadmapDBRow[] = mockData.map((item, idx) => ({
      farm_id: farmId,
      animal_type: animalType,
      version: 1,
      batch_id: null,
      is_ai_adjusted: false,
      source_id: null,
      phase_id: item.id,
      phase_name: item.name,
      day_start: item.dayStart,
      day_end: item.dayEnd,
      day_range: item.dayRange,
      target_weight_min: item.targetWeightMin,
      target_weight_max: item.targetWeightMax,
      target_temp_min: item.targetTempMin,
      target_temp_max: item.targetTempMax,
      target_weight_raw: item.targetWeight,
      target_temp_raw: item.targetTemp,
      timeline_description: item.timelineDescription,
      card_description: item.cardDescription,
      today_action: item.todayAction,
      ai_recommendation: item.aiRecommendation,
      action_details: item.actionDetails,
      full_guide_actions: item.fullGuideActions,
      sort_order: idx + 1,
      ai_reason: null,
    }));

    const { error: insertError } = await supabase
      .from('production_roadmaps')
      .insert(rowsToInsert);

    if (insertError) {
      if ((insertError as any)?.code !== 'PGRST205') {
        console.warn('[roadmapService] seed insert error:', insertError);
      }
    } else {
      console.log(`[roadmapService] Successfully seeded original roadmap for ${animalType} (${farmId})`);
    }
  } catch (err) {
    console.error('[roadmapService] seedRoadmapIfEmpty caught error:', err);
  }
}

/**
 * Fetch the effective roadmap for a farm + animal type + active batch.
 * If the batch has an AI-adjusted row for a phase, that latest version is returned for that phase.
 * Otherwise, the original base roadmap (version 1) is returned.
 * Fallback to guideMockData if DB table is inaccessible.
 */
export async function getEffectiveRoadmap(
  farmId: string,
  animalType: 'pig' | 'chicken',
  batchId?: string | null
): Promise<GuidePhaseItem[]> {
  const defaultList = animalType === 'pig' ? PIG_GUIDE_DATA : CHICKEN_GUIDE_DATA;
  if (!farmId) return defaultList;

  try {
    // Ensure original is seeded
    await seedRoadmapIfEmpty(farmId, animalType);

    // Fetch all roadmap rows for this farm and animal type
    const { data, error } = await supabase
      .from('production_roadmaps')
      .select('*')
      .eq('farm_id', farmId)
      .eq('animal_type', animalType)
      .order('sort_order', { ascending: true })
      .order('version', { ascending: false });

    if (error || !data || data.length === 0) {
      if ((error as any)?.code !== 'PGRST205') {
        console.warn('[roadmapService] fetch roadmaps notice:', error?.message || 'Using base roadmap');
      }
      return defaultList;
    }

    const rows = data as RoadmapDBRow[];

    // For each phase in standard sequence, determine the active row
    const result: GuidePhaseItem[] = defaultList.map(fallbackPhase => {
      // Check if there is an AI-adjusted version for this specific batch
      let matchedRow: RoadmapDBRow | undefined;

      if (batchId && !batchId.startsWith('demo-')) {
        matchedRow = rows.find(
          r => r.phase_id === fallbackPhase.id && r.batch_id === batchId && r.is_ai_adjusted === true
        );
      }

      // If no AI version for this batch, get the original row
      if (!matchedRow) {
        matchedRow = rows.find(
          r => r.phase_id === fallbackPhase.id && r.is_ai_adjusted === false && r.batch_id === null
        );
      }

      if (matchedRow) {
        return rowToGuidePhaseItem(matchedRow, fallbackPhase);
      }
      return fallbackPhase;
    });

    return result;
  } catch (err) {
    console.error('[roadmapService] getEffectiveRoadmap caught error:', err);
    return defaultList;
  }
}

/**
 * Saves a new AI-adjusted roadmap version for a batch.
 * The original row is NEVER modified or overwritten.
 * A new row is inserted with is_ai_adjusted = true and version = prevVersion + 1.
 */
export async function saveAIAdjustedPhase(params: {
  farmId: string;
  animalType: 'pig' | 'chicken';
  batchId: string;
  phaseId: string;
  updatedActions: SOPAction[];
  updatedRecommendation: string;
  aiReason: string;
  currentPhase: GuidePhaseItem;
}): Promise<GuidePhaseItem | null> {
  const { farmId, animalType, batchId, phaseId, updatedActions, updatedRecommendation, aiReason, currentPhase } = params;
  if (!farmId || !batchId || batchId.startsWith('demo-')) return null;

  try {
    // Find the latest version number for this phase/batch/farm
    const { data: latestRows, error: findError } = await supabase
      .from('production_roadmaps')
      .select('id, version')
      .eq('farm_id', farmId)
      .eq('animal_type', animalType)
      .eq('phase_id', phaseId)
      .order('version', { ascending: false })
      .limit(1);

    if (findError) console.warn('[roadmapService] find latest version error:', findError);

    const highestVersion = latestRows && latestRows[0]?.version ? latestRows[0].version : 1;
    const newVersion = highestVersion + 1;
    const sourceId = latestRows && latestRows[0]?.id ? latestRows[0].id : null;

    const newRow: RoadmapDBRow = {
      farm_id: farmId,
      animal_type: animalType,
      version: newVersion,
      batch_id: batchId,
      is_ai_adjusted: true,
      source_id: sourceId,
      phase_id: phaseId,
      phase_name: currentPhase.name,
      day_start: currentPhase.dayStart,
      day_end: currentPhase.dayEnd,
      day_range: currentPhase.dayRange,
      target_weight_min: currentPhase.targetWeightMin,
      target_weight_max: currentPhase.targetWeightMax,
      target_temp_min: currentPhase.targetTempMin,
      target_temp_max: currentPhase.targetTempMax,
      target_weight_raw: currentPhase.targetWeight,
      target_temp_raw: currentPhase.targetTemp,
      timeline_description: currentPhase.timelineDescription,
      card_description: currentPhase.cardDescription,
      today_action: currentPhase.todayAction,
      ai_recommendation: updatedRecommendation,
      action_details: currentPhase.actionDetails,
      full_guide_actions: updatedActions,
      sort_order: (currentPhase as any).sort_order || 1,
      ai_reason: aiReason,
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('production_roadmaps')
      .insert(newRow)
      .select('*')
      .single();

    if (insertError) {
      console.error('[roadmapService] Error inserting AI adjusted roadmap row:', insertError);
      throw insertError;
    }

    console.log(`[roadmapService] Inserted new AI-adjusted roadmap version ${newVersion} for batch ${batchId}`);
    return rowToGuidePhaseItem(insertedData as RoadmapDBRow, currentPhase);
  } catch (err) {
    console.error('[roadmapService] saveAIAdjustedPhase error:', err);
    return null;
  }
}

// ─── Task Action Logging & AI Tracking ────────────────────────────────────────

export interface RoadmapActionLog {
  id?: string;
  farm_id: string;
  batch_id: string | null;
  animal_type: 'pig' | 'chicken';
  phase_id: string;
  action_text: string;
  day_tag?: string;
  farm_day?: number;
  status: 'completed' | 'skipped' | 'rejected';
  is_ai_suggestion: boolean;
  reason_notes?: string;
  recorded_by?: string;
  recorded_at?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Creates a unique lookup key for a task action item
 */
export function getActionLogKey(phaseId: string, actionText: string, farmDay?: number): string {
  const normalizedText = actionText.trim().toLowerCase();
  return farmDay != null
    ? `${phaseId}_${normalizedText}_d${farmDay}`
    : `${phaseId}_${normalizedText}`;
}

/**
 * Fetches all action logs for a farm (and optional batch), returning a dictionary
 * indexed by action log keys for instant O(1) lookup.
 */
export async function getBatchActionLogs(
  farmId: string,
  batchId?: string | null
): Promise<Record<string, RoadmapActionLog>> {
  if (!farmId) return {};

  try {
    let query = supabase
      .from('roadmap_action_logs')
      .select('*')
      .eq('farm_id', farmId);

    if (batchId && !batchId.startsWith('demo-')) {
      query = query.eq('batch_id', batchId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[roadmapService] getBatchActionLogs query error:', error.message);
      return {};
    }

    const map: Record<string, RoadmapActionLog> = {};
    (data || []).forEach((row: RoadmapActionLog) => {
      const key = getActionLogKey(row.phase_id, row.action_text, row.farm_day);
      map[key] = row;
      // Also map without day for general lookup
      const generalKey = getActionLogKey(row.phase_id, row.action_text);
      if (!map[generalKey]) {
        map[generalKey] = row;
      }
    });

    return map;
  } catch (err: any) {
    console.warn('[roadmapService] getBatchActionLogs exception:', err?.message);
    return {};
  }
}

/**
 * Record (upsert) task action status (completed, skipped, or rejected with reasons)
 */
export async function recordRoadmapAction(
  log: RoadmapActionLog
): Promise<RoadmapActionLog | null> {
  if (!log.farm_id || !log.phase_id || !log.action_text || !log.status) return null;

  const payload = {
    farm_id: log.farm_id,
    batch_id: log.batch_id && !log.batch_id.startsWith('demo-') ? log.batch_id : null,
    animal_type: log.animal_type,
    phase_id: log.phase_id,
    action_text: log.action_text,
    day_tag: log.day_tag || '',
    farm_day: log.farm_day ?? null,
    status: log.status,
    is_ai_suggestion: log.is_ai_suggestion || log.action_text.startsWith('[AI Adjustment]'),
    reason_notes: log.reason_notes || '',
    recorded_by: log.recorded_by || null,
    recorded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('roadmap_action_logs')
      .upsert(payload, {
        onConflict: 'farm_id,batch_id,phase_id,action_text,farm_day',
      })
      .select()
      .single();

    if (error) {
      console.warn('[roadmapService] recordRoadmapAction error:', error.message);
      return null;
    }

    return data as RoadmapActionLog;
  } catch (err: any) {
    console.warn('[roadmapService] recordRoadmapAction exception:', err?.message);
    return null;
  }
}

/**
 * Remove a task action log (e.g. undoing completion or skip)
 */
export async function deleteRoadmapActionLog(
  logId: string,
  farmId: string
): Promise<boolean> {
  if (!logId || !farmId) return false;
  try {
    const { error } = await supabase
      .from('roadmap_action_logs')
      .delete()
      .eq('id', logId)
      .eq('farm_id', farmId);

    if (error) {
      console.warn('[roadmapService] deleteRoadmapActionLog error:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[roadmapService] deleteRoadmapActionLog exception:', err?.message);
    return false;
  }
}



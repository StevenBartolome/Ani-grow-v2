import { supabase } from './supabase';
import { sortActionsByDay } from './roadmapService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIInsightContext {
  type: 'weight' | 'feed' | 'animal' | 'health' | 'general';
  farmName?: string;
  animalType?: string;
  housingName?: string;
  data: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  navigation?: NavLink[];  // only on assistant messages
}

export interface NavLink {
  label: string;
  route: string;
  icon: string;
  params?: Record<string, string>;
}

export interface AniBotContext {
  farmId: string;
  farmName?: string;
  userId?: string;
  farmIds?: string[];                          // multi-farm: all managed farm IDs
  managedFarms?: { id: string; name: string }[]; // full list with names for system prompt
  imageData?: string;                          // base64 image for vision analysis
  imageMediaType?: string;                     // e.g. 'image/jpeg'
}

export interface AniBotReply {
  text: string;
  navigation: NavLink[];
}

// ─── In-memory insight cache ──────────────────────────────────────────────────
const insightCache = new Map<string, string>();

// ─── Shared edge-function caller ──────────────────────────────────────────────
async function callEdgeFunction(body: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('ai-farm-assistant', { body });
  if (error) throw new Error(error.message ?? 'Edge function error');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

// ─── Auto-insight cards (cached) ─────────────────────────────────────────────

/**
 * Fetch a single AI-generated insight for the given farm data context.
 * Results are cached in memory — same context = no extra API call.
 */
export async function getInsight(context: AIInsightContext, bypassCache = false): Promise<string> {
  const cacheKey = JSON.stringify(context);
  if (!bypassCache && insightCache.has(cacheKey)) return insightCache.get(cacheKey)!;
  const data = await callEdgeFunction({ type: 'insight', context });
  const result = data?.result ?? '';
  insightCache.set(cacheKey, result);
  return result;
}

// ─── AniBot chat (with tool use + nav links) ──────────────────────────────────

/**
 * Send a chat message to AniBot and get a reply with optional navigation links.
 * AniBot has full tool-use access to real-time farm data and can perform actions.
 *
 * @param messages  Full conversation history including the new user message.
 * @param botCtx    Must include farmId so AniBot can query the correct farm.
 */
export async function anibotChat(
  messages: ChatMessage[],
  botCtx: AniBotContext,
): Promise<AniBotReply> {
  // Strip nav links before sending to API (API only needs role + content)
  const apiMessages = messages.map(({ role, content }) => ({ role, content }));

  const data = await callEdgeFunction({
    type: 'chat',
    context: {
      farmId:         botCtx.farmId,
      farmIds:        botCtx.farmIds ?? [botCtx.farmId],
      farmName:       botCtx.farmName,
      userId:         botCtx.userId,
      managedFarms:   botCtx.managedFarms,
      imageData:      botCtx.imageData,
      imageMediaType: botCtx.imageMediaType,
    },
    messages: apiMessages,
  });

  return {
    text: data?.result ?? '',
    navigation: data?.navigation ?? [],
  };
}

// ─── Voice transcription (Groq Whisper via edge function) ─────────────────────

/**
 * Transcribe recorded audio to text.
 * Requires GROQ_API_KEY to be set in Supabase secrets.
 * Returns the transcript string, or '' if unavailable.
 */
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const data = await callEdgeFunction({
      type: 'transcribe',
      context: { audioData: audioBase64, mimeType },
    });
    if (data?.unavailable) return '';
    return data?.transcript ?? '';
  } catch {
    return ''; // Graceful fallback — caller handles empty string
  }
}

// ─── Dynamic AI Roadmap Adjustments ──────────────────────────────────────────

export interface RoadmapAdjustmentContext {
  farmId: string;
  animalType: 'pig' | 'chicken';
  batchName: string;
  phaseId: string;
  phaseName: string;
  dayRange: string;
  currentDay: number;
  targetWeightRaw: string;
  targetWeightMin?: number;
  targetWeightMax?: number;
  actualAvgWeight: number | null;
  headCount?: number;
  currentActions: { action: string; dayTag: string }[];
  actionHistory?: {
    action?: string;
    action_text?: string;
    status: 'completed' | 'skipped' | 'rejected' | string;
    reason_notes?: string;
    is_ai_suggestion?: boolean;
    farm_day?: number;
  }[];
}

export interface RoadmapAdjustmentResult {
  status: 'on_track' | 'below_target' | 'above_target' | 'no_data';
  headline: string;
  reason: string;
  aiRecommendation: string;
  adjustedActions: { action: string; dayTag: string }[];
}

/**
 * Evaluates whether batch weight aligns with the current phase target and generates
 * targeted roadmap adjustments if performance is deviating, taking into account past action history.
 */
export async function getRoadmapAdjustment(
  ctx: RoadmapAdjustmentContext
): Promise<RoadmapAdjustmentResult> {
  const {
    animalType,
    batchName,
    phaseName,
    currentDay,
    targetWeightMin,
    targetWeightMax,
    actualAvgWeight,
    targetWeightRaw,
    currentActions,
    actionHistory = [],
  } = ctx;

  const skippedActions = actionHistory.filter(a => a.status === 'skipped' || a.status === 'rejected');
  const completedActions = actionHistory.filter(a => a.status === 'completed');

  if (actualAvgWeight === null || actualAvgWeight === undefined) {
    return {
      status: 'no_data',
      headline: 'Awaiting Live Scale Data',
      reason: `No recent weight measurements recorded for "${batchName}". Weigh animals using AniWeigh to activate AI performance adjustments.`,
      aiRecommendation: `Batch "${batchName}" is on Day ${currentDay} of ${phaseName}. Connect an AniWeigh scale to compare actual live weights against the ${targetWeightRaw} phase benchmark.`,
      adjustedActions: currentActions,
    };
  }

  // Calculate deviation
  const minTarget = targetWeightMin ?? (animalType === 'pig' ? 6 : 0.2);
  const maxTarget = targetWeightMax ?? (animalType === 'pig' ? 18 : 0.48);

  let status: 'on_track' | 'below_target' | 'above_target' = 'on_track';
  if (actualAvgWeight < minTarget) {
    status = 'below_target';
  } else if (actualAvgWeight > maxTarget) {
    status = 'above_target';
  }

  const unit = animalType === 'pig' ? 'kg' : (actualAvgWeight < 1 ? 'g' : 'kg');
  const displayActual = unit === 'g' ? `${Math.round(actualAvgWeight * 1000)}g` : `${actualAvgWeight.toFixed(2)} kg`;

  if (status === 'on_track') {
    let notePrefix = '';
    if (completedActions.length > 0) {
      notePrefix = `Completed ${completedActions.length} planned protocol ${completedActions.length === 1 ? 'task' : 'tasks'}. `;
    }
    return {
      status: 'on_track',
      headline: 'Cohort Growth On Track',
      reason: `${notePrefix}Average weight is ${displayActual}, within the target benchmark of ${targetWeightRaw} for ${phaseName}.`,
      aiRecommendation: `Batch "${batchName}" is progressing with optimal growth velocity at ${displayActual}. Maintain standard SOP feeding protocol and continue routine health checks.`,
      adjustedActions: currentActions,
    };
  }

  if (status === 'above_target') {
    return {
      status: 'above_target',
      headline: 'Accelerated Growth Detected',
      reason: `Average weight is ${displayActual}, exceeding standard target of ${targetWeightRaw}. Early market readiness anticipated.`,
      aiRecommendation: `Growth trajectory is accelerated (${displayActual} vs ${targetWeightRaw} benchmark). Consider scheduling earlier phase transition or sorting top-weight tiers to prevent over-fattening.`,
      adjustedActions: currentActions,
    };
  }

  // Below target: formulate AI-driven corrective roadmap
  const gap = Number((minTarget - actualAvgWeight).toFixed(2));
  const gapText = unit === 'g' ? `${Math.round(gap * 1000)}g below target` : `${gap} kg below minimum target (${minTarget} kg)`;

  // Generate customized action adjustments
  let reason = `Batch weight is ${displayActual} (${gapText}) on Day ${currentDay}. AI has generated a customized roadmap intervention to recover target ADG.`;
  if (skippedActions.length > 0) {
    const lastSkip = skippedActions[skippedActions.length - 1];
    if (lastSkip && lastSkip.reason_notes) {
      reason += ` (Note: Previous action skipped because "${lastSkip.reason_notes}").`;
    }
  }

  let aiRecommendation = '';
  let adjustedActions = [...currentActions];

  if (animalType === 'pig') {
    aiRecommendation = `Target weight deficit detected (${displayActual} vs ${targetWeightRaw}). Action recommended: Boost feed energy density by adding 2% digestible vegetable oil, verify water drinker nipple flow rate (>500 mL/min), and check for sub-clinical scouring or parasite load.`;
    
    adjustedActions = [
      ...currentActions,
      {
        action: `[AI Adjustment] Increase daily starter feed allowance by 15% and top-dress with electrolyte/amino acid booster.`,
        dayTag: `Day ${currentDay}–${Math.min(currentDay + 7, ctx.currentActions[0] ? 30 : currentDay + 7)}`,
      },
      {
        action: `[AI Adjustment] Inspect water nipple drinker flow rate (minimum 500 mL/min) and verify pen temperature does not drop below 26°C.`,
        dayTag: `Day ${currentDay}`,
      },
    ];
  } else {
    aiRecommendation = `Flock weight average is ${displayActual} against the ${targetWeightRaw} benchmark. Recommended intervention: Increase light intensity to 25 lux during feeding periods, check feeder pan distribution, and supplement drinking water with B-complex vitamins and multivitamins for 3 consecutive days.`;

    adjustedActions = [
      ...currentActions,
      {
        action: `[AI Adjustment] Provide 3-day multivitamin & amino acid boost in drinking water to accelerate flock weight gain.`,
        dayTag: `Day ${currentDay}–${currentDay + 3}`,
      },
      {
        action: `[AI Adjustment] Increase feeder accessibility and raise lighting to 25 lux during active feeding periods.`,
        dayTag: `Day ${currentDay}`,
      },
    ];
  }

  // Try calling edge function for dynamic LLM refinement if available
  try {
    const aiData = await callEdgeFunction({
      type: 'insight',
      context: {
        type: 'weight',
        animalType,
        batchName,
        phaseName,
        currentDay,
        targetWeight: targetWeightRaw,
        actualAvgWeight,
        deficit: gap,
        actions: currentActions.map((a: { action: string; dayTag: string }) => a.action),
        actionHistory: actionHistory.map(h => ({
          action: h.action || h.action_text || '',
          status: h.status,
          reason: h.reason_notes || '',
        })),
      },
    });

    if (aiData?.result && aiData.result.trim().length > 20) {
      aiRecommendation = aiData.result.trim();
    }
  } catch {
    // Non-blocking fallback to clinical domain rules
  }

  // Ensure adjusted actions are strictly sorted chronologically by day
  const sortedActions = sortActionsByDay(adjustedActions);

  return {
    status: 'below_target',
    headline: 'AI Dynamic Roadmap Adjustment',
    reason,
    aiRecommendation,
    adjustedActions: sortedActions,
  };
}

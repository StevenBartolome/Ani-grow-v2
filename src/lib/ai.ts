import { supabase } from './supabase';

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
export async function getInsight(context: AIInsightContext): Promise<string> {
  const cacheKey = JSON.stringify(context);
  if (insightCache.has(cacheKey)) return insightCache.get(cacheKey)!;
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

import { supabase } from './supabase';

export interface FarmAiInsightRecord {
  id?: string;
  farm_id: string;
  category: string;
  sub_key?: string;
  insight_date: string; // YYYY-MM-DD
  title?: string;
  headline?: string;
  items?: string[];
  content: string;
  context_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Returns today's local date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetch a saved insight for a specific farm, category, and date.
 * Defaults to today's date if no date is passed.
 */
export async function getSavedFarmInsight(
  farmId: string,
  category: string,
  subKey: string = '',
  dateStr?: string,
): Promise<FarmAiInsightRecord | null> {
  if (!farmId || !category) return null;
  const targetDate = dateStr || getTodayDateString();

  try {
    const { data, error } = await supabase
      .from('farm_ai_insights')
      .select('*')
      .eq('farm_id', farmId)
      .eq('category', category)
      .eq('sub_key', subKey)
      .eq('insight_date', targetDate)
      .maybeSingle();

    if (error) {
      // If table doesn't exist yet or permission error, gracefully return null
      console.warn('[FarmAiInsight] Fetch warning:', error.message);
      return null;
    }

    return data as FarmAiInsightRecord | null;
  } catch (err: any) {
    console.warn('[FarmAiInsight] Fetch exception:', err?.message);
    return null;
  }
}

/**
 * Save / Upsert an AI insight for a specific farm, category, and date.
 */
export async function saveFarmInsight(
  farmId: string,
  category: string,
  content: string,
  options: {
    subKey?: string;
    dateStr?: string;
    title?: string;
    headline?: string;
    items?: string[];
    contextData?: Record<string, any>;
  } = {},
): Promise<FarmAiInsightRecord | null> {
  if (!farmId || !category || !content) return null;
  const targetDate = options.dateStr || getTodayDateString();
  const subKey = options.subKey || '';

  const payload = {
    farm_id: farmId,
    category,
    sub_key: subKey,
    insight_date: targetDate,
    title: options.title || '',
    headline: options.headline || '',
    items: options.items || [],
    content,
    context_data: options.contextData || {},
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('farm_ai_insights')
      .upsert(payload, {
        onConflict: 'farm_id,category,sub_key,insight_date',
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[FarmAiInsight] Save warning:', error.message);
      return null;
    }

    return data as FarmAiInsightRecord | null;
  } catch (err: any) {
    console.warn('[FarmAiInsight] Save exception:', err?.message);
    return null;
  }
}

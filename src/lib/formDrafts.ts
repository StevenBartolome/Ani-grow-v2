import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = 'form_draft:';

export interface FormDraft<T = Record<string, any>> {
    data: T;
    timestamp: number;
}

/**
 * Checks whether an object contains any meaningful user-entered data
 * (i.e. not just empty strings, nulls, or default blanks).
 */
export function hasMeaningfulData(data: Record<string, any> | null | undefined): boolean {
    if (!data || typeof data !== 'object') return false;
    for (const key of Object.keys(data)) {
        const val = data[key];
        if (typeof val === 'string' && val.trim().length > 0) return true;
        if (typeof val === 'number' && !isNaN(val) && val !== 0) return true;
        if (Array.isArray(val) && val.length > 0) return true;
        if (typeof val === 'object' && val !== null && hasMeaningfulData(val)) return true;
    }
    return false;
}

/**
 * Save form state to AsyncStorage under the specified draft key.
 * If data has no meaningful values, it removes any existing draft to avoid clutter.
 */
export async function saveFormDraft<T extends Record<string, any>>(key: string, data: T): Promise<void> {
    const fullKey = `${DRAFT_PREFIX}${key}`;
    try {
        if (!hasMeaningfulData(data)) {
            await AsyncStorage.removeItem(fullKey);
            return;
        }
        const draft: FormDraft<T> = {
            data,
            timestamp: Date.now(),
        };
        await AsyncStorage.setItem(fullKey, JSON.stringify(draft));
    } catch (err) {
        console.warn(`[FormDraft] Failed to save draft for ${key}:`, err);
    }
}

/**
 * Loads a saved form draft for the specified key.
 */
export async function loadFormDraft<T extends Record<string, any>>(key: string): Promise<T | null> {
    const fullKey = `${DRAFT_PREFIX}${key}`;
    try {
        const raw = await AsyncStorage.getItem(fullKey);
        if (!raw) return null;
        const parsed: FormDraft<T> = JSON.parse(raw);
        if (parsed && parsed.data && hasMeaningfulData(parsed.data)) {
            return parsed.data;
        }
        return null;
    } catch (err) {
        console.warn(`[FormDraft] Failed to load draft for ${key}:`, err);
        return null;
    }
}

/**
 * Clears the saved form draft for the specified key.
 */
export async function clearFormDraft(key: string): Promise<void> {
    const fullKey = `${DRAFT_PREFIX}${key}`;
    try {
        await AsyncStorage.removeItem(fullKey);
    } catch (err) {
        console.warn(`[FormDraft] Failed to clear draft for ${key}:`, err);
    }
}

/**
 * Checks if a draft exists for the specified key.
 */
export async function hasFormDraft(key: string): Promise<boolean> {
    const fullKey = `${DRAFT_PREFIX}${key}`;
    try {
        const raw = await AsyncStorage.getItem(fullKey);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed && parsed.data && hasMeaningfulData(parsed.data));
    } catch {
        return false;
    }
}

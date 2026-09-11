import { useEffect, useRef, useState, useCallback } from 'react';
import { loadFormDraft, saveFormDraft, clearFormDraft, hasMeaningfulData } from '@/lib/formDrafts';

interface UseFormDraftOptions<T> {
    /** Whether auto-saving and draft restoration is active (e.g. while modal is open) */
    enabled?: boolean;
    /** Callback when a saved draft is found and restored */
    onRestore?: (savedData: T) => void;
    /** Debounce interval in ms for auto-saving */
    debounceMs?: number;
}

export function useFormDraft<T extends Record<string, any>>(
    formKey: string,
    currentValues: T,
    options: UseFormDraftOptions<T> = {}
) {
    const { enabled = true, onRestore, debounceMs = 400 } = options;
    const [isDraftRestored, setIsDraftRestored] = useState(false);
    const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
    const isRestoringRef = useRef(false);
    const debounceTimerRef = useRef<any>(null);
    const prevValuesRef = useRef<string>('');

    // Restore draft on initial enable/mount
    useEffect(() => {
        if (!enabled || !formKey) {
            setHasLoadedDraft(false);
            return;
        }

        let isCancelled = false;

        async function initDraft() {
            try {
                const saved = await loadFormDraft<T>(formKey);
                if (!isCancelled && saved && hasMeaningfulData(saved)) {
                    isRestoringRef.current = true;
                    if (onRestore) {
                        onRestore(saved);
                    }
                    setIsDraftRestored(true);
                    prevValuesRef.current = JSON.stringify(saved);
                    // allow state to settle before enabling auto-save
                    setTimeout(() => {
                        isRestoringRef.current = false;
                    }, 100);
                }
            } catch (err) {
                console.warn(`[useFormDraft] error restoring draft for ${formKey}:`, err);
            } finally {
                if (!isCancelled) {
                    setHasLoadedDraft(true);
                }
            }
        }

        initDraft();

        return () => {
            isCancelled = true;
        };
    }, [enabled, formKey]);

    // Auto-save changes with debounce
    useEffect(() => {
        if (!enabled || !formKey || !hasLoadedDraft || isRestoringRef.current) {
            return;
        }

        const serialized = JSON.stringify(currentValues);
        if (serialized === prevValuesRef.current) {
            return;
        }

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(async () => {
            await saveFormDraft(formKey, currentValues);
            prevValuesRef.current = serialized;
        }, debounceMs);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [enabled, formKey, currentValues, hasLoadedDraft, debounceMs]);

    const clear = useCallback(async () => {
        if (!formKey) return;
        await clearFormDraft(formKey);
        setIsDraftRestored(false);
        prevValuesRef.current = '';
    }, [formKey]);

    const save = useCallback(async (customData?: T) => {
        if (!formKey) return;
        const dataToSave = customData ?? currentValues;
        await saveFormDraft(formKey, dataToSave);
        prevValuesRef.current = JSON.stringify(dataToSave);
    }, [formKey, currentValues]);

    return {
        isDraftRestored,
        clearDraft: clear,
        saveDraft: save,
        setIsDraftRestored,
    };
}

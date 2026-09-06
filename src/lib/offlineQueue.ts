// Lightweight, dependency-free offline queue for form submissions.
//
// The problem this solves: if WiFi drops right as the user submits a form
// (e.g. Add Housing), the request fails and — without this — the user has
// to retype everything once they're back online. Instead, a genuine
// network failure gets queued here instead of shown as an error, and a
// periodic retry (see app/_layout.tsx) replays it automatically the
// moment connectivity returns.
//
// Deliberately NOT using @react-native-community/netinfo — it's a native
// module this app has zero precedent for, and typically needs a custom
// dev client to run (Expo Go can't load arbitrary native modules). This
// needs no "are we online" signal at all: a failed request already tells
// us we're offline, and a periodic retry is the "are we online again?"
// check, one attempt at a time.
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'offline_action_queue';
const MAX_ATTEMPTS = 10;

export interface QueuedAction {
    id: string;
    table: string;
    operation: 'insert' | 'update';
    data: Record<string, any>;
    matchId?: string; // required for 'update' — matched against the table's `id` column
    label: string;     // human-readable, for the sync banner / snackbar
    createdAt: string;
    attempts: number;
    /** Set once an action has failed MAX_ATTEMPTS times for a non-network reason —
     *  surfaced so the user knows it needs manual attention instead of retrying forever silently. */
    stuck?: boolean;
}

// React Native's fetch throws this exact message with no connectivity;
// the web fallback is "Failed to fetch". Supabase-js surfaces both as-is
// on `error.message`.
export function isNetworkError(err: any): boolean {
    const msg = String(err?.message ?? err ?? '');
    return msg.includes('Network request failed') || msg.includes('Failed to fetch');
}

async function readQueue(): Promise<QueuedAction[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueuedActions(): Promise<QueuedAction[]> {
    return readQueue();
}

export async function queueAction(action: Omit<QueuedAction, 'id' | 'createdAt' | 'attempts'>): Promise<QueuedAction> {
    const queue = await readQueue();
    const full: QueuedAction = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        attempts: 0,
    };
    queue.push(full);
    await writeQueue(queue);
    return full;
}

export async function removeQueuedAction(id: string): Promise<void> {
    const queue = await readQueue();
    await writeQueue(queue.filter(a => a.id !== id));
}

// Replays every queued action once. Successes are removed; a still-
// offline failure is left queued for the next flush; a non-network
// failure counts toward that item's attempt cap before being flagged
// `stuck` (so it stops retrying forever against something that will
// never succeed, e.g. a stale/invalid reference).
export async function flushQueue(supabase: any): Promise<{ succeeded: number; remaining: number }> {
    const queue = await readQueue();
    if (queue.length === 0) return { succeeded: 0, remaining: 0 };

    let succeeded = 0;
    const next: QueuedAction[] = [];

    for (const action of queue) {
        if (action.stuck) { next.push(action); continue; }
        try {
            const table = supabase.from(action.table);
            const { error } = action.operation === 'update' && action.matchId
                ? await table.update(action.data).eq('id', action.matchId)
                : await table.insert(action.data);
            if (error) throw error;
            succeeded += 1;
        } catch (err) {
            const attempts = action.attempts + 1;
            if (isNetworkError(err)) {
                next.push({ ...action, attempts }); // still offline — keep trying
            } else if (attempts >= MAX_ATTEMPTS) {
                next.push({ ...action, attempts, stuck: true }); // real error, stop hammering it
            } else {
                next.push({ ...action, attempts });
            }
        }
    }

    await writeQueue(next);
    return { succeeded, remaining: next.length };
}

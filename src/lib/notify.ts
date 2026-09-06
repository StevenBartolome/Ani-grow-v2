// Shared notification-creation helper — the single place that writes to the
// `notifications` table and fires a matching local device notification.
// Everything that decides "this event is worth notifying about" (see
// NotificationWatcher.tsx) funnels through here, so the insert shape and the
// local-notification behavior stay consistent no matter which of the 4 alert
// categories triggered it.
//
// Local notifications only (expo-notifications) — deliberately NOT remote
// push. Expo Go dropped remote push support in SDK 53+, and this project has
// no custom dev client; local notifications (fire while the app is open or
// backgrounded on this device) still work fine in Expo Go and need no extra
// native config for that use case.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Without this, expo-notifications silently does NOT show a banner/alert
// while the app is in the foreground (the default handler shows nothing) —
// and foreground is the most common case for these alerts, since they fire
// while the user is actively using the app. Registered once at module load
// (this file is imported before any createNotification() call can occur),
// so it's always in place before the first notification fires.
if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

let androidChannelReady = false;

export type NotificationCategory =
    | 'farm_registered' | 'device_alert' | 'weight_alert' | 'feed_alert'
    | 'health_alert' | 'system' | 'invite' | 'ai_suggestion';

export type NotificationType = 'info' | 'warning' | 'error' | 'success';

// Severity hierarchy for sorting/coloring the bell + list, independent of
// recency: Device > Weight > Feed > Health, everything else lowest.
export const NOTIFICATION_CATEGORY_PRIORITY: Record<string, number> = {
    device_alert: 4,
    weight_alert: 3,
    feed_alert: 2,
    health_alert: 1,
    system: 0,
    invite: 0,
    ai_suggestion: 0,
    farm_registered: 0,
};

export function categoryPriority(category: string | null | undefined): number {
    if (!category) return 0;
    return NOTIFICATION_CATEGORY_PRIORITY[category] ?? 0;
}

/** Sorts by category severity first, then most-recent-first within the same category. */
export function sortByPriority<T extends { category?: string | null; created_at: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const pDiff = categoryPriority(b.category) - categoryPriority(a.category);
        if (pDiff !== 0) return pDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

const PERMISSION_ASKED_KEY = 'notif_permission_asked';

/** Requests notification permission once ever (per install) — never re-prompts on later launches if the user already answered. */
export async function ensureNotificationPermission(): Promise<boolean> {
    if (Platform.OS === 'web') return false; // expo-notifications' web support doesn't cover this flow — skip outright rather than risk an unsupported-API error.
    try {
        if (Platform.OS === 'android' && !androidChannelReady) {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'AniGrow Alerts',
                importance: Notifications.AndroidImportance.HIGH,
            });
            androidChannelReady = true;
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        if (existing === 'granted') return true;

        const alreadyAsked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
        if (alreadyAsked) return false; // user already said no once — don't nag every launch

        await AsyncStorage.setItem(PERMISSION_ASKED_KEY, '1');
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    } catch (err) {
        console.error('[notify] permission error:', err);
        return false;
    }
}

interface CreateNotificationInput {
    farmId: string;
    title: string;
    message: string;
    type: NotificationType;
    category: NotificationCategory;
    actionUrl?: string;
}

/** Inserts a farm-wide notification row (user_id left null, matching the
 *  existing read-side "mine OR my farm's" query pattern) and fires a local
 *  device notification alongside it. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
    try {
        const { error } = await supabase.from('notifications').insert({
            farm_id: input.farmId,
            user_id: null,
            title: input.title,
            message: input.message,
            type: input.type,
            category: input.category,
            action_url: input.actionUrl ?? null,
        });
        if (error) throw error;
    } catch (err) {
        console.error('[notify] insert error:', err);
        // Still try the local notification below — a DB write failure
        // shouldn't also silently swallow the on-device alert.
    }

    try {
        const granted = await ensureNotificationPermission();
        if (!granted) return;
        await Notifications.scheduleNotificationAsync({
            content: { title: input.title, body: input.message },
            trigger: null, // fire immediately
        });
    } catch (err) {
        console.error('[notify] local notification error:', err);
    }
}

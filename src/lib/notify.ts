// Shared notification-creation helper — the single place that writes to the
// `notifications` table and fires a matching local device notification.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

let androidChannelReady = false;

export type NotificationCategory =
    | 'farm_registered'
    | 'device_alert'
    | 'weight_alert'
    | 'feed_alert'
    | 'health_alert'
    | 'system'
    | 'invite'
    | 'ai_suggestion';

export type NotificationType = 'info' | 'warning' | 'error' | 'success';

export const NOTIFICATION_CATEGORY_PRIORITY: Record<string, number> = {
    device_alert: 4,
    weight_alert: 3,
    feed_alert: 2,
    health_alert: 1,
    ai_suggestion: 1,
    system: 0,
    invite: 0,
    farm_registered: 0,
};

export function categoryPriority(category: string | null | undefined): number {
    if (!category) return 0;
    return NOTIFICATION_CATEGORY_PRIORITY[category] ?? 0;
}

/** Sorts notifications chronologically: newest-first (most recent first). */
export function sortByPriority<T extends { created_at: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

export const PUSH_NOTIFS_ENABLED_KEY = '@anigrow_push_notifications_enabled';
export const EMAIL_NOTIFS_ENABLED_KEY = '@anigrow_email_notifications_enabled';
export const MARKETING_NOTIFS_ENABLED_KEY = '@anigrow_marketing_notifications_enabled';

/** Checks whether push notifications are enabled by the user in app settings. */
export async function isPushNotificationEnabled(): Promise<boolean> {
    try {
        const val = await AsyncStorage.getItem(PUSH_NOTIFS_ENABLED_KEY);
        if (val === null) return true; // enabled by default
        return val === 'true';
    } catch {
        return true;
    }
}

/** Saves user's push notification preference. */
export async function setPushNotificationEnabled(enabled: boolean): Promise<void> {
    try {
        await AsyncStorage.setItem(PUSH_NOTIFS_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (err) {
        console.error('[notify] setPushNotificationEnabled error:', err);
    }
}

const PERMISSION_ASKED_KEY = 'notif_permission_asked';

/** Requests notification permission once ever (per install). */
export async function ensureNotificationPermission(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
        if (Platform.OS === 'android' && !androidChannelReady) {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'AniGrow Notifications',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#16A34A',
            });
            androidChannelReady = true;
        }

        const isEnabled = await isPushNotificationEnabled();
        if (!isEnabled) return false;

        const { status: existing } = await Notifications.getPermissionsAsync();
        if (existing === 'granted') return true;

        const alreadyAsked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
        if (alreadyAsked) return false;

        await AsyncStorage.setItem(PERMISSION_ASKED_KEY, '1');
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    } catch (err) {
        console.error('[notify] permission error:', err);
        return false;
    }
}

/** Determines whether a user has permission to view/receive this notification based on their assigned menu permissions. */
export function canUserViewNotification(
    category: string | null | undefined,
    actionUrl: string | null | undefined,
    hasPermission: (perm: string) => boolean,
    role?: string | null
): boolean {
    if (role === 'admin' || role === 'farm_admin' || role === 'owner' || role === 'super_admin') {
        return true;
    }

    const url = (actionUrl || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    // Devices & Feeding module
    if (
        cat === 'device_alert' ||
        cat === 'feed_alert' ||
        cat === 'weight_alert' ||
        url.includes('/(devices)') ||
        url.includes('recentlogsscreen') ||
        url.includes('dispenserecordsscreen') ||
        url.includes('managefeedsscreen')
    ) {
        return hasPermission('devices:view') || hasPermission('devices');
    }

    // Health module
    if (
        cat === 'health_alert' ||
        url.includes('/(health)') ||
        url.includes('vaccinescreen') ||
        url.includes('healthrecordsscreen')
    ) {
        return hasPermission('health:view') || hasPermission('health');
    }

    // Animals module
    if (
        url.includes('/(animals)') ||
        url.includes('animalsscreen') ||
        url.includes('animaldetails') ||
        url.includes('mortalityrecordsscreen')
    ) {
        return hasPermission('animals:view') || hasPermission('animals') || hasPermission('health:view');
    }

    // Analytics module
    if (
        url.includes('/(analytics)') ||
        url.includes('analyticsscreen') ||
        url.includes('growthreportscreen') ||
        url.includes('feedreportscreen') ||
        url.includes('healthreportscreen')
    ) {
        return hasPermission('reports:view') || hasPermission('analytics');
    }

    // Guide & AI module
    if (
        cat === 'ai_suggestion' ||
        url.includes('/(guide)') ||
        url.includes('guidescreen') ||
        url.includes('/(ai)') ||
        url.includes('aiassistantscreen')
    ) {
        return hasPermission('ai_assistant:use') || hasPermission('guide');
    }

    return true;
}

interface CreateNotificationInput {
    farmId: string;
    farmName?: string;
    title: string;
    message: string;
    type: NotificationType;
    category: NotificationCategory;
    actionUrl?: string;
    skipLocalPush?: boolean;
}

const recentNotificationCache = new Set<string>();

/** Inserts a notification row into `notifications` table and fires a formal, local device push notification. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
    // Format formal title with Farm Name prefix if available and not already formatted
    let formattedTitle = input.title.trim();
    if (input.farmName && !formattedTitle.startsWith('[')) {
        formattedTitle = `[${input.farmName}] ${formattedTitle}`;
    }

    // Deduplication key per farm, title, message within the current day
    const today = new Date().toLocaleDateString('en-CA');
    const dedupeKey = `${input.farmId}::${input.category}::${formattedTitle}::${input.message.trim()}::${today}`;
    if (recentNotificationCache.has(dedupeKey)) {
        return; // Prevent duplicate dispatch within the same session/day
    }
    recentNotificationCache.add(dedupeKey);

    // Also check Supabase DB for recent identical notification within the last 1 hour
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
            .from('notifications')
            .select('id')
            .eq('farm_id', input.farmId)
            .eq('title', formattedTitle)
            .eq('message', input.message)
            .gte('created_at', oneHourAgo)
            .limit(1);

        if (existing && existing.length > 0) {
            return; // Duplicate already exists in DB
        }
    } catch {
        /* proceed to insert if select check encounters network error */
    }

    try {
        const { error } = await supabase.from('notifications').insert({
            farm_id: input.farmId,
            user_id: null,
            title: formattedTitle,
            message: input.message,
            type: input.type,
            category: input.category,
            action_url: input.actionUrl ?? null,
        });
        if (error) throw error;
    } catch (err) {
        console.error('[notify] insert error:', err);
    }

    if (input.skipLocalPush) return;

    try {
        const granted = await ensureNotificationPermission();
        if (!granted) return;
        await Notifications.scheduleNotificationAsync({
            content: {
                title: formattedTitle,
                body: input.message,
                data: { actionUrl: input.actionUrl, farmId: input.farmId },
            },
            trigger: null,
        });
    } catch (err) {
        console.error('[notify] local notification error:', err);
    }
}

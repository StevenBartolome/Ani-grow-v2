import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { createNotification, ensureNotificationPermission } from '@/lib/notify';

export type ReminderMode = 'interval' | 'weekly' | 'milestones' | 'inactivity';

export interface WeighingReminderConfig {
    deviceId: string;
    farmId: string;
    housingId: string | null;
    housingName?: string;
    batchId: string | null;
    batchName?: string;
    enabled: boolean;
    mode: ReminderMode;
    intervalDays: number;     // e.g. 3, 5, 7, 14
    daysOfWeek: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
    milestoneDays: number[];  // e.g. [7, 14, 21, 28, 35, 42]
    inactivityDays: number;   // e.g. 5 days without weighing
    reminderTime: string;     // '08:00' (HH:mm 24h format)
    lastNotifiedDate?: string | null;
}

const STORAGE_PREFIX = 'aniweigh_reminder_';
const ALL_CONFIGS_KEY = 'aniweigh_reminder_device_ids';

function getStorageKey(deviceId: string): string {
    return `${STORAGE_PREFIX}${deviceId}`;
}

function todayDateString(): string {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local time
}

function parseTime(timeStr: string): { hour: number; minute: number } {
    const parts = (timeStr || '08:00').split(':');
    const hour = parseInt(parts[0], 10) || 8;
    const minute = parseInt(parts[1], 10) || 0;
    return { hour, minute };
}

/** Retrieve weighing reminder configuration for a specific AniWeigh device */
export async function getWeighingReminder(deviceId: string): Promise<WeighingReminderConfig | null> {
    if (!deviceId) return null;
    try {
        const raw = await AsyncStorage.getItem(getStorageKey(deviceId));
        if (!raw) return null;
        return JSON.parse(raw) as WeighingReminderConfig;
    } catch (err) {
        console.error('[weighingReminders] get error:', err);
        return null;
    }
}

/** Save weighing reminder configuration and schedule local device push notification */
export async function saveWeighingReminder(config: WeighingReminderConfig): Promise<void> {
    if (!config.deviceId) return;
    try {
        await AsyncStorage.setItem(getStorageKey(config.deviceId), JSON.stringify(config));

        // Keep registry of all device IDs that have reminders
        const idsRaw = await AsyncStorage.getItem(ALL_CONFIGS_KEY);
        const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
        if (!ids.includes(config.deviceId)) {
            ids.push(config.deviceId);
            await AsyncStorage.setItem(ALL_CONFIGS_KEY, JSON.stringify(ids));
        }

        if (config.enabled) {
            await scheduleLocalWeighingNotification(config);
        } else {
            await cancelLocalWeighingNotification(config.deviceId);
        }
    } catch (err) {
        console.error('[weighingReminders] save error:', err);
    }
}

/** Cancel any scheduled local notifications for an AniWeigh device */
export async function cancelLocalWeighingNotification(deviceId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
        const identifier = `aniweigh-reminder-${deviceId}`;
        await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch (err) {
        console.error('[weighingReminders] cancel error:', err);
    }
}

/**
 * Schedule offline local device notification with expo-notifications.
 * This triggers on the device at the set time even if the app is closed.
 */
export async function scheduleLocalWeighingNotification(
    config: WeighingReminderConfig
): Promise<void> {
    if (Platform.OS === 'web' || !config.enabled) return;

    try {
        const granted = await ensureNotificationPermission();
        if (!granted) return;

        const identifier = `aniweigh-reminder-${config.deviceId}`;
        // Clear previous schedule for this device
        await Notifications.cancelScheduledNotificationAsync(identifier);

        const { hour, minute } = parseTime(config.reminderTime);
        const title = `Weighing Session Reminder`;
        const targetLabel = config.batchName
            ? `for batch "${config.batchName}"`
            : config.housingName
            ? `for housing "${config.housingName}"`
            : 'for your livestock';

        let body = `Time to record a weighing session ${targetLabel}.`;
        if (config.mode === 'interval') {
            body = `Regular weighing check ${targetLabel} (every ${config.intervalDays} days).`;
        } else if (config.mode === 'weekly') {
            body = `Scheduled weekly weigh-in ${targetLabel}.`;
        } else if (config.mode === 'milestones') {
            body = `Growth milestone weigh-in ${targetLabel}.`;
        } else if (config.mode === 'inactivity') {
            body = `No recent weighing recorded ${targetLabel} in over ${config.inactivityDays} days.`;
        }

        // Schedule recurring notification based on time of day
        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                title,
                body,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId}`,
                    type: 'weight_alert',
                },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour,
                minute,
                repeats: true,
            } as any,
        });
    } catch (err) {
        console.error('[weighingReminders] schedule error:', err);
    }
}

/**
 * Validates whether the batch associated with the device is active.
 * Only active batches are eligible for weighing session reminders.
 */
export async function validateActiveBatch(batchId: string | null): Promise<{
    isActive: boolean;
    batchName: string | null;
    arrivalDate: string | null;
    currentAgeDays: number;
}> {
    if (!batchId) {
        return { isActive: true, batchName: null, arrivalDate: null, currentAgeDays: 0 };
    }

    try {
        const { data, error } = await supabase
            .from('batches')
            .select('id, name, status, arrival_date, age_at_arrival_days')
            .eq('id', batchId)
            .single();

        if (error || !data) {
            return { isActive: false, batchName: null, arrivalDate: null, currentAgeDays: 0 };
        }

        const isActive = (data.status || '').toLowerCase() === 'active';
        let currentAgeDays = data.age_at_arrival_days || 0;
        if (data.arrival_date) {
            const arr = new Date(data.arrival_date + 'T00:00:00');
            const today = new Date();
            arr.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const diff = Math.floor((today.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
            currentAgeDays += Math.max(0, diff);
        }

        return {
            isActive,
            batchName: data.name || null,
            arrivalDate: data.arrival_date || null,
            currentAgeDays,
        };
    } catch {
        return { isActive: false, batchName: null, arrivalDate: null, currentAgeDays: 0 };
    }
}

/**
 * Background checker called by NotificationWatcher on app open and periodic intervals.
 * Checks all active weighing reminders for active farms, validates active batches,
 * and creates persistent notifications in the `notifications` table.
 */
export async function checkAndTriggerWeighingReminders(activeFarmIds: string[]): Promise<void> {
    if (!activeFarmIds || activeFarmIds.length === 0) return;

    try {
        const idsRaw = await AsyncStorage.getItem(ALL_CONFIGS_KEY);
        if (!idsRaw) return;
        const deviceIds: string[] = JSON.parse(idsRaw);
        if (!Array.isArray(deviceIds) || deviceIds.length === 0) return;

        const today = todayDateString();
        const now = new Date();
        const currentDayOfWeek = now.getDay(); // 0 = Sunday

        for (const devId of deviceIds) {
            const config = await getWeighingReminder(devId);
            if (!config || !config.enabled || !activeFarmIds.includes(config.farmId)) {
                continue;
            }

            // 1. Batch Validation: ONLY notify if batch is active
            if (config.batchId) {
                const batchCheck = await validateActiveBatch(config.batchId);
                if (!batchCheck.isActive) {
                    // Batch is completed or archived — cancel reminder for this device
                    await cancelLocalWeighingNotification(config.deviceId);
                    continue;
                }
            }

            // Check if already notified today
            if (config.lastNotifiedDate === today) {
                continue;
            }

            // Fetch last weighing session timestamp for this device/batch
            let lastWeighQuery = supabase
                .from('weighing_sessions')
                .select('created_at, status')
                .eq('device_id', config.deviceId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (config.batchId) {
                lastWeighQuery = lastWeighQuery.eq('batch_id', config.batchId);
            }

            const { data: lastSessions } = await lastWeighQuery;
            const lastSession = lastSessions && lastSessions.length > 0 ? lastSessions[0] : null;

            let lastWeighedDaysAgo = 999;
            if (lastSession?.created_at) {
                const lastDate = new Date(lastSession.created_at);
                lastDate.setHours(0, 0, 0, 0);
                const todayObj = new Date();
                todayObj.setHours(0, 0, 0, 0);
                lastWeighedDaysAgo = Math.floor((todayObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            }

            let shouldNotify = false;
            let reason = '';

            if (config.mode === 'interval') {
                const interval = Math.max(1, config.intervalDays || 7);
                if (lastWeighedDaysAgo >= interval) {
                    shouldNotify = true;
                    reason = `Last session was ${lastWeighedDaysAgo === 999 ? 'never' : `${lastWeighedDaysAgo} day(s) ago`} (scheduled every ${interval} days).`;
                }
            } else if (config.mode === 'weekly') {
                const selectedDays = config.daysOfWeek || [1]; // default Monday
                if (selectedDays.includes(currentDayOfWeek)) {
                    shouldNotify = true;
                    reason = `Weekly weighing is scheduled for today.`;
                }
            } else if (config.mode === 'inactivity') {
                const threshold = Math.max(1, config.inactivityDays || 5);
                if (lastWeighedDaysAgo >= threshold) {
                    shouldNotify = true;
                    reason = `No weighing session has been recorded in ${lastWeighedDaysAgo === 999 ? 'a while' : `${lastWeighedDaysAgo} days`}.`;
                }
            } else if (config.mode === 'milestones' && config.batchId) {
                const batchCheck = await validateActiveBatch(config.batchId);
                const milestones = config.milestoneDays || [7, 14, 21, 28, 35, 42];
                if (milestones.includes(batchCheck.currentAgeDays)) {
                    shouldNotify = true;
                    reason = `Batch reached growth milestone Day ${batchCheck.currentAgeDays}.`;
                }
            }

            if (shouldNotify) {
                const targetLabel = config.batchName
                    ? `Batch "${config.batchName}"`
                    : config.housingName
                    ? `Housing "${config.housingName}"`
                    : 'Animals';

                await createNotification({
                    farmId: config.farmId,
                    category: 'weight_alert',
                    type: 'info',
                    title: `Weighing Reminder: ${targetLabel}`,
                    message: `Time to perform a weighing session. ${reason}`,
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId}`,
                });

                // Update last notified date
                config.lastNotifiedDate = today;
                await AsyncStorage.setItem(getStorageKey(config.deviceId), JSON.stringify(config));
            }
        }
    } catch (err) {
        console.error('[weighingReminders] check error:', err);
    }
}

/**
 * Mock / Test trigger for a weighing reminder.
 * Fired instantly to verify in-app notifications and local device banners even if device is offline.
 */
export async function triggerTestWeighingReminder(config: WeighingReminderConfig): Promise<void> {
    try {
        const targetLabel = config.batchName
            ? `Batch "${config.batchName}"`
            : config.housingName
            ? `Housing "${config.housingName}"`
            : 'Livestock';

        let modeDesc = `Mode: Every ${config.intervalDays || 7} days`;
        if (config.mode === 'weekly') modeDesc = 'Mode: Weekly Days';
        else if (config.mode === 'inactivity') modeDesc = `Mode: Inactivity (> ${config.inactivityDays || 5} days)`;
        else if (config.mode === 'milestones') modeDesc = 'Mode: Growth Milestones';

        // 1. In-app notification
        await createNotification({
            farmId: config.farmId || '',
            category: 'weight_alert',
            type: 'info',
            title: `Weighing Reminder: ${targetLabel}`,
            message: `Time for a scheduled weighing session (${modeDesc}).`,
            actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
        });

        // 2. Immediate local device push banner
        if (Platform.OS !== 'web') {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `Weighing Reminder: ${targetLabel}`,
                    body: `Scheduled weigh-in alert (${modeDesc}). Tap to open AniWeigh.`,
                    sound: true,
                    data: {
                        actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
                        type: 'weight_alert',
                    },
                },
                trigger: null, // trigger immediately
            });
        }
    } catch (err) {
        console.error('[triggerTestWeighingReminder] error:', err);
    }
}


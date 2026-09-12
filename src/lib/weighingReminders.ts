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
        await Notifications.cancelScheduledNotificationAsync(`aniweigh-reminder-${deviceId}`);
        await Notifications.cancelScheduledNotificationAsync(`aniweigh-reminder-1hr-${deviceId}`);
    } catch (err) {
        console.error('[weighingReminders] cancel error:', err);
    }
}

/**
 * Schedule offline local device notification with expo-notifications.
 * This triggers on the device at the set time even if the app is closed.
 * Schedules BOTH:
 * 1. 1 Hour Before starting time (e.g. at 07:00 if scheduled for 08:00)
 * 2. Exact start time (e.g. at 08:00)
 */
export async function scheduleLocalWeighingNotification(
    config: WeighingReminderConfig
): Promise<void> {
    if (Platform.OS === 'web' || !config.enabled) return;

    try {
        const granted = await ensureNotificationPermission();
        if (!granted) return;

        const mainIdentifier = `aniweigh-reminder-${config.deviceId}`;
        const hourBeforeIdentifier = `aniweigh-reminder-1hr-${config.deviceId}`;

        // Clear previous schedules for this device
        await Notifications.cancelScheduledNotificationAsync(mainIdentifier);
        await Notifications.cancelScheduledNotificationAsync(hourBeforeIdentifier);

        const { hour, minute } = parseTime(config.reminderTime);
        const targetLabel = config.batchName
            ? `for batch "${config.batchName}"`
            : config.housingName
            ? `for housing "${config.housingName}"`
            : 'for your livestock';

        let strategyDesc = '';
        if (config.mode === 'interval') strategyDesc = `(every ${config.intervalDays} days)`;
        else if (config.mode === 'weekly') strategyDesc = '(weekly schedule)';
        else if (config.mode === 'milestones') strategyDesc = '(growth milestone)';
        else if (config.mode === 'inactivity') strategyDesc = `(inactivity threshold ${config.inactivityDays}d)`;

        // ── 1. Schedule 1 Hour Before Notification ──
        let hourBefore = hour - 1;
        if (hourBefore < 0) hourBefore = 23;

        await Notifications.scheduleNotificationAsync({
            identifier: hourBeforeIdentifier,
            content: {
                title: 'Scheduled Weighing Session in 1 Hour',
                body: `A scheduled weighing session ${targetLabel} is set to begin in 1 hour (at ${config.reminderTime}) ${strategyDesc}. Please ensure scales and crates are prepared.`,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId}`,
                    type: 'weight_alert',
                },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour: hourBefore,
                minute,
                repeats: true,
            } as any,
        });

        // ── 2. Schedule Exact Starting Time Notification ──
        await Notifications.scheduleNotificationAsync({
            identifier: mainIdentifier,
            content: {
                title: 'Weighing Session Starting Now',
                body: `The scheduled weighing session ${targetLabel} is starting now ${strategyDesc}. Please proceed with live animal scaling.`,
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

async function getDaysSinceLastWeighing(batchId: string | null, deviceId?: string): Promise<number> {
    try {
        let lastWeighQuery = supabase
            .from('weighing_sessions')
            .select('created_at, status')
            .order('created_at', { ascending: false })
            .limit(1);

        if (deviceId) {
            lastWeighQuery = lastWeighQuery.eq('device_id', deviceId);
        }
        if (batchId) {
            lastWeighQuery = lastWeighQuery.eq('batch_id', batchId);
        }

        const { data: lastSessions } = await lastWeighQuery;
        const lastSession = lastSessions && lastSessions.length > 0 ? lastSessions[0] : null;

        if (!lastSession?.created_at) return 999;

        const lastDate = new Date(lastSession.created_at);
        lastDate.setHours(0, 0, 0, 0);
        const todayObj = new Date();
        todayObj.setHours(0, 0, 0, 0);
        return Math.floor((todayObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
        return 999;
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
                    continue;
                }
            }

            // 2. Check if already notified today
            if (config.lastNotifiedDate === today) {
                continue;
            }

            // 3. Evaluate Reminder Strategy
            const lastWeighedDaysAgo = await getDaysSinceLastWeighing(config.batchId, config.deviceId);
            let shouldNotify = false;
            let formalTitle = 'Scheduled Weighing Session';
            let formalMessage = '';

            const targetLabel = config.batchName
                ? `Batch "${config.batchName}"`
                : config.housingName
                ? `Housing "${config.housingName}"`
                : 'Animals';

            if (config.mode === 'interval') {
                const interval = Math.max(1, config.intervalDays || 7);
                if (lastWeighedDaysAgo >= interval) {
                    shouldNotify = true;
                    formalTitle = `Scheduled Weighing: ${targetLabel}`;
                    formalMessage = `A recurring weighing session for ${targetLabel} is scheduled for today (every ${interval} days). Please perform weight sampling.\n\nTap to open scale.`;
                }
            } else if (config.mode === 'weekly') {
                const days = config.daysOfWeek || [1, 4];
                if (days.includes(currentDayOfWeek)) {
                    shouldNotify = true;
                    formalTitle = `Scheduled Weighing: ${targetLabel}`;
                    formalMessage = `A weekly scheduled weighing session for ${targetLabel} is due today. Please conduct animal weight assessment.\n\nTap to open scale.`;
                }
            } else if (config.mode === 'inactivity') {
                const threshold = Math.max(1, config.inactivityDays || 5);
                if (lastWeighedDaysAgo >= threshold) {
                    shouldNotify = true;
                    formalTitle = `Weighing Inactivity Notice: ${targetLabel}`;
                    formalMessage = `No weight records have been logged for ${targetLabel} in ${lastWeighedDaysAgo === 999 ? threshold : lastWeighedDaysAgo} days. Regular weight recording is required for growth tracking.\n\nTap to open scale.`;
                }
            } else if (config.mode === 'milestones' && config.batchId) {
                const batchCheck = await validateActiveBatch(config.batchId);
                const milestones = config.milestoneDays || [7, 14, 21, 28, 35, 42];
                if (milestones.includes(batchCheck.currentAgeDays)) {
                    shouldNotify = true;
                    formalTitle = `Growth Milestone Weigh-In: ${targetLabel}`;
                    formalMessage = `Batch ${targetLabel} has reached the Day ${batchCheck.currentAgeDays} growth milestone. Please conduct the scheduled weight assessment.\n\nTap to open scale.`;
                }
            }

            if (shouldNotify) {
                await createNotification({
                    farmId: config.farmId,
                    category: 'weight_alert',
                    type: 'info',
                    title: formalTitle,
                    message: formalMessage,
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

// ─── Helper for Target Label ─────────────────────────────────────────
function getTargetLabel(config: WeighingReminderConfig): string {
    return config.batchName
        ? `Batch "${config.batchName}"`
        : config.housingName
        ? `Housing "${config.housingName}"`
        : 'Livestock';
}

/**
 * Mock / Test Trigger: 1 Hour Before Reminder
 */
export async function triggerTest1HourBeforeReminder(config: WeighingReminderConfig): Promise<void> {
    const targetLabel = getTargetLabel(config);
    const alertTime = config.reminderTime || '08:00';

    await createNotification({
        farmId: config.farmId || '',
        category: 'weight_alert',
        type: 'info',
        title: 'Scheduled Weighing in 1 Hour',
        message: `A scheduled weighing session for ${targetLabel} will commence in 1 hour (at ${alertTime}). Please verify that scales and holding equipment are prepared.\n\nTap to open scale and begin setup.`,
        actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
    });

    if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Scheduled Weighing in 1 Hour',
                body: `Scheduled session for ${targetLabel} starts in 1 hour (at ${alertTime}). Please prepare scales.`,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
                    type: 'weight_alert',
                },
            },
            trigger: null,
        });
    }
}

/**
 * Mock / Test Trigger: Starting Now Reminder
 */
export async function triggerTestStartingNowReminder(config: WeighingReminderConfig): Promise<void> {
    const targetLabel = getTargetLabel(config);

    await createNotification({
        farmId: config.farmId || '',
        category: 'weight_alert',
        type: 'info',
        title: 'Weighing Session Starting Now',
        message: `The scheduled weighing session for ${targetLabel} is starting now. Please proceed with live animal scaling.\n\nTap to connect scale and record weights.`,
        actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
    });

    if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Weighing Session Starting Now',
                body: `Weighing session for ${targetLabel} is starting now. Tap to connect scale and record weights.`,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
                    type: 'weight_alert',
                },
            },
            trigger: null,
        });
    }
}

/**
 * Mock / Test Trigger: Inactivity Notice
 */
export async function triggerTestInactivityReminder(config: WeighingReminderConfig): Promise<void> {
    const targetLabel = getTargetLabel(config);
    const days = config.inactivityDays || 5;

    await createNotification({
        farmId: config.farmId || '',
        category: 'weight_alert',
        type: 'info',
        title: `Weighing Inactivity Notice: ${targetLabel}`,
        message: `No weight records have been logged for ${targetLabel} in ${days} days. Regular weight monitoring is required to maintain accurate growth analytics.\n\nTap to open scale and record weights.`,
        actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
    });

    if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `Weighing Inactivity Notice: ${targetLabel}`,
                body: `No weight records logged in ${days} days. Tap to record weights.`,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
                    type: 'weight_alert',
                },
            },
            trigger: null,
        });
    }
}

/**
 * Mock / Test Trigger: Growth Milestone Alert
 */
export async function triggerTestMilestoneReminder(config: WeighingReminderConfig): Promise<void> {
    const targetLabel = getTargetLabel(config);
    const milestoneDay = config.milestoneDays?.[0] || 14;

    await createNotification({
        farmId: config.farmId || '',
        category: 'weight_alert',
        type: 'info',
        title: `Growth Milestone Weigh-In: ${targetLabel}`,
        message: `Batch ${targetLabel} has reached the Day ${milestoneDay} growth milestone. Please conduct the scheduled weight assessment to evaluate herd development.\n\nTap to open scale.`,
        actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
    });

    if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `Growth Milestone Weigh-In: ${targetLabel}`,
                body: `Batch ${targetLabel} reached Day ${milestoneDay} milestone. Tap to open AniWeigh scale.`,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
                    type: 'weight_alert',
                },
            },
            trigger: null,
        });
    }
}

/**
 * Mock / Test Trigger: Delayed Reminder (5s, 30s, 60s)
 * Uses OS timer so the user can completely close / kill the app and see the phone banner pop up!
 */
export async function triggerTestDelayedReminder(
    config: WeighingReminderConfig,
    delaySeconds: number = 5
): Promise<void> {
    const targetLabel = getTargetLabel(config);

    await createNotification({
        farmId: config.farmId || '',
        category: 'weight_alert',
        type: 'info',
        title: 'Weighing Session Starting Now',
        message: `The scheduled weighing session for ${targetLabel} is starting now. Please proceed with live animal scaling.\n\nTap to connect scale and record weights.`,
        actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
        skipLocalPush: true,
    });

    if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Weighing Session Starting Now',
                body: `Weighing session for ${targetLabel} is starting now. Tap to connect scale and record weights.`,
                sound: true,
                data: {
                    actionUrl: `/(devices)/AniWeighScreen?deviceId=${config.deviceId || ''}`,
                    type: 'weight_alert',
                },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(1, delaySeconds),
                repeats: false,
            } as any,
        });
    }
}

/**
 * General Mock / Test trigger for a weighing reminder.
 */
export async function triggerTestWeighingReminder(
    config: WeighingReminderConfig,
    scenario?: '1hr' | 'start' | 'inactivity' | 'milestone' | 'delay5s' | 'delay30s' | 'delay60s'
): Promise<void> {
    switch (scenario) {
        case 'delay5s':
            return triggerTestDelayedReminder(config, 5);
        case 'delay30s':
            return triggerTestDelayedReminder(config, 30);
        case 'delay60s':
            return triggerTestDelayedReminder(config, 60);
        case '1hr':
            return triggerTest1HourBeforeReminder(config);
        case 'inactivity':
            return triggerTestInactivityReminder(config);
        case 'milestone':
            return triggerTestMilestoneReminder(config);
        case 'start':
        default:
            return triggerTestStartingNowReminder(config);
    }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ensureNotificationPermission, canUserViewNotification } from '@/lib/notify';
import { getEffectiveRoadmap, sortActionsByDay, isDayMatching } from '@/lib/roadmapService';
import { type GuidePhaseItem } from '@/constants/guideMockData';

const LOW_STOCK_THRESHOLD_KG = 5;
const DEFAULT_MORNING_HOUR = 7;
const DEFAULT_MORNING_MINUTE = 0;

function todayDateString(): string {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local time
}

function calculateBatchDay(arrivalDateStr?: string, ageAtArrivalDays: number = 1): number {
    if (!arrivalDateStr) return 1;
    const arr = new Date(arrivalDateStr.split('T')[0]);
    const today = new Date(todayDateString());
    arr.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + (ageAtArrivalDays || 1));
}

function getCoreActionForDay(phases: GuidePhaseItem[], day: number): {
    phaseName: string;
    coreAction: string;
    targetTemp: string;
    targetWeight: string;
} {
    const phase = phases.find(p => day >= p.dayStart && day <= p.dayEnd) || phases[phases.length - 1];
    if (!phase) {
        return {
            phaseName: 'Care Phase',
            coreAction: 'Follow standard daily feeding and animal health protocol.',
            targetTemp: '',
            targetWeight: '',
        };
    }
    const sortedActions = sortActionsByDay(phase.fullGuideActions || []);
    const matched = sortedActions.filter(act => isDayMatching(act.dayTag, day));
    let coreAction = matched.length > 0
        ? matched[0].action
        : (phase.todayAction || phase.actionable || 'Follow standard daily feeding and hygiene protocol.');
    coreAction = coreAction.replace(/^Action:\s*/i, '').trim();

    return {
        phaseName: phase.name,
        coreAction,
        targetTemp: phase.targetTemp,
        targetWeight: phase.targetWeight,
    };
}

/**
 * Schedules all applicable real device OS push notifications:
 * 1. Daily morning briefing (7:00 AM daily)
 * 2. Scheduled Vet Visits / Consultations (7:00 AM on the day of the visit)
 * 3. Scheduled Vaccinations (7:00 AM on the day of vaccination)
 * 4. Scheduled Feed Dispense alerts (1 hour before dispense time, daily)
 */
export async function syncAllScheduledNotifications(farmIds: string[]): Promise<void> {
    if (Platform.OS === 'web' || !farmIds || farmIds.length === 0) return;

    try {
        const granted = await ensureNotificationPermission();
        if (!granted) return;

        await Promise.all([
            scheduleDailyMorningBriefing(farmIds),
            scheduleUpcomingVetVisits(farmIds),
            scheduleUpcomingVaccinations(farmIds),
            scheduleFeedDispenseReminders(farmIds),
        ]);
    } catch (err) {
        console.error('[notificationScheduler] syncAllScheduledNotifications error:', err);
    }
}

/**
 * 1. Schedule Daily Morning Briefing at 7:00 AM every day
 */
export async function scheduleDailyMorningBriefing(farmIds: string[]): Promise<void> {
    if (Platform.OS === 'web' || !farmIds.length) return;

    try {
        const primaryFarmId = farmIds[0];
        const today = todayDateString();

        // 1. Fetch active batches
        const { data: batches } = await supabase
            .from('batches')
            .select('id, farm_id, name, animal_type, arrival_date, age_at_arrival_days, housings(name, farm_id)')
            .in('status', ['active']);

        const farmBatches = (batches || []).filter((b: any) => {
            return b.farm_id === primaryFarmId || b.housings?.farm_id === primaryFarmId;
        });

        const pigBatches = farmBatches.filter((b: any) => b.animal_type === 'pig');
        const chickenBatches = farmBatches.filter((b: any) => b.animal_type === 'chicken');

        const hasPigs = pigBatches.length > 0;
        const hasChickens = chickenBatches.length > 0;

        let taskSummary = '';

        if (hasPigs && hasChickens) {
            const pigBatch = pigBatches[0];
            const pigDay = calculateBatchDay(pigBatch.arrival_date, pigBatch.age_at_arrival_days);
            const pigPhases = await getEffectiveRoadmap(primaryFarmId, 'pig', pigBatch.id);
            const pigInfo = getCoreActionForDay(pigPhases, pigDay);

            const chickenBatch = chickenBatches[0];
            const chickenDay = calculateBatchDay(chickenBatch.arrival_date, chickenBatch.age_at_arrival_days);
            const chickenPhases = await getEffectiveRoadmap(primaryFarmId, 'chicken', chickenBatch.id);
            const chickenInfo = getCoreActionForDay(chickenPhases, chickenDay);

            taskSummary = `Pigs (Day ${pigDay}): ${pigInfo.coreAction}\n\nChickens (Day ${chickenDay}): ${chickenInfo.coreAction}`;
        } else if (hasPigs) {
            const pigBatch = pigBatches[0];
            const pigDay = calculateBatchDay(pigBatch.arrival_date, pigBatch.age_at_arrival_days);
            const pigPhases = await getEffectiveRoadmap(primaryFarmId, 'pig', pigBatch.id);
            const pigInfo = getCoreActionForDay(pigPhases, pigDay);

            taskSummary = `Pigs (Day ${pigDay}, ${pigInfo.phaseName}):\n${pigInfo.coreAction}`;
        } else if (hasChickens) {
            const chickenBatch = chickenBatches[0];
            const chickenDay = calculateBatchDay(chickenBatch.arrival_date, chickenBatch.age_at_arrival_days);
            const chickenPhases = await getEffectiveRoadmap(primaryFarmId, 'chicken', chickenBatch.id);
            const chickenInfo = getCoreActionForDay(chickenPhases, chickenDay);

            taskSummary = `Chickens (Day ${chickenDay}, ${chickenInfo.phaseName}):\n${chickenInfo.coreAction}`;
        } else {
            const pigPhases = await getEffectiveRoadmap(primaryFarmId, 'pig');
            const defaultInfo = getCoreActionForDay(pigPhases, 1);
            taskSummary = `Daily SOP:\n${defaultInfo.coreAction}`;
        }

        const identifier = `daily-morning-briefing-${primaryFarmId}`;
        await Notifications.cancelScheduledNotificationAsync(identifier);

        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                title: 'Good Morning! Daily Briefing',
                body: `Good morning! Check your farm and today's SOP focus:\n\n${taskSummary}\n\nTap to check your farm and view Guide.`,
                sound: true,
                data: {
                    actionUrl: '/(guide)/GuideScreen',
                    type: 'ai_suggestion',
                    farmId: primaryFarmId,
                },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour: DEFAULT_MORNING_HOUR,
                minute: DEFAULT_MORNING_MINUTE,
                repeats: true,
            } as any,
        });
    } catch (err) {
        console.error('[notificationScheduler] scheduleDailyMorningBriefing error:', err);
    }
}

/**
 * 2. Schedule upcoming Vet Visits / Consultations at 7:00 AM on the day of the visit
 */
export async function scheduleUpcomingVetVisits(farmIds: string[]): Promise<void> {
    if (Platform.OS === 'web' || !farmIds.length) return;

    try {
        const today = todayDateString();
        const { data: records } = await supabase
            .from('health_records')
            .select('id, farm_id, title, notes, followup_date, housings(name)')
            .in('farm_id', farmIds)
            .gte('followup_date', today);

        if (!records) return;

        for (const rec of records as any[]) {
            if (!rec.followup_date) continue;
            const identifier = `vet-visit-${rec.id}`;
            await Notifications.cancelScheduledNotificationAsync(identifier);

            // Create target trigger date for 7:00 AM on followup_date
            const [year, month, day] = rec.followup_date.split('-').map(Number);
            const triggerDate = new Date(year, month - 1, day, DEFAULT_MORNING_HOUR, DEFAULT_MORNING_MINUTE, 0);

            if (triggerDate.getTime() > Date.now()) {
                const housingLabel = rec.housings?.name ? ` for ${rec.housings.name}` : '';
                await Notifications.scheduleNotificationAsync({
                    identifier,
                    content: {
                        title: 'Vet Visit Today',
                        body: `Good morning! Scheduled consultation${housingLabel} is scheduled for today. Check your farm and prepare for consultation.`,
                        sound: true,
                        data: {
                            actionUrl: '/(animals)/HealthRecordsScreen',
                            type: 'health_alert',
                            farmId: rec.farm_id,
                        },
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: triggerDate,
                    } as any,
                });
            }
        }
    } catch (err) {
        console.error('[notificationScheduler] scheduleUpcomingVetVisits error:', err);
    }
}

/**
 * 3. Schedule upcoming Vaccinations at 7:00 AM on the day of vaccination
 */
export async function scheduleUpcomingVaccinations(farmIds: string[]): Promise<void> {
    if (Platform.OS === 'web' || !farmIds.length) return;

    try {
        const today = todayDateString();
        const { data: schedules } = await supabase
            .from('vaccination_schedules')
            .select('id, vaccine_name, farm_id, scheduled_date, status, housings(name)')
            .in('farm_id', farmIds)
            .neq('status', 'completed')
            .neq('status', 'cancelled')
            .gte('scheduled_date', today);

        if (!schedules) return;

        for (const sch of schedules as any[]) {
            if (!sch.scheduled_date) continue;
            const identifier = `vaccine-due-${sch.id}`;
            await Notifications.cancelScheduledNotificationAsync(identifier);

            const [year, month, day] = sch.scheduled_date.split('-').map(Number);
            const triggerDate = new Date(year, month - 1, day, DEFAULT_MORNING_HOUR, DEFAULT_MORNING_MINUTE, 0);

            if (triggerDate.getTime() > Date.now()) {
                const housingLabel = sch.housings?.name ? ` in ${sch.housings.name}` : '';
                await Notifications.scheduleNotificationAsync({
                    identifier,
                    content: {
                        title: 'Vaccination Due Today',
                        body: `Good morning! Vaccination '${sch.vaccine_name}'${housingLabel} is scheduled for today. Check your vaccine supplies and administer as scheduled.`,
                        sound: true,
                        data: {
                            actionUrl: '/(health)/VaccineScreen',
                            type: 'health_alert',
                            farmId: sch.farm_id,
                        },
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: triggerDate,
                    } as any,
                });
            }
        }
    } catch (err) {
        console.error('[notificationScheduler] scheduleUpcomingVaccinations error:', err);
    }
}

/**
 * 4. Schedule Feed Dispenses 1 hour before scheduled dispense times (repeating daily)
 */
export async function scheduleFeedDispenseReminders(farmIds: string[]): Promise<void> {
    if (Platform.OS === 'web' || !farmIds.length) return;

    try {
        const { data: schedules } = await supabase
            .from('feed_schedules')
            .select('id, farm_id, dispense_times, grams_per_dispense, devices(name), housings(name)')
            .in('farm_id', farmIds);

        if (!schedules) return;

        for (const sch of schedules as any[]) {
            const times: string[] = sch.dispense_times || [];
            const feederName = sch.devices?.name || 'Feeder';
            const kg = (Number(sch.grams_per_dispense || 0) / 1000).toFixed(2);

            for (const t of times) {
                const identifier = `feed-dispense-1hr-${sch.id}-${t.replace(':', '')}`;
                await Notifications.cancelScheduledNotificationAsync(identifier);

                const [hour, min] = t.split(':').map(Number);
                let alarmHour = hour - 1;
                const alarmMin = min;
                if (alarmHour < 0) alarmHour = 23;

                await Notifications.scheduleNotificationAsync({
                    identifier,
                    content: {
                        title: 'Upcoming Feed Dispense',
                        body: `${feederName} is scheduled to dispense ${kg} kg in 1 hour (at ${t}).`,
                        sound: true,
                        data: {
                            actionUrl: '/(devices)/ManageFeedsScreen',
                            type: 'feed_alert',
                            farmId: sch.farm_id,
                        },
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                        hour: alarmHour,
                        minute: alarmMin,
                        repeats: true,
                    } as any,
                });
            }
        }
    } catch (err) {
        console.error('[notificationScheduler] scheduleFeedDispenseReminders error:', err);
    }
}

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { createNotification, canUserViewNotification } from '@/lib/notify';
import { getDeviceDisplayStatus, DeviceDisplayStatus } from '@/lib/deviceStatus';
import { checkAndTriggerWeighingReminders } from '@/lib/weighingReminders';
import { type GuidePhaseItem } from '@/constants/guideMockData';
import { getEffectiveRoadmap, sortActionsByDay, isDayMatching, getBatchActionLogs, getActionLogKey } from '@/lib/roadmapService';
import { syncAllScheduledNotifications } from '@/lib/notificationScheduler';

const DEVICE_POLL_INTERVAL_MS = 30_000;
const SCHEDULE_POLL_INTERVAL_MS = 60_000;
const LOW_STOCK_THRESHOLD_KG = 5;

function todayDateString(): string {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local time
}

function formatDisplayDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const monthIdx = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
        if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day) && !isNaN(year)) {
            return `${months[monthIdx]} ${day}, ${year}`;
        }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function currentTimeString(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function daysUntil(dateStr: string): number {
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date(todayDateString() + 'T00:00:00');
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function minutesDifference(timeStrA: string, timeStrB: string): number {
    const [hA, mA] = timeStrA.split(':').map(Number);
    const [hB, mB] = timeStrB.split(':').map(Number);
    return (hA * 60 + mA) - (hB * 60 + mB);
}

async function alreadyAlerted(key: string): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(key)) !== null;
    } catch {
        return false;
    }
}

async function markAlerted(key: string): Promise<void> {
    try {
        await AsyncStorage.setItem(key, '1');
    } catch {
        /* best-effort */
    }
}

async function clearAlerted(key: string): Promise<void> {
    try {
        await AsyncStorage.removeItem(key);
    } catch {
        /* best-effort */
    }
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

export function NotificationWatcher() {
    const { hasPermission, role } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmIdsRef = useRef<string[]>([]);
    farmIdsRef.current = activeFarmIds;

    const farmNamesRef = useRef<Record<string, string>>({});

    const getFarmName = useCallback((farmId: string): string => {
        return farmNamesRef.current[farmId] || 'Farm';
    }, []);

    // Fetch and cache farm names for multi-farm notification prefixing
    const fetchFarmNames = useCallback(async () => {
        if (!farmIdsRef.current.length) return;
        try {
            const { data } = await supabase
                .from('farms')
                .select('id, name')
                .in('id', farmIdsRef.current);
            if (data) {
                data.forEach((f: any) => {
                    farmNamesRef.current[f.id] = f.name;
                });
            }
        } catch (err) {
            console.warn('[NotificationWatcher] fetchFarmNames error:', err);
        }
    }, []);

    useEffect(() => {
        fetchFarmNames();
    }, [activeFarmIds, fetchFarmNames]);

    // ── Helper to create notifications with farm name prefix and permission check ──
    const dispatchNotification = useCallback(
        async (input: {
            farmId: string;
            category: 'device_alert' | 'weight_alert' | 'feed_alert' | 'health_alert' | 'system' | 'invite' | 'ai_suggestion';
            type: 'info' | 'warning' | 'error' | 'success';
            title: string;
            message: string;
            actionUrl?: string;
            skipLocalPush?: boolean;
        }) => {
            const farmName = getFarmName(input.farmId);
            const userCanReceive = canUserViewNotification(input.category, input.actionUrl, hasPermission, role);

            await createNotification({
                farmId: input.farmId,
                farmName,
                title: input.title,
                message: input.message,
                type: input.type,
                category: input.category,
                actionUrl: input.actionUrl,
                skipLocalPush: input.skipLocalPush || !userCanReceive,
            });
        },
        [getFarmName, hasPermission, role]
    );

    // ── 1. Device Online / Offline & Realtime Device Additions ──────────
    useEffect(() => {
        if (activeFarmIds.length === 0) return;

        const lastKnown = new Map<string, DeviceDisplayStatus>();
        let seeded = false;

        const tick = async () => {
            const { data, error } = await supabase
                .from('devices')
                .select('id, name, status, last_seen, farm_id, type')
                .in('farm_id', farmIdsRef.current);
            if (error || !data) return;

            for (const d of data as any[]) {
                const display = getDeviceDisplayStatus(d.status, d.last_seen);
                const prev = lastKnown.get(d.id);
                lastKnown.set(d.id, display);

                if (!seeded) continue;
                if (prev === undefined || prev === display) continue;
                if (prev === 'maintenance' || display === 'maintenance') continue;

                const nowOnline = display === 'online';
                await dispatchNotification({
                    farmId: d.farm_id,
                    category: 'device_alert',
                    type: nowOnline ? 'success' : 'error',
                    title: nowOnline ? 'Device Online' : 'Device Offline',
                    message: nowOnline
                        ? `${d.name} is now online and connected.`
                        : `${d.name} went offline. Please check its power and network connection.`,
                    actionUrl: `/(devices)/DeviceSettingsScreen?deviceId=${d.id}`,
                });
            }
            seeded = true;
        };

        tick();
        const interval = setInterval(tick, DEVICE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [activeFarmIds, dispatchNotification]);

    // ── 2. Realtime Event Listeners (Dispense, Sessions, Health, Devices) ────
    useEffect(() => {
        const uid = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        // A. Realtime New Device Registered
        const deviceChannel = supabase
            .channel(`notif-watch-devices-${uid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'devices' }, (payload) => {
                const row = payload.new as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;
                const typeLabel = row.type === 'anifeed' ? 'AniFeed' : row.type === 'aniweigh' ? 'AniWeigh' : 'Device';
                dispatchNotification({
                    farmId: row.farm_id,
                    category: 'device_alert',
                    type: 'info',
                    title: 'New Device Connected',
                    message: `${typeLabel} '${row.name}' was successfully registered.`,
                    actionUrl: `/(devices)/DeviceSettingsScreen?deviceId=${row.id}`,
                });
            })
            .subscribe();

        // B. Realtime Feed Dispensed Successfully
        const feedChannel = supabase
            .channel(`notif-watch-dispense-${uid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispense_records' }, (payload) => {
                const row = payload.new as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;
                if (row.status === 'success') {
                    const time = row.dispensed_at ? new Date(row.dispensed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : currentTimeString();
                    const kg = (Number(row.grams_dispensed || 0) / 1000).toFixed(2);
                    dispatchNotification({
                        farmId: row.farm_id,
                        category: 'feed_alert',
                        type: 'success',
                        title: 'Feed Dispensed',
                        message: `Feeder dispensed ${kg} kg of feed successfully at ${time}.`,
                        actionUrl: '/(devices)/DispenseRecordsScreen',
                    });
                } else if (row.status === 'error') {
                    dispatchNotification({
                        farmId: row.farm_id,
                        category: 'feed_alert',
                        type: 'error',
                        title: 'Feed Dispense Failed',
                        message: 'A scheduled feed dispense failed. Please check feeder mechanism and feed stock.',
                        actionUrl: '/(devices)/DispenseRecordsScreen',
                    });
                }
            })
            .subscribe();

        // C. Realtime Weighing Session Completed
        const sessionChannel = supabase
            .channel(`notif-watch-sessions-${uid}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'weighing_sessions' }, async (payload) => {
                const row = payload.new as any;
                const old = payload.old as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;
                if (row.status === 'completed' && old?.status !== 'completed') {
                    let housingLabel = 'pen';
                    if (row.housing_id) {
                        const { data: h } = await supabase.from('housings').select('name').eq('id', row.housing_id).single();
                        if (h?.name) housingLabel = h.name;
                    }
                    dispatchNotification({
                        farmId: row.farm_id,
                        category: 'weight_alert',
                        type: 'success',
                        title: 'Weighing Complete',
                        message: `Weighing session for ${housingLabel} finished. ${row.completed_quantity ?? 0} animal(s) recorded.`,
                        actionUrl: `/(weighing)/SessionReportScreen?sessionId=${row.id}`,
                    });
                }
            })
            .subscribe();

        // D. Realtime Health Records & Mortality
        const healthChannel = supabase
            .channel(`notif-watch-health-${uid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'health_records' }, async (payload) => {
                const row = payload.new as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;

                let housingName = 'Housing';
                if (row.housing_id) {
                    const { data: h } = await supabase.from('housings').select('name').eq('id', row.housing_id).single();
                    if (h?.name) housingName = h.name;
                }

                if (row.record_type === 'mortality') {
                    dispatchNotification({
                        farmId: row.farm_id,
                        category: 'health_alert',
                        type: 'error',
                        title: 'Mortality Recorded',
                        message: `${row.affected_count ?? 1} animal(s) reported in ${housingName}. ${row.notes ? `Note: ${row.notes}` : ''}`,
                        actionUrl: '/(animals)/HealthRecordsScreen',
                    });
                } else {
                    const details = row.medication ? `Medication: ${row.medication}` : row.notes || row.title || 'New record logged';
                    dispatchNotification({
                        farmId: row.farm_id,
                        category: 'health_alert',
                        type: 'info',
                        title: 'New Health Record',
                        message: `${row.title || 'Health entry'} logged for ${housingName}. ${details}`,
                        actionUrl: `/(animals)/HealthRecordsScreen?housingId=${row.housing_id || ''}`,
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(deviceChannel);
            supabase.removeChannel(feedChannel);
            supabase.removeChannel(sessionChannel);
            supabase.removeChannel(healthChannel);
        };
    }, [dispatchNotification]);

    // ── 3. Scheduled Feed Dispense (1-Hr Before Reminder) ────────────────
    const checkUpcomingFeedDispenses = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const now = currentTimeString();
        const today = todayDateString();

        try {
            const { data: schedules } = await supabase
                .from('feed_schedules')
                .select('id, farm_id, dispense_times, grams_per_dispense, devices(name), housings(name)')
                .in('farm_id', farmIdsRef.current);

            if (!schedules) return;

            for (const sch of schedules as any[]) {
                const times: string[] = sch.dispense_times || [];
                const feederName = sch.devices?.name || 'Feeder';
                const kg = (Number(sch.grams_per_dispense || 0) / 1000).toFixed(2);

                for (const t of times) {
                    const diff = minutesDifference(t, now);
                    // 1-hour before window (between 55 and 60 minutes prior)
                    if (diff >= 55 && diff <= 60) {
                        const key = `feed_dispense_1hr_${sch.id}_${t}_${today}`;
                        if (!(await alreadyAlerted(key))) {
                            await dispatchNotification({
                                farmId: sch.farm_id,
                                category: 'feed_alert',
                                type: 'info',
                                title: 'Upcoming Feed Dispense',
                                message: `${feederName} is scheduled to dispense ${kg} kg in 1 hour (at ${t}).`,
                                actionUrl: '/(devices)/ManageFeedsScreen',
                                skipLocalPush: true, // OS level push is pre-scheduled by notificationScheduler at exact hour:minute
                            });
                            await markAlerted(key);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[NotificationWatcher] checkUpcomingFeedDispenses error:', err);
        }
    }, [dispatchNotification]);

    // ── 4. Scheduled Vet Visits (1-Hr Before & Today) ────────────────────
    const checkScheduledVetVisits = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();

        try {
            const { data } = await supabase
                .from('health_records')
                .select('id, farm_id, title, notes, followup_date, housings(name)')
                .in('farm_id', farmIdsRef.current)
                .eq('followup_date', today);

            if (!data) return;

            for (const rec of data as any[]) {
                const key = `vet_visit_today_${rec.id}_${today}`;
                if (!(await alreadyAlerted(key))) {
                    const housing = rec.housings?.name ? ` for ${rec.housings.name}` : '';
                    await dispatchNotification({
                        farmId: rec.farm_id,
                        category: 'health_alert',
                        type: 'info',
                        title: 'Vet Visit Today',
                        message: `Scheduled consultation${housing} is scheduled for today. ${rec.notes ? `Note: ${rec.notes}` : ''}`,
                        actionUrl: '/(animals)/HealthRecordsScreen',
                        skipLocalPush: true, // OS level push is pre-scheduled by notificationScheduler
                    });
                    await markAlerted(key);
                }
            }
        } catch (err) {
            console.warn('[NotificationWatcher] checkScheduledVetVisits error:', err);
        }
    }, [dispatchNotification]);

    // ── 5. Vaccinations Due Today & Overdue ──────────────────────────────
    const checkVaccinations = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();
        const dayKey = `vaccination_alert_checked_${today}`;
        if (await alreadyAlerted(dayKey)) return;

        try {
            const { data, error } = await supabase
                .from('vaccination_schedules')
                .select('id, vaccine_name, farm_id, scheduled_date, status, housings(name)')
                .in('farm_id', farmIdsRef.current)
                .neq('status', 'completed')
                .neq('status', 'cancelled');
            if (error || !data) return;

            for (const sch of data as any[]) {
                const days = daysUntil(sch.scheduled_date);
                const housingLabel = sch.housings?.name ? ` in ${sch.housings.name}` : '';
                if (days < 0) {
                    const key = `vaccine_overdue_${sch.id}_${today}`;
                    if (!(await alreadyAlerted(key))) {
                        await dispatchNotification({
                            farmId: sch.farm_id,
                            category: 'health_alert',
                            type: 'error',
                            title: 'Vaccination Overdue',
                            message: `Vaccination '${sch.vaccine_name}'${housingLabel} was scheduled for ${formatDisplayDate(sch.scheduled_date)}.`,
                            actionUrl: '/(health)/VaccineScreen',
                        });
                        await markAlerted(key);
                    }
                } else if (days === 0) {
                    const key = `vaccine_due_today_${sch.id}_${today}`;
                    if (!(await alreadyAlerted(key))) {
                        await dispatchNotification({
                            farmId: sch.farm_id,
                            category: 'health_alert',
                            type: 'warning',
                            title: 'Vaccination Due',
                            message: `Vaccination '${sch.vaccine_name}'${housingLabel} is due today.`,
                            actionUrl: '/(health)/VaccineScreen',
                            skipLocalPush: true, // OS level push is pre-scheduled by notificationScheduler
                        });
                        await markAlerted(key);
                    }
                }
            }
            await markAlerted(dayKey);
        } catch (err) {
            console.warn('[NotificationWatcher] checkVaccinations error:', err);
        }
    }, [dispatchNotification]);

    // ── 6. Feed Inventory (Low Stock & Expiring Soon) ───────────────────
    const checkFeeds = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();
        const dayKey = `feed_alert_checked_${today}`;
        if (await alreadyAlerted(dayKey)) return;

        try {
            const { data, error } = await supabase
                .from('feeds')
                .select('id, name, farm_id, stock_kg, expiry_date')
                .in('farm_id', farmIdsRef.current);
            if (error || !data) return;

            for (const feed of data as any[]) {
                if (feed.expiry_date) {
                    const days = daysUntil(feed.expiry_date);
                    if (days < 0) {
                        const key = `feed_expired_${feed.id}`;
                        if (!(await alreadyAlerted(key))) {
                            await dispatchNotification({
                                farmId: feed.farm_id,
                                category: 'feed_alert',
                                type: 'error',
                                title: 'Feed Expired',
                                message: `'${feed.name}' expired on ${formatDisplayDate(feed.expiry_date)}.`,
                                actionUrl: '/(devices)/ManageFeedsScreen',
                            });
                            await markAlerted(key);
                        }
                    } else if (days <= 7) {
                        const key = `feed_expiring_${feed.id}`;
                        if (!(await alreadyAlerted(key))) {
                            await dispatchNotification({
                                farmId: feed.farm_id,
                                category: 'feed_alert',
                                type: 'warning',
                                title: 'Feed Expiring',
                                message: `'${feed.name}' expires in ${days} day(s) (on ${formatDisplayDate(feed.expiry_date)}).`,
                                actionUrl: '/(devices)/ManageFeedsScreen',
                            });
                            await markAlerted(key);
                        }
                    } else {
                        await clearAlerted(`feed_expiring_${feed.id}`);
                    }
                }

                const lowStockKey = `feed_low_stock_${feed.id}`;
                if (typeof feed.stock_kg === 'number' && feed.stock_kg < LOW_STOCK_THRESHOLD_KG) {
                    if (!(await alreadyAlerted(lowStockKey))) {
                        await dispatchNotification({
                            farmId: feed.farm_id,
                            category: 'feed_alert',
                            type: 'warning',
                            title: 'Low Stock Alert',
                            message: `'${feed.name}' has only ${feed.stock_kg} kg remaining.`,
                            actionUrl: '/(devices)/ManageFeedsScreen',
                        });
                        await markAlerted(lowStockKey);
                    }
                } else {
                    await clearAlerted(lowStockKey);
                }
            }
            await markAlerted(dayKey);
        } catch (err) {
            console.warn('[NotificationWatcher] checkFeeds error:', err);
        }
    }, [dispatchNotification]);

    // ── 7. Animals & Batch Lifecycle (Growth Stage & Harvest Target) ─────
    const checkBatchLifecycle = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();
        const dayKey = `batch_lifecycle_checked_${today}`;
        if (await alreadyAlerted(dayKey)) return;

        try {
            const { data: batches } = await supabase
                .from('batches')
                .select('id, farm_id, name, animal_type, arrival_date, age_at_arrival_days, harvest_target_kg, housings(name, farm_id)')
                .in('status', ['active']);

            if (!batches) return;

            const activeBatches = (batches as any[]).filter(b => {
                const bFarmId = b.farm_id || b.housings?.farm_id;
                return bFarmId && farmIdsRef.current.includes(bFarmId);
            });

            for (const b of activeBatches) {
                const farmId = b.farm_id || b.housings?.farm_id;
                const totalAgeDays = calculateBatchDay(b.arrival_date, b.age_at_arrival_days);
                const housingName = b.housings?.name || 'Housing';
                const animalType = (b.animal_type === 'chicken' ? 'chicken' : 'pig') as 'pig' | 'chicken';

                // Check guide phase milestones & transitions
                const phases = await getEffectiveRoadmap(farmId, animalType, b.id);
                const phaseInfo = getCoreActionForDay(phases, totalAgeDays);
                const currentPhase = phases.find(p => totalAgeDays >= p.dayStart && totalAgeDays <= p.dayEnd) || phases[phases.length - 1];

                if (currentPhase && (totalAgeDays === currentPhase.dayStart || totalAgeDays === 1)) {
                    const phaseKey = `guide_phase_milestone_${b.id}_${currentPhase.id}_day${totalAgeDays}_${today}`;
                    if (!(await alreadyAlerted(phaseKey))) {
                        const speciesLabel = animalType === 'chicken' ? 'Chickens' : 'Pigs';
                        await dispatchNotification({
                            farmId,
                            category: 'ai_suggestion',
                            type: 'info',
                            title: `Guide: ${currentPhase.name} (Day ${totalAgeDays})`,
                            message: `Batch ${b.name} (${speciesLabel}) entered ${currentPhase.name}. Target temp: ${currentPhase.targetTemp}, weight: ${currentPhase.targetWeight}. Focus: ${phaseInfo.coreAction}`,
                            actionUrl: '/(guide)/GuideScreen',
                        });
                        await markAlerted(phaseKey);
                    }
                }

                // Check harvest milestone
                if (b.harvest_target_kg) {
                    const { data: latestWeigh } = await supabase
                        .from('weigh_sessions')
                        .select('avg_weight_grams')
                        .eq('batch_id', b.id)
                        .order('recorded_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (latestWeigh && (latestWeigh.avg_weight_grams / 1000) >= Number(b.harvest_target_kg)) {
                        const key = `batch_harvest_reached_${b.id}`;
                        if (!(await alreadyAlerted(key))) {
                            await dispatchNotification({
                                farmId,
                                category: 'system',
                                type: 'success',
                                title: 'Target Harvest Reached',
                                message: `Batch ${b.name} in ${housingName} reached target harvest weight of ${b.harvest_target_kg} kg. Ready for market.`,
                                actionUrl: `/(animals)/AnimalDetails?batchId=${b.id}`,
                            });
                            await markAlerted(key);
                        }
                    }
                }
            }
            await markAlerted(dayKey);
        } catch (err) {
            console.warn('[NotificationWatcher] checkBatchLifecycle error:', err);
        }
    }, [dispatchNotification]);

    // ── 8. Growth Analytics Alert ────────────────────────────────────────
    const checkGrowthAnalytics = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();
        const dayKey = `analytics_growth_alert_${today}`;
        if (await alreadyAlerted(dayKey)) return;

        try {
            const { data: activeBatches } = await supabase
                .from('batches')
                .select('id, farm_id, name, animal_type, housings(name, farm_id)')
                .in('status', ['active'])
                .limit(4);

            const filtered = (activeBatches || []).filter((b: any) => {
                const bFarmId = b.farm_id || b.housings?.farm_id;
                return bFarmId && farmIdsRef.current.includes(bFarmId);
            });

            if (filtered.length > 0) {
                const b = filtered[0] as any;
                const bFarmId = b.farm_id || b.housings?.farm_id;
                const housingName = b.housings?.name || 'Housing';
                await dispatchNotification({
                    farmId: bFarmId,
                    category: 'ai_suggestion',
                    type: 'info',
                    title: 'Growth Analytics',
                    message: `Check the growth and weight performance for Batch ${b.name} in ${housingName}.`,
                    actionUrl: `/(analytics)/GrowthReportScreen?batchId=${b.id}`,
                });
                await markAlerted(dayKey);
            }
        } catch (err) {
            console.warn('[NotificationWatcher] checkGrowthAnalytics error:', err);
        }
    }, [dispatchNotification]);

    // ── 9. Daily Morning Briefing & Actionable Guide (Checking species & core action) ─
    const checkDailyMorningBriefing = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();
        const dayKey = `daily_morning_briefing_${today}`;
        if (await alreadyAlerted(dayKey)) return;

        try {
            for (const fId of farmIdsRef.current) {
                // 1. Fetch active batches for this farm
                const { data: batches } = await supabase
                    .from('batches')
                    .select('id, farm_id, name, animal_type, arrival_date, age_at_arrival_days, housings(name, farm_id)')
                    .in('status', ['active']);

                const farmBatches = (batches || []).filter((b: any) => {
                    return b.farm_id === fId || b.housings?.farm_id === fId;
                });

                const pigBatches = farmBatches.filter((b: any) => b.animal_type === 'pig');
                const chickenBatches = farmBatches.filter((b: any) => b.animal_type === 'chicken');

                const hasPigs = pigBatches.length > 0;
                const hasChickens = chickenBatches.length > 0;

                let taskSummary = '';

                if (hasPigs && hasChickens) {
                    // Both pigs and chickens present on farm
                    const pigBatch = pigBatches[0];
                    const pigDay = calculateBatchDay(pigBatch.arrival_date, pigBatch.age_at_arrival_days);
                    const pigPhases = await getEffectiveRoadmap(fId, 'pig', pigBatch.id);
                    const pigInfo = getCoreActionForDay(pigPhases, pigDay);

                    const chickenBatch = chickenBatches[0];
                    const chickenDay = calculateBatchDay(chickenBatch.arrival_date, chickenBatch.age_at_arrival_days);
                    const chickenPhases = await getEffectiveRoadmap(fId, 'chicken', chickenBatch.id);
                    const chickenInfo = getCoreActionForDay(chickenPhases, chickenDay);

                    taskSummary = `Pigs (Day ${pigDay}): ${pigInfo.coreAction}\n\nChickens (Day ${chickenDay}): ${chickenInfo.coreAction}`;
                } else if (hasPigs) {
                    // Pigs only
                    const pigBatch = pigBatches[0];
                    const pigDay = calculateBatchDay(pigBatch.arrival_date, pigBatch.age_at_arrival_days);
                    const pigPhases = await getEffectiveRoadmap(fId, 'pig', pigBatch.id);
                    const pigInfo = getCoreActionForDay(pigPhases, pigDay);

                    taskSummary = `Pigs (Day ${pigDay}, ${pigInfo.phaseName}):\n${pigInfo.coreAction}`;
                } else if (hasChickens) {
                    // Chickens only
                    const chickenBatch = chickenBatches[0];
                    const chickenDay = calculateBatchDay(chickenBatch.arrival_date, chickenBatch.age_at_arrival_days);
                    const chickenPhases = await getEffectiveRoadmap(fId, 'chicken', chickenBatch.id);
                    const chickenInfo = getCoreActionForDay(chickenPhases, chickenDay);

                    taskSummary = `Chickens (Day ${chickenDay}, ${chickenInfo.phaseName}):\n${chickenInfo.coreAction}`;
                } else {
                    // Fallback if no active batches registered yet
                    const pigPhases = await getEffectiveRoadmap(fId, 'pig');
                    const defaultInfo = getCoreActionForDay(pigPhases, 1);
                    taskSummary = `Daily SOP:\n${defaultInfo.coreAction}`;
                }

                // Count vaccines due today
                const { count: vaccineCount } = await supabase
                    .from('vaccination_schedules')
                    .select('id', { count: 'exact', head: true })
                    .eq('farm_id', fId)
                    .eq('scheduled_date', today)
                    .neq('status', 'completed');

                // Count low stock feeds
                const { count: lowFeedCount } = await supabase
                    .from('feeds')
                    .select('id', { count: 'exact', head: true })
                    .eq('farm_id', fId)
                    .lt('stock_kg', LOW_STOCK_THRESHOLD_KG);

                let fullMessage = `Good morning! Check your farm and today's SOP focus:\n\n${taskSummary}`;

                const extraAlerts: string[] = [];
                if ((vaccineCount || 0) > 0) extraAlerts.push(`${vaccineCount} vaccine(s) due today`);
                if ((lowFeedCount || 0) > 0) extraAlerts.push(`${lowFeedCount} feeder(s) low on stock`);

                if (extraAlerts.length > 0) {
                    fullMessage += `\n\nAlerts: ${extraAlerts.join(', ')}`;
                }

                fullMessage += `\n\nTap to check your farm and view Guide.`;

                await dispatchNotification({
                    farmId: fId,
                    category: 'ai_suggestion',
                    type: 'info',
                    title: 'Good Morning! Daily Briefing',
                    message: fullMessage,
                    actionUrl: '/(guide)/GuideScreen',
                    skipLocalPush: true, // OS level push is pre-scheduled by notificationScheduler
                });
            }
            await markAlerted(dayKey);
        } catch (err) {
            console.warn('[NotificationWatcher] checkDailyMorningBriefing error:', err);
        }
    }, [dispatchNotification]);

    // ── 10. Unmarked Guide Tasks Alert & Push Notification ─────────────
    const checkUnmarkedGuideTasks = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();

        try {
            const { data: batches } = await supabase
                .from('batches')
                .select('id, farm_id, name, animal_type, arrival_date, age_at_arrival_days, housings(name, farm_id)')
                .in('status', ['active']);

            if (!batches) return;

            const activeBatches = (batches as any[]).filter(b => {
                const bFarmId = b.farm_id || b.housings?.farm_id;
                return bFarmId && farmIdsRef.current.includes(bFarmId);
            });

            for (const b of activeBatches) {
                const farmId = b.farm_id || b.housings?.farm_id;
                const currentDay = calculateBatchDay(b.arrival_date, b.age_at_arrival_days);
                const housingName = b.housings?.name || 'Housing';
                const animalType = (b.animal_type === 'chicken' ? 'chicken' : 'pig') as 'pig' | 'chicken';
                const animalLabel = animalType === 'chicken' ? 'Poultry' : 'Swine';

                // Fetch roadmap phases and action logs for this batch
                const [phases, actionLogs] = await Promise.all([
                    getEffectiveRoadmap(farmId, animalType, b.id),
                    getBatchActionLogs(farmId, b.id),
                ]);

                // Filter phases applicable up to currentDay
                const availablePhases = phases.filter(p => currentDay >= p.dayStart);
                let unmarkedCount = 0;
                let overdueCount = 0;

                for (const phase of availablePhases) {
                    const sorted = sortActionsByDay(phase.fullGuideActions || []);
                    const startDay = Math.max(1, phase.dayStart);
                    const endDay = Math.min(phase.dayEnd, currentDay);

                    for (let d = startDay; d <= endDay; d++) {
                        const matchingActions = sorted.filter(act => isDayMatching(act.dayTag, d));
                        for (const act of matchingActions) {
                            const logKey = getActionLogKey(phase.id, act.action, d);
                            const generalKey = getActionLogKey(phase.id, act.action);
                            const log = actionLogs[logKey] || actionLogs[generalKey];
                            const isMarked = log && (log.status === 'completed' || log.status === 'rejected');
                            if (!isMarked) {
                                unmarkedCount++;
                                if (d < currentDay) overdueCount++;
                            }
                        }
                    }
                }

                if (unmarkedCount > 0) {
                    const alertKey = `unmarked_guide_tasks_${b.id}_${today}_count_${unmarkedCount}`;
                    if (!(await alreadyAlerted(alertKey))) {
                        const taskWord = unmarkedCount === 1 ? 'task' : 'tasks';
                        const overdueNote = overdueCount > 0 ? ` (${overdueCount} overdue from previous day${overdueCount > 1 ? 's' : ''})` : '';
                        await dispatchNotification({
                            farmId,
                            category: 'ai_suggestion',
                            type: 'warning',
                            title: 'Unmarked Guide Tasks',
                            message: `You have ${unmarkedCount} unmarked ${taskWord}${overdueNote} for ${animalLabel} in ${housingName} (${b.name}). Please review and mark as completed or skipped.`,
                            actionUrl: '/(guide)/GuideScreen',
                            skipLocalPush: false, // Fire local device push notification
                        });
                        await markAlerted(alertKey);
                    }
                }
            }
        } catch (err) {
            console.warn('[NotificationWatcher] checkUnmarkedGuideTasks error:', err);
        }
    }, [dispatchNotification]);

    // ── Run all periodic daily checks ───────────────────────────────────
    const runDailyChecks = useCallback(() => {
        fetchFarmNames();
        checkFeeds();
        checkVaccinations();
        checkScheduledVetVisits();
        checkBatchLifecycle();
        checkGrowthAnalytics();
        checkDailyMorningBriefing();
        checkUnmarkedGuideTasks();
        checkUpcomingFeedDispenses();
        checkAndTriggerWeighingReminders(farmIdsRef.current);
        syncAllScheduledNotifications(farmIdsRef.current);
    }, [
        fetchFarmNames,
        checkFeeds,
        checkVaccinations,
        checkScheduledVetVisits,
        checkBatchLifecycle,
        checkGrowthAnalytics,
        checkDailyMorningBriefing,
        checkUnmarkedGuideTasks,
        checkUpcomingFeedDispenses,
    ]);

    useEffect(() => {
        runDailyChecks();
    }, [activeFarmIds, runDailyChecks]);

    useEffect(() => {
        const interval = setInterval(() => {
            checkUpcomingFeedDispenses();
        }, SCHEDULE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [checkUpcomingFeedDispenses]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                runDailyChecks();
            }
        });
        return () => sub.remove();
    }, [runDailyChecks]);

    return null;
}

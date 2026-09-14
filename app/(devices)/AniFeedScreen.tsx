import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniFeedStyles } from '@/styles/anifeedStyles';
import { AnimalIcon } from '@/components/AnimalIcon';
import { AniFeedIcon } from '@/components/AniFeedIcon';
import { AIInsightCard } from '@/components/AIInsightCard';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceDisplayStatus } from '@/lib/deviceStatus';

interface DeviceInfo {
    name: string;
    status: string;
    lastSeen: string | null;
    housingId: string | null;
    housingName: string;
    animalType: 'Pig' | 'Chicken';
    farmId?: string | null;
}

interface FeedScheduleInfo {
    id: string | null;
    timesPerDay: number;
    gramsPerDispense: number;
    feedId: string | null;
    feedBrand: string;
    dispenseTimes: string[];
    feedStockKg?: number | null;
    feedExpiryDate?: string | null;
}

interface DispenseLogEntry {
    id: string;
    status: 'success' | 'error' | 'pending';
    amount: string;
    amountGrams: number;
    timestamp: number;
    housingName: string;
}

function formatLogTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes} ${ampm}`;

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${timeStr}`;
}

function getFormattedDate(): string {
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

function getOrdinalLabel(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function generateDefaultTimes(count: number): string[] {
    const presets: Record<number, string[]> = {
        1: ['08:00 AM'],
        2: ['08:00 AM', '05:00 PM'],
        3: ['08:00 AM', '12:00 PM', '06:00 PM'],
        4: ['07:00 AM', '11:00 AM', '03:00 PM', '07:00 PM'],
        5: ['06:00 AM', '09:30 AM', '01:00 PM', '04:30 PM', '08:00 PM'],
        6: ['06:00 AM', '09:00 AM', '12:00 PM', '03:00 PM', '06:00 PM', '09:00 PM'],
    };
    if (presets[count]) return presets[count];
    
    // For counts > 6: spread evenly across 14 hours (6 AM to 8 PM)
    const result: string[] = [];
    const startHour = 6;
    const endHour = 20;
    const interval = (endHour - startHour) / Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
        const totalMinutes = Math.round((startHour + i * interval) * 60);
        const h24 = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const ampm = h24 >= 12 ? 'PM' : 'AM';
        const h12 = h24 % 12 || 12;
        result.push(`${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`);
    }
    return result;
}

function format24to12(time24: string): string {
    if (!time24) return '—';
    const parts = time24.split(':');
    if (parts.length !== 2) return time24;
    const hours24 = parseInt(parts[0], 10);
    const minutes = parts[1];
    if (isNaN(hours24)) return time24;
    
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${minutes} ${ampm}`;
}

function parse12to24(time12: string): string | null {
    const cleaned = time12.trim().toUpperCase();
    const regex12 = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/;
    const match = cleaned.match(regex12);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const ampm = match[3];
        if (hours < 1 || hours > 12) return null;
        const minNum = parseInt(minutes, 10);
        if (minNum < 0 || minNum > 59) return null;
        
        if (ampm === 'PM' && hours !== 12) {
            hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    
    const regex24 = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (regex24.test(cleaned)) {
        return cleaned;
    }
    return null;
}

export default function AniFeedScreen() {
    const { systemConfig, profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const anifeedStyles = useAniFeedStyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ deviceId?: string; status?: string }>();
    const deviceId = params.deviceId ?? '';
    const initialStatus = params.status;

    if (systemConfig?.featureFlags && !systemConfig.featureFlags.feedingEnabled) {
        return (
            <SafeAreaView style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight, justifyContent: 'center', alignItems: 'center' }]}>
                <MaterialIcons name="block" size={64} color={colors.textGrey} />
                <Text style={[textStyles.h2, { color: colors.text, marginTop: 20 }]}>Feeding Module Disabled</Text>
                <Text style={[textStyles.body, { textAlign: 'center', marginTop: 10, color: colors.textGrey, paddingHorizontal: 40 }]}>
                    This feature is currently disabled by the system administrator.
                </Text>
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(devices)/DevicesScreen' as any)} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    // ─── Device + Schedule State ─────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(initialStatus ? initialStatus === 'online' : false);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [deviceUniqueCode, setDeviceUniqueCode] = useState('');
    const [schedule, setSchedule] = useState<FeedScheduleInfo | null>(null);
    const [dispenseLogs, setDispenseLogs] = useState<DispenseLogEntry[]>([]);
    const [lastDispensed, setLastDispensed] = useState<string | null>(null);
    const [liveTodayGrams, setLiveTodayGrams] = useState<number | null>(null);
    const [liveTodayDispenseCount, setLiveTodayDispenseCount] = useState<number | null>(null);
    const [liveFlash, setLiveFlash] = useState(false);

    // Options for edit modals (fetched from farm)
    const [farmHousings, setFarmHousings] = useState<{ id: string; name: string; animal_type: string }[]>([]);
    const [farmFeeds, setFarmFeeds] = useState<{ id: string; name: string; brand: string; animal_type: string; stock_kg?: number | null; expiry_date?: string | null }[]>([]);

    // Schedule edit modal
    const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
    const [scheduleModalView, setScheduleModalView] = useState<'schedule' | 'timePicker'>('schedule');
    const [tempTimesPerDay, setTempTimesPerDay] = useState('3');
    const [tempGrams, setTempGrams] = useState('500');
    const [tempTimes, setTempTimes] = useState<string[]>([]);

    const updateTimesCount = (newCount: number) => {
        const clamped = Math.max(1, Math.min(12, newCount));
        setTempTimesPerDay(String(clamped));
        setTempTimes(prev => {
            if (prev.length === clamped) return prev;
            if (clamped > prev.length) {
                const defaults = generateDefaultTimes(clamped);
                const next = [...prev];
                for (let i = prev.length; i < clamped; i++) {
                    next.push(defaults[i] || '12:00 PM');
                }
                return next;
            } else {
                return prev.slice(0, clamped);
            }
        });
    };

    // Time Picker State (inside unified modal)
    const [activeTimeIdx, setActiveTimeIdx] = useState<number | null>(null);
    const [selectedHour, setSelectedHour] = useState(12);
    const [selectedMinute, setSelectedMinute] = useState(0);
    const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');

    // Manual Dispense Modal
    const [manualDispenseVisible, setManualDispenseVisible] = useState(false);
    const [manualGrams, setManualGrams] = useState('');
    const [isManualDispensing, setIsManualDispensing] = useState(false);

    // Feed Details Modal
    const [feedDetailsModalVisible, setFeedDetailsModalVisible] = useState(false);

    // Edit field modal (Housing, Brand, AnimalType)
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Housing' | 'Brand' | 'AnimalType' | null>(null);

    // Action confirm modal
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('info');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');

    // Snackbar
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // ─── Fetch ───────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        if (!deviceId || !farmId) { setIsLoading(false); return; }
        if (!deviceInfo) {
            setIsLoading(true);
        }
        try {
            const [deviceResult, scheduleResult, logsResult, housingsResult, feedsResult] = await Promise.all([
                supabase
                    .from('devices')
                    .select('id, name, unique_code, status, last_seen, housing_id, farm_id, housings(name, animal_type)')
                    .eq('id', deviceId as string)
                    .single(),
                supabase
                    .from('feed_schedules')
                    .select('id, times_per_day, grams_per_dispense, feed_id, dispense_times, feeds(name, brand, stock_kg, expiry_date)')
                    .eq('device_id', deviceId as string)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('dispense_records')
                    .select('id, grams_dispensed, status, dispensed_at, housing_id, housings(name)')
                    .eq('device_id', deviceId as string)
                    .order('dispensed_at', { ascending: false })
                    .limit(3),
                supabase
                    .from('housings')
                    .select('id, name, animal_type')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active'),
                supabase
                    .from('feeds')
                    .select('id, name, brand, animal_type, stock_kg, expiry_date')
                    .eq('farm_id', farmId),
            ]);

            if (deviceResult.data) {
                const d = deviceResult.data as any;
                if (d.unique_code) setDeviceUniqueCode(d.unique_code);
                const info: DeviceInfo = {
                    name: d.name,
                    status: d.status,
                    lastSeen: d.last_seen ?? null,
                    housingId: d.housing_id ?? null,
                    housingName: d.housings?.name ?? 'Unassigned',
                    animalType: d.housings?.animal_type === 'pig' ? 'Pig' : 'Chicken',
                    farmId: d.farm_id ?? null,
                };

                if (!info.housingId) {
                    const tempType = await AsyncStorage.getItem(`temp_animal_type_${deviceId}`);
                    if (tempType === 'Pig' || tempType === 'Chicken') {
                        info.animalType = tempType;
                    }
                }

                setDeviceInfo(info);
                setIsConnected(getDeviceDisplayStatus(info.status, info.lastSeen) === 'online');
            }

            if (scheduleResult.data) {
                const s = scheduleResult.data as any;
                const wholeFeedName = s.feeds ? (s.feeds.brand ? `${s.feeds.name} (${s.feeds.brand})` : s.feeds.name) : 'Not set';
                setSchedule({
                    id: s.id,
                    timesPerDay: s.times_per_day,
                    gramsPerDispense: s.grams_per_dispense,
                    feedId: s.feed_id ?? null,
                    feedBrand: wholeFeedName,
                    dispenseTimes: s.dispense_times ?? ['08:00', '12:00', '18:00'],
                    feedStockKg: s.feeds?.stock_kg ?? null,
                    feedExpiryDate: s.feeds?.expiry_date ?? null,
                });
                setTempTimesPerDay(String(s.times_per_day));
                setTempGrams(String(s.grams_per_dispense));
                const dbTimes = s.dispense_times ?? ['08:00', '12:00', '18:00'];
                setTempTimes(dbTimes.map(format24to12));
            }

            if (logsResult.data && logsResult.data.length > 0) {
                const mapped: DispenseLogEntry[] = logsResult.data.map((r: any) => ({
                    id: r.id,
                    status: r.status,
                    amount: `${r.grams_dispensed}g`,
                    amountGrams: r.grams_dispensed,
                    timestamp: new Date(r.dispensed_at).getTime(),
                    // Use the housing recorded on this specific dispense event,
                    // NOT the device's current housing (which may have changed).
                    housingName: (r.housings as any)?.name ?? 'Unassigned',
                }));
                setDispenseLogs(mapped);
                setLastDispensed(`${formatLogTime(mapped[0].timestamp)} (${mapped[0].amount})`);
            }

            if (housingsResult.data) setFarmHousings(housingsResult.data as any);
            if (feedsResult.data) setFarmFeeds(feedsResult.data as any);
        } catch (err) {
            console.error('[AniFeedScreen] fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [deviceId, farmId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Re-derive isConnected from the last known heartbeat every 15s, purely
    // from the passage of time — catches a device going stale/dark even
    // when nothing new has arrived to trigger a re-fetch.
    useEffect(() => {
        const interval = setInterval(() => {
            setDeviceInfo(prev => {
                if (prev) setIsConnected(getDeviceDisplayStatus(prev.status, prev.lastSeen) === 'online');
                return prev;
            });
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    // Re-fetch when navigating back (e.g. after adding feeds in ManageFeedsScreen)
    useFocusEffect(
        useCallback(() => {
            fetchAll();
        }, [fetchAll])
    );

    // ─── Today's total dispensed ─────────────────────────────────
    const fetchTodayTotal = useCallback(async () => {
        if (!deviceId) return;
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { data } = await supabase
            .from('dispense_records')
            .select('grams_dispensed')
            .eq('device_id', deviceId as string)
            .eq('status', 'success')
            .gte('dispensed_at', startOfDay.toISOString());
        if (data) {
            const total = (data as any[]).reduce((sum, r) => sum + (r.grams_dispensed || 0), 0);
            setLiveTodayGrams(total);
            setLiveTodayDispenseCount(data.length);
        }
    }, [deviceId]);

    // ─── Realtime subscription ───────────────────────────────────
    useEffect(() => {
        if (!deviceId) return;
        fetchTodayTotal();
        const channel = supabase.channel(`anifeed-live-${deviceId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispense_records', filter: `device_id=eq.${deviceId}` },
                (payload) => {
                    const row = payload.new as any;
                    if (row.status === 'success') {
                        setLiveTodayGrams(prev => (prev ?? 0) + (row.grams_dispensed || 0));
                        setLiveTodayDispenseCount(prev => (prev ?? 0) + 1);
                    }
                    setLiveFlash(true);
                    setTimeout(() => setLiveFlash(false), 600);
                    fetchAll();
                })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [deviceId, fetchAll, fetchTodayTotal]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); }, [fetchAll]);

    // ─── Derived display ─────────────────────────────────────────
    const animalType = deviceInfo?.animalType ?? 'Chicken';
    const housing = deviceInfo?.housingName ?? 'Unassigned';
    const brand = schedule?.feedBrand ?? 'Not set';
    const animalColor = animalType === 'Pig' ? colors.pig : colors.chicken;

    const dailyCapacity = schedule ? schedule.timesPerDay * schedule.gramsPerDispense : 0;
    const feedLevelPercent = liveTodayGrams !== null && dailyCapacity > 0
        ? Math.min(100, Math.round((liveTodayGrams / dailyCapacity) * 100))
        : null;
    const circleRadius = 78;
    const circleCircumference = 2 * Math.PI * circleRadius;
    const progressDash = feedLevelPercent !== null ? (feedLevelPercent / 100) * circleCircumference : 0;
    const progressColor = feedLevelPercent === null ? colors.textGrey
        : feedLevelPercent >= 80 ? colors.primary
        : feedLevelPercent >= 40 ? colors.warning
        : colors.error;

    // ─── Connection toggle ────────────────────────────────────────
    const handleConnectionToggle = () => {
        if (isConnected) {
            setModalType('confirmation');
            setModalTitle('Disconnect AniFeed?');
            setModalMessage('Are you sure you want to disconnect this device from the network? Auto-dispensing may be paused.');
        } else {
            setModalType('confirmation');
            setModalTitle('Connect AniFeed?');
            setModalMessage('Please make sure your AniFeed device is turned on and ready to connect.');
        }
        setModalVisible(true);
    };

    const handleModalConfirm = async () => {
        setModalVisible(false);
        if (modalTitle.includes('Disconnect')) {
            await supabase.from('devices').update({ status: 'offline' }).eq('id', deviceId as string);
            setIsConnected(false);
            setDeviceInfo(prev => prev ? { ...prev, status: 'offline' } : null);
            showSnackbar('AniFeed disconnected.');
        } else if (modalTitle.includes('Connect')) {
            await supabase.from('devices').update({ status: 'online' }).eq('id', deviceId as string);
            setIsConnected(true);
            setDeviceInfo(prev => prev ? { ...prev, status: 'online' } : null);
            showSnackbar('AniFeed connected.');
        }
    };

    // ─── Manual Dispense handler ────────────────────────────────────────
    const handleOpenManualDispense = () => {
        if (!schedule?.feedId) {
            showSnackbar('Please configure a feed schedule first.', 'error');
            return;
        }
        if (!deviceInfo?.housingId || deviceInfo.housingName === 'Unassigned') {
            showSnackbar('Assign an animal type and housing first.', 'error');
            return;
        }
        // Pre-fill with schedule amount
        setManualGrams(String(schedule?.gramsPerDispense ?? 500));
        setManualDispenseVisible(true);
    };

    const handleConfirmManualDispense = async () => {
        const grams = parseInt(manualGrams, 10);
        if (isNaN(grams) || grams < 1) {
            showSnackbar('Enter a valid amount in grams.', 'error');
            return;
        }
        if (!schedule?.feedId) {
            showSnackbar('No feed assigned. Please configure a schedule first.', 'error');
            return;
        }
        if (schedule.feedStockKg === undefined || schedule.feedStockKg === null || schedule.feedStockKg <= 0) {
            showSnackbar('The assigned feed has no stock remaining.', 'error');
            return;
        }
        // STRICT — never dispense a feed past its own expiry date.
        if (schedule.feedExpiryDate && schedule.feedExpiryDate < new Date().toLocaleDateString('en-CA')) {
            showSnackbar(`This feed expired on ${schedule.feedExpiryDate} — replace it before dispensing.`, 'error');
            return;
        }
        const gramsAsKg = grams / 1000;
        if (schedule.feedStockKg < gramsAsKg) {
            showSnackbar(`Insufficient stock. Need ${gramsAsKg} kg, only ${schedule.feedStockKg} kg left.`, 'error');
            return;
        }

        setIsManualDispensing(true);
        try {
            const now = new Date().toISOString();

            // Attribute this dispense to whichever batch currently occupies the
            // housing, same "most recent active batch" lookup record_weigh_session
            // already does server-side for weigh_sessions — lets a Weighing
            // Session's feed-vs-growth comparison actually find this row later.
            let activeBatchId: string | null = null;
            if (deviceInfo?.housingId) {
                const { data: activeBatch } = await supabase
                    .from('batches')
                    .select('id')
                    .eq('housing_id', deviceInfo.housingId)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                activeBatchId = activeBatch?.id ?? null;
            }

            const targetFarmId = deviceInfo?.farmId || farmId;
            if (!targetFarmId) {
                showSnackbar('Unable to determine farm assignment for this device.', 'error');
                return;
            }

            const { error: insertError } = await supabase
                .from('dispense_records')
                .insert({
                    device_id: deviceId as string,
                    farm_id: targetFarmId,
                    feed_id: schedule.feedId,
                    housing_id: deviceInfo?.housingId ?? null,
                    batch_id: activeBatchId,
                    animal_type: deviceInfo?.animalType
                        ? (deviceInfo.animalType.toLowerCase() as 'chicken' | 'pig')
                        : null,
                    grams_dispensed: grams,
                    status: 'success',
                    triggered_by: 'manual',
                    dispensed_at: now,
                });

            if (insertError) throw insertError;

            // Deduct from feed stock
            const newStockKg = Math.max(0, schedule.feedStockKg! - gramsAsKg);
            const { error: updateError } = await supabase
                .from('feeds')
                .update({ stock_kg: newStockKg })
                .eq('id', schedule.feedId);

            if (updateError) throw updateError;

            setSchedule(prev => prev ? { ...prev, feedStockKg: newStockKg } : null);
            setManualDispenseVisible(false);
            showSnackbar(`Manually dispensed ${grams}g successfully!`, 'success');

            await fetchAll();
            await fetchTodayTotal();
        } catch (err: any) {
            console.error('[Manual Dispense Error]:', err);
            showSnackbar('Failed to log manual dispense.', 'error');
        } finally {
            setIsManualDispensing(false);
        }
    };

    // ─── Schedule save ────────────────────────────────────────────
    const handleSaveSchedule = async () => {
        const timesPerDay = parseInt(tempTimesPerDay);
        const gramsPerDispense = parseInt(tempGrams);
        if (isNaN(timesPerDay) || isNaN(gramsPerDispense) || timesPerDay < 1 || gramsPerDispense < 1) {
            showSnackbar('Enter valid numbers for both fields.', 'error');
            return;
        }

        if (timesPerDay > 12) {
            showSnackbar('Maximum frequency allowed is 12 times per day.', 'error');
            return;
        }

        if (tempTimes.length !== timesPerDay) {
            showSnackbar('Please configure all dispense times.', 'error');
            return;
        }

        // Check for duplicate times
        const uniqueTimes = new Set(tempTimes.map(t => t.trim().toUpperCase()));
        if (uniqueTimes.size !== tempTimes.length) {
            showSnackbar('Duplicate dispense times are not allowed. Each feeding must have a unique time.', 'error');
            return;
        }

        // Parse and validate all times to 24-hour format
        const parsed24Times: string[] = [];
        for (let i = 0; i < tempTimes.length; i++) {
            const parsed = parse12to24(tempTimes[i]);
            if (!parsed) {
                showSnackbar(`Invalid format at Time #${i + 1}. Use HH:MM AM/PM format (e.g. 08:30 AM).`, 'error');
                return;
            }
            parsed24Times.push(parsed);
        }

        // Verify time interval is at least 30 minutes
        if (parsed24Times.length > 1) {
            const minutesList = parsed24Times.map(t => {
                const parts = t.split(':');
                return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            });
            
            // Sort minutes list ascending
            const sortedMinutes = [...minutesList].sort((a, b) => a - b);
            
            // Check adjacent differences
            for (let i = 0; i < sortedMinutes.length - 1; i++) {
                if (sortedMinutes[i + 1] - sortedMinutes[i] < 30) {
                    showSnackbar('Dispense times must have an interval of at least 30 minutes.', 'error');
                    return;
                }
            }
            
            // Circular boundary check (last time of day vs first time of next day)
            const circularDiff = (sortedMinutes[0] + 1440) - sortedMinutes[sortedMinutes.length - 1];
            if (circularDiff < 30) {
                showSnackbar('Dispense times must have an interval of at least 30 minutes (including across midnight).', 'error');
                return;
            }
        }

        try {
            const payload = {
                device_id: deviceId as string,
                farm_id: farmId,
                animal_type: animalType.toLowerCase(),
                times_per_day: timesPerDay,
                grams_per_dispense: gramsPerDispense,
                dispense_times: parsed24Times,
                adjusted_at: new Date().toISOString(),
            };
            if (schedule?.id) {
                await supabase.from('feed_schedules').update(payload).eq('id', schedule.id);
            } else {
                const { data } = await supabase.from('feed_schedules').insert(payload).select('id').single();
                setSchedule(prev => prev ? { ...prev, id: (data as any)?.id ?? null } : null);
            }
            setSchedule(prev => prev
                ? { ...prev, timesPerDay, gramsPerDispense, dispenseTimes: parsed24Times }
                : { id: null, timesPerDay, gramsPerDispense, feedId: null, feedBrand: brand, dispenseTimes: parsed24Times }
            );
            setScheduleModalVisible(false);
            showSnackbar('Schedule updated.');
        } catch (err) {
            showSnackbar('Failed to save schedule.', 'error');
        }
    };

    // ─── Edit modal ───────────────────────────────────────────────
    const openEditModal = (target: 'Housing' | 'Brand' | 'AnimalType') => {
        setEditTarget(target);
        setEditModalVisible(true);
    };

    const getEditOptions = (): string[] => {
        if (editTarget === 'AnimalType') return ['Pig', 'Chicken'];
        if (editTarget === 'Housing') {
            return farmHousings
                .filter(h => h.animal_type === animalType.toLowerCase())
                .map(h => h.name);
        }
        if (editTarget === 'Brand') {
            // Only show feeds that match the feeder's animal type — never mix pig and chicken feeds
            return farmFeeds
                .filter(f => f.animal_type === animalType.toLowerCase())
                .map(f => f.brand ? `${f.name} (${f.brand})` : f.name);
        }
        return [];
    };

    const handleEditConfirm = async (val: string) => {
        setEditModalVisible(false);
        try {
            if (editTarget === 'AnimalType') {
                const selectedType = val as 'Pig' | 'Chicken';
                // Unassign housing when animal type changes — user must reassign manually
                await supabase.from('devices').update({ housing_id: null }).eq('id', deviceId as string);
                await AsyncStorage.setItem(`temp_animal_type_${deviceId}`, selectedType);
                setDeviceInfo(prev => prev ? { ...prev, housingId: null, housingName: 'Unassigned', animalType: selectedType } : null);
                showSnackbar(`Animal type set to ${selectedType}. Please reassign a housing.`);
            } else if (editTarget === 'Housing') {
                const h = farmHousings.find(h => h.name === val);
                if (!h) return;
                await supabase.from('devices').update({ housing_id: h.id }).eq('id', deviceId as string);
                await AsyncStorage.removeItem(`temp_animal_type_${deviceId}`);
                setDeviceInfo(prev => prev ? { ...prev, housingId: h.id, housingName: h.name, animalType: h.animal_type === 'pig' ? 'Pig' : 'Chicken' } : null);
                showSnackbar('Housing updated.');
            } else if (editTarget === 'Brand') {
                // Find feed using an exact match of the formatted option string
                const f = farmFeeds.find(fd => {
                    const optString = fd.brand ? `${fd.name} (${fd.brand})` : fd.name;
                    return optString === val;
                });
                if (!f) return;

                // STRICT — don't let an expired feed get assigned to an
                // active dispensing schedule in the first place.
                if (f.expiry_date && f.expiry_date < new Date().toLocaleDateString('en-CA')) {
                    showSnackbar(`"${f.name}" expired on ${f.expiry_date} — pick a different feed or update its expiry in Manage Feeds.`, 'error');
                    return;
                }

                const wholeFeedName = f.brand ? `${f.name} (${f.brand})` : f.name;
                if (schedule?.id) {
                    const { error } = await supabase.from('feed_schedules').update({ feed_id: f.id }).eq('id', schedule.id);
                    if (error) throw error;
                    setSchedule(prev => prev ? { ...prev, feedId: f.id, feedBrand: wholeFeedName, feedStockKg: f.stock_kg ?? null, feedExpiryDate: f.expiry_date ?? null } : null);
                } else {
                    const payload = {
                        device_id: deviceId as string,
                        farm_id: farmId,
                        animal_type: animalType.toLowerCase(),
                        feed_id: f.id,
                        times_per_day: 3, // default
                        grams_per_dispense: 500, // default
                        dispense_times: ['08:00', '12:00', '18:00'], // default
                        adjusted_at: new Date().toISOString(),
                    };
                    const { data, error } = await supabase.from('feed_schedules').insert(payload).select('id').single();
                    if (error) throw error;
                    setSchedule({
                        id: (data as any)?.id ?? null,
                        timesPerDay: 3,
                        gramsPerDispense: 500,
                        feedId: f.id,
                        feedBrand: wholeFeedName,
                        dispenseTimes: ['08:00', '12:00', '18:00'],
                        feedStockKg: f.stock_kg ?? null,
                        feedExpiryDate: f.expiry_date ?? null,
                    });
                }
                showSnackbar('Feed updated.');
            }
        } catch {
            showSnackbar(`Failed to update ${editTarget}.`, 'error');
        }
    };

    const getLogIcon = (status: string) => {
        switch (status) {
            case 'error':   return { icon: 'error' as const,        color: colors.error };
            case 'pending': return { icon: 'schedule' as const,     color: colors.warning };
            default:        return { icon: 'check-circle' as const, color: colors.primary };
        }
    };

    return (
        <SafeAreaView style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={anifeedStyles.header}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={anifeedStyles.headerActions}>
                    <TouchableOpacity
                        style={{
                            height: 44,
                            paddingHorizontal: 16,
                            borderRadius: 22,
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onPress={() => router.push('/(devices)/ManageFeedsScreen' as any)}
                        activeOpacity={0.8}
                    >
                        <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 13 }]}>Manage Feeds</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        disabled={isLoading}
                        style={[
                            anifeedStyles.actionButton,
                            {
                                backgroundColor: isConnected ? colors.primary + '1A' : colors.surface,
                                borderWidth: isConnected ? 0 : 1.5,
                                borderColor: isConnected ? 'transparent' : colors.stroke,
                                opacity: isLoading ? 0.5 : 1
                            }
                        ]}
                        onPress={() => {
                            if (isConnected) {
                                // Online — prompt to disconnect
                                setModalType('confirmation');
                                setModalTitle('Disconnect AniFeed?');
                                setModalMessage(`This will take "${deviceInfo?.name}" offline. You can reconnect it anytime by tapping the cloud icon.`);
                                setModalVisible(true);
                            } else {
                                // Offline — go to provisioning
                                router.push(
                                    `/(devices)/AddDeviceScreen?existingDeviceId=${deviceId}&existingDeviceName=${encodeURIComponent(deviceInfo?.name ?? '')}&existingDeviceType=AniFeed&existingDeviceCode=${encodeURIComponent(deviceUniqueCode)}` as any
                                );
                            }
                        }}
                    >
                        <MaterialIcons name={isConnected ? 'cloud-done' : 'cloud-off'} size={20} color={isConnected ? colors.primary : colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[anifeedStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke }]}
                        onPress={() => router.push(`/(devices)/DeviceSettingsScreen?type=AniFeed&deviceId=${deviceId}` as any)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="settings" size={20} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={anifeedStyles.contentContainer} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                    {/* Title Section */}
                    <View style={anifeedStyles.titleSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                                <AniFeedIcon size={12} />
                                <Text style={[textStyles.label, { color: colors.secondary, fontSize: 10, marginLeft: 4 }]}>AniFeed</Text>
                            </View>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 13 }]}>{getFormattedDate()}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28, flex: 1, marginRight: 10 }]}>{deviceInfo?.name ?? 'AniFeed Unit'}</Text>
                            <View style={[anifeedStyles.connectionBadge, { backgroundColor: isConnected ? colors.primary + '1A' : colors.error + '1A', flexShrink: 0 }]}>
                                <View style={[anifeedStyles.connectionDot, { backgroundColor: isConnected ? colors.primary : colors.error }]} />
                                <Text style={[textStyles.label, { color: isConnected ? colors.primary : colors.error, fontSize: 12, marginLeft: 6 }]}>
                                    {isConnected ? 'Online' : 'Offline'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                            <View style={[anifeedStyles.tagsContainer, { marginTop: 0 }]}>
                                <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: animalColor + '1A', paddingRight: 6 }]} onPress={() => openEditModal('AnimalType')}>
                                    <AnimalIcon type={animalType as any} size={14} color={animalColor} />
                                    <Text style={[textStyles.label, { color: animalColor, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{animalType}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={animalColor} />
                                </TouchableOpacity>
                                <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: colors.info + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Housing')}>
                                    <MaterialIcons name="home" size={14} color={colors.info} />
                                    <Text style={[textStyles.label, { color: colors.info, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{housing}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={colors.info} />
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>

                    {/* Manual Dispense */}
                    {(() => {
                        const canManual = !!deviceInfo?.housingId && deviceInfo?.housingName !== 'Unassigned' && !isManualDispensing;
                        return (
                            <View style={{ width: '100%', marginBottom: 16 }}>
                                <TouchableOpacity
                                    activeOpacity={canManual ? 0.8 : 1}
                                    disabled={!canManual}
                                    onPress={handleOpenManualDispense}
                                    style={{
                                        width: '100%',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        paddingVertical: 14,
                                        borderRadius: 16,
                                        backgroundColor: canManual ? colors.primary : colors.cardFill,
                                        borderWidth: canManual ? 0 : 1,
                                        borderColor: colors.stroke,
                                        opacity: canManual ? 1 : 0.55,
                                    }}
                                >
                                    <MaterialIcons name="food-bank" size={18} color={canManual ? colors.onPrimary : colors.textGrey} />
                                    <Text style={[textStyles.btnLabel, { color: canManual ? colors.onPrimary : colors.textGrey, fontSize: 13 }]}>
                                        Manual Dispense
                                    </Text>
                                </TouchableOpacity>
                                {!canManual && !isManualDispensing && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, textAlign: 'center', marginTop: 6 }]}>
                                        Assign an animal type and housing to enable manual dispensing.
                                    </Text>
                                )}
                            </View>
                        );
                    })()}

                    {/* Current Feed Level */}
                    <View style={anifeedStyles.liveSection}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 18 }]}>Current Feed Level</Text>
                        </View>
                        <View style={[anifeedStyles.liveCard, { backgroundColor: colors.surface, borderColor: liveFlash ? progressColor : colors.stroke, borderWidth: liveFlash ? 2 : 1 }]}>
                            <View style={anifeedStyles.liveScaleCircle}>
                                <Svg width={180} height={180} style={{ position: 'absolute' }} viewBox="0 0 180 180">
                                    {/* Track */}
                                    <Circle cx={90} cy={90} r={circleRadius} stroke={colors.stroke} strokeWidth={6} fill="none" />
                                    {/* Progress arc */}
                                    {feedLevelPercent !== null && (
                                        <Circle
                                            cx={90} cy={90} r={circleRadius}
                                            stroke={progressColor}
                                            strokeWidth={6}
                                            fill="none"
                                            strokeDasharray={circleCircumference}
                                            strokeDashoffset={circleCircumference - progressDash}
                                            strokeLinecap="round"
                                            transform="rotate(-90 90 90)"
                                        />
                                    )}
                                </Svg>
                                <View style={anifeedStyles.liveScaleInnerCircle}>
                                    {feedLevelPercent !== null ? (
                                        <>
                                            <Text style={[textStyles.h1, { color: progressColor, fontSize: 32, fontWeight: '700' }]}>
                                                {feedLevelPercent}%
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10, textAlign: 'center', marginTop: 2 }]}>
                                                today's target
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <MaterialIcons name="sensors-off" size={32} color={colors.textGrey} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 6, textAlign: 'center' }]}>
                                                Live data{'\n'}pending
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </View>

                            <View style={anifeedStyles.liveStatsContainer}>
                                <View style={anifeedStyles.liveStatItem}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Today</Text>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 13, marginTop: 4, textAlign: 'center' }]} numberOfLines={2}>
                                        {liveTodayGrams !== null ? `${liveTodayGrams}g` : '—'}
                                        {dailyCapacity > 0 ? `\n/ ${dailyCapacity}g` : ''}
                                    </Text>
                                </View>
                                <View style={anifeedStyles.liveStatDivider} />
                                <TouchableOpacity style={anifeedStyles.liveStatItem} onPress={() => setFeedDetailsModalVisible(true)} activeOpacity={0.7}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Feed</Text>
                                        <MaterialIcons name="info-outline" size={13} color={colors.primary} style={{ marginLeft: 4 }} />
                                    </View>
                                    <Text
                                        style={[
                                            textStyles.h2,
                                            {
                                                color: colors.text,
                                                fontSize: 13,
                                                textAlign: 'center',
                                                flexWrap: 'wrap',
                                                width: '100%',
                                            }
                                        ]}
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                    >
                                        {brand}
                                    </Text>
                                    {schedule?.feedStockKg !== undefined && schedule?.feedStockKg !== null && (
                                        <Text style={[textStyles.body, { color: schedule.feedStockKg < 10 ? colors.error : colors.textGrey, fontSize: 11, marginTop: 3, textAlign: 'center', fontWeight: schedule.feedStockKg < 10 ? '700' : 'normal' }]}>
                                            {schedule.feedStockKg} kg left
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Dispense Schedule */}
                    <View style={[anifeedStyles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke, padding: 20, borderRadius: 24 }]}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 17, fontWeight: '700' }]}>Dispense Schedule</Text>
                                    {schedule && (
                                        <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                                                {schedule.timesPerDay}× / day
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                    {schedule ? `${(schedule.timesPerDay * schedule.gramsPerDispense).toLocaleString()}g total daily feeding` : 'No schedule configured yet'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    if (schedule) {
                                        setTempTimesPerDay(String(schedule.timesPerDay));
                                        setTempGrams(String(schedule.gramsPerDispense));
                                        setTempTimes((schedule.dispenseTimes ?? ['08:00', '12:00', '18:00']).map(format24to12));
                                    } else {
                                        setTempTimesPerDay('3');
                                        setTempGrams('500');
                                        setTempTimes(['08:00', '12:00', '18:00'].map(format24to12));
                                    }
                                    setScheduleModalView('schedule');
                                    setScheduleModalVisible(true);
                                }}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 20,
                                    backgroundColor: colors.primary + '18',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="edit" size={19} color={colors.primary} />
                            </TouchableOpacity>
                        </View>

                        {schedule ? (
                            <>
                                {/* Stats Metric Row */}
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                                    <View style={{ flex: 1, backgroundColor: colors.cardFill, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                            <MaterialIcons name="line-weight" size={14} color={colors.primary} />
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]} numberOfLines={1}>Per Dispense</Text>
                                        </View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, fontWeight: '700' }]}>
                                            {schedule.gramsPerDispense}g
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1, backgroundColor: colors.cardFill, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                            <MaterialIcons name="repeat" size={14} color={colors.secondary} />
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]} numberOfLines={1}>Daily Total</Text>
                                        </View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, fontWeight: '700' }]}>
                                            {(schedule.timesPerDay * schedule.gramsPerDispense).toLocaleString()}g
                                        </Text>
                                    </View>
                                    {schedule.feedStockKg !== undefined && schedule.feedStockKg !== null && (
                                        <View style={{ flex: 1, backgroundColor: colors.cardFill, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                                <MaterialIcons name="inventory" size={14} color={schedule.feedStockKg < 10 ? colors.error : colors.info} />
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]} numberOfLines={1}>Stock Left</Text>
                                            </View>
                                            <Text style={[textStyles.h3, { color: schedule.feedStockKg < 10 ? colors.error : colors.text, fontSize: 15, fontWeight: schedule.feedStockKg < 10 ? '700' : 'bold' }]}>
                                                {schedule.feedStockKg} kg
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Dispense Times Badges */}
                                <View style={{ width: '100%', marginBottom: 4 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }]}>
                                        Dispense Times ({schedule.dispenseTimes?.length || 0})
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        {schedule.dispenseTimes && schedule.dispenseTimes.length > 0 ? (
                                            schedule.dispenseTimes.map((time, idx) => (
                                                <View
                                                    key={idx}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        backgroundColor: colors.bgLight,
                                                        borderWidth: 1,
                                                        borderColor: colors.stroke,
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 7,
                                                        borderRadius: 12,
                                                        gap: 6,
                                                    }}
                                                >
                                                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, fontWeight: '700' }]}>
                                                            {idx + 1}
                                                        </Text>
                                                    </View>
                                                    <MaterialIcons name="access-time" size={14} color={colors.primary} />
                                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontWeight: '600' }]}>
                                                        {format24to12(time)}
                                                    </Text>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Not set</Text>
                                        )}
                                    </View>
                                </View>
                            </>
                        ) : (
                            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                                <MaterialIcons name="schedule" size={36} color={colors.textGrey} style={{ marginBottom: 8 }} />
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                                    Tap the edit button above to set up automatic dispensing times.
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[anifeedStyles.recordsLink, { borderTopColor: colors.stroke, marginTop: 14, marginHorizontal: -20, marginBottom: -20 }]}
                            activeOpacity={0.7}
                            onPress={() => router.push(`/(devices)/DispenseRecordsScreen?deviceId=${deviceId}` as any)}
                        >
                            <Text style={[textStyles.label, { color: colors.primary, fontWeight: '600' }]}>View All Dispense Records</Text>
                            <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    {/* AI Feed Recommendations */}
                    <AIInsightCard
                        title="AI Feed Recommendations"
                        variant="orange"
                        category="feed_device"
                        farmId={farmId}
                        subKey={deviceId ? `${deviceId}_${(schedule as any)?.batch_id || deviceInfo?.housingId || 'general'}_${(deviceInfo?.animalType || 'general').toLowerCase()}` : ''}
                        context={{
                            type: 'feed',
                            animalType: deviceInfo?.animalType ?? 'livestock',
                            housingName: deviceInfo?.housingName ?? '',
                            data: {
                                deviceId,
                                batchId: (schedule as any)?.batch_id ?? null,
                                housingId: deviceInfo?.housingId ?? null,
                                feedBrand: schedule?.feedBrand ?? null,
                                timesPerDay: schedule?.timesPerDay ?? null,
                                gramsPerDispense: schedule?.gramsPerDispense ?? null,
                                todayTotalGrams: liveTodayGrams ?? null,
                                todayCompletedDispensesCount: liveTodayDispenseCount ?? null,
                                recentDispenses: dispenseLogs.slice(0, 5).map(l => ({
                                    amountGrams: l.amountGrams,
                                    status: l.status,
                                    time: new Date(l.timestamp).toISOString(),
                                })),
                            },
                        }}
                    />

                    {/* Recent Logs */}
                    <View style={anifeedStyles.logsSection}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 12 }]}>Recent Logs</Text>
                        {dispenseLogs.length === 0 ? (
                            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                <MaterialIcons name="history" size={32} color={colors.textGrey} />
                                <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>No dispense events recorded yet.</Text>
                            </View>
                        ) : (
                            dispenseLogs.slice(0, 3).map((log, index) => {
                                const statusColor = log.status === 'error' ? colors.error : log.status === 'pending' ? colors.warning : colors.primary;
                                const statusIcon: any = log.status === 'error' ? 'error-outline' : log.status === 'pending' ? 'schedule' : 'check-circle';
                                const statusLabel = log.status === 'error' ? 'Failed' : log.status === 'pending' ? 'Pending' : 'Success';
                                return (
                                    <View
                                        key={log.id ?? index}
                                        style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, marginBottom: 10, overflow: 'hidden', flexDirection: 'row' }}
                                    >
                                        {/* Left accent strip */}
                                        <View style={{ width: 4, backgroundColor: statusColor }} />

                                        {/* Card content */}
                                        <View style={{ flex: 1, padding: 12 }}>
                                            {/* Top row */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                <View style={{ flex: 1, marginRight: 12 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                                        <MaterialIcons name="home" size={13} color={colors.textGrey} />
                                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginLeft: 3 }]} numberOfLines={1}>{log.housingName}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: statusColor + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                                        <MaterialIcons name={statusIcon} size={11} color={statusColor} />
                                                        <Text style={[textStyles.label, { color: statusColor, fontSize: 11, marginLeft: 3, fontWeight: '700' }]}>{statusLabel}</Text>
                                                    </View>
                                                </View>
                                                {/* Amount — prominent right */}
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>{log.amount}</Text>
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>dispensed</Text>
                                                </View>
                                            </View>

                                            {/* Bottom chip */}
                                            <View style={{ flexDirection: 'row', gap: 6 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                                                    <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{formatLogTime(log.timestamp)}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        {/* View All link */}
                        {dispenseLogs.length > 0 && (
                            <TouchableOpacity
                                onPress={() => router.push(`/(devices)/DispenseRecordsScreen?deviceId=${deviceId}` as any)}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                    paddingVertical: 12, marginTop: 2,
                                    borderWidth: 1, borderColor: colors.stroke,
                                    borderRadius: 12, backgroundColor: colors.surface,
                                }}
                            >
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 13 }]}>View All Logs</Text>
                                <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
                            </TouchableOpacity>
                        )}

                    </View>

                </ScrollView>
            )}

            {/* Connection confirm modal */}
            <ActionModal
                visible={modalVisible}
                type={modalType}
                title={modalTitle}
                message={modalMessage}
                confirmText={modalTitle.includes('Disconnect') ? 'Disconnect' : 'Connect'}
                cancelText="Cancel"
                onConfirm={handleModalConfirm}
                onCancel={() => setModalVisible(false)}
            />

            {/* Manual Dispense modal */}
            <Modal
                visible={manualDispenseVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    if (!isManualDispensing) {
                        Keyboard.dismiss();
                        setManualDispenseVisible(false);
                    }
                }}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => Keyboard.dismiss()}
                        style={[anifeedStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                    >
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => {}}
                            style={[anifeedStyles.modalContent, { backgroundColor: colors.surface, maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center', position: 'relative' }]}
                        >
                            {/* Close button */}
                            <TouchableOpacity
                                style={{ position: 'absolute', top: 16, right: 16, padding: 6, zIndex: 10 }}
                                onPress={() => {
                                    if (!isManualDispensing) {
                                        Keyboard.dismiss();
                                        setManualDispenseVisible(false);
                                    }
                                }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="close" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            {/* Icon */}
                            <View style={[anifeedStyles.iconContainer, { backgroundColor: colors.primary + '1A' }]}>
                                <MaterialIcons name="food-bank" size={32} color={colors.primary} />
                            </View>

                            <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 6, fontSize: 20 }]}>Manual Dispense</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 20, fontSize: 13 }]}>
                                Logged instantly with the current time. Adjust the amount if needed.
                            </Text>

                            {/* Grams input */}
                            <View style={{ width: '100%', marginBottom: 8 }}>
                                <FloatingLabelInput
                                    label="Amount (grams)"
                                    icon="line-weight"
                                    value={manualGrams}
                                    keyboardType="numeric"
                                    onChangeText={t => setManualGrams(t.replace(/[^0-9]/g, ''))}
                                />
                            </View>

                            {/* Feed stock hint */}
                            {schedule?.feedStockKg !== undefined && schedule.feedStockKg !== null && (
                                <Text style={[textStyles.body, { color: schedule.feedStockKg < 10 ? colors.error : colors.textGrey, fontSize: 12, marginBottom: 16, textAlign: 'center' }]}>
                                    Feed stock remaining: {schedule.feedStockKg} kg
                                </Text>
                            )}

                            {/* Buttons */}
                            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        setManualDispenseVisible(false);
                                    }}
                                    disabled={isManualDispensing}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 13,
                                        borderRadius: 14,
                                        alignItems: 'center',
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        backgroundColor: colors.cardFill,
                                        opacity: isManualDispensing ? 0.5 : 1,
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 14 }]}>Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        handleConfirmManualDispense();
                                    }}
                                    disabled={isManualDispensing}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 13,
                                        borderRadius: 14,
                                        alignItems: 'center',
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        gap: 6,
                                        backgroundColor: colors.primary,
                                        opacity: isManualDispensing ? 0.7 : 1,
                                    }}
                                    activeOpacity={0.8}
                                >
                                    {isManualDispensing ? (
                                        <ActivityIndicator size="small" color={colors.onPrimary} />
                                    ) : (
                                        <MaterialIcons name="check" size={16} color={colors.onPrimary} />
                                    )}
                                    <Text style={[textStyles.btnLabel, { color: colors.onPrimary, fontSize: 14 }]}>
                                        {isManualDispensing ? 'Logging...' : 'Dispense'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>

            {/* Unified Schedule & Time Picker Modal */}
            <Modal
                visible={scheduleModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    Keyboard.dismiss();
                    if (scheduleModalView === 'timePicker') {
                        setScheduleModalView('schedule');
                    } else {
                        setScheduleModalVisible(false);
                    }
                }}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 360, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 22, overflow: 'hidden', position: 'relative' }}>
                            {/* Close button */}
                            <TouchableOpacity
                                style={{ position: 'absolute', top: 16, right: 16, padding: 6, zIndex: 10 }}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setScheduleModalView('schedule');
                                    setScheduleModalVisible(false);
                                }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="close" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            {scheduleModalView === 'schedule' ? (
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
                                    {/* Icon & Title */}
                                    <View style={[anifeedStyles.iconContainer, { backgroundColor: colors.primary + '1A', marginBottom: 10, marginTop: 4 }]}>
                                        <MaterialIcons name="edit-calendar" size={30} color={colors.primary} />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 4, fontSize: 20, fontWeight: '700' }]}>
                                        Edit Schedule
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 18, fontSize: 13 }]}>
                                        Configure dispensing frequency and times.
                                    </Text>

                                    {/* 1. Times Per Day Section */}
                                    <View style={{ width: '100%', marginBottom: 18 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                                                Times Per Day
                                            </Text>
                                            <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                                                    {tempTimesPerDay}× Daily
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Stepper + Quick Preset Pills */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <TouchableOpacity
                                                style={{
                                                    width: 38,
                                                    height: 38,
                                                    borderRadius: 12,
                                                    backgroundColor: colors.cardFill,
                                                    borderWidth: 1,
                                                    borderColor: colors.stroke,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                                onPress={() => {
                                                    const cur = parseInt(tempTimesPerDay, 10) || 1;
                                                    updateTimesCount(cur - 1);
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="remove" size={18} color={colors.text} />
                                            </TouchableOpacity>

                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                                {[1, 2, 3, 4, 5, 6].map((freq) => {
                                                    const isSelected = (parseInt(tempTimesPerDay, 10) || 0) === freq;
                                                    return (
                                                        <TouchableOpacity
                                                            key={freq}
                                                            onPress={() => updateTimesCount(freq)}
                                                            activeOpacity={0.7}
                                                            style={{
                                                                paddingHorizontal: 12,
                                                                height: 38,
                                                                borderRadius: 12,
                                                                backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                                borderWidth: 1,
                                                                borderColor: isSelected ? colors.primary : colors.stroke,
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                            }}
                                                        >
                                                            <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontWeight: isSelected ? '700' : '500', fontSize: 13 }]}>
                                                                {freq}×
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </ScrollView>

                                            <TouchableOpacity
                                                style={{
                                                    width: 38,
                                                    height: 38,
                                                    borderRadius: 12,
                                                    backgroundColor: colors.cardFill,
                                                    borderWidth: 1,
                                                    borderColor: colors.stroke,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                                onPress={() => {
                                                    const cur = parseInt(tempTimesPerDay, 10) || 1;
                                                    updateTimesCount(cur + 1);
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="add" size={18} color={colors.text} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* 2. Dispense Times List */}
                                    <View style={{ width: '100%', marginBottom: 18 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                                                Dispense Times
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                Tap any time to adjust
                                            </Text>
                                        </View>

                                        <View style={{ width: '100%', gap: 8 }}>
                                            {tempTimes.map((time, idx) => (
                                                <TouchableOpacity
                                                    key={idx}
                                                    activeOpacity={0.7}
                                                    onPress={() => {
                                                        setActiveTimeIdx(idx);
                                                        const cleaned = time.trim().toUpperCase();
                                                        const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
                                                        if (match) {
                                                            const h = parseInt(match[1], 10);
                                                            const m = parseInt(match[2], 10);
                                                            setSelectedHour(h >= 1 && h <= 12 ? h : 12);
                                                            setSelectedMinute(Math.min(55, Math.round(m / 5) * 5));
                                                            setSelectedAmPm(match[3] as 'AM' | 'PM');
                                                        } else {
                                                            setSelectedHour(12);
                                                            setSelectedMinute(0);
                                                            setSelectedAmPm('AM');
                                                        }
                                                        setScheduleModalView('timePicker');
                                                    }}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        backgroundColor: colors.bgLight,
                                                        borderWidth: 1,
                                                        borderColor: colors.stroke,
                                                        borderRadius: 14,
                                                        paddingVertical: 10,
                                                        paddingHorizontal: 14,
                                                    }}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                                                                {idx + 1}
                                                            </Text>
                                                        </View>
                                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14, fontWeight: '600' }]}>
                                                            {getOrdinalLabel(idx + 1)} Dispense
                                                        </Text>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={{ backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke }}>
                                                            <Text style={[textStyles.body, { color: colors.primary, fontSize: 13, fontWeight: '700' }]}>
                                                                {time}
                                                            </Text>
                                                        </View>
                                                        <MaterialIcons name="edit" size={16} color={colors.primary} />
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    {/* 3. Grams Per Dispense */}
                                    <View style={{ width: '100%', marginBottom: 14 }}>
                                        <FloatingLabelInput
                                            label="Grams per dispense"
                                            icon="line-weight"
                                            value={tempGrams}
                                            onChangeText={t => setTempGrams(t.replace(/[^0-9]/g, ''))}
                                            keyboardType="numeric"
                                            backgroundColor={colors.surface}
                                        />
                                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                                            {[250, 500, 750, 1000].map((amount) => {
                                                const isSelected = tempGrams === String(amount);
                                                return (
                                                    <TouchableOpacity
                                                        key={amount}
                                                        onPress={() => setTempGrams(String(amount))}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            flex: 1,
                                                            paddingVertical: 6,
                                                            borderRadius: 8,
                                                            backgroundColor: isSelected ? colors.primary + '18' : colors.cardFill,
                                                            borderWidth: 1,
                                                            borderColor: isSelected ? colors.primary : colors.stroke,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        <Text style={[textStyles.label, { color: isSelected ? colors.primary : colors.textGrey, fontSize: 11, fontWeight: isSelected ? '700' : '500' }]}>
                                                            {amount}g
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Live Daily Feed Preview Banner */}
                                    {(() => {
                                        const count = parseInt(tempTimesPerDay, 10) || 0;
                                        const grams = parseInt(tempGrams, 10) || 0;
                                        const total = count * grams;
                                        return (
                                            <View style={{ width: '100%', backgroundColor: colors.cardFill, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke, marginBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <MaterialIcons name="calculate" size={18} color={colors.primary} />
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                                        Daily Total
                                                    </Text>
                                                </View>
                                                <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontWeight: '700' }]}>
                                                    {count} × {grams}g = <Text style={{ color: colors.primary }}>{total.toLocaleString()}g / day</Text>
                                                </Text>
                                            </View>
                                        );
                                    })()}

                                    {/* Action Buttons */}
                                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                paddingVertical: 13,
                                                borderRadius: 14,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                backgroundColor: colors.cardFill,
                                            }}
                                            onPress={() => {
                                                Keyboard.dismiss();
                                                setScheduleModalVisible(false);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 14 }]}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                paddingVertical: 13,
                                                borderRadius: 14,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: colors.primary,
                                                opacity: (tempTimesPerDay && tempGrams && tempTimes.length > 0) ? 1 : 0.5,
                                            }}
                                            onPress={() => {
                                                Keyboard.dismiss();
                                                handleSaveSchedule();
                                            }}
                                            activeOpacity={0.7}
                                            disabled={!(tempTimesPerDay && tempGrams && tempTimes.length > 0)}
                                        >
                                            <Text style={[textStyles.btnLabel, { color: colors.onPrimary, fontSize: 14, fontWeight: '700' }]}>Save Schedule</Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            ) : (
                                /* Time Picker View */
                                <View style={{ alignItems: 'center', width: '100%' }}>
                                    {/* Top Navigation */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                                        <TouchableOpacity
                                            onPress={() => setScheduleModalView('schedule')}
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: 18,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                            }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="arrow-back" size={20} color={colors.text} />
                                        </TouchableOpacity>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 17, fontWeight: '700' }]}>
                                            {activeTimeIdx !== null ? `${getOrdinalLabel(activeTimeIdx + 1)} Dispense Time` : 'Select Time'}
                                        </Text>
                                        <View style={{ width: 36 }} />
                                    </View>

                                    <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 12, marginBottom: 12 }]}>
                                        Select hour, minute (5-min intervals), and period.
                                    </Text>

                                    {/* Digital Display Card */}
                                    {(() => {
                                        const candidateTime = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')} ${selectedAmPm}`;
                                        const isDuplicateTime = activeTimeIdx !== null && tempTimes.some((t, i) => i !== activeTimeIdx && t.trim().toUpperCase() === candidateTime);
                                        return (
                                            <>
                                                <View style={{ backgroundColor: colors.bgLight, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginBottom: isDuplicateTime ? 8 : 12, borderWidth: 1, borderColor: isDuplicateTime ? colors.error : colors.stroke, width: '100%', flexDirection: 'row', gap: 6 }}>
                                                    <Text style={[textStyles.h1, { color: isDuplicateTime ? colors.error : colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 }]}>
                                                        {String(selectedHour).padStart(2, '0')}
                                                    </Text>
                                                    <Text style={[textStyles.h1, { color: isDuplicateTime ? colors.error : colors.primary, fontSize: 30, fontWeight: '800' }]}>:</Text>
                                                    <Text style={[textStyles.h1, { color: isDuplicateTime ? colors.error : colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 }]}>
                                                        {String(selectedMinute).padStart(2, '0')}
                                                    </Text>
                                                    <View style={{ backgroundColor: isDuplicateTime ? colors.error : colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 }}>
                                                        <Text style={[textStyles.label, { color: colors.onPrimary, fontSize: 13, fontWeight: '800' }]}>
                                                            {selectedAmPm}
                                                        </Text>
                                                    </View>
                                                </View>

                                                {/* Duplicate Alert Banner */}
                                                {isDuplicateTime && (
                                                    <View style={{ width: '100%', backgroundColor: colors.error + '18', borderWidth: 1, borderColor: colors.error, borderRadius: 12, padding: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <MaterialIcons name="error-outline" size={16} color={colors.error} />
                                                        <Text style={[textStyles.body, { color: colors.error, fontSize: 11, fontWeight: '600', flex: 1 }]}>
                                                            Time is already assigned to another dispense slot.
                                                        </Text>
                                                    </View>
                                                )}
                                            </>
                                        );
                                    })()}

                                    {/* AM / PM Switcher */}
                                    <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginBottom: 12 }}>
                                        {(['AM', 'PM'] as const).map((period) => {
                                            const isSelected = selectedAmPm === period;
                                            return (
                                                <TouchableOpacity
                                                    key={period}
                                                    onPress={() => setSelectedAmPm(period)}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        flex: 1,
                                                        height: 36,
                                                        borderRadius: 12,
                                                        backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderWidth: 1,
                                                        borderColor: isSelected ? colors.primary : colors.stroke,
                                                    }}
                                                >
                                                    <Text style={[textStyles.label, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: '700' }]}>
                                                        {period}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    {/* Hours Grid (4 columns x 3 rows) */}
                                    <View style={{ width: '100%', marginBottom: 12 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }]}>
                                            Hour
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
                                            {Array.from({ length: 12 }).map((_, i) => {
                                                const h = i + 1;
                                                const isSelected = selectedHour === h;
                                                return (
                                                    <TouchableOpacity
                                                        key={h}
                                                        onPress={() => setSelectedHour(h)}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            width: '23%',
                                                            height: 34,
                                                            borderRadius: 10,
                                                            backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            borderWidth: 1,
                                                            borderColor: isSelected ? colors.primary : colors.stroke,
                                                        }}
                                                    >
                                                        <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: isSelected ? '700' : '600' }]}>
                                                            {String(h).padStart(2, '0')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Minutes Grid (4 columns x 3 rows: 5-minute intervals only) */}
                                    <View style={{ width: '100%', marginBottom: 16 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }]}>
                                            Minute (5-min intervals)
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
                                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                                                const isSelected = selectedMinute === m;
                                                return (
                                                    <TouchableOpacity
                                                        key={m}
                                                        onPress={() => setSelectedMinute(m)}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            width: '23%',
                                                            height: 32,
                                                            borderRadius: 10,
                                                            backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            borderWidth: 1,
                                                            borderColor: isSelected ? colors.primary : colors.stroke,
                                                        }}
                                                    >
                                                        <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 12, fontWeight: isSelected ? '700' : '600' }]}>
                                                            :{String(m).padStart(2, '0')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Action buttons */}
                                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                paddingVertical: 12,
                                                borderRadius: 14,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                backgroundColor: colors.cardFill,
                                            }}
                                            onPress={() => setScheduleModalView('schedule')}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 14 }]}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{
                                                flex: 1,
                                                paddingVertical: 12,
                                                borderRadius: 14,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: colors.primary,
                                            }}
                                            onPress={() => {
                                                const candidateTime = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')} ${selectedAmPm}`;
                                                if (activeTimeIdx !== null) {
                                                    const isDuplicate = tempTimes.some((t, i) => i !== activeTimeIdx && t.trim().toUpperCase() === candidateTime);
                                                    if (isDuplicate) {
                                                        showSnackbar(`"${candidateTime}" is already assigned to another dispense time.`, 'error');
                                                        return;
                                                    }
                                                    const updated = [...tempTimes];
                                                    updated[activeTimeIdx] = candidateTime;
                                                    setTempTimes(updated);
                                                }
                                                setScheduleModalView('schedule');
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[textStyles.btnLabel, { color: colors.onPrimary, fontSize: 14, fontWeight: '700' }]}>Set Time</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Edit Housing / Brand / AnimalType modal */}
            {editTarget && (
                <SelectionModal
                    visible={editModalVisible}
                    onClose={() => setEditModalVisible(false)}
                    onSelect={handleEditConfirm}
                    title={editTarget === 'AnimalType' ? 'Animal Type' : editTarget === 'Brand' ? 'Select Feed' : `Edit ${editTarget}`}
                    description={
                        editTarget === 'AnimalType'
                            ? 'Select the animal type for this feeder.'
                            : editTarget === 'Brand'
                            ? `Showing feeds registered for ${animalType}s only.`
                            : `Select a new ${editTarget.toLowerCase()} for this device.`
                    }
                    icon="edit"
                    options={getEditOptions()}
                    selectedValue={
                        editTarget === 'Housing' ? housing
                        : editTarget === 'AnimalType' ? animalType
                        : brand
                    }
                    enableSearch={editTarget !== 'AnimalType'}
                />
            )}

            {/* Feed Details Modal */}
            <Modal visible={feedDetailsModalVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.stroke }}>
                        <View style={{ alignItems: 'center', marginBottom: 16 }}>
                            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                <MaterialIcons name="inventory-2" size={26} color={colors.primary} />
                            </View>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center' }]}>
                                Feed Details
                            </Text>
                        </View>

                        <View style={{ backgroundColor: colors.cardFill, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.stroke, gap: 12 }}>
                            <View>
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 2 }]}>FULL FEED NAME</Text>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                    {brand || 'No feed selected'}
                                </Text>
                            </View>

                            <View style={{ height: 1, backgroundColor: colors.stroke }} />

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 2 }]}>ANIMAL TYPE</Text>
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                        {animalType}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 2 }]}>CURRENT STOCK</Text>
                                    <Text style={[textStyles.body, { color: (schedule?.feedStockKg ?? 0) < 10 ? colors.error : colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                        {schedule?.feedStockKg !== null && schedule?.feedStockKg !== undefined ? `${schedule.feedStockKg} kg` : '—'}
                                    </Text>
                                </View>
                            </View>

                            {schedule?.feedExpiryDate && (
                                <>
                                    <View style={{ height: 1, backgroundColor: colors.stroke }} />
                                    <View>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 2 }]}>EXPIRY DATE</Text>
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>
                                            {schedule.feedExpiryDate}
                                        </Text>
                                    </View>
                                </>
                            )}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 13, borderRadius: 30, alignItems: 'center' }}
                                onPress={() => setFeedDetailsModalVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 30, alignItems: 'center' }}
                                onPress={() => {
                                    setFeedDetailsModalVisible(false);
                                    openEditModal('Brand');
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Change Feed</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

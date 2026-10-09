import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, Platform, RefreshControl, ScrollView, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import FeedScheduleModal from '@/components/FeedScheduleModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniWeighStyles } from '@/styles/aniweighStyles';
import { AnimalIcon } from '@/components/AnimalIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { AIInsightCard } from '@/components/AIInsightCard';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import { WeighingSetupGate } from '@/components/WeighingSetupGate';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceDisplayStatus } from '@/lib/deviceStatus';
import {
    getWeighingReminder,
    saveWeighingReminder,
    WeighingReminderConfig,
    ReminderMode,
} from '@/lib/weighingReminders';
import {
    fetchTargetWeights,
    getStandardForWeek,
    GrowthStandard,
    AnimalType as StandardAnimalType,
} from '@/constants/growthStandards';

interface DeviceInfo {
    name: string;
    status: string;
    lastSeen: string | null;
    weighingActive: boolean;
    housingId: string | null;
    housingName: string;
    animalType: 'Pig' | 'Piglet' | 'Chicken' | 'Chicks' | 'Chicks (with caution: must be in crate)';
}

interface WeightThreshold {
    id: string | null;
    underweightMaxGrams: number;
    normalMinGrams: number;
    normalMaxGrams: number;
    overweightMinGrams: number;
}

interface WeighLogEntry {
    id: string;
    weight_g: number;
    gross_weight_g?: number;
    chick_count?: number;
    weigh_mode?: string;
    animal_label?: string;
    status: 'underweight' | 'normal' | 'overweight';
    timestamp: number;
    animal: string;
    housingId: string | null;
    housingName: string;
    deviceId: string;
    deviceName: string;
}

interface SegregationStats {
    total: number;
    underweight: { count: number; percentage: number };
    normal:      { count: number; percentage: number };
    overweight:  { count: number; percentage: number };
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



function calculateBatchAge(arrivalDateStr: string, ageAtArrivalDays: number, animalType: 'Chicken' | 'Pig') {
    if (!arrivalDateStr) return '0 days';
    const arrivalDate = new Date(arrivalDateStr);
    const today = new Date();
    arrivalDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - arrivalDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const ageDays = Math.max(0, diffDays) + (ageAtArrivalDays || 0);

    if (animalType === 'Chicken') {
        return `${ageDays} ${ageDays === 1 ? 'day' : 'days'}`;
    } else {
        if (ageDays < 30) {
            return `${ageDays} ${ageDays === 1 ? 'day' : 'days'}`;
        } else {
            const months = Math.floor(ageDays / 30);
            const remainingDays = ageDays % 30;
            if (remainingDays === 0) {
                return `${months} ${months === 1 ? 'month' : 'months'} (${ageDays} days)`;
            } else {
                return `${months} ${months === 1 ? 'month' : 'months'}, ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} (${ageDays} days)`;
            }
        }
    }
}

export default function AniWeighScreen() {
    const { systemConfig, profile, user } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const aniweighStyles = useAniWeighStyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ deviceId?: string; status?: string }>();
    const deviceId = params.deviceId ?? '';
    const initialStatus = params.status;

    if (systemConfig?.featureFlags && !systemConfig.featureFlags.weighingEnabled) {
        return (
            <View style={[aniweighStyles.safeArea, { backgroundColor: colors.bgLight, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
                <MaterialIcons name="block" size={64} color={colors.textGrey} />
                <Text style={[textStyles.h2, { color: colors.text, marginTop: 20 }]}>Weighing Module Disabled</Text>
                <Text style={[textStyles.body, { textAlign: 'center', marginTop: 10, color: colors.textGrey, paddingHorizontal: 40 }]}>
                    This feature is currently disabled by the system administrator.
                </Text>
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(devices)/DevicesScreen' as any)} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ─── State ───────────────────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(initialStatus ? initialStatus === 'online' : false);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    // Ref so realtime callback always has the latest deviceInfo without stale closure
    const deviceInfoRef = useRef<DeviceInfo | null>(null);
    const [threshold, setThreshold] = useState<WeightThreshold | null>(null);
    const thresholdRef = useRef<WeightThreshold | null>(null);
    const [weightLogs, setWeightLogs] = useState<WeighLogEntry[]>([]);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const [segregationStats, setSegregationStats] = useState<SegregationStats>({ total: 0, underweight: { count: 0, percentage: 0 }, normal: { count: 0, percentage: 0 }, overweight: { count: 0, percentage: 0 } });
    const [statsExpanded, setStatsExpanded] = useState(false);
    const [farmHousings, setFarmHousings] = useState<{ id: string; name: string; animal_type: string; farm_id?: string }[]>([]);

    // Range settings modal (Read-Only)
    const [rangeSettingsVisible, setRangeSettingsVisible] = useState(false);
    const [rangeUnit, setRangeUnit] = useState<'kg' | 'g'>('kg');
    const [activeRearingWeek, setActiveRearingWeek] = useState<number>(1);
    const [activeWeekStandard, setActiveWeekStandard] = useState<GrowthStandard | null>(null);

    // Range modal animation
    const rangeBackdropAnim = useRef(new Animated.Value(0)).current;
    const rangeSheetAnim = useRef(new Animated.Value(300)).current;

    useEffect(() => {
        if (rangeSettingsVisible) {
            Animated.parallel([
                Animated.timing(rangeBackdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(rangeSheetAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180 }),
            ]).start();
        }
    }, [rangeSettingsVisible]);

    const closeRangeModal = (callback?: () => void) => {
        Animated.parallel([
            Animated.timing(rangeBackdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
            Animated.timing(rangeSheetAnim, { toValue: 300, duration: 220, useNativeDriver: true }),
        ]).start(() => {
            setRangeSettingsVisible(false);
            rangeSheetAnim.setValue(300);
            rangeBackdropAnim.setValue(0);
            callback?.();
        });
    };

    // Edit modal
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Animal Type' | 'Housing' | 'Batch' | null>(null);

    // Action modal
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('info');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');
    const [pendingEditVal, setPendingEditVal] = useState('');
    const [offlineModalVisible, setOfflineModalVisible] = useState(false);

    // Snackbar
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const [deviceUniqueCode, setDeviceUniqueCode] = useState('');
    const animalTypeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Live reading (from Supabase Realtime)
    const [liveWeightG, setLiveWeightG] = useState<number | null>(null);
    const [liveStatus, setLiveStatus] = useState<'underweight' | 'normal' | 'overweight' | null>(null);
    const [liveFlash, setLiveFlash] = useState(false);

    // ─── Live sampling progress (real values pushed by the board) ───
    // Fed by devices.sample_progress, updated by board1.ino's
    // postSampleProgress() on every one of its 5 real internal samples —
    // works from any network, same as everything else in this app.
    // Purely a display concern — real classification/recording still only
    // ever comes from the confirmed weigh_sessions row (see liveWeightG/
    // liveStatus above and the realtime INSERT handler below), which is
    // also what clears this once it lands.
    interface SampleProgress {
        stage: 'sampling' | 'averaging' | 'done';
        sampleIndex?: number;
        total?: number;
        sampleValue?: number;
        average?: number;
        perChick?: number;
        chickCount?: number;
    }
    const [sampleProgress, setSampleProgress] = useState<SampleProgress | null>(null);
    const sampleProgressStaleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const applySampleProgress = (raw: any) => {
        if (!raw || typeof raw !== 'object') return;
        setSampleProgress(raw as SampleProgress);
        if (sampleProgressStaleTimeoutRef.current) clearTimeout(sampleProgressStaleTimeoutRef.current);
        // Safety net — if the confirmed weigh_sessions row never arrives
        // (network hiccup between the board and Supabase), don't leave the
        // screen stuck on "Sample 3/5" forever.
        sampleProgressStaleTimeoutRef.current = setTimeout(() => setSampleProgress(null), 20000);
    };

    const [housingBatches, setHousingBatches] = useState<{ id: string; name: string; current_count: number; arrival_date: string; age_at_arrival_days: number }[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

    // ─── Chicks per Tray Settings (Batch / Tray Weighing) ───────────
    const [chicksPerTray, setChicksPerTray] = useState<number>(20);
    const chicksPerTrayRef = useRef<number>(20);
    const [chicksPerTrayModalVisible, setChicksPerTrayModalVisible] = useState(false);
    const [tempChicksPerTray, setTempChicksPerTray] = useState<string>('20');

    // ─── Mandatory pre-weighing gate ──────────────────────────────
    // The live scale view (Live Scaling card, Start/Stop/Tare/Reset) only
    // unlocks once there's an active weighing_sessions row for this device —
    // created by explicitly picking House + Batch + Animal Type below, fresh
    // every run. Every physical reading that comes in through
    // record_weigh_session() while this is in_progress gets attached to it
    // (see the updated RPC) and bumps completed_quantity automatically.
    interface ActiveSession {
        id: string;
        batch_id: string;
        housing_id: string;
        animal_type: 'pig' | 'chicken' | 'chicks' | 'piglet';
        weigh_mode: 'individual' | 'batch';
        expected_quantity: number;
        completed_quantity: number;
        farm_day: number | null;
    }
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const activeSessionRef = useRef<ActiveSession | null>(null);
    const [isSessionLoading, setIsSessionLoading] = useState(true);

    const [gateHousingId, setGateHousingId] = useState<string | null>(null);
    const [gateBatchId, setGateBatchId] = useState<string | null>(null);
    const [gateAnimalType, setGateAnimalType] = useState<'pig' | 'piglet' | 'chicken' | 'chicks'>('pig');
    // Only meaningful for chickens — some farms weigh bird-by-bird, others
    // weigh a whole crate/tray at once. Pigs are always weighed individually,
    // so this stays fixed and hidden in that case.
    const [gateWeighMode, setGateWeighMode] = useState<'individual' | 'batch'>('individual');
    const [gateBatches, setGateBatches] = useState<{ id: string; name: string; current_count: number; arrival_date: string; age_at_arrival_days: number }[]>([]);
    const [gateHousingModalVisible, setGateHousingModalVisible] = useState(false);
    const [gateBatchModalVisible, setGateBatchModalVisible] = useState(false);
    const [isBeginningSession, setIsBeginningSession] = useState(false);
    const gatePrefilledRef = useRef(false);
    const [finishModalVisible, setFinishModalVisible] = useState(false);
    const [isFinishingSession, setIsFinishingSession] = useState(false);

    // ─── Weighing Reminders State ──────────────────────────────────
    const [reminderConfig, setReminderConfig] = useState<WeighingReminderConfig | null>(null);
    const [reminderModalVisible, setReminderModalVisible] = useState(false);
    const [reminderView, setReminderView] = useState<'main' | 'customTime'>('main');
    const [reminderEnabled, setReminderEnabled] = useState(true);
    const [reminderMode, setReminderMode] = useState<ReminderMode>('interval');
    const [reminderInterval, setReminderInterval] = useState<number>(7);
    const [reminderDaysOfWeek, setReminderDaysOfWeek] = useState<number[]>([1, 4]); // Mon, Thu default
    const [reminderMilestoneDays, setReminderMilestoneDays] = useState<number[]>([7, 14, 21, 28, 35, 42]);
    const [reminderInactivityDays, setReminderInactivityDays] = useState<number>(5);
    const [reminderTime, setReminderTime] = useState<string>('08:00');
    const [reminderHousingId, setReminderHousingId] = useState<string | null>(null);
    const [reminderBatchId, setReminderBatchId] = useState<string | null>(null);
    const [reminderBatches, setReminderBatches] = useState<{ id: string; name: string; status: string; current_count: number }[]>([]);
    const [isSavingReminder, setIsSavingReminder] = useState(false);
    const [isTestingReminder, setIsTestingReminder] = useState(false);

    // Custom alert time picker state
    const [customTimeHour, setCustomTimeHour] = useState<number>(8);
    const [customTimeMinute, setCustomTimeMinute] = useState<number>(0);
    const [customTimeAmPm, setCustomTimeAmPm] = useState<'AM' | 'PM'>('AM');

    const formatReminderTimeLabel = useCallback((timeStr: string) => {
        if (!timeStr) return '8:00 AM';
        const parts = timeStr.split(':');
        let h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) || 0;
        if (isNaN(h)) return '8:00 AM';
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
    }, []);

    const openCustomTimePicker = useCallback(() => {
        const parts = (reminderTime || '08:00').split(':');
        let h = parseInt(parts[0], 10) || 8;
        const m = parseInt(parts[1], 10) || 0;
        const isPm = h >= 12;
        let h12 = h % 12;
        if (h12 === 0) h12 = 12;
        const snappedMin = Math.round(m / 5) * 5 % 60;
        setCustomTimeHour(h12);
        setCustomTimeMinute(snappedMin);
        setCustomTimeAmPm(isPm ? 'PM' : 'AM');
        setReminderView('customTime');
    }, [reminderTime]);

    const showSnackbar = (msg: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(msg); setSnackbarType(type); setSnackbarVisible(true);
    };

    // ─── Feed Schedule (feeder) ──────────────────────────────────────
    // Board1 (this device) is now the board that actually checks the
    // schedule and triggers the feeder's actuator (see board1.ino's
    // checkFeederSchedule()), so schedule control lives here instead of
    // on the feeder's own screen. A farm can have more than one feeder
    // (one per housing/pen is normal), so this fetches every "anifeed"
    // device on the farm and, if there's more than one, asks which to
    // configure before opening the schedule editor.
    const [feederDevices, setFeederDevices] = useState<{ id: string; name: string; animalType: string }[]>([]);
    const [feederPickerVisible, setFeederPickerVisible] = useState(false);
    const [feedScheduleDeviceId, setFeedScheduleDeviceId] = useState<string | null>(null);
    const [feedScheduleAnimalType, setFeedScheduleAnimalType] = useState<string>('pig');
    const [feedScheduleModalVisible, setFeedScheduleModalVisible] = useState(false);

    const openFeedSchedule = async () => {
        if (!farmId) return;
        const { data } = await supabase
            .from('devices')
            .select('id, name, housings(animal_type)')
            .eq('farm_id', farmId)
            .eq('type', 'anifeed');
        const devices = (data ?? []).map((d: any) => ({
            id: d.id as string,
            name: d.name as string,
            animalType: d.housings?.animal_type ?? 'pig',
        }));
        setFeederDevices(devices);
        if (devices.length === 0) {
            showSnackbar('No feeder (AniFeed) device found on this farm — add one first.', 'error');
            return;
        }
        if (devices.length === 1) {
            setFeedScheduleDeviceId(devices[0].id);
            setFeedScheduleAnimalType(devices[0].animalType);
            setFeedScheduleModalVisible(true);
            return;
        }
        setFeederPickerVisible(true);
    };

    // ─── Stats-only refresh (used by realtime callback) ──────────
    const fetchStats = useCallback(async () => {
        if (!deviceId) return;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        let query = supabase
            .from('weigh_sessions')
            .select('status')
            .eq('device_id', deviceId)
            .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
            .gte('recorded_at', todayStart.toISOString());

        if (selectedBatchId) {
            query = query.eq('batch_id', selectedBatchId);
        } else {
            query = query.is('batch_id', null);
        }

        const { data } = await query;
        if (data) {
            const rows = data as any[];
            const total = rows.length;
            const under  = rows.filter(r => r.status === 'underweight').length;
            const normal = rows.filter(r => r.status === 'normal').length;
            const over   = rows.filter(r => r.status === 'overweight').length;
            const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
            setSegregationStats({ total, underweight: { count: under, percentage: pct(under) }, normal: { count: normal, percentage: pct(normal) }, overweight: { count: over, percentage: pct(over) } });
        }
    }, [deviceId, selectedBatchId]);

    // ─── Fetch ───────────────────────────────────────────────────
    const fetchAll = useCallback(async (silent = false) => {
        if (!deviceId || !farmId) { if (!silent) setIsLoading(false); return; }
        if (!silent) setIsLoading(true);
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            let todayStatsQuery = supabase
                .from('weigh_sessions')
                .select('status')
                .eq('device_id', deviceId)
                .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
                .gte('recorded_at', todayStart.toISOString());

            if (selectedBatchId) {
                todayStatsQuery = todayStatsQuery.eq('batch_id', selectedBatchId);
            } else {
                todayStatsQuery = todayStatsQuery.is('batch_id', null);
            }

            const [deviceResult, housingsResult, todayStatsResult] = await Promise.all([
                supabase
                    .from('devices')
                    .select('id, name, unique_code, status, last_seen, weighing_active, housing_id, housings(name, animal_type)')
                    .eq('id', deviceId)
                    .single(),
                supabase
                    .from('housings')
                    .select('id, name, animal_type, farm_id')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active'),
                todayStatsQuery,
            ]);

            let fetchedInfo: DeviceInfo | null = null;
            if (deviceResult.data) {
                const d = deviceResult.data as any;
                if (d.unique_code) setDeviceUniqueCode(d.unique_code);
                const info: DeviceInfo = {
                    name: d.name,
                    status: d.status,
                    lastSeen: d.last_seen ?? null,
                    weighingActive: !!d.weighing_active,
                    housingId: d.housing_id ?? null,
                    housingName: d.housings?.name ?? 'Unassigned',
                    animalType: d.housings?.animal_type === 'pig' ? 'Pig' : 'Chicken',
                };

                const tempType = await AsyncStorage.getItem(`temp_animal_type_${deviceId}`);
                if (tempType === 'Pig' || tempType === 'Piglet' || tempType === 'Chicken' || tempType === 'Chicks' || tempType === 'Chicks (with caution: must be in crate)') {
                    info.animalType = (tempType.includes('Chicks') ? 'Chicks' : tempType) as any;
                }

                // Load chicks per tray configuration if available
                const savedTrayCount = await AsyncStorage.getItem(`chicks_per_tray_${deviceId}`);
                if (savedTrayCount) {
                    const count = parseInt(savedTrayCount, 10);
                    if (!isNaN(count) && count > 0) {
                        setChicksPerTray(count);
                        chicksPerTrayRef.current = count;
                    }
                }

                fetchedInfo = info;
                setDeviceInfo(info);
                deviceInfoRef.current = info;   // keep ref in sync
                setIsConnected(getDeviceDisplayStatus(info.status, info.lastSeen) === 'online');

                // Fetch batches for this housing if assigned
                let currentBatchList: any[] = [];
                if (info.housingId) {
                    const { data: batchesData } = await supabase
                        .from('batches')
                        .select('id, name, current_count, arrival_date, age_at_arrival_days')
                        .eq('housing_id', info.housingId)
                        .eq('status', 'active')
                        .order('created_at', { ascending: false });
                    
                    if (batchesData) {
                        currentBatchList = batchesData as any[];
                        setHousingBatches(currentBatchList);
                        setSelectedBatchId(prev => {
                            const stillExists = currentBatchList.some(b => b.id === prev);
                            return stillExists ? prev : (currentBatchList[0]?.id ?? null);
                        });
                    } else {
                        setHousingBatches([]);
                        setSelectedBatchId(null);
                    }
                } else {
                    setHousingBatches([]);
                    setSelectedBatchId(null);
                }

                // Determine active batch to resolve rearing week from harvest/arrival date
                const activeBatch = currentBatchList.find(b => b.id === selectedBatchId) || currentBatchList[0] || null;
                let resolvedWeek = 1;
                if (activeBatch?.arrival_date) {
                    const arr = new Date(activeBatch.arrival_date);
                    const now = new Date();
                    arr.setHours(0, 0, 0, 0);
                    now.setHours(0, 0, 0, 0);
                    const diffDays = Math.floor((now.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
                    const ageDays = Math.max(0, diffDays) + (activeBatch.age_at_arrival_days || 0);
                    resolvedWeek = Math.max(1, Math.ceil(ageDays / 7));
                }
                setActiveRearingWeek(resolvedWeek);

                // Automatically resolve standards from Target Weight Standards
                const effectiveAnimal: StandardAnimalType = (info.animalType === 'Pig' || info.animalType === 'Piglet') ? 'pig' : 'chicken';
                const farmStds = await fetchTargetWeights(farmId, effectiveAnimal);
                const weekStd = getStandardForWeek(effectiveAnimal, resolvedWeek, farmStds);
                setActiveWeekStandard(weekStd);

                const finalUnder = Math.round(weekStd.underweight_max_grams);
                const finalOver = Math.round(weekStd.overweight_min_grams);

                // Automatically update weight_thresholds in Supabase and sync to device
                try {
                    const threshPayload = {
                        device_id: deviceId,
                        farm_id: farmId || null,
                        animal_type: info.animalType.toLowerCase(),
                        underweight_max_grams: finalUnder,
                        normal_min_grams: finalUnder + 1,
                        normal_max_grams: finalOver - 1,
                        overweight_min_grams: finalOver,
                        updated_at: new Date().toISOString(),
                    };

                    const { data: existingThresh } = await supabase
                        .from('weight_thresholds')
                        .select('id')
                        .eq('device_id', deviceId)
                        .eq('animal_type', info.animalType.toLowerCase())
                        .maybeSingle();

                    let thresholdId: string | null = null;
                    if (existingThresh?.id) {
                        thresholdId = existingThresh.id;
                        await supabase.from('weight_thresholds').update(threshPayload).eq('id', thresholdId);
                    } else {
                        const { data: newThresh } = await supabase.from('weight_thresholds').insert(threshPayload).select('id').single();
                        thresholdId = (newThresh as any)?.id ?? null;
                    }

                    const threshObj: WeightThreshold = {
                        id: thresholdId,
                        underweightMaxGrams: finalUnder,
                        normalMinGrams: finalUnder + 1,
                        normalMaxGrams: finalOver - 1,
                        overweightMinGrams: finalOver,
                    };
                    setThreshold(threshObj);
                    thresholdRef.current = threshObj;

                    if (d.unique_code) {
                        syncThresholdToDevice(d.unique_code, finalUnder / 1000, finalOver / 1000).catch(console.warn);
                    }
                } catch (threshErr) {
                    console.warn('[AniWeigh] Auto-updating threshold error:', threshErr);
                    const fallbackThresh: WeightThreshold = {
                        id: null,
                        underweightMaxGrams: finalUnder,
                        normalMinGrams: finalUnder + 1,
                        normalMaxGrams: finalOver - 1,
                        overweightMinGrams: finalOver,
                    };
                    setThreshold(fallbackThresh);
                    thresholdRef.current = fallbackThresh;
                }

                // Fetch recent sessions for this device and selected batch
                let logsQuery = supabase
                    .from('weigh_sessions')
                    .select('id, net_weight_grams, animal_count, avg_weight_grams, status, animal_type, weigh_mode, animal_label, recorded_at')
                    .eq('device_id', deviceId)
                    .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
                    .order('recorded_at', { ascending: false })
                    .limit(5);

                if (selectedBatchId) {
                    logsQuery = logsQuery.eq('batch_id', selectedBatchId);
                } else {
                    logsQuery = logsQuery.is('batch_id', null);
                }

                const { data: logsData } = await logsQuery;

                if (logsData && logsData.length > 0) {
                    setWeightLogs((logsData as any[]).map(s => {
                        const isBatch = s.weigh_mode === 'batch' || (s.animal_count && s.animal_count > 1);
                        const perChickWeight = isBatch && s.animal_count > 0 
                            ? (s.avg_weight_grams ? Number(s.avg_weight_grams) : Math.round(s.net_weight_grams / s.animal_count))
                            : s.net_weight_grams;
                        return {
                            id: s.id,
                            weight_g: perChickWeight,
                            gross_weight_g: s.net_weight_grams,
                            chick_count: s.animal_count ?? 1,
                            weigh_mode: s.weigh_mode,
                            animal_label: s.animal_label,
                            status: s.status,
                            timestamp: new Date(s.recorded_at).getTime(),
                            animal: isBatch ? `Chicks (${s.animal_label || 'Tray'})` : (s.animal_type === 'pig' ? 'Pig' : 'Chicken'),
                            housingId: info.housingId,
                            housingName: info.housingName,
                            deviceId: deviceId,
                            deviceName: info.name,
                        };
                    }));
                } else {
                    setWeightLogs([]);
                }
            }

            if (housingsResult.data) setFarmHousings(housingsResult.data as any);

            if (todayStatsResult.data && todayStatsResult.data.length > 0) {
                const rows = todayStatsResult.data;
                const total = rows.length;
                const under  = rows.filter((r: any) => r.status === 'underweight').length;
                const normal = rows.filter((r: any) => r.status === 'normal').length;
                const over   = rows.filter((r: any) => r.status === 'overweight').length;
                const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
                setSegregationStats({ total, underweight: { count: under, percentage: pct(under) }, normal: { count: normal, percentage: pct(normal) }, overweight: { count: over, percentage: pct(over) } });
            } else {
                setSegregationStats({
                    total: 0,
                    underweight: { count: 0, percentage: 0 },
                    normal: { count: 0, percentage: 0 },
                    overweight: { count: 0, percentage: 0 },
                });
            }
        } catch (err) {
            console.error('[AniWeighScreen] fetch error:', err);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [deviceId, farmId, selectedBatchId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ─── Active weighing session (the gate) ───────────────────────
    const fetchActiveSession = useCallback(async () => {
        if (!deviceId) { setIsSessionLoading(false); return; }
        setIsSessionLoading(true);
        try {
            const { data, error } = await supabase
                .from('weighing_sessions')
                .select('id, batch_id, housing_id, animal_type, weigh_mode, expected_quantity, completed_quantity, farm_day')
                .eq('device_id', deviceId)
                .eq('status', 'in_progress')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;

            if (data) {
                // If completed_quantity >= expected_quantity and completed_quantity > 0, this session is finished — mark completed!
                if (data.expected_quantity > 0 && data.completed_quantity >= data.expected_quantity && data.completed_quantity > 0) {
                    console.log('[AniWeighScreen] Auto-completing finished session:', data.id);
                    await supabase.from('weighing_sessions')
                        .update({ status: 'completed', completed_at: new Date().toISOString() })
                        .eq('id', data.id);
                    setActiveSession(null);
                    activeSessionRef.current = null;
                } else {
                    const session = data as ActiveSession;
                    setActiveSession(session);
                    activeSessionRef.current = session;
                    setGateHousingId(session.housing_id);
                    setGateBatchId(session.batch_id);
                    setSelectedBatchId(prev => prev ?? session.batch_id);
                    const sessionType = session.animal_type === 'pig' ? 'pig' : session.animal_type === 'piglet' ? 'piglet' : session.animal_type === 'chicks' || session.weigh_mode === 'batch' ? 'chicks' : 'chicken';
                    setGateAnimalType(sessionType as any);
                }
            } else {
                setActiveSession(null);
                activeSessionRef.current = null;
            }
        } catch (err) {
            console.error('[AniWeighScreen] fetchActiveSession error:', err);
        } finally {
            setIsSessionLoading(false);
        }
    }, [deviceId]);

    useEffect(() => { fetchActiveSession(); }, [fetchActiveSession]);

    // Batches for whichever house is picked in the gate — independent of
    // the device's own persisted housing_id, since house/batch/animal type
    // are freshly picked every run rather than reused.
    useEffect(() => {
        if (!gateHousingId) { setGateBatches([]); setGateBatchId(null); return; }
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('batches')
                .select('id, name, current_count, arrival_date, age_at_arrival_days')
                .eq('housing_id', gateHousingId)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (!cancelled) {
                setGateBatches((data as any[]) ?? []);
                setGateBatchId(null);
            }
        })();
        return () => { cancelled = true; };
    }, [gateHousingId]);

    // ─── Weighing Reminders Loader ─────────────────────────────────
    const loadReminderConfig = useCallback(async () => {
        if (!deviceId) return;
        try {
            const cfg = await getWeighingReminder(deviceId);
            if (cfg) {
                setReminderConfig({ ...cfg, enabled: true });
                setReminderEnabled(true);
                setReminderMode(cfg.mode || 'interval');
                setReminderInterval(cfg.intervalDays || 7);
                setReminderDaysOfWeek(cfg.daysOfWeek || [1, 4]);
                setReminderMilestoneDays(cfg.milestoneDays || [7, 14, 21, 28, 35, 42]);
                setReminderInactivityDays(cfg.inactivityDays || 5);
                setReminderTime(cfg.reminderTime || '08:00');
                setReminderHousingId(cfg.housingId || null);
                setReminderBatchId(cfg.batchId || null);
            } else {
                setReminderEnabled(true);
                setReminderMode('interval');
                setReminderInterval(7);
                setReminderDaysOfWeek([1, 4]);
                setReminderMilestoneDays([7, 14, 21, 28, 35, 42]);
                setReminderInactivityDays(5);
                setReminderTime('08:00');
            }
        } catch (err) {
            console.error('[loadReminderConfig] error:', err);
        }
    }, [deviceId]);

    useEffect(() => {
        loadReminderConfig();
    }, [loadReminderConfig]);

    const fetchReminderBatches = useCallback(async (hId: string | null) => {
        if (!hId) {
            setReminderBatches([]);
            return;
        }
        try {
            const { data } = await supabase
                .from('batches')
                .select('id, name, status, current_count')
                .eq('housing_id', hId)
                .order('created_at', { ascending: false });
            if (data) {
                setReminderBatches(data as any[]);
            } else {
                setReminderBatches([]);
            }
        } catch (err) {
            console.error('[fetchReminderBatches] error:', err);
        }
    }, []);

    useEffect(() => {
        if (reminderHousingId) {
            fetchReminderBatches(reminderHousingId);
        } else if (deviceInfo?.housingId) {
            setReminderHousingId(deviceInfo.housingId);
            fetchReminderBatches(deviceInfo.housingId);
        }
    }, [reminderHousingId, deviceInfo?.housingId, fetchReminderBatches]);

    const handleBeginWeighingSession = async () => {
        const targetHousing = farmHousings.find(h => h.id === gateHousingId);
        const effectiveFarmId = targetHousing?.farm_id || farmId || (profile as any)?.farm_id;
        if (!gateHousingId || !gateBatchId || !effectiveFarmId) return;
        const batch = gateBatches.find(b => b.id === gateBatchId);
        if (!batch) return;
        setIsBeginningSession(true);
        try {
            const arrivalDate = new Date(batch.arrival_date);
            const today = new Date();
            arrivalDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
            const farmDay = Math.max(0, diffDays) + (batch.age_at_arrival_days || 0);

            const isChicksMode = gateAnimalType === 'chicks' || (gateAnimalType as string) === 'Chicks' || (gateAnimalType === 'chicken' && gateWeighMode === 'batch');
            const totalHeadCount = batch.current_count || 1;
            const chicksTraySize = chicksPerTrayRef.current || 20;

            // Required captures Y: for Chicks mode, ceil(totalHeadCount / chicksTraySize). For Individual mode, totalHeadCount.
            const expectedQty = isChicksMode
                ? Math.ceil(totalHeadCount / chicksTraySize)
                : totalHeadCount;

            const dbAnimalType = isChicksMode ? 'chicken' : ((gateAnimalType as string) === 'chicks' ? 'chicken' : gateAnimalType);

            const { data, error } = await supabase
                .from('weighing_sessions')
                .insert({
                    farm_id: effectiveFarmId,
                    housing_id: gateHousingId,
                    batch_id: gateBatchId,
                    device_id: deviceId,
                    animal_type: dbAnimalType,
                    weigh_mode: isChicksMode ? 'batch' : 'individual',
                    farm_day: farmDay,
                    expected_quantity: expectedQty,
                    completed_quantity: 0,
                    status: 'in_progress',
                    created_by: user?.id ?? (profile as any)?.id ?? (profile as any)?.uid ?? null,
                })
                .select('id, batch_id, housing_id, animal_type, weigh_mode, expected_quantity, completed_quantity, farm_day')
                .single();
            if (error) throw error;
            const session = data as ActiveSession;
            setActiveSession(session);
            activeSessionRef.current = session;

            // Sync housing and batch selection to state and device DB
            if (deviceId && gateHousingId) {
                await supabase.from('devices').update({ housing_id: gateHousingId }).eq('id', deviceId);
            }

            const targetHousing = farmHousings.find(h => h.id === gateHousingId);
            const selectedTypeStr = gateAnimalType === 'pig' ? 'Pig' : gateAnimalType === 'piglet' ? 'Piglet' : gateAnimalType === 'chicks' ? 'Chicks' : 'Chicken';

            setDeviceInfo(prev => prev ? {
                ...prev,
                housingId: gateHousingId,
                housingName: targetHousing?.name ?? 'Unassigned',
                animalType: selectedTypeStr as any,
            } : null);

            if (deviceInfoRef.current) {
                deviceInfoRef.current.housingId = gateHousingId;
                deviceInfoRef.current.housingName = targetHousing?.name ?? 'Unassigned';
                deviceInfoRef.current.animalType = selectedTypeStr as any;
            }

            setSelectedBatchId(gateBatchId);
            setHousingBatches(gateBatches);

            // Synchronize physical device sorting mode, weight thresholds, and tray capacity
            await updateAndSyncThresholdsAndMode(gateAnimalType, gateBatchId);

            if (deviceUniqueCode && isChicksMode) {
                const crateUrl1 = `http://anigrow-${deviceUniqueCode}.local/crate?crate_weight=0&chick_count=${chicksTraySize}`;
                const crateUrl2 = `http://192.168.4.1/crate?crate_weight=0&chick_count=${chicksTraySize}`;
                fetch(crateUrl1).catch(() => fetch(crateUrl2)).catch(console.warn);
            }

            showSnackbar(
                isConnected ? 'Weighing session started — you can begin weighing now.' : 'Weighing session started. Scale is currently offline.',
                isConnected ? 'success' : 'info'
            );
        } catch (err: any) {
            // Postgres unique-violation (23505) means a session for this
            // device is ALREADY in_progress — a race with another tap, or
            // one that survived a power cut without being cleanly finished.
            // Resume that one instead of erroring out.
            if (err?.code === '23505') {
                console.warn('[AniWeighScreen] a session was already active for this device — resuming it instead.');
                await fetchActiveSession();
                showSnackbar('A weighing session was already in progress — resuming it.', 'info');
            } else {
                console.error('[AniWeighScreen] begin session error:', err);
                showSnackbar('Could not start a weighing session.', 'error');
            }
        } finally {
            setIsBeginningSession(false);
        }
    };

    const handleFinishSession = async () => {
        if (!activeSession) return;
        if (activeSession.completed_quantity === 0) {
            showSnackbar('Cannot finish session: No animals have been weighed yet.', 'error');
            setFinishModalVisible(false);
            setIncompleteWarningVisible(false);
            return;
        }
        setIsFinishingSession(true);
        try {
            const { error } = await supabase
                .from('weighing_sessions')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', activeSession.id);
            if (error) throw error;
            const finishedId = activeSession.id;
            setActiveSession(null);
            activeSessionRef.current = null;
            setFinishModalVisible(false);
            setIncompleteWarningVisible(false);
            // Clear the gate so it re-prefills fresh (from the device's own
            // housing) for the next run instead of silently keeping this
            // run's picks around.
            setGateHousingId(null);
            setGateBatchId(null);
            setGateWeighMode('individual');
            gatePrefilledRef.current = false;
            router.push(`/(weighing)/SessionReportScreen?sessionId=${finishedId}` as any);
        } catch (err) {
            console.error('[AniWeighScreen] finish session error:', err);
            showSnackbar('Could not finish this session.', 'error');
        } finally {
            setIsFinishingSession(false);
        }
    };

    // Pre-fill the gate's House + Animal Type from this device's own
    // assigned housing — a scale physically lives in one house and rarely
    // moves, so re-picking that from scratch every run is pure friction.
    // Run ONCE on load so user-selected animal type switches are never reverted.
    useEffect(() => {
        if (activeSession || gatePrefilledRef.current) return;
        if (!deviceInfo?.housingId || farmHousings.length === 0) return;
        const housing = farmHousings.find(h => h.id === deviceInfo.housingId);
        if (!housing) return;
        gatePrefilledRef.current = true;
        setGateHousingId(housing.id);
        setGateAnimalType(housing.animal_type === 'chicken' ? 'chicken' : 'pig');
    }, [activeSession, deviceInfo?.housingId, farmHousings]);

    // Re-derive isConnected from the last known heartbeat every 15s, purely
    // from the passage of time — catches a device going stale/dark even
    // when nothing new has arrived to trigger a re-fetch.
    useEffect(() => {
        const interval = setInterval(() => {
            const info = deviceInfoRef.current;
            if (!info) return;
            setIsConnected(getDeviceDisplayStatus(info.status, info.lastSeen) === 'online');
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    // Fetches the most recent (non-invalid) reading for Live Scaling. Pulled
    // out so both the mount effect below AND pull-to-refresh can call it —
    // previously only ran once on mount, so marking a stale/ghost row
    // 'invalid' directly in the database wouldn't be reflected here until
    // the screen was unmounted and remounted (e.g. navigating away and
    // back), even though the underlying query already excluded it.
    const fetchLiveSeed = useCallback(async () => {
        if (!deviceId) return;
        let seedQuery = supabase
            .from('weigh_sessions')
            .select('net_weight_grams, status')
            .eq('device_id', deviceId)
            .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
            .order('recorded_at', { ascending: false })
            .limit(1);

        if (selectedBatchId) {
            seedQuery = seedQuery.eq('batch_id', selectedBatchId);
        } else {
            seedQuery = seedQuery.is('batch_id', null);
        }

        const { data } = await seedQuery.maybeSingle();
        if (data) {
            setLiveWeightG((data as any).net_weight_grams);
            setLiveStatus((data as any).status);
        } else if (gateAnimalType === 'chicks' || deviceInfoRef.current?.animalType === 'Chicks') {
            setLiveWeightG(48);
            setLiveStatus('normal');
        } else {
            setLiveWeightG(null);
            setLiveStatus(null);
        }
    }, [deviceId, selectedBatchId]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchAll(), fetchLiveSeed(), fetchActiveSession()]);
        setRefreshing(false);
    }, [fetchAll, fetchLiveSeed, fetchActiveSession]);

    // ─── Live "is it running" — watches devices.weighing_active ─────
    // Pushed by board1.ino immediately on Start/Stop/Reset (not just the
    // periodic heartbeat), so this reflects state within a second or two.
    useEffect(() => {
        if (!deviceId) return;
        const channel = supabase
            .channel(`device-running-${deviceId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId}` },
                (payload) => {
                    const active = !!(payload.new as any)?.weighing_active;
                    setDeviceInfo(prev => {
                        if (!prev) return prev;
                        const updated = { ...prev, weighingActive: active };
                        deviceInfoRef.current = updated;
                        return updated;
                    });

                    // Real sample-by-sample progress, pushed by board1.ino's
                    // postSampleProgress() on the same row this channel
                    // already watches — see SampleProgress state above.
                    const progress = (payload.new as any)?.sample_progress;
                    if (progress) applySampleProgress(progress);
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [deviceId]);

    // ─── Realtime subscription — mirrors the IoT data stream ────────
    useEffect(() => {
        if (!deviceId) return;

        fetchLiveSeed();

        const channel = supabase
            .channel(`aniweigh-live-${deviceId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'weigh_sessions', filter: `device_id=eq.${deviceId}` },
                (payload) => {
                    console.log('[AniWeigh Realtime] INSERT received:', payload.new);
                    const row = payload.new as any;

                    // Filter: only handle events that match the selected batch.
                    // Use loose equality so null===null works correctly, and so
                    // a freshly-inserted row with a batch is not silently dropped
                    // when selectedBatchId hasn't resolved yet from the seed query.
                    const rowBatch = row.batch_id ?? null;
                    const uiBatch  = selectedBatchId ?? null;
                    if (rowBatch !== uiBatch && uiBatch !== null) return;

                    const info = deviceInfoRef.current;
                    const session = activeSessionRef.current;

                    const isChicks = session
                        ? (session.animal_type === 'chicks' || session.weigh_mode === 'batch')
                        : (info?.animalType === 'Chicks');

                    const expectedQty = session?.expected_quantity ?? 1;
                    const completedSoFar = session?.completed_quantity ?? 0;
                    const captureIndex = completedSoFar + 1;

                    // If session is already completed or reached max required captures, ignore extra capture
                    if (session && completedSoFar >= expectedQty) {
                        console.log('[AniWeigh Realtime] Max required captures reached for session, ignoring extra capture.');
                        return;
                    }

                    let countInTray = 1;
                    if (isChicks) {
                        const targetBatch = housingBatches.find(b => b.id === (session?.batch_id || selectedBatchId)) 
                            || gateBatches.find(b => b.id === (session?.batch_id || gateBatchId));
                        const totalHeadCount = targetBatch?.current_count ?? (expectedQty * (chicksPerTrayRef.current || 20));
                        const trayCapacity = chicksPerTrayRef.current || 20;

                        if (captureIndex < expectedQty || (totalHeadCount % trayCapacity === 0)) {
                            countInTray = trayCapacity;
                        } else {
                            // Final tray capture with partial count
                            const fullTraysTotal = (expectedQty - 1) * trayCapacity;
                            countInTray = Math.max(1, totalHeadCount - fullTraysTotal);
                        }
                    }

                    const grossWeightG = row.net_weight_grams;
                    let entryWeightG = grossWeightG;
                    let entryStatus = row.status ?? 'normal';

                    if (isChicks && countInTray >= 1) {
                        // 1. Calculate per-chick average weight (e.g. 3111g / 20 chicks = 155.55g)
                        entryWeightG = Math.round(grossWeightG / countInTray);

                        // 2. Evaluate ONLY the per-chick average against weight thresholds
                        const curThresh = thresholdRef.current;
                        if (curThresh) {
                            if (entryWeightG <= curThresh.underweightMaxGrams) entryStatus = 'underweight';
                            else if (entryWeightG >= curThresh.overweightMinGrams) entryStatus = 'overweight';
                            else entryStatus = 'normal';
                        }
                    }

                    // 1. Update live-scale display immediately
                    setLiveWeightG(entryWeightG);
                    setLiveStatus(entryStatus);
                    setLiveFlash(true);
                    setTimeout(() => setLiveFlash(false), 600);

                    if (sampleProgressStaleTimeoutRef.current) clearTimeout(sampleProgressStaleTimeoutRef.current);
                    setSampleProgress(null);

                    // 2. Prepend ONE folded Tray entry into logs
                    const baseTs = row.recorded_at ? new Date(row.recorded_at).getTime() : Date.now();
                    const isPartialTag = isChicks && captureIndex === expectedQty && countInTray < (chicksPerTrayRef.current || 20);
                    const tag = isChicks
                        ? `Tray ${captureIndex}/${expectedQty}${isPartialTag ? ` (${countInTray} chicks - Partial)` : ''}`
                        : `${row.animal_type === 'pig' ? 'Pig' : 'Animal'} ${captureIndex}`;

                    const newEntry: WeighLogEntry = {
                        id: row.id,
                        weight_g: entryWeightG,
                        gross_weight_g: grossWeightG,
                        chick_count: countInTray,
                        weigh_mode: isChicks ? 'batch' : 'individual',
                        animal_label: tag,
                        status: entryStatus,
                        timestamp: baseTs,
                        animal: isChicks ? `Chicks (${tag})` : (row.animal_type === 'pig' ? 'Pig' : 'Chicken'),
                        housingId: info?.housingId ?? null,
                        housingName: info?.housingName ?? 'Unassigned',
                        deviceId: row.device_id,
                        deviceName: info?.name ?? 'AniWeigh',
                    };

                    setWeightLogs(prev => [newEntry, ...prev].slice(0, 50));

                    fetchStats();

                    // 3. Update active session completion counter
                    if (session && row.weighing_session_id === session.id) {
                        const newCompletedQty = completedSoFar + 1;
                        const updatedSession = { ...session, completed_quantity: newCompletedQty };
                        setActiveSession(updatedSession);
                        activeSessionRef.current = updatedSession;

                        supabase.from('weighing_sessions')
                            .update({ completed_quantity: newCompletedQty })
                            .eq('id', session.id)
                            .then(({ error }) => { if (error) console.error('[AniWeigh] Error updating completed_quantity:', error); });

                        // 4. Automatically stop scale after last required capture & complete session
                        if (expectedQty > 0 && newCompletedQty >= expectedQty && newCompletedQty > 0) {
                            showSnackbar(`Capture ${newCompletedQty}/${expectedQty} complete — session finished!`, 'success');
                            handleStopDevice();
                            supabase.from('weighing_sessions')
                                .update({ status: 'completed', completed_at: new Date().toISOString() })
                                .eq('id', session.id)
                                .then(() => {
                                    setActiveSession(null);
                                    activeSessionRef.current = null;
                                });
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log('[AniWeigh Realtime] channel status:', status);
            });

        return () => { supabase.removeChannel(channel); };
    }, [deviceId, fetchStats, selectedBatchId]);

    // ─── Derived values ──────────────────────────────────────────
    const effectiveHousingId = activeSession?.housing_id || gateHousingId || deviceInfo?.housingId || null;
    const effectiveBatchId = activeSession?.batch_id || gateBatchId || selectedBatchId || null;

    const animalType = activeSession
        ? (activeSession.animal_type === 'pig' ? 'Pig' : activeSession.animal_type === 'piglet' ? 'Piglet' : activeSession.animal_type === 'chicks' || activeSession.weigh_mode === 'batch' ? 'Chicks' : 'Chicken')
        : (gateAnimalType === 'pig' ? 'Pig' : gateAnimalType === 'piglet' ? 'Piglet' : gateAnimalType === 'chicks' ? 'Chicks' : (deviceInfo?.animalType ?? 'Chicken'));

    const housing = farmHousings.find(h => h.id === effectiveHousingId)?.name 
        || (deviceInfo?.housingName && deviceInfo?.housingName !== 'Unassigned' ? deviceInfo?.housingName : null) 
        || 'Unassigned';
    const targetHousingName = housing;

    const targetBatch = housingBatches.find(b => b.id === effectiveBatchId) 
        || gateBatches.find(b => b.id === effectiveBatchId) 
        || reminderBatches.find(b => b.id === effectiveBatchId);

    const targetBatchName = targetBatch?.name ?? (effectiveBatchId ? 'Active Batch' : 'No Batch');

    const isPigMode  = (
        animalType.toLowerCase().includes('pig') ||
        gateAnimalType === 'pig' ||
        gateAnimalType === 'piglet' ||
        activeSession?.animal_type === 'pig' ||
        activeSession?.animal_type === 'piglet'
    );
    const isChicksMode = !isPigMode && (
        gateAnimalType === 'chicks' ||
        (animalType.toLowerCase().includes('chick') && !animalType.toLowerCase().includes('chicken')) ||
        activeSession?.animal_type === 'chicks' ||
        activeSession?.weigh_mode === 'batch'
    );
    const animalColor = isPigMode ? colors.pig : colors.chicken;
    const hasHousingAndBatch = Boolean(effectiveHousingId && effectiveBatchId);

    const numUnder = threshold ? threshold.underweightMaxGrams / 1000 : 0.8;
    const numOver  = threshold ? threshold.overweightMinGrams / 1000  : 1.5;

    const todayStr = new Date().toDateString();
    const todayLogs = weightLogs.filter(l => new Date(l.timestamp).toDateString() === todayStr);
    const lastUpdatedLabel = todayLogs.length > 0
        ? `Last updated: ${formatLogTime(todayLogs[0].timestamp)}`
        : 'No data today';


    // ─── Connection toggle ────────────────────────────────────────
    const handleConnectionToggle = () => {
        if (isConnected) {
            setModalType('confirmation'); setModalTitle('Disconnect AniWeigh?');
            setModalMessage('Are you sure you want to disconnect this device? Live data will be paused.');
        } else {
            setModalType('confirmation'); setModalTitle('Connect AniWeigh?');
            setModalMessage('Please make sure your AniWeigh device is on and ready to connect.');
        }
        setModalVisible(true);
    };

    const handleModalConfirm = async () => {
        setModalVisible(false);
        if (modalTitle.includes('Disconnect')) {
            await supabase.from('devices').update({ status: 'offline' }).eq('id', deviceId);
            setIsConnected(false);
            showSnackbar('AniWeigh disconnected.');
        } else if (modalTitle.includes('Connect')) {
            await supabase.from('devices').update({ status: 'online' }).eq('id', deviceId);
            setIsConnected(true);
            showSnackbar('AniWeigh connected.');
        } else if (modalTitle.includes('Update')) {
            // Housing update confirm
            const h = farmHousings.find(h => h.name === pendingEditVal);
            if (h) {
                await supabase.from('devices').update({ housing_id: h.id }).eq('id', deviceId);
                await AsyncStorage.removeItem(`temp_animal_type_${deviceId}`);
                setDeviceInfo(prev => {
                    const updated = prev ? { ...prev, housingId: h.id, housingName: h.name, animalType: h.animal_type === 'pig' ? 'Pig' : 'Chicken' } as DeviceInfo : null;
                    deviceInfoRef.current = updated;
                    return updated;
                });
                showSnackbar('Housing updated.');
                // Re-fetch threshold for new animal type
                fetchAll();
            }
        }
    };

    // ─── Range settings (Read-Only) ────────────────────────────────
    const openRangeSettings = () => {
        setRangeSettingsVisible(true);
    };

    const syncThresholdToDevice = async (uniqueCode: string, underKg: number, overKg: number) => {
        if (!uniqueCode) return;

        // Queue cloud command via device_commands table so board syncs over cloud even if LAN is unreachable
        const underGrams = Math.round(underKg * 1000);
        const overGrams = Math.round(overKg * 1000);
        const cmdName = `threshold_${underGrams}_${overGrams}`;
        const requestedBy = user?.id ?? (profile as any)?.id ?? (profile as any)?.uid ?? null;
        supabase.from('device_commands').insert({ device_id: deviceId, command: cmdName, requested_by: requestedBy }).then(({ error }) => {
            if (error) console.warn('[ThresholdSync] Error inserting cloud threshold command:', error);
        });

        const urls = [
            `http://anigrow-${uniqueCode}.local/threshold?under=${underKg}&over=${overKg}`,
            `http://192.168.4.1/threshold?under=${underKg}&over=${overKg}`
        ];
        let success = false;
        for (const url of urls) {
            try {
                console.log(`[ThresholdSync] Sending to: ${url}`);
                const res = await Promise.race([
                    fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } }),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500))
                ]);
                if (res.ok) {
                    success = true;
                    console.log(`[ThresholdSync] Success from: ${url}`);
                    break;
                }
            } catch (e) {
                console.warn(`[ThresholdSync] Failed for ${url}:`, e);
            }
        }
        if (success) {
            showSnackbar(`Weight range synchronized with physical device.`);
        } else {
            showSnackbar(`Weight range updated on cloud. Reconnect to device hotspot or local WiFi to synchronize.`, 'info');
        }
    };

    const updateAndSyncThresholdsAndMode = useCallback(async (
        targetAnimalType: string,
        targetBatchId?: string | null
    ) => {
        if (!deviceId) return;
        try {
            const isPig = targetAnimalType.toLowerCase() === 'pig' || targetAnimalType.toLowerCase() === 'piglet';
            const effectiveAnimal: StandardAnimalType = isPig ? 'pig' : 'chicken';

            // Resolve active batch to compute week number
            let resolvedWeek = 1;
            const batchIdToUse = targetBatchId ?? selectedBatchId ?? gateBatchId;
            const batchListToUse = housingBatches.length > 0 ? housingBatches : gateBatches;
            const activeBatch = batchListToUse.find(b => b.id === batchIdToUse);

            if (activeBatch?.arrival_date) {
                const arr = new Date(activeBatch.arrival_date);
                const now = new Date();
                arr.setHours(0, 0, 0, 0);
                now.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((now.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
                const ageDays = Math.max(0, diffDays) + (activeBatch.age_at_arrival_days || 0);
                resolvedWeek = Math.max(1, Math.ceil(ageDays / 7));
            }

            const effectiveFarmId = farmId || (profile as any)?.farm_id || null;
            const farmStds = await fetchTargetWeights(effectiveFarmId, effectiveAnimal);
            const weekStd = getStandardForWeek(effectiveAnimal, resolvedWeek, farmStds);
            setActiveRearingWeek(resolvedWeek);
            setActiveWeekStandard(weekStd);

            const finalUnder = Math.round(weekStd.underweight_max_grams);
            const finalOver = Math.round(weekStd.overweight_min_grams);

            const dbAnimalKey = targetAnimalType.toLowerCase();
            const threshPayload = {
                device_id: deviceId,
                farm_id: effectiveFarmId,
                animal_type: dbAnimalKey,
                underweight_max_grams: finalUnder,
                normal_min_grams: finalUnder + 1,
                normal_max_grams: finalOver - 1,
                overweight_min_grams: finalOver,
                updated_at: new Date().toISOString(),
            };

            const { data: existingThresh } = await supabase
                .from('weight_thresholds')
                .select('id')
                .eq('device_id', deviceId)
                .eq('animal_type', dbAnimalKey)
                .maybeSingle();

            let thresholdId: string | null = null;
            if (existingThresh?.id) {
                thresholdId = existingThresh.id;
                await supabase.from('weight_thresholds').update(threshPayload).eq('id', thresholdId);
            } else {
                const { data: newThresh } = await supabase.from('weight_thresholds').insert(threshPayload).select('id').single();
                thresholdId = (newThresh as any)?.id ?? null;
            }

            const threshObj: WeightThreshold = {
                id: thresholdId,
                underweightMaxGrams: finalUnder,
                normalMinGrams: finalUnder + 1,
                normalMaxGrams: finalOver - 1,
                overweightMinGrams: finalOver,
            };
            setThreshold(threshObj);
            thresholdRef.current = threshObj;

            // Sync weight thresholds and animal mode to physical device (via LAN + Cloud commands)
            const codeToSync = deviceUniqueCode || (deviceInfo as any)?.unique_code;
            if (codeToSync) {
                syncThresholdToDevice(codeToSync, finalUnder / 1000, finalOver / 1000).catch(console.warn);

                let targetModeCode = 'PIG';
                if (dbAnimalKey === 'piglet') targetModeCode = 'PIGLET';
                else if (dbAnimalKey === 'pig') targetModeCode = 'PIG';
                else if (dbAnimalKey === 'chicks' || dbAnimalKey === 'chick') targetModeCode = 'CHICK';
                else if (dbAnimalKey === 'chicken') targetModeCode = 'CHICKEN';

                syncModeToDevice(codeToSync, targetModeCode).catch(console.warn);
            }
        } catch (err) {
            console.warn('[AniWeigh] updateAndSyncThresholdsAndMode error:', err);
        }
    }, [deviceId, farmId, profile, selectedBatchId, gateBatchId, housingBatches, gateBatches, deviceUniqueCode, deviceInfo]);

    useFocusEffect(
        useCallback(() => {
            if (deviceId) {
                const targetAnimal = deviceInfoRef.current?.animalType || 'pig';
                updateAndSyncThresholdsAndMode(targetAnimal, selectedBatchId);
            }
        }, [deviceId, selectedBatchId, updateAndSyncThresholdsAndMode])
    );

    const syncModeToDevice = async (uniqueCode: string, mode: string) => {
        if (!uniqueCode || !deviceId) return;

        // Clear any previous unexecuted mode commands for this device to prevent command spam/backlog
        try {
            await supabase
                .from('device_commands')
                .update({ executed: true, executed_at: new Date().toISOString() })
                .eq('device_id', deviceId)
                .is('executed_at', null)
                .like('command', 'mode_%');
        } catch (clearErr) {
            console.warn('[ModeSync] Could not clear old mode commands:', clearErr);
        }

        // Queue cloud command via device_commands table so board syncs over cloud even if LAN is unreachable
        const cmdName = `mode_${mode.toLowerCase()}`;
        const requestedBy = (profile as any)?.uid ?? (profile as any)?.id ?? null;
        supabase.from('device_commands').insert({ device_id: deviceId, command: cmdName, requested_by: requestedBy }).then(({ error }) => {
            if (error) console.warn('[ModeSync] Error inserting cloud mode command:', error);
        });

        const urls = [
            `http://anigrow-${uniqueCode}.local/mode?mode=${mode}`,
            `http://192.168.4.1/mode?mode=${mode}`
        ];
        let success = false;
        for (const url of urls) {
            try {
                console.log(`[ModeSync] Sending to: ${url}`);
                const res = await Promise.race([
                    fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } }),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500))
                ]);
                if (res.ok) {
                    success = true;
                    console.log(`[ModeSync] Success from: ${url}`);
                    break;
                }
            } catch (e) {
                console.warn(`[ModeSync] Failed for ${url}:`, e);
            }
        }
        if (success) {
            showSnackbar(`Scale sorting mode synchronized to: ${mode}`);
        } else {
            showSnackbar(`Scale mode updated on cloud (${mode}). Synchronizing with physical scale...`, 'info');
        }
    };

    // Tare is relayed through Supabase (device_commands) rather than a direct
    // LAN call — the board polls for it every ~5s (see checkPendingCommands()
    // in board1.ino), so this works regardless of which network the phone is
    // on, unlike threshold/mode sync below which still need the same LAN.
    const [isTaring, setIsTaring] = useState(false);
    // Shared relay for every remote device command (tare/start/stop/reset) —
    // inserts a device_commands row, waits for the board to mark it done via
    // Realtime, and reports success/pending. Works regardless of which
    // network the phone and the board are each on.
    const sendDeviceCommand = async (
        command: 'tare' | 'start' | 'stop' | 'reset',
        successMessage: string,
        pendingMessage: string,
        timeoutMs = 30000,
    ): Promise<boolean> => {
        const requestedBy = user?.id ?? (profile as any)?.id ?? (profile as any)?.uid ?? null;
        const { data, error } = await supabase
            .from('device_commands')
            .insert({ device_id: deviceId, command, requested_by: requestedBy })
            .select('id')
            .single();
        if (error) throw error;
        const commandId = (data as any).id;

        const confirmed = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
                supabase.removeChannel(channel);
                resolve(false);
            }, timeoutMs);
            const channel = supabase
                .channel(`device-cmd-${commandId}`)
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'device_commands', filter: `id=eq.${commandId}` },
                    (payload) => {
                        if ((payload.new as any)?.status === 'done') {
                            clearTimeout(timeout);
                            supabase.removeChannel(channel);
                            resolve(true);
                        }
                    }
                )
                .subscribe();
        });

        showSnackbar(confirmed ? successMessage : pendingMessage, confirmed ? 'success' : 'info');
        return confirmed;
    };

    const handleTareDevice = async () => {
        if (!isConnected) {
            setOfflineModalVisible(true);
            return;
        }
        setIsTaring(true);
        try {
            await sendDeviceCommand(
                'tare',
                'Scale tared successfully.',
                "Tare requested — the device hasn't confirmed yet. It'll apply as soon as it's reachable."
            );
            // Tare zeroes scale reading only. Counter and weigh logs remain unchanged.
        } catch (err) {
            console.error('[Tare] error:', err);
            showSnackbar('Failed to request tare.', 'error');
        } finally {
            setIsTaring(false);
        }
    };

    // ─── Start / Stop / Reset ──────────────────────────────────────────
    const [isStarting, setIsStarting] = useState(false);
    const handleStartDevice = async () => {
        if (!isConnected) {
            setOfflineModalVisible(true);
            return;
        }
        setIsStarting(true);
        try {
            if (!activeSession && deviceInfo?.housingId && selectedBatchId) {
                const currentBatch = housingBatches.find(b => b.id === selectedBatchId) || housingBatches[0];
                const totalCount = currentBatch?.current_count || 1;
                const trayCapacity = chicksPerTrayRef.current || 20;
                const expectedQty = isChicksMode ? Math.ceil(totalCount / trayCapacity) : totalCount;

                let farmDay = 1;
                if (currentBatch?.arrival_date) {
                    const arr = new Date(currentBatch.arrival_date);
                    const now = new Date();
                    arr.setHours(0, 0, 0, 0);
                    now.setHours(0, 0, 0, 0);
                    farmDay = Math.max(0, Math.floor((now.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24))) + (currentBatch.age_at_arrival_days || 0);
                }

                const { data: newSessionData } = await supabase
                    .from('weighing_sessions')
                    .insert({
                        device_id: deviceId,
                        farm_id: farmId,
                        housing_id: deviceInfo.housingId,
                        batch_id: selectedBatchId,
                        animal_type: isChicksMode ? 'chicks' : (animalType.toLowerCase() === 'piglet' ? 'piglet' : (isPigMode ? 'pig' : 'chicken')),
                        weigh_mode: isChicksMode ? 'batch' : 'individual',
                        expected_quantity: expectedQty,
                        completed_quantity: 0,
                        farm_day: farmDay,
                        status: 'in_progress',
                    })
                    .select()
                    .single();

                if (newSessionData) {
                    setActiveSession(newSessionData as ActiveSession);
                    activeSessionRef.current = newSessionData as ActiveSession;
                }
            }
            // Ensure target animal weight thresholds & mode are synced to board before starting
            const targetAnimalStr = deviceInfo?.animalType || animalType || 'pig';
            await updateAndSyncThresholdsAndMode(targetAnimalStr, selectedBatchId);

            const currentComp = activeSession?.completed_quantity ?? 0;
            const expected = activeSession?.expected_quantity ?? 0;
            const resumeMsg = currentComp > 0 && currentComp < expected
                ? `Resuming session from capture ${currentComp + 1} of ${expected}.`
                : `Start confirmed (${animalType}) — device is taring and getting ready.`;

            await sendDeviceCommand(
                'start',
                resumeMsg,
                "Start requested — the device hasn't confirmed yet. It'll begin as soon as it's reachable."
            );
        } catch (err) {
            console.error('[Start] error:', err);
            showSnackbar('Failed to start device.', 'error');
        } finally {
            setIsStarting(false);
        }
    };

    const [isStopping, setIsStopping] = useState(false);
    const handleStopDevice = async () => {
        setIsStopping(true);
        try {
            const currentComp = activeSession?.completed_quantity ?? 0;
            const expected = activeSession?.expected_quantity ?? 0;
            const stopMsg = activeSession
                ? `Session paused at capture ${currentComp} of ${expected}. Tap Start to resume.`
                : 'Stopped.';

            await sendDeviceCommand(
                'stop',
                stopMsg,
                "Stop requested — the device hasn't confirmed yet. It'll pause as soon as it's reachable."
            );
        } catch (err) {
            console.error('[Stop] error:', err);
            showSnackbar('Failed to stop device.', 'error');
        } finally {
            setIsStopping(false);
        }
    };

    const [isResetting, setIsResetting] = useState(false);
    const handleResetDevice = async () => {
        setIsResetting(true);
        try {
            await sendDeviceCommand(
                'reset',
                'Reset confirmed — clearing session progress back to 0.',
                "Reset requested — the device will reset when reachable.",
                15000
            );

            if (activeSession) {
                // Clear session progress counter in DB back to 0
                await supabase.from('weighing_sessions')
                    .update({ completed_quantity: 0 })
                    .eq('id', activeSession.id);

                // Reset local session progress counter while preserving all weigh log entries
                const updatedSession = { ...activeSession, completed_quantity: 0 };
                setActiveSession(updatedSession);
                activeSessionRef.current = updatedSession;
                setLiveWeightG(null);
                setLiveStatus(null);
            }
            showSnackbar('Session progress counter reset back to 0. All logs preserved!', 'info');
        } catch (err) {
            console.error('[Reset] error:', err);
            showSnackbar('Failed to reset device.', 'error');
        } finally {
            setIsResetting(false);
        }
    };

    // Confirmation modal shared by Stop and Reset (both interrupt whatever
    // the device is doing — worth a confirm tap, unlike Start/Tare).
    const [controlModalVisible, setControlModalVisible] = useState(false);
    const [controlAction, setControlAction] = useState<'stop' | 'reset' | null>(null);
    const [incompleteWarningVisible, setIncompleteWarningVisible] = useState(false);

    const handleFinishSessionTrigger = () => {
        if (!activeSession) return;
        if (activeSession.completed_quantity === 0) {
            showSnackbar('Weigh at least 1 capture before finishing this session.', 'error');
            return;
        }
        if (activeSession.completed_quantity < activeSession.expected_quantity) {
            setIncompleteWarningVisible(true);
        } else {
            setFinishModalVisible(true);
        }
    };

    const openControlConfirm = (action: 'stop' | 'reset') => {
        setControlAction(action);
        setControlModalVisible(true);
    };

    const confirmControlAction = () => {
        setControlModalVisible(false);
        if (controlAction === 'stop') handleStopDevice();
        else if (controlAction === 'reset') handleResetDevice();
        setControlAction(null);
    };

    // ─── Edit modal (Housing / Animal Type / Batch) ─────────────────────
    const openEditModal = (target: 'Animal Type' | 'Housing' | 'Batch') => {
        setEditTarget(target);
        setEditModalVisible(true);
    };

    const getEditOptions = (): string[] => {
        if (editTarget === 'Animal Type') {
            return ['Pig', 'Piglet', 'Chicken', 'Chicks'];
        }
        if (editTarget === 'Housing') {
            const searchType = (animalType.toLowerCase().includes('pig')) ? 'pig' : 'chicken';
            return farmHousings
                .filter(h => h.animal_type === searchType)
                .map(h => h.name);
        }
        if (editTarget === 'Batch') {
            return housingBatches.map(b => b.name);
        }
        return [];
    };

    const handleEditConfirm = async (val: string) => {
        setEditModalVisible(false);
        try {
            if (editTarget === 'Animal Type') {
                let selectedType = 'Chicken';
                if (val.toLowerCase().includes('chick') && !val.toLowerCase().includes('chicken')) selectedType = 'Chicks';
                else if (val.toLowerCase() === 'piglet' || val.toLowerCase() === 'piglets') selectedType = 'Piglet';
                else if (val.toLowerCase() === 'pig' || val.toLowerCase() === 'pigs') selectedType = 'Pig';
                else selectedType = 'Chicken';
                
                await AsyncStorage.setItem(`temp_animal_type_${deviceId}`, selectedType);

                // Unassign housing and clear batch in DB so it won't interfere across animal categories
                if (deviceId) {
                    await supabase.from('devices').update({ housing_id: null }).eq('id', deviceId);
                }

                // Clean up any stale active session so category change gets a fresh gate
                if (activeSessionRef.current) {
                    const st = activeSessionRef.current;
                    if (st.completed_quantity > 0) {
                        await supabase.from('weighing_sessions')
                            .update({ status: 'completed', completed_at: new Date().toISOString() })
                            .eq('id', st.id);
                    } else {
                        await supabase.from('weighing_sessions')
                            .delete()
                            .eq('id', st.id);
                    }
                    setActiveSession(null);
                    activeSessionRef.current = null;
                }

                setDeviceInfo(prev => {
                    const updated = prev ? {
                        ...prev,
                        animalType: selectedType as any,
                        housingId: null,
                        housingName: 'Unassigned',
                    } as DeviceInfo : null;
                    deviceInfoRef.current = updated;
                    return updated;
                });

                setHousingBatches([]);
                setSelectedBatchId(null);
                setGateHousingId(null);
                setGateBatchId(null);
                setGateBatches([]);

                const newGateType = selectedType === 'Chicks' ? 'chicks' : (selectedType === 'Piglet' ? 'piglet' : (selectedType === 'Pig' ? 'pig' : 'chicken'));
                setGateAnimalType(newGateType as any);
                setGateWeighMode(selectedType === 'Chicks' ? 'batch' : 'individual');



                showSnackbar(`Category set to ${val}. Housing and batch unassigned.`);

                // Map category selection to Board sequences
                let modeCode = "PIGLET";
                if (selectedType === 'Piglet') modeCode = "PIGLET";
                else if (selectedType === 'Chicken') modeCode = "CHICKEN";
                else if (selectedType === 'Chicks') modeCode = "CHICK";

                await syncModeToDevice(deviceUniqueCode, modeCode);
            } else if (editTarget === 'Housing') {
                const selectedHousing = farmHousings.find(h => h.name === val);
                if (selectedHousing) {
                    if (deviceId) {
                        await supabase.from('devices').update({ housing_id: selectedHousing.id }).eq('id', deviceId);
                    }
                    setDeviceInfo(prev => {
                        const updated = prev ? {
                            ...prev,
                            housingId: selectedHousing.id,
                            housingName: selectedHousing.name,
                        } as DeviceInfo : null;
                        deviceInfoRef.current = updated;
                        return updated;
                    });

                    // Fetch and set batches for newly selected housing
                    const { data: batchesData } = await supabase
                        .from('batches')
                        .select('id, name, current_count, arrival_date, age_at_arrival_days')
                        .eq('housing_id', selectedHousing.id)
                        .eq('status', 'active')
                        .order('created_at', { ascending: false });

                    if (batchesData && batchesData.length > 0) {
                        const bList = batchesData as any[];
                        setHousingBatches(bList);
                        setSelectedBatchId(bList[0].id);
                    } else {
                        setHousingBatches([]);
                        setSelectedBatchId(null);
                    }

                    showSnackbar(`Housing updated to "${val}".`);
                }
            } else if (editTarget === 'Batch') {
                const selected = housingBatches.find(b => b.name === val);
                if (selected) {
                    setSelectedBatchId(selected.id);
                    showSnackbar(`Active batch set to "${selected.name}".`);
                }
            }
        } catch (err) {
            showSnackbar(`Failed to update ${editTarget}.`, 'error');
        }
    };

    // ─── Target Housing & Batch Resolved Helpers ───────────────────
    const isBatchActive = (targetBatch as any)?.status ? (targetBatch as any).status.toLowerCase() === 'active' : true;

    // ─── Weighing Reminders Handler ────────────────────────────────
    const handleSaveReminder = async () => {
        setIsSavingReminder(true);
        try {
            // Support saving even if device is offline or during testing
            const effectiveDeviceId = deviceId || 'dev_aniweigh_standalone';
            const effectiveFarmId = farmId || (profile as any)?.farm_id || 'farm_local';

            const hId = effectiveHousingId;
            const hName = targetHousingName;
            const bId = effectiveBatchId;
            const bName = targetBatchName;

            if (bId && !isBatchActive) {
                showSnackbar('Note: Assigned batch is not active. Reminders only notify for active batches.', 'info');
            }

            const config: WeighingReminderConfig = {
                deviceId: effectiveDeviceId,
                farmId: effectiveFarmId,
                housingId: hId,
                housingName: hName,
                batchId: bId,
                batchName: bName,
                enabled: true,
                mode: reminderMode,
                intervalDays: reminderInterval,
                daysOfWeek: reminderDaysOfWeek,
                milestoneDays: reminderMilestoneDays,
                inactivityDays: reminderInactivityDays,
                reminderTime: reminderTime,
            };

            // Realistic saving feedback animation
            await new Promise(r => setTimeout(r, 350));
            await saveWeighingReminder(config);
            setReminderConfig(config);
            setReminderEnabled(true);
            setReminderModalVisible(false);

            showSnackbar('Weighing reminder schedule saved & active!', 'success');
        } catch (err) {
            console.error('[handleSaveReminder] error:', err);
            showSnackbar('Failed to save reminder schedule.', 'error');
        } finally {
            setIsSavingReminder(false);
        }
    };

    // ─── Log helpers ─────────────────────────────────────────────
    const getLogIcon = (status: string) => {
        switch (status) {
            case 'underweight': return { icon: 'warning' as const,      color: colors.warning };
            case 'overweight':  return { icon: 'error' as const,        color: colors.error };
            default:            return { icon: 'check-circle' as const, color: colors.primary };
        }
    };

    const getLogMessage = (log: WeighLogEntry) => {
        const kg = (log.weight_g / 1000).toFixed(2);
        const animal = log.animal;
        switch (log.status) {
            case 'underweight': return `Underweight ${animal} detected at ${kg} kg.`;
            case 'overweight':  return `Overweight ${animal} detected at ${kg} kg.`;
            default:            return `${animal} weighed at ${kg} kg — Normal.`;
        }
    };

    const renderWeighingReminderCard = () => {
        const isEnabled = !!reminderConfig?.enabled;
        if (!isEnabled) return null;

        const daysMap: { [key: number]: string } = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        
        let scheduleSummary = '';
        if (reminderConfig) {
            if (reminderConfig.mode === 'interval') {
                scheduleSummary = `Every ${reminderConfig.intervalDays || 7}d at ${reminderConfig.reminderTime || '08:00'}`;
            } else if (reminderConfig.mode === 'weekly') {
                const days = (reminderConfig.daysOfWeek || []).map(d => daysMap[d]).join(', ');
                scheduleSummary = `${days || 'Weekly'} at ${reminderConfig.reminderTime || '08:00'}`;
            } else if (reminderConfig.mode === 'milestones') {
                scheduleSummary = `Milestones at ${reminderConfig.reminderTime || '08:00'}`;
            } else if (reminderConfig.mode === 'inactivity') {
                scheduleSummary = `After ${reminderConfig.inactivityDays || 5}d inactive`;
            }
        }

        return (
            <TouchableOpacity
                onPress={() => setReminderModalVisible(true)}
                activeOpacity={0.7}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.primary + '35',
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    marginBottom: 12,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                    <View style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        backgroundColor: colors.primary + '18',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <MaterialIcons
                            name="notifications-active"
                            size={15}
                            color={colors.primary}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}>Reminder</Text>
                            <View style={{
                                width: 5,
                                height: 5,
                                borderRadius: 2.5,
                                backgroundColor: colors.primary,
                            }} />
                            <Text style={[textStyles.body, { color: colors.primary, fontSize: 11, fontWeight: '600' }]}>
                                Active
                            </Text>
                        </View>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>
                            {scheduleSummary}
                        </Text>
                    </View>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                    backgroundColor: colors.primary + '15',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                }}>
                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 11 }]}>
                        Edit
                    </Text>
                    <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
                </View>
            </TouchableOpacity>
        );
    };

    const renderFeedScheduleButton = () => (
        <TouchableOpacity
            onPress={openFeedSchedule}
            activeOpacity={0.7}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.stroke,
                paddingVertical: 9,
                paddingHorizontal: 12,
                marginBottom: 12,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                <View style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: colors.secondary + '18',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <MaterialIcons name="edit-calendar" size={15} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}>Feed Schedule</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>
                        Configure the feeder's dispense times
                    </Text>
                </View>
            </View>

            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                backgroundColor: colors.secondary + '15',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
            }}>
                <Text style={[textStyles.label, { color: colors.secondary, fontSize: 11 }]}>
                    Edit
                </Text>
                <MaterialIcons name="chevron-right" size={14} color={colors.secondary} />
            </View>
        </TouchableOpacity>
    );

    const MAX_CHICKS_PER_TRAY = 100;

    const handleSaveChicksPerTray = async (val: number) => {
        if (val < 1) {
            showSnackbar('Number of chicks must be at least 1.', 'error');
            return;
        }
        if (val > MAX_CHICKS_PER_TRAY) {
            showSnackbar(`Maximum capacity is ${MAX_CHICKS_PER_TRAY} chicks per tray.`, 'error');
            return;
        }
        setChicksPerTray(val);
        chicksPerTrayRef.current = val;
        if (deviceId) {
            await AsyncStorage.setItem(`chicks_per_tray_${deviceId}`, val.toString());
        }
        if (activeSession && (activeSession.animal_type === 'chicks' || isChicksMode)) {
            const currentBatch = housingBatches.find(b => b.id === (activeSession.batch_id || selectedBatchId)) || housingBatches[0];
            if (currentBatch?.current_count) {
                const newExpected = Math.ceil(currentBatch.current_count / val);
                setActiveSession(prev => prev ? { ...prev, expected_quantity: newExpected } : null);
                activeSessionRef.current = activeSessionRef.current ? { ...activeSessionRef.current, expected_quantity: newExpected } : null;
                await supabase.from('weighing_sessions').update({ expected_quantity: newExpected }).eq('id', activeSession.id);
            }
        }
        setChicksPerTrayModalVisible(false);
        showSnackbar(`Chicks per tray set to ${val}.`);
    };

    const renderChicksPerTrayButton = () => {
        if (!isChicksMode) return null;
        const currentBatch = housingBatches.find(b => b.id === selectedBatchId) || housingBatches[0];
        const totalCount = currentBatch?.current_count ?? 0;
        const totalTrays = totalCount > 0 ? Math.ceil(totalCount / chicksPerTray) : null;

        return (
            <TouchableOpacity
                onPress={() => {
                    setTempChicksPerTray(chicksPerTray.toString());
                    setChicksPerTrayModalVisible(true);
                }}
                activeOpacity={0.7}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    marginBottom: 12,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                    <View style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        backgroundColor: colors.primary + '18',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <MaterialIcons name="inventory-2" size={15} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}>Chicks per Tray</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>
                            {totalTrays
                                ? `${chicksPerTray} chicks/tray · ${totalTrays} tray weighs (${totalCount} total)`
                                : `${chicksPerTray} chicks per tray`}
                        </Text>
                    </View>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                    backgroundColor: colors.primary + '15',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                }}>
                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                        {chicksPerTray} pcs
                    </Text>
                    <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[aniweighStyles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            {/* Header */}
            <View style={aniweighStyles.header}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={aniweighStyles.headerActions}>
                    <TouchableOpacity
                        disabled={isLoading}
                        style={[
                            aniweighStyles.actionButton,
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
                                setModalTitle('Disconnect AniWeigh?');
                                setModalMessage(`This will take "${deviceInfo?.name}" offline. You can reconnect it anytime by tapping the cloud icon.`);
                                setModalVisible(true);
                            } else {
                                // Offline — go to provisioning
                                router.push(
                                    `/(devices)/AddDeviceScreen?existingDeviceId=${deviceId}&existingDeviceName=${encodeURIComponent(deviceInfo?.name ?? '')}&existingDeviceType=AniWeigh&existingDeviceCode=${encodeURIComponent(deviceUniqueCode)}` as any
                                );
                            }
                        }}
                    >
                        <MaterialIcons name={isConnected ? 'cloud-done' : 'cloud-off'} size={20} color={isConnected ? colors.primary : colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            aniweighStyles.actionButton,
                            {
                                backgroundColor: reminderConfig?.enabled ? colors.primary + '1A' : colors.surface,
                                borderWidth: 1.5,
                                borderColor: reminderConfig?.enabled ? colors.primary + '40' : colors.stroke,
                            }
                        ]}
                        onPress={() => setReminderModalVisible(true)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons
                            name={reminderConfig?.enabled ? 'notifications-active' : 'notifications-off'}
                            size={20}
                            color={reminderConfig?.enabled ? colors.primary : colors.textGrey}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[aniweighStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.stroke }]}
                        onPress={() => router.push(`/(devices)/RecentLogsScreen?deviceId=${deviceId}&animalType=${animalType}` as any)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="history" size={20} color={colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[aniweighStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.stroke }]}
                        onPress={() => router.push(`/(devices)/DeviceSettingsScreen?type=AniWeigh&deviceId=${deviceId}` as any)}
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
            ) : !activeSession ? (
                <WeighingSetupGate
                    gateAnimalType={gateAnimalType}
                    setGateAnimalType={setGateAnimalType}
                    gateWeighMode={gateWeighMode}
                    setGateWeighMode={setGateWeighMode}
                    gateHousingId={gateHousingId}
                    setGateHousingId={setGateHousingId}
                    gateBatchId={gateBatchId}
                    setGateBatchId={setGateBatchId}
                    gateBatches={gateBatches}
                    setGateBatches={setGateBatches}
                    farmHousings={farmHousings}
                    chicksPerTray={chicksPerTray}
                    isBeginningSession={isBeginningSession}
                    onBeginWeighingSession={handleBeginWeighingSession}
                    gateHousingModalVisible={gateHousingModalVisible}
                    setGateHousingModalVisible={setGateHousingModalVisible}
                    gateBatchModalVisible={gateBatchModalVisible}
                    setGateBatchModalVisible={setGateBatchModalVisible}
                    renderFeedScheduleButton={renderFeedScheduleButton}
                    renderChicksPerTrayButton={renderChicksPerTrayButton}
                    renderWeighingReminderCard={renderWeighingReminderCard}
                    onAnimalTypeChange={(type: any) => {
                        let selectedType = 'Chicken';
                        if (type === 'chicks') selectedType = 'Chicks';
                        else if (type === 'piglet') selectedType = 'Piglet';
                        else if (type === 'pig') selectedType = 'Pig';
                        else selectedType = 'Chicken';

                        setGateAnimalType(type);
                        AsyncStorage.setItem(`temp_animal_type_${deviceId}`, selectedType);

                        if (animalTypeDebounceTimerRef.current) {
                            clearTimeout(animalTypeDebounceTimerRef.current);
                        }
                        animalTypeDebounceTimerRef.current = setTimeout(() => {
                            updateAndSyncThresholdsAndMode(type, gateBatchId);
                        }, 350);
                    }}
                />
            ) : (
                <ScrollView contentContainerStyle={aniweighStyles.contentContainer} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                    {/* Title Section */}
                    <View style={aniweighStyles.titleSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.smartScale + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                                <AniWeighIcon size={12} />
                                <Text style={[textStyles.label, { color: colors.smartScale, fontSize: 10, marginLeft: 4 }]}>AniWeigh</Text>
                            </View>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 13 }]}>{getFormattedDate()}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28, flex: 1, marginRight: 10 }]} numberOfLines={1} adjustsFontSizeToFit>{deviceInfo?.name ?? 'AniWeigh'}</Text>
                            <View style={[aniweighStyles.connectionBadge, { backgroundColor: isConnected ? colors.primary + '1A' : colors.error + '1A', flexShrink: 0 }]}>
                                <View style={[aniweighStyles.connectionDot, { backgroundColor: isConnected ? colors.primary : colors.error }]} />
                                <Text style={[textStyles.label, { color: isConnected ? colors.primary : colors.error, fontSize: 12, marginLeft: 6 }]}>
                                    {isConnected ? 'Online' : 'Offline'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                            <View style={[aniweighStyles.tagsContainer, { marginTop: 0 }]}>
                                <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: animalColor + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Animal Type')}>
                                    <AnimalIcon type={animalType} size={14} color={animalColor} />
                                    <Text style={[textStyles.label, { color: animalColor, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{animalType}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={animalColor} />
                                </TouchableOpacity>
                                <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: colors.info + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Housing')}>
                                    <MaterialIcons name="home" size={14} color={colors.info} />
                                    <Text style={[textStyles.label, { color: colors.info, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{housing}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={colors.info} />
                                </TouchableOpacity>
                                {effectiveHousingId && (
                                    <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: colors.warning + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Batch')}>
                                        <MaterialIcons name="layers" size={14} color={colors.warning} />
                                        <Text style={[textStyles.label, { color: colors.warning, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>
                                            {targetBatchName}
                                        </Text>
                                        <MaterialIcons name="arrow-drop-down" size={16} color={colors.warning} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Feed Schedule + Weighing Reminder */}
                    {renderFeedScheduleButton()}
                    {renderChicksPerTrayButton()}
                    {renderWeighingReminderCard()}

                    {/* Live Scaling */}
                    <View style={aniweighStyles.liveSection}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 18 }]}>Live Scaling</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                    Range: &lt;{numUnder}kg · &gt;{numOver}kg
                                </Text>
                                <TouchableOpacity onPress={openRangeSettings} style={{ padding: 4 }}>
                                    <MaterialIcons name="tune" size={24} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={[aniweighStyles.liveCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                            <View style={aniweighStyles.liveScaleCircle}>
                                <View style={[aniweighStyles.liveScaleInnerCircle, {
                                    borderColor: sampleProgress
                                        ? colors.primary
                                        : liveWeightG != null
                                        ? (liveStatus === 'underweight' ? colors.warning : liveStatus === 'overweight' ? colors.error : colors.primary)
                                        : colors.stroke,
                                    backgroundColor: liveFlash ? (colors.primary + '15') : 'transparent',
                                }]}>
                                    {sampleProgress?.stage === 'sampling' ? (
                                        <>
                                            <Text style={[textStyles.h3, { color: colors.primary, fontSize: 15 }]}>
                                                Sample {sampleProgress.sampleIndex ?? 0}/{sampleProgress.total ?? 5}
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                                                {[0, 1, 2, 3, 4].map(i => (
                                                    <View key={i} style={{
                                                        width: 8, height: 8, borderRadius: 4,
                                                        backgroundColor: i < (sampleProgress.sampleIndex ?? 0) ? colors.primary : colors.stroke,
                                                    }} />
                                                ))}
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 6 }]}>
                                                {isPigMode ? `${((sampleProgress.sampleValue ?? 0) / 1000).toFixed(2)} kg` : `${Math.round(sampleProgress.sampleValue ?? 0)} g`}
                                            </Text>
                                        </>
                                    ) : sampleProgress?.stage === 'averaging' ? (
                                        <>
                                            <ActivityIndicator size="small" color={colors.primary} />
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 12, marginTop: 8, textAlign: 'center' }]}>
                                                {isPigMode ? 'Averaging...' : 'Averaging tray...'}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                                                ~{isPigMode ? `${((sampleProgress.average ?? 0) / 1000).toFixed(2)} kg` : `${Math.round(sampleProgress.average ?? 0)} g`}
                                            </Text>
                                        </>
                                    ) : sampleProgress?.stage === 'done' ? (
                                        <>
                                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28 }]}>
                                                {isPigMode ? ((sampleProgress.average ?? 0) / 1000).toFixed(2) : Math.round(sampleProgress.perChick ?? sampleProgress.average ?? 0)}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{isPigMode ? 'kg' : 'g / chick'}</Text>
                                            <MaterialIcons name="sensors" size={14} color={colors.primary} style={{ marginTop: 4 }} />
                                        </>
                                    ) : liveWeightG != null ? (
                                        <>
                                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28 }]}>
                                                {isPigMode ? (liveWeightG / 1000).toFixed(2) : Math.round(liveWeightG)}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{isPigMode ? 'kg' : (gateAnimalType === 'chicks' || activeSession?.weigh_mode === 'batch' ? 'g / chick' : 'g')}</Text>
                                            <MaterialIcons name="sensors" size={14} color={colors.primary} style={{ marginTop: 4 }} />
                                        </>
                                    ) : (
                                        <>
                                            <MaterialIcons name="sensors-off" size={36} color={colors.textGrey} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 8, textAlign: 'center' }]}>
                                                Live data{'\n'}pending
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </View>
                            <View style={aniweighStyles.liveStatsContainer}>
                                <View style={aniweighStyles.liveStatItem}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 2 }]}>Detected</Text>
                                    <Text
                                        style={[textStyles.h2, { color: colors.text, fontSize: 16, textAlign: 'center' }]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.65}
                                    >
                                        {gateAnimalType === 'piglet' || animalType === 'Piglet'
                                            ? 'Piglet'
                                            : isPigMode
                                            ? 'Pig'
                                            : isChicksMode
                                            ? 'Chicks (Tray)'
                                            : 'Chicken'}
                                    </Text>
                                </View>
                                <View style={aniweighStyles.liveStatDivider} />
                                <View style={aniweighStyles.liveStatItem}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 2 }]}>Status</Text>
                                    <Text
                                        style={[textStyles.h2, {
                                            color: liveStatus === 'underweight' ? colors.warning
                                                 : liveStatus === 'overweight'  ? colors.error
                                                 : liveStatus === 'normal'      ? colors.primary
                                                 : colors.textGrey,
                                            fontSize: 16,
                                            textAlign: 'center',
                                        }]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.65}
                                    >
                                        {liveStatus ? (liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1)) : '—'}
                                    </Text>
                                </View>
                            </View>
                            {/* Connection & Weighing status indicator */}
                            {(() => {
                                const isRunning = !!deviceInfo?.weighingActive;
                                let badgeBg = colors.cardFill;
                                let badgeBorder = colors.stroke;
                                let dotColor = colors.textGrey;
                                let textColor = colors.textGrey;
                                let labelText = 'Idle — tap Start to begin';

                                if (!isConnected) {
                                    badgeBg = colors.error + '12';
                                    badgeBorder = colors.error + '35';
                                    dotColor = colors.error;
                                    textColor = colors.error;
                                    labelText = 'Offline — scale disconnected';
                                } else if (isRunning) {
                                    badgeBg = colors.primary + '15';
                                    badgeBorder = colors.primary + '40';
                                    dotColor = colors.primary;
                                    textColor = colors.primary;
                                    labelText = 'Running — weighing animals';
                                } else {
                                    const currentComp = activeSession?.completed_quantity ?? 0;
                                    badgeBg = colors.cardFill;
                                    badgeBorder = colors.stroke;
                                    dotColor = colors.textGrey;
                                    textColor = colors.textGrey;
                                    labelText = currentComp > 0 
                                        ? 'Paused — tap Start to resume' 
                                        : 'Idle — tap Start to begin';
                                }

                                return (
                                    <View style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        marginTop: 20, alignSelf: 'center',
                                        backgroundColor: badgeBg,
                                        borderWidth: 1, borderColor: badgeBorder,
                                        borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                                    }}>
                                        <View style={{
                                            width: 7, height: 7, borderRadius: 3.5,
                                            backgroundColor: dotColor,
                                        }} />
                                        <Text style={[textStyles.label, {
                                            fontSize: 12, fontWeight: '700',
                                            color: textColor,
                                        }]}>
                                            {labelText}
                                        </Text>
                                    </View>
                                );
                            })()}

                            {/* This run's progress — bumped automatically as each physical
                                reading comes in tagged to the active weighing session. */}
                            {(() => {
                                const currentBatchForTrays = housingBatches.find(b => b.id === (activeSession?.batch_id || selectedBatchId)) || housingBatches[0];
                                const totalBatchChicks = currentBatchForTrays?.current_count ?? 0;
                                const effectiveExpectedTrays = totalBatchChicks > 0
                                    ? Math.ceil(totalBatchChicks / (chicksPerTray || 20))
                                    : (activeSession?.expected_quantity && activeSession.expected_quantity > 0 ? activeSession.expected_quantity : 1);
                                const effectiveExpectedAnimals = activeSession?.expected_quantity && activeSession.expected_quantity > 0
                                    ? activeSession.expected_quantity
                                    : (totalBatchChicks > 0 ? totalBatchChicks : 0);

                                return (
                                    <>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                                            <MaterialIcons
                                                name={activeSession ? "checklist" : "flag"}
                                                size={15}
                                                color={activeSession ? colors.primary : colors.textGrey}
                                            />
                                            <Text style={[textStyles.body, { color: activeSession ? colors.text : colors.textGrey, fontSize: 13, fontWeight: '700' }]}>
                                                {activeSession ? (
                                                    isChicksMode
                                                        ? `Tray Capture ${activeSession.completed_quantity} of ${effectiveExpectedTrays}`
                                                        : `Capture ${activeSession.completed_quantity} of ${effectiveExpectedAnimals}`
                                                ) : (
                                                    isChicksMode
                                                        ? (totalBatchChicks > 0 ? `Batch Target: ${effectiveExpectedTrays} Trays (${totalBatchChicks} chicks)` : `Target: ${effectiveExpectedTrays} Trays`)
                                                        : (effectiveExpectedAnimals > 0 ? `Batch Target: ${effectiveExpectedAnimals} animals` : `Select a batch to start run`)
                                                )}
                                            </Text>
                                        </View>

                                        {/* Chicks Tray Breakdown & Distribution Card */}
                                        {isChicksMode && (
                                            <View style={{
                                                marginTop: 10, width: '100%', backgroundColor: colors.primary + '10',
                                                borderColor: colors.primary + '35', borderWidth: 1, borderRadius: 12, padding: 12,
                                            }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Text style={[textStyles.label, { color: colors.primary, fontWeight: '700', fontSize: 13 }]}>
                                                        Chicks Tray Breakdown
                                                    </Text>
                                                    <Text style={[textStyles.body, { color: colors.primary, fontWeight: '700', fontSize: 12 }]}>
                                                        {activeSession ? `${activeSession.completed_quantity} / ${effectiveExpectedTrays} Trays` : `${effectiveExpectedTrays} Trays`}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.primary + '20' }}>
                                                    <View>
                                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>Total Batch Size</Text>
                                                        <Text style={[textStyles.body, { color: colors.text, fontWeight: '700', fontSize: 13 }]}>
                                                            {totalBatchChicks > 0 ? `${totalBatchChicks} chicks` : `${effectiveExpectedTrays * chicksPerTray} chicks`}
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'center' }}>
                                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>Tray Capacity</Text>
                                                        <Text style={[textStyles.body, { color: colors.text, fontWeight: '700', fontSize: 13 }]}>
                                                            {chicksPerTray} / tray
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>Unit</Text>
                                                        <Text style={[textStyles.body, { color: colors.primary, fontWeight: '700', fontSize: 13 }]}>
                                                            Grams (g)
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </>
                                );
                            })()}

                            {/* Device Controls — Start/Stop the whole IoT remotely, plus Tare and
                                a hardware-safe Reset. All relayed through Supabase, so they work
                                regardless of which network the phone is on. */}
                            <View style={{ marginTop: 12, width: '100%', gap: 10 }}>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: colors.primary,
                                            borderRadius: 9999, paddingVertical: 12,
                                            opacity: (isStarting || !hasHousingAndBatch) ? 0.45 : 1,
                                        }}
                                        activeOpacity={hasHousingAndBatch ? 0.8 : 1}
                                        onPress={handleStartDevice}
                                        disabled={isStarting || !hasHousingAndBatch}
                                    >
                                        {isStarting ? (
                                            <ActivityIndicator size="small" color={colors.onPrimary} />
                                        ) : (
                                            <>
                                                <MaterialIcons name="play-arrow" size={18} color={colors.onPrimary} style={{ marginRight: 6 }} />
                                                <Text style={[textStyles.label, { color: colors.onPrimary, fontSize: 14, fontWeight: '700' }]}>Start</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: colors.textGrey + '15',
                                            borderWidth: 1.5, borderColor: colors.stroke,
                                            borderRadius: 9999, paddingVertical: 12,
                                            opacity: (isStopping || !hasHousingAndBatch) ? 0.45 : 1,
                                        }}
                                        activeOpacity={hasHousingAndBatch ? 0.75 : 1}
                                        onPress={() => openControlConfirm('stop')}
                                        disabled={isStopping || !hasHousingAndBatch}
                                    >
                                        {isStopping ? (
                                            <ActivityIndicator size="small" color={colors.textGrey} />
                                        ) : (
                                            <>
                                                <MaterialIcons name="stop" size={18} color={colors.textGrey} style={{ marginRight: 6 }} />
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 14, fontWeight: '700' }]}>Stop</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: colors.primary + '10',
                                            borderWidth: 1.5, borderColor: colors.primary + '30',
                                            borderRadius: 9999, paddingVertical: 12,
                                            opacity: (isTaring || !hasHousingAndBatch) ? 0.45 : 1,
                                        }}
                                        activeOpacity={hasHousingAndBatch ? 0.75 : 1}
                                        onPress={handleTareDevice}
                                        disabled={isTaring || !hasHousingAndBatch}
                                    >
                                        {isTaring ? (
                                            <ActivityIndicator size="small" color={colors.primary} />
                                        ) : (
                                            <>
                                                <MaterialIcons name="restart-alt" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 14, fontWeight: '700' }]}>Tare Scale</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: colors.error + '10',
                                            borderWidth: 1.5, borderColor: colors.error + '30',
                                            borderRadius: 9999, paddingVertical: 12,
                                            opacity: (isResetting || !hasHousingAndBatch) ? 0.45 : 1,
                                        }}
                                        activeOpacity={hasHousingAndBatch ? 0.75 : 1}
                                        onPress={() => openControlConfirm('reset')}
                                        disabled={isResetting || !hasHousingAndBatch}
                                    >
                                        {isResetting ? (
                                            <ActivityIndicator size="small" color={colors.error} />
                                        ) : (
                                            <>
                                                <MaterialIcons name="power-settings-new" size={18} color={colors.error} style={{ marginRight: 6 }} />
                                                <Text style={[textStyles.label, { color: colors.error, fontSize: 14, fontWeight: '700' }]}>Reset</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                                {!hasHousingAndBatch && (
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        marginTop: 2,
                                        paddingVertical: 7,
                                        paddingHorizontal: 12,
                                        backgroundColor: colors.warning + '14',
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: colors.warning + '30',
                                    }}>
                                        <MaterialIcons name="info-outline" size={15} color={colors.warning} />
                                        <Text style={[textStyles.body, { color: colors.warning, fontSize: 11.5, fontWeight: '600', textAlign: 'center', flex: 1 }]}>
                                            {!deviceInfo?.housingId ? 'Select a Housing & Batch above to enable scale controls.' : 'Select an active Batch above to enable scale controls.'}
                                        </Text>
                                    </View>
                                )}
                                {activeSession && (
                                    <TouchableOpacity
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: colors.surface,
                                            borderWidth: 1.5, borderColor: colors.stroke,
                                            borderRadius: 9999, paddingVertical: 12,
                                            opacity: activeSession.completed_quantity === 0 ? 0.5 : 1,
                                        }}
                                        activeOpacity={activeSession.completed_quantity === 0 ? 1 : 0.75}
                                        onPress={handleFinishSessionTrigger}
                                        disabled={isFinishingSession}
                                    >
                                        {isFinishingSession ? (
                                            <ActivityIndicator size="small" color={colors.text} />
                                        ) : (
                                            <>
                                                <MaterialIcons name="fact-check" size={18} color={colors.text} style={{ marginRight: 6 }} />
                                                <Text style={[textStyles.label, { color: colors.text, fontSize: 14, fontWeight: '700' }]}>
                                                    {activeSession.completed_quantity === 0 ? 'Weigh at least 1 to finish' : 'Finish Weighing Session'}
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Active Batches in House */}
                    {deviceInfo?.housingId && (
                        <View style={{ marginBottom: 24 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 12 }]}>Active Batches in House</Text>
                            
                            {housingBatches.length === 0 ? (
                                <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 18, alignItems: 'center' }}>
                                    <MaterialIcons name="layers-clear" size={32} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, fontSize: 13, textAlign: 'center' }]}>
                                        No active batches found in this housing.
                                    </Text>
                                </View>
                            ) : (
                                housingBatches.map((batch, idx) => {
                                    const ageLabel = calculateBatchAge(batch.arrival_date, batch.age_at_arrival_days, animalType as any);
                                    return (
                                        <View
                                            key={batch.id ?? idx}
                                            style={{
                                                backgroundColor: colors.surface,
                                                borderRadius: 16,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                padding: 16,
                                                marginBottom: 10,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                                                <View style={{
                                                    width: 40,
                                                    height: 40,
                                                    borderRadius: 10,
                                                    backgroundColor: colors.primary + '1A',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    marginRight: 12,
                                                }}>
                                                    <MaterialIcons name="layers" size={20} color={colors.primary} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>
                                                        {batch.name}
                                                    </Text>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                                        Age: {ageLabel}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                                                    {batch.current_count}
                                                </Text>
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>
                                                    heads
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    )}

                    {/* AI Weight Analysis */}
                    <AIInsightCard
                        title="AI Weight Analysis"
                        category="weigh_device"
                        farmId={farmId}
                        subKey={deviceId ? `${deviceId}_${selectedBatchId || activeSession?.batch_id || 'general'}_${animalType.toLowerCase()}` : ''}
                        context={{
                            type: 'weight',
                            animalType: animalType,
                            housingName: housing,
                            data: {
                                deviceId,
                                batchId: selectedBatchId || activeSession?.batch_id || null,
                                todayTotal: segregationStats.total,
                                underweight: segregationStats.underweight,
                                normal: segregationStats.normal,
                                overweight: segregationStats.overweight,
                                recentWeights: weightLogs.slice(0, 5).map(l => ({
                                    kg: (l.weight_g / 1000).toFixed(2),
                                    status: l.status,
                                    time: new Date(l.timestamp).toISOString(),
                                })),
                                thresholds: threshold
                                    ? { underweightMaxKg: threshold.underweightMaxGrams / 1000, overweightMinKg: threshold.overweightMinGrams / 1000 }
                                    : null,
                            },
                        }}
                    />

                    {/* Segregation Stats */}
                    <View style={[aniweighStyles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke, marginTop: 4 }]}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={aniweighStyles.statsHeader}
                            onPress={() => setStatsExpanded(!statsExpanded)}
                        >
                            <View>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>Segregation Stats</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{lastUpdatedLabel}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[textStyles.h2, { color: colors.text, marginRight: 12 }]}>
                                    {segregationStats.total}{' '}
                                    <Text style={{ fontSize: 14, color: colors.textGrey }}>Today</Text>
                                </Text>
                                <MaterialIcons name={statsExpanded ? 'expand-less' : 'expand-more'} size={24} color={colors.textGrey} />
                            </View>
                        </TouchableOpacity>

                        {statsExpanded && (
                            <View style={[aniweighStyles.statsExpandedContent, { borderTopColor: colors.stroke }]}>
                                <View style={aniweighStyles.statsVisualBar}>
                                    <View style={[aniweighStyles.statsVisualSegment, { flex: segregationStats.underweight.percentage || 1, backgroundColor: colors.warning, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
                                    <View style={[aniweighStyles.statsVisualSegment, { flex: segregationStats.normal.percentage || 1, backgroundColor: colors.primary }]} />
                                    <View style={[aniweighStyles.statsVisualSegment, { flex: segregationStats.overweight.percentage || 1, backgroundColor: colors.error, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
                                </View>
                                <View style={aniweighStyles.statDetailRow}>
                                    {[
                                        { label: 'Underweight', color: colors.warning, ...segregationStats.underweight },
                                        { label: 'Normal',      color: colors.primary, ...segregationStats.normal },
                                        { label: 'Overweight',  color: colors.error,   ...segregationStats.overweight },
                                    ].map(s => (
                                        <View key={s.label} style={aniweighStyles.statLegend}>
                                            <View style={[aniweighStyles.legendDot, { backgroundColor: s.color }]} />
                                            <View>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{s.label}</Text>
                                                <Text style={[textStyles.label, { color: colors.text }]}>{s.count} ({s.percentage}%)</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[aniweighStyles.recordsLink, { borderTopColor: colors.stroke }]}
                            activeOpacity={0.7}
                            onPress={() => router.push(`/(devices)/SegregationRecordsScreen?deviceId=${deviceId}` as any)}
                        >
                            <Text style={[textStyles.label, { color: colors.primary }]}>View All Segregation Records</Text>
                            <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    {/* Recent Logs */}
                    <View style={aniweighStyles.logsSection}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 12 }]}>Recent Logs</Text>

                        {weightLogs.length === 0 ? (
                            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                <MaterialIcons name="history" size={32} color={colors.textGrey} />
                                <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>No weigh events recorded yet.</Text>
                            </View>
                        ) : (
                            weightLogs.slice(0, 5).map((log, index) => {
                                const statusColor = log.status === 'underweight' ? colors.warning : log.status === 'overweight' ? colors.error : colors.primary;
                                const statusIcon: any = log.status === 'underweight' ? 'arrow-downward' : log.status === 'overweight' ? 'arrow-upward' : 'check';
                                const isPig = isPigMode || log.animal.toLowerCase().includes('pig');
                                const isTray = !isPig && (
                                    log.weigh_mode === 'batch' ||
                                    (log.chick_count != null && log.chick_count > 1) ||
                                    log.animal.toLowerCase().includes('tray') ||
                                    (log.animal.toLowerCase().includes('chick') && !log.animal.toLowerCase().includes('chicken')) ||
                                    isChicksMode
                                );
                                const isExpanded = expandedLogId === (log.id ?? String(index));
                                const displayVal = isPig 
                                    ? `${(log.weight_g / 1000).toFixed(2)}` 
                                    : `${Math.round(log.weight_g)}`;
                                const displayUnit = isPig ? 'kg' : (isTray ? 'g / chick' : 'g');
                                const grossWeight = log.gross_weight_g ?? (log.weight_g * (log.chick_count || 1));

                                return (
                                    <TouchableOpacity
                                        key={log.id ?? index}
                                        activeOpacity={0.85}
                                        onPress={() => isTray && setExpandedLogId(isExpanded ? null : (log.id ?? String(index)))}
                                        style={{
                                            backgroundColor: colors.surface,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: isExpanded ? colors.primary : colors.stroke,
                                            marginBottom: 10,
                                            overflow: 'hidden',
                                            flexDirection: 'column',
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row' }}>
                                            {/* Left accent strip */}
                                            <View style={{ width: 4, backgroundColor: statusColor }} />

                                            {/* Card content */}
                                            <View style={{ flex: 1, padding: 12 }}>
                                                {/* Top row: housing label + weight */}
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                    <View style={{ flex: 1, marginRight: 12 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                                            <MaterialIcons name="home" size={13} color={colors.textGrey} />
                                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginLeft: 3 }]} numberOfLines={1}>{log.housingName}</Text>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: statusColor + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                                            <MaterialIcons name={statusIcon} size={11} color={statusColor} />
                                                            <Text style={[textStyles.label, { color: statusColor, fontSize: 11, marginLeft: 3, fontWeight: '700' }]}>
                                                                {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                                                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 22, lineHeight: 26 }]}>{displayVal}</Text>
                                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>{displayUnit}</Text>
                                                        </View>
                                                        {isTray && (
                                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, marginTop: 2 }]}>
                                                                Gross: {grossWeight.toLocaleString()}g
                                                            </Text>
                                                        )}
                                                    </View>
                                                </View>

                                                {/* Bottom chips */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, minWidth: 0 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, maxWidth: 150 }}>
                                                            <AnimalIcon type={log.animal} size={11} color={colors.textGrey} />
                                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]} numberOfLines={1} ellipsizeMode="tail">{log.animal}</Text>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, flexShrink: 0 }}>
                                                            <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{formatLogTime(log.timestamp)}</Text>
                                                        </View>
                                                    </View>

                                                    {isTray && (
                                                        <View style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 2,
                                                            backgroundColor: colors.primary + '14',
                                                            paddingHorizontal: 8,
                                                            paddingVertical: 3.5,
                                                            borderRadius: 6,
                                                            flexShrink: 0,
                                                        }}>
                                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 10.5, fontWeight: '600' }]} numberOfLines={1}>
                                                                {isExpanded ? 'Hide details' : 'Tap tray details'}
                                                            </Text>
                                                            <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={15} color={colors.primary} />
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        </View>

                                        {/* Folded Tray Breakdown Drawer */}
                                        {isTray && isExpanded && (
                                            <View style={{
                                                backgroundColor: colors.primary + '0D',
                                                borderTopWidth: 1,
                                                borderTopColor: colors.primary + '25',
                                                padding: 12,
                                            }}>
                                                <Text style={[textStyles.label, { color: colors.primary, fontWeight: '700', fontSize: 12, marginBottom: 8 }]}>
                                                    Folded Tray Breakdown ({log.chick_count} chicks)
                                                </Text>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Total Gross Tray Weight:</Text>
                                                    <Text style={[textStyles.body, { color: colors.text, fontWeight: '700', fontSize: 11 }]}>{grossWeight.toLocaleString()} g</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Head Count in Tray:</Text>
                                                    <Text style={[textStyles.body, { color: colors.text, fontWeight: '700', fontSize: 11 }]}>{log.chick_count} chicks</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Evaluated Per-Chick Average:</Text>
                                                    <Text style={[textStyles.body, { color: colors.primary, fontWeight: '700', fontSize: 11 }]}>{Math.round(log.weight_g)} g / chick</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, flexShrink: 0 }]}>Status Determination:</Text>
                                                    <Text style={[textStyles.body, { color: statusColor, fontWeight: '700', fontSize: 11, flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>
                                                        {log.status.toUpperCase()} ({Math.round(log.weight_g)}g/chick)
                                                    </Text>
                                                </View>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        )}

                        {/* View All link */}
                        {weightLogs.length > 0 && (
                            <TouchableOpacity
                                onPress={() => router.push(`/(devices)/RecentLogsScreen?deviceId=${deviceId}&animalType=${animalType}` as any)}
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

            {/* Connection / Housing confirm modal */}
            <ActionModal
                visible={modalVisible}
                type={modalType}
                title={modalTitle}
                message={modalMessage}
                confirmText={modalTitle.includes('Disconnect') ? 'Disconnect' : modalTitle.includes('Connect') ? 'Connect' : 'Confirm'}
                cancelText="Cancel"
                onConfirm={handleModalConfirm}
                onCancel={() => setModalVisible(false)}
            />

            {/* Stop / Reset confirm modal */}
            <ActionModal
                visible={controlModalVisible}
                type={controlAction === 'reset' ? 'warning' : 'confirmation'}
                title={controlAction === 'reset' ? 'Reset Device?' : 'Stop Device?'}
                message={
                    controlAction === 'reset'
                        ? 'This turns off every relay and fully restarts the board — use this if it seems stuck (e.g. after a power interruption mid-cycle) or you just want a clean slate. It will come back up idle; tap Start afterward to resume.'
                        : "This pauses weighing — the device won't start a new cycle until you tap Start again. Your animal type stays set, no need to re-pick it."
                }
                confirmText={controlAction === 'reset' ? 'Reset' : 'Stop'}
                cancelText="Cancel"
                onConfirm={confirmControlAction}
                onCancel={() => { setControlModalVisible(false); setControlAction(null); }}
            />

            {/* Finish weighing session confirm modal */}
            <ActionModal
                visible={finishModalVisible}
                type="confirmation"
                title="Finish Weighing Session?"
                message={activeSession ? `${activeSession.completed_quantity} of ${activeSession.expected_quantity} captures have been completed so far. This closes out the run as a permanent historical record and takes you to its report.` : ''}
                confirmText="Finish"
                cancelText="Cancel"
                onConfirm={handleFinishSession}
                onCancel={() => setFinishModalVisible(false)}
                isLoading={isFinishingSession}
            />

            {/* Incomplete session warning modal */}
            <ActionModal
                visible={incompleteWarningVisible}
                type="warning"
                title="Incomplete Session Warning"
                message={activeSession ? `You have completed ${activeSession.completed_quantity} of ${activeSession.expected_quantity} required captures. Finishing now will log an incomplete session. Are you sure you want to finish early?` : ''}
                confirmText="Finish Anyway"
                cancelText="Continue Session"
                onConfirm={() => {
                    setIncompleteWarningVisible(false);
                    handleFinishSession();
                }}
                onCancel={() => setIncompleteWarningVisible(false)}
                isLoading={isFinishingSession}
            />

            {/* Range settings modal — Read Only */}
            <Modal
                visible={rangeSettingsVisible}
                transparent
                animationType="none"
                onRequestClose={() => closeRangeModal()}
            >
                <Animated.View
                    style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', opacity: rangeBackdropAnim }}
                >
                    <TouchableOpacity
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        activeOpacity={1}
                        onPress={() => closeRangeModal()}
                    />
                    <Animated.View style={{ transform: [{ translateY: rangeSheetAnim }] }}>
                        <ScrollView
                            style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
                            contentContainerStyle={{ padding: 24, paddingBottom: Math.max(insets.bottom + 8, 24) }}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                        >
                            {/* Handle bar */}
                            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginBottom: 20 }} />

                            {/* Header row */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name="monitor-weight" size={22} color={colors.primary} />
                                    </View>
                                    <View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 17 }]}>Weight Range</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 1 }]}>
                                            {isPigMode ? 'Pig' : 'Chicken'}
                                        </Text>
                                    </View>
                                </View>
                                {/* Unit toggle */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center',
                                        backgroundColor: colors.bgLight, borderRadius: 8,
                                        borderWidth: 1, borderColor: colors.stroke,
                                        overflow: 'hidden',
                                    }}
                                    onPress={() => setRangeUnit(rangeUnit === 'kg' ? 'g' : 'kg')}
                                >
                                    <Text style={[textStyles.label, { color: rangeUnit === 'kg' ? colors.primary : colors.textGrey, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12 }]}>KG</Text>
                                    <View style={{ width: 1, height: 14, backgroundColor: colors.stroke }} />
                                    <Text style={[textStyles.label, { color: rangeUnit === 'g' ? colors.primary : colors.textGrey, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12 }]}>GRAMS</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Week Benchmark card */}
                            <View style={{
                                backgroundColor: colors.primary + '10',
                                borderRadius: 14,
                                padding: 14,
                                marginTop: 16,
                                marginBottom: 12,
                                borderWidth: 1,
                                borderColor: colors.primary + '30',
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                                <View>
                                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, letterSpacing: 0.5 }]}>REARING WEEK</Text>
                                    <Text style={[textStyles.h1, { color: colors.primary, fontSize: 28, lineHeight: 34 }]}>
                                        Week {activeRearingWeek}
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, letterSpacing: 0.5 }]}>TARGET WEIGHT</Text>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                                        {activeWeekStandard
                                            ? rangeUnit === 'kg'
                                                ? `${(activeWeekStandard.target_weight_grams / 1000).toFixed(2)} kg`
                                                : `${Math.round(activeWeekStandard.target_weight_grams)} g`
                                            : '—'
                                        }
                                    </Text>
                                </View>
                            </View>

                            {/* Segregation zones */}
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, letterSpacing: 0.5, marginBottom: 8 }]}>SEGREGATION ZONES</Text>
                            <View style={{ gap: 8 }}>
                                {/* Underweight */}
                                <View style={{
                                    backgroundColor: colors.warning + '15',
                                    borderRadius: 12,
                                    padding: 14,
                                    borderWidth: 1,
                                    borderColor: colors.warning + '35',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <MaterialIcons name="arrow-downward" size={18} color={colors.warning} />
                                        <Text style={[textStyles.h3, { color: colors.warning, fontSize: 14 }]}>Underweight</Text>
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.warning, fontSize: 14 }]}>
                                        {'< '}
                                        {threshold
                                            ? rangeUnit === 'kg'
                                                ? `${(threshold.underweightMaxGrams / 1000).toFixed(2)} kg`
                                                : `${Math.round(threshold.underweightMaxGrams)} g`
                                            : '—'
                                        }
                                    </Text>
                                </View>

                                {/* Normal */}
                                <View style={{
                                    backgroundColor: colors.success + '15',
                                    borderRadius: 12,
                                    padding: 14,
                                    borderWidth: 1,
                                    borderColor: colors.success + '35',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <MaterialIcons name="check-circle" size={18} color={colors.success} />
                                        <Text style={[textStyles.h3, { color: colors.success, fontSize: 14 }]}>Normal Range</Text>
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.success, fontSize: 14 }]}>
                                        {threshold
                                            ? rangeUnit === 'kg'
                                                ? `${(threshold.underweightMaxGrams / 1000).toFixed(2)} – ${(threshold.overweightMinGrams / 1000).toFixed(2)} kg`
                                                : `${Math.round(threshold.underweightMaxGrams)} – ${Math.round(threshold.overweightMinGrams)} g`
                                            : '—'
                                        }
                                    </Text>
                                </View>

                                {/* Overweight */}
                                <View style={{
                                    backgroundColor: colors.error + '15',
                                    borderRadius: 12,
                                    padding: 14,
                                    borderWidth: 1,
                                    borderColor: colors.error + '35',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <MaterialIcons name="arrow-upward" size={18} color={colors.error} />
                                        <Text style={[textStyles.h3, { color: colors.error, fontSize: 14 }]}>Overweight</Text>
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.error, fontSize: 14 }]}>
                                        {'> '}
                                        {threshold
                                            ? rangeUnit === 'kg'
                                                ? `${(threshold.overweightMinGrams / 1000).toFixed(2)} kg`
                                                : `${Math.round(threshold.overweightMinGrams)} g`
                                            : '—'
                                        }
                                    </Text>
                                </View>
                            </View>

                            {/* Info note */}
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                gap: 8,
                                backgroundColor: colors.bgLight,
                                borderRadius: 10,
                                padding: 12,
                                marginTop: 14,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                            }}>
                                <MaterialIcons name="info-outline" size={16} color={colors.textGrey} style={{ marginTop: 1 }} />
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, flex: 1, lineHeight: 18 }]}>
                                    Weight ranges are automatically set each time the device is opened, based on the active batch rearing week and your farm's target weight standards.
                                </Text>
                            </View>

                            {/* Manage standards link */}
                            <TouchableOpacity
                                onPress={() => {
                                    closeRangeModal(() => router.push('/(animals)/TargetWeightScreen' as any));
                                }}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    marginTop: 12,
                                    paddingVertical: 12,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: colors.primary + '50',
                                    backgroundColor: colors.primary + '08',
                                }}
                            >
                                <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 13 }]}>
                                    Manage Target Weight Standards
                                </Text>
                            </TouchableOpacity>

                            {/* Close */}
                            <TouchableOpacity
                                style={{
                                    marginTop: 12,
                                    paddingVertical: 14,
                                    borderRadius: 12,
                                    backgroundColor: colors.cardFill,
                                    alignItems: 'center',
                                }}
                                onPress={() => closeRangeModal()}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 15 }]}>Close</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </Animated.View>
                </Animated.View>
            </Modal>

            {/* Edit Animal Type / Housing */}
            {editTarget && (
                <SelectionModal
                    visible={editModalVisible}
                    onClose={() => setEditModalVisible(false)}
                    onSelect={handleEditConfirm}
                    title={`Edit ${editTarget}`}
                    description={`Select a new ${editTarget.toLowerCase()} for this device.`}
                    icon="edit"
                    options={getEditOptions()}
                    selectedValue={
                        editTarget === 'Animal Type'
                            ? animalType
                            : editTarget === 'Housing'
                            ? housing
                            : (housingBatches.find(b => b.id === selectedBatchId)?.name ?? '')
                    }
                    enableSearch={editTarget === 'Housing'}
                />
            )}

            {/* Feeder picker — only shown when the farm has more than one AniFeed device */}
            <SelectionModal
                visible={feederPickerVisible}
                onClose={() => setFeederPickerVisible(false)}
                onSelect={(val) => {
                    const picked = feederDevices.find(d => d.name === val);
                    if (picked) {
                        setFeedScheduleDeviceId(picked.id);
                        setFeedScheduleAnimalType(picked.animalType);
                        setFeederPickerVisible(false);
                        setFeedScheduleModalVisible(true);
                    }
                }}
                title="Choose a Feeder"
                description="This farm has more than one feeder — pick which one to configure."
                icon="edit-calendar"
                options={feederDevices.map(d => d.name)}
                selectedValue=""
                enableSearch={feederDevices.length > 5}
            />

            {/* Feed Schedule modal — moved here from AniFeedScreen (see openFeedSchedule) */}
            <FeedScheduleModal
                visible={feedScheduleModalVisible}
                onClose={() => setFeedScheduleModalVisible(false)}
                deviceId={feedScheduleDeviceId ?? ''}
                farmId={farmId}
                animalType={feedScheduleAnimalType}
                showSnackbar={showSnackbar}
            />

            {/* Chicks per Tray Configuration Modal */}
            <Modal visible={chicksPerTrayModalVisible} transparent animationType="fade">
                <View style={[aniweighStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.55)', padding: 16, justifyContent: 'center', alignItems: 'center' }]}>
                    <View style={{
                        width: '100%',
                        maxWidth: 400,
                        backgroundColor: colors.surface,
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: colors.stroke,
                        padding: 20,
                        overflow: 'hidden',
                        shadowColor: '#000',
                        shadowOpacity: 0.18,
                        shadowRadius: 20,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 10,
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 12,
                                    backgroundColor: colors.primary + '18',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <MaterialIcons name="inventory-2" size={20} color={colors.primary} />
                                </View>
                                <View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>Chicks per Tray</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Tray capacity configuration</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setChicksPerTrayModalVisible(false)} style={{ padding: 6 }}>
                                <MaterialIcons name="close" size={22} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginBottom: 16, lineHeight: 18 }]}>
                            Set how many chicks are placed in each crate or tray. Each tray weighing will calculate individual chick averages and log individual records.
                        </Text>

                        {/* Quick preset buttons */}
                        <Text style={[textStyles.label, { color: colors.text, marginBottom: 8, fontSize: 12 }]}>Quick Select</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                            {[10, 15, 20, 25, 30, 50].map((preset) => {
                                const isSelected = parseInt(tempChicksPerTray, 10) === preset;
                                return (
                                    <TouchableOpacity
                                        key={preset}
                                        onPress={() => setTempChicksPerTray(preset.toString())}
                                        style={{
                                            paddingHorizontal: 14,
                                            paddingVertical: 8,
                                            borderRadius: 10,
                                            backgroundColor: isSelected ? colors.primary : colors.bgLight,
                                            borderWidth: 1,
                                            borderColor: isSelected ? colors.primary : colors.stroke,
                                        }}
                                    >
                                        <Text style={[textStyles.label, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: '700' }]}>
                                            {preset}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Custom Input */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={[textStyles.label, { color: colors.text, fontSize: 12 }]}>Number of Chicks in Tray</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Max: {MAX_CHICKS_PER_TRAY} pcs</Text>
                        </View>
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: colors.bgLight,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            marginBottom: 16,
                        }}>
                            <TouchableOpacity
                                onPress={() => {
                                    const cur = parseInt(tempChicksPerTray, 10) || 1;
                                    if (cur > 1) setTempChicksPerTray((cur - 1).toString());
                                }}
                                style={{ padding: 10 }}
                            >
                                <MaterialIcons name="remove" size={20} color={colors.primary} />
                            </TouchableOpacity>

                            <TextInput
                                value={tempChicksPerTray}
                                onChangeText={(t) => {
                                    const cleaned = t.replace(/[^0-9]/g, '');
                                    if (!cleaned) {
                                        setTempChicksPerTray('');
                                        return;
                                    }
                                    const num = parseInt(cleaned, 10);
                                    if (num > MAX_CHICKS_PER_TRAY) {
                                        setTempChicksPerTray(MAX_CHICKS_PER_TRAY.toString());
                                    } else {
                                        setTempChicksPerTray(cleaned);
                                    }
                                }}
                                keyboardType="number-pad"
                                maxLength={3}
                                style={{
                                    flex: 1,
                                    textAlign: 'center',
                                    fontSize: 18,
                                    fontWeight: '700',
                                    color: colors.text,
                                    paddingVertical: 10,
                                }}
                            />

                            <TouchableOpacity
                                onPress={() => {
                                    const cur = parseInt(tempChicksPerTray, 10) || 0;
                                    if (cur < MAX_CHICKS_PER_TRAY) {
                                        setTempChicksPerTray((cur + 1).toString());
                                    }
                                }}
                                style={{ padding: 10 }}
                            >
                                <MaterialIcons name="add" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        </View>

                        {/* Breakdown summary */}
                        {(() => {
                            const currentBatch = housingBatches.find(b => b.id === selectedBatchId) || housingBatches[0];
                            const totalCount = currentBatch?.current_count ?? 0;
                            const trayNum = Math.max(1, Math.min(MAX_CHICKS_PER_TRAY, parseInt(tempChicksPerTray, 10) || 1));
                            const totalTrays = totalCount > 0 ? Math.ceil(totalCount / trayNum) : 0;
                            return (
                                <View style={{
                                    backgroundColor: colors.primary + '10',
                                    borderWidth: 1,
                                    borderColor: colors.primary + '30',
                                    borderRadius: 12,
                                    padding: 12,
                                    marginBottom: 18,
                                }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Batch Size:</Text>
                                        <Text style={[textStyles.label, { color: colors.text, fontSize: 12, fontWeight: '700' }]}>
                                            {totalCount > 0 ? `${totalCount} chicks` : 'No active batch'}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Chicks per Tray:</Text>
                                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 12, fontWeight: '700' }]}>
                                            {trayNum} chicks
                                        </Text>
                                    </View>
                                    {totalCount > 0 && (
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.primary + '20', paddingTop: 6, marginTop: 2 }}>
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 12, fontWeight: '600' }]}>Estimated Weigh Sessions:</Text>
                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 12, fontWeight: '700' }]}>
                                                {totalTrays} tray weighs
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })()}

                        {/* Save Button */}
                        <TouchableOpacity
                            onPress={() => {
                                const parsed = parseInt(tempChicksPerTray, 10);
                                if (!parsed || parsed < 1) {
                                    showSnackbar('Please enter at least 1 chick.', 'error');
                                    return;
                                }
                                if (parsed > MAX_CHICKS_PER_TRAY) {
                                    showSnackbar(`Maximum capacity is ${MAX_CHICKS_PER_TRAY} chicks per tray.`, 'error');
                                    return;
                                }
                                handleSaveChicksPerTray(parsed);
                            }}
                            activeOpacity={0.85}
                            style={{
                                height: 48,
                                borderRadius: 24,
                                backgroundColor: colors.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Save Tray Capacity</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Weighing Reminder Configuration Modal */}
            <Modal visible={reminderModalVisible} transparent animationType="fade">
                <View style={[aniweighStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.55)', padding: 16 }]}>
                    <View style={{
                        width: '100%',
                        maxWidth: 420,
                        maxHeight: '86%',
                        backgroundColor: colors.surface,
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: colors.stroke,
                        overflow: 'hidden',
                        shadowColor: '#000',
                        shadowOpacity: 0.18,
                        shadowRadius: 20,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 10,
                    }}>
                        {/* Fixed Top Bar with Title and X Button */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 18,
                            paddingTop: 16,
                            paddingBottom: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.stroke,
                            backgroundColor: colors.surface,
                        }}>
                            {reminderView === 'customTime' ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                                    <TouchableOpacity
                                        onPress={() => setReminderView('main')}
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
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
                                            Custom Alert Time
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>
                                            Select hour, minute and period
                                        </Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                                    <View style={{
                                        width: 38,
                                        height: 38,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '18',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="alarm" size={20} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
                                            Weighing Schedule
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>
                                            Automated push reminders for sessions
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <TouchableOpacity
                                onPress={() => {
                                    setReminderView('main');
                                    setReminderModalVisible(false);
                                }}
                                activeOpacity={0.7}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 17,
                                    backgroundColor: colors.cardFill,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                }}
                            >
                                <MaterialIcons name="close" size={18} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {reminderView === 'customTime' ? (
                            /* Custom Time Picker Sub-View */
                            <ScrollView
                                showsVerticalScrollIndicator={true}
                                bounces={true}
                                keyboardShouldPersistTaps="handled"
                                style={{ width: '100%', flexShrink: 1 }}
                                contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22, alignItems: 'center' }}
                            >
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 12, marginBottom: 12 }]}>
                                    Select hour, minute (5-min intervals), and period.
                                </Text>

                                {/* Digital Display Card */}
                                <View style={{
                                    backgroundColor: colors.bgLight,
                                    borderRadius: 16,
                                    paddingVertical: 10,
                                    paddingHorizontal: 18,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 12,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    width: '100%',
                                    flexDirection: 'row',
                                    gap: 6,
                                }}>
                                    <Text style={[textStyles.h1, { color: colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 }]}>
                                        {String(customTimeHour).padStart(2, '0')}
                                    </Text>
                                    <Text style={[textStyles.h1, { color: colors.primary, fontSize: 30, fontWeight: '800' }]}>:</Text>
                                    <Text style={[textStyles.h1, { color: colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 }]}>
                                        {String(customTimeMinute).padStart(2, '0')}
                                    </Text>
                                    <View style={{ backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 }}>
                                        <Text style={[textStyles.label, { color: colors.onPrimary, fontSize: 13, fontWeight: '800' }]}>
                                            {customTimeAmPm}
                                        </Text>
                                    </View>
                                </View>

                                {/* AM / PM Switcher */}
                                <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginBottom: 12 }}>
                                    {(['AM', 'PM'] as const).map((period) => {
                                        const isSelected = customTimeAmPm === period;
                                        return (
                                            <TouchableOpacity
                                                key={period}
                                                onPress={() => setCustomTimeAmPm(period)}
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
                                            const isSelected = customTimeHour === h;
                                            return (
                                                <TouchableOpacity
                                                    key={h}
                                                    onPress={() => setCustomTimeHour(h)}
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
                                            const isSelected = customTimeMinute === m;
                                            return (
                                                <TouchableOpacity
                                                    key={m}
                                                    onPress={() => setCustomTimeMinute(m)}
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
                                            borderWidth: 1.5,
                                            borderColor: colors.stroke,
                                            backgroundColor: colors.cardFill,
                                        }}
                                        onPress={() => setReminderView('main')}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 13.5 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1.5,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: colors.primary,
                                            shadowColor: colors.primary,
                                            shadowOpacity: 0.35,
                                            shadowRadius: 6,
                                            shadowOffset: { width: 0, height: 3 },
                                            elevation: 3,
                                        }}
                                        onPress={() => {
                                            let h = customTimeHour;
                                            if (customTimeAmPm === 'PM' && h < 12) h += 12;
                                            if (customTimeAmPm === 'AM' && h === 12) h = 0;
                                            const time24 = `${String(h).padStart(2, '0')}:${String(customTimeMinute).padStart(2, '0')}`;
                                            setReminderTime(time24);
                                            setReminderView('main');
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 13.5, fontWeight: '700' }]}>Set Alert Time</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        ) : (
                            /* Responsive Scrollable Modal Body */
                            <ScrollView
                                showsVerticalScrollIndicator={true}
                                bounces={true}
                                keyboardShouldPersistTaps="handled"
                                style={{ width: '100%', flexShrink: 1 }}
                                contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 }}
                            >
                                {/* Strategy Section Header */}
                                <Text style={{
                                    fontFamily: 'Poppins-SemiBold',
                                    fontSize: 11,
                                    color: colors.textGrey,
                                    marginBottom: 8,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.8,
                                }}>
                                    REMINDER MODE
                                </Text>

                                {/* 2x2 Strategy Selector Cards */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                    {([
                                        { key: 'interval' as const, label: 'Every X Days', desc: 'Periodic cycle', icon: 'repeat' },
                                        { key: 'weekly' as const, label: 'Specific Days', desc: 'Days of week', icon: 'date-range' },
                                        { key: 'inactivity' as const, label: 'Inactivity Alert', desc: 'If unweighed', icon: 'alarm-off' },
                                        { key: 'milestones' as const, label: 'Growth Stages', desc: 'Key age days', icon: 'trending-up' },
                                    ]).map(item => {
                                        const isSel = reminderMode === item.key;
                                        return (
                                            <TouchableOpacity
                                                key={item.key}
                                                onPress={() => setReminderMode(item.key)}
                                                activeOpacity={0.7}
                                                style={{
                                                    flexBasis: '47%',
                                                    flexGrow: 1,
                                                    flexDirection: 'column',
                                                    padding: 11,
                                                    borderRadius: 14,
                                                    backgroundColor: isSel ? colors.primary + '12' : colors.cardFill,
                                                    borderWidth: 1.5,
                                                    borderColor: isSel ? colors.primary : colors.stroke,
                                                }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                    <MaterialIcons
                                                        name={item.icon as any}
                                                        size={16}
                                                        color={isSel ? colors.primary : colors.textGrey}
                                                    />
                                                    <Text style={[textStyles.h3, { color: isSel ? colors.primary : colors.text, fontSize: 12, flex: 1 }]}>
                                                        {item.label}
                                                    </Text>
                                                </View>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>
                                                    {item.desc}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Strategy Config: Interval */}
                                {reminderMode === 'interval' && (
                                    <View style={{
                                        backgroundColor: colors.cardFill,
                                        padding: 14,
                                        borderRadius: 16,
                                        marginBottom: 14,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                    }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <View style={{ flex: 1, marginRight: 8 }}>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}>
                                                    Interval Frequency
                                                </Text>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                    Days between each session
                                                </Text>
                                            </View>
                                            {/* Stepper controls */}
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: colors.surface,
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                padding: 2,
                                            }}>
                                                <TouchableOpacity
                                                    onPress={() => setReminderInterval(Math.max(1, (reminderInterval || 7) - 1))}
                                                    style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 14,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        backgroundColor: colors.cardFill,
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons name="remove" size={15} color={colors.text} />
                                                </TouchableOpacity>
                                                <Text style={[textStyles.h3, { color: colors.primary, fontSize: 13, marginHorizontal: 8, minWidth: 44, textAlign: 'center' }]}>
                                                    {reminderInterval || 7}d
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => setReminderInterval((reminderInterval || 7) + 1)}
                                                    style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 14,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        backgroundColor: colors.primary,
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons name="add" size={15} color={colors.onPrimary} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        <Text style={{
                                            fontFamily: 'Poppins-SemiBold',
                                            fontSize: 10,
                                            color: colors.textGrey,
                                            marginBottom: 6,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.5,
                                        }}>
                                            Quick Presets:
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            {[1, 2, 3, 5, 7, 10, 14, 21, 30].map(days => {
                                                const isSel = reminderInterval === days;
                                                return (
                                                    <TouchableOpacity
                                                        key={days}
                                                        onPress={() => setReminderInterval(days)}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            paddingHorizontal: 10,
                                                            paddingVertical: 5,
                                                            borderRadius: 8,
                                                            backgroundColor: isSel ? colors.primary : colors.surface,
                                                            borderWidth: 1,
                                                            borderColor: isSel ? colors.primary : colors.stroke,
                                                        }}
                                                    >
                                                        <Text style={[textStyles.label, { color: isSel ? colors.onPrimary : colors.text, fontSize: 11, fontWeight: isSel ? '700' : '500' }]}>
                                                            {days}d
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}

                                {/* Strategy Config: Weekly Days */}
                                {reminderMode === 'weekly' && (
                                    <View style={{
                                        backgroundColor: colors.cardFill,
                                        padding: 14,
                                        borderRadius: 16,
                                        marginBottom: 14,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                    }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 13, marginBottom: 2 }]}>
                                            Select Days of the Week
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginBottom: 10 }]}>
                                            Repeats weekly on every selected day.
                                        </Text>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
                                            {[
                                                { day: 0, label: 'Sun' },
                                                { day: 1, label: 'Mon' },
                                                { day: 2, label: 'Tue' },
                                                { day: 3, label: 'Wed' },
                                                { day: 4, label: 'Thu' },
                                                { day: 5, label: 'Fri' },
                                                { day: 6, label: 'Sat' },
                                            ].map(d => {
                                                const isSel = reminderDaysOfWeek.includes(d.day);
                                                return (
                                                    <TouchableOpacity
                                                        key={d.day}
                                                        onPress={() => {
                                                            if (isSel) {
                                                                if (reminderDaysOfWeek.length > 1) {
                                                                    setReminderDaysOfWeek(reminderDaysOfWeek.filter(x => x !== d.day));
                                                                }
                                                            } else {
                                                                setReminderDaysOfWeek([...reminderDaysOfWeek, d.day].sort());
                                                            }
                                                        }}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            flex: 1,
                                                            minHeight: 36,
                                                            borderRadius: 10,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            backgroundColor: isSel ? colors.primary : colors.surface,
                                                            borderWidth: 1.5,
                                                            borderColor: isSel ? colors.primary : colors.stroke,
                                                        }}
                                                    >
                                                        <Text style={[textStyles.label, { color: isSel ? colors.onPrimary : colors.text, fontSize: 11, fontWeight: '700' }]}>
                                                            {d.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}

                                {/* Strategy Config: Inactivity */}
                                {reminderMode === 'inactivity' && (
                                    <View style={{
                                        backgroundColor: colors.cardFill,
                                        padding: 14,
                                        borderRadius: 16,
                                        marginBottom: 14,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                    }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <View style={{ flex: 1, marginRight: 8 }}>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}>
                                                    Inactivity Threshold
                                                </Text>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                    Alert if no weights recorded
                                                </Text>
                                            </View>
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: colors.surface,
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                padding: 2,
                                            }}>
                                                <TouchableOpacity
                                                    onPress={() => setReminderInactivityDays(Math.max(1, (reminderInactivityDays || 5) - 1))}
                                                    style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardFill }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons name="remove" size={15} color={colors.text} />
                                                </TouchableOpacity>
                                                <Text style={[textStyles.h3, { color: colors.primary, fontSize: 13, marginHorizontal: 8, minWidth: 44, textAlign: 'center' }]}>
                                                    {reminderInactivityDays || 5}d
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => setReminderInactivityDays((reminderInactivityDays || 5) + 1)}
                                                    style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons name="add" size={15} color={colors.onPrimary} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                            {[2, 3, 5, 7, 10, 14, 21].map(days => {
                                                const isSel = reminderInactivityDays === days;
                                                return (
                                                    <TouchableOpacity
                                                        key={days}
                                                        onPress={() => setReminderInactivityDays(days)}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            paddingHorizontal: 10,
                                                            paddingVertical: 5,
                                                            borderRadius: 8,
                                                            backgroundColor: isSel ? colors.primary : colors.surface,
                                                            borderWidth: 1,
                                                            borderColor: isSel ? colors.primary : colors.stroke,
                                                        }}
                                                    >
                                                        <Text style={[textStyles.label, { color: isSel ? colors.onPrimary : colors.text, fontSize: 11, fontWeight: isSel ? '700' : '500' }]}>
                                                            {days}d
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}

                                {/* Strategy Config: Milestones */}
                                {reminderMode === 'milestones' && (
                                    <View style={{
                                        backgroundColor: colors.cardFill,
                                        padding: 14,
                                        borderRadius: 16,
                                        marginBottom: 14,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                    }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 13, marginBottom: 2 }]}>
                                            Growth Stage Milestones
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginBottom: 10 }]}>
                                            Automatic alerts as the batch reaches key growth ages.
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            {reminderMilestoneDays.map(day => (
                                                <View
                                                    key={day}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 5,
                                                        borderRadius: 8,
                                                        backgroundColor: colors.primary + '15',
                                                        borderWidth: 1,
                                                        borderColor: colors.primary + '35',
                                                    }}
                                                >
                                                    <MaterialIcons name="schedule" size={12} color={colors.primary} />
                                                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '600' }]}>
                                                        Day {day}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {/* Target Housing & Batch */}
                                <Text style={{
                                    fontFamily: 'Poppins-SemiBold',
                                    fontSize: 11,
                                    color: colors.textGrey,
                                    marginBottom: 8,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.8,
                                }}>
                                    TARGET HOUSING & BATCH
                                </Text>
                                <View style={{
                                    backgroundColor: colors.cardFill,
                                    borderRadius: 16,
                                    padding: 12,
                                    borderWidth: 1.5,
                                    borderColor: colors.stroke,
                                    marginBottom: 14,
                                    gap: 8,
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                                                <MaterialIcons name="home-work" size={15} color={colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>Housing</Text>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 12.5 }]} numberOfLines={1}>
                                                    {targetHousingName}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={{ height: 1, backgroundColor: colors.stroke }} />

                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                                            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                                                <MaterialIcons name="inventory-2" size={15} color={colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>Target Batch</Text>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 12.5 }]} numberOfLines={1}>
                                                    {targetBatchName}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 3,
                                            backgroundColor: isBatchActive ? colors.primary + '18' : colors.warning + '18',
                                            paddingHorizontal: 7,
                                            paddingVertical: 3,
                                            borderRadius: 6,
                                            borderWidth: 1,
                                            borderColor: isBatchActive ? colors.primary + '30' : colors.warning + '30',
                                        }}>
                                            <MaterialIcons name={isBatchActive ? "check-circle" : "warning"} size={11} color={isBatchActive ? colors.primary : colors.warning} />
                                            <Text style={[textStyles.label, { color: isBatchActive ? colors.primary : colors.warning, fontSize: 9.5, fontWeight: '600' }]}>
                                                {isBatchActive ? 'Active' : 'Inactive'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Preferred Alert Time Section Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{
                                        fontFamily: 'Poppins-SemiBold',
                                        fontSize: 11,
                                        color: colors.textGrey,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.8,
                                    }}>
                                        PREFERRED ALERT TIME
                                    </Text>
                                    {(() => {
                                        const isPreset = ['06:00', '08:00', '12:00', '17:00', '19:00'].includes(reminderTime);
                                        if (!isPreset) {
                                            return (
                                                <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, fontWeight: '700' }]}>
                                                        Custom: {formatReminderTimeLabel(reminderTime)}
                                                    </Text>
                                                </View>
                                            );
                                        }
                                        return null;
                                    })()}
                                </View>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                                    {[
                                        { time: '06:00', label: '6:00 AM' },
                                        { time: '08:00', label: '8:00 AM' },
                                        { time: '12:00', label: '12:00 PM' },
                                        { time: '17:00', label: '5:00 PM' },
                                        { time: '19:00', label: '7:00 PM' },
                                    ].map(t => {
                                        const isSel = reminderTime === t.time;
                                        return (
                                            <TouchableOpacity
                                                key={t.time}
                                                onPress={() => setReminderTime(t.time)}
                                                activeOpacity={0.7}
                                                style={{
                                                    paddingHorizontal: 11,
                                                    paddingVertical: 6,
                                                    borderRadius: 8,
                                                    backgroundColor: isSel ? colors.primary : colors.cardFill,
                                                    borderWidth: 1.5,
                                                    borderColor: isSel ? colors.primary : colors.stroke,
                                                }}
                                            >
                                                <Text style={[textStyles.label, { color: isSel ? colors.onPrimary : colors.text, fontSize: 11.5, fontWeight: isSel ? '700' : '500' }]}>
                                                    {t.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}

                                    {/* Custom Time Button */}
                                    {(() => {
                                        const isPreset = ['06:00', '08:00', '12:00', '17:00', '19:00'].includes(reminderTime);
                                        return (
                                            <TouchableOpacity
                                                onPress={openCustomTimePicker}
                                                activeOpacity={0.7}
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    paddingHorizontal: 11,
                                                    paddingVertical: 6,
                                                    borderRadius: 8,
                                                    backgroundColor: !isPreset ? colors.primary : colors.cardFill,
                                                    borderWidth: 1.5,
                                                    borderColor: !isPreset ? colors.primary : colors.stroke,
                                                }}
                                            >
                                                <MaterialIcons
                                                    name="access-time"
                                                    size={14}
                                                    color={!isPreset ? colors.onPrimary : colors.primary}
                                                />
                                                <Text style={[textStyles.label, { color: !isPreset ? colors.onPrimary : colors.text, fontSize: 11.5, fontWeight: !isPreset ? '700' : '600' }]}>
                                                    {!isPreset ? `${formatReminderTimeLabel(reminderTime)} (Custom)` : '+ Custom Time'}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })()}
                                </View>

                                {/* Action Buttons */}
                                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 2 }}>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: colors.cardFill,
                                            borderWidth: 1.5,
                                            borderColor: colors.stroke,
                                            borderRadius: 12,
                                            paddingVertical: 12,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        onPress={() => {
                                            setReminderView('main');
                                            setReminderModalVisible(false);
                                        }}
                                        activeOpacity={0.7}
                                        disabled={isSavingReminder}
                                    >
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 13.5 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1.5,
                                            backgroundColor: colors.primary,
                                            borderRadius: 12,
                                            paddingVertical: 12,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            shadowColor: colors.primary,
                                            shadowOpacity: 0.35,
                                            shadowRadius: 6,
                                            shadowOffset: { width: 0, height: 3 },
                                            elevation: 3,
                                        }}
                                        onPress={handleSaveReminder}
                                        activeOpacity={0.7}
                                        disabled={isSavingReminder}
                                    >
                                        {isSavingReminder ? (
                                            <ActivityIndicator size="small" color={colors.onPrimary} />
                                        ) : (
                                            <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 13.5, fontWeight: '700' }]}>Save Schedule</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Offline Device Guidance Modal */}
            <Modal
                visible={offlineModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setOfflineModalVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{
                        width: '100%',
                        maxWidth: 380,
                        backgroundColor: colors.surface,
                        borderRadius: 24,
                        padding: 22,
                        borderWidth: 1,
                        borderColor: colors.stroke,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.25,
                        shadowRadius: 20,
                        elevation: 10,
                    }}>
                        {/* Icon & Title Header */}
                        <View style={{ alignItems: 'center', marginBottom: 16 }}>
                            <View style={{
                                width: 56,
                                height: 56,
                                borderRadius: 28,
                                backgroundColor: colors.error + '18',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 12,
                            }}>
                                <MaterialIcons name="cloud-off" size={30} color={colors.error} />
                            </View>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center', fontWeight: '700' }]}>
                                Scale is Offline
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center', marginTop: 4 }]}>
                                {deviceInfo?.name ?? 'AniWeigh'} is currently disconnected
                            </Text>
                        </View>

                        {/* Wi-Fi & Connection Checklist Card */}
                        <View style={{
                            backgroundColor: colors.cardFill,
                            borderRadius: 16,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            marginBottom: 20,
                            gap: 12,
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                <MaterialIcons name="power" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13, fontWeight: '600' }]}>1. Check Scale Power</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11.5, marginTop: 1 }]}>
                                        Turn on the physical scale switch and confirm power lights are active.
                                    </Text>
                                </View>
                            </View>

                            <View style={{ height: 1, backgroundColor: colors.stroke }} />

                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                <MaterialIcons name="wifi" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13, fontWeight: '600' }]}>2. Check Wi-Fi Connection</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11.5, marginTop: 1 }]}>
                                        Ensure the farm Wi-Fi router is working and within good signal range of the scale.
                                    </Text>
                                </View>
                            </View>

                            <View style={{ height: 1, backgroundColor: colors.stroke }} />

                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                <MaterialIcons name="autorenew" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13, fontWeight: '600' }]}>3. Auto-Reconnect</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11.5, marginTop: 1 }]}>
                                        The status indicator will automatically switch to <Text style={{ color: colors.primary, fontWeight: '700' }}>Online</Text> once connected.
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Action Buttons */}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity
                                style={{
                                    flex: 1,
                                    paddingVertical: 12,
                                    borderRadius: 12,
                                    backgroundColor: colors.cardFill,
                                    borderWidth: 1.5,
                                    borderColor: colors.stroke,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onPress={() => setOfflineModalVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 13.5, fontWeight: '600' }]}>Dismiss</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{
                                    flex: 1.5,
                                    paddingVertical: 12,
                                    borderRadius: 12,
                                    backgroundColor: colors.primary,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onPress={() => {
                                    setOfflineModalVisible(false);
                                    router.push(
                                        `/(devices)/AddDeviceScreen?existingDeviceId=${deviceId}&existingDeviceName=${encodeURIComponent(deviceInfo?.name ?? '')}&existingDeviceType=AniWeigh&existingDeviceCode=${encodeURIComponent(deviceUniqueCode)}` as any
                                    );
                                }}
                                activeOpacity={0.8}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <MaterialIcons name="wifi-tethering" size={16} color={colors.onPrimary} />
                                    <Text style={[textStyles.label, { color: colors.onPrimary, fontSize: 13.5, fontWeight: '700' }]}>Connect Wi-Fi</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </View>
    );
}

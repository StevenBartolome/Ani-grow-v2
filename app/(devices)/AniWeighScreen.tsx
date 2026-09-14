import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, RefreshControl, ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniWeighStyles } from '@/styles/aniweighStyles';
import { AnimalIcon } from '@/components/AnimalIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { AIInsightCard } from '@/components/AIInsightCard';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceDisplayStatus } from '@/lib/deviceStatus';
import {
    getWeighingReminder,
    saveWeighingReminder,
    triggerTest1HourBeforeReminder,
    triggerTestStartingNowReminder,
    triggerTestInactivityReminder,
    triggerTestMilestoneReminder,
    triggerTestDelayedReminder,
    triggerTestWeighingReminder,
    WeighingReminderConfig,
    ReminderMode,
} from '@/lib/weighingReminders';

interface DeviceInfo {
    name: string;
    status: string;
    lastSeen: string | null;
    weighingActive: boolean;
    housingId: string | null;
    housingName: string;
    animalType: 'Pig' | 'Piglet' | 'Chicken' | 'Chicks (with caution: must be in crate)';
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
    const aniweighStyles = useAniWeighStyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ deviceId?: string; status?: string }>();
    const deviceId = params.deviceId ?? '';
    const initialStatus = params.status;

    if (systemConfig?.featureFlags && !systemConfig.featureFlags.weighingEnabled) {
        return (
            <SafeAreaView style={[aniweighStyles.safeArea, { backgroundColor: colors.bgLight, justifyContent: 'center', alignItems: 'center' }]}>
                <MaterialIcons name="block" size={64} color={colors.textGrey} />
                <Text style={[textStyles.h2, { color: colors.text, marginTop: 20 }]}>Weighing Module Disabled</Text>
                <Text style={[textStyles.body, { textAlign: 'center', marginTop: 10, color: colors.textGrey, paddingHorizontal: 40 }]}>
                    This feature is currently disabled by the system administrator.
                </Text>
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(devices)/DevicesScreen' as any)} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    // ─── State ───────────────────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(initialStatus ? initialStatus === 'online' : false);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    // Ref so realtime callback always has the latest deviceInfo without stale closure
    const deviceInfoRef = useRef<DeviceInfo | null>(null);
    const [threshold, setThreshold] = useState<WeightThreshold | null>(null);
    const [weightLogs, setWeightLogs] = useState<WeighLogEntry[]>([]);
    const [segregationStats, setSegregationStats] = useState<SegregationStats>({ total: 0, underweight: { count: 0, percentage: 0 }, normal: { count: 0, percentage: 0 }, overweight: { count: 0, percentage: 0 } });
    const [statsExpanded, setStatsExpanded] = useState(false);
    const [farmHousings, setFarmHousings] = useState<{ id: string; name: string; animal_type: string; farm_id?: string }[]>([]);

    // Range settings modal
    const [rangeSettingsVisible, setRangeSettingsVisible] = useState(false);
    const [tempUnderweight, setTempUnderweight] = useState('0.8');
    const [tempOverweight, setTempOverweight] = useState('1.5');
    const [rangeUnit, setRangeUnit] = useState<'kg' | 'g'>('kg');
    const [tempRangeUnit, setTempRangeUnit] = useState<'kg' | 'g'>('kg');

    // Edit modal
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Animal Type' | 'Housing' | 'Batch' | null>(null);

    // Action modal
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('info');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');
    const [pendingEditVal, setPendingEditVal] = useState('');

    // Snackbar
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const [deviceUniqueCode, setDeviceUniqueCode] = useState('');

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
        animal_type: 'pig' | 'chicken';
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
    const [gateAnimalType, setGateAnimalType] = useState<'pig' | 'chicken'>('pig');
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

    const showSnackbar = (msg: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(msg); setSnackbarType(type); setSnackbarVisible(true);
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
                if (tempType === 'Pig' || tempType === 'Piglet' || tempType === 'Chicken' || tempType === 'Chicks (with caution: must be in crate)') {
                    info.animalType = tempType;
                }

                setDeviceInfo(info);
                deviceInfoRef.current = info;   // keep ref in sync
                setIsConnected(getDeviceDisplayStatus(info.status, info.lastSeen) === 'online');

                // Fetch batches for this housing if assigned
                if (info.housingId) {
                    const { data: batchesData } = await supabase
                        .from('batches')
                        .select('id, name, current_count, arrival_date, age_at_arrival_days')
                        .eq('housing_id', info.housingId)
                        .eq('status', 'active')
                        .order('created_at', { ascending: false });
                    
                    if (batchesData) {
                        setHousingBatches(batchesData as any[]);
                        setSelectedBatchId(prev => {
                            const stillExists = (batchesData as any[]).some(b => b.id === prev);
                            return stillExists ? prev : (batchesData[0]?.id ?? null);
                        });
                    } else {
                        setHousingBatches([]);
                        setSelectedBatchId(null);
                    }
                } else {
                    setHousingBatches([]);
                    setSelectedBatchId(null);
                }

                // Fetch weight threshold for this device + animal type
                const { data: threshData } = await supabase
                    .from('weight_thresholds')
                    .select('*')
                    .eq('device_id', deviceId)
                    .eq('animal_type', info.animalType.toLowerCase())
                    .maybeSingle();

                if (threshData) {
                    const t = threshData as any;
                    setThreshold({ id: t.id, underweightMaxGrams: t.underweight_max_grams, normalMinGrams: t.normal_min_grams, normalMaxGrams: t.normal_max_grams, overweightMinGrams: t.overweight_min_grams });
                    const ukg = (t.underweight_max_grams / 1000).toFixed(2);
                    const okg = (t.overweight_min_grams / 1000).toFixed(2);
                    setTempUnderweight(ukg);
                    setTempOverweight(okg);
                    setRangeUnit('kg');
                    setTempRangeUnit('kg');
                }

                // Fetch recent sessions for this device and selected batch
                let logsQuery = supabase
                    .from('weigh_sessions')
                    .select('id, net_weight_grams, status, animal_type, recorded_at')
                    .eq('device_id', deviceId)
                    .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
                    .order('recorded_at', { ascending: false })
                    .limit(3);

                if (selectedBatchId) {
                    logsQuery = logsQuery.eq('batch_id', selectedBatchId);
                } else {
                    logsQuery = logsQuery.is('batch_id', null);
                }

                const { data: logsData } = await logsQuery;

                if (logsData) {
                    setWeightLogs((logsData as any[]).map(s => ({
                        id: s.id,
                        weight_g: s.net_weight_grams,
                        status: s.status,
                        timestamp: new Date(s.recorded_at).getTime(),
                        animal: s.animal_type === 'pig' ? 'Pig' : 'Chicken',
                        housingId: info.housingId,
                        housingName: info.housingName,
                        deviceId: deviceId,
                        deviceName: info.name,
                    })));
                }
            }

            if (housingsResult.data) setFarmHousings(housingsResult.data as any);

            if (todayStatsResult.data) {
                const rows = todayStatsResult.data;
                const total = rows.length;
                const under  = rows.filter((r: any) => r.status === 'underweight').length;
                const normal = rows.filter((r: any) => r.status === 'normal').length;
                const over   = rows.filter((r: any) => r.status === 'overweight').length;
                const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
                setSegregationStats({ total, underweight: { count: under, percentage: pct(under) }, normal: { count: normal, percentage: pct(normal) }, overweight: { count: over, percentage: pct(over) } });
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
            const session = (data as ActiveSession | null) ?? null;
            setActiveSession(session);
            activeSessionRef.current = session;
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

            const { data, error } = await supabase
                .from('weighing_sessions')
                .insert({
                    farm_id: effectiveFarmId,
                    housing_id: gateHousingId,
                    batch_id: gateBatchId,
                    device_id: deviceId,
                    animal_type: gateAnimalType,
                    weigh_mode: gateAnimalType === 'chicken' ? gateWeighMode : 'individual',
                    farm_day: farmDay,
                    expected_quantity: batch.current_count,
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
            showSnackbar('Weighing session started — you can begin weighing now.', 'success');
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

                    // 1. Update live-scale display immediately
                    setLiveWeightG(row.net_weight_grams);
                    setLiveStatus(row.status);
                    setLiveFlash(true);
                    setTimeout(() => setLiveFlash(false), 600);

                    // The confirmed result has landed — clear any in-progress
                    // sampling display so the confirmed number above takes
                    // over as authoritative.
                    if (sampleProgressStaleTimeoutRef.current) clearTimeout(sampleProgressStaleTimeoutRef.current);
                    setSampleProgress(null);

                    // 2. Prepend new entry directly into logs — no extra fetch needed.
                    //    Using deviceInfoRef avoids stale closure issues.
                    const info = deviceInfoRef.current;
                    const newEntry: WeighLogEntry = {
                        id: row.id,
                        weight_g: row.net_weight_grams,
                        status: row.status ?? 'normal',
                        timestamp: row.recorded_at
                            ? new Date(row.recorded_at).getTime()
                            : Date.now(),
                        animal: row.animal_type === 'pig' ? 'Pig' : 'Chicken',
                        housingId: info?.housingId ?? null,
                        housingName: info?.housingName ?? 'Unassigned',
                        deviceId: row.device_id,
                        deviceName: info?.name ?? 'AniWeigh',
                    };
                    setWeightLogs(prev => [newEntry, ...prev].slice(0, 8));

                    // 3. Refresh only today's stats counter — do NOT call fetchAll()
                    //    because fetchAll re-fetches logs from DB and would overwrite
                    //    the entry we just injected, causing the "flicker then revert" bug.
                    fetchStats();

                    // 4. If this reading belongs to the active gated session (see
                    //    record_weigh_session's weighing_session_id linking), bump
                    //    its progress locally — matches what the RPC just did in
                    //    the database.
                    const session = activeSessionRef.current;
                    if (session && row.weighing_session_id === session.id) {
                        setActiveSession(prev => {
                            if (!prev) return prev;
                            const updated = { ...prev, completed_quantity: prev.completed_quantity + 1 };
                            activeSessionRef.current = updated;
                            return updated;
                        });
                    }
                }
            )
            .subscribe((status) => {
                console.log('[AniWeigh Realtime] channel status:', status);
            });

        return () => { supabase.removeChannel(channel); };
    }, [deviceId, fetchStats, selectedBatchId]);

    // ─── Derived values ──────────────────────────────────────────
    const animalType = deviceInfo?.animalType ?? 'Chicken';
    const housing    = deviceInfo?.housingName ?? 'Unassigned';
    const isPigMode = animalType === 'Pig' || animalType === 'Piglet';
    const animalColor = isPigMode ? colors.pig : colors.chicken;

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

    // ─── Range settings ───────────────────────────────────────────
    const openRangeSettings = () => {
        const uVal = threshold ? (rangeUnit === 'kg' ? threshold.underweightMaxGrams / 1000 : threshold.underweightMaxGrams).toFixed(2) : '0.8';
        const oVal = threshold ? (rangeUnit === 'kg' ? threshold.overweightMinGrams / 1000  : threshold.overweightMinGrams).toFixed(2) : '1.5';
        setTempUnderweight(uVal);
        setTempOverweight(oVal);
        setTempRangeUnit(rangeUnit);
        setRangeSettingsVisible(true);
    };

    const syncThresholdToDevice = async (uniqueCode: string, underKg: number, overKg: number) => {
        if (!uniqueCode) return;
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

    const syncModeToDevice = async (uniqueCode: string, mode: string) => {
        if (!uniqueCode) return;
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
            showSnackbar(`Scale mode updated on cloud. Reconnect to device hotspot or local WiFi to synchronize.`, 'info');
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
        const requestedBy = (profile as any)?.uid ?? (profile as any)?.id ?? null;
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
        setIsTaring(true);
        try {
            await sendDeviceCommand(
                'tare',
                'Scale tared successfully.',
                "Tare requested — the device hasn't confirmed yet. It'll apply as soon as it's reachable."
            );
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
        setIsStarting(true);
        try {
            await sendDeviceCommand(
                'start',
                `Start confirmed (${animalType}) — the device is taring and getting ready, give it a few seconds.`,
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
            await sendDeviceCommand(
                'stop',
                'Stopped. Tap Start when you\'re ready to resume.',
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
                'Reset confirmed — the device is restarting (takes ~15-20 seconds), then Tap Start to resume.',
                "Reset requested — the device hasn't confirmed yet. It'll reset as soon as it's reachable.",
                15000
            );
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

    const handleSaveRanges = async () => {
        const under = parseFloat(tempUnderweight);
        const over  = parseFloat(tempOverweight);
        if (isNaN(under) || isNaN(over) || under >= over) {
            showSnackbar('Underweight max must be less than overweight min.', 'error');
            return;
        }
        const toGrams = (v: number) => Math.round(tempRangeUnit === 'kg' ? v * 1000 : v);
        const underGrams = toGrams(under);
        const overGrams  = toGrams(over);
        const payload = {
            device_id: deviceId,
            farm_id: farmId,
            animal_type: animalType.toLowerCase(),
            underweight_max_grams: underGrams,
            normal_min_grams: underGrams + 1,
            normal_max_grams: overGrams - 1,
            overweight_min_grams: overGrams,
            updated_at: new Date().toISOString(),
        };
        try {
            if (threshold?.id) {
                const { error } = await supabase.from('weight_thresholds').update(payload).eq('id', threshold.id);
                if (error) throw error;
                setThreshold(prev => prev ? { ...prev, underweightMaxGrams: underGrams, normalMinGrams: underGrams + 1, normalMaxGrams: overGrams - 1, overweightMinGrams: overGrams } : null);
            } else {
                const { data, error } = await supabase.from('weight_thresholds').insert(payload).select('id').single();
                if (error) throw error;
                setThreshold({ id: (data as any)?.id ?? null, underweightMaxGrams: underGrams, normalMinGrams: underGrams + 1, normalMaxGrams: overGrams - 1, overweightMinGrams: overGrams });
            }
            setRangeUnit(tempRangeUnit);
            setRangeSettingsVisible(false);
            showSnackbar(`Weight range updated (${tempRangeUnit}).`);

            // Synchronize with physical device (underGrams and overGrams divided by 1000 as board uses kg)
            const underKg = underGrams / 1000;
            const overKg = overGrams / 1000;
            await syncThresholdToDevice(deviceUniqueCode, underKg, overKg);
        } catch (err) {
            console.error('[handleSaveRanges] error:', err);
            showSnackbar('Failed to save weight range.', 'error');
        }
    };

    // ─── Edit modal (Housing / Animal Type / Batch) ─────────────────────
    const openEditModal = (target: 'Animal Type' | 'Housing' | 'Batch') => {
        setEditTarget(target);
        setEditModalVisible(true);
    };

    const getEditOptions = (): string[] => {
        if (editTarget === 'Animal Type') {
            return ['Pig', 'Piglet', 'Chicken', 'Chicks (with caution: must be in crate)'];
        }
        if (editTarget === 'Housing') {
            const searchType = (animalType === 'Pig' || animalType === 'Piglet') ? 'pig' : 'chicken';
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
                const selectedType = val as 'Pig' | 'Piglet' | 'Chicken' | 'Chicks (with caution: must be in crate)';
                
                await AsyncStorage.setItem(`temp_animal_type_${deviceId}`, selectedType);
                setDeviceInfo(prev => {
                    const updated = prev ? { ...prev, animalType: selectedType } as DeviceInfo : null;
                    deviceInfoRef.current = updated;
                    return updated;
                });
                showSnackbar(`Category set to ${selectedType}.`);

                // Map category selection to Board sequences
                let modeCode = "PIGLET";
                if (selectedType === 'Pig') modeCode = "PIG";
                else if (selectedType === 'Piglet') modeCode = "PIGLET";
                else if (selectedType === 'Chicken') modeCode = "CHICKEN";
                else if (selectedType === 'Chicks (with caution: must be in crate)') modeCode = "CHICK";

                await syncModeToDevice(deviceUniqueCode, modeCode);
            } else if (editTarget === 'Housing') {
                setPendingEditVal(val);
                setModalType('confirmation');
                setModalTitle(`Update Housing?`);
                setModalMessage(`Change this device's housing to "${val}"?`);
                setModalVisible(true);
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
    const effectiveHousingId = activeSession?.housing_id || gateHousingId || deviceInfo?.housingId || reminderHousingId || null;
    const effectiveBatchId = activeSession?.batch_id || gateBatchId || selectedBatchId || reminderBatchId || null;

    const targetHousingName = farmHousings.find(h => h.id === effectiveHousingId)?.name 
        || (deviceInfo as any)?.housing 
        || 'Assigned Housing';

    const targetBatch = reminderBatches.find(b => b.id === effectiveBatchId) 
        || housingBatches.find(b => b.id === effectiveBatchId) 
        || gateBatches.find(b => b.id === effectiveBatchId);

    const targetBatchName = targetBatch?.name || 'Active Batch';
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

    const runTestScenario = async (
        scenarioName: string,
        action: (config: WeighingReminderConfig) => Promise<void>
    ) => {
        setIsTestingReminder(true);
        try {
            const effectiveDeviceId = deviceId || 'dev_aniweigh_standalone';
            const effectiveFarmId = farmId || (profile as any)?.farm_id || 'farm_local';
            const hId = effectiveHousingId;
            const hName = targetHousingName;
            const bId = effectiveBatchId;
            const bName = targetBatchName;

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

            await action(config);
            Alert.alert('Push Notification Sent', `${scenarioName} push notification dispatched successfully.`);
            showSnackbar(`${scenarioName} notification dispatched!`, 'success');
        } catch (err: any) {
            console.error('[runTestScenario] error:', err);
            Alert.alert('Error', err?.message || 'Failed to dispatch test notification.');
        } finally {
            setIsTestingReminder(false);
        }
    };

    const handleTestTrigger = () => {
        Alert.alert(
            'Test Push Notification',
            'Select a weighing reminder scenario to test delivery:',
            [
                {
                    text: '1 Hour Before Reminder',
                    onPress: () => {
                        runTestScenario('1-Hour Before Reminder', triggerTest1HourBeforeReminder);
                    },
                },
                {
                    text: 'Starting Now Reminder',
                    onPress: () => {
                        runTestScenario('Starting Now Reminder', triggerTestStartingNowReminder);
                    },
                },
                {
                    text: `Inactivity Notice (> ${reminderInactivityDays || 5} Days)`,
                    onPress: () => {
                        runTestScenario('Inactivity Alert', triggerTestInactivityReminder);
                    },
                },
                {
                    text: 'Growth Milestone Alert (Day 14)',
                    onPress: () => {
                        runTestScenario('Growth Milestone Alert', triggerTestMilestoneReminder);
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
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

    return (
        <SafeAreaView style={[aniweighStyles.safeArea, { backgroundColor: colors.bgLight }]}>
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

            {isLoading || isSessionLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : !activeSession ? (
                // ─── Mandatory pre-weighing gate ───────────────────────
                // No active weighing_sessions row for this device — the live
                // scale view stays locked until Animal Type + House + Batch
                // are all picked and "Begin Weighing" is tapped.
                <ScrollView contentContainerStyle={aniweighStyles.contentContainer} showsVerticalScrollIndicator={false}>
                    <View style={{ paddingTop: 10, paddingBottom: 40 }}>
                        <View style={{ alignItems: 'center', marginBottom: 14 }}>
                            <MaterialIcons name="fact-check" size={32} color={colors.primary} />
                            <Text style={[textStyles.h2, { color: colors.text, marginTop: 8, textAlign: 'center', fontSize: 20 }]}>Set Up This Weighing Run</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 4, textAlign: 'center', paddingHorizontal: 20, fontSize: 13 }]}>
                                Confirm what's being weighed before the scale unlocks.
                            </Text>
                        </View>

                        <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>Animal Type</Text>
                        <AnimalTypePillSwitcher
                            selected={gateAnimalType}
                            onSelect={(type) => {
                                if (gateAnimalType === type) return;
                                gatePrefilledRef.current = true;
                                setGateAnimalType(type);
                                setGateHousingId(null);
                                setGateBatchId(null);
                                setGateBatches([]);
                                if (type === 'pig') setGateWeighMode('individual');
                            }}
                            style={{ marginBottom: 20 }}
                        />

                        {gateAnimalType === 'chicken' && (
                            <>
                                <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>Weighing Setup</Text>
                                <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, padding: 4, marginBottom: 20 }}>
                                    {([
                                        { key: 'individual' as const, label: 'Individual' },
                                        { key: 'batch' as const, label: 'By Tray / Crate' },
                                    ]).map(opt => {
                                        const isSelected = gateWeighMode === opt.key;
                                        return (
                                            <TouchableOpacity
                                                key={opt.key}
                                                onPress={() => setGateWeighMode(opt.key)}
                                                activeOpacity={0.8}
                                                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: isSelected ? colors.primary : 'transparent' }}
                                            >
                                                <Text style={[textStyles.h3, { color: isSelected ? colors.onPrimary : colors.textGrey, fontSize: 13, fontWeight: '700' }]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </>
                        )}

                        <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>House</Text>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setGateHousingModalVisible(true)}
                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 20 }}
                        >
                            <Text style={[textStyles.body, { color: gateHousingId ? colors.text : colors.textGrey, flex: 1 }]}>
                                {farmHousings.find(h => h.id === gateHousingId)?.name ?? 'Select a house...'}
                            </Text>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>

                        <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>Batch</Text>
                        <TouchableOpacity
                            activeOpacity={gateHousingId ? 0.8 : 1}
                            disabled={!gateHousingId}
                            onPress={() => setGateBatchModalVisible(true)}
                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8, opacity: gateHousingId ? 1 : 0.6 }}
                        >
                            <Text style={[textStyles.body, { color: gateBatchId ? colors.text : colors.textGrey, flex: 1 }]}>
                                {gateBatches.find(b => b.id === gateBatchId)?.name ?? (gateHousingId ? 'Select a batch...' : 'Pick a house first')}
                            </Text>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                        {gateBatchId && (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 20 }]}>
                                Expected: {gateBatches.find(b => b.id === gateBatchId)?.current_count ?? 0} {gateAnimalType === 'pig' ? 'pigs' : 'chickens'}
                            </Text>
                        )}

                        <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={!gateHousingId || !gateBatchId || isBeginningSession}
                            onPress={handleBeginWeighingSession}
                            style={{
                                height: 52,
                                borderRadius: 26,
                                backgroundColor: colors.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: 12,
                                opacity: (!gateHousingId || !gateBatchId || isBeginningSession) ? 0.5 : 1,
                            }}
                        >
                            {isBeginningSession ? (
                                <ActivityIndicator size="small" color={colors.onPrimary} />
                            ) : (
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 15 }]}>
                                    Begin Weighing
                                </Text>
                            )}
                        </TouchableOpacity>

                        {/* Weighing Reminder Card on Pre-gate view */}
                        <View style={{ marginTop: 12 }}>
                            {renderWeighingReminderCard()}
                        </View>
                    </View>

                    <SelectionModal
                        visible={gateHousingModalVisible}
                        onClose={() => setGateHousingModalVisible(false)}
                        onSelect={(val) => {
                            const matched = farmHousings.find(h => h.animal_type === gateAnimalType && h.name === val);
                            if (matched) {
                                if (matched.id !== gateHousingId) {
                                    setGateBatchId(null);
                                }
                                setGateHousingId(matched.id);
                            }
                            setGateHousingModalVisible(false);
                        }}
                        title="Select House"
                        description="Which house is being weighed?"
                        icon="home"
                        options={farmHousings.filter(h => h.animal_type === gateAnimalType).map(h => h.name)}
                        selectedValue={farmHousings.find(h => h.id === gateHousingId)?.name ?? ''}
                        requireConfirm={false}
                    />
                    <SelectionModal
                        visible={gateBatchModalVisible}
                        onClose={() => setGateBatchModalVisible(false)}
                        onSelect={(val) => {
                            const matched = gateBatches.find(b => b.name === val);
                            if (matched) setGateBatchId(matched.id);
                            setGateBatchModalVisible(false);
                        }}
                        title="Select Batch"
                        description="Which batch in this house is being weighed?"
                        icon="layers"
                        options={gateBatches.map(b => b.name)}
                        selectedValue={gateBatches.find(b => b.id === gateBatchId)?.name ?? ''}
                        requireConfirm={false}
                    />
                </ScrollView>
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
                                    <AnimalIcon type={isPigMode ? 'Pig' : 'Chicken'} size={14} color={animalColor} />
                                    <Text style={[textStyles.label, { color: animalColor, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{animalType}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={animalColor} />
                                </TouchableOpacity>
                                <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: colors.info + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Housing')}>
                                    <MaterialIcons name="home" size={14} color={colors.info} />
                                    <Text style={[textStyles.label, { color: colors.info, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{housing}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={colors.info} />
                                </TouchableOpacity>
                                {deviceInfo?.housingId && (
                                    <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: colors.warning + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Batch')}>
                                        <MaterialIcons name="layers" size={14} color={colors.warning} />
                                        <Text style={[textStyles.label, { color: colors.warning, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>
                                            {housingBatches.find(b => b.id === selectedBatchId)?.name ?? 'No Batch'}
                                        </Text>
                                        <MaterialIcons name="arrow-drop-down" size={16} color={colors.warning} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Weighing Reminder Card */}
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
                                                {((sampleProgress.sampleValue ?? 0) / 1000).toFixed(2)} kg
                                            </Text>
                                        </>
                                    ) : sampleProgress?.stage === 'averaging' ? (
                                        <>
                                            <ActivityIndicator size="small" color={colors.primary} />
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 12, marginTop: 8, textAlign: 'center' }]}>
                                                {isPigMode ? 'Averaging...' : 'Averaging tray...'}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                                                ~{((sampleProgress.average ?? 0) / 1000).toFixed(2)} kg
                                            </Text>
                                        </>
                                    ) : sampleProgress?.stage === 'done' ? (
                                        <>
                                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28 }]}>
                                                {(((isPigMode ? sampleProgress.average : sampleProgress.perChick) ?? 0) / 1000).toFixed(2)}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>kg{!isPigMode ? ' / chick' : ''}</Text>
                                            <MaterialIcons name="sensors" size={14} color={colors.primary} style={{ marginTop: 4 }} />
                                        </>
                                    ) : liveWeightG != null ? (
                                        <>
                                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28 }]}>
                                                {(liveWeightG / 1000).toFixed(2)}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>kg</Text>
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
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Detected</Text>
                                    <Text style={[textStyles.h2, { color: colors.text }]}>{isPigMode ? 'Pig' : 'Chicken'}</Text>
                                </View>
                                <View style={[aniweighStyles.liveStatDivider, { backgroundColor: colors.stroke }]} />
                                <View style={aniweighStyles.liveStatItem}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Status</Text>
                                    <Text style={[textStyles.h2, {
                                        color: liveStatus === 'underweight' ? colors.warning
                                             : liveStatus === 'overweight'  ? colors.error
                                             : liveStatus === 'normal'      ? colors.primary
                                             : colors.textGrey
                                    }]}>
                                        {liveStatus ? (liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1)) : '—'}
                                    </Text>
                                </View>
                            </View>
                            {/* Running indicator — reflects devices.weighing_active, pushed by the
                                board immediately on Start/Stop/Reset rather than waiting on the
                                next periodic heartbeat. */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                marginTop: 20, alignSelf: 'center',
                                backgroundColor: deviceInfo?.weighingActive ? colors.primary + '15' : colors.cardFill,
                                borderWidth: 1, borderColor: deviceInfo?.weighingActive ? colors.primary + '40' : colors.stroke,
                                borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                            }}>
                                <View style={{
                                    width: 7, height: 7, borderRadius: 3.5,
                                    backgroundColor: deviceInfo?.weighingActive ? colors.primary : colors.textGrey,
                                }} />
                                <Text style={[textStyles.label, {
                                    fontSize: 12, fontWeight: '700',
                                    color: deviceInfo?.weighingActive ? colors.primary : colors.textGrey,
                                }]}>
                                    {deviceInfo?.weighingActive ? 'Running — weighing animals' : 'Idle — tap Start to begin'}
                                </Text>
                            </View>

                            {/* This run's progress — bumped automatically as each physical
                                reading comes in tagged to the active weighing session. */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                                <MaterialIcons name="checklist" size={14} color={colors.textGrey} />
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                    This run: {activeSession.completed_quantity}/{activeSession.expected_quantity} weighed
                                </Text>
                            </View>

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
                                        }}
                                        activeOpacity={0.8}
                                        onPress={handleStartDevice}
                                        disabled={isStarting}
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
                                        }}
                                        activeOpacity={0.75}
                                        onPress={() => openControlConfirm('stop')}
                                        disabled={isStopping}
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
                                        }}
                                        activeOpacity={0.75}
                                        onPress={handleTareDevice}
                                        disabled={isTaring}
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
                                        }}
                                        activeOpacity={0.75}
                                        onPress={() => openControlConfirm('reset')}
                                        disabled={isResetting}
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
                                <TouchableOpacity
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                        backgroundColor: colors.surface,
                                        borderWidth: 1.5, borderColor: colors.stroke,
                                        borderRadius: 9999, paddingVertical: 12,
                                        opacity: activeSession.completed_quantity === 0 ? 0.5 : 1,
                                    }}
                                    activeOpacity={activeSession.completed_quantity === 0 ? 1 : 0.75}
                                    onPress={() => {
                                        // STRICT: can't close out — and generate a report for — a
                                        // session where literally nothing was weighed. This is
                                        // exactly what previously produced an empty "no weight
                                        // recorded" report.
                                        if (activeSession.completed_quantity === 0) {
                                            showSnackbar('Weigh at least one animal before finishing this session.', 'error');
                                            return;
                                        }
                                        setFinishModalVisible(true);
                                    }}
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
                            weightLogs.slice(0, 3).map((log, index) => {
                                const statusColor = log.status === 'underweight' ? colors.warning : log.status === 'overweight' ? colors.error : colors.primary;
                                const statusIcon: any = log.status === 'underweight' ? 'arrow-downward' : log.status === 'overweight' ? 'arrow-upward' : 'check';
                                const kg = (log.weight_g / 1000).toFixed(2);
                                return (
                                    <View
                                        key={log.id ?? index}
                                        style={{
                                            backgroundColor: colors.surface,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: colors.stroke,
                                            marginBottom: 10,
                                            overflow: 'hidden',
                                            flexDirection: 'row',
                                        }}
                                    >
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
                                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>{kg}</Text>
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>kg</Text>
                                                </View>
                                            </View>

                                            {/* Bottom chips */}
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                                                    <AnimalIcon type={log.animal as any} size={11} color={colors.textGrey} />
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{log.animal}</Text>
                                                </View>
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
                message={activeSession ? `${activeSession.completed_quantity} of ${activeSession.expected_quantity} have been weighed so far. This closes out the run as a permanent historical record and takes you to its report. The next run will ask you to pick house/batch/animal type again.` : ''}
                confirmText="Finish"
                cancelText="Cancel"
                onConfirm={handleFinishSession}
                onCancel={() => setFinishModalVisible(false)}
                isLoading={isFinishingSession}
            />

            {/* Range settings modal */}
            <Modal visible={rangeSettingsVisible} transparent animationType="fade">
                <View style={[aniweighStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                    <View style={[aniweighStyles.modalContent, { backgroundColor: colors.surface, maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }]}>
                        <View style={[aniweighStyles.iconContainer, { backgroundColor: colors.primary + '1A' }]}>
                            <MaterialIcons name="tune" size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>
                            Weight Range ({isPigMode ? 'Pig' : 'Chicken'})
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 16 }]}>
                            Set weight thresholds for segregation status.
                        </Text>

                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[aniweighStyles.unitToggle, { backgroundColor: colors.bgLight, borderColor: colors.stroke, marginBottom: 24, alignSelf: 'center', position: 'relative', top: 0, right: 0 }]}
                            onPress={() => setTempRangeUnit(tempRangeUnit === 'kg' ? 'g' : 'kg')}
                        >
                            <Text style={[textStyles.label, { color: tempRangeUnit === 'kg' ? colors.primary : colors.textGrey, paddingHorizontal: 12, paddingVertical: 4 }]}>KG</Text>
                            <View style={{ width: 1, height: 16, backgroundColor: colors.stroke }} />
                            <Text style={[textStyles.label, { color: tempRangeUnit === 'g' ? colors.primary : colors.textGrey, paddingHorizontal: 12, paddingVertical: 4 }]}>GRAMS</Text>
                        </TouchableOpacity>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput label={`Underweight Max (${tempRangeUnit})`} icon="scale" value={tempUnderweight} onChangeText={setTempUnderweight} keyboardType="numeric" backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput label={`Overweight Min (${tempRangeUnit})`} icon="scale" value={tempOverweight} onChangeText={setTempOverweight} keyboardType="numeric" backgroundColor={colors.surface} />
                        </View>

                        <View style={[aniweighStyles.actionContainer, { width: '100%' }]}>
                            <TouchableOpacity style={[aniweighStyles.btn, { backgroundColor: colors.cardFill }]} onPress={() => setRangeSettingsVisible(false)} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[aniweighStyles.btn, { backgroundColor: colors.primary }]} onPress={handleSaveRanges} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
                    selectedValue={editTarget === 'Animal Type' ? animalType : housing}
                    enableSearch={editTarget === 'Housing'}
                />
            )}

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

                            <TouchableOpacity
                                onPress={() => setReminderModalVisible(false)}
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

                        {/* Responsive Scrollable Modal Body */}
                        <ScrollView
                            showsVerticalScrollIndicator={true}
                            bounces={true}
                            keyboardShouldPersistTaps="handled"
                            style={{ width: '100%', flexShrink: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 }}
                        >


                            {/* Mock Test Button (Moved Up to Top) */}
                            <TouchableOpacity
                                onPress={handleTestTrigger}
                                activeOpacity={0.7}
                                disabled={isTestingReminder}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    backgroundColor: colors.error + '10',
                                    borderWidth: 1.5,
                                    borderColor: colors.error + '40',
                                    borderRadius: 12,
                                    paddingVertical: 11,
                                    marginBottom: 16,
                                }}
                            >
                                {isTestingReminder ? (
                                    <ActivityIndicator size="small" color={colors.error} />
                                ) : (
                                    <>
                                        <MaterialIcons name="notifications-active" size={16} color={colors.error} />
                                        <Text style={[textStyles.h3, { color: colors.error, fontSize: 12.5, fontWeight: '700' }]}>
                                            Test Notification Now (Mock Trigger)
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

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
                            <Text style={{
                                fontFamily: 'Poppins-SemiBold',
                                fontSize: 11,
                                color: colors.textGrey,
                                marginBottom: 8,
                                textTransform: 'uppercase',
                                letterSpacing: 0.8,
                            }}>
                                PREFERRED ALERT TIME
                            </Text>
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
                                    onPress={() => setReminderModalVisible(false)}
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
                    </View>
                </View>
            </Modal>

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </SafeAreaView>
    );
}

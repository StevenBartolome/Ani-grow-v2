import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
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
import { AIInsightCard } from '@/components/AIInsightCard';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DeviceInfo {
    name: string;
    status: string;
    housingId: string | null;
    housingName: string;
    animalType: 'Pig' | 'Chicken';
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
    const { systemConfig, profile } = useAuth();
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
    const [farmHousings, setFarmHousings] = useState<{ id: string; name: string; animal_type: string }[]>([]);

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

    // Live reading (from Supabase Realtime / simulator)
    const [liveWeightG, setLiveWeightG] = useState<number | null>(null);
    const [liveStatus, setLiveStatus] = useState<'underweight' | 'normal' | 'overweight' | null>(null);
    const [liveFlash, setLiveFlash] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationTimeLeft, setSimulationTimeLeft] = useState(0);
    const [housingBatches, setHousingBatches] = useState<{ id: string; name: string; current_count: number; arrival_date: string; age_at_arrival_days: number }[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

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
                .gte('recorded_at', todayStart.toISOString());

            if (selectedBatchId) {
                todayStatsQuery = todayStatsQuery.eq('batch_id', selectedBatchId);
            } else {
                todayStatsQuery = todayStatsQuery.is('batch_id', null);
            }

            const [deviceResult, housingsResult, todayStatsResult] = await Promise.all([
                supabase
                    .from('devices')
                    .select('id, name, status, housing_id, housings(name, animal_type)')
                    .eq('id', deviceId)
                    .single(),
                supabase
                    .from('housings')
                    .select('id, name, animal_type')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active'),
                todayStatsQuery,
            ]);

            if (deviceResult.data) {
                const d = deviceResult.data as any;
                const info: DeviceInfo = {
                    name: d.name,
                    status: d.status,
                    housingId: d.housing_id ?? null,
                    housingName: d.housings?.name ?? 'Unassigned',
                    animalType: d.housings?.animal_type === 'pig' ? 'Pig' : 'Chicken',
                };

                if (!info.housingId) {
                    const tempType = await AsyncStorage.getItem(`temp_animal_type_${deviceId}`);
                    if (tempType === 'Pig' || tempType === 'Chicken') {
                        info.animalType = tempType;
                    }
                }

                setDeviceInfo(info);
                deviceInfoRef.current = info;   // keep ref in sync
                setIsConnected(d.status === 'online');

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

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); }, [fetchAll]);

    // ─── Realtime subscription — mirrors the IoT data stream ────────
    useEffect(() => {
        if (!deviceId) return;

        // Seed initial live value from most recent record for the selected batch
        let seedQuery = supabase
            .from('weigh_sessions')
            .select('net_weight_grams, status')
            .eq('device_id', deviceId)
            .order('recorded_at', { ascending: false })
            .limit(1);

        if (selectedBatchId) {
            seedQuery = seedQuery.eq('batch_id', selectedBatchId);
        } else {
            seedQuery = seedQuery.is('batch_id', null);
        }

        seedQuery
            .maybeSingle()
            .then(({ data }) => {
                if (data) {
                    setLiveWeightG((data as any).net_weight_grams);
                    setLiveStatus((data as any).status);
                } else {
                    setLiveWeightG(null);
                    setLiveStatus(null);
                }
            });

        const channel = supabase
            .channel(`aniweigh-live-${deviceId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'weigh_sessions', filter: `device_id=eq.${deviceId}` },
                (payload) => {
                    const row = payload.new as any;

                    // Only update and log if the incoming session matches the selected batch
                    if (row.batch_id !== selectedBatchId) return;

                    // 1. Update live-scale display immediately
                    setLiveWeightG(row.net_weight_grams);
                    setLiveStatus(row.status);
                    setLiveFlash(true);
                    setTimeout(() => setLiveFlash(false), 600);

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
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [deviceId, fetchStats, selectedBatchId]);

    // ─── Derived values ──────────────────────────────────────────
    const animalType = deviceInfo?.animalType ?? 'Chicken';
    const housing    = deviceInfo?.housingName ?? 'Unassigned';
    const animalColor = animalType === 'Pig' ? colors.pig : colors.chicken;
    const isPigMode = animalType === 'Pig';

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
        } catch (err) {
            console.error('[handleSaveRanges] error:', err);
            showSnackbar('Failed to save weight range.', 'error');
        }
    };

    // ─── Simulation handler ─────────────────────────────────────────
    const handleStartSimulation = async () => {
        if (!deviceInfo?.housingId || deviceInfo?.housingName === 'Unassigned') {
            showSnackbar('Please assign a housing to this device first.', 'error');
            return;
        }

        if (housingBatches.length > 0 && !selectedBatchId) {
            showSnackbar('Please select a batch first.', 'error');
            return;
        }

        if (housingBatches.length === 0) {
            showSnackbar('Please create an active batch in this housing first.', 'error');
            return;
        }

        setIsSimulating(true);
        setSimulationTimeLeft(5);

        // Count down 5 seconds
        const interval = setInterval(() => {
            setSimulationTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        setTimeout(async () => {
            try {
                const selectedBatch = housingBatches.find(b => b.id === selectedBatchId);
                const animalCount = selectedBatch && selectedBatch.current_count > 0 ? selectedBatch.current_count : 1;

                const underMax = threshold?.underweightMaxGrams ?? 800;
                const overMin = threshold?.overweightMinGrams ?? 1500;

                const payloads = [];

                for (let i = 0; i < animalCount; i++) {
                    const rand = Math.random();
                    let simulatedWeightG = 1150;
                    let status: 'underweight' | 'normal' | 'overweight' = 'normal';

                    if (rand < 0.2) {
                        simulatedWeightG = Math.round(underMax * 0.85);
                        status = 'underweight';
                    } else if (rand > 0.8) {
                        simulatedWeightG = Math.round(overMin * 1.15);
                        status = 'overweight';
                    } else {
                        simulatedWeightG = Math.round(underMax + (overMin - underMax) * (0.2 + Math.random() * 0.6));
                        status = 'normal';
                    }

                    // Spread timestamps by 1 second each to ensure ordered log list
                    const recordTime = new Date(Date.now() - (animalCount - 1 - i) * 1000).toISOString();

                    payloads.push({
                        device_id: deviceId,
                        farm_id: farmId,
                        batch_id: selectedBatchId,
                        weigh_mode: 'individual',
                        animal_type: animalType.toLowerCase() as 'chicken' | 'pig',
                        animal_count: 1,
                        gross_weight_grams: simulatedWeightG,
                        tare_weight_grams: 0,
                        net_weight_grams: simulatedWeightG,
                        avg_weight_grams: simulatedWeightG,
                        status: status,
                        conducted_by: profile?.uid || (profile as any)?.id || null,
                        recorded_at: recordTime,
                    });
                }

                const { error } = await supabase.from('weigh_sessions').insert(payloads);
                if (error) throw error;

                showSnackbar(`Successfully weighed all ${animalCount} livestock in "${selectedBatch?.name || 'Batch'}" individually!`, 'success');
            } catch (err: any) {
                console.error('[Simulation Error]:', err);
                showSnackbar('Simulation failed to log records.', 'error');
            } finally {
                setIsSimulating(false);
            }
        }, 5000);
    };


    // ─── Edit modal (Housing / Animal Type / Batch) ─────────────────────
    const openEditModal = (target: 'Animal Type' | 'Housing' | 'Batch') => {
        setEditTarget(target);
        setEditModalVisible(true);
    };

    const getEditOptions = (): string[] => {
        if (editTarget === 'Animal Type') return ['Pig', 'Chicken'];
        if (editTarget === 'Housing') {
            return farmHousings
                .filter(h => h.animal_type === animalType.toLowerCase())
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
                const selectedType = val as 'Pig' | 'Chicken';
                // Unassign housing when animal type changes — user must reassign manually
                await supabase.from('devices').update({ housing_id: null }).eq('id', deviceId);
                await AsyncStorage.setItem(`temp_animal_type_${deviceId}`, selectedType);
                setDeviceInfo(prev => {
                    const updated = prev ? { ...prev, housingId: null, housingName: 'Unassigned', animalType: selectedType } as DeviceInfo : null;
                    deviceInfoRef.current = updated;
                    return updated;
                });
                showSnackbar(`Animal type set to ${selectedType}. Please reassign a housing.`);
                setThreshold(null);
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
                                // Offline — go to connection setup
                                router.push(
                                    `/(devices)/AddDeviceScreen?existingDeviceId=${deviceId}&existingDeviceName=${encodeURIComponent(deviceInfo?.name ?? '')}&existingDeviceType=AniWeigh` as any
                                );
                            }
                        }}
                    >
                        <MaterialIcons name={isConnected ? 'cloud-done' : 'cloud-off'} size={20} color={isConnected ? colors.primary : colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[aniweighStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, marginRight: 8 }]}
                        onPress={() => router.push(`/(devices)/RecentLogsScreen?deviceId=${deviceId}&animalType=${animalType}` as any)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="history" size={20} color={colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[aniweighStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke }]}
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
            ) : (
                <ScrollView contentContainerStyle={aniweighStyles.contentContainer} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                    {/* Title Section */}
                    <View style={aniweighStyles.titleSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.smartScale + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                                <MaterialIcons name="monitor-weight" size={12} color={colors.smartScale} />
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
                                    <AnimalIcon type={animalType as any} size={14} color={animalColor} />
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

                    {/* Start Simulation Button */}
                    {(() => {
                        const canSimulate = !!deviceInfo?.housingId && deviceInfo?.housingName !== 'Unassigned' && !isSimulating;
                        return (
                            <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
                                <TouchableOpacity
                                    activeOpacity={canSimulate ? 0.8 : 1}
                                    disabled={!canSimulate}
                                    onPress={handleStartSimulation}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        paddingVertical: 13,
                                        borderRadius: 16,
                                        backgroundColor: isSimulating 
                                            ? colors.warning 
                                            : canSimulate 
                                            ? colors.secondary 
                                            : colors.cardFill,
                                        borderWidth: canSimulate || isSimulating ? 0 : 1,
                                        borderColor: colors.stroke,
                                        opacity: canSimulate || isSimulating ? 1 : 0.55,
                                    }}
                                >
                                    {isSimulating ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <MaterialIcons name="play-circle-filled" size={20} color={canSimulate ? (colors.onPrimary ?? '#fff') : colors.textGrey} />
                                    )}
                                    <Text style={[textStyles.btnLabel, { color: canSimulate || isSimulating ? (colors.onPrimary ?? '#fff') : colors.textGrey, fontSize: 14 }]}>
                                        {isSimulating 
                                            ? `Weighing Livestock... (${simulationTimeLeft}s)` 
                                            : 'Start Simulation'
                                        }
                                    </Text>
                                </TouchableOpacity>
                                {!canSimulate && !isSimulating && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, textAlign: 'center', marginTop: 6 }]}>
                                        Assign an animal type and housing to enable simulation.
                                    </Text>
                                )}
                            </View>
                        );
                    })()}

                    {/* Segregation Stats */}
                    <View style={[aniweighStyles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
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

                    {/* AI Weight Analysis */}
                    <AIInsightCard
                        title="AI Weight Analysis"
                        context={{
                            type: 'weight',
                            animalType: animalType,
                            housingName: housing,
                            data: {
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

                    {/* Live Scaling (IoT placeholder) */}
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
                                    borderColor: liveWeightG != null
                                        ? (liveStatus === 'underweight' ? colors.warning : liveStatus === 'overweight' ? colors.error : colors.primary)
                                        : colors.stroke,
                                    backgroundColor: liveFlash ? (colors.primary + '15') : 'transparent',
                                }]}>
                                    {liveWeightG != null ? (
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

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </SafeAreaView>
    );
}

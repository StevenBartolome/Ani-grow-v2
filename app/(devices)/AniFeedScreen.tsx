import { MaterialIcons } from '@expo/vector-icons';
import FeedScheduleModal, { getNextDispenseInfo } from '@/components/FeedScheduleModal';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Modal, Platform, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
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
    feedLevel: 'low' | 'mid' | 'high' | null;
    lastIp: string | null;
}

interface FeedScheduleInfo {
    id: string | null;
    timesPerDay: number;
    gramsPerDispense: number;
    feedId: string | null;
    batchId?: string | null;
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
    batchName?: string | null;
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

export default function AniFeedScreen() {
    const { systemConfig, profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const anifeedStyles = useAniFeedStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const router = useRouter();
    const params = useLocalSearchParams<{ deviceId?: string; status?: string }>();
    const deviceId = params.deviceId ?? '';
    const initialStatus = params.status;

    if (systemConfig?.featureFlags && !systemConfig.featureFlags.feedingEnabled) {
        return (
            <View style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
                <MaterialIcons name="block" size={64} color={colors.textGrey} />
                <Text style={[textStyles.h2, { color: colors.text, marginTop: 20 }]}>Feeding Module Disabled</Text>
                <Text style={[textStyles.body, { textAlign: 'center', marginTop: 10, color: colors.textGrey, paddingHorizontal: 40 }]}>
                    This feature is currently disabled by the system administrator.
                </Text>
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(devices)/DevicesScreen' as any)} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </View>
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
    const [housingBatches, setHousingBatches] = useState<{ id: string; name: string; current_count: number; arrival_date: string; age_at_arrival_days: number }[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

    // Live per-sensor test — two sources feeding the same display:
    // 1. liveSensorsLan — polled directly over LAN every 1.5s, near-instant
    //    but only reachable when the phone shares WiFi with the board.
    // 2. cloudSensors — pushed by the board to Supabase the instant a sensor
    //    changes (see anifeed.ino's loop()), delivered here via Realtime —
    //    works from anywhere with internet, usually within a second or two.
    // LAN wins when available (freshest); cloud is the fallback so this
    // still works off-network. `null` on both = no reading has ever arrived.
    const [liveSensorsLan, setLiveSensorsLan] = useState<{ low: boolean; mid: boolean; high: boolean } | null>(null);
    const [cloudSensors, setCloudSensors] = useState<{ low: boolean; mid: boolean; high: boolean } | null>(null);
    const liveSensors = liveSensorsLan ?? cloudSensors;
    const liveSensorsSource: 'lan' | 'cloud' | null = liveSensorsLan ? 'lan' : cloudSensors ? 'cloud' : null;

    // Feed details & Feed Schedule modals
    const [feedDetailsModalVisible, setFeedDetailsModalVisible] = useState(false);
    const [feedScheduleModalVisible, setFeedScheduleModalVisible] = useState(false);

    // Edit field modal (Housing, Brand, AnimalType, Batch)
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Housing' | 'Brand' | 'AnimalType' | 'Batch' | null>(null);

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

    const [isResettingFeeder, setIsResettingFeeder] = useState(false);

    const handleResetFeederActuator = async () => {
        setIsResettingFeeder(true);
        try {
            if (deviceInfo?.lastIp) {
                const res = await fetch(`http://${deviceInfo.lastIp}/feeder?reset=true`, { method: 'GET' }).catch(() => null);
                if (res && res.ok) {
                    showSnackbar('Feeder actuator reset initiated (closing mechanism)', 'success');
                } else {
                    showSnackbar('Actuator reset sent to GoldenWeigh', 'info');
                }
            } else {
                showSnackbar('Feeder reset command queued', 'info');
            }
        } catch {
            showSnackbar('Actuator reset initiated', 'info');
        } finally {
            setTimeout(() => setIsResettingFeeder(false), 2000);
        }
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
                    .select('id, name, unique_code, status, last_seen, housing_id, farm_id, feed_level, last_ip, sensor_low, sensor_mid, sensor_high, housings(name, animal_type)')
                    .eq('id', deviceId as string)
                    .single(),
                supabase
                    .from('feed_schedules')
                    .select('id, times_per_day, grams_per_dispense, feed_id, batch_id, dispense_times, feeds(name, brand, stock_kg, expiry_date)')
                    .eq('device_id', deviceId as string)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('dispense_records')
                    .select('id, grams_dispensed, status, dispensed_at, housing_id, batch_id, housings(name), batches(name)')
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

            let activeHousingId: string | null = null;

            if (deviceResult.data) {
                const d = deviceResult.data as any;
                if (d.unique_code) setDeviceUniqueCode(d.unique_code);
                activeHousingId = d.housing_id ?? null;
                const info: DeviceInfo = {
                    name: d.name,
                    status: d.status,
                    lastSeen: d.last_seen ?? null,
                    housingId: activeHousingId,
                    housingName: d.housings?.name ?? 'Unassigned',
                    animalType: d.housings?.animal_type === 'pig' ? 'Pig' : 'Chicken',
                    farmId: d.farm_id ?? null,
                    feedLevel: d.feed_level ?? null,
                    lastIp: d.last_ip ?? null,
                };

                if (!info.housingId) {
                    const tempType = await AsyncStorage.getItem(`temp_animal_type_${deviceId}`);
                    if (tempType === 'Pig' || tempType === 'Chicken') {
                        info.animalType = tempType;
                    }
                }

                setDeviceInfo(info);
                if (d.sensor_low !== null && d.sensor_mid !== null && d.sensor_high !== null) {
                    setCloudSensors({ low: !!d.sensor_low, mid: !!d.sensor_mid, high: !!d.sensor_high });
                }
                // Check if any GoldenWeigh (AniWeigh) device on this farm is online
                const { data: weighDevices } = await supabase
                    .from('devices')
                    .select('status, last_seen')
                    .eq('farm_id', farmId)
                    .eq('type', 'aniweigh');

                const isGoldenWeighOnline = (weighDevices ?? []).some(
                    (w: any) => getDeviceDisplayStatus(w.status, w.last_seen) === 'online'
                );

                setIsConnected(isGoldenWeighOnline || getDeviceDisplayStatus(info.status, info.lastSeen) === 'online');
            }

            if (scheduleResult.data) {
                const s = scheduleResult.data as any;
                const wholeFeedName = s.feeds ? (s.feeds.brand ? `${s.feeds.name} (${s.feeds.brand})` : s.feeds.name) : 'Not set';
                setSchedule({
                    id: s.id,
                    timesPerDay: s.times_per_day,
                    gramsPerDispense: s.grams_per_dispense,
                    feedId: s.feed_id ?? null,
                    batchId: s.batch_id ?? null,
                    feedBrand: wholeFeedName,
                    dispenseTimes: s.dispense_times ?? ['08:00', '12:00', '18:00'],
                    feedStockKg: s.feeds?.stock_kg ?? null,
                    feedExpiryDate: s.feeds?.expiry_date ?? null,
                });
            }

            // Fetch active batches for this housing if assigned
            if (activeHousingId) {
                const { data: batchesData } = await supabase
                    .from('batches')
                    .select('id, name, current_count, arrival_date, age_at_arrival_days')
                    .eq('housing_id', activeHousingId)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false });

                if (batchesData && batchesData.length > 0) {
                    const bList = batchesData as any[];
                    setHousingBatches(bList);
                    const schedBatchId = (scheduleResult.data as any)?.batch_id;
                    setSelectedBatchId(prev => {
                        if (schedBatchId && bList.some(b => b.id === schedBatchId)) {
                            return schedBatchId;
                        }
                        const stillExists = bList.some(b => b.id === prev);
                        return stillExists ? prev : bList[0].id;
                    });
                } else {
                    setHousingBatches([]);
                    setSelectedBatchId(null);
                }
            } else {
                setHousingBatches([]);
                setSelectedBatchId(null);
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
                    batchName: (r.batches as any)?.name ?? null,
                }));
                setDispenseLogs(mapped);
                setLastDispensed(`${formatLogTime(mapped[0].timestamp)} (${mapped[0].amount})`);
            } else {
                setDispenseLogs([]);
                setLastDispensed(null);
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

    // Live per-sensor polling — every 1.5s over LAN, independent of the
    // cloud heartbeat, so testing by hand shows an immediate response.
    // Naturally goes back to null (shown as "not reachable") the moment the
    // phone isn't on the same network as the board — same tradeoff as
    // AniWeighScreen's other LAN-only live features.
    const deviceLastIp = deviceInfo?.lastIp ?? null;
    useEffect(() => {
        if (!deviceUniqueCode) return;
        let cancelled = false;

        const poll = async () => {
            // The device's last-reported real LAN IP (from its Supabase
            // heartbeat) goes first — Android's fetch has no mDNS resolver,
            // so ".local" never resolves there (confirmed: the same request
            // works fine by IP directly but times out via the .local name),
            // while it's a nice-to-have fallback on iOS, which does support it.
            const urls = [
                ...(deviceLastIp ? [`http://${deviceLastIp}/sensors`] : []),
                `http://anigrow-${deviceUniqueCode}.local/sensors`,
                `http://192.168.4.1/sensors`,
            ];
            for (const url of urls) {
                try {
                    const res = await Promise.race([
                        fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } }),
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500)),
                    ]);
                    if (res.ok) {
                        const data = await res.json();
                        if (!cancelled) setLiveSensorsLan({ low: !!data.low, mid: !!data.mid, high: !!data.high });
                        return;
                    }
                } catch { /* try the next URL, or give up this cycle */ }
            }
            // Only clears the LAN reading — cloudSensors (Realtime) is left
            // alone, so the display falls back to it instead of going blank.
            if (!cancelled) setLiveSensorsLan(null);
        };

        poll();
        const interval = setInterval(poll, 1500);
        return () => { cancelled = true; clearInterval(interval); };
    }, [deviceUniqueCode, deviceLastIp]);

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
            // The board pushes sensor_low/mid/high the instant one changes
            // (see anifeed.ino) — this is what lets the LIVE TEST section
            // work even when the phone isn't on the board's WiFi.
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId}` },
                (payload) => {
                    const row = payload.new as any;
                    if (row.sensor_low !== null && row.sensor_mid !== null && row.sensor_high !== null) {
                        setCloudSensors({ low: !!row.sensor_low, mid: !!row.sensor_mid, high: !!row.sensor_high });
                    }
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

    // ─── Edit modal ───────────────────────────────────────────────
    const openEditModal = (target: 'Housing' | 'Brand' | 'AnimalType' | 'Batch') => {
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
        if (editTarget === 'Batch') {
            return housingBatches.map(b => b.name);
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
                setHousingBatches([]);
                setSelectedBatchId(null);
                showSnackbar(`Animal type set to ${selectedType}. Please reassign a housing.`);
            } else if (editTarget === 'Housing') {
                const h = farmHousings.find(h => h.name === val);
                if (!h) return;
                await supabase.from('devices').update({ housing_id: h.id }).eq('id', deviceId as string);
                await AsyncStorage.removeItem(`temp_animal_type_${deviceId}`);
                setDeviceInfo(prev => prev ? { ...prev, housingId: h.id, housingName: h.name, animalType: h.animal_type === 'pig' ? 'Pig' : 'Chicken' } : null);

                // Fetch batches for newly assigned housing
                const { data: batchesData } = await supabase
                    .from('batches')
                    .select('id, name, current_count, arrival_date, age_at_arrival_days')
                    .eq('housing_id', h.id)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false });

                if (batchesData && batchesData.length > 0) {
                    const bList = batchesData as any[];
                    setHousingBatches(bList);
                    const nextBatchId = bList[0].id;
                    setSelectedBatchId(nextBatchId);
                    if (schedule?.id) {
                        await supabase.from('feed_schedules').update({ housing_id: h.id, batch_id: nextBatchId }).eq('id', schedule.id);
                        setSchedule(prev => prev ? { ...prev, batchId: nextBatchId } : null);
                    }
                } else {
                    setHousingBatches([]);
                    setSelectedBatchId(null);
                    if (schedule?.id) {
                        await supabase.from('feed_schedules').update({ housing_id: h.id, batch_id: null }).eq('id', schedule.id);
                        setSchedule(prev => prev ? { ...prev, batchId: null } : null);
                    }
                }
                showSnackbar('Housing updated.');
            } else if (editTarget === 'Batch') {
                const selected = housingBatches.find(b => b.name === val);
                if (selected) {
                    setSelectedBatchId(selected.id);
                    if (schedule?.id) {
                        await supabase.from('feed_schedules').update({ batch_id: selected.id }).eq('id', schedule.id);
                        setSchedule(prev => prev ? { ...prev, batchId: selected.id } : null);
                    }
                    showSnackbar(`Feeding batch set to "${selected.name}".`);
                }
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
                        housing_id: deviceInfo?.housingId ?? null,
                        batch_id: selectedBatchId ?? null,
                        animal_type: animalType.toLowerCase(),
                        feed_id: f.id,
                        times_per_day: 3, // default
                        grams_per_dispense: 1500, // default — 1 dispense cycle (1.5 kg fixed unit)
                        dispense_times: ['08:00', '12:00', '18:00'], // default
                        adjusted_at: new Date().toISOString(),
                    };
                    const { data, error } = await supabase.from('feed_schedules').insert(payload).select('id').single();
                    if (error) throw error;
                    setSchedule({
                        id: (data as any)?.id ?? null,
                        timesPerDay: 3,
                        gramsPerDispense: 1500,
                        feedId: f.id,
                        batchId: selectedBatchId ?? null,
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
        <View style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
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
                                {deviceInfo?.housingId && (
                                    <TouchableOpacity
                                        style={[anifeedStyles.tag, { backgroundColor: colors.warning + '1A', paddingRight: 6 }]}
                                        onPress={() => openEditModal('Batch')}
                                    >
                                        <MaterialIcons name="layers" size={14} color={colors.warning} />
                                        <Text style={[textStyles.label, { color: colors.warning, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>
                                            {housingBatches.find(b => b.id === selectedBatchId)?.name ?? (housingBatches.length > 0 ? 'Select Batch' : 'No Batch')}
                                        </Text>
                                        <MaterialIcons name="arrow-drop-down" size={16} color={colors.warning} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Hopper Level (Live per-sensor indicators) */}
                    <View style={{ width: '100%', marginBottom: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, letterSpacing: 0.5 }]}>
                                HOPPER LEVEL
                            </Text>
                            {liveSensorsSource && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 10 }]}>
                                        {liveSensorsSource === 'lan' ? 'Live (LAN)' : 'Live (Cloud)'}
                                    </Text>
                                </View>
                            )}
                        </View>
                        {liveSensors ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {(() => {
                                    const activeKey = liveSensors.high ? 'high' : liveSensors.mid ? 'mid' : liveSensors.low ? 'low' : null;
                                    return ([['low', 'Low'], ['mid', 'Mid'], ['high', 'High']] as const).map(([key, label]) => {
                                        const isLit = activeKey === key;
                                        return (
                                            <View
                                                key={key}
                                                style={{
                                                    flex: 1,
                                                    alignItems: 'center',
                                                    paddingVertical: 10,
                                                    borderRadius: 10,
                                                    backgroundColor: isLit ? colors.primary + '1A' : colors.cardFill,
                                                    borderWidth: 1.5,
                                                    borderColor: isLit ? colors.primary : colors.stroke,
                                                }}
                                            >
                                                <MaterialIcons
                                                    name={isLit ? 'sensors' : 'sensors-off'}
                                                    size={18}
                                                    color={isLit ? colors.primary : colors.textGrey}
                                                />
                                                <Text style={[textStyles.label, { color: isLit ? colors.primary : colors.textGrey, fontSize: 11, fontWeight: isLit ? '700' : '500', marginTop: 3 }]}>
                                                    {label}
                                                </Text>
                                            </View>
                                        );
                                    });
                                })()}
                            </View>
                        ) : (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                No live reading yet — waiting for the feeder's first report.
                            </Text>
                        )}
                    </View>


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
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: colors.primary + '1A',
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 10,
                                    gap: 4,
                                }}
                                onPress={() => setFeedScheduleModalVisible(true)}
                            >
                                <MaterialIcons name="edit" size={15} color={colors.primary} />
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 12, fontWeight: '700' }]}>
                                    {schedule ? 'Edit' : 'Set Up'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {schedule && schedule.dispenseTimes.length > 0 && (() => {
                            const next = getNextDispenseInfo(schedule.dispenseTimes);
                            if (!next) return null;
                            return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary + '12', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 }}>
                                    <MaterialIcons name="schedule" size={16} color={colors.primary} />
                                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 12, fontWeight: '600' }]}>
                                        Next dispense: {next.dayLabel} at {next.time12}
                                    </Text>
                                </View>
                            );
                        })()}

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
                        subKey={deviceId ? `${deviceId}_${selectedBatchId || (schedule as any)?.batch_id || deviceInfo?.housingId || 'general'}_${(deviceInfo?.animalType || 'general').toLowerCase()}` : ''}
                        context={{
                            type: 'feed',
                            animalType: deviceInfo?.animalType ?? 'livestock',
                            housingName: deviceInfo?.housingName ?? '',
                            data: {
                                deviceId,
                                batchId: selectedBatchId || (schedule as any)?.batch_id || null,
                                batchName: housingBatches.find(b => b.id === (selectedBatchId || (schedule as any)?.batch_id))?.name ?? null,
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
                                    batchName: l.batchName ?? null,
                                })),
                            },
                        }}
                    />

                    {/* Recent Logs */}
                    <View style={anifeedStyles.logsSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 18 }]}>Recent Logs</Text>
                            {deviceInfo?.name ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.secondary + '14', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                    <AniFeedIcon size={12} />
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.secondary }}>
                                        {deviceInfo.name}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
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
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 5 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                            <MaterialIcons name="home" size={13} color={colors.textGrey} />
                                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginLeft: 3 }]} numberOfLines={1}>{log.housingName}</Text>
                                                        </View>
                                                        {log.batchName ? (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.warning + '18', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                                                                <MaterialIcons name="layers" size={11} color={colors.warning} />
                                                                <Text style={[textStyles.label, { color: colors.warning, fontSize: 11, marginLeft: 3, fontWeight: '600' }]} numberOfLines={1}>{log.batchName}</Text>
                                                            </View>
                                                        ) : null}
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

            {/* Edit Housing / Brand / AnimalType / Batch modal */}
            {editTarget && (
                <SelectionModal
                    visible={editModalVisible}
                    onClose={() => setEditModalVisible(false)}
                    onSelect={handleEditConfirm}
                    title={
                        editTarget === 'AnimalType' ? 'Animal Type'
                        : editTarget === 'Brand' ? 'Select Feed'
                        : editTarget === 'Batch' ? 'Select Batch'
                        : `Edit ${editTarget}`
                    }
                    description={
                        editTarget === 'AnimalType'
                            ? 'Select the animal type for this feeder.'
                            : editTarget === 'Brand'
                            ? `Showing feeds registered for ${animalType}s only.`
                            : editTarget === 'Batch'
                            ? `Select the active batch in ${housing} to receive dispensed feed.`
                            : `Select a new ${editTarget.toLowerCase()} for this device.`
                    }
                    icon={editTarget === 'Batch' ? 'layers' : editTarget === 'Housing' ? 'home' : 'edit'}
                    options={getEditOptions()}
                    selectedValue={
                        editTarget === 'Housing' ? housing
                        : editTarget === 'AnimalType' ? animalType
                        : editTarget === 'Batch' ? (housingBatches.find(b => b.id === selectedBatchId)?.name ?? '')
                        : brand
                    }
                    enableSearch={editTarget !== 'AnimalType' && editTarget !== 'Batch'}
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
            {/* Feed Schedule Modal */}
            <FeedScheduleModal
                visible={feedScheduleModalVisible}
                onClose={() => setFeedScheduleModalVisible(false)}
                deviceId={deviceId}
                farmId={farmId}
                animalType={animalType as any}
                showSnackbar={showSnackbar}
                onSaved={fetchAll}
            />
        </View>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    AppState,
    AppStateStatus,
    Easing,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useHomeStyles } from '@/styles/homeStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { AnimalIcon } from '@/components/AnimalIcon';
import { AniFeedIcon } from '@/components/AniFeedIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { Header } from '@/components/Header';
import { supabase } from '@/lib/supabase';
import { categoryPriority } from '@/lib/notify';
import { isDeviceOnline } from '@/lib/deviceStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertNotif {
    id: string;
    title: string;
    message: string;
    type: 'alert' | 'warning' | 'info' | 'success';
    category: string | null;
    created_at?: string;
}

interface HousingCard {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    capacity: number;
    current_count: number;
}

interface FarmBreakdown {
    farmId: string;
    farmName: string;
    pigs: number;
    chickens: number;
}

interface HomeCacheData {
    farmName: string;
    farmBreakdown: FarmBreakdown[];
    totalAnimals: number;
    animalSplit: { pigs: number; chickens: number };
    housings: HousingCard[];
    unreadNotifCount: number;
    recentAlerts: AlertNotif[];
    activeFeeders: { online: number; total: number };
    activeScales: { online: number; total: number };
    todayFeedGrams: number;
    todayWeighSessions: number;
    weekMortality: number;
    lastUpdated: Date | null;
}

// Global in-memory cache for ultra-smooth tab switching & instant loads
const homeDataCache: Record<string, HomeCacheData> = {};

// ─── Animated Skeleton ────────────────────────────────────────────────────────

function Skeleton({ w, h, radius = 8, style }: { w: number | string; h: number; radius?: number; style?: any }) {
    const { colors } = useTheme();
    const opacity = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.85,
                    duration: 750,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.4,
                    duration: 750,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                {
                    width: w as any,
                    height: h,
                    borderRadius: radius,
                    backgroundColor: colors.cardFill,
                    opacity,
                },
                style,
            ]}
        />
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALERT_PRIORITY: Record<AlertNotif['type'], number> = { alert: 0, warning: 1, info: 2, success: 3 };

function mapNotifType(type: string): AlertNotif['type'] {
    if (type === 'error') return 'alert';
    if (type === 'warning' || type === 'success' || type === 'info') return type as AlertNotif['type'];
    return 'info';
}

const ALERT_CATEGORY_LABEL: Record<string, string> = {
    weight_alert: 'AniWeigh Telemetry',
    device_alert: 'Device Hardware',
    feed_alert: 'AniFeed Dispenser',
    health_alert: 'Herd Health',
    farm_registered: 'Farm Setup',
    system: 'System Alert',
    invite: 'Staff Invitation',
    ai_suggestion: 'AI Insight',
};

function formatAlertCategory(category: string | null | undefined): string {
    if (!category) return 'General Alert';
    if (ALERT_CATEGORY_LABEL[category]) return ALERT_CATEGORY_LABEL[category];
    return category.replace(/_alert$/i, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function occupancyColor(pct: number, colors: any): string {
    if (pct >= 90) return colors.error;
    if (pct >= 70) return colors.warning;
    return '#10B981'; // vibrant emerald
}

function formatGrams(g: number): string {
    if (g >= 1000) return `${(g / 1000).toFixed(1)} kg`;
    return `${g} g`;
}

function timeAgo(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { profile, hasPermission, refreshProfile, role } = useAuth();
    const homeStyles = useHomeStyles();
    const textStyles = useTextStyles();
    const { colors, isDark } = useTheme();
    const router = useRouter();

    const userId = (profile as any)?.uid || (profile as any)?.id;
    const userName = (profile as any)?.first_name
        ? `${(profile as any).first_name} ${(profile as any).last_name ?? ''}`.trim()
        : (profile as any)?.displayName || 'User';

    // ── Multi-farm filter ─────────────────────────────────────────────────────
    const {
        activeFarmIds,
        managedFarms,
        isMultiFarm,
    } = useFarmFilter();

    const cacheKey = useMemo(() => {
        return activeFarmIds.slice().sort().join(',') || 'default';
    }, [activeFarmIds]);

    const initialFarmName = useMemo(() => {
        if (!activeFarmIds.length) return '';
        if (activeFarmIds.length === 1) {
            return managedFarms.find(f => f.id === activeFarmIds[0])?.name || '';
        }
        return `${activeFarmIds.length} Farms`;
    }, [activeFarmIds, managedFarms]);

    // Check existing cached snapshot
    const cachedData = homeDataCache[cacheKey];

    // ── State ─────────────────────────────────────────────────────────────────
    const [farmName, setFarmName] = useState(cachedData?.farmName ?? initialFarmName);
    const [farmBreakdown, setFarmBreakdown] = useState<FarmBreakdown[]>(cachedData?.farmBreakdown ?? []);
    const [totalAnimals, setTotalAnimals] = useState(cachedData?.totalAnimals ?? 0);
    const [animalSplit, setAnimalSplit] = useState(cachedData?.animalSplit ?? { pigs: 0, chickens: 0 });
    const [housings, setHousings] = useState<HousingCard[]>(cachedData?.housings ?? []);
    const [unreadNotifCount, setUnreadNotifCount] = useState(cachedData?.unreadNotifCount ?? 0);
    const [recentAlerts, setRecentAlerts] = useState<AlertNotif[]>(cachedData?.recentAlerts ?? []);
    const [activeFeeders, setActiveFeeders] = useState(cachedData?.activeFeeders ?? { online: 0, total: 0 });
    const [activeScales, setActiveScales] = useState(cachedData?.activeScales ?? { online: 0, total: 0 });
    const [todayFeedGrams, setTodayFeedGrams] = useState(cachedData?.todayFeedGrams ?? 0);
    const [todayWeighSessions, setTodayWeighSessions] = useState(cachedData?.todayWeighSessions ?? 0);
    const [weekMortality, setWeekMortality] = useState(cachedData?.weekMortality ?? 0);
    const [isLoading, setIsLoading] = useState(!cachedData);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(cachedData?.lastUpdated ?? null);

    useEffect(() => {
        if (initialFarmName && !cachedData?.farmName) {
            setFarmName(initialFarmName);
        }
    }, [initialFarmName, cachedData?.farmName]);

    // Handle farm filter switch smoothly using cache
    useEffect(() => {
        const cached = homeDataCache[cacheKey];
        if (cached) {
            setFarmName(cached.farmName);
            setFarmBreakdown(cached.farmBreakdown);
            setTotalAnimals(cached.totalAnimals);
            setAnimalSplit(cached.animalSplit);
            setHousings(cached.housings);
            setUnreadNotifCount(cached.unreadNotifCount);
            setRecentAlerts(cached.recentAlerts);
            setActiveFeeders(cached.activeFeeders);
            setActiveScales(cached.activeScales);
            setTodayFeedGrams(cached.todayFeedGrams);
            setTodayWeighSessions(cached.todayWeighSessions);
            setWeekMortality(cached.weekMortality);
            setLastUpdated(cached.lastUpdated);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }
    }, [cacheKey]);

    // ── Dynamic Fetch (Silent background or full refresh) ─────────────────────
    const fetchStats = useCallback(async (isManualRefresh = false) => {
        if (!activeFarmIds.length) { setIsLoading(false); return; }
        if (isManualRefresh) {
            setRefreshing(true);
        } else if (!homeDataCache[cacheKey]) {
            setIsLoading(true);
        }
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayISO = todayStart.toISOString();
            const sevenDaysAgo = new Date(todayStart);
            sevenDaysAgo.setDate(todayStart.getDate() - 7);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

            // ── Round 1: core data ────────────────────────────────────────────
            const isSingle = activeFarmIds.length === 1;

            const [farmRes, batchRes, notifRes, deviceRes, housingRes] = await Promise.all([
                // Farm name(s)
                isSingle
                    ? supabase.from('farms').select('name').eq('id', activeFarmIds[0]).single()
                    : supabase.from('farms').select('id, name').in('id', activeFarmIds),
                // Batches
                supabase
                    .from('batches')
                    .select('id, current_count, animal_type, housings!inner(farm_id, farms(id, name))')
                    .in('housings.farm_id', activeFarmIds)
                    .eq('status', 'active'),
                // Notifications with exact count
                supabase
                    .from('notifications')
                    .select('id, title, message, type, category, is_read, created_at', { count: 'exact' })
                    .in('farm_id', activeFarmIds)
                    .eq('is_read', false)
                    .order('created_at', { ascending: false })
                    .limit(20),
                // Devices (query live status + last_seen heartbeat)
                supabase.from('devices').select('id, type, status, last_seen').in('farm_id', activeFarmIds),
                // Housings
                supabase
                    .from('housings')
                    .select('id, name, animal_type, capacity, current_count, farm_id')
                    .in('farm_id', activeFarmIds)
                    .eq('status', 'Active')
                    .order('name'),
            ]);

            let nextFarmName = farmName;
            if (isSingle && (farmRes as any).data?.name) {
                nextFarmName = (farmRes as any).data.name;
                setFarmName(nextFarmName);
            } else if (!isSingle && managedFarms.length > 0) {
                nextFarmName = `${activeFarmIds.length} Farms`;
                setFarmName(nextFarmName);
            }

            let feederIds: string[] = [];
            let scaleIds: string[] = [];
            let allBatchIds: string[] = [];
            let nextTotalAnimals = 0;
            let nextAnimalSplit = { pigs: 0, chickens: 0 };
            let nextFarmBreakdown: FarmBreakdown[] = [];

            if (batchRes.data) {
                const total = batchRes.data.reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
                nextTotalAnimals = total;
                setTotalAnimals(total);
                allBatchIds = batchRes.data.map((b: any) => b.id);

                const pigs = batchRes.data
                    .filter((b: any) => b.animal_type === 'pig')
                    .reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
                nextAnimalSplit = { pigs, chickens: total - pigs };
                setAnimalSplit(nextAnimalSplit);

                // Per-farm breakdown
                if (isMultiFarm) {
                    nextFarmBreakdown = activeFarmIds.map(fid => {
                        const farmBatches = batchRes.data!.filter(
                            (b: any) => b.housings?.farm_id === fid
                        );
                        const fName =
                            (farmBatches[0] as any)?.housings?.farms?.name ||
                            managedFarms.find(f => f.id === fid)?.name || fid;
                        const fp = farmBatches
                            .filter((b: any) => b.animal_type === 'pig')
                            .reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
                        const fc = farmBatches
                            .filter((b: any) => b.animal_type === 'chicken')
                            .reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
                        return { farmId: fid, farmName: fName, pigs: fp, chickens: fc };
                    });
                    setFarmBreakdown(nextFarmBreakdown);
                } else {
                    nextFarmBreakdown = [];
                    setFarmBreakdown([]);
                }
            }

            let nextUnreadNotifCount = 0;
            let nextRecentAlerts: AlertNotif[] = [];
            if (notifRes.data) {
                const totalCount = notifRes.count ?? notifRes.data.length;
                nextUnreadNotifCount = totalCount;
                setUnreadNotifCount(totalCount);
                nextRecentAlerts = notifRes.data.map((n: any) => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    type: mapNotifType(n.type),
                    category: n.category,
                    created_at: n.created_at,
                }));
                setRecentAlerts(nextRecentAlerts);
            }

            let nextActiveFeeders = { online: 0, total: 0 };
            let nextActiveScales = { online: 0, total: 0 };
            if (deviceRes.data) {
                const feeders = deviceRes.data.filter((d: any) => d.type === 'anifeed' || d.type === 'feeder');
                const scales = deviceRes.data.filter((d: any) => d.type === 'aniweigh' || d.type === 'scale');
                feederIds = feeders.map((d: any) => d.id);
                scaleIds = scales.map((d: any) => d.id);
                const isDevOnline = (d: any) => isDeviceOnline(d.status, d.last_seen);
                nextActiveFeeders = { online: feeders.filter(isDevOnline).length, total: feeders.length };
                nextActiveScales = { online: scales.filter(isDevOnline).length, total: scales.length };
                setActiveFeeders(nextActiveFeeders);
                setActiveScales(nextActiveScales);
            }

            let nextHousings: HousingCard[] = [];
            if (housingRes.data) {
                nextHousings = housingRes.data as HousingCard[];
                setHousings(nextHousings);
            }

            // ── Round 2: activity data ─────────────────────────────────────────
            const [feedRes, weightRes, mortalityRes] = await Promise.all([
                feederIds.length > 0
                    ? supabase.from('dispense_records').select('grams_dispensed').in('device_id', feederIds).gte('dispensed_at', todayISO).eq('status', 'success')
                    : { data: [] },
                scaleIds.length > 0
                    ? supabase.from('weigh_sessions').select('id').in('device_id', scaleIds).gte('recorded_at', todayISO)
                    : { data: [] },
                allBatchIds.length > 0
                    ? supabase.from('health_records').select('affected_count').in('batch_id', allBatchIds).eq('record_type', 'mortality').gte('record_date', sevenDaysAgoStr).is('deleted_at', null)
                    : { data: [] },
            ]);

            let nextTodayFeedGrams = 0;
            if (feedRes.data) {
                nextTodayFeedGrams = feedRes.data.reduce((s: number, r: any) => s + (r.grams_dispensed ?? 0), 0);
                setTodayFeedGrams(nextTodayFeedGrams);
            }

            let nextTodayWeighSessions = 0;
            if (weightRes.data) {
                nextTodayWeighSessions = weightRes.data.length;
                setTodayWeighSessions(nextTodayWeighSessions);
            }

            let nextWeekMortality = 0;
            if (mortalityRes.data) {
                nextWeekMortality = mortalityRes.data.reduce((s: number, r: any) => s + (r.affected_count ?? 0), 0);
                setWeekMortality(nextWeekMortality);
            }

            const now = new Date();
            setLastUpdated(now);

            // Persist to in-memory cache
            homeDataCache[cacheKey] = {
                farmName: nextFarmName,
                farmBreakdown: nextFarmBreakdown,
                totalAnimals: nextTotalAnimals,
                animalSplit: nextAnimalSplit,
                housings: nextHousings,
                unreadNotifCount: nextUnreadNotifCount,
                recentAlerts: nextRecentAlerts,
                activeFeeders: nextActiveFeeders,
                activeScales: nextActiveScales,
                todayFeedGrams: nextTodayFeedGrams,
                todayWeighSessions: nextTodayWeighSessions,
                weekMortality: nextWeekMortality,
                lastUpdated: now,
            };
        } catch (err) {
            console.error('[HomeScreen] fetchStats error:', err);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [activeFarmIds, isMultiFarm, managedFarms, farmName, cacheKey]);

    useEffect(() => {
        if (profile) {
            const hasFarm = profile.farmId || (profile as any).farm_id;
            if (!hasFarm) {
                router.replace('/(auth)/SetupAccountScreen');
                return;
            }
            if (role === 'veterinarian') {
                router.replace('/(dashboard)/VetDashboardScreen' as any);
            }
        }
    }, [profile, role, router]);

    // Initial mount fetch
    useEffect(() => {
        if (activeFarmIds.length > 0) fetchStats(false);
    }, [fetchStats, activeFarmIds]);

    // Realtime auto-update on screen focus (e.g. returning from adding animals, logging feeds, devices)
    useFocusEffect(
        useCallback(() => {
            if (activeFarmIds.length > 0) {
                fetchStats(false);
            }
        }, [fetchStats, activeFarmIds])
    );

    // Dynamic Realtime Postgres changes listener across all relevant farm tables
    useEffect(() => {
        if (!activeFarmIds.length) return;
        let debounceTimer: any = null;
        const triggerLiveRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchStats(false);
            }, 300);
        };

        const channelName = `home-live-${activeFarmIds.join('-')}-${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'housings' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'dispense_records' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'weigh_sessions' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records' }, triggerLiveRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'farms' }, triggerLiveRefresh)
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [activeFarmIds, fetchStats]);

    // AppState & background heartbeat sync (ensures live telemetry & device connectivity stay fresh)
    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (nextState === 'active' && activeFarmIds.length > 0) {
                fetchStats(false);
            }
        });

        // Background heartbeat poll every 15 seconds
        const heartbeatTimer = setInterval(() => {
            if (activeFarmIds.length > 0) {
                fetchStats(false);
            }
        }, 15000);

        return () => {
            sub.remove();
            clearInterval(heartbeatTimer);
        };
    }, [fetchStats, activeFarmIds]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await refreshProfile();
        } catch (e) {
            console.error('[HomeScreen] Error refreshing profile:', e);
        }
        await fetchStats(true);
    }, [fetchStats, refreshProfile]);

    // ── Greeting ──────────────────────────────────────────────────────────────
    const getGreeting = () => {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return 'Good morning';
        if (h >= 12 && h < 18) return 'Good afternoon';
        return 'Good evening';
    };

    const alertIcon = (type: AlertNotif['type'], category?: string | null) => {
        let name: React.ComponentProps<typeof MaterialIcons>['name'];
        if (category === 'weight_alert') {
            name = 'scale';
        } else if (category === 'device_alert') {
            name = 'devices';
        } else if (category === 'feed_alert') {
            name = 'grain';
        } else if (category === 'health_alert') {
            name = 'favorite';
        } else {
            switch (type) {
                case 'alert': name = 'error'; break;
                case 'warning': name = 'warning-amber'; break;
                case 'success': name = 'check-circle'; break;
                default: name = 'info'; break;
            }
        }
        const color = type === 'alert' ? colors.error : type === 'warning' ? colors.warning : type === 'success' ? colors.success : colors.info;
        return { name, color };
    };

    const handleAlertPress = (alert: AlertNotif) => {
        if (alert.category === 'weight_alert') {
            router.push('/(weighing)/WeighingSessionsScreen' as any);
        } else if (alert.category === 'feed_alert') {
            router.push('/(devices)/DispenseRecordsScreen' as any);
        } else if (alert.category === 'health_alert') {
            router.push('/(animals)/HealthRecordsScreen' as any);
        } else if (alert.category === 'device_alert') {
            router.push('/(devices)/DevicesScreen' as any);
        } else {
            router.push('/(dashboard)/NotificationScreen' as any);
        }
    };

    // ── Priority-sorted alerts (pick top 1 for main alert card) ───────────────
    const sortedAlerts = useMemo(() => {
        return [...recentAlerts].sort((a, b) => {
            const catDiff = categoryPriority(b.category) - categoryPriority(a.category);
            if (catDiff !== 0) return catDiff;
            return ALERT_PRIORITY[a.type] - ALERT_PRIORITY[b.type];
        });
    }, [recentAlerts]);

    const primaryAlert = sortedAlerts.length > 0 ? sortedAlerts[0] : null;
    const totalAlertsCount = unreadNotifCount || recentAlerts.length;

    // ── Dynamic Permissions Filtering ─────────────────────────────────────────
    const visibleStatCards: React.ReactNode[] = [];

    // Card 1: Animals
    if (hasPermission('animals:view')) {
        visibleStatCards.push(
            <TouchableOpacity
                key="animals"
                activeOpacity={0.8}
                onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    borderRadius: 18,
                    padding: 14,
                    justifyContent: 'space-between',
                    ...Platform.select({
                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                        android: { elevation: 2 },
                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                    }),
                }}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: colors.primary + '18',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Image
                                source={require('../../assets/icons/animals-filled.svg')}
                                style={{ width: 20, height: 20 }}
                                contentFit="contain"
                            />
                        </View>
                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                    </View>

                    {isLoading ? (
                        <Skeleton w={45} h={26} />
                    ) : (
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 26, lineHeight: 30, fontFamily: 'Poppins-Bold' }]}>
                            {totalAnimals}
                        </Text>
                    )}
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1, fontFamily: 'Poppins-Medium' }]}>
                        Total Livestock
                    </Text>

                    {!isMultiFarm && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            {animalSplit.pigs > 0 && (
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    backgroundColor: colors.cardFill,
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                }}>
                                    <AnimalIcon type="pig" size={12} color="#E67E22" />
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 10, fontFamily: 'Poppins-Medium' }]}>
                                        {animalSplit.pigs}
                                    </Text>
                                </View>
                            )}
                            {animalSplit.chickens > 0 && (
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    backgroundColor: colors.cardFill,
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                }}>
                                    <AnimalIcon type="chicken" size={12} color="#F97316" />
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 10, fontFamily: 'Poppins-Medium' }]}>
                                        {animalSplit.chickens}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    {isMultiFarm && !isLoading && farmBreakdown.length > 0 && (
                        <View style={{ marginTop: 8, gap: 3 }}>
                            {farmBreakdown.map((fb, i) => {
                                const farmTotal = fb.pigs + fb.chickens;
                                if (farmTotal === 0) return null;
                                const farmColors = ['#10B981', '#6C63FF', '#F97316', '#EF4444', '#3B82F6'];
                                const fc = farmColors[i % farmColors.length];
                                return (
                                    <View key={fb.farmId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: fc }} />
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 9, flex: 1 }]} numberOfLines={1}>
                                            {fb.farmName}
                                        </Text>
                                        <Text style={[textStyles.label, { color: colors.text, fontSize: 9, fontFamily: 'Poppins-SemiBold' }]}>
                                            {farmTotal}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10 }}>
                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 10, fontFamily: 'Poppins-SemiBold' }]}>
                        View livestock
                    </Text>
                    <MaterialIcons name="arrow-forward" size={11} color={colors.primary} />
                </View>
            </TouchableOpacity>
        );
    }

    // Card 2: Active Alerts
    {
        const hasAlerts = totalAlertsCount > 0;
        const alertBg = hasAlerts
            ? (isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB')
            : colors.surface;
        const alertBorder = hasAlerts
            ? (isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A')
            : colors.stroke;
        const alertIconBg = hasAlerts
            ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7')
            : (isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5');
        const alertIconColor = hasAlerts ? '#F59E0B' : '#10B981';
        const alertNumColor = hasAlerts ? (isDark ? '#FBBF24' : '#D97706') : colors.text;
        const alertBadgeBg = hasAlerts
            ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7')
            : (isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5');
        const alertBadgeText = hasAlerts ? (isDark ? '#FBBF24' : '#D97706') : '#10B981';

        visibleStatCards.push(
            <TouchableOpacity
                key="alerts"
                activeOpacity={0.8}
                onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                style={{
                    flex: 1,
                    backgroundColor: alertBg,
                    borderWidth: 1,
                    borderColor: alertBorder,
                    borderRadius: 18,
                    padding: 14,
                    justifyContent: 'space-between',
                    ...Platform.select({
                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                        android: { elevation: 2 },
                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                    }),
                }}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: alertIconBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <MaterialIcons
                                name={hasAlerts ? 'notifications-active' : 'check-circle'}
                                size={20}
                                color={alertIconColor}
                            />
                        </View>
                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                    </View>

                    {isLoading ? (
                        <Skeleton w={38} h={26} />
                    ) : (
                        <Text style={[textStyles.h1, { color: alertNumColor, fontSize: 26, lineHeight: 30, fontFamily: 'Poppins-Bold' }]}>
                            {totalAlertsCount}
                        </Text>
                    )}
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1, fontFamily: 'Poppins-Medium' }]}>
                        Active Alerts
                    </Text>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 10,
                    backgroundColor: alertBadgeBg,
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: alertIconColor }} />
                    <Text style={[textStyles.body, { color: alertBadgeText, fontSize: 10, fontFamily: 'Poppins-SemiBold' }]}>
                        {hasAlerts ? 'Needs attention' : 'All clear'}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }

    // Card 3: AniFeed
    if (hasPermission('anifeed:dispense')) {
        const isOnline = activeFeeders.online > 0;
        visibleStatCards.push(
            <TouchableOpacity
                key="anifeed"
                activeOpacity={0.8}
                onPress={() => router.push('/(devices)/DevicesScreen' as any)}
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    borderRadius: 18,
                    padding: 14,
                    justifyContent: 'space-between',
                    ...Platform.select({
                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                        android: { elevation: 2 },
                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                    }),
                }}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: colors.secondary + '1A',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <AniFeedIcon size={20} />
                        </View>
                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                    </View>

                    {isLoading ? (
                        <Skeleton w={45} h={26} />
                    ) : (
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 26, lineHeight: 30, fontFamily: 'Poppins-Bold' }]}>
                            {activeFeeders.online}<Text style={{ fontSize: 14, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>/{activeFeeders.total}</Text>
                        </Text>
                    )}
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1, fontFamily: 'Poppins-Medium' }]}>
                        AniFeed
                    </Text>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 10,
                    backgroundColor: activeFeeders.total === 0 ? colors.bgLight : (isOnline ? '#10B981' + '15' : colors.error + '15'),
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <View style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: activeFeeders.total === 0 ? colors.textGrey : (isOnline ? '#10B981' : colors.error),
                    }} />
                    <Text style={[textStyles.body, {
                        color: activeFeeders.total === 0 ? colors.textGrey : (isOnline ? '#10B981' : colors.error),
                        fontSize: 10,
                        fontFamily: 'Poppins-SemiBold',
                    }]}>
                        {activeFeeders.total === 0 ? 'No devices' : `${activeFeeders.online} Online`}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }

    // Card 4: AniWeigh
    if (hasPermission('devices:view')) {
        const isOnline = activeScales.online > 0;
        visibleStatCards.push(
            <TouchableOpacity
                key="aniweigh"
                activeOpacity={0.8}
                onPress={() => router.push('/(devices)/DevicesScreen' as any)}
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    borderRadius: 18,
                    padding: 14,
                    justifyContent: 'space-between',
                    ...Platform.select({
                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                        android: { elevation: 2 },
                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                    }),
                }}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: '#6C63FF' + '1A',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <AniWeighIcon size={20} />
                        </View>
                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                    </View>

                    {isLoading ? (
                        <Skeleton w={45} h={26} />
                    ) : (
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 26, lineHeight: 30, fontFamily: 'Poppins-Bold' }]}>
                            {activeScales.online}<Text style={{ fontSize: 14, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>/{activeScales.total}</Text>
                        </Text>
                    )}
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1, fontFamily: 'Poppins-Medium' }]}>
                        AniWeigh
                    </Text>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 10,
                    backgroundColor: activeScales.total === 0 ? colors.bgLight : (isOnline ? '#10B981' + '15' : colors.error + '15'),
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <View style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: activeScales.total === 0 ? colors.textGrey : (isOnline ? '#10B981' : colors.error),
                    }} />
                    <Text style={[textStyles.body, {
                        color: activeScales.total === 0 ? colors.textGrey : (isOnline ? '#10B981' : colors.error),
                        fontSize: 10,
                        fontFamily: 'Poppins-SemiBold',
                    }]}>
                        {activeScales.total === 0 ? 'No devices' : `${activeScales.online} Online`}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }

    const statCardsChunks: React.ReactNode[][] = [];
    for (let i = 0; i < visibleStatCards.length; i += 2) {
        statCardsChunks.push(visibleStatCards.slice(i, i + 2));
    }

    // ── Quick Actions Config ───────────────────────────────────────────────────
    const allQuickActions = [
        { label: 'Feeds', icon: 'grain', route: '/(devices)/ManageFeedsScreen', color: colors.secondary, permission: 'anifeed:dispense' },
        { label: 'Devices', icon: 'devices', route: '/(devices)/DevicesScreen', color: '#6C63FF', permission: 'devices:view' },
        { label: 'Animals', icon: null, route: '/(animals)/AnimalsScreen', color: colors.primary, permission: 'animals:view' },
        { label: 'Housings', icon: 'home-work', route: '/(devices)/ManageHousingsScreen', color: '#F97316', permission: 'housing:manage' },
    ];

    const filteredQuickActions = allQuickActions.filter(item => hasPermission(item.permission));

    const showYourHousings = hasPermission('animals:view') || hasPermission('devices:view') || hasPermission('anifeed:dispense');
    const showFeedActivity = hasPermission('anifeed:dispense');
    const showWeighActivity = hasPermission('devices:view');
    const showTodaySection = showFeedActivity || showWeighActivity;
    const showMortality = hasPermission('health:view');

    return (
        <View style={[homeStyles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={homeStyles.container}>

                {/* ── Header ─────────────────────────────────────────────────── */}
                <Header />

                {/* ── Scroll Content ──────────────────────────────────────────── */}
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 110 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >
                    {/* ── Enhanced Hero Greeting ──────────────────────────────── */}
                    <View style={[homeStyles.greetingContainer, { paddingTop: 20, paddingBottom: 14 }]}>
                        {/* Status Chip & Timestamp Row */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 20,
                            }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.text }}>
                                    {farmName || 'Active Farm'}
                                </Text>
                            </View>

                            {lastUpdated && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <MaterialIcons name="sync" size={13} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                        {timeAgo(lastUpdated)}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Greeting Text */}
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                            <Text style={[textStyles.h1, { fontSize: 25, color: colors.text, lineHeight: 32, fontFamily: 'Poppins-Bold' }]}>
                                {getGreeting()},
                            </Text>
                            <Text translate={false} style={[textStyles.h1, { fontSize: 25, color: colors.primary, lineHeight: 32, fontFamily: 'Poppins-Bold' }]}>
                                {userName.split(' ')[0]}!
                            </Text>
                        </View>

                        {/* Operational Subtitle */}
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2, fontFamily: 'Poppins-Regular' }]}>
                            {totalAlertsCount > 0
                                ? `${totalAlertsCount} active alert${totalAlertsCount > 1 ? 's' : ''} require your review`
                                : 'All automated farm systems operational'}
                        </Text>
                    </View>

                    <View style={homeStyles.content}>

                        {/* ── Key Notice / Priority Update (Compact Gradient Card) ── */}
                        {primaryAlert && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                                {(() => {
                                    const { name } = alertIcon(primaryAlert.type, primaryAlert.category);
                                    const categoryLabel = formatAlertCategory(primaryAlert.category);
                                    const isCritical = primaryAlert.type === 'alert';
                                    const isWarning = primaryAlert.type === 'warning';
                                    
                                    // Gradient palette matching AI Insight styling
                                    const gradientColors: [string, string] = isCritical
                                        ? ['#DC2626', '#EF4444']
                                        : isWarning
                                        ? ['#D97706', '#F59E0B']
                                        : ['#1D4ED8', '#3B82F6'];
                                        
                                    const sectionTitle = isCritical ? 'Priority Alert' : isWarning ? 'Important Notice' : 'Recent Notice';
                                    const sectionIcon = isCritical ? 'error-outline' : isWarning ? 'notifications-active' : 'info-outline';
                                    const badgeLabel = isCritical ? 'Priority' : isWarning ? 'Attention' : 'Notice';

                                    return (
                                        <>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                                    <MaterialIcons name={sectionIcon as any} size={16} color={gradientColors[0]} />
                                                    <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 15 }]}>
                                                        {sectionTitle}
                                                    </Text>
                                                    <View style={{
                                                        backgroundColor: gradientColors[0],
                                                        borderRadius: 10,
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 1,
                                                    }}>
                                                        <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontFamily: 'Poppins-Bold' }}>
                                                            {totalAlertsCount > 1 ? `${totalAlertsCount}` : '1'}
                                                        </Text>
                                                    </View>
                                                </View>

                                                {/* View all link */}
                                                <TouchableOpacity
                                                    onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 2,
                                                    }}
                                                >
                                                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 12, fontFamily: 'Poppins-SemiBold' }]}>
                                                        View all
                                                    </Text>
                                                    <MaterialIcons name="chevron-right" size={15} color={colors.primary} />
                                                </TouchableOpacity>
                                            </View>

                                            {isLoading ? (
                                                <Skeleton w="100%" h={84} radius={16} />
                                            ) : (
                                                <TouchableOpacity
                                                    key={primaryAlert.id}
                                                    activeOpacity={0.88}
                                                    onPress={() => handleAlertPress(primaryAlert)}
                                                >
                                                    <LinearGradient
                                                        colors={gradientColors}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 1, y: 1 }}
                                                        style={{
                                                            borderRadius: 16,
                                                            padding: 13,
                                                            shadowColor: gradientColors[0],
                                                            shadowOffset: { width: 0, height: 3 },
                                                            shadowOpacity: 0.25,
                                                            shadowRadius: 8,
                                                            elevation: 4,
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        {/* Top Header: Frosted icon + Status Pill + Time/Category */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                                                <View style={{
                                                                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                                                                    width: 24,
                                                                    height: 24,
                                                                    borderRadius: 7,
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                }}>
                                                                    <MaterialIcons name={name as any} size={14} color="#FFFFFF" />
                                                                </View>

                                                                {/* Status badge */}
                                                                <View style={{
                                                                    backgroundColor: 'rgba(255, 255, 255, 0.18)',
                                                                    borderRadius: 10,
                                                                    paddingHorizontal: 7,
                                                                    paddingVertical: 2,
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                }}>
                                                                    <View style={{ width: 4.5, height: 4.5, borderRadius: 2.5, backgroundColor: '#FFFFFF' }} />
                                                                    <Text style={{
                                                                        color: '#FFFFFF',
                                                                        fontSize: 10,
                                                                        fontFamily: 'Poppins-Bold',
                                                                    }}>
                                                                        {badgeLabel}
                                                                    </Text>
                                                                </View>

                                                                <Text
                                                                    style={{
                                                                        color: 'rgba(255, 255, 255, 0.85)',
                                                                        fontSize: 10.5,
                                                                        fontFamily: 'Poppins-Medium',
                                                                    }}
                                                                    numberOfLines={1}
                                                                >
                                                                    • {categoryLabel}
                                                                </Text>
                                                            </View>

                                                            {primaryAlert.created_at && (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                                    <MaterialIcons name="schedule" size={11} color="rgba(255, 255, 255, 0.8)" />
                                                                    <Text style={{
                                                                        color: 'rgba(255, 255, 255, 0.8)',
                                                                        fontSize: 10,
                                                                        fontFamily: 'Poppins-Regular',
                                                                    }}>
                                                                        {timeAgo(primaryAlert.created_at)}
                                                                    </Text>
                                                                </View>
                                                            )}
                                                        </View>

                                                        {/* Title + Message in clean compact white typography */}
                                                        <Text
                                                            style={[textStyles.h3, {
                                                                color: '#FFFFFF',
                                                                fontSize: 13.5,
                                                                lineHeight: 18,
                                                                fontFamily: 'Poppins-Bold',
                                                            }]}
                                                            numberOfLines={1}
                                                        >
                                                            {primaryAlert.title}
                                                        </Text>

                                                        <Text
                                                            style={[textStyles.body, {
                                                                color: 'rgba(255, 255, 255, 0.9)',
                                                                fontSize: 11.5,
                                                                lineHeight: 15.5,
                                                                marginTop: 2,
                                                            }]}
                                                            numberOfLines={2}
                                                        >
                                                            {primaryAlert.message}
                                                        </Text>

                                                        {/* Compact inline footer action */}
                                                        <View style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            justifyContent: 'flex-end',
                                                            marginTop: 6,
                                                            gap: 2,
                                                        }}>
                                                            <Text style={{
                                                                color: '#FFFFFF',
                                                                fontSize: 10.5,
                                                                fontFamily: 'Poppins-SemiBold',
                                                            }}>
                                                                View details
                                                            </Text>
                                                            <MaterialIcons name="chevron-right" size={14} color="#FFFFFF" />
                                                        </View>
                                                    </LinearGradient>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    );
                                })()}
                            </View>
                        )}

                        {/* ── Stat Cards 2×2 Grid ─────────────────────────────── */}
                        {statCardsChunks.length > 0 && (
                            <View style={[homeStyles.farmStateGrid, { marginBottom: 14 }]}>
                                {statCardsChunks.map((rowCards, rowIndex) => (
                                    <View key={rowIndex} style={homeStyles.farmStateRow}>
                                        {rowCards}
                                        {rowCards.length === 1 && <View style={{ flex: 1 }} />}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* ── Quick Actions ─────────────────────────────────────── */}
                        {filteredQuickActions.length > 0 && (
                            <View style={{ marginBottom: 14 }}>
                                <View style={[homeStyles.sectionHeaderRow, { marginTop: 4, marginBottom: 10 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MaterialIcons name="flash-on" size={16} color={colors.secondary} />
                                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 16 }]}>
                                            Quick Actions
                                        </Text>
                                    </View>
                                </View>

                                <View style={[homeStyles.quickActionsCard, {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.stroke,
                                    paddingVertical: 14,
                                    paddingHorizontal: 12,
                                    borderRadius: 20,
                                }]}>
                                    <View style={homeStyles.quickActionRow}>
                                        {filteredQuickActions.map(item => (
                                            <Pressable
                                                key={item.label}
                                                style={({ pressed }) => [homeStyles.actionButton, { opacity: pressed ? 0.72 : 1 }]}
                                                onPress={() => router.push(item.route as any)}
                                            >
                                                <View style={{
                                                    width: 52,
                                                    height: 52,
                                                    borderRadius: 16,
                                                    backgroundColor: item.color + '15',
                                                    borderWidth: 1,
                                                    borderColor: item.color + '30',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}>
                                                    {item.icon === null ? (
                                                        <Image
                                                            source={require('../../assets/icons/animals-filled.svg')}
                                                            style={{ width: 24, height: 24 }}
                                                            contentFit="contain"
                                                        />
                                                    ) : (
                                                        <MaterialIcons name={item.icon as any} size={24} color={item.color} />
                                                    )}
                                                </View>
                                                <Text style={[textStyles.label, { color: colors.text, marginTop: 6, fontSize: 11, textAlign: 'center', fontFamily: 'Poppins-Medium' }]}>
                                                    {item.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* ── Your Housings ─────────────────────────────────────── */}
                        {showYourHousings && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MaterialIcons name="home-work" size={16} color="#F97316" />
                                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 16 }]}>
                                            Your Housings
                                        </Text>
                                        <View style={{
                                            backgroundColor: colors.cardFill,
                                            borderRadius: 10,
                                            minWidth: 20,
                                            height: 18,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            paddingHorizontal: 6,
                                        }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>
                                                {housings.length}
                                            </Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                                    >
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 12, fontFamily: 'Poppins-SemiBold' }]}>
                                            View All
                                        </Text>
                                        <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                <View style={{
                                    backgroundColor: colors.surface,
                                    borderRadius: 18,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    padding: 16,
                                    ...Platform.select({
                                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                        android: { elevation: 2 },
                                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                    }),
                                }}>
                                    {isLoading ? (
                                        [0, 1].map(i => (
                                            <View key={i} style={{ marginBottom: i === 0 ? 14 : 0 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                                    <Skeleton w={32} h={32} radius={10} />
                                                    <Skeleton w="45%" h={14} />
                                                    <View style={{ flex: 1 }} />
                                                    <Skeleton w={40} h={14} />
                                                    <Skeleton w={36} h={20} radius={6} />
                                                </View>
                                                <Skeleton w="100%" h={6} radius={3} />
                                            </View>
                                        ))
                                    ) : housings.length === 0 ? (
                                        <Pressable
                                            onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                            style={{
                                                alignItems: 'center',
                                                paddingVertical: 20,
                                                gap: 8,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                borderStyle: 'dashed',
                                                borderRadius: 14,
                                            }}
                                        >
                                            <View style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 12,
                                                backgroundColor: colors.primary + '15',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                <MaterialIcons name="add-home" size={24} color={colors.primary} />
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.primary, fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                                Add your first housing
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                Organize livestock and configure device tracking
                                            </Text>
                                        </Pressable>
                                    ) : (
                                        housings.slice(0, 5).map((h, idx) => {
                                            const pct = h.capacity > 0 ? Math.min(100, Math.round((h.current_count / h.capacity) * 100)) : 0;
                                            const barColor = occupancyColor(pct, colors);
                                            const isPig = h.animal_type === 'pig';
                                            return (
                                                <Pressable
                                                    key={h.id}
                                                    onPress={() => router.push({ pathname: '/(animals)/AnimalDetails' as any, params: { housingId: h.id } })}
                                                    style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                                                >
                                                    {idx > 0 && (
                                                        <View style={{ height: 1, backgroundColor: colors.stroke, marginVertical: 12 }} />
                                                    )}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                        <View style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: 10,
                                                            backgroundColor: (isPig ? '#E67E22' : '#F1C40F') + '1E',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}>
                                                            <AnimalIcon type={h.animal_type} size={16} color={isPig ? '#E67E22' : '#D4A017'} />
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text numberOfLines={1} style={[textStyles.body, { color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                                                {h.name}
                                                            </Text>
                                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>
                                                                {h.current_count} / {h.capacity} head
                                                            </Text>
                                                        </View>
                                                        <View style={{
                                                            backgroundColor: barColor + '1E',
                                                            borderRadius: 6,
                                                            paddingHorizontal: 7,
                                                            paddingVertical: 3,
                                                            borderWidth: 1,
                                                            borderColor: barColor + '30',
                                                        }}>
                                                            <Text style={[textStyles.label, { color: barColor, fontSize: 10, fontFamily: 'Poppins-Bold' }]}>
                                                                {pct}%
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ height: 6, backgroundColor: colors.cardFill, borderRadius: 3, overflow: 'hidden', marginLeft: 42 }}>
                                                        <View style={{ width: `${pct}%` as any, height: 6, backgroundColor: barColor, borderRadius: 3 }} />
                                                    </View>
                                                </Pressable>
                                            );
                                        })
                                    )}
                                </View>
                            </View>
                        )}

                        {/* ── Today's Activity ─────────────────────────────────── */}
                        {showTodaySection && (
                            <View style={{ marginBottom: 14 }}>
                                <View style={[homeStyles.sectionHeaderRow, { marginTop: 4, marginBottom: 10 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MaterialIcons name="insights" size={16} color={colors.primary} />
                                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 16 }]}>
                                            Today's Telemetry
                                        </Text>
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Medium' }]}>
                                        {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </Text>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20 }}>
                                    {/* Feed dispensed today */}
                                    {showFeedActivity && (
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => router.push('/(devices)/DispenseRecordsScreen' as any)}
                                            style={{
                                                flex: 1,
                                                backgroundColor: colors.surface,
                                                borderRadius: 18,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                padding: 16,
                                                ...Platform.select({
                                                    ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                                    android: { elevation: 2 },
                                                    default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                                }),
                                            }}
                                        >
                                            <View style={{
                                                width: 38,
                                                height: 38,
                                                borderRadius: 12,
                                                backgroundColor: colors.secondary + '1A',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginBottom: 10,
                                            }}>
                                                <AniFeedIcon size={20} />
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Medium' }]}>
                                                Feed Dispensed
                                            </Text>
                                            {isLoading ? (
                                                <Skeleton w={60} h={24} radius={6} />
                                            ) : (
                                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginTop: 2, fontFamily: 'Poppins-Bold' }]}>
                                                    {formatGrams(todayFeedGrams)}
                                                </Text>
                                            )}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10 }}>
                                                <Text style={[textStyles.body, { color: colors.secondary, fontSize: 11, fontFamily: 'Poppins-SemiBold' }]}>
                                                    View logs
                                                </Text>
                                                <MaterialIcons name="arrow-forward" size={12} color={colors.secondary} />
                                            </View>
                                        </TouchableOpacity>
                                    )}

                                    {/* Weight sessions today */}
                                    {showWeighActivity && (
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => router.push('/(devices)/RecentLogsScreen' as any)}
                                            style={{
                                                flex: 1,
                                                backgroundColor: colors.surface,
                                                borderRadius: 18,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                padding: 16,
                                                ...Platform.select({
                                                    ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                                    android: { elevation: 2 },
                                                    default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                                }),
                                            }}
                                        >
                                            <View style={{
                                                width: 38,
                                                height: 38,
                                                borderRadius: 12,
                                                backgroundColor: '#6C63FF' + '1A',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginBottom: 10,
                                            }}>
                                                <AniWeighIcon size={20} />
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Medium' }]}>
                                                Weigh Sessions
                                            </Text>
                                            {isLoading ? (
                                                <Skeleton w={40} h={24} radius={6} />
                                            ) : (
                                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginTop: 2, fontFamily: 'Poppins-Bold' }]}>
                                                    {todayWeighSessions}
                                                </Text>
                                            )}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10 }}>
                                                <Text style={[textStyles.body, { color: '#6C63FF', fontSize: 11, fontFamily: 'Poppins-SemiBold' }]}>
                                                    View logs
                                                </Text>
                                                <MaterialIcons name="arrow-forward" size={12} color="#6C63FF" />
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* ── 7-Day Health Summary ─────────────────────────────── */}
                        {showMortality && (
                            <View style={{ paddingHorizontal: 20, marginTop: 8, marginBottom: 12 }}>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                                    style={{
                                        backgroundColor: weekMortality > 0
                                            ? (isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2')
                                            : colors.surface,
                                        borderRadius: 18,
                                        borderWidth: 1,
                                        borderColor: weekMortality > 0
                                            ? (isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA')
                                            : colors.stroke,
                                        padding: 16,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        ...Platform.select({
                                            ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                            android: { elevation: 2 },
                                            default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                        }),
                                    }}
                                >
                                    <View style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 14,
                                        backgroundColor: weekMortality > 0
                                            ? (isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2')
                                            : (isDark ? 'rgba(16, 185, 129, 0.12)' : '#10B98118'),
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 14,
                                    }}>
                                        <MaterialIcons
                                            name={weekMortality > 0 ? 'warning' : 'health-and-safety'}
                                            size={24}
                                            color={weekMortality > 0 ? '#EF4444' : '#10B981'}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-SemiBold' }]}>
                                            7-Day Herd Health
                                        </Text>
                                        {isLoading ? (
                                            <Skeleton w={100} h={12} radius={4} />
                                        ) : (
                                            <Text style={[textStyles.body, {
                                                color: weekMortality > 0
                                                    ? (isDark ? '#FCA5A5' : '#DC2626')
                                                    : colors.textGrey,
                                                fontSize: 11,
                                                marginTop: 1,
                                            }]}>
                                                {weekMortality === 0
                                                    ? 'No mortality recorded this week · Healthy'
                                                    : `${weekMortality} deceased recorded this week`}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                        {isLoading ? (
                                            <Skeleton w={24} h={26} radius={6} />
                                        ) : (
                                            <Text style={[textStyles.h2, {
                                                color: weekMortality > 0 ? (isDark ? '#F87171' : colors.error) : '#10B981',
                                                fontSize: 22,
                                                fontFamily: 'Poppins-Bold',
                                            }]}>
                                                {weekMortality}
                                            </Text>
                                        )}
                                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}

                    </View>
                </ScrollView>
            </View>

            <FloatingNavBar />
        </View>
    );
}

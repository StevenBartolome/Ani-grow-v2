import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useHomeStyles } from '@/styles/homeStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { AnimalIcon } from '@/components/AnimalIcon';
import { FarmSwitcherDrawer } from '@/components/FarmSwitcherDrawer';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertNotif {
    id: string;
    title: string;
    message: string;
    type: 'alert' | 'warning' | 'info' | 'success';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALERT_PRIORITY: Record<AlertNotif['type'], number> = { alert: 0, warning: 1, info: 2, success: 3 };

function mapNotifType(type: string): AlertNotif['type'] {
    if (type === 'error') return 'alert';
    if (type === 'warning' || type === 'success' || type === 'info') return type as AlertNotif['type'];
    return 'info';
}

function occupancyColor(pct: number, colors: any): string {
    if (pct >= 90) return colors.error;
    if (pct >= 70) return colors.warning;
    return colors.primary;
}

function formatGrams(g: number): string {
    if (g >= 1000) return `${(g / 1000).toFixed(1)} kg`;
    return `${g} g`;
}

function timeAgo(date: Date | null): string {
    if (!date) return '';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
    const { profile, hasPermission } = useAuth();
    const homeStyles = useHomeStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
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
        isFarmAdmin,
    } = useFarmFilter();

    // ── State ─────────────────────────────────────────────────────────────────
    const [farmName, setFarmName]           = useState('your farm');
    const [farmBreakdown, setFarmBreakdown] = useState<FarmBreakdown[]>([]);
    const [totalAnimals, setTotalAnimals]   = useState(0);
    const [animalSplit, setAnimalSplit]     = useState({ pigs: 0, chickens: 0 });
    const [housings, setHousings] = useState<HousingCard[]>([]);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);
    const [recentAlerts, setRecentAlerts] = useState<AlertNotif[]>([]);
    const [activeFeeders, setActiveFeeders] = useState({ online: 0, total: 0 });
    const [activeScales, setActiveScales] = useState({ online: 0, total: 0 });
    const [todayFeedGrams, setTodayFeedGrams] = useState(0);
    const [todayWeighSessions, setTodayWeighSessions] = useState(0);
    const [weekMortality, setWeekMortality] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [switcherOpen, setSwitcherOpen]   = useState(false);
    const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchStats = useCallback(async () => {
        if (!activeFarmIds.length) { setIsLoading(false); return; }
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
                // Farm name(s) — for single farm use .single(), multi use .in()
                isSingle
                    ? supabase.from('farms').select('name').eq('id', activeFarmIds[0]).single()
                    : supabase.from('farms').select('id, name').in('id', activeFarmIds),
                // Batches — include farm_id via housing join + farm name for breakdown
                supabase
                    .from('batches')
                    .select('id, current_count, animal_type, housings!inner(farm_id, farms(id, name))')
                    .in('housings.farm_id', activeFarmIds)
                    .eq('status', 'active'),
                // Notifications — all selected farms
                supabase
                    .from('notifications')
                    .select('id, title, message, type, is_read')
                    .in('farm_id', activeFarmIds)
                    .eq('is_read', false)
                    .order('created_at', { ascending: false })
                    .limit(10),
                // Devices — all selected farms
                supabase.from('devices').select('id, type, status').in('farm_id', activeFarmIds),
                // Housings — all selected farms
                supabase
                    .from('housings')
                    .select('id, name, animal_type, capacity, current_count, farm_id')
                    .in('farm_id', activeFarmIds)
                    .eq('status', 'Active')
                    .order('name'),
            ]);

            // Set farm display name
            if (isSingle && (farmRes as any).data?.name) {
                setFarmName((farmRes as any).data.name);
            } else if (!isSingle && managedFarms.length > 0) {
                setFarmName(`${activeFarmIds.length} Farms`);
            }

            let feederIds: string[] = [];
            let scaleIds: string[] = [];
            let allBatchIds: string[] = [];

            if (batchRes.data) {
                const total = batchRes.data.reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
                setTotalAnimals(total);
                allBatchIds = batchRes.data.map((b: any) => b.id);

                const pigs = batchRes.data
                    .filter((b: any) => b.animal_type === 'pig')
                    .reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
                setAnimalSplit({ pigs, chickens: total - pigs });

                // Per-farm breakdown (shown when multi-farm)
                if (isMultiFarm) {
                    const breakdown: FarmBreakdown[] = activeFarmIds.map(fid => {
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
                    setFarmBreakdown(breakdown);
                } else {
                    setFarmBreakdown([]);
                }
            }

            if (notifRes.data) {
                setUnreadNotifCount(notifRes.data.length);
                setRecentAlerts(notifRes.data.map((n: any) => ({
                    id: n.id, title: n.title, message: n.message, type: mapNotifType(n.type),
                })));
            }

            if (deviceRes.data) {
                const feeders = deviceRes.data.filter((d: any) => d.type === 'anifeed' || d.type === 'feeder');
                const scales = deviceRes.data.filter((d: any) => d.type === 'aniweigh' || d.type === 'scale');
                feederIds = feeders.map((d: any) => d.id);
                scaleIds = scales.map((d: any) => d.id);
                setActiveFeeders({ online: feeders.filter((d: any) => d.status === 'online').length, total: feeders.length });
                setActiveScales({ online: scales.filter((d: any) => d.status === 'online').length, total: scales.length });
            }

            if (housingRes.data) setHousings(housingRes.data as HousingCard[]);

            // ── Round 2: activity data (depends on IDs from round 1) ──────────
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

            if (feedRes.data) {
                setTodayFeedGrams(feedRes.data.reduce((s: number, r: any) => s + (r.grams_dispensed ?? 0), 0));
            }
            if (weightRes.data) setTodayWeighSessions(weightRes.data.length);
            if (mortalityRes.data) {
                setWeekMortality(mortalityRes.data.reduce((s: number, r: any) => s + (r.affected_count ?? 0), 0));
            }

            setLastUpdated(new Date());
        } catch (err) {
            console.error('[HomeScreen] fetchStats error:', err);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [activeFarmIds, userId, isMultiFarm, managedFarms]);

    useEffect(() => {
        if (profile) {
            const hasFarm = profile.farmId || (profile as any).farm_id;
            if (!hasFarm) {
                router.replace('/(auth)/SetupAccountScreen');
            }
        }
    }, [profile, router]);

    useEffect(() => {
        if (activeFarmIds.length > 0) fetchStats();
    }, [fetchStats, activeFarmIds]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchStats();
    }, [fetchStats]);

    // ── Greeting ──────────────────────────────────────────────────────────────
    const getGreeting = () => {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return 'Good morning';
        if (h >= 12 && h < 18) return 'Good afternoon';
        return 'Good evening';
    };

    const alertIcon = (type: AlertNotif['type']) => {
        switch (type) {
            case 'alert': return { name: 'error', color: colors.error };
            case 'warning': return { name: 'warning-amber', color: colors.warning };
            case 'success': return { name: 'check-circle', color: colors.success };
            default: return { name: 'info', color: colors.info };
        }
    };

    // ── Skeletons ─────────────────────────────────────────────────────────────
    const Skeleton = ({ w, h, radius = 8 }: { w: number | string; h: number; radius?: number }) => (
        <View style={{ width: w as any, height: h, borderRadius: radius, backgroundColor: colors.cardFill }} />
    );

    // ── Dynamic Permissions Filtering ─────────────────────────────────────────
    const visibleStatCards: React.ReactNode[] = [];

    if (hasPermission('animals_guide')) {
        visibleStatCards.push(
            <Pressable
                key="animals"
                onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                style={({ pressed }) => [
                    homeStyles.farmStateCard,
                    { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
                ]}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={[homeStyles.farmStateIconBox, { backgroundColor: colors.primary + '1A' }]}>
                            <Image
                                source={require('../../assets/icons/animals-filled.svg')}
                                style={{ width: 18, height: 18 }}
                                contentFit="contain"
                            />
                        </View>
                        <MaterialIcons name="chevron-right" size={14} color={colors.textGrey} />
                    </View>

                    {isLoading
                        ? <Skeleton w={40} h={24} />
                        : <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>{totalAnimals}</Text>
                    }
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                        Total Animals
                    </Text>

                    {!isMultiFarm && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {animalSplit.pigs > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                    <AnimalIcon type="pig" size={10} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>{animalSplit.pigs}</Text>
                                </View>
                            )}
                            {animalSplit.chickens > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                    <AnimalIcon type="chicken" size={10} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>{animalSplit.chickens}</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {isMultiFarm && !isLoading && farmBreakdown.length > 0 && (
                        <View style={{ marginTop: 6, gap: 3 }}>
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
                                        <Text style={[textStyles.label, { color: colors.text, fontSize: 9 }]}>
                                            {farmTotal}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                    <MaterialIcons name="pets" size={10} color={colors.primary} />
                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 10 }]}>View animals</Text>
                </View>
            </Pressable>
        );
    }

    if (hasPermission('dashboard')) {
        visibleStatCards.push(
            <Pressable
                key="alerts"
                onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                style={({ pressed }) => [
                    homeStyles.farmStateCard,
                    {
                        backgroundColor: unreadNotifCount > 0 ? colors.warning + '0D' : colors.surface,
                        borderColor: unreadNotifCount > 0 ? colors.warning + '40' : colors.stroke,
                        opacity: pressed ? 0.85 : 1,
                    },
                ]}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#F97316' + '1A' }]}>
                            <MaterialIcons name="notifications-active" size={18} color="#F97316" />
                        </View>
                        <MaterialIcons name="chevron-right" size={14} color={colors.textGrey} />
                    </View>

                    {isLoading
                        ? <Skeleton w={36} h={24} />
                        : <Text style={[textStyles.h1, { color: unreadNotifCount > 0 ? colors.warning : colors.text, fontSize: 24, lineHeight: 28 }]}>
                            {unreadNotifCount}
                        </Text>
                    }
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                        Active Alerts
                    </Text>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 8,
                    backgroundColor: unreadNotifCount > 0 ? '#F97316' + '1A' : colors.bgLight,
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <MaterialIcons
                        name={unreadNotifCount === 0 ? 'check-circle' : 'warning'}
                        size={10}
                        color={unreadNotifCount === 0 ? '#10B981' : '#F97316'}
                    />
                    <Text style={[textStyles.body, { color: unreadNotifCount === 0 ? '#10B981' : '#F97316', fontSize: 10 }]}>
                        {unreadNotifCount === 0 ? 'All clear' : 'Needs attention'}
                    </Text>
                </View>
            </Pressable>
        );
    }

    if (hasPermission('feeding_control')) {
        visibleStatCards.push(
            <Pressable
                key="anifeed"
                onPress={() => router.push('/(devices)/DevicesScreen' as any)}
                style={({ pressed }) => [
                    homeStyles.farmStateCard,
                    { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
                ]}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={[homeStyles.farmStateIconBox, { backgroundColor: colors.secondary + '1A' }]}>
                            <MaterialIcons name="grain" size={18} color={colors.secondary} />
                        </View>
                        <MaterialIcons name="chevron-right" size={14} color={colors.textGrey} />
                    </View>

                    {isLoading
                        ? <Skeleton w={44} h={24} />
                        : <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>
                            {activeFeeders.online}<Text style={{ fontSize: 13, color: colors.textGrey }}>/{activeFeeders.total}</Text>
                        </Text>
                    }
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                        AniFeed
                    </Text>
                </View>

                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 8,
                    backgroundColor: activeFeeders.total === 0 ? colors.bgLight : colors.secondary + '1A',
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: activeFeeders.total === 0 ? colors.textGrey : colors.secondary }} />
                    <Text style={[textStyles.body, { color: activeFeeders.total === 0 ? colors.textGrey : colors.secondary, fontSize: 10 }]}>
                        {activeFeeders.total === 0 ? 'No devices' : 'Online'}
                    </Text>
                </View>
            </Pressable>
        );
    }

    if (hasPermission('devices')) {
        visibleStatCards.push(
            <Pressable
                key="aniweigh"
                onPress={() => router.push('/(devices)/DevicesScreen' as any)}
                style={({ pressed }) => [
                    homeStyles.farmStateCard,
                    { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
                ]}
            >
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#6C63FF' + '1A' }]}>
                            <MaterialIcons name="monitor-weight" size={18} color="#6C63FF" />
                        </View>
                        <MaterialIcons name="chevron-right" size={14} color={colors.textGrey} />
                    </View>
 
                    {isLoading
                        ? <Skeleton w={44} h={24} />
                        : <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>
                            {activeScales.online}<Text style={{ fontSize: 13, color: colors.textGrey }}>/{activeScales.total}</Text>
                        </Text>
                    }
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                        AniWeigh
                    </Text>
                </View>
 
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 8,
                    backgroundColor: activeScales.total === 0 ? colors.bgLight : '#6C63FF' + '1A',
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: activeScales.total === 0 ? colors.textGrey : '#6C63FF' }} />
                    <Text style={[textStyles.body, { color: activeScales.total === 0 ? colors.textGrey : '#6C63FF', fontSize: 10 }]}>
                        {activeScales.total === 0 ? 'No devices' : 'Online'}
                    </Text>
                </View>
            </Pressable>
        );
    }
 
    const statCardsChunks: React.ReactNode[][] = [];
    for (let i = 0; i < visibleStatCards.length; i += 2) {
        statCardsChunks.push(visibleStatCards.slice(i, i + 2));
    }
 
    const allQuickActions = [
        { label: 'Feeds', icon: 'grain', route: '/(devices)/ManageFeedsScreen', color: colors.secondary, permission: 'feeding_control' },
        { label: 'Devices', icon: 'devices', route: '/(devices)/DevicesScreen', color: '#6C63FF', permission: 'devices' },
        { label: 'Animals', icon: null, route: '/(animals)/AnimalsScreen', color: colors.primary, permission: 'animals_guide' },
        { label: 'Vaccines', icon: 'vaccines', route: '/(health)/VaccineScreen', color: '#EF4444', permission: 'health_records' },
        { label: 'Housings', icon: 'home-work', route: '/(devices)/ManageHousingsScreen', color: '#F97316', permission: 'animals_guide' },
    ];
 
    const filteredQuickActions = allQuickActions.filter(item => {
        if (item.label === 'Devices') {
            return hasPermission('devices');
        }
        if (item.label === 'Housings') {
            return hasPermission('animals_guide') || hasPermission('devices') || hasPermission('feeding_control');
        }
        return hasPermission(item.permission);
    });
 
    const showYourHousings = hasPermission('animals_guide') || hasPermission('devices') || hasPermission('feeding_control');
    const showFeedActivity = hasPermission('feeding_control');
    const showWeighActivity = hasPermission('devices');
    const showTodaySection = showFeedActivity || showWeighActivity;
    const showMortality = hasPermission('health_records');

    return (
        <SafeAreaView style={homeStyles.safeArea}>
            <View style={homeStyles.container}>

                {/* ── Header ─────────────────────────────────────────────────── */}
                <View style={homeStyles.header}>
                    <View style={homeStyles.headerLeft}>
                        <TouchableOpacity
                            style={[homeStyles.profileIcon, { marginRight: 10, width: 36, height: 36, backgroundColor: 'transparent' }]}
                            onPress={() => setProfileDrawerOpen(true)}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="menu" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={homeStyles.logo}
                            contentFit="contain"
                        />
                        <View>
                            <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 24 }]}>
                                Ani-Grow
                            </Text>
                            <TouchableOpacity
                                onPress={() => isMultiFarm && setSwitcherOpen(true)}
                                disabled={!isMultiFarm}
                                activeOpacity={0.62}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 }}
                            >
                                <Text translate={false} style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>
                                    {farmName}
                                </Text>
                                {isMultiFarm && (
                                    <MaterialIcons name="arrow-drop-down" size={16} color={colors.textGrey} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={homeStyles.headerRight}>
                        <TouchableOpacity
                            style={homeStyles.iconButton}
                            onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                        >
                            <View style={{ position: 'relative' }}>
                                <MaterialIcons name="notifications" size={24} color={colors.icon} />
                                {unreadNotifCount > 0 && (
                                    <View style={{
                                        position: 'absolute', top: -3, right: -3,
                                        backgroundColor: '#EF4444', minWidth: 16, height: 16,
                                        borderRadius: 8, justifyContent: 'center', alignItems: 'center',
                                        paddingHorizontal: 3, borderWidth: 2, borderColor: colors.surface,
                                    }}>
                                        <Text style={{ color: '#FFF', fontSize: 9, fontFamily: 'Poppins-Bold' }}>
                                            {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

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
                    {/* Greeting */}
                    <View style={[homeStyles.greetingContainer, { paddingBottom: 16 }]}>
                        <Text style={[textStyles.h1, { fontSize: 26, color: colors.text, lineHeight: 32 }]}>
                            {getGreeting()},
                        </Text>
                        <Text translate={false} style={[textStyles.h1, { fontSize: 26, color: colors.primary, lineHeight: 32 }]}>
                            {userName.split(' ')[0]}!
                        </Text>
                        {lastUpdated && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                                <MaterialIcons name="update" size={12} color={colors.textGrey} />
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                    Updated {timeAgo(lastUpdated)}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={homeStyles.content}>

                        {/* ── Important Alerts (priority-sorted, top of page) ── */}
                        {recentAlerts.length > 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                                <View style={[homeStyles.sectionHeaderRow, { marginBottom: 10, paddingHorizontal: 0 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MaterialIcons name="warning-amber" size={15} color={colors.warning} />
                                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0 }]}>
                                            Important Alerts
                                        </Text>
                                        <View style={{
                                            backgroundColor: colors.error,
                                            borderRadius: 10, minWidth: 18, height: 18,
                                            alignItems: 'center', justifyContent: 'center',
                                            paddingHorizontal: 4,
                                        }}>
                                            <Text style={{ color: '#FFF', fontSize: 10, fontFamily: 'Poppins-Bold' }}>
                                                {recentAlerts.length}
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                    >
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 13 }]}>View All</Text>
                                        <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                {isLoading ? (
                                    <View style={{ gap: 8 }}>
                                        {[0, 1].map(i => (
                                            <View key={i} style={{
                                                height: 60, borderRadius: 14,
                                                backgroundColor: colors.cardFill,
                                            }} />
                                        ))}
                                    </View>
                                ) : (
                                    <View style={{ gap: 8 }}>
                                        {[...recentAlerts]
                                            .sort((a, b) => ALERT_PRIORITY[a.type] - ALERT_PRIORITY[b.type])
                                            .map(alert => {
                                                const { name, color } = alertIcon(alert.type);
                                                return (
                                                    <Pressable
                                                        key={alert.id}
                                                        onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                                                        style={({ pressed }) => ({
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            backgroundColor: color + '12',
                                                            borderWidth: 1,
                                                            borderColor: color + '35',
                                                            borderRadius: 14,
                                                            padding: 12,
                                                            opacity: pressed ? 0.82 : 1,
                                                        })}
                                                    >
                                                        {/* Severity strip */}
                                                        <View style={{
                                                            width: 3, alignSelf: 'stretch',
                                                            backgroundColor: color,
                                                            borderRadius: 4,
                                                        }} />
                                                        <View style={{
                                                            width: 32, height: 32, borderRadius: 9,
                                                            backgroundColor: color + '20',
                                                            alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <MaterialIcons name={name as any} size={17} color={color} />
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text
                                                                style={[textStyles.h3, { color: colors.text, fontSize: 13, lineHeight: 18 }]}
                                                                numberOfLines={1}
                                                            >
                                                                {alert.title}
                                                            </Text>
                                                            <Text
                                                                style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1 }]}
                                                                numberOfLines={1}
                                                            >
                                                                {alert.message}
                                                            </Text>
                                                        </View>
                                                        <MaterialIcons name="chevron-right" size={16} color={colors.textGrey} />
                                                    </Pressable>
                                                );
                                            })}
                                    </View>
                                )}
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
                            <>
                                <Text style={[homeStyles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Quick Actions</Text>
                                <View style={[homeStyles.quickActionsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[homeStyles.quickActionRow, { gap: 4 }]}>
                                        {filteredQuickActions.map(item => (
                                            <Pressable
                                                key={item.label}
                                                style={({ pressed }) => [homeStyles.actionButton, { opacity: pressed ? 0.7 : 1 }]}
                                                onPress={() => router.push(item.route as any)}
                                            >
                                                <View style={[homeStyles.actionIconBox, { backgroundColor: item.color + '15' }]}>
                                                    {item.icon === null ? (
                                                        <Image
                                                            source={require('../../assets/icons/animals-filled.svg')}
                                                            style={{ width: 26, height: 26 }}
                                                            contentFit="contain"
                                                        />
                                                    ) : (
                                                        <MaterialIcons name={item.icon as any} size={24} color={item.color} />
                                                    )}
                                                </View>
                                                <Text style={[textStyles.label, { color: colors.text, marginTop: 8, fontSize: 11 }]}>
                                                    {item.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                            </>
                        )}

                        {/* ── Your Housings ─────────────────────────────────────── */}
                        {showYourHousings && (
                            <View style={[homeStyles.quickActionsCard, { backgroundColor: colors.surface, borderColor: colors.stroke, marginTop: 0, marginBottom: 0 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>Your Housings</Text>
                                    <TouchableOpacity
                                        onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                                    >
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 12 }]}>View All</Text>
                                        <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                {isLoading ? (
                                    [0, 1].map(i => (
                                        <View key={i} style={{ marginBottom: i === 0 ? 14 : 0 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                                <Skeleton w={28} h={28} radius={8} />
                                                <Skeleton w="45%" h={13} />
                                                <View style={{ flex: 1 }} />
                                                <Skeleton w={36} h={13} />
                                                <Skeleton w={32} h={20} radius={5} />
                                            </View>
                                            <Skeleton w="100%" h={4} radius={2} />
                                        </View>
                                    ))
                                ) : housings.length === 0 ? (
                                    <Pressable
                                        onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                        style={{ alignItems: 'center', paddingVertical: 12, gap: 6 }}
                                    >
                                        <MaterialIcons name="add-home" size={26} color={colors.primary} />
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 12 }]}>
                                            Add your first housing
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
                                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                            >
                                                {idx > 0 && (
                                                    <View style={{ height: 1, backgroundColor: colors.stroke, marginVertical: 12 }} />
                                                )}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                                    <View style={{
                                                        width: 28, height: 28, borderRadius: 8,
                                                        backgroundColor: (isPig ? '#E67E22' : '#F1C40F') + '1A',
                                                        alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <AnimalIcon type={h.animal_type} size={15} color={isPig ? '#E67E22' : '#D4A017'} />
                                                    </View>
                                                    <Text numberOfLines={1} style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1, fontFamily: 'Poppins-Medium' }]}>
                                                        {h.name}
                                                    </Text>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                        {h.current_count}/{h.capacity}
                                                    </Text>
                                                    <View style={{ backgroundColor: barColor + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                                                        <Text style={[textStyles.label, { color: barColor, fontSize: 10 }]}>{pct}%</Text>
                                                    </View>
                                                </View>
                                                <View style={{ height: 4, backgroundColor: colors.cardFill, borderRadius: 2, overflow: 'hidden', marginLeft: 38 }}>
                                                    <View style={{ width: `${pct}%` as any, height: 4, backgroundColor: barColor, borderRadius: 2 }} />
                                                </View>
                                            </Pressable>
                                        );
                                    })
                                )}
                            </View>
                        )}

                        {/* ── Today's Activity ─────────────────────────────────── */}
                        {showTodaySection && (
                            <>
                                <View style={[homeStyles.sectionHeaderRow, { marginTop: 20 }]}>
                                    <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0 }]}>
                                        Today
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </Text>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 8 }}>
                                    {/* Feed dispensed today */}
                                    {showFeedActivity && (
                                        <Pressable
                                            onPress={() => router.push('/(devices)/DispenseRecordsScreen' as any)}
                                            style={({ pressed }) => ({
                                                flex: 1, opacity: pressed ? 0.85 : 1,
                                                backgroundColor: colors.surface,
                                                borderRadius: 18, borderWidth: 1, borderColor: colors.stroke,
                                                padding: 16,
                                            })}
                                        >
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                backgroundColor: colors.secondary + '1A',
                                                alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                                            }}>
                                                <MaterialIcons name="grain" size={20} color={colors.secondary} />
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginBottom: 4 }]}>
                                                Feed Dispensed
                                            </Text>
                                            {isLoading
                                                ? <Skeleton w={60} h={24} />
                                                : <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                                                    {formatGrams(todayFeedGrams)}
                                                </Text>
                                            }
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                                                <Text style={[textStyles.body, { color: colors.secondary, fontSize: 11 }]}>View logs</Text>
                                                <MaterialIcons name="arrow-forward" size={11} color={colors.secondary} />
                                            </View>
                                        </Pressable>
                                    )}

                                    {/* Weight sessions today */}
                                    {showWeighActivity && (
                                        <Pressable
                                            onPress={() => router.push('/(devices)/RecentLogsScreen' as any)}
                                            style={({ pressed }) => ({
                                                flex: 1, opacity: pressed ? 0.85 : 1,
                                                backgroundColor: colors.surface,
                                                borderRadius: 18, borderWidth: 1, borderColor: colors.stroke,
                                                padding: 16,
                                            })}
                                        >
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                backgroundColor: '#6C63FF' + '1A',
                                                alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                                            }}>
                                                <MaterialIcons name="monitor-weight" size={20} color="#6C63FF" />
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginBottom: 4 }]}>
                                                Weigh Sessions
                                            </Text>
                                            {isLoading
                                                ? <Skeleton w={36} h={24} />
                                                : <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                                                    {todayWeighSessions}
                                                </Text>
                                            }
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                                                <Text style={[textStyles.body, { color: '#6C63FF', fontSize: 11 }]}>View logs</Text>
                                                <MaterialIcons name="arrow-forward" size={11} color="#6C63FF" />
                                            </View>
                                        </Pressable>
                                    )}
                                </View>
                            </>
                        )}

                        {/* ── 7-Day Health Summary ─────────────────────────────── */}
                        {showMortality && (
                            <View style={{ paddingHorizontal: 20, marginTop: 12, marginBottom: 8 }}>
                                <Pressable
                                    onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                                    style={({ pressed }) => ({
                                        opacity: pressed ? 0.85 : 1,
                                        backgroundColor: weekMortality > 0 ? colors.error + '0D' : colors.surface,
                                        borderRadius: 18, borderWidth: 1,
                                        borderColor: weekMortality > 0 ? colors.error + '30' : colors.stroke,
                                        padding: 16, flexDirection: 'row', alignItems: 'center',
                                    })}
                                >
                                    <View style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        backgroundColor: weekMortality > 0 ? colors.error + '18' : colors.cardFill,
                                        alignItems: 'center', justifyContent: 'center', marginRight: 14,
                                    }}>
                                        <MaterialIcons
                                            name={weekMortality > 0 ? 'warning' : 'health-and-safety'}
                                            size={22}
                                            color={weekMortality > 0 ? colors.error : colors.primary}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                            7-Day Mortality
                                        </Text>
                                        {isLoading
                                            ? <Skeleton w={80} h={12} radius={4} />
                                            : <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                                {weekMortality === 0
                                                    ? 'No deaths recorded this week'
                                                    : `${weekMortality} animal${weekMortality !== 1 ? 's' : ''} deceased this week`}
                                            </Text>
                                        }
                                    </View>
                                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                        {!isLoading && (
                                            <Text style={[textStyles.h2, {
                                                color: weekMortality > 0 ? colors.error : colors.primary,
                                                fontSize: 22,
                                            }]}>
                                                {weekMortality}
                                            </Text>
                                        )}
                                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                                    </View>
                                </Pressable>
                            </View>
                        )}


                    </View>
                </ScrollView>
            </View>

            <FloatingNavBar />
            <FarmSwitcherDrawer visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
            <ProfileDrawer
                visible={profileDrawerOpen}
                onClose={() => setProfileDrawerOpen(false)}
                activeFarmName={farmName}
            />
        </SafeAreaView>
    );
}


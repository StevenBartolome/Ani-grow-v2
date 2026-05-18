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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';

import { useAuth } from '@/context/AuthContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useHomeStyles } from '@/styles/homeStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { AnimalIcon } from '@/components/AnimalIcon';
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
    const { profile } = useAuth();
    const homeStyles = useHomeStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    const farmId = (profile as any)?.farm_id;
    const userId = (profile as any)?.uid || (profile as any)?.id;
    const userName = (profile as any)?.first_name
        ? `${(profile as any).first_name} ${(profile as any).last_name ?? ''}`.trim()
        : (profile as any)?.displayName || 'User';

    // ── State ─────────────────────────────────────────────────────────────────
    const [farmName, setFarmName] = useState('your farm');
    const [totalAnimals, setTotalAnimals] = useState(0);
    const [animalSplit, setAnimalSplit] = useState({ pigs: 0, chickens: 0 });
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

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchStats = useCallback(async () => {
        if (!farmId) { setIsLoading(false); return; }
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayISO = todayStart.toISOString();
            const sevenDaysAgo = new Date(todayStart);
            sevenDaysAgo.setDate(todayStart.getDate() - 7);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

            // ── Round 1: core data ────────────────────────────────────────────
            const [farmRes, batchRes, notifRes, deviceRes, housingRes] = await Promise.all([
                supabase.from('farms').select('name').eq('id', farmId).single(),
                supabase
                    .from('batches')
                    .select('id, current_count, animal_type, housings!inner(farm_id)')
                    .eq('housings.farm_id', farmId)
                    .eq('status', 'active'),
                supabase
                    .from('notifications')
                    .select('id, title, message, type, is_read')
                    .or(userId ? `user_id.eq.${userId},farm_id.eq.${farmId}` : `farm_id.eq.${farmId}`)
                    .eq('is_read', false)
                    .order('created_at', { ascending: false })
                    .limit(5),
                supabase.from('devices').select('id, type, status').eq('farm_id', farmId),
                supabase
                    .from('housings')
                    .select('id, name, animal_type, capacity, current_count')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active')
                    .order('name'),
            ]);

            if (farmRes.data) setFarmName(farmRes.data.name);

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
    }, [farmId, userId]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

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

    return (
        <SafeAreaView style={homeStyles.safeArea}>
            <View style={homeStyles.container}>

                {/* ── Header ─────────────────────────────────────────────────── */}
                <View style={homeStyles.header}>
                    <View style={homeStyles.headerLeft}>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={homeStyles.logo}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 28 }]}>
                            Ani-Grow
                        </Text>
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
                        <TouchableOpacity
                            style={homeStyles.profileIcon}
                            onPress={() => router.push('/(settings)/SettingsScreen' as any)}
                        >
                            <Text style={homeStyles.profileInitial}>{userName.charAt(0).toUpperCase()}</Text>
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
                        <Text style={[textStyles.h1, { fontSize: 26, color: colors.primary, lineHeight: 32 }]}>
                            {userName.split(' ')[0]}!
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}>
                            <MaterialIcons name="location-on" size={13} color={colors.textGrey} />
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                {farmName}
                            </Text>
                            {lastUpdated && (
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                    · {timeAgo(lastUpdated)}
                                </Text>
                            )}
                        </View>
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
                        <View style={[homeStyles.farmStateGrid, { marginBottom: 14 }]}>
                            <View style={homeStyles.farmStateRow}>
                                {/* Total Animals */}
                                <Pressable
                                    onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                                    style={({ pressed }) => [
                                        homeStyles.farmStateCard,
                                        { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
                                    ]}
                                >
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: colors.primary + '1A' }]}>
                                        <Image
                                            source={require('../../assets/icons/animals-filled.svg')}
                                            style={{ width: 18, height: 18 }}
                                            contentFit="contain"
                                        />
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 8, marginBottom: 1 }]}>
                                        Total Animals
                                    </Text>
                                    {isLoading
                                        ? <Skeleton w={40} h={24} />
                                        : <Text style={[textStyles.h1, { color: colors.text, fontSize: 22 }]}>{totalAnimals}</Text>
                                    }
                                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                                        {animalSplit.pigs > 0 && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <AnimalIcon type="Pig" size={10} color={colors.textGrey} />
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>{animalSplit.pigs}</Text>
                                            </View>
                                        )}
                                        {animalSplit.chickens > 0 && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <AnimalIcon type="Chicken" size={10} color={colors.textGrey} />
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>{animalSplit.chickens}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 10 }]}>View animals</Text>
                                        <MaterialIcons name="arrow-forward" size={10} color={colors.primary} />
                                    </View>
                                </Pressable>

                                {/* Active Alerts */}
                                <Pressable
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
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#F97316' + '1A' }]}>
                                        <MaterialIcons name="notifications-active" size={18} color="#F97316" />
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 8, marginBottom: 1 }]}>
                                        Active Alerts
                                    </Text>
                                    {isLoading
                                        ? <Skeleton w={36} h={24} />
                                        : <Text style={[textStyles.h1, { color: unreadNotifCount > 0 ? colors.warning : colors.text, fontSize: 22 }]}>
                                            {unreadNotifCount}
                                        </Text>
                                    }
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10, marginTop: 3 }]}>
                                        {unreadNotifCount === 0 ? 'All clear' : 'Need attention'}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                        <Text style={[textStyles.body, { color: '#F97316', fontSize: 10 }]}>View alerts</Text>
                                        <MaterialIcons name="arrow-forward" size={10} color="#F97316" />
                                    </View>
                                </Pressable>
                            </View>

                            <View style={homeStyles.farmStateRow}>
                                {/* AniFeed */}
                                <Pressable
                                    onPress={() => router.push('/(devices)/DevicesScreen' as any)}
                                    style={({ pressed }) => [
                                        homeStyles.farmStateCard,
                                        { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
                                    ]}
                                >
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#10B981' + '1A' }]}>
                                        <MaterialIcons name="grain" size={18} color="#10B981" />
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 8, marginBottom: 1 }]}>
                                        AniFeed
                                    </Text>
                                    {isLoading
                                        ? <Skeleton w={44} h={24} />
                                        : <Text style={[textStyles.h1, { color: colors.text, fontSize: 22 }]}>
                                            {activeFeeders.online}<Text style={{ fontSize: 12, color: colors.textGrey }}>/{activeFeeders.total}</Text>
                                        </Text>
                                    }
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10, marginTop: 3 }]}>
                                        {activeFeeders.total === 0 ? 'No devices' : 'Online'}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                        <Text style={[textStyles.body, { color: '#10B981', fontSize: 10 }]}>Manage</Text>
                                        <MaterialIcons name="arrow-forward" size={10} color="#10B981" />
                                    </View>
                                </Pressable>

                                {/* AniWeigh */}
                                <Pressable
                                    onPress={() => router.push('/(devices)/DevicesScreen' as any)}
                                    style={({ pressed }) => [
                                        homeStyles.farmStateCard,
                                        { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
                                    ]}
                                >
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#6C63FF' + '1A' }]}>
                                        <MaterialIcons name="monitor-weight" size={18} color="#6C63FF" />
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 8, marginBottom: 1 }]}>
                                        AniWeigh
                                    </Text>
                                    {isLoading
                                        ? <Skeleton w={44} h={24} />
                                        : <Text style={[textStyles.h1, { color: colors.text, fontSize: 22 }]}>
                                            {activeScales.online}<Text style={{ fontSize: 12, color: colors.textGrey }}>/{activeScales.total}</Text>
                                        </Text>
                                    }
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10, marginTop: 3 }]}>
                                        {activeScales.total === 0 ? 'No devices' : 'Online'}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                        <Text style={[textStyles.body, { color: '#6C63FF', fontSize: 10 }]}>Manage</Text>
                                        <MaterialIcons name="arrow-forward" size={10} color="#6C63FF" />
                                    </View>
                                </Pressable>
                            </View>
                        </View>

                        {/* ── Housing Occupancy ────────────────────────────────── */}
                        <View style={[homeStyles.sectionHeaderRow, { marginTop: 4 }]}>
                            <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0 }]}>
                                Your Housings
                            </Text>
                            <TouchableOpacity
                                onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                activeOpacity={0.7}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                                <Text style={[textStyles.body, { color: colors.primary, fontSize: 13 }]}>View All</Text>
                                <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingLeft: 20, paddingRight: 8, paddingBottom: 8 }}
                        >
                            {isLoading ? (
                                [0, 1, 2].map(i => (
                                    <View key={i} style={{
                                        width: 150, marginRight: 12,
                                        backgroundColor: colors.surface,
                                        borderRadius: 18, borderWidth: 1, borderColor: colors.stroke,
                                        padding: 16, gap: 10,
                                    }}>
                                        <Skeleton w={32} h={32} radius={10} />
                                        <Skeleton w="80%" h={14} />
                                        <Skeleton w="60%" h={10} />
                                        <Skeleton w="100%" h={6} radius={3} />
                                    </View>
                                ))
                            ) : housings.length === 0 ? (
                                <Pressable
                                    onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                    style={({ pressed }) => ({
                                        width: 180, opacity: pressed ? 0.8 : 1,
                                        backgroundColor: colors.surface,
                                        borderRadius: 18, borderWidth: 1,
                                        borderColor: colors.stroke, borderStyle: 'dashed',
                                        padding: 20, alignItems: 'center', justifyContent: 'center',
                                    })}
                                >
                                    <MaterialIcons name="add-home" size={28} color={colors.primary} />
                                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 13, marginTop: 8, textAlign: 'center' }]}>
                                        Add Housing
                                    </Text>
                                </Pressable>
                            ) : (
                                housings.map(h => {
                                    const pct = h.capacity > 0 ? Math.min(100, Math.round((h.current_count / h.capacity) * 100)) : 0;
                                    const barColor = occupancyColor(pct, colors);
                                    const isPig = h.animal_type === 'pig';
                                    return (
                                        <Pressable
                                            key={h.id}
                                            onPress={() => router.push({ pathname: '/(animals)/AnimalDetails' as any, params: { housingId: h.id } })}
                                            style={({ pressed }) => ({
                                                width: 150, marginRight: 12, opacity: pressed ? 0.85 : 1,
                                                backgroundColor: colors.surface,
                                                borderRadius: 18, borderWidth: 1, borderColor: colors.stroke,
                                                padding: 16,
                                            })}
                                        >
                                            {/* Animal type icon */}
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                backgroundColor: (isPig ? '#E67E22' : '#F1C40F') + '1A',
                                                alignItems: 'center', justifyContent: 'center',
                                                marginBottom: 12,
                                            }}>
                                                <AnimalIcon type={h.animal_type === 'pig' ? 'Pig' : 'Chicken'} size={20} color={isPig ? '#E67E22' : '#D4A017'} />
                                            </View>

                                            {/* Name */}
                                            <Text numberOfLines={2} style={[textStyles.h3, { color: colors.text, fontSize: 13, lineHeight: 18, marginBottom: 4 }]}>
                                                {h.name}
                                            </Text>

                                            {/* Count / Capacity */}
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginBottom: 8 }]}>
                                                <Text style={{ color: barColor, fontFamily: 'Poppins-SemiBold' }}>{h.current_count}</Text>
                                                {' / '}{h.capacity}
                                            </Text>

                                            {/* Progress bar */}
                                            <View style={{ height: 5, backgroundColor: colors.cardFill, borderRadius: 3, overflow: 'hidden' }}>
                                                <View style={{ width: `${pct}%`, height: 5, backgroundColor: barColor, borderRadius: 3 }} />
                                            </View>

                                            {/* Pct label */}
                                            <Text style={[textStyles.body, { color: barColor, fontSize: 10, marginTop: 4 }]}>
                                                {pct}% full
                                            </Text>
                                        </Pressable>
                                    );
                                })
                            )}
                        </ScrollView>

                        {/* ── Today's Activity ─────────────────────────────────── */}
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
                                    backgroundColor: '#10B981' + '1A',
                                    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                                }}>
                                    <MaterialIcons name="grain" size={20} color="#10B981" />
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
                                    <Text style={[textStyles.body, { color: '#10B981', fontSize: 11 }]}>View logs</Text>
                                    <MaterialIcons name="arrow-forward" size={11} color="#10B981" />
                                </View>
                            </Pressable>

                            {/* Weight sessions today */}
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
                        </View>

                        {/* ── 7-Day Health Summary ─────────────────────────────── */}
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

                        {/* ── Quick Actions ─────────────────────────────────────── */}
                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Quick Actions</Text>
                        <View style={[homeStyles.quickActionsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                            <View style={[homeStyles.quickActionRow, { gap: 4 }]}>
                                {[
                                    { label: 'Feeds', icon: 'grain', route: '/(devices)/ManageFeedsScreen', color: '#10B981' },
                                    { label: 'Devices', icon: 'devices', route: '/(devices)/DevicesScreen', color: '#6C63FF' },
                                    { label: 'Animals', icon: null, route: '/(animals)/AnimalsScreen', color: colors.primary },
                                    { label: 'Housings', icon: 'home-work', route: '/(devices)/ManageHousingsScreen', color: '#F97316' },
                                    { label: 'Health', icon: 'medical-services', route: '/(animals)/AnimalsScreen', color: '#EF4444' },
                                ].map(item => (
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

                    </View>
                </ScrollView>

                <FloatingNavBar />
            </View>
        </SafeAreaView>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
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
import { Header } from '@/components/Header';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'low' | 'medium' | 'high';
type RecordType = 'vaccination' | 'treatment' | 'observation' | 'illness' | 'deworming' | 'vitamins' | 'mortality';

interface HealthCase {
    id: string;
    record_type: RecordType;
    title: string;
    notes: string | null;
    severity: Severity;
    record_date: string;
    medication: string | null;
    affected_count: number | null;
    followup_date: string | null;
    batch_name: string;
    housing_name: string;
    animal_type: string;
}

interface FollowUp {
    id: string;
    title: string;
    record_type: RecordType;
    followup_date: string;
    severity: Severity;
    batch_name: string;
    housing_name: string;
    medication: string | null;
    notes: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const RECORD_META: Record<RecordType, { label: string; icon: string; color: string }> = {
    vaccination: { label: 'Vaccination', icon: 'vaccines', color: '#27AE60' },
    treatment: { label: 'Treatment', icon: 'healing', color: '#2980B9' },
    illness: { label: 'Illness', icon: 'sick', color: '#E74C3C' },
    observation: { label: 'Observation', icon: 'visibility', color: '#8E44AD' },
    deworming: { label: 'Deworming', icon: 'bug-report', color: '#E67E22' },
    vitamins: { label: 'Vitamins', icon: 'medical-services', color: '#16A085' },
    mortality: { label: 'Mortality', icon: 'remove-circle', color: '#7F1D1D' },
};

const SEVERITY_COLOR: Record<Severity, string> = {
    low: '#27AE60',
    medium: '#E67E22',
    high: '#E74C3C',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date | null): string {
    if (!date) return '';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function daysUntil(dateStr: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function VetDashboardScreen() {
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { profile, hasPermission } = useAuth();
    const homeStyles = useHomeStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();
    const { activeFarmIds, managedFarms } = useFarmFilter();

    const userName = (profile as any)?.first_name
        ? `${(profile as any).first_name} ${(profile as any).last_name ?? ''}`.trim()
        : (profile as any)?.displayName || 'Veterinarian';

    const farmName = useMemo(() => {
        if (activeFarmIds.length === 0) return 'All Managed Farms';
        if (activeFarmIds.length === 1) {
            const found = managedFarms.find(f => f.id === activeFarmIds[0]);
            return (found as any)?.farm_name || found?.name || 'Active Farm';
        }
        return `${activeFarmIds.length} Farms Selected`;
    }, [activeFarmIds, managedFarms]);

    // ── State ─────────────────────────────────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Stats
    const [totalAnimals, setTotalAnimals] = useState(0);
    const [openCases, setOpenCases] = useState(0);
    const [weekMortality, setWeekMortality] = useState(0);
    const [dueFollowUps, setDueFollowUps] = useState(0);

    // Lists
    const [todayFollowUps, setTodayFollowUps] = useState<FollowUp[]>([]);
    const [upcomingFollowUps, setUpcomingFollowUps] = useState<FollowUp[]>([]);
    const [recentCases, setRecentCases] = useState<HealthCase[]>([]);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!activeFarmIds.length) { setIsLoading(false); return; }

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];
            const in14Days = new Date(today); in14Days.setDate(today.getDate() + 14);
            const in14DaysStr = in14Days.toISOString().split('T')[0];
            const ago7Days = new Date(today); ago7Days.setDate(today.getDate() - 7);
            const ago7DaysStr = ago7Days.toISOString().split('T')[0];
            const ago30Days = new Date(today); ago30Days.setDate(today.getDate() - 30);
            const ago30DaysStr = ago30Days.toISOString().split('T')[0];

            // ── 1. Total live animals across all active batches ───────────────
            const { data: batchData } = await supabase
                .from('batches')
                .select('current_count, housings!inner(farm_id)')
                .in('housings.farm_id', activeFarmIds)
                .eq('status', 'active');

            const total = (batchData ?? []).reduce(
                (sum: number, b: any) => sum + (b.current_count ?? 0), 0
            );
            setTotalAnimals(total);

            // ── 2. Health records with housing + batch join ───────────────────
            const { data: hrData } = await supabase
                .from('health_records')
                .select(`
                    id, record_type, title, notes, severity,
                    record_date, medication, affected_count,
                    followup_date, created_at,
                    batches(id, name, animal_type, housings(id, name, farm_id))
                `)
                .in('batches.housings.farm_id', activeFarmIds)
                .is('deleted_at', null)
                .order('record_date', { ascending: false });

            const records: any[] = (hrData ?? []).filter(
                (r: any) => r.batches?.housings?.farm_id &&
                    activeFarmIds.includes(r.batches.housings.farm_id)
            );

            // Week mortality
            const mortality = records
                .filter((r: any) => r.record_type === 'mortality' && r.record_date >= ago7DaysStr)
                .reduce((sum: number, r: any) => sum + (r.affected_count ?? 0), 0);
            setWeekMortality(mortality);

            // Open cases = illness/treatment/observation in last 30 days
            const open = records.filter(
                (r: any) =>
                    ['illness', 'treatment', 'observation'].includes(r.record_type) &&
                    r.record_date >= ago30DaysStr
            ).length;
            setOpenCases(open);

            // Follow-ups due today or in next 14 days
            const followUpRecords = records.filter(
                (r: any) => r.followup_date && r.followup_date >= todayStr && r.followup_date <= in14DaysStr
            );
            setDueFollowUps(followUpRecords.length);

            const toFollowUp = (r: any): FollowUp => ({
                id: r.id,
                title: r.title,
                record_type: r.record_type,
                followup_date: r.followup_date,
                severity: r.severity,
                batch_name: r.batches?.name ?? '—',
                housing_name: r.batches?.housings?.name ?? '—',
                medication: r.medication,
                notes: r.notes,
            });

            const todayFU = followUpRecords
                .filter((r: any) => r.followup_date === todayStr)
                .sort((a: any, b: any) => (SEVERITY_COLOR[b.severity as Severity] > SEVERITY_COLOR[a.severity as Severity] ? 1 : -1))
                .map(toFollowUp);
            setTodayFollowUps(todayFU);

            const upcomingFU = followUpRecords
                .filter((r: any) => r.followup_date > todayStr)
                .sort((a: any, b: any) => a.followup_date.localeCompare(b.followup_date))
                .slice(0, 10)
                .map(toFollowUp);
            setUpcomingFollowUps(upcomingFU);

            // Recent cases (last 30 days, illness/treatment/observation/mortality)
            const recent: HealthCase[] = records
                .filter(
                    (r: any) =>
                        ['illness', 'treatment', 'observation', 'mortality'].includes(r.record_type) &&
                        r.record_date >= ago30DaysStr
                )
                .slice(0, 12)
                .map((r: any) => ({
                    id: r.id,
                    record_type: r.record_type,
                    title: r.title,
                    notes: r.notes,
                    severity: r.severity,
                    record_date: r.record_date,
                    medication: r.medication,
                    affected_count: r.affected_count,
                    followup_date: r.followup_date,
                    batch_name: r.batches?.name ?? '—',
                    housing_name: r.batches?.housings?.name ?? '—',
                    animal_type: r.batches?.animal_type ?? '',
                }));
            setRecentCases(recent);

            setLastUpdated(new Date());
        } catch (err) {
            console.error('[VetDashboard] fetch error:', err);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [activeFarmIds]);

    useEffect(() => {
        if (activeFarmIds.length > 0) fetchData();
    }, [fetchData, activeFarmIds]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    // ── Greeting ──────────────────────────────────────────────────────────────
    const getGreeting = () => {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return 'Good morning';
        if (h >= 12 && h < 18) return 'Good afternoon';
        return 'Good evening';
    };

    // ── Stat Card (matches HomeScreen.tsx layout & style tokens) ──────────────
    const StatCard = ({
        label, value, icon, customIcon, iconBg, onPress, badge,
    }: {
        label: string;
        value: number;
        icon?: string;
        customIcon?: React.ReactNode;
        iconBg: string;
        onPress?: () => void;
        badge?: { text: string; color: string };
    }) => (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
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
                        backgroundColor: iconBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {customIcon ? customIcon : (
                            <MaterialIcons name={icon as any} size={20} color={badge?.color || colors.primary} />
                        )}
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                </View>

                {isLoading ? (
                    <Skeleton w={45} h={26} />
                ) : (
                    <Text style={[textStyles.h1, { color: colors.text, fontSize: 26, lineHeight: 30, fontFamily: 'Poppins-Bold' }]}>
                        {value.toLocaleString()}
                    </Text>
                )}
                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1, fontFamily: 'Poppins-Medium' }]}>
                    {label}
                </Text>
            </View>

            {badge && (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 10,
                    backgroundColor: badge.color + '18',
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: badge.color }} />
                    <Text style={[textStyles.body, { color: badge.color, fontSize: 10, fontFamily: 'Poppins-SemiBold' }]}>
                        {badge.text}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );

    // ── Follow-up & Booster Item Row ──────────────────────────────────────────
    const FollowUpItem = ({ item, isToday, isLast }: { item: FollowUp; isToday: boolean; isLast: boolean }) => {
        const meta = RECORD_META[item.record_type] ?? RECORD_META.observation;
        const sevColor = SEVERITY_COLOR[item.severity] ?? '#888';
        const days = daysUntil(item.followup_date);
        const isPrev = ['vaccination', 'deworming', 'vitamins'].includes(item.record_type);
        const noun = item.record_type === 'vaccination' ? 'Booster' : item.record_type === 'deworming' ? 'Repeat Deworm' : item.record_type === 'vitamins' ? 'Next Dose' : 'Follow-up';

        return (
            <View>
                <Pressable
                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                    style={({ pressed }) => ({
                        paddingVertical: 12,
                        opacity: pressed ? 0.75 : 1,
                    })}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        {/* Icon Box */}
                        <View style={{
                            width: 36,
                            height: 36,
                            borderRadius: 11,
                            backgroundColor: meta.color + '1A',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <MaterialIcons name={meta.icon as any} size={18} color={meta.color} />
                        </View>

                        {/* Content */}
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                <Text
                                    style={[textStyles.h3, { color: colors.text, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', flex: 1 }]}
                                    numberOfLines={1}
                                >
                                    {item.title}
                                </Text>
                                <View style={{
                                    backgroundColor: isToday ? colors.error + '1E' : days <= 3 ? '#F59E0B1E' : colors.cardFill,
                                    borderRadius: 6,
                                    paddingHorizontal: 7,
                                    paddingVertical: 2,
                                    marginLeft: 8,
                                }}>
                                    <Text style={[textStyles.body, {
                                        fontSize: 10,
                                        fontFamily: 'Poppins-Bold',
                                        color: isToday ? colors.error : days <= 3 ? '#D97706' : colors.textGrey,
                                    }]}>
                                        {isToday ? `${noun} Today` : `${noun} in ${days}d`}
                                    </Text>
                                </View>
                            </View>

                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                {item.batch_name} · {item.housing_name}
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                <View style={{
                                    backgroundColor: meta.color + '15',
                                    borderRadius: 5,
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                }}>
                                    <Text style={{ color: meta.color, fontSize: 9.5, fontFamily: 'Poppins-Bold' }}>
                                        {meta.label}
                                    </Text>
                                </View>
                                {!isPrev && (
                                    <View style={{
                                        backgroundColor: sevColor + '15',
                                        borderRadius: 5,
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                    }}>
                                        <Text style={{ color: sevColor, fontSize: 9.5, fontFamily: 'Poppins-Bold', textTransform: 'capitalize' }}>
                                            {item.severity}
                                        </Text>
                                    </View>
                                )}
                                {item.medication && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10.5 }]} numberOfLines={1}>
                                        💊 {item.medication}
                                    </Text>
                                )}
                            </View>

                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 5 }]}>
                                {isPrev ? `${noun} Due:` : 'Follow-up:'} <Text style={{ color: colors.text, fontFamily: 'Poppins-Medium' }}>{fmtDate(item.followup_date)}</Text>
                            </Text>
                        </View>
                    </View>
                </Pressable>
                {!isLast && <View style={{ height: 1, backgroundColor: colors.stroke, marginVertical: 2 }} />}
            </View>
        );
    };

    // ── Health Case Row ───────────────────────────────────────────────────────
    const CaseRow = ({ item, isLast }: { item: HealthCase; isLast: boolean }) => {
        const meta = RECORD_META[item.record_type] ?? RECORD_META.observation;
        const sevColor = SEVERITY_COLOR[item.severity] ?? '#888';

        return (
            <View>
                <Pressable
                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                    style={({ pressed }) => ({
                        paddingVertical: 10,
                        opacity: pressed ? 0.75 : 1,
                    })}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{
                            width: 36,
                            height: 36,
                            borderRadius: 11,
                            backgroundColor: meta.color + '18',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <MaterialIcons name={meta.icon as any} size={18} color={meta.color} />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text
                                style={[textStyles.h3, { color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1 }]}>
                                {item.batch_name} · {item.housing_name}
                            </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <View style={{
                                backgroundColor: sevColor + '1A',
                                borderRadius: 6,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                            }}>
                                <Text style={{ color: sevColor, fontSize: 10, fontFamily: 'Poppins-Bold', textTransform: 'capitalize' }}>
                                    {item.severity}
                                </Text>
                            </View>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]}>
                                {fmtDate(item.record_date)}
                            </Text>
                        </View>
                    </View>
                </Pressable>
                {!isLast && <View style={{ height: 1, backgroundColor: colors.stroke }} />}
            </View>
        );
    };

    // ── Quick Actions Config ──────────────────────────────────────────────────
    const quickActions = [
        { label: 'Add Record', icon: 'medical-services', route: '/(animals)/HealthRecordsScreen', color: '#E74C3C' },
        { label: 'Animals', icon: null, route: '/(animals)/AnimalsScreen', color: colors.primary },
        { label: 'Housings', icon: 'home-work', route: '/(devices)/ManageHousingsScreen', color: '#F97316' },
        { label: 'Alerts', icon: 'notifications-active', route: '/(dashboard)/NotificationScreen', color: '#2980B9' },
    ];

    // ── Render ────────────────────────────────────────────────────────────────
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
                    {/* ── Hero Greeting (matches HomeScreen) ──────────────────── */}
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
                                flexShrink: 1,
                                maxWidth: '70%',
                            }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E74C3C' }} />
                                <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.text, flexShrink: 1 }}>
                                    {farmName || 'Veterinarian Portal'}
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
                            {openCases > 0
                                ? `${openCases} active health case${openCases > 1 ? 's' : ''} require veterinary attention`
                                : 'All livestock health indicators stable and clear'}
                        </Text>
                    </View>

                    <View style={homeStyles.content}>

                        {/* ── Stat Cards 2×2 Grid (matches HomeScreen) ────────── */}
                        <View style={{ paddingHorizontal: 20, gap: 12, marginBottom: 14 }}>
                            {/* Row 1 */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <StatCard
                                    label="Live Animals"
                                    value={totalAnimals}
                                    customIcon={
                                        <Image
                                            source={require('../../assets/icons/animals-filled.svg')}
                                            style={{ width: 20, height: 20 }}
                                            contentFit="contain"
                                        />
                                    }
                                    iconBg={colors.primary + '1A'}
                                    onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                                    badge={{ text: 'Active Batches', color: colors.primary }}
                                />
                                <StatCard
                                    label="Open Cases"
                                    value={openCases}
                                    icon="sick"
                                    iconBg="#E74C3C1A"
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                    badge={openCases > 0
                                        ? { text: 'Needs review', color: '#E74C3C' }
                                        : { text: 'All clear', color: '#10B981' }
                                    }
                                />
                            </View>

                            {/* Row 2 */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <StatCard
                                    label="Follow-ups"
                                    value={dueFollowUps}
                                    icon="event-available"
                                    iconBg="#2980B91A"
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                    badge={dueFollowUps > 0
                                        ? { text: 'Next 14 days', color: '#2980B9' }
                                        : { text: 'Up to date', color: '#10B981' }
                                    }
                                />
                                <StatCard
                                    label="Week Mortality"
                                    value={weekMortality}
                                    icon="remove-circle"
                                    iconBg={weekMortality > 0 ? colors.error + '1A' : colors.primary + '1A'}
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                    badge={weekMortality === 0
                                        ? { text: 'None this week', color: '#10B981' }
                                        : { text: 'Last 7 days', color: colors.error }
                                    }
                                />
                            </View>
                        </View>

                        {/* ── Quick Actions ─────────────────────────────────── */}
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
                                    {quickActions.map(item => (
                                        <Pressable
                                            key={item.label}
                                            style={({ pressed }) => [homeStyles.actionButton, { opacity: pressed ? 0.72 : 1 }]}
                                            onPress={() => router.push(item.route as any)}
                                        >
                                            <View style={{ alignItems: 'center', width: '100%' }}>
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
                                                <View style={{ width: '100%', alignItems: 'center', justifyContent: 'flex-start', marginTop: 6, minHeight: 28 }}>
                                                    <Text
                                                        style={[
                                                            textStyles.label,
                                                            {
                                                                color: colors.text,
                                                                fontSize: 10.5,
                                                                lineHeight: 14,
                                                                textAlign: 'center',
                                                                fontFamily: 'Poppins-Medium',
                                                                width: '100%',
                                                                maxWidth: 70,
                                                            },
                                                        ]}
                                                    >
                                                        {item.label}
                                                    </Text>
                                                </View>
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        </View>

                        {/* ── Today's Follow-ups ───────────────────────────── */}
                        {todayFollowUps.length > 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MaterialIcons name="today" size={16} color={colors.error} />
                                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 16 }]}>
                                            Today's Follow-ups
                                        </Text>
                                        <View style={{
                                            backgroundColor: colors.error,
                                            borderRadius: 10,
                                            minWidth: 20,
                                            height: 18,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            paddingHorizontal: 6,
                                        }}>
                                            <Text style={{ color: '#FFF', fontSize: 10, fontFamily: 'Poppins-Bold' }}>
                                                {todayFollowUps.length}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={{
                                    backgroundColor: colors.surface,
                                    borderRadius: 18,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    paddingHorizontal: 16,
                                    paddingVertical: 4,
                                    ...Platform.select({
                                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                        android: { elevation: 2 },
                                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                    }),
                                }}>
                                    {todayFollowUps.map((fu, idx) => (
                                        <FollowUpItem
                                            key={fu.id}
                                            item={fu}
                                            isToday={true}
                                            isLast={idx === todayFollowUps.length - 1}
                                        />
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* ── Upcoming Follow-ups ──────────────────────────── */}
                        {upcomingFollowUps.length > 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <MaterialIcons name="event" size={16} color="#2980B9" />
                                        <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 16 }]}>
                                            Upcoming Follow-ups
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
                                                {upcomingFollowUps.length}
                                            </Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
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
                                    paddingHorizontal: 16,
                                    paddingVertical: 4,
                                    ...Platform.select({
                                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                        android: { elevation: 2 },
                                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                    }),
                                }}>
                                    {upcomingFollowUps.map((fu, idx) => (
                                        <FollowUpItem
                                            key={fu.id}
                                            item={fu}
                                            isToday={false}
                                            isLast={idx === upcomingFollowUps.length - 1}
                                        />
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* ── No follow-ups scheduled placeholder ─────────── */}
                        {!isLoading && todayFollowUps.length === 0 && upcomingFollowUps.length === 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                                <View style={{
                                    backgroundColor: colors.surface,
                                    borderRadius: 18,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    padding: 20,
                                    alignItems: 'center',
                                    gap: 8,
                                    ...Platform.select({
                                        ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                        android: { elevation: 2 },
                                        default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                    }),
                                }}>
                                    <View style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 12,
                                        backgroundColor: '#10B98118',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="check-circle" size={24} color="#10B981" />
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }]}>
                                        No follow-ups due
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11.5, textAlign: 'center' }]}>
                                        All scheduled follow-ups and booster doses are complete.
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* ── Recent Health Cases ──────────────────────────── */}
                        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialIcons name="healing" size={16} color="#E74C3C" />
                                    <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0, fontSize: 16 }]}>
                                        Recent Health Cases
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
                                            {recentCases.length}
                                        </Text>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
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
                                paddingHorizontal: 16,
                                paddingVertical: 4,
                                ...Platform.select({
                                    ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
                                    android: { elevation: 2 },
                                    default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' } as any,
                                }),
                            }}>
                                {isLoading ? (
                                    <View style={{ paddingVertical: 12, gap: 14 }}>
                                        {[0, 1, 2].map(i => (
                                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                <Skeleton w={36} h={36} radius={11} />
                                                <View style={{ flex: 1, gap: 6 }}>
                                                    <Skeleton w="60%" h={12} />
                                                    <Skeleton w="40%" h={10} />
                                                </View>
                                                <Skeleton w={44} h={20} radius={6} />
                                            </View>
                                        ))}
                                    </View>
                                ) : recentCases.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 20, gap: 6 }}>
                                        <MaterialIcons name="health-and-safety" size={28} color={colors.primary} />
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, textAlign: 'center' }]}>
                                            No health cases recorded in the last 30 days
                                        </Text>
                                    </View>
                                ) : (
                                    recentCases.map((item, idx) => (
                                        <CaseRow
                                            key={item.id}
                                            item={item}
                                            isLast={idx === recentCases.length - 1}
                                        />
                                    ))
                                )}
                            </View>
                        </View>

                    </View>
                </ScrollView>
            </View>

            <FloatingNavBar />
        </View>
    );
}

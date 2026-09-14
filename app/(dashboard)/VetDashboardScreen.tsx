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
    return `${Math.floor(diff / 3600)}h ago`;
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function VetDashboardScreen() {
    const { profile } = useAuth();
    const homeStyles = useHomeStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();
    const { activeFarmIds } = useFarmFilter();

    const userName = (profile as any)?.first_name
        ? `${(profile as any).first_name} ${(profile as any).last_name ?? ''}`.trim()
        : (profile as any)?.displayName || 'Veterinarian';

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

    // ── Skeleton ──────────────────────────────────────────────────────────────
    const Skeleton = ({ w, h, radius = 8 }: { w: number | string; h: number; radius?: number }) => (
        <View style={{ width: w as any, height: h, borderRadius: radius, backgroundColor: colors.cardFill }} />
    );

    // ── Stat Card ─────────────────────────────────────────────────────────────
    const StatCard = ({
        label, value, icon, customIcon, iconColor, iconBg, onPress, badge,
    }: {
        label: string;
        value: number;
        icon?: string;
        customIcon?: React.ReactNode;
        iconColor: string;
        iconBg: string;
        onPress?: () => void;
        badge?: { text: string; color: string };
    }) => (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                homeStyles.farmStateCard,
                { backgroundColor: colors.surface, borderColor: colors.stroke, opacity: pressed ? 0.85 : 1 },
            ]}
        >
            <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: iconBg }]}>
                        {customIcon ? customIcon : (
                            <MaterialIcons name={icon as any} size={18} color={iconColor} />
                        )}
                    </View>
                    {onPress && <MaterialIcons name="chevron-right" size={14} color={colors.textGrey} />}
                </View>
                {isLoading
                    ? <Skeleton w={40} h={24} />
                    : <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>{value}</Text>
                }
                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                    {label}
                </Text>
            </View>
            {badge && !isLoading && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
                    backgroundColor: badge.color + '1A', borderRadius: 6,
                    paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start',
                }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: badge.color }} />
                    <Text style={[textStyles.body, { color: badge.color, fontSize: 10 }]}>{badge.text}</Text>
                </View>
            )}
        </Pressable>
    );

    // ── Follow-up Card ────────────────────────────────────────────────────────
    const FollowUpCard = ({ item, isToday }: { item: FollowUp; isToday: boolean }) => {
        const meta = RECORD_META[item.record_type] ?? RECORD_META.observation;
        const sevColor = SEVERITY_COLOR[item.severity] ?? '#888';
        const days = daysUntil(item.followup_date);
        const urgentBg = isToday
            ? colors.error + '0D'
            : days <= 3
                ? colors.warning + '0D'
                : colors.surface;
        const urgentBorder = isToday
            ? colors.error + '35'
            : days <= 3
                ? colors.warning + '35'
                : colors.stroke;

        return (
            <Pressable
                onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                style={({ pressed }) => ({
                    backgroundColor: urgentBg,
                    borderWidth: 1,
                    borderColor: urgentBorder,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    opacity: pressed ? 0.82 : 1,
                })}
            >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    {/* Severity strip */}
                    <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: sevColor, borderRadius: 4 }} />

                    {/* Icon */}
                    <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: meta.color + '18',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <MaterialIcons name={meta.icon as any} size={18} color={meta.color} />
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text
                                style={[textStyles.h3, { color: colors.text, fontSize: 13, flex: 1 }]}
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                            <View style={{
                                backgroundColor: isToday ? colors.error + '20' : days <= 3 ? colors.warning + '20' : colors.cardFill,
                                borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8,
                            }}>
                                <Text style={[textStyles.body, {
                                    fontSize: 10, fontFamily: 'Poppins-SemiBold',
                                    color: isToday ? colors.error : days <= 3 ? colors.warning : colors.textGrey,
                                }]}>
                                    {isToday ? 'Today' : `in ${days}d`}
                                </Text>
                            </View>
                        </View>

                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                            {item.batch_name} · {item.housing_name}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <View style={{
                                backgroundColor: meta.color + '15', borderRadius: 6,
                                paddingHorizontal: 6, paddingVertical: 2,
                            }}>
                                <Text style={[textStyles.body, { color: meta.color, fontSize: 10, fontFamily: 'Poppins-SemiBold' }]}>
                                    {meta.label}
                                </Text>
                            </View>
                            <View style={{
                                backgroundColor: sevColor + '15', borderRadius: 6,
                                paddingHorizontal: 6, paddingVertical: 2,
                            }}>
                                <Text style={[textStyles.body, { color: sevColor, fontSize: 10, fontFamily: 'Poppins-SemiBold', textTransform: 'capitalize' }]}>
                                    {item.severity}
                                </Text>
                            </View>
                            {item.medication && (
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10 }]} numberOfLines={1}>
                                    💊 {item.medication}
                                </Text>
                            )}
                        </View>

                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 4 }]}>
                            Follow-up: <Text style={{ color: colors.text, fontFamily: 'Poppins-Medium' }}>{fmtDate(item.followup_date)}</Text>
                        </Text>
                    </View>
                </View>
            </Pressable>
        );
    };

    // ── Health Case Row ───────────────────────────────────────────────────────
    const CaseRow = ({ item, isLast }: { item: HealthCase; isLast: boolean }) => {
        const meta = RECORD_META[item.record_type] ?? RECORD_META.observation;
        const sevColor = SEVERITY_COLOR[item.severity] ?? '#888';

        return (
            <>
                <Pressable
                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                        <View style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: meta.color + '18',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <MaterialIcons name={meta.icon as any} size={18} color={meta.color} />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text
                                style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}
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
                                backgroundColor: sevColor + '1A', borderRadius: 6,
                                paddingHorizontal: 6, paddingVertical: 2,
                            }}>
                                <Text style={[textStyles.body, { color: sevColor, fontSize: 10, fontFamily: 'Poppins-SemiBold', textTransform: 'capitalize' }]}>
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
            </>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={homeStyles.safeArea}>
            <View style={homeStyles.container}>

                <Header />

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
                    {/* ── Greeting ─────────────────────────────────────────── */}
                    <View style={[homeStyles.greetingContainer, { paddingBottom: 16 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <View style={{
                                backgroundColor: '#E74C3C' + '1A',
                                paddingHorizontal: 10, paddingVertical: 4,
                                borderRadius: 20,
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                            }}>
                                <MaterialIcons name="medical-services" size={12} color="#E74C3C" />
                                <Text style={{ color: '#E74C3C', fontFamily: 'Poppins-SemiBold', fontSize: 11 }}>
                                    Veterinarian Dashboard
                                </Text>
                            </View>
                        </View>
                        <Text style={[textStyles.h1, { fontSize: 26, color: colors.text, lineHeight: 32 }]}>
                            {getGreeting()},
                        </Text>
                        <Text translate={false} style={[textStyles.h1, { fontSize: 26, color: '#E74C3C', lineHeight: 32 }]}>
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

                        {/* ── Stat Cards 2×2 ───────────────────────────────── */}
                        <View style={[homeStyles.farmStateGrid, { marginBottom: 20 }]}>
                            {/* Row 1 */}
                            <View style={homeStyles.farmStateRow}>
                                <StatCard
                                    label="Total Animals"
                                    value={totalAnimals}
                                    customIcon={
                                        <Image
                                            source={require('../../assets/icons/animals-filled.svg')}
                                            style={{ width: 18, height: 18 }}
                                            contentFit="contain"
                                        />
                                    }
                                    iconColor={colors.primary}
                                    iconBg={colors.primary + '1A'}
                                    onPress={() => router.push('/(animals)/AnimalsScreen' as any)}
                                    badge={{ text: 'Live', color: colors.primary }}
                                />
                                <StatCard
                                    label="Open Cases"
                                    value={openCases}
                                    icon="sick"
                                    iconColor="#E74C3C"
                                    iconBg="#E74C3C1A"
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                    badge={openCases > 0
                                        ? { text: 'Active', color: '#E74C3C' }
                                        : { text: 'All clear', color: '#27AE60' }
                                    }
                                />
                            </View>

                            {/* Row 2 */}
                            <View style={homeStyles.farmStateRow}>
                                <StatCard
                                    label="Follow-ups Due"
                                    value={dueFollowUps}
                                    icon="event-available"
                                    iconColor="#2980B9"
                                    iconBg="#2980B91A"
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                    badge={dueFollowUps > 0
                                        ? { text: 'Next 14 days', color: '#2980B9' }
                                        : { text: 'None due', color: '#27AE60' }
                                    }
                                />
                                <StatCard
                                    label="Week Mortality"
                                    value={weekMortality}
                                    icon="warning"
                                    iconColor={weekMortality > 0 ? colors.error : colors.primary}
                                    iconBg={weekMortality > 0 ? colors.error + '1A' : colors.primary + '1A'}
                                    badge={weekMortality === 0
                                        ? { text: 'None this week', color: '#27AE60' }
                                        : { text: 'Last 7 days', color: colors.error }
                                    }
                                />
                            </View>
                        </View>

                        {/* ── Today's Follow-ups ───────────────────────────── */}
                        {todayFollowUps.length > 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={{
                                            width: 28, height: 28, borderRadius: 8,
                                            backgroundColor: colors.error + '18',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <MaterialIcons name="today" size={16} color={colors.error} />
                                        </View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>
                                            Today's Follow-ups
                                        </Text>
                                        <View style={{
                                            backgroundColor: colors.error,
                                            borderRadius: 10, minWidth: 18, height: 18,
                                            alignItems: 'center', justifyContent: 'center',
                                            paddingHorizontal: 4,
                                        }}>
                                            <Text style={{ color: '#FFF', fontSize: 10, fontFamily: 'Poppins-Bold' }}>
                                                {todayFollowUps.length}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {todayFollowUps.map(fu => (
                                    <FollowUpCard key={fu.id} item={fu} isToday={true} />
                                ))}
                            </View>
                        )}

                        {/* ── Upcoming Follow-ups ──────────────────────────── */}
                        {upcomingFollowUps.length > 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={{
                                            width: 28, height: 28, borderRadius: 8,
                                            backgroundColor: '#2980B9' + '18',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <MaterialIcons name="event" size={16} color="#2980B9" />
                                        </View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>
                                            Upcoming Follow-ups
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                                    >
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 12 }]}>View All</Text>
                                        <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>

                                {upcomingFollowUps.map(fu => (
                                    <FollowUpCard key={fu.id} item={fu} isToday={false} />
                                ))}
                            </View>
                        )}

                        {/* ── No follow-ups empty state ────────────────────── */}
                        {!isLoading && todayFollowUps.length === 0 && upcomingFollowUps.length === 0 && (
                            <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
                                <View style={{
                                    backgroundColor: '#27AE60' + '0D',
                                    borderWidth: 1, borderColor: '#27AE60' + '35',
                                    borderRadius: 16, padding: 20,
                                    alignItems: 'center', gap: 8,
                                }}>
                                    <MaterialIcons name="check-circle" size={32} color="#27AE60" />
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, textAlign: 'center' }]}>
                                        No follow-ups scheduled
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, textAlign: 'center' }]}>
                                        All scheduled follow-ups are up to date in the next 14 days.
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* ── Recent Health Cases ──────────────────────────── */}
                        <View style={[homeStyles.quickActionsCard, {
                            backgroundColor: colors.surface,
                            borderColor: colors.stroke,
                            marginTop: 0, marginBottom: 0,
                        }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={{
                                        width: 28, height: 28, borderRadius: 8,
                                        backgroundColor: '#E74C3C' + '18',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="healing" size={16} color="#E74C3C" />
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>
                                        Recent Health Cases
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                    activeOpacity={0.7}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                                >
                                    <Text style={[textStyles.body, { color: colors.primary, fontSize: 12 }]}>View All</Text>
                                    <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
                                </TouchableOpacity>
                            </View>

                            {isLoading ? (
                                <View style={{ gap: 14 }}>
                                    {[0, 1, 2].map(i => (
                                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <Skeleton w={36} h={36} radius={10} />
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
                                        No health cases in the last 30 days
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

                        {/* ── Quick Action: Add Health Record ──────────────── */}
                        <View style={{ paddingHorizontal: 20, marginTop: 20, marginBottom: 8 }}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => router.push('/(animals)/HealthRecordsScreen' as any)}
                                style={{
                                    backgroundColor: '#E74C3C',
                                    borderRadius: 18,
                                    padding: 18,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 14,
                                }}
                            >
                                <View style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <MaterialIcons name="add" size={22} color="#FFF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h3, { color: '#FFF', fontSize: 14 }]}>
                                        Add Health Record
                                    </Text>
                                    <Text style={[textStyles.body, { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 }]}>
                                        Log illness, treatment, vaccination & more
                                    </Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.8)" />
                            </TouchableOpacity>
                        </View>

                    </View>
                </ScrollView>
            </View>

            <FloatingNavBar />
        </SafeAreaView>
    );
}

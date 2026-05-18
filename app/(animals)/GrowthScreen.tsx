import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ActivityIndicator, RefreshControl, ScrollView, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
    Circle, Defs, LinearGradient, Path, Stop, Text as SvgText
} from 'react-native-svg';
import { Text } from '@/components/Text';

import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

// ─── Mini line chart ──────────────────────────────────────────────────────────

interface ChartPoint { x: string; y: number }

function LineChart({ data, color, unit, gradId }: { data: ChartPoint[]; color: string; unit: string; gradId: string }) {
    const [width, setWidth] = useState(300);
    const HEIGHT    = 150;
    const PAD_L     = 44;
    const PAD_R     = 16;
    const PAD_T     = 12;
    const PAD_B     = 30;
    const chartW    = width - PAD_L - PAD_R;
    const chartH    = HEIGHT - PAD_T - PAD_B;

    if (data.length < 2) {
        return (
            <View style={{ height: HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color, opacity: 0.5, fontSize: 12, fontFamily: 'Poppins-Regular' }}>Not enough data yet</Text>
            </View>
        );
    }

    const ys     = data.map(d => d.y);
    const minY   = Math.min(...ys);
    const maxY   = Math.max(...ys);
    const yRange = maxY - minY || 1;

    const getX = (i: number) => PAD_L + (i / (data.length - 1)) * chartW;
    const getY = (v: number)  => PAD_T + chartH - ((v - minY) / yRange) * chartH;

    const pts      = data.map((d, i) => ({ x: getX(i), y: getY(d.y), raw: d }));
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(PAD_T + chartH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PAD_T + chartH).toFixed(1)} Z`;

    // Show at most 4 x-axis labels
    const step = Math.max(1, Math.floor((data.length - 1) / 3));

    return (
        <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
            <Svg width={width} height={HEIGHT}>
                <Defs>
                    <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={color} stopOpacity="0.35" />
                        <Stop offset="1" stopColor={color} stopOpacity="0" />
                    </LinearGradient>
                </Defs>
                {/* Gradient fill */}
                <Path d={fillPath} fill={`url(#${gradId})`} />
                {/* Line */}
                <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {/* Dots */}
                {pts.map((p, i) => (
                    <React.Fragment key={i}>
                        <Circle cx={p.x} cy={p.y} r={4} fill={color} />
                        <Circle cx={p.x} cy={p.y} r={2} fill="#fff" />
                    </React.Fragment>
                ))}
                {/* Y axis labels */}
                <SvgText x={PAD_L - 4} y={PAD_T + 5}        fontSize={9} fill="#888" textAnchor="end">{formatUnit(maxY, unit)}</SvgText>
                <SvgText x={PAD_L - 4} y={PAD_T + chartH}   fontSize={9} fill="#888" textAnchor="end">{formatUnit(minY, unit)}</SvgText>
                {/* X axis labels */}
                {pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p, _, arr) => (
                    <SvgText key={p.raw.x} x={p.x} y={HEIGHT - 4} fontSize={9} fill="#888" textAnchor="middle">
                        {shortDate(p.raw.x)}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
}

function formatUnit(v: number, unit: string) {
    if (unit === 'g') return v >= 1000 ? `${(v / 1000).toFixed(1)}kg` : `${Math.round(v)}g`;
    return `${Math.round(v)}${unit}`;
}

function shortDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, iconColor, bgColor }: any) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    return (
        <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: 14 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <MaterialIcons name={icon} size={20} color={iconColor} />
            </View>
            <Text style={[textStyles.h2, { color: colors.text, fontSize: 22 }]}>{value}</Text>
            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>{label}</Text>
            {sub ? <Text style={[textStyles.body, { color: iconColor, fontSize: 11, marginTop: 2 }]}>{sub}</Text> : null}
        </View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Batch {
    id: string; name: string; animal_type: string;
    estimated_count: number; current_count: number;
    arrival_date: string; status: string;
}

interface WeighSession {
    recorded_at: string;
    net_weight_grams: number | null;
}

interface DispenseRecord {
    dispensed_at: string;
    grams_dispensed: number | null;
}

export default function GrowthScreen() {
    const { housingId, batchId } = useLocalSearchParams<{ housingId: string; batchId: string }>();
    const router     = useRouter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    const [isLoading, setIsLoading]     = useState(true);
    const [batch, setBatch]             = useState<Batch | null>(null);
    const [weighSessions, setWeighSessions] = useState<WeighSession[]>([]);
    const [dispenseRecords, setDispenseRecords] = useState<DispenseRecord[]>([]);

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!housingId) return;
        setIsLoading(true);
        try {
            // 1. Batch info
            const batchQuery = batchId
                ? supabase.from('batches').select('id,name,animal_type,estimated_count,current_count,arrival_date,status').eq('id', batchId).single()
                : supabase.from('batches').select('id,name,animal_type,estimated_count,current_count,arrival_date,status').eq('housing_id', housingId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();

            // 2. All device IDs for this housing (works for any device type)
            const devRes = await supabase.from('devices').select('id').eq('housing_id', housingId);
            const deviceIds = (devRes.data ?? []).map((d: any) => d.id);

            // 3. Parallel fetch
            const [bRes, wsRes, drRes] = await Promise.all([
                batchQuery,
                deviceIds.length > 0
                    ? supabase.from('weigh_sessions')
                        .select('recorded_at, net_weight_grams')
                        .in('device_id', deviceIds)
                        .order('recorded_at', { ascending: true })
                        .limit(120)
                    : Promise.resolve({ data: [], error: null }),
                deviceIds.length > 0
                    ? supabase.from('dispense_records')
                        .select('dispensed_at, grams_dispensed')
                        .in('device_id', deviceIds)
                        .eq('status', 'success')
                        .order('dispensed_at', { ascending: true })
                        .limit(120)
                    : Promise.resolve({ data: [], error: null }),
            ]);

            if (!bRes.error && bRes.data) setBatch(bRes.data as unknown as Batch);
            setWeighSessions((wsRes.data ?? []) as WeighSession[]);
            setDispenseRecords((drRes.data ?? []) as DispenseRecord[]);
        } catch (err) {
            console.error('[GrowthScreen] fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [housingId, batchId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, [fetchData]);

    // ── Derived data ───────────────────────────────────────────────────────────

    // Group weigh sessions by date → average net_weight_grams per day
    const weightChartData = useMemo<ChartPoint[]>(() => {
        if (weighSessions.length === 0) return [];
        const byDate: Record<string, number[]> = {};
        weighSessions.forEach(s => {
            if (!s.net_weight_grams) return;
            const d = s.recorded_at.split('T')[0];
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(s.net_weight_grams);
        });
        return Object.entries(byDate)
            .map(([date, vals]) => ({ x: date, y: vals.reduce((a, b) => a + b, 0) / vals.length }))
            .sort((a, b) => a.x.localeCompare(b.x));
    }, [weighSessions]);

    // Group dispense records by date → total grams per day
    const feedChartData = useMemo<ChartPoint[]>(() => {
        if (dispenseRecords.length === 0) return [];
        const byDate: Record<string, number> = {};
        dispenseRecords.forEach(r => {
            if (!r.grams_dispensed) return;
            const d = r.dispensed_at.split('T')[0];
            byDate[d] = (byDate[d] ?? 0) + r.grams_dispensed;
        });
        return Object.entries(byDate)
            .map(([date, total]) => ({ x: date, y: total }))
            .sort((a, b) => a.x.localeCompare(b.x));
    }, [dispenseRecords]);

    // Days in farm since arrival
    const daysInFarm = useMemo(() => {
        if (!batch?.arrival_date) return null;
        const arrival = new Date(batch.arrival_date);
        const now     = new Date();
        return Math.floor((now.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
    }, [batch]);

    // Latest avg weight (average of last day's sessions)
    const latestWeight = weightChartData.length > 0 ? weightChartData[weightChartData.length - 1].y : null;
    // Weight gain (first day avg → last day avg)
    const weightGain = weightChartData.length >= 2
        ? weightChartData[weightChartData.length - 1].y - weightChartData[0].y
        : null;

    // Total feed consumed
    const totalFeedGrams = feedChartData.reduce((s, p) => s + p.y, 0);

    // ── Render ─────────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
                    <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Growth & Analytics</Text>
                </View>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
                <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                <View style={{ flex: 1 }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]} numberOfLines={1}>
                        Growth & Analytics
                    </Text>
                    {batch && (
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]} numberOfLines={1}>
                            {batch.name}
                        </Text>
                    )}
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                {/* No batch */}
                {!batch && (
                    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                        <MaterialIcons name="show-chart" size={48} color={colors.textGrey} style={{ opacity: 0.3, marginBottom: 12 }} />
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center' }]}>
                            No active batch found for this housing.{'\n'}Create a batch first in Animal Details.
                        </Text>
                    </View>
                )}

                {batch && (
                    <>
                        {/* Batch Overview cards */}
                        <Text style={[textStyles.h3, { color: colors.text, marginBottom: 10, marginTop: 4 }]}>Batch Overview</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                            <StatCard
                                label="Days in Farm"
                                value={daysInFarm != null ? `${daysInFarm}d` : '—'}
                                sub={batch.arrival_date ? `Since ${new Date(batch.arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined}
                                icon="calendar-today"
                                iconColor={colors.primary}
                                bgColor={colors.primary + '1A'}
                            />
                            <StatCard
                                label="Live Heads"
                                value={batch.current_count}
                                sub={`of ${batch.estimated_count} initial`}
                                icon="pets"
                                iconColor="#27AE60"
                                bgColor="#27AE601A"
                            />
                            {latestWeight != null && (
                                <StatCard
                                    label="Latest Avg Weight"
                                    value={latestWeight >= 1000 ? `${(latestWeight / 1000).toFixed(2)}kg` : `${Math.round(latestWeight)}g`}
                                    sub={weightGain != null && weightGain > 0 ? `+${weightGain >= 1000 ? (weightGain / 1000).toFixed(2) + 'kg' : Math.round(weightGain) + 'g'} gain` : undefined}
                                    icon="monitor-weight"
                                    iconColor="#E67E22"
                                    bgColor="#E67E221A"
                                />
                            )}
                            {totalFeedGrams > 0 && (
                                <StatCard
                                    label="Total Feed"
                                    value={totalFeedGrams >= 1000 ? `${(totalFeedGrams / 1000).toFixed(1)}kg` : `${Math.round(totalFeedGrams)}g`}
                                    sub={`across ${feedChartData.length} days`}
                                    icon="restaurant"
                                    iconColor="#8E44AD"
                                    bgColor="#8E44AD1A"
                                />
                            )}
                        </View>

                        {/* Weight trend chart */}
                        <Text style={[textStyles.h3, { color: colors.text, marginBottom: 4 }]}>Weight Trend</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 10 }]}>
                            Average weight per weigh session (from AniWeigh device)
                        </Text>
                        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: 12, marginBottom: 20 }}>
                            {weightChartData.length === 0 ? (
                                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                                    <MaterialIcons name="monitor-weight" size={36} color={colors.textGrey} style={{ opacity: 0.3, marginBottom: 8 }} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                                        No weigh sessions recorded yet.{'\n'}Start the IoT simulator to see data here.
                                    </Text>
                                </View>
                            ) : (
                                <LineChart data={weightChartData} color="#E67E22" unit="g" gradId="weightGrad" />
                            )}
                        </View>

                        {/* Feed consumption chart */}
                        <Text style={[textStyles.h3, { color: colors.text, marginBottom: 4 }]}>Feed Consumption</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 10 }]}>
                            Total grams dispensed per day (from AniFeed device)
                        </Text>
                        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: 12, marginBottom: 20 }}>
                            {feedChartData.length === 0 ? (
                                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                                    <MaterialIcons name="restaurant" size={36} color={colors.textGrey} style={{ opacity: 0.3, marginBottom: 8 }} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                                        No feed dispensed yet.{'\n'}Start the IoT simulator to see data here.
                                    </Text>
                                </View>
                            ) : (
                                <LineChart data={feedChartData} color="#8E44AD" unit="g" gradId="feedGrad" />
                            )}
                        </View>

                        {/* Recent weigh sessions list */}
                        {weighSessions.length > 0 && (
                            <>
                                <Text style={[textStyles.h3, { color: colors.text, marginBottom: 10 }]}>Recent Weigh Sessions</Text>
                                {[...weighSessions].reverse().slice(0, 8).map((s, i) => (
                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E67E221A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                            <MaterialIcons name="monitor-weight" size={20} color="#E67E22" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>
                                                Weight: <Text style={{ fontFamily: 'Poppins-SemiBold', color: '#E67E22' }}>
                                                    {s.net_weight_grams != null ? (s.net_weight_grams >= 1000 ? `${(s.net_weight_grams / 1000).toFixed(2)}kg` : `${Math.round(s.net_weight_grams)}g`) : '—'}
                                                </Text>
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                {new Date(s.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

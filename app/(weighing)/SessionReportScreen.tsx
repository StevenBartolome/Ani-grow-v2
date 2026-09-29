import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AIInsightCard } from '@/components/AIInsightCard';
import { BackButton } from '@/components/BackButton';
import ActionModal from '@/components/ActionModal';
import { PrintReportButton } from '@/components/PrintReportButton';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ReportDocument, ReportChart } from '@/lib/pdfReport';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';

interface SessionRow {
    id: string;
    batch_id: string;
    housing_id: string;
    animal_type: 'pig' | 'chicken';
    farm_day: number | null;
    expected_quantity: number;
    completed_quantity: number;
    created_at: string;
    completed_at: string | null;
}

interface BatchInfo {
    name: string;
    housings: { name: string } | { name: string }[] | null;
}

interface ChildRow {
    net_weight_grams: number;
    status: 'underweight' | 'normal' | 'overweight';
}

function housingNameOf(b: BatchInfo | null): string {
    if (!b?.housings) return '';
    return Array.isArray(b.housings) ? (b.housings[0]?.name ?? '') : b.housings.name;
}

export default function SessionReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const router = useRouter();
    const { hasPermission, profile } = useAuth();
    const [farmName, setFarmName] = useState<string>((profile as any)?.farm_name ?? (profile as any)?.farmName ?? '');
    const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

    const [session, setSession] = useState<SessionRow | null>(null);
    const [batch, setBatch] = useState<BatchInfo | null>(null);
    const [rows, setRows] = useState<ChildRow[]>([]);
    const [previousSession, setPreviousSession] = useState<SessionRow | null>(null);
    const [previousAvgGrams, setPreviousAvgGrams] = useState<number | null>(null);
    const [feedConsumedGrams, setFeedConsumedGrams] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: SnackbarType }>({ visible: false, message: '', type: 'info' });
    const showSnackbar = (message: string, type: SnackbarType = 'info') => setSnackbar({ visible: true, message, type });

    const handleDelete = async () => {
        if (!sessionId) return;
        setIsDeleting(true);
        try {
            const { error: childErr } = await supabase
                .from('weigh_sessions')
                .delete()
                .eq('weighing_session_id', sessionId);
            if (childErr) throw childErr;

            const { error: sessionErr } = await supabase
                .from('weighing_sessions')
                .delete()
                .eq('id', sessionId);
            if (sessionErr) throw sessionErr;

            setDeleteModalVisible(false);
            router.back();
        } catch (err: any) {
            console.error('[SessionReportScreen] delete error:', err);
            showSnackbar(err?.message || 'Failed to delete weighing session.', 'error');
            setIsDeleting(false);
        }
    };

    const load = useCallback(async () => {
        if (!sessionId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const { data: sessionData, error: sessionErr } = await supabase
                .from('weighing_sessions')
                .select('id, batch_id, housing_id, animal_type, farm_day, expected_quantity, completed_quantity, created_at, completed_at')
                .eq('id', sessionId)
                .single();
            if (sessionErr) throw sessionErr;
            const currentSession = sessionData as SessionRow;
            setSession(currentSession);

            const [batchRes, rowsRes, prevRes] = await Promise.all([
                supabase.from('batches').select('name, housings(name, farm_id, farms(name))').eq('id', currentSession.batch_id).single(),
                supabase.from('weigh_sessions').select('net_weight_grams, status').eq('weighing_session_id', sessionId),
                supabase.from('weighing_sessions')
                    .select('id, batch_id, housing_id, animal_type, farm_day, expected_quantity, completed_quantity, created_at, completed_at')
                    .eq('batch_id', currentSession.batch_id)
                    .eq('status', 'completed')
                    .gt('completed_quantity', 0)
                    .neq('id', currentSession.id)
                    .lt('created_at', currentSession.created_at)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
            ]);

            if (batchRes.data) {
                setBatch(batchRes.data as unknown as BatchInfo);
                const fetchedFarm = (batchRes.data as any)?.housings?.farms?.name;
                if (fetchedFarm) setFarmName(fetchedFarm);
            }
            setRows((rowsRes.data || []) as ChildRow[]);

            if (prevRes.data) {
                const prev = prevRes.data as SessionRow;
                setPreviousSession(prev);
                const { data: prevRows } = await supabase.from('weigh_sessions').select('net_weight_grams').eq('weighing_session_id', prev.id);
                if (prevRows && prevRows.length > 0) {
                    const avg = prevRows.reduce((s: number, r: any) => s + (r.net_weight_grams || 0), 0) / prevRows.length;
                    setPreviousAvgGrams(avg);
                }
                // Feed consumed strictly between the previous and current session —
                // a real, computed number, never invented (see plan §"Feed factor").
                const { data: feedRows } = await supabase.from('dispense_records')
                    .select('grams_dispensed')
                    .eq('batch_id', currentSession.batch_id)
                    .eq('status', 'success')
                    .gte('dispensed_at', prev.created_at)
                    .lt('dispensed_at', currentSession.created_at);
                if (feedRows) {
                    setFeedConsumedGrams(feedRows.reduce((s: number, r: any) => s + (r.grams_dispensed || 0), 0));
                }
            }
        } catch (err) {
            console.error('[SessionReportScreen] load error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    if (isLoading && !refreshing) {
        return (
            <View style={[styles.safeArea, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!session) {
        return (
            <View style={[styles.safeArea, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center' }]}>This session report could not be found.</Text>
            </View>
        );
    }

    const total = rows.length;
    const underCount = rows.filter(r => r.status === 'underweight').length;
    const normalCount = rows.filter(r => r.status === 'normal').length;
    const overCount = rows.filter(r => r.status === 'overweight').length;
    const currentAvgGrams = total > 0 ? rows.reduce((s, r) => s + r.net_weight_grams, 0) / total : 0;
    const minGrams = total > 0 ? Math.min(...rows.map(r => r.net_weight_grams)) : 0;
    const maxGrams = total > 0 ? Math.max(...rows.map(r => r.net_weight_grams)) : 0;

    const hasComparison = previousSession !== null && previousAvgGrams !== null;
    const weightChangeGrams = hasComparison ? currentAvgGrams - (previousAvgGrams as number) : null;
    const daysBetween = hasComparison && session.farm_day !== null && previousSession!.farm_day !== null
        ? session.farm_day - (previousSession!.farm_day as number)
        : null;
    const growthRateGramsPerDay = weightChangeGrams !== null && daysBetween && daysBetween > 0 ? weightChangeGrams / daysBetween : null;

    const canUseAI = hasPermission('ai_assistant:use');
    const aiContext = {
        type: 'weight' as const,
        animalType: session.animal_type,
        housingName: housingNameOf(batch),
        data: {
            batchName: batch?.name ?? '',
            farmDay: session.farm_day,
            totalWeighed: total,
            currentAvgWeightKg: Number((currentAvgGrams / 1000).toFixed(2)),
            underweightCount: underCount,
            normalCount,
            overweightCount: overCount,
            ...(hasComparison ? {
                previousFarmDay: previousSession!.farm_day,
                previousAvgWeightKg: Number(((previousAvgGrams as number) / 1000).toFixed(2)),
                weightChangeKg: Number(((weightChangeGrams as number) / 1000).toFixed(2)),
                daysBetweenWeighings: daysBetween,
                growthRateKgPerDay: growthRateGramsPerDay !== null ? Number((growthRateGramsPerDay / 1000).toFixed(3)) : null,
            } : {
                note: 'This is the first recorded weighing session for this batch — no prior session to compare against.',
            }),
            ...(feedConsumedGrams !== null ? {
                feedConsumedThisPeriodKg: Number((feedConsumedGrams / 1000).toFixed(2)),
            } : {}),
        },
    };

    // ─── PDF Report Builder ───────────────────────────────────────
    const buildSessionReport = (): ReportDocument | null => {
        if (!session || total === 0) return null;

        const sessionDateLabel = session.completed_at
            ? new Date(session.completed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : new Date(session.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const sessionDistributionChart: ReportChart = {
            type: 'bar',
            title: 'Session Weight Classification (Head Count)',
            labels: ['Underweight', 'Normal', 'Overweight'],
            series: [
                {
                    name: 'Sampled Animals',
                    data: [underCount, normalCount, overCount],
                    color: '#16492a',
                },
            ],
            unit: 'heads',
            yAxisLabel: 'Animals',
        };

        const comparisonChart: ReportChart | undefined = hasComparison ? {
            type: 'bar',
            title: 'Average Weight Progression vs Previous Session',
            labels: [`Prev (Day ${previousSession!.farm_day ?? '?'})`, `Current (Day ${session.farm_day ?? '?'})`],
            series: [
                {
                    name: 'Avg Weight (kg)',
                    data: [
                        Math.round(((previousAvgGrams as number) / 1000) * 100) / 100,
                        Math.round((currentAvgGrams / 1000) * 100) / 100,
                    ],
                    color: '#2980b9',
                },
            ],
            unit: 'kg',
            yAxisLabel: 'Weight (kg)',
        } : undefined;

        return {
            reportTitle: 'Weighing Session Report',
            farmName,
            subtitle: `${batch?.name ?? 'Batch'} · ${housingNameOf(batch)} · ${session.animal_type === 'pig' ? 'Pigs' : 'Chickens'}`,
            meta: [
                { label: 'Batch', value: batch?.name ?? '—' },
                { label: 'Housing', value: housingNameOf(batch) || '—' },
                { label: 'Animal Type', value: session.animal_type === 'pig' ? 'Pig' : 'Chicken' },
                { label: 'Farm Day', value: session.farm_day !== null ? `Day ${session.farm_day}` : '—' },
                { label: 'Session Date', value: sessionDateLabel },
            ],
            sections: [
                {
                    heading: 'Summary',
                    stats: [
                        { label: 'Total Weighed', value: String(total) },
                        { label: 'Average Weight', value: `${(currentAvgGrams / 1000).toFixed(2)} kg` },
                        { label: 'Min / Max', value: `${(minGrams / 1000).toFixed(2)} / ${(maxGrams / 1000).toFixed(2)} kg` },
                        { label: 'Underweight', value: String(underCount), accent: underCount > 0 ? 'warn' : undefined },
                        { label: 'Normal', value: String(normalCount), accent: 'good' },
                        { label: 'Overweight', value: String(overCount), accent: overCount > 0 ? 'bad' : undefined },
                    ],
                    chart: sessionDistributionChart,
                },
                {
                    heading: 'Compared With Previous Session',
                    ...(hasComparison ? {
                        stats: [
                            { label: `Previous (Day ${previousSession!.farm_day})`, value: `${((previousAvgGrams as number) / 1000).toFixed(2)} kg avg` },
                            { label: `Current (Day ${session.farm_day})`, value: `${(currentAvgGrams / 1000).toFixed(2)} kg avg` },
                            { label: 'Weight Change', value: `${(weightChangeGrams ?? 0) >= 0 ? '+' : ''}${((weightChangeGrams ?? 0) / 1000).toFixed(2)} kg`, accent: (weightChangeGrams ?? 0) >= 0 ? 'good' : 'bad' },
                            { label: 'Growth Rate', value: growthRateGramsPerDay !== null ? `${(growthRateGramsPerDay / 1000).toFixed(3)} kg/day` : '—' },
                            ...(feedConsumedGrams !== null ? [{ label: 'Feed Consumed This Period', value: `${(feedConsumedGrams / 1000).toFixed(2)} kg` }] : []),
                        ],
                        chart: comparisonChart,
                    } : {
                        paragraphs: ['Not enough previous data — this is the first recorded weighing session for this batch.'],
                    }),
                },
            ],
        };
    };

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(weighing)/WeighingSessionsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Session Report</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PrintReportButton
                        buildReport={buildSessionReport}
                        emptyMessage="This session has no recorded weigh-ins yet."
                    />
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setDeleteModalVisible(true);
                        }}
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.error + '14',
                        }}
                    >
                        <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={[animalStyles.scrollContent, { paddingTop: 8, paddingBottom: 60 }]}
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={[textStyles.h3, { color: colors.text }]}>{batch?.name ?? 'Batch'}</Text>
                    {session.farm_day !== null && (
                        <View style={[styles.dayBadge, { paddingHorizontal: 12, paddingVertical: 8 }]}>
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>DAY</Text>
                            <Text style={[textStyles.h1, { color: colors.primary, fontSize: 20, lineHeight: 24 }]}>{session.farm_day}</Text>
                        </View>
                    )}
                </View>

                {/* Current session report — computed from this session's actual rows */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'Total Weighed', value: String(total) },
                        { label: 'Average', value: `${(currentAvgGrams / 1000).toFixed(2)} kg` },
                        { label: 'Min / Max', value: `${(minGrams / 1000).toFixed(2)} / ${(maxGrams / 1000).toFixed(2)} kg` },
                    ].map(stat => (
                        <View key={stat.label} style={[styles.menuCard, { flex: 1, flexDirection: 'column', alignItems: 'flex-start', padding: 14 }]}>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>{stat.label}</Text>
                            <Text style={[textStyles.h3, { color: colors.text, marginTop: 4, fontSize: 15 }]}>{stat.value}</Text>
                        </View>
                    ))}
                </View>

                <View style={{ flexDirection: 'row', height: 10, borderRadius: 8, overflow: 'hidden', marginBottom: 12, gap: 2 }}>
                    <View style={{ flex: underCount || 1, backgroundColor: colors.warning, borderRadius: 8 }} />
                    <View style={{ flex: normalCount || 1, backgroundColor: colors.primary }} />
                    <View style={{ flex: overCount || 1, backgroundColor: colors.error, borderRadius: 8 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
                    {[
                        { label: 'Underweight', count: underCount, color: colors.warning },
                        { label: 'Normal', count: normalCount, color: colors.primary },
                        { label: 'Overweight', count: overCount, color: colors.error },
                    ].map(item => (
                        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>{item.label} ({item.count})</Text>
                        </View>
                    ))}
                </View>

                {/* Compare with previous session */}
                <Text style={[textStyles.h3, { color: colors.text, marginBottom: 12 }]}>Compared With Previous Session</Text>
                {!hasComparison ? (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 20, marginBottom: 24 }}>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                            Not enough previous data — this is the first recorded weighing session for this batch. A comparison will appear once a second session is completed.
                        </Text>
                    </View>
                ) : (
                    <View style={[styles.menuCard, { flexDirection: 'column', alignItems: 'stretch', marginBottom: 24 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Previous (Day {previousSession!.farm_day})</Text>
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>{((previousAvgGrams as number) / 1000).toFixed(2)} kg avg</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Current (Day {session.farm_day})</Text>
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>{(currentAvgGrams / 1000).toFixed(2)} kg avg</Text>
                        </View>
                        <View style={{ height: 1, backgroundColor: colors.stroke, marginVertical: 8 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Weight Change</Text>
                            <Text style={[textStyles.h3, { color: (weightChangeGrams ?? 0) >= 0 ? colors.primary : colors.error, fontSize: 14 }]}>
                                {(weightChangeGrams ?? 0) >= 0 ? '+' : ''}{((weightChangeGrams ?? 0) / 1000).toFixed(2)} kg
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: feedConsumedGrams !== null ? 4 : 0 }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Growth Rate</Text>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                {growthRateGramsPerDay !== null ? `${(growthRateGramsPerDay / 1000).toFixed(3)} kg/day` : '—'}
                            </Text>
                        </View>
                        {feedConsumedGrams !== null && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Feed Consumed This Period</Text>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{(feedConsumedGrams / 1000).toFixed(2)} kg</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* AI analysis — real LLM call, fed only the numbers computed above */}
                {canUseAI && (
                    <AIInsightCard title="AniBot Growth Analysis" context={aiContext} variant="purple" />
                )}

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => router.push(`/(analytics)/GrowthReportScreen?type=${session.animal_type === 'pig' ? 'Pigs' : 'Chickens'}&batchId=${session.batch_id}` as any)}
                        style={[styles.menuCard, { flex: 1, justifyContent: 'center' }]}
                    >
                        <MaterialIcons name="trending-up" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>Full Growth Report</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => router.push(`/(analytics)/PredictionReportScreen?type=${session.animal_type === 'pig' ? 'Pigs' : 'Chickens'}&batchId=${session.batch_id}` as any)}
                        style={[styles.menuCard, { flex: 1, justifyContent: 'center' }]}
                    >
                        <MaterialIcons name="insights" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>Prediction Report</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <ActionModal
                visible={deleteModalVisible}
                type="warning"
                title="Delete Weighing Session?"
                message={`Are you sure you want to delete ${
                    session.farm_day !== null ? `Day ${session.farm_day}` : 'this session'
                }? All weight recordings attached to this session will be permanently removed.`}
                confirmText="Delete"
                cancelText="Cancel"
                isLoading={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => {
                    if (!isDeleting) setDeleteModalVisible(false);
                }}
            />

            <Snackbar
                visible={snackbar.visible}
                message={snackbar.message}
                type={snackbar.type}
                onDismiss={() => setSnackbar(s => ({ ...s, visible: false }))}
            />
        </View>
    );
}

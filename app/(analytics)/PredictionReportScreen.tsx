import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HousingInfo {
    id: string;
    name: string;
    animal_type: string;
    status: string;
    current_count: number;
}

interface BatchInfo {
    id: string;
    name: string;
    estimated_count: number;
    current_count: number;
    arrival_date: string;
    age_at_arrival_days: number;
    status: string;
    housing_id: string;
}

interface WeighSession {
    id: string;
    net_weight_grams: number;
    status: 'underweight' | 'normal' | 'overweight';
    recorded_at: string;
    batch_id: string;
}

interface HealthRecord {
    id: string;
    record_type: string;
    affected_count: number | null;
    record_date: string;
}

// ─── Harvest targets ────────────────────────────────────────────────────────

const HARVEST_TARGET_KG: Record<string, number> = {
    pig: 90,      // Market-ready finisher pig
    chicken: 2.5, // Market-ready broiler chicken
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function PredictionReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    const { type } = useLocalSearchParams();
    const initialType = typeof type === 'string'
        ? (type.toLowerCase().includes('chicken') ? 'chicken' : 'pig')
        : 'pig';

    // ─── State ──────────────────────────────────────────────────────────────
    const [animalType, setAnimalType] = useState<'pig' | 'chicken'>(initialType);
    const [allHousings, setAllHousings] = useState<HousingInfo[]>([]);
    const [selectedHousingId, setSelectedHousingId] = useState<string | null>(null);
    const [allBatches, setAllBatches] = useState<BatchInfo[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [weighSessions, setWeighSessions] = useState<WeighSession[]>([]);
    const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
    const [timeframe, setTimeframe] = useState<'30 Days' | '60 Days'>('30 Days');

    const [isLoading, setIsLoading] = useState(true);
    const [isDataLoading, setIsDataLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    const lastLoadedBatchIdRef = useRef<string | null>(null);
    const animalTypeRef = useRef(animalType);

    useEffect(() => {
        animalTypeRef.current = animalType;
    }, [animalType]);

    // ─── Derived lists ───────────────────────────────────────────────────────
    const filteredHousings = allHousings.filter(h => h.animal_type === animalType);
    const selectedHousing = allHousings.find(h => h.id === selectedHousingId) ?? null;

    const filteredBatches = useMemo(() => {
        return allBatches.filter(b => b.housing_id === selectedHousingId);
    }, [allBatches, selectedHousingId]);

    const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) ?? null;

    // ─── Data Fetching ───────────────────────────────────────────────────────
    const fetchReportMetadata = useCallback(async () => {
        if (!farmId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [housingsRes, batchesRes] = await Promise.all([
                supabase
                    .from('housings')
                    .select('id, name, animal_type, status, current_count')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active')
                    .order('name', { ascending: true }),
                supabase
                    .from('batches')
                    .select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id, housings!inner(farm_id)')
                    .eq('housings.farm_id', farmId)
                    .order('arrival_date', { ascending: false }),
            ]);

            if (housingsRes.error) throw housingsRes.error;
            if (batchesRes.error) throw batchesRes.error;

            const housingsData = (housingsRes.data || []) as HousingInfo[];
            const batchesData = (batchesRes.data || []) as BatchInfo[];

            setAllHousings(housingsData);
            setAllBatches(batchesData);

            const filteredH = housingsData.filter(h => h.animal_type === animalTypeRef.current);
            if (filteredH.length > 0) {
                const targetHousingId = filteredH[0].id;
                setSelectedHousingId(targetHousingId);

                const filteredB = batchesData.filter(b => b.housing_id === targetHousingId);
                if (filteredB.length > 0) {
                    const targetBatchId = filteredB[0].id;
                    setSelectedBatchId(targetBatchId);

                    const [weighRes, healthRes] = await Promise.all([
                        supabase
                            .from('weigh_sessions')
                            .select('id, net_weight_grams, status, recorded_at, batch_id')
                            .eq('batch_id', targetBatchId)
                            .order('recorded_at', { ascending: true }),
                        supabase
                            .from('health_records')
                            .select('id, record_type, affected_count, record_date')
                            .eq('batch_id', targetBatchId)
                            .is('deleted_at', null),
                    ]);

                    setWeighSessions((weighRes.data || []) as WeighSession[]);
                    setHealthRecords((healthRes.data || []) as HealthRecord[]);
                    lastLoadedBatchIdRef.current = targetBatchId;
                } else {
                    setSelectedBatchId(null);
                    setWeighSessions([]);
                    setHealthRecords([]);
                    lastLoadedBatchIdRef.current = null;
                }
            } else {
                setSelectedHousingId(null);
                setSelectedBatchId(null);
                setWeighSessions([]);
                setHealthRecords([]);
                lastLoadedBatchIdRef.current = null;
            }
        } catch (err) {
            console.error('[PredictionReportScreen] error loading metadata:', err);
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    const fetchBatchData = useCallback(async (batchId: string) => {
        setIsDataLoading(true);
        lastLoadedBatchIdRef.current = batchId;
        try {
            const [weighRes, healthRes] = await Promise.all([
                supabase
                    .from('weigh_sessions')
                    .select('id, net_weight_grams, status, recorded_at, batch_id')
                    .eq('batch_id', batchId)
                    .order('recorded_at', { ascending: true }),
                supabase
                    .from('health_records')
                    .select('id, record_type, affected_count, record_date')
                    .eq('batch_id', batchId)
                    .is('deleted_at', null),
            ]);

            setWeighSessions((weighRes.data || []) as WeighSession[]);
            setHealthRecords((healthRes.data || []) as HealthRecord[]);
        } catch (err) {
            console.error('[PredictionReportScreen] error fetching batch data:', err);
        } finally {
            setIsDataLoading(false);
        }
    }, []);

    useEffect(() => { fetchReportMetadata(); }, [fetchReportMetadata]);

    // Auto-resolve housing when animal type changes
    useEffect(() => {
        if (filteredHousings.length > 0) {
            const exists = filteredHousings.some(h => h.id === selectedHousingId);
            if (!exists) setSelectedHousingId(filteredHousings[0].id);
        } else {
            setSelectedHousingId(null);
        }
    }, [animalType, allHousings, selectedHousingId]);

    // Auto-resolve batch when housing changes
    useEffect(() => {
        if (filteredBatches.length > 0) {
            const exists = filteredBatches.some(b => b.id === selectedBatchId);
            if (!exists) setSelectedBatchId(filteredBatches[0].id);
        } else {
            setSelectedBatchId(null);
        }
    }, [filteredBatches, selectedBatchId]);

    // Load batch data when batch changes
    useEffect(() => {
        if (selectedBatchId) {
            if (lastLoadedBatchIdRef.current !== selectedBatchId) {
                fetchBatchData(selectedBatchId);
            }
        } else {
            setWeighSessions([]);
            setHealthRecords([]);
            lastLoadedBatchIdRef.current = null;
        }
    }, [selectedBatchId, fetchBatchData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchReportMetadata();
        if (selectedBatchId) await fetchBatchData(selectedBatchId);
        setRefreshing(false);
    }, [fetchReportMetadata, selectedBatchId, fetchBatchData]);

    // ─── Prediction Computations ─────────────────────────────────────────────

    const currentAgeDays = useMemo(() => {
        if (!selectedBatch?.arrival_date) return null;
        const arrival = new Date(selectedBatch.arrival_date);
        const today = new Date();
        arrival.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays) + (selectedBatch.age_at_arrival_days || 0);
    }, [selectedBatch]);

    // Average weight from the most recent 5 weigh sessions
    const latestAvgWeightKg = useMemo(() => {
        if (weighSessions.length === 0) return null;
        const recent = weighSessions.slice(-5);
        const avg = recent.reduce((sum, s) => sum + (s.net_weight_grams || 0), 0) / recent.length;
        return avg / 1000;
    }, [weighSessions]);

    // Daily weight gain: slope from a linear regression on all weigh sessions grouped by date
    const dailyGainKg = useMemo(() => {
        if (weighSessions.length < 2) return null;

        // Group by date, average each day
        const dateMap = new Map<string, number[]>();
        weighSessions.forEach(s => {
            const key = s.recorded_at.slice(0, 10);
            if (!dateMap.has(key)) dateMap.set(key, []);
            dateMap.get(key)!.push((s.net_weight_grams || 0) / 1000);
        });

        const points = Array.from(dateMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, weights]) => ({
                date: new Date(date).getTime(),
                weight: weights.reduce((a, b) => a + b, 0) / weights.length,
            }));

        if (points.length < 2) return null;

        // Linear regression
        const n = points.length;
        const t0 = points[0].date;
        const xs = points.map(p => (p.date - t0) / (1000 * 60 * 60 * 24)); // days
        const ys = points.map(p => p.weight);
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
        const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return Math.max(0, slope); // can't be negative for predictions
    }, [weighSessions]);

    const harvestTargetKg = HARVEST_TARGET_KG[animalType] ?? 90;

    // Estimated days until harvest
    const daysToHarvest = useMemo(() => {
        if (latestAvgWeightKg === null || dailyGainKg === null || dailyGainKg <= 0) return null;
        if (latestAvgWeightKg >= harvestTargetKg) return 0;
        return Math.ceil((harvestTargetKg - latestAvgWeightKg) / dailyGainKg);
    }, [latestAvgWeightKg, dailyGainKg, harvestTargetKg]);

    const estimatedHarvestDate = useMemo(() => {
        if (daysToHarvest === null) return null;
        const d = new Date();
        d.setDate(d.getDate() + daysToHarvest);
        return d;
    }, [daysToHarvest]);

    // Survival rate from batch
    const survivalRate = useMemo(() => {
        if (!selectedBatch || selectedBatch.estimated_count <= 0) return null;
        return ((selectedBatch.current_count / selectedBatch.estimated_count) * 100).toFixed(1);
    }, [selectedBatch]);

    // Total deceased
    const totalDeceased = useMemo(() => {
        return healthRecords
            .filter(r => r.record_type === 'mortality')
            .reduce((sum, r) => sum + (r.affected_count ?? 1), 0);
    }, [healthRecords]);

    // ─── Forecast Chart Data ─────────────────────────────────────────────────
    const forecastChartData = useMemo(() => {
        const days = timeframe === '30 Days' ? 30 : 60;
        const stepCount = 6;
        const step = days / stepCount;

        const baseWeight = latestAvgWeightKg ?? 0;
        const gainPerDay = dailyGainKg ?? 0;

        const labels: string[] = [];
        const projectedData: number[] = [];
        const actualData: number[] = [];
        const hasActual = weighSessions.length > 0;

        // Build projected weights forward from today
        for (let i = 0; i <= stepCount; i++) {
            const dayOffset = Math.round(i * step);
            labels.push(i === 0 ? 'Now' : `+${dayOffset}D`);
            const projected = Math.min(baseWeight + gainPerDay * dayOffset, harvestTargetKg * 1.15);
            projectedData.push(parseFloat(projected.toFixed(2)));
        }

        // Build historical actual weights going backwards
        if (hasActual) {
            const dateMap = new Map<string, number[]>();
            weighSessions.forEach(s => {
                const key = s.recorded_at.slice(0, 10);
                if (!dateMap.has(key)) dateMap.set(key, []);
                dateMap.get(key)!.push((s.net_weight_grams || 0) / 1000);
            });
            // For the "Now" anchor, use current average
            actualData.push(parseFloat((baseWeight).toFixed(2)));
            // Fill forward with projection (we only plot actual history in "Now")
            for (let i = 1; i <= stepCount; i++) {
                actualData.push(projectedData[i]);
            }
        }

        const datasets: any[] = [
            {
                data: projectedData,
                color: (opacity = 1) => colors.prediction ?? '#8B5CF6',
                strokeWidth: 3,
            },
        ];

        // Harvest target line
        const targetLine = Array(stepCount + 1).fill(parseFloat(harvestTargetKg.toFixed(1)));
        datasets.push({
            data: targetLine,
            color: (opacity = 1) => '#EF4444',
            strokeWidth: 1,
            withDots: false,
        });

        // Zero anchor
        datasets.push({
            data: Array(stepCount + 1).fill(0),
            color: () => 'transparent',
            strokeWidth: 0,
            withDots: false,
        });

        return { labels, datasets, hasData: gainPerDay > 0 || baseWeight > 0 };
    }, [latestAvgWeightKg, dailyGainKg, timeframe, weighSessions, colors, harvestTargetKg]);

    // ─── Feed Stage from pig care data ──────────────────────────────────────
    const currentFeedStage = useMemo(() => {
        if (animalType !== 'pig' || currentAgeDays === null) return null;
        const stages = [
            { label: 'Newborn', start: 0, end: 4 },
            { label: 'Booster (Early Wean)', start: 5, end: 35 },
            { label: 'Pre-Starter', start: 36, end: 60 },
            { label: 'Starter', start: 61, end: 90 },
            { label: 'Grower', start: 91, end: 120 },
            { label: 'Finisher', start: 121, end: 9999 },
        ];
        return stages.find(s => currentAgeDays >= s.start && currentAgeDays <= s.end)?.label ?? 'Finisher';
    }, [animalType, currentAgeDays]);

    // ─── Confidence score based on data quality ──────────────────────────────
    const confidencePct = useMemo(() => {
        if (weighSessions.length === 0) return 0;
        // More weigh sessions = higher confidence (caps at 95%)
        const base = Math.min(95, 50 + weighSessions.length * 5);
        // Deduct if very few data points
        if (weighSessions.length < 3) return Math.max(40, base - 20);
        return base;
    }, [weighSessions]);

    // ─── AI Insight text ────────────────────────────────────────────────────
    const getInsightText = () => {
        if (!selectedBatch) return 'Select a batch to view AI predictions.';
        if (weighSessions.length === 0) {
            return `No weight measurements recorded for "${selectedBatch.name}" yet. Connect an AniWeigh scale and record weights to enable growth predictions.`;
        }
        if (dailyGainKg === null || dailyGainKg <= 0) {
            return `Only one weigh-in recorded for "${selectedBatch.name}". Record at least 2 weigh sessions on separate days to calculate the daily growth rate and generate harvest projections.`;
        }

        const gainStr = dailyGainKg.toFixed(3);
        const currentStr = latestAvgWeightKg!.toFixed(2);

        let insight = `"${selectedBatch.name}" is averaging ${currentStr} kg at ${dailyGainKg > 0 ? `${gainStr} kg/day` : 'an unknown daily gain'}. `;

        if (daysToHarvest === 0) {
            insight += `This batch has already reached the ${harvestTargetKg} kg harvest target — consider scheduling harvest soon.`;
        } else if (daysToHarvest !== null) {
            const harvestDateStr = estimatedHarvestDate
                ? estimatedHarvestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—';
            insight += `At this rate, the batch is projected to reach the ${harvestTargetKg} kg harvest target in ${daysToHarvest} days (around ${harvestDateStr}). `;
        }

        if (survivalRate !== null) {
            const rate = parseFloat(survivalRate);
            if (rate < 90) {
                insight += `Survival rate is ${survivalRate}% — monitor health records closely and ensure feed coverage to reduce further losses.`;
            } else {
                insight += `Survival rate is strong at ${survivalRate}% — continue current care protocols.`;
            }
        }

        return insight;
    };

    // ─── Formatting helpers ──────────────────────────────────────────────────
    const formatDate = (d: Date | null) => {
        if (!d) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const activeColor = animalType === 'pig' ? (colors.pig ?? '#EC4899') : (colors.chicken ?? '#F97316');

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingStr = selectedHousing?.name ?? 'No House Selected';
    const batchesOptions = filteredBatches.map(b => b.name);
    const selectedBatchStr = selectedBatch?.name ?? 'No Batch Selected';

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    Prediction &amp; Forecast
                </Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[animalStyles.scrollContent, { paddingTop: 8, paddingBottom: 60 }]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                }
            >
                {/* Intro Text & Confidence Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginRight: 16, marginTop: 0, marginBottom: 0 }]}>
                        AI-driven growth trajectory projections based on your actual farm data.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface }]}>
                        <Text style={[textStyles.label, { color: colors.prediction ?? '#8B5CF6', fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                            CONFIDENCE
                        </Text>
                        <Text style={[textStyles.h1, { color: colors.prediction ?? '#8B5CF6', fontSize: 24, lineHeight: 28 }]}>
                            {confidencePct}%
                        </Text>
                    </View>
                </View>

                {/* Animal Type Segment Filter */}
                <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, padding: 4, marginBottom: 20 }}>
                    {(['pig', 'chicken'] as const).map(t => {
                        const isSelected = animalType === t;
                        return (
                            <TouchableOpacity
                                key={t}
                                onPress={() => setAnimalType(t)}
                                activeOpacity={0.8}
                                style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    alignItems: 'center',
                                    borderRadius: 8,
                                    backgroundColor: isSelected ? colors.primary : 'transparent',
                                }}
                            >
                                <Text style={[textStyles.h3, { color: isSelected ? colors.onPrimary : colors.textGrey, fontSize: 14, fontWeight: '700' }]}>
                                    {t === 'pig' ? 'Pigs' : 'Chickens'}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* House & Batch Dropdowns */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 6 }]}>
                            Select a House
                        </Text>
                        <TouchableOpacity
                            activeOpacity={filteredHousings.length > 0 ? 0.8 : 1}
                            disabled={filteredHousings.length === 0}
                            style={[
                                animalStyles.dropdownContainer,
                                {
                                    backgroundColor: colors.surface,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    paddingVertical: 12,
                                    paddingHorizontal: 12,
                                    opacity: filteredHousings.length > 0 ? 1 : 0.6,
                                },
                            ]}
                            onPress={() => setHousingModalVisible(true)}
                        >
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>
                                {selectedHousingStr}
                            </Text>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 6 }]}>
                            Select a Batch
                        </Text>
                        <TouchableOpacity
                            activeOpacity={filteredBatches.length > 0 ? 0.8 : 1}
                            disabled={filteredBatches.length === 0}
                            style={[
                                animalStyles.dropdownContainer,
                                {
                                    backgroundColor: colors.surface,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    paddingVertical: 12,
                                    paddingHorizontal: 12,
                                    opacity: filteredBatches.length > 0 ? 1 : 0.6,
                                },
                            ]}
                            onPress={() => setBatchModalVisible(true)}
                        >
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>
                                {selectedBatchStr}
                            </Text>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Loading State */}
                {isLoading || isDataLoading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading predictions...</Text>
                    </View>
                ) : filteredHousings.length === 0 ? (
                    /* No Houses */
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <MaterialIcons name="home" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Houses Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            No active {animalType === 'pig' ? 'pig' : 'chicken'} houses are registered on this farm yet.
                        </Text>
                    </View>
                ) : filteredBatches.length === 0 ? (
                    /* No Batches */
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <MaterialIcons name="layers" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Active Batches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            No batches are currently registered in {selectedHousing?.name ?? 'this housing'}.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* ── Key Prediction Metrics ─────────────────────────── */}
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 12 }]}>
                            Prediction Summary
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>

                            {/* Current Average Weight */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Avg Weight</Text>
                                    <MaterialIcons name="monitor-weight" size={16} color={activeColor} />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 22, color: activeColor }]}>
                                    {latestAvgWeightKg !== null ? `${latestAvgWeightKg.toFixed(2)} kg` : '—'}
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                    Latest {weighSessions.length > 0 ? `(${Math.min(5, weighSessions.length)} sessions)` : '(no data)'}
                                </Text>
                            </View>

                            {/* Daily Gain */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Daily Gain</Text>
                                    <MaterialIcons name="trending-up" size={16} color="#27AE60" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 22, color: '#27AE60' }]}>
                                    {dailyGainKg !== null ? `${dailyGainKg.toFixed(3)} kg` : '—'}
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>Per animal / day</Text>
                            </View>

                            {/* Days to Harvest */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Days to Harvest</Text>
                                    <MaterialIcons name="event" size={16} color={colors.prediction ?? '#8B5CF6'} />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 22, color: colors.prediction ?? '#8B5CF6' }]}>
                                    {daysToHarvest === null ? '—' : daysToHarvest === 0 ? 'Ready' : `${daysToHarvest}d`}
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                    Target: {harvestTargetKg} kg
                                </Text>
                            </View>

                            {/* Survival Rate */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Survival Rate</Text>
                                    <MaterialIcons name="favorite" size={16} color="#EF4444" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 22, color: survivalRate !== null && parseFloat(survivalRate) >= 90 ? '#27AE60' : '#EF4444' }]}>
                                    {survivalRate !== null ? `${survivalRate}%` : '—'}
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                    {selectedBatch ? `${selectedBatch.current_count}/${selectedBatch.estimated_count} heads` : '—'}
                                </Text>
                            </View>
                        </View>

                        {/* ── Harvest Projection Card ────────────────────────── */}
                        {estimatedHarvestDate !== null && (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 16, marginBottom: 24,
                                flexDirection: 'row', alignItems: 'center', gap: 16,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                            }}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: (colors.prediction ?? '#8B5CF6') + '1A', alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="calendar-today" size={24} color={colors.prediction ?? '#8B5CF6'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 13, color: colors.textGrey, marginBottom: 2 }}>
                                        Estimated Harvest Date
                                    </Text>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                                        {daysToHarvest === 0 ? 'Harvest Ready Now' : formatDate(estimatedHarvestDate)}
                                    </Text>
                                    {currentAgeDays !== null && (
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                            Current batch age: Day {currentAgeDays}
                                            {currentFeedStage ? ` · ${currentFeedStage} stage` : ''}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* ── Forecast Chart ─────────────────────────────────── */}
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 12 }]}>
                            Weight Forecast
                        </Text>

                        {/* Timeframe Toggle */}
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke, padding: 2 }}>
                                {(['30 Days', '60 Days'] as const).map(tf => (
                                    <TouchableOpacity
                                        key={tf}
                                        onPress={() => setTimeframe(tf)}
                                        style={{
                                            paddingHorizontal: 12,
                                            paddingVertical: 6,
                                            borderRadius: 6,
                                            backgroundColor: timeframe === tf ? (colors.prediction ?? '#8B5CF6') + '1A' : 'transparent',
                                        }}
                                    >
                                        <Text style={[textStyles.label, { color: timeframe === tf ? (colors.prediction ?? '#8B5CF6') : colors.textGrey, fontSize: 11 }]}>
                                            {tf}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={{ alignItems: 'center', marginBottom: 8, alignSelf: 'stretch' }}>
                            {weighSessions.length === 0 ? (
                                <View style={{
                                    width: '100%',
                                    height: 200,
                                    backgroundColor: colors.surface,
                                    borderRadius: 20,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}>
                                    <MaterialIcons name="show-chart" size={40} color={colors.stroke} style={{ marginBottom: 8 }} />
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 13, color: colors.textGrey, textAlign: 'center' }}>
                                        No weight data available.{'\n'}Record weights to see projections.
                                    </Text>
                                </View>
                            ) : (
                                <View style={{
                                    borderRadius: 20,
                                    backgroundColor: colors.surface,
                                    paddingTop: 16,
                                    paddingBottom: 4,
                                    paddingRight: 16,
                                    elevation: 4,
                                    shadowColor: colors.shadow,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 12,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                }}>
                                    <LineChart
                                        data={forecastChartData}
                                        width={width - hPad * 2 - 18}
                                        height={240}
                                        yAxisLabel=""
                                        yAxisSuffix="kg"
                                        withDots={true}
                                        withInnerLines={true}
                                        withOuterLines={false}
                                        withVerticalLines={false}
                                        withHorizontalLines={true}
                                        chartConfig={{
                                            backgroundColor: colors.surface,
                                            backgroundGradientFrom: colors.surface,
                                            backgroundGradientTo: colors.surface,
                                            decimalPlaces: 1,
                                            color: (opacity = 1) => colors.stroke,
                                            labelColor: (opacity = 1) => colors.textGrey,
                                            strokeWidth: 3,
                                            fillShadowGradientFrom: colors.prediction ?? '#8B5CF6',
                                            fillShadowGradientFromOpacity: 0.2,
                                            fillShadowGradientTo: colors.prediction ?? '#8B5CF6',
                                            fillShadowGradientToOpacity: 0.04,
                                            style: { borderRadius: 16 },
                                            propsForDots: {
                                                r: '4',
                                                strokeWidth: '2',
                                                stroke: colors.surface,
                                            },
                                        }}
                                        bezier
                                        style={{ borderRadius: 16 }}
                                    />
                                    {/* Legend */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, paddingLeft: 16, paddingBottom: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.prediction ?? '#8B5CF6' }} />
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Projected Weight</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: '#EF4444' }} />
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Harvest Target ({harvestTargetKg} kg)</Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* ── Batch Overview ─────────────────────────────────── */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            borderRadius: 16,
                            padding: 16,
                            marginBottom: 24,
                            marginTop: 12,
                            elevation: 1,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.5,
                            shadowRadius: 4,
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: activeColor + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <MaterialIcons name="pets" size={20} color={activeColor} />
                                </View>
                                <View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                        {selectedBatch?.name ?? 'Batch'}
                                    </Text>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                        {animalType === 'pig' ? 'Pigs' : 'Chickens'} · {selectedHousing?.name ?? '—'}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[textStyles.h1, { color: activeColor, fontSize: 26, lineHeight: 30 }]}>
                                    {selectedBatch?.current_count ?? 0}
                                </Text>
                                <Text style={[textStyles.label, { color: activeColor, fontSize: 11, opacity: 0.8 }]}>Heads</Text>
                            </View>
                        </View>

                        {/* AI Insight */}
                        <AIInsightCard
                            title="AniBot Prediction"
                            staticContent={getInsightText()}
                            variant="purple"
                        />
                    </>
                )}
            </ScrollView>

            {/* Modals */}
            <SelectionModal
                visible={housingModalVisible}
                onClose={() => setHousingModalVisible(false)}
                onSelect={(val) => {
                    const matched = filteredHousings.find(h => h.name === val);
                    if (matched) setSelectedHousingId(matched.id);
                    setHousingModalVisible(false);
                }}
                title="Select House"
                description="Choose a house to view its prediction report."
                icon="home"
                options={housingsOptions}
                selectedValue={selectedHousingStr}
                requireConfirm={false}
                enableSearch={false}
            />

            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={(val) => {
                    const matched = filteredBatches.find(b => b.name === val);
                    if (matched) setSelectedBatchId(matched.id);
                    setBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose a batch to view its specific forecast."
                icon="layers"
                options={batchesOptions}
                selectedValue={selectedBatchStr}
                requireConfirm={false}
                enableSearch={false}
            />
        </SafeAreaView>
    );
}

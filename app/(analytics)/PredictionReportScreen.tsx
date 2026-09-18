import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

import { BackButton } from '@/components/BackButton';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { PrintReportButton } from '@/components/PrintReportButton';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import { ReportDocument, ReportStat } from '@/lib/pdfReport';
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
    pig: 95,      // Market-ready finisher pig (synced with web)
    chicken: 2.2, // Market-ready broiler chicken (synced with web)
};

function formatDate(d: Date | null | undefined): string {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PredictionReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const { profile } = useAuth();
    const { activeFarmIds, managedFarms, selectedFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const currentFarm = managedFarms.find(f => f.id === farmId);
    const [farmName, setFarmName] = useState<string>(currentFarm?.name || (profile as any)?.farm_name || (profile as any)?.farmName || '');

    useEffect(() => {
        if (currentFarm?.name) {
            setFarmName(currentFarm.name);
        }
    }, [currentFarm?.name]);

    // batchId (e.g. linked from a Weighing Session Report) takes priority
    // over the default "first housing, most recent batch" auto-pick below.
    const { type, batchId: requestedBatchId } = useLocalSearchParams<{ type?: string; batchId?: string }>();
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
    const [forecastTooltip, setForecastTooltip] = useState<{ x: number; y: number; value: number; label: string } | null>(null);

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
            const [housingsRes, batchesRes, farmRes] = await Promise.all([
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
                    .eq('status', 'active') // sold/completed batches shouldn't clutter this picker
                    .order('arrival_date', { ascending: false }),
                supabase
                    .from('farms')
                    .select('name')
                    .eq('id', farmId)
                    .maybeSingle(),
            ]);

            if (housingsRes.error) throw housingsRes.error;
            if (batchesRes.error) throw batchesRes.error;

            if (farmRes.data?.name) {
                setFarmName(farmRes.data.name);
            }

            const housingsData = (housingsRes.data || []) as HousingInfo[];
            const batchesData = (batchesRes.data || []) as BatchInfo[];

            setAllHousings(housingsData);
            setAllBatches(batchesData);

            // An explicitly-requested batch wins outright.
            const requestedBatch = typeof requestedBatchId === 'string'
                ? batchesData.find(b => b.id === requestedBatchId)
                : undefined;
            if (requestedBatch) {
                const requestedHousing = housingsData.find(h => h.id === requestedBatch.housing_id);
                if (requestedHousing) {
                    setAnimalType(requestedHousing.animal_type === 'chicken' ? 'chicken' : 'pig');
                    animalTypeRef.current = requestedHousing.animal_type === 'chicken' ? 'chicken' : 'pig';
                }
                setSelectedHousingId(requestedBatch.housing_id);
                setSelectedBatchId(requestedBatch.id);

                const [reqWeighRes, reqHealthRes] = await Promise.all([
                    supabase.from('weigh_sessions').select('id, net_weight_grams, status, recorded_at, batch_id')
                        .eq('batch_id', requestedBatch.id).order('recorded_at', { ascending: true }),
                    supabase.from('health_records').select('id, record_type, affected_count, record_date')
                        .eq('batch_id', requestedBatch.id).is('deleted_at', null),
                ]);
                setWeighSessions((reqWeighRes.data || []) as WeighSession[]);
                setHealthRecords((reqHealthRes.data || []) as HealthRecord[]);
                lastLoadedBatchIdRef.current = requestedBatch.id;
                setIsLoading(false);
                return;
            }

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

    const handleSwitchAnimalType = useCallback((type: 'pig' | 'chicken') => {
        if (type === animalType) return;
        setAnimalType(type);
        const targetHousings = allHousings.filter(h => h.animal_type === type);
        if (targetHousings.length > 0) {
            const nextHousingId = targetHousings[0].id;
            setSelectedHousingId(nextHousingId);
            const targetBatches = allBatches.filter(b => b.housing_id === nextHousingId);
            if (targetBatches.length > 0) {
                const nextBatchId = targetBatches[0].id;
                setSelectedBatchId(nextBatchId);
                fetchBatchData(nextBatchId);
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
    }, [animalType, allHousings, allBatches, fetchBatchData]);

    const handleSelectHousing = useCallback((housingId: string) => {
        if (housingId === selectedHousingId) return;
        setSelectedHousingId(housingId);
        const targetBatches = allBatches.filter(b => b.housing_id === housingId);
        if (targetBatches.length > 0) {
            const nextBatchId = targetBatches[0].id;
            setSelectedBatchId(nextBatchId);
            fetchBatchData(nextBatchId);
        } else {
            setSelectedBatchId(null);
            setWeighSessions([]);
            setHealthRecords([]);
            lastLoadedBatchIdRef.current = null;
        }
    }, [selectedHousingId, allBatches, fetchBatchData]);

    const handleSelectBatch = useCallback((batchId: string) => {
        if (batchId === selectedBatchId) return;
        setSelectedBatchId(batchId);
        fetchBatchData(batchId);
    }, [selectedBatchId, fetchBatchData]);

    useEffect(() => { fetchReportMetadata(); }, [fetchReportMetadata]);

    // Auto-resolve housing when animal type changes as a fallback
    useEffect(() => {
        if (filteredHousings.length > 0) {
            const exists = filteredHousings.some(h => h.id === selectedHousingId);
            if (!exists) setSelectedHousingId(filteredHousings[0].id);
        } else {
            setSelectedHousingId(null);
        }
    }, [animalType, allHousings, selectedHousingId]);

    // Auto-resolve batch when housing changes as a fallback
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

    // ─── Realtime: Live update prediction when new weights or health logs land ───
    useEffect(() => {
        if (!selectedBatchId) return;

        const channel = supabase
            .channel(`realtime-prediction-report-${selectedBatchId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'weigh_sessions',
                    filter: `batch_id=eq.${selectedBatchId}`,
                },
                () => {
                    fetchBatchData(selectedBatchId);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'health_records',
                    filter: `batch_id=eq.${selectedBatchId}`,
                },
                () => {
                    fetchBatchData(selectedBatchId);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedBatchId, fetchBatchData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchReportMetadata();
        if (selectedBatchId) await fetchBatchData(selectedBatchId);
        setRefreshing(false);
    }, [fetchReportMetadata, selectedBatchId, fetchBatchData]);

    // ─── Prediction Computations (Synced with Web logic) ─────────────────────
    const latestAvgWeightKg = useMemo(() => {
        if (weighSessions.length === 0) return null;
        const sorted = [...weighSessions].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
        const latestDateStr = sorted[sorted.length - 1].recorded_at.slice(0, 10);
        const latestBatchWeighs = sorted.filter(s => s.recorded_at.slice(0, 10) === latestDateStr);
        const recordsToUse = latestBatchWeighs.length > 0 ? latestBatchWeighs : sorted.slice(-5);
        const total = recordsToUse.reduce((s, w) => s + (w.net_weight_grams || 0), 0);
        return total / recordsToUse.length / 1000;
    }, [weighSessions]);

    const dailyGainKg = useMemo(() => {
        if (weighSessions.length < 2) return null;
        const sorted = [...weighSessions].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const days = (new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / (1000 * 60 * 60 * 24);
        if (days < 1) return null;
        const firstDate = first.recorded_at.slice(0, 10);
        const lastDate = last.recorded_at.slice(0, 10);
        const firstLogs = sorted.filter(s => s.recorded_at.slice(0, 10) === firstDate);
        const lastLogs = sorted.filter(s => s.recorded_at.slice(0, 10) === lastDate);
        const firstAvg = firstLogs.reduce((acc, s) => acc + (s.net_weight_grams || 0), 0) / firstLogs.length / 1000;
        const lastAvg = lastLogs.reduce((acc, s) => acc + (s.net_weight_grams || 0), 0) / lastLogs.length / 1000;
        const diffKg = lastAvg - firstAvg;
        return Math.max(0.01, diffKg / days);
    }, [weighSessions]);

    // Harvest target matching web (95 kg for pig, 2.2 kg for chicken)
    const harvestTargetKg = animalType === 'pig' ? 95 : 2.2;

    const daysToHarvest = useMemo(() => {
        if (!latestAvgWeightKg || !dailyGainKg || dailyGainKg <= 0) return null;
        const remaining = harvestTargetKg - latestAvgWeightKg;
        if (remaining <= 0) return 0;
        return Math.ceil(remaining / dailyGainKg);
    }, [latestAvgWeightKg, dailyGainKg, harvestTargetKg]);

    const estimatedHarvestDate = useMemo(() => {
        if (daysToHarvest === null) return null;
        const d = new Date();
        d.setDate(d.getDate() + daysToHarvest);
        return d;
    }, [daysToHarvest]);

    const currentAgeDays = useMemo(() => {
        if (!selectedBatch || !selectedBatch.arrival_date) return null;
        const arrival = new Date(selectedBatch.arrival_date);
        const now = new Date();
        arrival.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diff = Math.floor((now.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff + (selectedBatch.age_at_arrival_days || 0));
    }, [selectedBatch]);

    const totalDeceased = useMemo(() => {
        return healthRecords
            .filter(r => r.record_type === 'mortality')
            .reduce((sum, r) => sum + (r.affected_count ?? 1), 0);
    }, [healthRecords]);

    const survivalRate = useMemo(() => {
        if (!selectedBatch || selectedBatch.estimated_count <= 0) return null;
        const alive = Math.max(0, selectedBatch.estimated_count - totalDeceased);
        return ((alive / selectedBatch.estimated_count) * 100).toFixed(1);
    }, [selectedBatch, totalDeceased]);

    // Forecast chart data matching web
    const forecastChartData = useMemo(() => {
        const totalDays = timeframe === '30 Days' ? 30 : 60;
        const stepCount = 6;
        const stepDays = Math.round(totalDays / stepCount);

        const labels: string[] = [];
        const projectedData: number[] = [];
        const targetLine: number[] = [];

        const baseWeight = latestAvgWeightKg ?? (animalType === 'pig' ? 25 : 0.05);
        const gainPerDay = dailyGainKg ?? (animalType === 'pig' ? 0.65 : 0.05);

        for (let i = 0; i <= stepCount; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i * stepDays);
            labels.push(i === 0 ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            const projWeight = Math.max(0, baseWeight + i * stepDays * gainPerDay);
            projectedData.push(parseFloat(projWeight.toFixed(2)));
            targetLine.push(harvestTargetKg);
        }

        const detailedPoints = projectedData.map((weight, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i * stepDays);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayOffset = i * stepDays;
            const shortLabel = i === 0 ? 'Today' : `+${dayOffset}d`;
            const label = i === 0 ? `Today (${dateStr})` : `+${dayOffset}d (${dateStr})`;
            const diff = parseFloat((weight - harvestTargetKg).toFixed(2));
            const targetPct = Math.round((weight / harvestTargetKg) * 100);
            const isTargetMet = weight >= harvestTargetKg;
            const gainFromNow = parseFloat((weight - baseWeight).toFixed(2));
            return { weight, dayOffset, dateStr, shortLabel, label, diff, targetPct, isTargetMet, gainFromNow };
        });

        const predictionColor = (colors as any).prediction ?? '#8B5CF6';

        return {
            labels,
            datasets: [
                { data: projectedData, color: () => predictionColor, strokeWidth: 3 },
                { data: targetLine, color: () => '#EF4444', strokeWidth: 1.5, withDots: false },
                { data: Array(stepCount + 1).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false },
            ],
            hasData: gainPerDay > 0 || baseWeight > 0,
            detailedPoints,
            stepDays,
            projectedData,
            targetLine,
        };
    }, [latestAvgWeightKg, dailyGainKg, timeframe, colors, harvestTargetKg, animalType]);

    // ─── Feed Stage ─────────────────────────────────────────────────────────
    const currentFeedStage = useMemo(() => {
        if (currentAgeDays === null) return null;
        if (animalType === 'chicken') {
            if (currentAgeDays <= 10) return 'Broiler Starter';
            if (currentAgeDays <= 24) return 'Broiler Grower';
            return 'Broiler Finisher';
        } else {
            const stages = [
                { label: 'Newborn', start: 0, end: 4 },
                { label: 'Booster (Early Wean)', start: 5, end: 35 },
                { label: 'Pre-Starter', start: 36, end: 60 },
                { label: 'Starter', start: 61, end: 90 },
                { label: 'Grower', start: 91, end: 120 },
                { label: 'Finisher', start: 121, end: 9999 },
            ];
            return stages.find(s => currentAgeDays >= s.start && currentAgeDays <= s.end)?.label ?? 'Finisher';
        }
    }, [animalType, currentAgeDays]);

    // ─── Friendly Forecast Milestones Timeline (Synced with Web) ───────────────
    const forecastMilestones = useMemo(() => {
        return forecastChartData.detailedPoints || [];
    }, [forecastChartData]);

    // ─── Factor Analysis (What is happening & what to expect) ───────────────
    const factorAnalysis = useMemo(() => {
        if (!selectedBatch || latestAvgWeightKg === null) return null;

        const gainGrams = dailyGainKg !== null ? Math.round(dailyGainKg * 1000) : null;
        const isTargetMet = latestAvgWeightKg >= harvestTargetKg;
        const remainingKg = Math.max(0, harvestTargetKg - latestAvgWeightKg);

        // 1. Growth & Gain factor
        let growthHeading = isTargetMet ? 'Market-Ready Weight Reached' : 'Active Growth Velocity';
        let growthText = '';
        if (isTargetMet) {
            growthText = `The cohort has achieved an average of ${latestAvgWeightKg.toFixed(2)} kg, fulfilling the commercial harvest standard of ${harvestTargetKg} kg. Animals are in prime selling condition. Continuing feed without harvest increases feed conversion cost (FCR) with diminishing daily returns.`;
        } else if (dailyGainKg !== null && dailyGainKg > 0) {
            const weeklyGainKg = (dailyGainKg * 7).toFixed(2);
            growthText = `Animals are gaining approximately ${gainGrams} g/day (+${weeklyGainKg} kg/week). With ${remainingKg.toFixed(2)} kg remaining to reach ${harvestTargetKg} kg, the flock is following an active, healthy growth curve.`;
        } else {
            growthText = `Current average weight is ${latestAvgWeightKg.toFixed(2)} kg. Record additional weigh sessions across separate days to calculate the active daily growth rate.`;
        }

        // 2. Feed & Nutrition factor
        let feedHeading = currentFeedStage ? `${currentFeedStage} Stage` : 'Nutritional Feed Stage';
        let feedText = '';
        if (animalType === 'chicken') {
            if (currentAgeDays !== null && currentAgeDays >= 25) {
                feedText = 'Currently on Finisher Feed. Broilers consume their highest daily volume in this phase (~160–180g per bird daily). Feed energy directly drives breast meat and muscle density. Ensure uninterrupted feeder access without feed bridging in troughs.';
            } else if (currentAgeDays !== null && currentAgeDays >= 11) {
                feedText = 'Currently on Grower Feed. High crude protein and balanced amino acids support rapid bone structure and skeletal expansion to carry eventual finisher weight.';
            } else {
                feedText = 'Currently on Starter Feed. Early crumbled feed supports vital organ development, gut health, and initial chick vigor.';
            }
        } else {
            feedText = `${currentFeedStage ?? 'Current'} diet supports steady daily weight gain. Keep feed fresh and ensure clean trough space to prevent spoilage.`;
        }

        // 3. Health & Uniformity factor
        const survNum = survivalRate ? parseFloat(survivalRate) : 100;
        let healthHeading = survNum >= 95 ? 'Strong Flock Uniformity & Health' : 'Flock Health & Uniformity';
        let healthText = '';
        if (survNum >= 95) {
            healthText = `Flock survival rate is excellent at ${survivalRate}% with ${selectedBatch.current_count} active animals. High survival correlates with even flock uniformity, meaning the vast majority of birds will hit target harvest weight together for single-haul selling.`;
        } else {
            healthText = `Survival rate is ${survivalRate}%. Monitor bird activity at feeders and check water lines. Slower-growing birds may benefit from temporary segregation or additional feeder space.`;
        }

        // 4. Housing & Environment factor
        let envHeading = animalType === 'chicken' ? 'Ventilation & Heat Management' : 'Barn Climate & Comfort';
        let envText = '';
        if (animalType === 'chicken') {
            if (latestAvgWeightKg >= 2.0) {
                envText = 'Heavy finisher broilers generate significant body heat. Ensure ventilation fans or tunnel airflow are running at capacity during peak heat hours. Keep drinking water cool to encourage constant hydration.';
            } else {
                envText = 'Maintain stable house temperature and draft-free conditions to minimize energy spent on thermal regulation.';
            }
        } else {
            envText = 'Maintain adequate airflow to prevent ammonia buildup and keep resting areas clean and dry.';
        }

        // Actionable recommendation
        let actionRecommendation = '';
        if (isTargetMet || daysToHarvest === 0) {
            actionRecommendation = 'Harvest Window Open: The flock has met commercial weight. Plan harvest and market transport within the next 2–5 days to maximize feed-to-profit conversion.';
        } else if (daysToHarvest !== null && daysToHarvest <= 7) {
            actionRecommendation = `Approaching Target: Market harvest projected in ~${daysToHarvest} days. Review withdrawal times for any treatments and prepare shipping logistics.`;
        } else if (daysToHarvest !== null) {
            actionRecommendation = `On Track: Estimated harvest in ${daysToHarvest} days (${formatDate(estimatedHarvestDate)}). Maintain current feeding schedule and monitor weekly weight gain.`;
        } else {
            actionRecommendation = 'Log weights across multiple sessions to calculate projected market harvest date.';
        }

        return {
            growthHeading,
            growthText,
            feedHeading,
            feedText,
            healthHeading,
            healthText,
            envHeading,
            envText,
            actionRecommendation,
            isTargetMet,
        };
    }, [selectedBatch, latestAvgWeightKg, dailyGainKg, harvestTargetKg, currentAgeDays, currentFeedStage, animalType, survivalRate, daysToHarvest, estimatedHarvestDate]);

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


    // ─── PDF Report Builder ──────────────────────────────────────────────────
    const buildPredictionReport = useCallback((): ReportDocument | null => {
        if (!selectedBatch) return null;

        const growthStats: ReportStat[] = [
            { label: 'Avg Weight (Latest)', value: latestAvgWeightKg !== null ? `${latestAvgWeightKg.toFixed(2)} kg` : '—' },
            { label: 'Daily Gain', value: dailyGainKg !== null ? `${dailyGainKg.toFixed(3)} kg/day` : '—' },
            { label: 'Harvest Target', value: `${harvestTargetKg} kg` },
            { label: 'Prediction Confidence', value: `${confidencePct}%` },
        ];

        const harvestStats: ReportStat[] = [
            { label: 'Days To Harvest', value: daysToHarvest !== null ? String(daysToHarvest) : 'Not enough data', accent: daysToHarvest === 0 ? 'good' : undefined },
            { label: 'Estimated Harvest Date', value: formatDate(estimatedHarvestDate) },
            { label: 'Survival Rate', value: survivalRate !== null ? `${survivalRate}%` : '—', accent: survivalRate !== null ? (parseFloat(survivalRate) < 90 ? 'warn' : 'good') : undefined },
            { label: 'Recorded Deaths', value: String(totalDeceased), accent: totalDeceased > 0 ? 'bad' : undefined },
        ];

        const projectionRows = forecastChartData.detailedPoints.map(pt => [
            pt.label,
            `${pt.weight.toFixed(2)} kg`,
            `${harvestTargetKg.toFixed(2)} kg`,
            pt.diff >= 0 ? `+${pt.diff.toFixed(2)} kg` : `${pt.diff.toFixed(2)} kg`,
        ]);

        const selectedHousingFarmName = (selectedHousing as any)?.farms?.name;
        const selectedBatchFarmName = (selectedBatch as any)?.housings?.farms?.name;
        const activeFarmObj = managedFarms.find(f => (selectedFarmIds && selectedFarmIds.length > 0 ? selectedFarmIds.includes(f.id) : activeFarmIds.includes(f.id)))
            || managedFarms.find(f => f.id === farmId);
        const activeFarmName = activeFarmObj?.name;

        const selectedFarmDisplayName = selectedHousingFarmName
            || selectedBatchFarmName
            || activeFarmName
            || farmName
            || (profile as any)?.farm_name
            || (profile as any)?.farmName
            || (managedFarms.length > 0 ? managedFarms[0]?.name : '')
            || 'Farm Operations';

        return {
            reportTitle: 'Growth Prediction Report',
            farmName: selectedFarmDisplayName,
            subtitle: `${selectedBatch.name} · ${selectedHousing?.name ?? 'No Housing'} · ${animalType === 'pig' ? 'Pigs' : 'Chickens'}`,
            meta: [
                { label: 'Farm / Facility', value: selectedFarmDisplayName },
                { label: 'Batch', value: selectedBatch.name },
                { label: 'Housing', value: selectedHousing?.name ?? '—' },
                { label: 'Animal Type', value: animalType === 'pig' ? 'Pig' : 'Chicken' },
                { label: 'Current Age', value: currentAgeDays !== null ? `Day ${currentAgeDays}` : '—' },
                { label: 'Head Count', value: String(selectedBatch.current_count) },
                ...(currentFeedStage ? [{ label: 'Feed Stage', value: currentFeedStage }] : []),
            ],
            sections: [
                { heading: 'Current Growth Status', stats: growthStats },
                { heading: 'Harvest Prediction', stats: harvestStats, paragraphs: [getInsightText()] },
                {
                    heading: `Projected Growth Trajectory Milestones — ${timeframe}`,
                    table: {
                        headers: ['Timeline Milestone', 'Projected Weight', 'Target Weight', 'Variance to Target'],
                        rows: projectionRows,
                        note: weighSessions.length < 2 ? 'Projection requires at least 2 weigh-ins on separate days for an accurate growth rate.' : undefined,
                    },
                },
            ],
        };
    }, [selectedBatch, selectedHousing, animalType, currentAgeDays, latestAvgWeightKg, dailyGainKg, harvestTargetKg, confidencePct, daysToHarvest, estimatedHarvestDate, survivalRate, totalDeceased, forecastChartData, timeframe, currentFeedStage, farmName, weighSessions]);

    const activeColor = animalType === 'pig' ? (colors.pig ?? '#EC4899') : (colors.chicken ?? '#F97316');

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingStr = selectedHousing?.name ?? 'No House Selected';
    const batchesOptions = filteredBatches.map(b => b.name);
    const selectedBatchStr = selectedBatch?.name ?? 'No Batch Selected';

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, flex: 1, textAlign: 'center', marginHorizontal: 8 }]}>
                    Prediction &amp; Forecast
                </Text>
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <PrintReportButton
                        buildReport={buildPredictionReport}
                        emptyMessage="Select a batch first."
                    />
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[animalStyles.scrollContent, { paddingTop: 8, paddingBottom: 60 }]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                }
            >
                {/* Intro Text & Confidence Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 4, gap: 12 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginTop: 0, marginBottom: 0 }]}>
                        AI-driven growth trajectory projections based on your actual farm data.
                    </Text>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: (colors.prediction ?? '#8B5CF6') + '15',
                        borderWidth: 1,
                        borderColor: (colors.prediction ?? '#8B5CF6') + '30',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 20,
                        flexShrink: 0,
                    }}>
                        <MaterialIcons name="psychology" size={16} color={colors.prediction ?? '#8B5CF6'} />
                        <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: colors.prediction ?? '#8B5CF6' }}>
                            {confidencePct}% {daysToHarvest !== null ? `· ${daysToHarvest === 0 ? 'Harvest Ready' : `${daysToHarvest}d to Harvest`}` : ''}
                        </Text>
                    </View>
                </View>

                {/* Sliding Animal Type Pill Switcher */}
                <AnimalTypePillSwitcher
                    selected={animalType}
                    onSelect={handleSwitchAnimalType}
                    style={{ marginBottom: 16 }}
                />

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
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]}>
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
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]}>
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
                                    <AniWeighIcon size={16} />
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

                        {/* ── Forecast Chart Section ─────────────────────────── */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 0 }]}>
                                    Weight Forecast &amp; Harvest Trajectory
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                    {estimatedHarvestDate
                                        ? `Estimated target completion: ${formatDate(estimatedHarvestDate)} (${daysToHarvest === 0 ? 'Harvest Ready Now' : `${daysToHarvest} days remaining`})`
                                        : 'Simulated growth curve based on latest average daily gain.'}
                                </Text>
                            </View>

                            {/* Timeframe Toggle */}
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

                        {/* Quick Forecast Glance (Milestone Timeline Cards) */}
                        {forecastMilestones.length > 0 && (
                            <View style={{ marginTop: 12, marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                        Quick Forecast Glance
                                    </Text>
                                    <View style={{
                                        backgroundColor: (colors.prediction ?? '#8B5CF6') + '15',
                                        paddingHorizontal: 8,
                                        paddingVertical: 2,
                                        borderRadius: 6,
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.prediction ?? '#8B5CF6' }}>
                                            Target: {harvestTargetKg} kg
                                        </Text>
                                    </View>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                                    {forecastMilestones.map((m, idx) => (
                                        <View
                                            key={idx}
                                            style={{
                                                width: 90,
                                                backgroundColor: m.isTargetMet ? (colors.primary + '12') : colors.surface,
                                                borderRadius: 12,
                                                padding: 10,
                                                borderWidth: 1,
                                                borderColor: m.isTargetMet ? (colors.primary + '35') : colors.stroke,
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: m.isTargetMet ? colors.primary : colors.text }}>
                                                {m.shortLabel}
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey, marginBottom: 2 }}>
                                                {m.dateStr}
                                            </Text>
                                            <Text style={[textStyles.h2, { fontSize: 15, color: m.isTargetMet ? colors.primary : colors.text, marginTop: 2, marginBottom: 0 }]}>
                                                {m.weight.toFixed(2)}
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                                kg
                                            </Text>
                                            <View style={{
                                                backgroundColor: m.isTargetMet ? (colors.primary + '20') : (colors.prediction ?? '#8B5CF6') + '15',
                                                paddingHorizontal: 5,
                                                paddingVertical: 2,
                                                borderRadius: 4,
                                                marginTop: 4,
                                            }}>
                                                <Text style={{
                                                    fontFamily: 'Poppins-Medium',
                                                    fontSize: 8,
                                                    color: m.isTargetMet ? colors.primary : (colors.prediction ?? '#8B5CF6'),
                                                }}>
                                                    {m.isTargetMet ? 'Goal Met' : `${m.targetPct}%`}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* Forecast Line Chart Container */}
                        <View style={{ alignItems: 'center', marginBottom: 16, alignSelf: 'stretch' }}>
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
                                    width: '100%',
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
                                        onDataPointClick={({ x, y, value, index }) => {
                                            if (value === 0 && index === 0) return;
                                            const pt = forecastChartData.detailedPoints?.[index];
                                            const label = pt ? pt.label : forecastChartData.labels?.[index] ?? `#${index + 1}`;
                                            setForecastTooltip(prev =>
                                                prev && prev.x === x && prev.y === y ? null : { x, y, value, label }
                                            );
                                        }}
                                        decorator={() => {
                                            if (!forecastTooltip) return null;
                                            const { x, y, value, label } = forecastTooltip;
                                            const tipW = 96;
                                            const tipH = 46;
                                            const offsetX = x + tipW + 8 > (width - hPad * 2 - 18) ? x - tipW - 6 : x - tipW / 2;
                                            const offsetY = y - tipH - 10 < 0 ? y + 8 : y - tipH - 8;
                                            const isTargetMet = value >= harvestTargetKg;
                                            return (
                                                <View style={{
                                                    position: 'absolute',
                                                    left: offsetX,
                                                    top: offsetY,
                                                    backgroundColor: colors.text,
                                                    borderRadius: 8,
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 5,
                                                    width: tipW,
                                                    alignItems: 'center',
                                                    shadowColor: '#000',
                                                    shadowOffset: { width: 0, height: 2 },
                                                    shadowOpacity: 0.25,
                                                    shadowRadius: 4,
                                                    elevation: 6,
                                                }}>
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.surface }}>
                                                        {value.toFixed(2)} kg
                                                    </Text>
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 8, color: colors.surface, opacity: 0.8, textAlign: 'center' }}>
                                                        {label}
                                                    </Text>
                                                    <Text style={{
                                                        fontFamily: 'Poppins-Medium',
                                                        fontSize: 8,
                                                        color: isTargetMet ? '#34D399' : '#FBBF24',
                                                        marginTop: 1,
                                                    }}>
                                                        {isTargetMet ? 'Goal Met' : `${(harvestTargetKg - value).toFixed(2)}kg to goal`}
                                                    </Text>
                                                </View>
                                            );
                                        }}
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
                                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, paddingLeft: 16, paddingBottom: 6 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.prediction ?? '#8B5CF6' }} />
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Projected Weight</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: '#EF4444' }} />
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Harvest Target ({harvestTargetKg} kg)</Text>
                                        </View>
                                    </View>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey, textAlign: 'center', paddingBottom: 10, opacity: 0.7 }}>
                                        Tap any point on the curve to inspect weight details
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* ── Projected Growth Trajectory Milestones Table (Synced with Web) ── */}
                        {forecastMilestones.length > 0 && (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderRadius: 18,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                padding: 16,
                                marginBottom: 20,
                                shadowColor: colors.shadow,
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.06,
                                shadowRadius: 6,
                                elevation: 2,
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <View style={{ flex: 1, marginRight: 8 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                            Projected Growth Trajectory Milestones
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                            {timeframe} simulation with target variance
                                        </Text>
                                    </View>
                                    <View style={{
                                        backgroundColor: (colors.prediction ?? '#8B5CF6') + '15',
                                        paddingHorizontal: 8,
                                        paddingVertical: 3,
                                        borderRadius: 6,
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.prediction ?? '#8B5CF6' }}>
                                            Goal: {harvestTargetKg} kg
                                        </Text>
                                    </View>
                                </View>

                                {/* Table Column Header */}
                                <View style={{
                                    flexDirection: 'row',
                                    backgroundColor: colors.bgLight,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: 8,
                                    marginBottom: 4,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                }}>
                                    <Text style={{ flex: 1.3, fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.textGrey, textTransform: 'uppercase' }}>
                                        Milestone
                                    </Text>
                                    <Text style={{ flex: 1.1, fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.textGrey, textAlign: 'center', textTransform: 'uppercase' }}>
                                        Projected
                                    </Text>
                                    <Text style={{ flex: 1, fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.textGrey, textAlign: 'center', textTransform: 'uppercase' }}>
                                        Target
                                    </Text>
                                    <Text style={{ flex: 1.1, fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.textGrey, textAlign: 'right', textTransform: 'uppercase' }}>
                                        Variance
                                    </Text>
                                </View>

                                {/* Table Rows */}
                                {forecastMilestones.map((m, idx) => {
                                    const isTargetMet = m.isTargetMet;
                                    const varianceStr = m.diff >= 0 ? `+${m.diff.toFixed(2)}` : `${m.diff.toFixed(2)}`;
                                    const isLast = idx === forecastMilestones.length - 1;
                                    return (
                                        <View
                                            key={idx}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                paddingVertical: 9,
                                                paddingHorizontal: 10,
                                                borderBottomWidth: isLast ? 0 : 1,
                                                borderBottomColor: colors.stroke,
                                                backgroundColor: isTargetMet ? (colors.primary + '08') : 'transparent',
                                                borderRadius: isTargetMet ? 6 : 0,
                                            }}
                                        >
                                            <View style={{ flex: 1.3 }}>
                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11.5, color: colors.text }}>
                                                    {m.label}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1.1, alignItems: 'center' }}>
                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: isTargetMet ? colors.primary : colors.text }}>
                                                    {m.weight.toFixed(2)} kg
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1, alignItems: 'center' }}>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11.5, color: colors.textGrey }}>
                                                    {harvestTargetKg.toFixed(2)} kg
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1.1, alignItems: 'flex-end' }}>
                                                <View style={{
                                                    backgroundColor: isTargetMet ? '#27AE6018' : '#EF444415',
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 2,
                                                    borderRadius: 4,
                                                }}>
                                                    <Text style={{
                                                        fontFamily: 'Poppins-SemiBold',
                                                        fontSize: 10,
                                                        color: isTargetMet ? '#27AE60' : '#EF4444',
                                                    }}>
                                                        {varianceStr} kg
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* ── What Is Happening Now & What To Expect (Factor Analysis Card) ── */}
                        {factorAnalysis && (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderRadius: 18,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                padding: 16,
                                shadowColor: colors.shadow,
                                shadowOffset: { width: 0, height: 3 },
                                shadowOpacity: 0.08,
                                shadowRadius: 8,
                                elevation: 2,
                                marginBottom: 24,
                            }}>
                                {/* Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (colors.prediction ?? '#8B5CF6') + '18', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name="insights" size={20} color={colors.prediction ?? '#8B5CF6'} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text }}>
                                            What Is Happening Now & What To Expect
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                            Real-world factors shaping your flock's growth trajectory
                                        </Text>
                                    </View>
                                </View>

                                {/* 4 Factor Sections */}
                                <View style={{ gap: 10, marginBottom: 14 }}>
                                    {/* Factor 1: Growth & Gain */}
                                    <View style={{ backgroundColor: colors.bgLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <MaterialIcons name="trending-up" size={16} color="#27AE60" />
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                                {factorAnalysis.growthHeading}
                                            </Text>
                                        </View>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 17 }}>
                                            {factorAnalysis.growthText}
                                        </Text>
                                    </View>

                                    {/* Factor 2: Feed & Nutrition */}
                                    <View style={{ backgroundColor: colors.bgLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <MaterialIcons name="restaurant" size={16} color={colors.secondary} />
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                                {factorAnalysis.feedHeading}
                                            </Text>
                                        </View>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 17 }}>
                                            {factorAnalysis.feedText}
                                        </Text>
                                    </View>

                                    {/* Factor 3: Flock Health & Uniformity */}
                                    <View style={{ backgroundColor: colors.bgLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <MaterialIcons name="health-and-safety" size={16} color="#3B82F6" />
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                                {factorAnalysis.healthHeading}
                                            </Text>
                                        </View>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 17 }}>
                                            {factorAnalysis.healthText}
                                        </Text>
                                    </View>

                                    {/* Factor 4: Environment & Housing */}
                                    <View style={{ backgroundColor: colors.bgLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <MaterialIcons name="wb-sunny" size={16} color="#F59E0B" />
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                                {factorAnalysis.envHeading}
                                            </Text>
                                        </View>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 17 }}>
                                            {factorAnalysis.envText}
                                        </Text>
                                    </View>
                                </View>

                                {/* Harvest & Action Recommendation Banner */}
                                <View style={{
                                    flexDirection: 'row',
                                    gap: 10,
                                    alignItems: 'center',
                                    backgroundColor: factorAnalysis.isTargetMet ? (colors.primary + '12') : ((colors.prediction ?? '#8B5CF6') + '12'),
                                    borderWidth: 1,
                                    borderColor: factorAnalysis.isTargetMet ? (colors.primary + '30') : ((colors.prediction ?? '#8B5CF6') + '30'),
                                    borderRadius: 12,
                                    padding: 12,
                                }}>
                                    <MaterialIcons
                                        name="lightbulb"
                                        size={20}
                                        color={factorAnalysis.isTargetMet ? colors.primary : (colors.prediction ?? '#8B5CF6')}
                                    />
                                    <Text style={{
                                        fontFamily: 'Poppins-Medium',
                                        fontSize: 12,
                                        color: factorAnalysis.isTargetMet ? colors.primary : (colors.prediction ?? '#8B5CF6'),
                                        flex: 1,
                                        lineHeight: 18,
                                    }}>
                                        {factorAnalysis.actionRecommendation}
                                    </Text>
                                </View>
                            </View>
                        )}

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
                                    <Image
                                        source={require('../../assets/icons/animals-filled.svg')}
                                        style={{ width: 22, height: 22 }}
                                        contentFit="contain"
                                    />
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
                            category="prediction_report"
                            farmId={farmId}
                            subKey={selectedBatchId ? `${selectedBatchId}_${animalType}` : (selectedHousingId ? `${selectedHousingId}_${animalType}` : animalType)}
                            staticContent={getInsightText()}
                            context={{
                                type: 'animal',
                                animalType,
                                housingName: selectedHousing?.name,
                                data: {
                                    batchId: selectedBatchId,
                                    housingId: selectedHousingId,
                                    batchName: selectedBatch?.name,
                                    currentCount: selectedBatch?.current_count,
                                    weighCount: weighSessions.length,
                                    healthCount: healthRecords.length,
                                    mortalityCount: healthRecords.filter(r => r.record_type === 'mortality').reduce((s, r) => s + (r.affected_count || 1), 0),
                                }
                            }}
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
                    if (matched) handleSelectHousing(matched.id);
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
                    if (matched) handleSelectBatch(matched.id);
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
        </View>
    );
}

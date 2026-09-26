import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { PrintReportButton } from '@/components/PrintReportButton';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import { ReportDocument } from '@/lib/pdfReport';
import { createNotification } from '@/lib/notify';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';

interface HousingInfo {
    id: string;
    name: string;
    animal_type: string;
    status: string;
    current_count: number;
    farm_id?: string;
    farms?: { id?: string; name?: string } | null;
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
    housings?: {
        farm_id?: string;
        farms?: { id?: string; name?: string } | null;
    } | null;
}

interface WeighSession {
    id: string;
    net_weight_grams: number;
    status: 'underweight' | 'normal' | 'overweight';
    animal_type: 'pig' | 'chicken';
    recorded_at: string;
    batch_id: string;
    weighing_session_id?: string | null;
}

interface WeighingSessionEnvelope {
    id: string;
    farm_day: number | null;
    weigh_mode: string;
    expected_quantity: number;
    completed_quantity: number;
    status: string;
    created_at: string;
    completed_at: string | null;
}

interface PointDetail {
    label: string;
    underweight: number;
    normal: number;
    overweight: number;
    total: number;
}

interface ChartTooltipItem {
    label: string;
    count: number;
    color: string;
}

interface ChartTooltipState {
    x: number;
    y: number;
    label: string;
    items: ChartTooltipItem[];
}

function getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatAdg(grams: number | null, unitSuffix: 'd' | 'day' = 'd'): string {
    if (grams === null || grams === undefined) return `0 ${unitSuffix === 'd' ? 'g/d' : 'g/day'}`;
    if (Math.abs(grams) >= 1000) {
        const kg = grams / 1000;
        return `${kg.toFixed(2)} ${unitSuffix === 'd' ? 'kg/d' : 'kg/day'}`;
    }
    return `${Math.round(grams)} ${unitSuffix === 'd' ? 'g/d' : 'g/day'}`;
}

export default function GrowthReportScreen() {
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const { profile } = useAuth();
    const { activeFarmIds, managedFarms, selectedFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const currentFarm = managedFarms.find(f => (selectedFarmIds && selectedFarmIds.length > 0 ? selectedFarmIds.includes(f.id) : activeFarmIds.includes(f.id)))
        || managedFarms.find(f => f.id === farmId);
    const [farmName, setFarmName] = useState<string>(currentFarm?.name || (profile as any)?.farm_name || (profile as any)?.farmName || '');

    useEffect(() => {
        const found = managedFarms.find(f => (selectedFarmIds && selectedFarmIds.length > 0 ? selectedFarmIds.includes(f.id) : activeFarmIds.includes(f.id)))
            || managedFarms.find(f => f.id === farmId);
        if (found?.name) {
            setFarmName(found.name);
        }
    }, [managedFarms, selectedFarmIds, activeFarmIds, farmId]);

    // Route search params — batchId (e.g. linked from a Weighing Session
    // Report) takes priority over the default "first housing, most recent
    // batch" auto-pick below, so arriving from a specific batch's report
    // doesn't force a manual re-pick.
    const { type, batchId: requestedBatchId } = useLocalSearchParams<{ type?: string; batchId?: string }>();
    const initialType = typeof type === 'string'
        ? (type.toLowerCase().includes('chicken') ? 'chicken' : 'pig')
        : 'pig';

    // State Variables
    const [animalType, setAnimalType] = useState<'pig' | 'chicken'>(initialType);
    const [allHousings, setAllHousings] = useState<HousingInfo[]>([]);
    const [selectedHousingId, setSelectedHousingId] = useState<string | null>(null);
    const [allBatches, setAllBatches] = useState<BatchInfo[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [weighSessions, setWeighSessions] = useState<WeighSession[]>([]);
    const [weighingSessionEnvelopes, setWeighingSessionEnvelopes] = useState<WeighingSessionEnvelope[]>([]);
    const [selectedSessionOption, setSelectedSessionOption] = useState<string | null>(null);
    const [sessionModalVisible, setSessionModalVisible] = useState(false);
    const [timeframe, setTimeframe] = useState<'Days' | 'Weeks'>('Days');
    const [selectedTab, setSelectedTab] = useState<'All' | 'Underweight' | 'Normal' | 'Overweight'>('All');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isWeighLoading, setIsWeighLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    // Tooltip state for Growth chart
    const [growthTooltip, setGrowthTooltip] = useState<ChartTooltipState | null>(null);
    // Tooltip state for Comparison chart
    const [compTooltip, setCompTooltip] = useState<ChartTooltipState | null>(null);

    const lastLoadedBatchIdRef = useRef<string | null>(null);
    const animalTypeRef = useRef(animalType);

    useEffect(() => {
        animalTypeRef.current = animalType;
    }, [animalType]);

    // Filtered housings based on selected animal type
    const filteredHousings = allHousings.filter(h => h.animal_type === animalType);
    const selectedHousing = allHousings.find(h => h.id === selectedHousingId) ?? null;

    // Filtered batches based on selected housing
    const filteredBatches = useMemo(() => {
        return allBatches.filter(b => b.housing_id === selectedHousingId);
    }, [allBatches, selectedHousingId]);

    const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) ?? null;

    // ─── Parallel Metadata Fetching ─────────────────────────────────
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
                    .select('id, name, animal_type, status, current_count, farm_id, farms(id, name)')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active')
                    .order('name', { ascending: true }),
                supabase
                    .from('batches')
                    .select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id, housings!inner(farm_id, farms(id, name))')
                    .eq('housings.farm_id', farmId)
                    .eq('status', 'active') // sold/completed batches shouldn't clutter this picker
                    .order('arrival_date', { ascending: false }),
                supabase
                    .from('farms')
                    .select('name')
                    .eq('id', farmId)
                    .maybeSingle()
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

            // An explicitly-requested batch wins outright — resolve its own
            // housing/animal type rather than falling through to the
            // "first housing, most recent batch" default below.
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

                const [weighRes, sessionRes] = await Promise.all([
                    supabase
                        .from('weigh_sessions')
                        .select('id, net_weight_grams, status, animal_type, recorded_at, batch_id, weighing_session_id')
                        .eq('batch_id', requestedBatch.id)
                        .neq('status', 'invalid')
                        .order('recorded_at', { ascending: true }),
                    supabase
                        .from('weighing_sessions')
                        .select('id, farm_day, weigh_mode, expected_quantity, completed_quantity, status, created_at, completed_at')
                        .eq('batch_id', requestedBatch.id)
                        .eq('status', 'completed')
                        .gt('completed_quantity', 0)
                        .order('created_at', { ascending: true }),
                ]);
                if (weighRes.error) throw weighRes.error;
                setWeighSessions((weighRes.data || []) as WeighSession[]);
                setWeighingSessionEnvelopes((sessionRes.data || []) as WeighingSessionEnvelope[]);
                setSelectedSessionOption(null);
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
                    
                    // Fetch initial weigh sessions inside loading state
                    const [weighRes, sessionRes] = await Promise.all([
                        supabase
                            .from('weigh_sessions')
                            .select('id, net_weight_grams, status, animal_type, recorded_at, batch_id, weighing_session_id')
                            .eq('batch_id', targetBatchId)
                            .neq('status', 'invalid')
                            .order('recorded_at', { ascending: true }),
                        supabase
                            .from('weighing_sessions')
                            .select('id, farm_day, weigh_mode, expected_quantity, completed_quantity, status, created_at, completed_at')
                            .eq('batch_id', targetBatchId)
                            .eq('status', 'completed')
                            .gt('completed_quantity', 0)
                            .order('created_at', { ascending: true }),
                    ]);

                    if (weighRes.error) throw weighRes.error;
                    
                    setWeighSessions((weighRes.data || []) as WeighSession[]);
                    setWeighingSessionEnvelopes((sessionRes.data || []) as WeighingSessionEnvelope[]);
                    setSelectedSessionOption(null);
                    lastLoadedBatchIdRef.current = targetBatchId;
                } else {
                    setSelectedBatchId(null);
                    setWeighSessions([]);
                    setWeighingSessionEnvelopes([]);
                    setSelectedSessionOption(null);
                    lastLoadedBatchIdRef.current = null;
                }
            } else {
                setSelectedHousingId(null);
                setSelectedBatchId(null);
                setWeighSessions([]);
                setWeighingSessionEnvelopes([]);
                setSelectedSessionOption(null);
                lastLoadedBatchIdRef.current = null;
            }
        } catch (err) {
            console.error('[GrowthReportScreen] error loading metadata:', err);
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    // ─── Fetch Weigh Sessions ──────────────────────────────────────
    const fetchWeighSessions = useCallback(async (batchId: string) => {
        setIsWeighLoading(true);
        lastLoadedBatchIdRef.current = batchId;
        try {
            const [weighRes, sessionRes] = await Promise.all([
                supabase
                    .from('weigh_sessions')
                    .select('id, net_weight_grams, status, animal_type, recorded_at, batch_id, weighing_session_id')
                    .eq('batch_id', batchId)
                    .neq('status', 'invalid')
                    .order('recorded_at', { ascending: true }),
                supabase
                    .from('weighing_sessions')
                    .select('id, farm_day, weigh_mode, expected_quantity, completed_quantity, status, created_at, completed_at')
                    .eq('batch_id', batchId)
                    .eq('status', 'completed')
                    .gt('completed_quantity', 0)
                    .order('created_at', { ascending: true }),
            ]);

            if (weighRes.error) throw weighRes.error;
            setWeighSessions((weighRes.data || []) as WeighSession[]);
            setWeighingSessionEnvelopes((sessionRes.data || []) as WeighingSessionEnvelope[]);
            setSelectedSessionOption(null);
        } catch (err) {
            console.error('[GrowthReportScreen] error loading weigh sessions:', err);
        } finally {
            setIsWeighLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReportMetadata();
    }, [fetchReportMetadata]);

    // ─── Smooth & Atomic Filter Switching Handlers ─────────────────
    const handleSwitchAnimalType = useCallback((type: 'pig' | 'chicken') => {
        if (type === animalType) return;
        setAnimalType(type);
        setGrowthTooltip(null);
        setCompTooltip(null);
        setSelectedSessionOption(null);

        const targetHousings = allHousings.filter(h => h.animal_type === type);
        if (targetHousings.length > 0) {
            const nextHousingId = targetHousings[0].id;
            setSelectedHousingId(nextHousingId);
            const targetBatches = allBatches.filter(b => b.housing_id === nextHousingId);
            if (targetBatches.length > 0) {
                const nextBatchId = targetBatches[0].id;
                setSelectedBatchId(nextBatchId);
                fetchWeighSessions(nextBatchId);
            } else {
                setSelectedBatchId(null);
                setWeighSessions([]);
                setWeighingSessionEnvelopes([]);
                lastLoadedBatchIdRef.current = null;
            }
        } else {
            setSelectedHousingId(null);
            setSelectedBatchId(null);
            setWeighSessions([]);
            setWeighingSessionEnvelopes([]);
            lastLoadedBatchIdRef.current = null;
        }
    }, [animalType, allHousings, allBatches, fetchWeighSessions]);

    const handleSelectHousing = useCallback((housingId: string) => {
        if (housingId === selectedHousingId) return;
        setSelectedHousingId(housingId);
        setGrowthTooltip(null);
        setCompTooltip(null);
        setSelectedSessionOption(null);
        const targetBatches = allBatches.filter(b => b.housing_id === housingId);
        if (targetBatches.length > 0) {
            const nextBatchId = targetBatches[0].id;
            setSelectedBatchId(nextBatchId);
            fetchWeighSessions(nextBatchId);
        } else {
            setSelectedBatchId(null);
            setWeighSessions([]);
            setWeighingSessionEnvelopes([]);
            lastLoadedBatchIdRef.current = null;
        }
    }, [selectedHousingId, allBatches, fetchWeighSessions]);

    const handleSelectBatch = useCallback((batchId: string) => {
        if (batchId === selectedBatchId) return;
        setSelectedBatchId(batchId);
        setGrowthTooltip(null);
        setCompTooltip(null);
        setSelectedSessionOption(null);
        fetchWeighSessions(batchId);
    }, [selectedBatchId, fetchWeighSessions]);

    // Auto-resolve housing selection when animal type or housings load initially
    useEffect(() => {
        if (filteredHousings.length > 0) {
            const exists = filteredHousings.some(h => h.id === selectedHousingId);
            if (!exists) {
                setSelectedHousingId(filteredHousings[0].id);
            }
        } else if (allHousings.length > 0 && selectedHousingId) {
            const stillValid = allHousings.some(h => h.id === selectedHousingId && h.animal_type === animalType);
            if (!stillValid) setSelectedHousingId(null);
        }
    }, [animalType, allHousings, selectedHousingId, filteredHousings]);

    // Auto-resolve batch selection when housing selection or batches change
    useEffect(() => {
        if (filteredBatches.length > 0) {
            const exists = filteredBatches.some(b => b.id === selectedBatchId);
            if (!exists) {
                setSelectedBatchId(filteredBatches[0].id);
            }
        } else if (allBatches.length > 0 && selectedBatchId) {
            const stillValid = allBatches.some(b => b.id === selectedBatchId && b.housing_id === selectedHousingId);
            if (!stillValid) setSelectedBatchId(null);
        }
    }, [filteredBatches, selectedBatchId, allBatches, selectedHousingId]);

    // Load weigh sessions when selected batch changes
    useEffect(() => {
        if (selectedBatchId) {
            setSelectedSessionOption(null);
            if (lastLoadedBatchIdRef.current !== selectedBatchId) {
                fetchWeighSessions(selectedBatchId);
            }
        } else {
            setWeighSessions([]);
            setWeighingSessionEnvelopes([]);
            setSelectedSessionOption(null);
            lastLoadedBatchIdRef.current = null;
        }
    }, [selectedBatchId, fetchWeighSessions]);

    // ─── Realtime: Live update growth data when new weigh readings land ───
    useEffect(() => {
        if (!selectedBatchId) return;

        const channel = supabase
            .channel(`realtime-growth-report-${selectedBatchId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'weigh_sessions',
                    filter: `batch_id=eq.${selectedBatchId}`,
                },
                () => {
                    fetchWeighSessions(selectedBatchId);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'weighing_sessions',
                    filter: `batch_id=eq.${selectedBatchId}`,
                },
                () => {
                    fetchWeighSessions(selectedBatchId);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedBatchId, fetchWeighSessions]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchReportMetadata();
        if (selectedBatchId) {
            await fetchWeighSessions(selectedBatchId);
        }
        setRefreshing(false);
    }, [fetchReportMetadata, selectedBatchId, fetchWeighSessions]);

    // ─── Stats Computations ────────────────────────────────────────
    const underweightCount = useMemo(() => weighSessions.filter(s => s.status === 'underweight').length, [weighSessions]);
    const normalCount = useMemo(() => weighSessions.filter(s => s.status === 'normal').length, [weighSessions]);
    const overweightCount = useMemo(() => weighSessions.filter(s => s.status === 'overweight').length, [weighSessions]);
    const totalWeighs = useMemo(() => weighSessions.length, [weighSessions]);

    const currentDay = useMemo(() => {
        if (!selectedBatch?.arrival_date) return null;
        const arrivalDate = new Date(selectedBatch.arrival_date);
        const today = new Date();
        arrivalDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - arrivalDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays) + (selectedBatch.age_at_arrival_days || 0);
    }, [selectedBatch]);

    // ─── PDF Report Builder ──────────────────────────────────────────
    // Constructs a formal, print-friendly Word-style growth audit document
    // with comprehensive biometric analysis, distribution matrix, progression ledger,
    // operational recommendations, and official sign-off blocks.
    const buildGrowthReport = useCallback((): ReportDocument | null => {
        if (!selectedBatch || weighSessions.length === 0) return null;

        // Group weights by calendar date
        const dateMap = new Map<string, { underweight: number; normal: number; overweight: number; weights: number[] }>();
        weighSessions.forEach(s => {
            const key = s.recorded_at.slice(0, 10);
            if (!dateMap.has(key)) dateMap.set(key, { underweight: 0, normal: 0, overweight: 0, weights: [] });
            const entry = dateMap.get(key)!;
            if (s.status === 'underweight') entry.underweight += 1;
            else if (s.status === 'overweight') entry.overweight += 1;
            else entry.normal += 1;
            entry.weights.push(s.net_weight_grams);
        });

        const sortedDates = Array.from(dateMap.keys()).sort();

        // Calculate chronological progression with inter-session gains
        let prevAvgKg = 0;
        const chronologicalRows = sortedDates.map((d, idx) => {
            const entry = dateMap.get(d)!;
            const avgKg = entry.weights.reduce((a, b) => a + b, 0) / entry.weights.length / 1000;
            const minKg = (Math.min(...entry.weights) / 1000).toFixed(2);
            const maxKg = (Math.max(...entry.weights) / 1000).toFixed(2);

            let gainStr = '— (Baseline)';
            if (idx > 0 && prevAvgKg > 0) {
                const gain = avgKg - prevAvgKg;
                gainStr = (gain >= 0 ? '+' : '') + gain.toFixed(2) + ' kg';
            }
            prevAvgKg = avgKg;

            let dateLabel = d;
            try {
                dateLabel = new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch { /* keep raw */ }

            return [
                dateLabel,
                entry.weights.length,
                `${avgKg.toFixed(2)} kg`,
                `${minKg} - ${maxKg} kg`,
                gainStr,
                entry.underweight,
                entry.normal,
                entry.overweight,
            ];
        });

        // Overall Statistical Computations
        const weightsInKg = weighSessions.map(s => s.net_weight_grams / 1000);
        const meanWeightKg = weightsInKg.reduce((a, b) => a + b, 0) / weightsInKg.length;
        const minWeightKg = Math.min(...weightsInKg).toFixed(2);
        const maxWeightKg = Math.max(...weightsInKg).toFixed(2);

        // Uniformity Calculation: % of sampled herd within ±10% of mean weight
        const lowerBound = meanWeightKg * 0.90;
        const upperBound = meanWeightKg * 1.10;
        const uniformAnimalsCount = weightsInKg.filter(w => w >= lowerBound && w <= upperBound).length;
        const uniformityPct = ((uniformAnimalsCount / weightsInKg.length) * 100).toFixed(1);

        // Percentage distributions
        const underPct = totalWeighs > 0 ? ((underweightCount / totalWeighs) * 100).toFixed(1) : '0.0';
        const normalPct = totalWeighs > 0 ? ((normalCount / totalWeighs) * 100).toFixed(1) : '0.0';
        const overPct = totalWeighs > 0 ? ((overweightCount / totalWeighs) * 100).toFixed(1) : '0.0';

        // Average Daily Gain (ADG) over monitored timeframe
        let adgFormatted = 'Baseline Established';
        if (sortedDates.length >= 2) {
            const firstDateStr = sortedDates[0];
            const lastDateStr = sortedDates[sortedDates.length - 1];
            const firstEntry = dateMap.get(firstDateStr)!;
            const lastEntry = dateMap.get(lastDateStr)!;
            const firstAvg = firstEntry.weights.reduce((a, b) => a + b, 0) / firstEntry.weights.length / 1000;
            const lastAvg = lastEntry.weights.reduce((a, b) => a + b, 0) / lastEntry.weights.length / 1000;
            const daysElapsed = Math.max(1, Math.round((new Date(lastDateStr).getTime() - new Date(firstDateStr).getTime()) / (1000 * 60 * 60 * 24)));
            const adgKg = (lastAvg - firstAvg) / daysElapsed;
            const adgGrams = adgKg * 1000;
            adgFormatted = `${formatAdg(adgGrams, 'day')} (${daysElapsed} days)`;
        }

        const arrivalLabel = selectedBatch.arrival_date
            ? new Date(selectedBatch.arrival_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : '—';

        const officerName = (profile as any)?.first_name
            ? `${(profile as any).first_name} ${(profile as any).last_name ?? ''}`.trim()
            : (profile as any)?.displayName || 'Operations Officer';

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

        const batchRefName = selectedBatch.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const documentReference = `ANIGROW-GRW-${batchRefName}-${dateStamp}`;

        const summaryText = `This official livestock growth and biometric performance report documents the weighing records and weight progression for Batch "${selectedBatch.name}" (${animalType === 'pig' ? 'Swine Herd' : 'Poultry Flock'}), situated at ${selectedHousing?.name ?? 'Assigned Facility'} in ${selectedFarmDisplayName}. Current rearing age is Day ${currentDay !== null ? currentDay : 'N/A'}, with an active cohort population of ${selectedBatch.current_count} head. Across all recorded telemetry sessions, a cumulative sample of ${totalWeighs} weigh events has been logged, establishing a mean cohort live weight of ${meanWeightKg.toFixed(2)} kg. Biometric categorization demonstrates that ${normalPct}% (${normalCount} head) conform to optimal growth target standards, ${underPct}% (${underweightCount} head) are classified as underweight, and ${overPct}% (${overweightCount} head) fall into the overweight/advanced category. Overall herd uniformity is indexed at ${uniformityPct}%.`;

        return {
            reportTitle: 'LIVESTOCK GROWTH PERFORMANCE & BIOMETRIC AUDIT REPORT',
            farmName: selectedFarmDisplayName,
            subtitle: `Official Biometric Cohort Evaluation · Batch "${selectedBatch.name}" · ${selectedHousing?.name ?? 'Assigned Housing'} · ${animalType === 'pig' ? 'Swine Production' : 'Poultry Production'}`,
            documentRef: documentReference,
            summaryText,
            meta: [
                { label: 'Farm / Facility', value: selectedFarmDisplayName },
                { label: 'Batch Identifier', value: selectedBatch.name },
                { label: 'Housing Facility / Pen', value: selectedHousing?.name ?? 'General Housing' },
                { label: 'Livestock Classification', value: animalType === 'pig' ? 'Swine (Grower / Finisher)' : 'Poultry (Broiler)' },
                { label: 'Placement Date', value: arrivalLabel },
                { label: 'Placement Age', value: `${selectedBatch.age_at_arrival_days || 0} days` },
                { label: 'Current Cohort Age', value: currentDay !== null ? `Day ${currentDay}` : '—' },
                { label: 'Stocking Count', value: `${selectedBatch.estimated_count ?? selectedBatch.current_count} head` },
                { label: 'Current Live Population', value: `${selectedBatch.current_count} head` },
                { label: 'Cumulative Weigh Events', value: `${totalWeighs} recorded measurements` },
                { label: 'Audit Period', value: sortedDates.length > 0 ? `${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}` : 'Single Session' },
                { label: 'Batch Status', value: (selectedBatch.status || 'Active').toUpperCase() },
            ],
            sections: [
                {
                    heading: 'Statistical Key Performance Indicators',
                    stats: [
                        { label: 'Mean Live Weight', value: `${meanWeightKg.toFixed(2)} kg`, accent: 'good' },
                        { label: 'Weight Range (Min - Max)', value: `${minWeightKg} - ${maxWeightKg} kg` },
                        { label: 'Flock Uniformity (±10%)', value: `${uniformityPct}%`, accent: Number(uniformityPct) >= 75 ? 'good' : 'warn' },
                        { label: 'Average Daily Gain (ADG)', value: adgFormatted },
                        { label: 'Target Adherence (Normal)', value: `${normalPct}% (${normalCount} head)`, accent: 'good' },
                        { label: 'Underweight Frequency', value: `${underPct}% (${underweightCount} head)`, accent: Number(underPct) > 15 ? 'warn' : undefined },
                    ],
                },
                {
                    heading: 'Biometric Classification & Cohort Uniformity Matrix',
                    table: {
                        heading: 'Cohort Weight Classification Matrix',
                        headers: ['Classification', 'Head Sampled', 'Proportion (%)', 'Clinical Benchmark Criteria', 'Management Status & Evaluation'],
                        rows: [
                            [
                                'Underweight',
                                underweightCount,
                                `${underPct}%`,
                                '< Lower Specification Limit (-10%)',
                                Number(underPct) > 15
                                    ? 'High runt frequency: Supplemental feeding & pen sorting recommended.'
                                    : 'Acceptable: Minor runts within allowable variance.'
                            ],
                            [
                                'Normal (Target Weight)',
                                normalCount,
                                `${normalPct}%`,
                                'Optimal Genetic Growth Benchmark (±10%)',
                                'Satisfactory: Conforms strictly to expected commercial growth trajectory.'
                            ],
                            [
                                'Overweight / Advanced',
                                overweightCount,
                                `${overPct}%`,
                                '> Upper Specification Limit (+10%)',
                                Number(overPct) > 15
                                    ? 'Notice: Fast-finishing cohort. Monitor energy-to-protein ratio.'
                                    : 'Acceptable: Advanced cohort performing within expected limits.'
                            ],
                            [
                                'Consolidated Sample Size',
                                totalWeighs,
                                '100.0%',
                                'Aggregate Monitored Batch Sample',
                                `Cohort Uniformity Index: ${uniformityPct}% (${Number(uniformityPct) >= 75 ? 'Optimal' : 'Needs Optimization'})`
                            ]
                        ],
                        columnAlignments: ['left', 'center', 'center', 'left', 'left'],
                        note: 'Evaluated in accordance with standard livestock breed weight-for-age production curves.',
                    },
                },
                {
                    heading: 'Chronological Weigh-In Progression Ledger',
                    table: {
                        heading: 'Day-by-Day Telemetry Log',
                        headers: ['Calendar Date', 'Head Weighed', 'Average Weight', 'Min - Max Range', 'Session Gain', 'Under', 'Normal', 'Over'],
                        rows: chronologicalRows,
                        columnAlignments: ['left', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
                        note: 'Weights captured via calibrated smart telemetry scale. Session Gain indicates variance relative to preceding session.',
                    },
                },
                {
                    heading: 'Operational Insights & Nutritional Recommendations',
                    paragraphs: [
                        `Based on biometric evaluation of ${totalWeighs} recorded weighings for Batch "${selectedBatch.name}", the cohort demonstrates an overall health profile with a ${normalPct}% target weight conformity. The following clinical and management actions are recommended for implementation by the farm operational team:`
                    ],
                    bullets: [
                        Number(underPct) > 15
                            ? `Nutritional Segregation: With underweight incidence elevated at ${underPct}%, establish a dedicated recovery pen with high-density starter/grower ration to reduce feeder competition.`
                            : `Feeder Flow Calibration: Maintain standard phase feeding schedule; verify automated feeder dispensing flow rates and clean water nipple pressure daily.`,
                        Number(overPct) > 15
                            ? `Finisher Ration Management: High overweight incidence (${overPct}%) indicates rapid fat deposition; evaluate dietary crude protein and fiber ratios before harvest.`
                            : `Microclimate Optimization: Ensure ambient pen temperature and mechanical ventilation conform to target thermal comfort zones to sustain optimal Feed Conversion Ratio (FCR).`,
                        `Biometric Telemetry Compliance: Continue regular weight sampling schedules at 7-day intervals to verify continued progression along the target growth curve.`,
                        `Health & Biosecurity Cross-Reference: Correlate weight progression with the health ledger to ensure all mandatory deworming, vaccination, and vitamin regimens are up to date.`,
                    ],
                },
            ],
            signatures: [
                {
                    title: 'Prepared By (Farm Operations):',
                    name: officerName,
                    role: 'Production Lead & Scale Telemetry Officer',
                    date: `Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
                },
                {
                    title: 'Reviewed & Certified By:',
                    name: '___________________________',
                    role: 'Farm Manager / Supervising Veterinarian',
                    date: 'Date: ________________________',
                },
            ],
            generatedByName: officerName,
        };
    }, [selectedBatch, selectedHousing, weighSessions, animalType, currentDay, farmName, managedFarms, selectedFarmIds, activeFarmIds, farmId, totalWeighs, underweightCount, normalCount, overweightCount, profile]);

    const tabs = ['All', 'Underweight', 'Normal', 'Overweight'] as const;

    const getCategoryCount = (category: typeof tabs[number]) => {
        if (category === 'Underweight') return underweightCount;
        if (category === 'Normal') return normalCount;
        if (category === 'Overweight') return overweightCount;
        return totalWeighs;
    };

    // Red for overweight everywhere
    const OVERWEIGHT_COLOR = '#EF4444';

    const getTabColor = (category: typeof tabs[number]) => {
        if (category === 'Underweight') return colors.secondary;
        if (category === 'Overweight') return OVERWEIGHT_COLOR;
        return colors.primary;
    };

    const activeColor = getTabColor(selectedTab);

    const sessionItems = useMemo(() => {
        if (weighSessions.length === 0) return [];

        const completedEnvelopes = weighingSessionEnvelopes.filter(env => env.status === 'completed');
        if (completedEnvelopes.length > 0) {
            return completedEnvelopes.map((env, idx) => {
                const num = idx + 1;
                const ordinal = getOrdinal(num);
                let dateLabel = env.created_at ? env.created_at.slice(0, 10) : '';
                try {
                    const d = new Date(env.created_at);
                    if (!isNaN(d.getTime())) {
                        dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                } catch (_) {}

                const isLatest = idx === completedEnvelopes.length - 1;
                const dayPart = env.farm_day !== null ? ` (Day ${env.farm_day})` : '';
                const latestPart = isLatest ? ' · Latest' : '';
                const label = `${ordinal} Session · ${dateLabel}${dayPart}${latestPart}`;

                return {
                    id: env.id,
                    ordinal,
                    index: num,
                    dateLabel,
                    farmDay: env.farm_day,
                    label,
                    isLatest,
                    sessionIds: [env.id],
                    dateKeys: [env.created_at ? env.created_at.slice(0, 10) : ''],
                };
            });
        }

        const dateMap = new Map<string, typeof weighSessions>();
        weighSessions.forEach(s => {
            if (!s.recorded_at) return;
            const dateKey = s.recorded_at.slice(0, 10);
            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, []);
            }
            dateMap.get(dateKey)!.push(s);
        });

        const sortedDates = Array.from(dateMap.keys()).sort();
        return sortedDates.map((dateKey, idx) => {
            const num = idx + 1;
            const ordinal = getOrdinal(num);
            let dateLabel = dateKey;
            try {
                const d = new Date(dateKey);
                if (!isNaN(d.getTime())) {
                    dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }
            } catch (_) {}

            let farmDay: number | null = null;
            if (selectedBatch?.arrival_date) {
                try {
                    const arr = new Date(selectedBatch.arrival_date);
                    const cur = new Date(dateKey);
                    arr.setHours(0, 0, 0, 0);
                    cur.setHours(0, 0, 0, 0);
                    const diffDays = Math.floor((cur.getTime() - arr.getTime()) / 86400000);
                    farmDay = Math.max(0, diffDays) + (selectedBatch.age_at_arrival_days || 0);
                } catch (_) {}
            }

            const isLatest = idx === sortedDates.length - 1;
            const dayPart = farmDay !== null ? ` (Day ${farmDay})` : '';
            const latestPart = isLatest ? ' · Latest' : '';
            const label = `${ordinal} Session · ${dateLabel}${dayPart}${latestPart}`;

            return {
                id: dateKey,
                ordinal,
                index: num,
                dateLabel,
                farmDay,
                label,
                isLatest,
                sessionIds: [] as string[],
                dateKeys: [dateKey],
            };
        });
    }, [weighSessions, weighingSessionEnvelopes, selectedBatch]);

    const sessionOptions = useMemo(() => {
        if (sessionItems.length === 0) return [];
        return ['All Sessions', ...sessionItems.map(s => s.label)];
    }, [sessionItems]);

    // Default to the latest session (the last recorded session in chronological order)
    const latestSession = useMemo(() => {
        return sessionItems.length > 0 ? sessionItems[sessionItems.length - 1] : null;
    }, [sessionItems]);

    const activeSessionOption = useMemo(() => {
        if (selectedSessionOption && sessionOptions.includes(selectedSessionOption)) {
            return selectedSessionOption;
        }
        return latestSession ? latestSession.label : 'All Sessions';
    }, [selectedSessionOption, sessionOptions, latestSession]);

    const summaryInfo = useMemo(() => {
        if (weighSessions.length === 0) return null;

        let targetSessions: WeighSession[] = weighSessions;
        let title = 'All Sessions Summary';
        let subtitle = `Across ${sessionItems.length} recorded session${sessionItems.length === 1 ? '' : 's'}`;

        if (activeSessionOption !== 'All Sessions') {
            const matched = sessionItems.find(s => s.label === activeSessionOption);
            if (matched) {
                targetSessions = weighSessions.filter(s => {
                    if (s.weighing_session_id && matched.sessionIds?.includes(s.weighing_session_id)) {
                        return true;
                    }
                    const dk = s.recorded_at ? s.recorded_at.slice(0, 10) : '';
                    return matched.dateKeys?.includes(dk);
                });
                title = `${matched.ordinal} Session Summary${matched.isLatest ? ' (Latest)' : ''}`;
                subtitle = `Recorded on ${matched.dateLabel}${matched.farmDay !== null ? ` (Day ${matched.farmDay})` : ''}`;
            }
        }

        const totalWeightGrams = targetSessions.reduce((sum, s) => sum + (s.net_weight_grams || 0), 0);
        const avgWeightKg = targetSessions.length > 0 ? (totalWeightGrams / targetSessions.length) / 1000 : 0;
        const normalCount = targetSessions.filter(s => s.status === 'normal').length;
        const underweightCount = targetSessions.filter(s => s.status === 'underweight').length;
        const overweightCount = targetSessions.filter(s => s.status === 'overweight').length;

        return {
            title,
            subtitle,
            avgWeightKg,
            normalCount,
            underweightCount,
            overweightCount,
            totalCount: targetSessions.length,
        };
    }, [weighSessions, sessionItems, activeSessionOption]);

    // ─── Detailed Stats Per Session ──────────────────────────────────
    const sessionStatsList = useMemo(() => {
        if (sessionItems.length === 0 || weighSessions.length === 0) return [];

        return sessionItems.map(item => {
            const matchingSessions = weighSessions.filter(s => {
                if (s.weighing_session_id && item.sessionIds?.includes(s.weighing_session_id)) {
                    return true;
                }
                const dk = s.recorded_at ? s.recorded_at.slice(0, 10) : '';
                return item.dateKeys?.includes(dk);
            });

            const totalCount = matchingSessions.length;
            const totalWeightGrams = matchingSessions.reduce((sum, s) => sum + (s.net_weight_grams || 0), 0);
            const avgWeightKg = totalCount > 0 ? (totalWeightGrams / totalCount) / 1000 : 0;
            const normalCount = matchingSessions.filter(s => s.status === 'normal').length;
            const underweightCount = matchingSessions.filter(s => s.status === 'underweight').length;
            const overweightCount = matchingSessions.filter(s => s.status === 'overweight').length;
            const normalPct = totalCount > 0 ? Math.round((normalCount / totalCount) * 100) : 0;
            const underweightPct = totalCount > 0 ? Math.round((underweightCount / totalCount) * 100) : 0;
            const overweightPct = totalCount > 0 ? Math.max(0, 100 - normalPct - underweightPct) : 0;

            return {
                ...item,
                totalCount,
                avgWeightKg,
                normalCount,
                underweightCount,
                overweightCount,
                normalPct,
                underweightPct,
                overweightPct,
            };
        });
    }, [sessionItems, weighSessions]);

    // ─── Current Growth Descriptive Explanation ──────────────────────
    const growthExplanation = useMemo(() => {
        if (weighSessions.length === 0 || sessionStatsList.length === 0) {
            return null;
        }

        const first = sessionStatsList[0];
        const latest = sessionStatsList[sessionStatsList.length - 1];
        const prev = sessionStatsList.length > 1 ? sessionStatsList[sessionStatsList.length - 2] : null;

        const totalGainKg = Math.max(0, latest.avgWeightKg - first.avgWeightKg);
        const recentGainKg = prev ? latest.avgWeightKg - prev.avgWeightKg : 0;

        // Days elapsed
        let totalDays = 1;
        if (first.farmDay !== null && latest.farmDay !== null && latest.farmDay > first.farmDay) {
            totalDays = latest.farmDay - first.farmDay;
        } else {
            try {
                const d1 = new Date(first.dateKeys[0]);
                const d2 = new Date(latest.dateKeys[0]);
                const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
                if (diff > 0) totalDays = diff;
            } catch (_) {}
        }

        let recentDays = 1;
        if (prev) {
            if (prev.farmDay !== null && latest.farmDay !== null && latest.farmDay > prev.farmDay) {
                recentDays = latest.farmDay - prev.farmDay;
            } else {
                try {
                    const d1 = new Date(prev.dateKeys[0]);
                    const d2 = new Date(latest.dateKeys[0]);
                    const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
                    if (diff > 0) recentDays = diff;
                } catch (_) {}
            }
        }

        const overallAdgGrams = totalDays > 0 ? Math.round((totalGainKg * 1000) / totalDays) : 0;
        const recentAdgGrams = prev && recentDays > 0 ? Math.round((recentGainKg * 1000) / recentDays) : null;

        // Growth velocity status
        let velocityStatus = 'Healthy Growth';
        let velocityColor = colors.primary;
        if (recentAdgGrams !== null && overallAdgGrams > 0) {
            if (recentAdgGrams >= overallAdgGrams * 1.1) {
                velocityStatus = 'Accelerating Gain';
                velocityColor = colors.primary;
            } else if (recentAdgGrams <= overallAdgGrams * 0.7) {
                velocityStatus = 'Growth Slowing';
                velocityColor = colors.warning;
            } else {
                velocityStatus = 'Steady On Track';
                velocityColor = colors.primary;
            }
        }

        // Tab context narrative
        const cohortType = animalType === 'pig' ? 'herd' : 'flock';
        const animalLabel = animalType === 'pig' ? 'pig' : 'bird';
        let tabContextText = '';
        if (selectedTab === 'Normal') {
            tabContextText = `${latest.normalCount} of ${latest.totalCount} animals (${latest.normalPct}%) are on target, demonstrating healthy skeletal and muscle development.`;
        } else if (selectedTab === 'Underweight') {
            if (latest.underweightCount === 0) {
                tabContextText = `No animals are classified as underweight in the latest session. ${animalType === 'pig' ? 'Herd' : 'Flock'} vigor is optimal.`;
            } else {
                tabContextText = `${latest.underweightCount} animal${latest.underweightCount === 1 ? ' is' : 's are'} (${latest.underweightPct}%) tracking below target weight. Ensure unhindered feeder access and check for bullying.`;
            }
        } else if (selectedTab === 'Overweight') {
            if (latest.overweightCount === 0) {
                tabContextText = 'No animals exceed the standard threshold in the latest session. Growth is properly balanced.';
            } else {
                tabContextText = `${latest.overweightCount} animal${latest.overweightCount === 1 ? ' is' : 's are'} (${latest.overweightPct}%) exceeding the upper threshold, showing strong appetite and rapid flesh development.`;
            }
        } else {
            tabContextText = `Average ${animalLabel} weight increased from ${first.avgWeightKg.toFixed(2)} kg (initial) to ${latest.avgWeightKg.toFixed(2)} kg (latest) across ${sessionStatsList.length} recorded session${sessionStatsList.length === 1 ? '' : 's'}.`;
        }

        let narrative = '';
        const recentGainGrams = Math.round(recentGainKg * 1000);
        const recentGainDisplay = Math.abs(recentGainGrams) >= 1000
            ? `+${recentGainKg.toFixed(2)} kg`
            : `+${recentGainKg.toFixed(2)} kg (+${recentGainGrams} g)`;

        if (sessionStatsList.length === 1) {
            narrative = `Initial baseline recorded at ${first.avgWeightKg.toFixed(2)} kg across ${first.totalCount} weigh logs on ${first.dateLabel}. Average Daily Gain (ADG) and trajectory rates will calculate automatically once a subsequent session is logged.`;
        } else if (prev) {
            const formattedRecentAdg = formatAdg(recentAdgGrams, 'day');
            const formattedOverallAdg = formatAdg(overallAdgGrams, 'day');
            narrative = `Between ${prev.dateLabel} and ${latest.dateLabel} (${recentDays} days), the ${cohortType} gained an average of ${recentGainDisplay}, equating to an Average Daily Gain (ADG) of ${formattedRecentAdg}. Lifetime ${cohortType} ADG is ${formattedOverallAdg} over ${totalDays} total days.`;
        }

        return {
            firstSession: first,
            latestSession: latest,
            prevSession: prev,
            totalGainKg,
            recentGainKg,
            totalDays,
            recentDays,
            overallAdgGrams,
            recentAdgGrams,
            velocityStatus,
            velocityColor,
            narrative,
            tabContextText,
        };
    }, [weighSessions, sessionStatsList, selectedTab, colors]);

    // ─── Status Comparison Descriptive & Delta Analysis ──────────────
    const statusExplanation = useMemo(() => {
        if (sessionStatsList.length === 0) return null;

        const latest = sessionStatsList[sessionStatsList.length - 1];
        const prev = sessionStatsList.length > 1 ? sessionStatsList[sessionStatsList.length - 2] : null;

        // Uniformity is the percentage of birds in the 'Normal' bracket
        const uniformityPct = latest.normalPct;
        let uniformityRating = 'Excellent';
        let uniformityBadgeColor = colors.primary;
        let uniformityBadgeBg = colors.primary + '15';

        if (uniformityPct >= 85) {
            uniformityRating = 'Excellent Uniformity';
            uniformityBadgeColor = colors.primary;
            uniformityBadgeBg = colors.primary + '15';
        } else if (uniformityPct >= 75) {
            uniformityRating = 'Good Uniformity';
            uniformityBadgeColor = colors.primary;
            uniformityBadgeBg = colors.primary + '15';
        } else if (uniformityPct >= 65) {
            uniformityRating = 'Moderate Uniformity';
            uniformityBadgeColor = colors.warning;
            uniformityBadgeBg = colors.warning + '15';
        } else {
            uniformityRating = 'Low Uniformity';
            uniformityBadgeColor = colors.error;
            uniformityBadgeBg = colors.error + '15';
        }

        // Comparison deltas against previous session
        let normalDiffPct = 0;
        let underDiffPct = 0;
        let overDiffPct = 0;
        let underCountDiff = 0;
        let normalCountDiff = 0;
        let overCountDiff = 0;

        if (prev) {
            normalDiffPct = latest.normalPct - prev.normalPct;
            underDiffPct = latest.underweightPct - prev.underweightPct;
            overDiffPct = latest.overweightPct - prev.overweightPct;
            underCountDiff = latest.underweightCount - prev.underweightCount;
            normalCountDiff = latest.normalCount - prev.normalCount;
            overCountDiff = latest.overweightCount - prev.overweightCount;
        }

        // Plain English explanations
        let uniformityDescription = '';
        if (uniformityPct >= 80) {
            uniformityDescription = `High uniformity (${uniformityPct}%) confirms that the vast majority of animals are growing evenly within the ideal weight band. This indicates equal feeder and drinker access throughout the housing.`;
        } else if (uniformityPct >= 70) {
            uniformityDescription = `Moderate uniformity (${uniformityPct}%). Some size disparity is developing. Ensure all birds have equal, uncrowded access to feed pans and water lines.`;
        } else {
            uniformityDescription = `Low flock uniformity (${uniformityPct}%). Noticeable size dispersion detected. Consider grading and segregating smaller animals into a separate pen.`;
        }

        let underweightDescription = '';
        if (latest.underweightCount === 0) {
            underweightDescription = 'Zero underweight animals detected in the latest session.';
        } else if (prev && underCountDiff < 0) {
            underweightDescription = `Underweight proportion improved: decreased by ${Math.abs(underDiffPct)}% (${Math.abs(underCountDiff)} bird${Math.abs(underCountDiff) === 1 ? '' : 's'} caught up), now at ${latest.underweightPct}% (${latest.underweightCount} birds).`;
        } else if (prev && underCountDiff > 0) {
            underweightDescription = `Underweight proportion increased by +${underDiffPct}% (+${underCountDiff} bird${underCountDiff === 1 ? '' : 's'}), now at ${latest.underweightPct}% (${latest.underweightCount} birds). Inspect for feed competition or cooler pen zones.`;
        } else {
            underweightDescription = `Underweight rate is at ${latest.underweightPct}% (${latest.underweightCount} of ${latest.totalCount} birds), which is ${latest.underweightPct <= 10 ? 'within standard industry tolerance (<10%)' : 'elevated above the ideal 10% target'}.`;
        }

        let overweightDescription = '';
        if (latest.overweightCount === 0) {
            overweightDescription = 'No animals are classified as overweight. Energy density in feed is well-balanced.';
        } else {
            overweightDescription = `Overweight rate is at ${latest.overweightPct}% (${latest.overweightCount} of ${latest.totalCount} birds). These animals are converting feed rapidly without causing flock imbalance.`;
        }

        let recommendation = '';
        if (latest.underweightPct > 15) {
            recommendation = 'Recommendation: Lower drinker and feeder lines slightly and check ventilation to prevent crowding at warm spots.';
        } else if (uniformityPct >= 80) {
            recommendation = 'Recommendation: Maintain existing feeding frequency and micro-climate settings to sustain excellent flock uniformity through harvest.';
        } else {
            recommendation = 'Recommendation: Monitor weight spread in the next session to ensure smaller animals continue closing the gap.';
        }

        return {
            latest,
            prev,
            uniformityPct,
            uniformityRating,
            uniformityBadgeColor,
            uniformityBadgeBg,
            normalDiffPct,
            underDiffPct,
            overDiffPct,
            underCountDiff,
            normalCountDiff,
            overCountDiff,
            uniformityDescription,
            underweightDescription,
            overweightDescription,
            recommendation,
        };
    }, [sessionStatsList, colors]);

    // ─── Line Chart Data Processing ─────────────────────────────────
    const lineChartData = useMemo(() => {
        // No sessions → blank state
        if (weighSessions.length === 0) {
            return { labels: [] as string[], datasets: [{ data: [0] }], hasRealData: false, noData: true, details: [] as PointDetail[] };
        }

        if (timeframe === 'Days') {
            const dateMap = new Map<string, { underweight: number; normal: number; overweight: number; total: number }>();
            weighSessions.forEach(s => {
                const dateKey = s.recorded_at.slice(0, 10);
                if (!dateMap.has(dateKey)) {
                    dateMap.set(dateKey, { underweight: 0, normal: 0, overweight: 0, total: 0 });
                }
                const counts = dateMap.get(dateKey)!;
                counts.total += 1;
                if (s.status === 'underweight') counts.underweight += 1;
                else if (s.status === 'overweight') counts.overweight += 1;
                else counts.normal += 1;
            });

            const sortedDates = Array.from(dateMap.keys()).sort();

            // ── Single recording date: pad with Arrival anchor ──
            if (sortedDates.length === 1) {
                const todayDateKey = sortedDates[0];
                const parts = todayDateKey.split('-');
                const todayLabel = parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : todayDateKey;
                const labels = ['Arrival', todayLabel];
                const dayCounts = dateMap.get(todayDateKey)!;

                const arrivalVal = 0;

                const normalFinal  = [arrivalVal, dayCounts.normal];
                const underFinal   = [arrivalVal, dayCounts.underweight];
                const overFinal    = [arrivalVal, dayCounts.overweight];
                const zeroAnchor2  = { data: [0, 0], color: () => 'transparent', strokeWidth: 0, withDots: false };

                const details: PointDetail[] = [
                    { label: 'Arrival', underweight: 0, normal: 0, overweight: 0, total: 0 },
                    { label: todayLabel, ...dayCounts },
                ];

                // Check if selected filter has any data
                const hasFilterData = selectedTab === 'All'
                    ? dayCounts.total > 0
                    : selectedTab === 'Underweight' ? dayCounts.underweight > 0
                    : selectedTab === 'Normal'       ? dayCounts.normal > 0
                    : dayCounts.overweight > 0;

                if (!hasFilterData && selectedTab !== 'All') {
                    return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true, details: [] as PointDetail[] };
                }

                if (selectedTab === 'All') {
                    return {
                        labels,
                        datasets: [
                            { data: normalFinal,  color: () => colors.primary,    strokeWidth: 3, key: 'Normal', label: 'Normal' },
                            { data: underFinal,   color: () => colors.secondary,  strokeWidth: 3, key: 'Underweight', label: 'Underweight' },
                            { data: overFinal,    color: () => OVERWEIGHT_COLOR,  strokeWidth: 3, key: 'Overweight', label: 'Overweight' },
                            zeroAnchor2,
                        ],
                        hasRealData: true, noData: false, details
                    };
                }

                let currentData = normalFinal;
                if (selectedTab === 'Underweight') currentData = underFinal;
                else if (selectedTab === 'Overweight') currentData = overFinal;

                return {
                    labels,
                    datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3, key: selectedTab, label: selectedTab }, zeroAnchor2],
                    hasRealData: true, noData: false, details
                };
            }

            // ── Multiple recording dates ──
            const datesToUse = sortedDates.slice(-30);
            const labels = ['Arrival', ...datesToUse.map(d => {
                const parts = d.split('-');
                return parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
            })];

            // Compute counts
            const normalCounts  = datesToUse.map(d => dateMap.get(d)!.normal);
            const underCounts   = datesToUse.map(d => dateMap.get(d)!.underweight);
            const overCounts    = datesToUse.map(d => dateMap.get(d)!.overweight);

            const normalFinal = [0, ...normalCounts];
            const underFinal  = [0, ...underCounts];
            const overFinal   = [0, ...overCounts];

            const zeroAnchorN = { data: Array(labels.length).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false };

            const details: PointDetail[] = [
                { label: 'Arrival', underweight: 0, normal: 0, overweight: 0, total: 0 },
                ...datesToUse.map(d => {
                    const c = dateMap.get(d)!;
                    const parts = d.split('-');
                    const lbl = parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
                    return { label: lbl, ...c };
                })
            ];

            // Check if filter has any real data
            if (selectedTab !== 'All') {
                const arr = selectedTab === 'Underweight' ? underCounts : selectedTab === 'Normal' ? normalCounts : overCounts;
                if (arr.every(v => v === 0)) {
                    return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true, details: [] as PointDetail[] };
                }
            }

            if (selectedTab === 'All') {
                return {
                    labels,
                    datasets: [
                        { data: normalFinal, color: () => colors.primary,   strokeWidth: 3, key: 'Normal', label: 'Normal' },
                        { data: underFinal,  color: () => colors.secondary, strokeWidth: 3, key: 'Underweight', label: 'Underweight' },
                        { data: overFinal,   color: () => OVERWEIGHT_COLOR, strokeWidth: 3, key: 'Overweight', label: 'Overweight' },
                        zeroAnchorN,
                    ],
                    hasRealData: true, noData: false, details
                };
            }

            let currentData = normalFinal;
            if (selectedTab === 'Underweight') currentData = underFinal;
            else if (selectedTab === 'Overweight') currentData = overFinal;

            return {
                labels,
                datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3, key: selectedTab, label: selectedTab }, zeroAnchorN],
                hasRealData: true, noData: false, details
            };

        } else {
            // ── Weeks timeframe ──
            const arrival = selectedBatch?.arrival_date ? new Date(selectedBatch.arrival_date) : null;
            const weekMap = new Map<number, { underweight: number; normal: number; overweight: number; total: number }>();

            weighSessions.forEach(s => {
                const recorded = new Date(s.recorded_at);
                let weekIdx = 0;
                if (arrival) {
                    const diffDays = Math.floor((recorded.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
                    weekIdx = Math.max(0, Math.floor(diffDays / 7)) + 1;
                } else {
                    const startYear = new Date(weighSessions[0].recorded_at).getFullYear();
                    weekIdx = Math.floor((recorded.getTime() - new Date(startYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24 * 7));
                }
                if (!weekMap.has(weekIdx)) {
                    weekMap.set(weekIdx, { underweight: 0, normal: 0, overweight: 0, total: 0 });
                }
                const counts = weekMap.get(weekIdx)!;
                counts.total += 1;
                if (s.status === 'underweight') counts.underweight += 1;
                else if (s.status === 'overweight') counts.overweight += 1;
                else counts.normal += 1;
            });

            const sortedWeeks = Array.from(weekMap.keys()).sort();

            if (sortedWeeks.length === 0) {
                return { labels: [] as string[], datasets: [{ data: [0] }], hasRealData: false, noData: true, details: [] as PointDetail[] };
            }

            // ── Single week: pad with Arrival ──
            if (sortedWeeks.length === 1) {
                const todayWeek = sortedWeeks[0];
                const labels = ['Arrival', `W${todayWeek}`];
                const weekCounts = weekMap.get(todayWeek)!;

                const arrivalVal = 0;

                const normalFinal = [arrivalVal, weekCounts.normal];
                const underFinal  = [arrivalVal, weekCounts.underweight];
                const overFinal   = [arrivalVal, weekCounts.overweight];
                const zeroAnchorW = { data: [0, 0], color: () => 'transparent', strokeWidth: 0, withDots: false };

                const details: PointDetail[] = [
                    { label: 'Arrival', underweight: 0, normal: 0, overweight: 0, total: 0 },
                    { label: `W${todayWeek}`, ...weekCounts },
                ];

                if (selectedTab !== 'All') {
                    const hasData = selectedTab === 'Underweight' ? weekCounts.underweight > 0
                        : selectedTab === 'Normal' ? weekCounts.normal > 0
                        : weekCounts.overweight > 0;
                    if (!hasData) return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true, details: [] as PointDetail[] };
                }

                if (selectedTab === 'All') {
                    return {
                        labels,
                        datasets: [
                            { data: normalFinal, color: () => colors.primary,   strokeWidth: 3, key: 'Normal', label: 'Normal' },
                            { data: underFinal,  color: () => colors.secondary, strokeWidth: 3, key: 'Underweight', label: 'Underweight' },
                            { data: overFinal,   color: () => OVERWEIGHT_COLOR, strokeWidth: 3, key: 'Overweight', label: 'Overweight' },
                            zeroAnchorW,
                        ],
                        hasRealData: true, noData: false, details
                    };
                }

                let currentData = normalFinal;
                if (selectedTab === 'Underweight') currentData = underFinal;
                else if (selectedTab === 'Overweight') currentData = overFinal;

                return {
                    labels,
                    datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3, key: selectedTab, label: selectedTab }, zeroAnchorW],
                    hasRealData: true, noData: false, details
                };
            }

            // ── Multiple weeks ──
            const weeksToUse = sortedWeeks.slice(-30);
            const labels = ['Arrival', ...weeksToUse.map(w => `W${w}`)];
            const normalCounts = weeksToUse.map(w => weekMap.get(w)!.normal);
            const underCounts  = weeksToUse.map(w => weekMap.get(w)!.underweight);
            const overCounts   = weeksToUse.map(w => weekMap.get(w)!.overweight);

            const normalFinal = [0, ...normalCounts];
            const underFinal  = [0, ...underCounts];
            const overFinal   = [0, ...overCounts];

            const zeroAnchorWW = { data: Array(labels.length).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false };

            const details: PointDetail[] = [
                { label: 'Arrival', underweight: 0, normal: 0, overweight: 0, total: 0 },
                ...weeksToUse.map(w => ({ label: `W${w}`, ...weekMap.get(w)! }))
            ];

            if (selectedTab !== 'All') {
                const arr = selectedTab === 'Underweight' ? underCounts : selectedTab === 'Normal' ? normalCounts : overCounts;
                if (arr.every(v => v === 0)) {
                    return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true, details: [] as PointDetail[] };
                }
            }

            if (selectedTab === 'All') {
                return {
                    labels,
                    datasets: [
                        { data: normalFinal, color: () => colors.primary,   strokeWidth: 3, key: 'Normal', label: 'Normal' },
                        { data: underFinal,  color: () => colors.secondary, strokeWidth: 3, key: 'Underweight', label: 'Underweight' },
                        { data: overFinal,   color: () => OVERWEIGHT_COLOR, strokeWidth: 3, key: 'Overweight', label: 'Overweight' },
                        zeroAnchorWW,
                    ],
                    hasRealData: true, noData: false, details
                };
            }

            let currentData = normalFinal;
            if (selectedTab === 'Underweight') currentData = underFinal;
            else if (selectedTab === 'Overweight') currentData = overFinal;

            return {
                labels,
                datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3, key: selectedTab, label: selectedTab }, zeroAnchorWW],
                hasRealData: true, noData: false, details
            };
        }
    }, [weighSessions, selectedTab, timeframe, colors, activeColor, OVERWEIGHT_COLOR, selectedBatch]);

    // ─── Comparison Chart: Counts Comparison ─────────────────────────
    const comparisonChartData = useMemo(() => {
        if (weighSessions.length === 0) {
            return { noData: true, labels: [] as string[], datasets: [{ data: [0] }], details: [] as PointDetail[] };
        }

        if (timeframe === 'Days') {
            const dateMap = new Map<string, { underweight: number; normal: number; overweight: number; total: number }>();
            weighSessions.forEach(s => {
                const key = s.recorded_at.slice(0, 10);
                if (!dateMap.has(key)) {
                    dateMap.set(key, { underweight: 0, normal: 0, overweight: 0, total: 0 });
                }
                const counts = dateMap.get(key)!;
                counts.total += 1;
                if (s.status === 'underweight') counts.underweight += 1;
                else if (s.status === 'overweight') counts.overweight += 1;
                else counts.normal += 1;
            });
            const sortedDates = Array.from(dateMap.keys()).sort();
            if (sortedDates.length < 2) {
                return { noData: true, labels: [] as string[], datasets: [{ data: [0] }], details: [] as PointDetail[] };
            }

            const daysToUse = sortedDates.slice(-30);
            const labels = daysToUse.map(d => {
                const parts = d.split('-');
                return parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
            });

            const normalCounts = daysToUse.map(d => dateMap.get(d)!.normal);
            const underweightCounts = daysToUse.map(d => dateMap.get(d)!.underweight);
            const overweightCounts = daysToUse.map(d => dateMap.get(d)!.overweight);

            const details: PointDetail[] = daysToUse.map(d => {
                const c = dateMap.get(d)!;
                const parts = d.split('-');
                const lbl = parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
                return { label: lbl, ...c };
            });

            return {
                noData: false,
                labels,
                datasets: [
                    { data: normalCounts, color: () => colors.primary, strokeWidth: 3, key: 'Normal', label: 'Normal' },
                    { data: underweightCounts, color: () => colors.secondary, strokeWidth: 3, key: 'Underweight', label: 'Underweight' },
                    { data: overweightCounts, color: () => OVERWEIGHT_COLOR, strokeWidth: 3, key: 'Overweight', label: 'Overweight' },
                ],
                details,
            };
        } else {
            const arrival = selectedBatch?.arrival_date ? new Date(selectedBatch.arrival_date) : null;
            const weekMap = new Map<number, { underweight: number; normal: number; overweight: number; total: number }>();
            weighSessions.forEach(s => {
                const recorded = new Date(s.recorded_at);
                let weekIdx = 0;
                if (arrival) {
                    const diffDays = Math.floor((recorded.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
                    weekIdx = Math.max(0, Math.floor(diffDays / 7)) + 1;
                } else {
                    const startYear = new Date(weighSessions[0].recorded_at).getFullYear();
                    weekIdx = Math.floor((recorded.getTime() - new Date(startYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24 * 7));
                }
                if (!weekMap.has(weekIdx)) {
                    weekMap.set(weekIdx, { underweight: 0, normal: 0, overweight: 0, total: 0 });
                }
                const counts = weekMap.get(weekIdx)!;
                counts.total += 1;
                if (s.status === 'underweight') counts.underweight += 1;
                else if (s.status === 'overweight') counts.overweight += 1;
                else counts.normal += 1;
            });
            const sortedWeeks = Array.from(weekMap.keys()).sort();
            if (sortedWeeks.length < 2) {
                return { noData: true, labels: [] as string[], datasets: [{ data: [0] }], details: [] as PointDetail[] };
            }

            const weeksToUse = sortedWeeks.slice(-30);
            const labels = weeksToUse.map(w => `W${w}`);
            
            const normalCounts = weeksToUse.map(w => weekMap.get(w)!.normal);
            const underweightCounts = weeksToUse.map(w => weekMap.get(w)!.underweight);
            const overweightCounts = weeksToUse.map(w => weekMap.get(w)!.overweight);

            const details: PointDetail[] = weeksToUse.map(w => ({
                label: `W${w}`,
                ...weekMap.get(w)!
            }));

            return {
                noData: false,
                labels,
                datasets: [
                    { data: normalCounts, color: () => colors.primary, strokeWidth: 3, key: 'Normal', label: 'Normal' },
                    { data: underweightCounts, color: () => colors.secondary, strokeWidth: 3, key: 'Underweight', label: 'Underweight' },
                    { data: overweightCounts, color: () => OVERWEIGHT_COLOR, strokeWidth: 3, key: 'Overweight', label: 'Overweight' },
                ],
                details,
            };
        }
    }, [weighSessions, timeframe, colors, selectedBatch, OVERWEIGHT_COLOR]);

    // ─── Fast Local AI Recommendations ──────────────────────────────
    const getGrowthAnalysis = () => {
        if (weighSessions.length === 0) {
            return `No weighing sessions recorded for ${selectedBatch ? selectedBatch.name : 'this batch'} yet. Please ensure the scale device is online and recording.`;
        }
        
        const total = underweightCount + normalCount + overweightCount;
        const underPct = total > 0 ? Math.round((underweightCount / total) * 100) : 0;
        const overPct = total > 0 ? Math.round((overweightCount / total) * 100) : 0;
        const normalPct = total > 0 ? Math.round((normalCount / total) * 100) : 0;
        
        let insight = `Batch "${selectedBatch?.name}" cohort has ${total} recorded weights. The distribution shows ${normalPct}% normal weight, ${underPct}% underweight, and ${overPct}% overweight. `;
        
        if (underPct > 15) {
            insight += `The underweight group is relatively high (${underPct}%). This often suggests feed competition or potential health issues. We recommend reviewing feed spacing and sorting the smaller animals.`;
        } else if (overPct > 15) {
            insight += `The overweight group is high (${overPct}%). You may want to adjust feed formulations to avoid excessive fat deposition, especially if they are approaching market finisher weight.`;
        } else {
            insight += `The growth distribution is within healthy parameters with a strong majority of normal-weight animals. Continue with the current feeding schedule and micro-climate control.`;
        }
        return insight;
    };

    const renderChartTooltip = (tooltip: ChartTooltipState | null, chartWidth: number) => {
        if (!tooltip || !tooltip.items || tooltip.items.length === 0) return null;
        const { x, y, label, items } = tooltip;
        const tipW = 156;
        const tipH = 34 + items.length * 22;
        const offsetX = Math.max(6, Math.min(x - tipW / 2, chartWidth - tipW - 6));
        const offsetY = y - tipH - 10 < 0 ? y + 10 : y - tipH - 10;

        return (
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: offsetX,
                    top: offsetY,
                    backgroundColor: '#182232',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    width: tipW,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    elevation: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    zIndex: 999,
                }}
            >
                <Text
                    style={{
                        fontFamily: 'Poppins-SemiBold',
                        fontSize: 11,
                        color: '#94A3B8',
                        marginBottom: 4,
                    }}
                >
                    {label}
                </Text>
                {items.map((item, idx) => (
                    <View
                        key={idx}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: idx > 0 ? 4 : 0,
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                            <View
                                style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 3.5,
                                    backgroundColor: item.color,
                                }}
                            />
                            <Text
                                style={{
                                    fontFamily: 'Poppins-Medium',
                                    fontSize: 11,
                                    color: '#FFFFFF',
                                }}
                                numberOfLines={1}
                            >
                                {item.label}
                            </Text>
                        </View>
                        <Text
                            style={{
                                fontFamily: 'Poppins-Bold',
                                fontSize: 11,
                                color: '#FFFFFF',
                                marginLeft: 8,
                            }}
                        >
                            {item.count} {item.count === 1 ? 'log' : 'logs'}
                        </Text>
                    </View>
                ))}
            </View>
        );
    };

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingOptionStr = selectedHousing ? selectedHousing.name : 'No House Selected';

    const batchesOptions = filteredBatches.map(b => b.name);
    const selectedBatchOptionStr = selectedBatch ? selectedBatch.name : 'No Batch Selected';

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 16, flex: 1, textAlign: 'center', marginHorizontal: 4 }]}>
                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} Growth
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PrintReportButton
                        buildReport={buildGrowthReport}
                        emptyMessage="Select a batch with recorded weigh-ins first."
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
                {/* Intro Text & Day Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4, gap: 12 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginTop: 0, marginBottom: 0 }]}>
                        Here are the growth statistics and analytics for your {animalType === 'pig' ? 'pigs' : 'chickens'}.
                    </Text>
                    {currentDay !== null && (
                        <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface, paddingHorizontal: 12, flexShrink: 0 }]}>
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                                DAY
                            </Text>
                            <Text style={[textStyles.h1, { color: colors.primary, fontSize: 24, lineHeight: 28 }]}>
                                {currentDay}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Sliding Animal Type Pill Switcher */}
                <AnimalTypePillSwitcher
                    selected={animalType}
                    onSelect={handleSwitchAnimalType}
                    style={{ marginBottom: 16 }}
                />

                {/* Filters Dropdown (House & Batch beside each other) */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                    {/* House Filter Dropdown */}
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
                                }
                            ]}
                            onPress={() => setHousingModalVisible(true)}
                        >
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]}>
                                {selectedHousingOptionStr}
                            </Text>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>

                    {/* Batch Filter Dropdown */}
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
                                }
                            ]}
                            onPress={() => setBatchModalVisible(true)}
                        >
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]}>
                                {selectedBatchOptionStr}
                            </Text>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>
                </View>

                {isLoading || isWeighLoading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading growth analytics...</Text>
                    </View>
                ) : filteredHousings.length === 0 ? (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <MaterialIcons name="home" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Houses Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            There are no active houses registered for {animalType === 'pig' ? 'pigs' : 'chickens'} on this farm yet.
                        </Text>
                    </View>
                ) : filteredBatches.length === 0 ? (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <MaterialIcons name="layers" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Active Batches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            There are no batches currently registered in {selectedHousing?.name ?? 'this housing'}.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Filter Chips */}
                        <View style={[deviceStyles.filterContainer, { marginBottom: 24, paddingHorizontal: 0 }]}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {tabs.map((category) => {
                                    const isSelected = selectedTab === category;
                                    const tabColor = getTabColor(category);

                                    return (
                                        <TouchableOpacity
                                            key={category}
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                setSelectedTab(category);
                                                setGrowthTooltip(null);
                                            }}
                                            style={[
                                                deviceStyles.filterChip,
                                                isSelected && { backgroundColor: tabColor, borderColor: tabColor }
                                            ]}
                                        >
                                            <Text style={[
                                                deviceStyles.filterChipText,
                                                isSelected && { color: colors.onPrimary }
                                            ]}>
                                                {category}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        {/* Session / Day Summary Card */}
                        {summaryInfo ? (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                borderRadius: 20,
                                padding: 18,
                                marginBottom: 24,
                                shadowColor: colors.shadow,
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.1,
                                shadowRadius: 8,
                                elevation: 2,
                            }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <View style={{ flex: 1, marginRight: 8 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: colors.text }}>
                                            {summaryInfo.title}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                            {summaryInfo.subtitle}
                                        </Text>
                                    </View>
                                    <View style={{
                                        backgroundColor: colors.primary + '15',
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 8,
                                        alignSelf: 'flex-start',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.primary }}>
                                            {summaryInfo.totalCount} total logs
                                        </Text>
                                    </View>
                                </View>

                                {/* Session Dropdown Selector */}
                                {sessionOptions.length > 1 && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setSessionModalVisible(true)}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            backgroundColor: colors.bgLight,
                                            borderWidth: 1,
                                            borderColor: colors.stroke,
                                            borderRadius: 10,
                                            paddingVertical: 9,
                                            paddingHorizontal: 12,
                                            marginBottom: 16,
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                                            <MaterialIcons name="filter-list" size={16} color={colors.primary} />
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 12, color: colors.text, flex: 1 }}>
                                                {activeSessionOption}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                                    </TouchableOpacity>
                                )}

                                {/* Stats Info Row */}
                                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name="speed" size={22} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey }}>
                                            Average Weight
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 22, color: colors.text }}>
                                                {summaryInfo.avgWeightKg.toFixed(2)}
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 14, color: colors.textGrey, marginLeft: 4 }}>
                                                kg
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={{ height: 1, backgroundColor: colors.divider, marginBottom: 16 }} />

                                {/* 3 Column breakdown of underweight, normal, overweight */}
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    {/* Underweight */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: '#F59E0B' + '12',
                                        borderWidth: 1,
                                        borderColor: '#F59E0B' + '30',
                                        borderRadius: 12,
                                        padding: 10,
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 9, color: '#F59E0B', opacity: 0.8, textAlign: 'center' }}>
                                            UNDERWEIGHT
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#F59E0B', marginTop: 4 }}>
                                            {summaryInfo.underweightCount}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey, marginTop: 2 }}>
                                            logs
                                        </Text>
                                    </View>

                                    {/* Normal */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: colors.primary + '12',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '30',
                                        borderRadius: 12,
                                        padding: 10,
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 9, color: colors.primary, opacity: 0.8, textAlign: 'center' }}>
                                            NORMAL
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: colors.primary, marginTop: 4 }}>
                                            {summaryInfo.normalCount}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey, marginTop: 2 }}>
                                            logs
                                        </Text>
                                    </View>

                                    {/* Overweight */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: OVERWEIGHT_COLOR + '12',
                                        borderWidth: 1,
                                        borderColor: OVERWEIGHT_COLOR + '30',
                                        borderRadius: 12,
                                        padding: 10,
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 9, color: OVERWEIGHT_COLOR, opacity: 0.8, textAlign: 'center' }}>
                                            OVERWEIGHT
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: OVERWEIGHT_COLOR, marginTop: 4 }}>
                                            {summaryInfo.overweightCount}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey, marginTop: 2 }}>
                                            logs
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : null}

                        {/* Head Count Display */}
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
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.5,
                            shadowRadius: 4,
                            elevation: 1,
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
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Total Weigh Logs</Text>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>{selectedTab} Group</Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[textStyles.h1, { color: activeColor, fontSize: 28, lineHeight: 32 }]}>
                                    {getCategoryCount(selectedTab)}
                                </Text>
                                <Text style={[textStyles.label, { color: activeColor, fontSize: 11, opacity: 0.8 }]}>Logs</Text>
                            </View>
                        </View>

                        {/* Timeframe Toggle & Chart Title */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 0 }]}>Current Growth</Text>
                            </View>
                            <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke, padding: 2 }}>
                                {(['Days', 'Weeks'] as const).map(tf => (
                                    <TouchableOpacity
                                        key={tf}
                                        onPress={() => {
                                            setTimeframe(tf);
                                            setGrowthTooltip(null);
                                            setCompTooltip(null);
                                        }}
                                        style={{
                                            paddingHorizontal: 12,
                                            paddingVertical: 6,
                                            borderRadius: 6,
                                            backgroundColor: timeframe === tf ? activeColor + '1A' : 'transparent',
                                        }}
                                    >
                                        <Text style={[textStyles.label, { color: timeframe === tf ? activeColor : colors.textGrey, fontSize: 11 }]}>{tf}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Growth Chart */}
                        <View style={{ alignItems: 'center', marginBottom: 24, alignSelf: 'stretch' }}>
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
                                {lineChartData.noData ? (
                                    <View style={{ height: 200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                                        <MaterialIcons name="show-chart" size={40} color={colors.textGrey} />
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text, marginTop: 12 }}>There's no current logs</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, marginTop: 4, textAlign: 'center' }}>
                                            {selectedTab === 'All' ? 'No weigh sessions recorded yet for this batch.' : `No ${selectedTab.toLowerCase()} animals recorded yet.`}
                                        </Text>
                                    </View>
                                ) : (() => {
                                    const baseChartWidth = width - (hPad * 2) - 18;
                                    const pointSpacing = 68;
                                    const growthChartWidth = Math.max(baseChartWidth, (lineChartData.labels?.length || 0) * pointSpacing);
                                    const isGrowthScrollable = growthChartWidth > baseChartWidth;

                                    return (
                                        <>
                                            {isGrowthScrollable && (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 16, marginBottom: 6 }}>
                                                    <MaterialIcons name="swipe" size={14} color={colors.textGrey} />
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Scroll for full timeline</Text>
                                                </View>
                                            )}
                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={{ minWidth: baseChartWidth }}
                                            >
                                                <LineChart
                                                    data={lineChartData}
                                                    width={growthChartWidth}
                                                    height={240}
                                                    yAxisLabel=""
                                                    yAxisSuffix=""
                                                    fromZero
                                                    withDots={true}
                                                    withInnerLines={true}
                                                    withOuterLines={false}
                                                    withVerticalLines={false}
                                                    withHorizontalLines={true}
                                                    onDataPointClick={({ x, y, value, index, dataset }) => {
                                                        // skip transparent anchor dataset
                                                        if (value === 0 && index === 0) return;
                                                        const detail = (lineChartData as any).details?.[index];
                                                        const label = detail?.label ?? lineChartData.labels?.[index] ?? `#${index + 1}`;
                                                        const clickedVal = Math.round(value);
                                                        const clickedKey = (dataset as any)?.key;

                                                        const items: ChartTooltipItem[] = [];
                                                        if (selectedTab === 'All') {
                                                            if (detail) {
                                                                if (detail.underweight === clickedVal && clickedVal > 0) {
                                                                    items.push({ label: 'Underweight', count: detail.underweight, color: colors.secondary });
                                                                }
                                                                if (detail.normal === clickedVal && clickedVal > 0) {
                                                                    items.push({ label: 'Normal', count: detail.normal, color: colors.primary });
                                                                }
                                                                if (detail.overweight === clickedVal && clickedVal > 0) {
                                                                    items.push({ label: 'Overweight', count: detail.overweight, color: OVERWEIGHT_COLOR });
                                                                }
                                                            }
                                                            if (items.length === 0 && clickedKey && detail) {
                                                                const count = clickedKey === 'Underweight' ? detail.underweight : clickedKey === 'Overweight' ? detail.overweight : detail.normal;
                                                                const color = clickedKey === 'Underweight' ? colors.secondary : clickedKey === 'Overweight' ? OVERWEIGHT_COLOR : colors.primary;
                                                                if (count > 0) items.push({ label: clickedKey, count, color });
                                                            }
                                                            if (items.length === 0 && clickedVal > 0) {
                                                                items.push({ label: clickedKey || 'Normal', count: clickedVal, color: colors.primary });
                                                            }
                                                        } else if (selectedTab === 'Underweight') {
                                                            const count = detail ? detail.underweight : clickedVal;
                                                            if (count > 0) items.push({ label: 'Underweight', count, color: colors.secondary });
                                                        } else if (selectedTab === 'Normal') {
                                                            const count = detail ? detail.normal : clickedVal;
                                                            if (count > 0) items.push({ label: 'Normal', count, color: colors.primary });
                                                        } else if (selectedTab === 'Overweight') {
                                                            const count = detail ? detail.overweight : clickedVal;
                                                            if (count > 0) items.push({ label: 'Overweight', count, color: OVERWEIGHT_COLOR });
                                                        }

                                                        if (items.length === 0) return;

                                                        setGrowthTooltip(prev =>
                                                            prev && Math.abs(prev.x - x) < 5 && Math.abs(prev.y - y) < 5 ? null : { x, y, label, items }
                                                        );
                                                    }}
                                                    decorator={() => renderChartTooltip(growthTooltip, growthChartWidth)}
                                                    chartConfig={{
                                                        backgroundColor: colors.surface,
                                                        backgroundGradientFrom: colors.surface,
                                                        backgroundGradientTo: colors.surface,
                                                        decimalPlaces: 0,
                                                        color: (opacity = 1) => colors.stroke,
                                                        labelColor: (opacity = 1) => colors.textGrey,
                                                        strokeWidth: 3,
                                                        fillShadowGradientFrom: activeColor,
                                                        fillShadowGradientFromOpacity: 0.2,
                                                        fillShadowGradientTo: activeColor,
                                                        fillShadowGradientToOpacity: 0.05,
                                                        style: {
                                                            borderRadius: 16
                                                        },
                                                        propsForDots: {
                                                            r: "5",
                                                            strokeWidth: "2",
                                                            stroke: colors.surface,
                                                        }
                                                    }}
                                                    bezier
                                                    style={{
                                                        borderRadius: 16,
                                                    }}
                                                />
                                            </ScrollView>
                                            {/* Chart legend */}
                                            {selectedTab === 'All' && (
                                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingBottom: 10, paddingLeft: 16, flexWrap: 'wrap' }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Normal</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary }} />
                                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Underweight</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
                                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Overweight</Text>
                                                    </View>
                                                </View>
                                            )}
                                        </>
                                    );
                                })()}
                            </View>
                        </View>

                        {/* Current Growth Descriptive Explanation Card */}
                        {growthExplanation && (
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
                                {/* Header with Icon and Velocity Badge */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                                            <MaterialIcons name="trending-up" size={18} color={colors.primary} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text }}>
                                                Growth Performance Insights
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                Weight Trajectory & Daily Gain Analysis
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{
                                        backgroundColor: growthExplanation.velocityColor + '18',
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 8,
                                        borderWidth: 1,
                                        borderColor: growthExplanation.velocityColor + '30',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: growthExplanation.velocityColor }}>
                                            {growthExplanation.velocityStatus}
                                        </Text>
                                    </View>
                                </View>

                                {/* 3 Metric Pills: Total Gain, Recent ADG, Latest Average */}
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                    <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Net Total Gain</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text, marginTop: 2 }}>
                                            +{growthExplanation.totalGainKg.toFixed(2)} kg
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                            {growthExplanation.totalDays} days elapsed
                                        </Text>
                                    </View>

                                    <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Recent ADG</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.primary, marginTop: 2 }}>
                                            {growthExplanation.recentAdgGrams !== null ? formatAdg(growthExplanation.recentAdgGrams, 'd') : formatAdg(growthExplanation.overallAdgGrams, 'd')}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                            {growthExplanation.recentAdgGrams !== null ? `Last ${growthExplanation.recentDays} days` : `${animalType === 'pig' ? 'Herd' : 'Flock'} Lifetime`}
                                        </Text>
                                    </View>

                                    <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Latest Average</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text, marginTop: 2 }}>
                                            {growthExplanation.latestSession.avgWeightKg.toFixed(2)} kg
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                            from {growthExplanation.firstSession.avgWeightKg.toFixed(2)} kg
                                        </Text>
                                    </View>
                                </View>

                                {/* Descriptive Narrative Box */}
                                <View style={{ backgroundColor: colors.bgLight, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, lineHeight: 18 }}>
                                        {growthExplanation.narrative}
                                    </Text>
                                    {growthExplanation.tabContextText ? (
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 16, marginTop: 8 }}>
                                            {growthExplanation.tabContextText}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        )}

                        {/* ─── Status Comparison Section ───────────────────────────── */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 0 }]}>Status Comparison</Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                    Flock Uniformity & Weight Classification
                                </Text>
                            </View>
                            {statusExplanation && (
                                <View style={{
                                    backgroundColor: statusExplanation.uniformityBadgeBg,
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: statusExplanation.uniformityBadgeColor + '30',
                                }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: statusExplanation.uniformityBadgeColor }}>
                                        {statusExplanation.uniformityPct}% Uniformity
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Flock Uniformity Breakdown Card */}
                        {statusExplanation && (
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
                                marginBottom: 16,
                            }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                        Flock Status Distribution
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                        {statusExplanation.latest.label}
                                    </Text>
                                </View>

                                {/* Segmented Proportional Progress Bar */}
                                <View style={{
                                    height: 14,
                                    borderRadius: 7,
                                    backgroundColor: colors.bgLight,
                                    flexDirection: 'row',
                                    overflow: 'hidden',
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    marginBottom: 14,
                                }}>
                                    {statusExplanation.latest.normalPct > 0 && (
                                        <View style={{
                                            width: `${statusExplanation.latest.normalPct}%`,
                                            backgroundColor: colors.primary,
                                        }} />
                                    )}
                                    {statusExplanation.latest.underweightPct > 0 && (
                                        <View style={{
                                            width: `${statusExplanation.latest.underweightPct}%`,
                                            backgroundColor: colors.secondary,
                                        }} />
                                    )}
                                    {statusExplanation.latest.overweightPct > 0 && (
                                        <View style={{
                                            width: `${statusExplanation.latest.overweightPct}%`,
                                            backgroundColor: OVERWEIGHT_COLOR,
                                        }} />
                                    )}
                                </View>

                                {/* 3 Category Breakdown Badges */}
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: statusExplanation.prev ? 14 : 0 }}>
                                    {/* Normal */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: colors.primary + '10',
                                        borderRadius: 10,
                                        padding: 10,
                                        borderWidth: 1,
                                        borderColor: colors.primary + '25',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.primary }}>
                                            NORMAL
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: colors.primary, marginTop: 2 }}>
                                            {statusExplanation.latest.normalCount}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>
                                            {statusExplanation.latest.normalPct}% of flock
                                        </Text>
                                    </View>

                                    {/* Underweight */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: colors.secondary + '10',
                                        borderRadius: 10,
                                        padding: 10,
                                        borderWidth: 1,
                                        borderColor: colors.secondary + '25',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: colors.secondary }}>
                                            UNDERWEIGHT
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: colors.secondary, marginTop: 2 }}>
                                            {statusExplanation.latest.underweightCount}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>
                                            {statusExplanation.latest.underweightPct}% of flock
                                        </Text>
                                    </View>

                                    {/* Overweight */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: OVERWEIGHT_COLOR + '10',
                                        borderRadius: 10,
                                        padding: 10,
                                        borderWidth: 1,
                                        borderColor: OVERWEIGHT_COLOR + '25',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: OVERWEIGHT_COLOR }}>
                                            OVERWEIGHT
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: OVERWEIGHT_COLOR, marginTop: 2 }}>
                                            {statusExplanation.latest.overweightCount}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>
                                            {statusExplanation.latest.overweightPct}% of flock
                                        </Text>
                                    </View>
                                </View>

                                {/* Session-to-Session Comparison Shift Table */}
                                {statusExplanation.prev && (
                                    <View style={{
                                        backgroundColor: colors.bgLight,
                                        borderRadius: 12,
                                        padding: 12,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                    }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.text }}>
                                                Session Shift Comparison
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>
                                                {statusExplanation.prev.dateLabel} ➔ {statusExplanation.latest.dateLabel}
                                            </Text>
                                        </View>

                                        {/* Normal Shift */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingVertical: 4 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.text }}>Normal</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                    {statusExplanation.prev.normalCount} ({statusExplanation.prev.normalPct}%) ➔ {statusExplanation.latest.normalCount} ({statusExplanation.latest.normalPct}%)
                                                </Text>
                                                <View style={{
                                                    backgroundColor: statusExplanation.normalDiffPct >= 0 ? colors.primary + '18' : colors.warning + '18',
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 2,
                                                    borderRadius: 6,
                                                }}>
                                                    <Text style={{
                                                        fontFamily: 'Poppins-SemiBold',
                                                        fontSize: 10,
                                                        color: statusExplanation.normalDiffPct >= 0 ? colors.primary : colors.warning,
                                                    }}>
                                                        {statusExplanation.normalDiffPct >= 0 ? `+${statusExplanation.normalDiffPct}%` : `${statusExplanation.normalDiffPct}%`}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Underweight Shift */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingVertical: 4 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary }} />
                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.text }}>Underweight</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                    {statusExplanation.prev.underweightCount} ({statusExplanation.prev.underweightPct}%) ➔ {statusExplanation.latest.underweightCount} ({statusExplanation.latest.underweightPct}%)
                                                </Text>
                                                <View style={{
                                                    backgroundColor: statusExplanation.underDiffPct <= 0 ? colors.primary + '18' : colors.warning + '18',
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 2,
                                                    borderRadius: 6,
                                                }}>
                                                    <Text style={{
                                                        fontFamily: 'Poppins-SemiBold',
                                                        fontSize: 10,
                                                        color: statusExplanation.underDiffPct <= 0 ? colors.primary : colors.warning,
                                                    }}>
                                                        {statusExplanation.underDiffPct > 0 ? `+${statusExplanation.underDiffPct}%` : `${statusExplanation.underDiffPct}%`}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Overweight Shift */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingVertical: 4 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: OVERWEIGHT_COLOR }} />
                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.text }}>Overweight</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                    {statusExplanation.prev.overweightCount} ({statusExplanation.prev.overweightPct}%) ➔ {statusExplanation.latest.overweightCount} ({statusExplanation.latest.overweightPct}%)
                                                </Text>
                                                <View style={{
                                                    backgroundColor: statusExplanation.overDiffPct === 0 ? colors.stroke : colors.primary + '18',
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 2,
                                                    borderRadius: 6,
                                                }}>
                                                    <Text style={{
                                                        fontFamily: 'Poppins-SemiBold',
                                                        fontSize: 10,
                                                        color: statusExplanation.overDiffPct === 0 ? colors.textGrey : colors.primary,
                                                    }}>
                                                        {statusExplanation.overDiffPct > 0 ? `+${statusExplanation.overDiffPct}%` : `${statusExplanation.overDiffPct}%`}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Distribution Trend Chart Container */}
                        <View style={{
                            borderRadius: 20,
                            backgroundColor: colors.surface,
                            paddingTop: 16,
                            paddingBottom: 4,
                            paddingRight: comparisonChartData.noData ? 0 : 16,
                            elevation: 4,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.1,
                            shadowRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            marginBottom: 16,
                        }}>
                            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                    Distribution Trend Over Time
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                    Head count per status category across recording dates
                                </Text>
                            </View>

                            {comparisonChartData.noData ? (
                                <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                                    <MaterialIcons name="compare-arrows" size={40} color={colors.textGrey} />
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text, marginTop: 12 }}>There's no comparison logs yet</Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, marginTop: 4, textAlign: 'center' }}>
                                        At least 2 recording sessions are needed to compare historical shifts.
                                    </Text>
                                </View>
                            ) : (() => {
                                const baseChartWidth = width - (hPad * 2) - 18;
                                const pointSpacing = 68;
                                const compChartWidth = Math.max(baseChartWidth, (comparisonChartData.labels?.length || 0) * pointSpacing);
                                const isCompScrollable = compChartWidth > baseChartWidth;

                                return (
                                    <>
                                        {isCompScrollable && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 16, marginBottom: 6 }}>
                                                <MaterialIcons name="swipe" size={14} color={colors.textGrey} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Scroll for full timeline</Text>
                                            </View>
                                        )}
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={{ minWidth: baseChartWidth }}
                                        >
                                            <LineChart
                                                data={comparisonChartData}
                                                width={compChartWidth}
                                                height={200}
                                                yAxisLabel=""
                                                yAxisSuffix=""
                                                fromZero={true}
                                                withDots={true}
                                                withInnerLines={true}
                                                withOuterLines={false}
                                                withVerticalLines={false}
                                                withHorizontalLines={true}
                                                onDataPointClick={({ x, y, value, index, dataset }) => {
                                                    const detail = (comparisonChartData as any).details?.[index];
                                                    const label = detail?.label ?? comparisonChartData.labels?.[index] ?? `#${index + 1}`;
                                                    const clickedVal = Math.round(value);
                                                    const clickedKey = (dataset as any)?.key;

                                                    const items: ChartTooltipItem[] = [];
                                                    if (detail) {
                                                        if (detail.underweight === clickedVal && clickedVal > 0) {
                                                            items.push({ label: 'Underweight', count: detail.underweight, color: colors.secondary });
                                                        }
                                                        if (detail.normal === clickedVal && clickedVal > 0) {
                                                            items.push({ label: 'Normal', count: detail.normal, color: colors.primary });
                                                        }
                                                        if (detail.overweight === clickedVal && clickedVal > 0) {
                                                            items.push({ label: 'Overweight', count: detail.overweight, color: OVERWEIGHT_COLOR });
                                                        }
                                                    }

                                                    if (items.length === 0 && clickedKey && detail) {
                                                        const count = clickedKey === 'Underweight' ? detail.underweight : clickedKey === 'Overweight' ? detail.overweight : detail.normal;
                                                        const color = clickedKey === 'Underweight' ? colors.secondary : clickedKey === 'Overweight' ? OVERWEIGHT_COLOR : colors.primary;
                                                        if (count > 0) {
                                                            items.push({ label: clickedKey, count, color });
                                                        }
                                                    }

                                                    if (items.length === 0 && clickedVal > 0) {
                                                        items.push({ label: clickedKey || 'Normal', count: clickedVal, color: colors.primary });
                                                    }

                                                    if (items.length === 0) return;

                                                    setCompTooltip(prev =>
                                                        prev && Math.abs(prev.x - x) < 5 && Math.abs(prev.y - y) < 5 ? null : { x, y, label, items }
                                                    );
                                                }}
                                                decorator={() => renderChartTooltip(compTooltip, compChartWidth)}
                                                chartConfig={{
                                                    backgroundColor: colors.surface,
                                                    backgroundGradientFrom: colors.surface,
                                                    backgroundGradientTo: colors.surface,
                                                    decimalPlaces: 0,
                                                    color: (opacity = 1) => colors.stroke,
                                                    labelColor: (opacity = 1) => colors.textGrey,
                                                    strokeWidth: 2,
                                                    fillShadowGradientFrom: colors.primary,
                                                    fillShadowGradientFromOpacity: 0.08,
                                                    fillShadowGradientTo: colors.primary,
                                                    fillShadowGradientToOpacity: 0.01,
                                                    style: { borderRadius: 16 },
                                                    propsForDots: {
                                                        r: '4',
                                                        strokeWidth: '2',
                                                        stroke: colors.surface,
                                                    }
                                                }}
                                                bezier
                                                style={{ borderRadius: 16 }}
                                            />
                                        </ScrollView>
                                        {/* Comparison legend */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingBottom: 10, paddingLeft: 16 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Normal</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary }} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Underweight</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: OVERWEIGHT_COLOR }} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Overweight</Text>
                                            </View>
                                        </View>
                                    </>
                                );
                            })()}
                        </View>

                        {/* Status Comparison Descriptive Narrative Card */}
                        {statusExplanation && (
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
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name="insights" size={18} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text }}>
                                            Flock Status & Uniformity Analysis
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                            Size distribution and health evaluation
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ gap: 10, marginBottom: 12 }}>
                                    {/* Uniformity assessment */}
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                        <MaterialIcons name="check-circle" size={16} color={statusExplanation.uniformityBadgeColor} style={{ marginTop: 2 }} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>
                                            {statusExplanation.uniformityDescription}
                                        </Text>
                                    </View>

                                    {/* Underweight assessment */}
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                        <MaterialIcons name="info-outline" size={16} color={colors.secondary} style={{ marginTop: 2 }} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>
                                            {statusExplanation.underweightDescription}
                                        </Text>
                                    </View>

                                    {/* Overweight assessment */}
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                        <MaterialIcons name="info-outline" size={16} color={OVERWEIGHT_COLOR} style={{ marginTop: 2 }} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>
                                            {statusExplanation.overweightDescription}
                                        </Text>
                                    </View>
                                </View>

                                {/* Actionable recommendation */}
                                <View style={{
                                    flexDirection: 'row',
                                    gap: 8,
                                    alignItems: 'center',
                                    backgroundColor: colors.primary + '10',
                                    borderWidth: 1,
                                    borderColor: colors.primary + '25',
                                    borderRadius: 10,
                                    padding: 10,
                                }}>
                                    <MaterialIcons name="lightbulb" size={16} color={colors.primary} />
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.primary, flex: 1, lineHeight: 16 }}>
                                        {statusExplanation.recommendation}
                                    </Text>
                                </View>
                            </View>
                        )}

                        <AIInsightCard
                            title="AniBot Insight"
                            category="growth_report"
                            farmId={farmId}
                            subKey={selectedBatchId ? `${selectedBatchId}_${animalType}` : (selectedHousingId ? `${selectedHousingId}_${animalType}` : animalType)}
                            staticContent={getGrowthAnalysis()}
                            context={{
                                type: 'weight',
                                animalType,
                                housingName: selectedHousing?.name,
                                data: {
                                    batchId: selectedBatchId,
                                    housingId: selectedHousingId,
                                    batchName: selectedBatch?.name,
                                    totalSessions: weighSessions.length,
                                    envelopeCount: weighingSessionEnvelopes.length,
                                    latestSessionId: selectedSessionOption,
                                    timeframe,
                                    animalCount: selectedBatch?.current_count,
                                }
                            }}
                            variant="green"
                        />
                    </>
                )}
            </ScrollView>

            {/* House Selection Modal */}
            <SelectionModal
                visible={housingModalVisible}
                onClose={() => setHousingModalVisible(false)}
                onSelect={(val) => {
                    const matched = filteredHousings.find(h => h.name === val);
                    if (matched) {
                        handleSelectHousing(matched.id);
                    }
                    setHousingModalVisible(false);
                }}
                title="Select House"
                description="Choose a house to view its growth report."
                icon="home"
                options={housingsOptions}
                selectedValue={selectedHousingOptionStr}
                requireConfirm={false}
                enableSearch={false}
            />

            {/* Batch Selection Modal */}
            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={(val) => {
                    const matched = filteredBatches.find(b => b.name === val);
                    if (matched) {
                        handleSelectBatch(matched.id);
                    }
                    setBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose a batch number to view its specific growth report."
                icon="layers"
                options={batchesOptions}
                selectedValue={selectedBatchOptionStr}
                requireConfirm={false}
                enableSearch={false}
            />

            {/* Weighing Session Selection Modal */}
            <SelectionModal
                visible={sessionModalVisible}
                onClose={() => setSessionModalVisible(false)}
                onSelect={(val) => {
                    setSelectedSessionOption(val);
                    setSessionModalVisible(false);
                }}
                title="Select Weighing Session"
                description="View summary for all sessions or pick a specific session."
                icon="speed"
                options={sessionOptions}
                selectedValue={activeSessionOption}
                requireConfirm={false}
                enableSearch={false}
            />
        </View>
    );
}

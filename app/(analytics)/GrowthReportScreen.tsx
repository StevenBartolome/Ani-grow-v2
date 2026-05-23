import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
import { useDevicesStyles } from '@/styles/devicesStyles';

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
    animal_type: 'pig' | 'chicken';
    recorded_at: string;
    batch_id: string;
}

export default function GrowthReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    // Route search params
    const { type } = useLocalSearchParams();
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
    const [timeframe, setTimeframe] = useState<'Days' | 'Weeks'>('Days');
    const [selectedTab, setSelectedTab] = useState<'All' | 'Underweight' | 'Normal' | 'Overweight'>('All');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isWeighLoading, setIsWeighLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    // Tooltip state for Growth chart
    const [growthTooltip, setGrowthTooltip] = useState<{ x: number; y: number; value: number; label: string } | null>(null);
    // Tooltip state for Comparison chart
    const [compTooltip, setCompTooltip] = useState<{ x: number; y: number; value: number; label: string } | null>(null);

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
                    .order('arrival_date', { ascending: false })
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
                    
                    // Fetch initial weigh sessions inside loading state
                    const { data: weighData, error: weighError } = await supabase
                        .from('weigh_sessions')
                        .select('id, net_weight_grams, status, animal_type, recorded_at, batch_id')
                        .eq('batch_id', targetBatchId)
                        .order('recorded_at', { ascending: true });

                    if (weighError) throw weighError;
                    
                    setWeighSessions((weighData || []) as WeighSession[]);
                    lastLoadedBatchIdRef.current = targetBatchId;
                } else {
                    setSelectedBatchId(null);
                    setWeighSessions([]);
                    lastLoadedBatchIdRef.current = null;
                }
            } else {
                setSelectedHousingId(null);
                setSelectedBatchId(null);
                setWeighSessions([]);
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
            const { data, error } = await supabase
                .from('weigh_sessions')
                .select('id, net_weight_grams, status, animal_type, recorded_at, batch_id')
                .eq('batch_id', batchId)
                .order('recorded_at', { ascending: true });

            if (error) throw error;
            setWeighSessions((data || []) as WeighSession[]);
        } catch (err) {
            console.error('[GrowthReportScreen] error loading weigh sessions:', err);
        } finally {
            setIsWeighLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReportMetadata();
    }, [fetchReportMetadata]);

    // Auto-resolve housing selection when animal type or housings load
    useEffect(() => {
        if (filteredHousings.length > 0) {
            const exists = filteredHousings.some(h => h.id === selectedHousingId);
            if (!exists) {
                setSelectedHousingId(filteredHousings[0].id);
            }
        } else {
            setSelectedHousingId(null);
        }
    }, [animalType, allHousings, selectedHousingId]);

    // Auto-resolve batch selection when housing selection or batches change
    useEffect(() => {
        if (filteredBatches.length > 0) {
            const exists = filteredBatches.some(b => b.id === selectedBatchId);
            if (!exists) {
                setSelectedBatchId(filteredBatches[0].id);
            }
        } else {
            setSelectedBatchId(null);
        }
    }, [filteredBatches, selectedBatchId]);

    // Load weigh sessions when selected batch changes
    useEffect(() => {
        if (selectedBatchId) {
            if (lastLoadedBatchIdRef.current !== selectedBatchId) {
                fetchWeighSessions(selectedBatchId);
            }
        } else {
            setWeighSessions([]);
            lastLoadedBatchIdRef.current = null;
        }
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

    // ─── Line Chart Data Processing ─────────────────────────────────
    const lineChartData = useMemo(() => {
        const arrivalDateKey = selectedBatch?.arrival_date?.slice(0, 10) ?? null;

        // Helper: strict per-category average — returns null if no data, never cross-contaminates
        const getAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        // No sessions → blank state
        if (weighSessions.length === 0) {
            return { labels: [] as string[], datasets: [{ data: [0] }], hasRealData: false, noData: true };
        }

        if (timeframe === 'Days') {
            const dateMap = new Map<string, { underweight: number[]; normal: number[]; overweight: number[] }>();
            weighSessions.forEach(s => {
                const dateKey = s.recorded_at.slice(0, 10);
                if (!dateMap.has(dateKey)) dateMap.set(dateKey, { underweight: [], normal: [], overweight: [] });
                const val = (s.net_weight_grams || 0) / 1000;
                if (s.status === 'underweight') dateMap.get(dateKey)!.underweight.push(val);
                else if (s.status === 'overweight') dateMap.get(dateKey)!.overweight.push(val);
                else dateMap.get(dateKey)!.normal.push(val);
            });

            const sortedDates = Array.from(dateMap.keys()).sort();

            // ── Single recording date: pad with Arrival anchor ──
            if (sortedDates.length === 1) {
                const todayDateKey = sortedDates[0];
                const parts = todayDateKey.split('-');
                const todayLabel = parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : todayDateKey;
                const labels = ['Arrival', todayLabel];
                const dayData = dateMap.get(todayDateKey)!;

                // Arrival value = 0 unless the recording IS on the arrival date (use actual weight then)
                const isOnArrivalDate = arrivalDateKey && todayDateKey === arrivalDateKey;
                const allOnDay = [...dayData.normal, ...dayData.underweight, ...dayData.overweight];
                const arrivalVal = 0;

                // Actual per-category values (null → 0, never bleed across categories)
                const todayNormal  = getAvg(dayData.normal)      ?? 0;
                const todayUnder   = getAvg(dayData.underweight)  ?? 0;
                const todayOver    = getAvg(dayData.overweight)   ?? 0;

                const normalFinal  = [arrivalVal, parseFloat(todayNormal.toFixed(2))];
                const underFinal   = [arrivalVal, parseFloat(todayUnder.toFixed(2))];
                const overFinal    = [arrivalVal, parseFloat(todayOver.toFixed(2))];
                const zeroAnchor2  = { data: [0, 0], color: () => 'transparent', strokeWidth: 0, withDots: false };

                // Check if selected filter has any data
                const hasFilterData = selectedTab === 'All'
                    ? allOnDay.length > 0
                    : selectedTab === 'Underweight' ? dayData.underweight.length > 0
                    : selectedTab === 'Normal'       ? dayData.normal.length > 0
                    : dayData.overweight.length > 0;

                if (!hasFilterData && selectedTab !== 'All') {
                    return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true };
                }

                if (selectedTab === 'All') {
                    return {
                        labels,
                        datasets: [
                            { data: normalFinal,  color: () => colors.primary,    strokeWidth: 3 },
                            { data: underFinal,   color: () => colors.secondary,  strokeWidth: 3 },
                            { data: overFinal,    color: () => OVERWEIGHT_COLOR,  strokeWidth: 3 },
                            zeroAnchor2,
                        ],
                        hasRealData: true, noData: false
                    };
                }

                let currentData = normalFinal;
                if (selectedTab === 'Underweight') currentData = underFinal;
                else if (selectedTab === 'Overweight') currentData = overFinal;

                return {
                    labels,
                    datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3 }, zeroAnchor2],
                    hasRealData: true, noData: false
                };
            }

            // ── Multiple recording dates ──
            const datesToUse = sortedDates.slice(-6);
            const labels = datesToUse.map(d => {
                const parts = d.split('-');
                return parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
            });

            // Compute per-category averages — null means no animals of that type logged that day
            const normalAvgs  = datesToUse.map(d => getAvg(dateMap.get(d)!.normal));
            const underAvgs   = datesToUse.map(d => getAvg(dateMap.get(d)!.underweight));
            const overAvgs    = datesToUse.map(d => getAvg(dateMap.get(d)!.overweight));

            // For 'All' tab: interpolate missing days within each series independently
            const interpolate = (arr: (number | null)[]): number[] => {
                let last: number | null = null;
                return arr.map((v, idx) => {
                    if (v !== null) { last = v; return parseFloat(v.toFixed(2)); }
                    // find next valid
                    let next: number | null = null;
                    for (let i = idx + 1; i < arr.length; i++) { if (arr[i] !== null) { next = arr[i]; break; } }
                    const base = last !== null && next !== null ? (last + next) / 2 : last ?? next ?? 0;
                    return parseFloat(base.toFixed(2));
                });
            };

            // For specific filter tabs: only actual data, 0 for missing days (no cross-bleed)
            const toActualOnly = (arr: (number | null)[]): number[] =>
                arr.map(v => v !== null ? parseFloat(v.toFixed(2)) : 0);

            const normalFinal = interpolate(normalAvgs);
            const underFinal  = toActualOnly(underAvgs);
            const overFinal   = toActualOnly(overAvgs);

            const zeroAnchorN = { data: Array(datesToUse.length).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false };

            // Check if filter has any real data
            if (selectedTab !== 'All') {
                const arr = selectedTab === 'Underweight' ? underAvgs : selectedTab === 'Normal' ? normalAvgs : overAvgs;
                if (arr.every(v => v === null)) {
                    return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true };
                }
            }

            if (selectedTab === 'All') {
                return {
                    labels,
                    datasets: [
                        { data: normalFinal, color: () => colors.primary,   strokeWidth: 3 },
                        { data: underFinal,  color: () => colors.secondary, strokeWidth: 3 },
                        { data: overFinal,   color: () => OVERWEIGHT_COLOR, strokeWidth: 3 },
                        zeroAnchorN,
                    ],
                    hasRealData: true, noData: false
                };
            }

            let currentData = normalFinal;
            if (selectedTab === 'Underweight') currentData = underFinal;
            else if (selectedTab === 'Overweight') currentData = overFinal;

            return {
                labels,
                datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3 }, zeroAnchorN],
                hasRealData: true, noData: false
            };

        } else {
            // ── Weeks timeframe ──
            const arrival = selectedBatch?.arrival_date ? new Date(selectedBatch.arrival_date) : null;
            const weekMap = new Map<number, { underweight: number[]; normal: number[]; overweight: number[] }>();

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
                if (!weekMap.has(weekIdx)) weekMap.set(weekIdx, { underweight: [], normal: [], overweight: [] });
                const val = (s.net_weight_grams || 0) / 1000;
                if (s.status === 'underweight') weekMap.get(weekIdx)!.underweight.push(val);
                else if (s.status === 'overweight') weekMap.get(weekIdx)!.overweight.push(val);
                else weekMap.get(weekIdx)!.normal.push(val);
            });

            const sortedWeeks = Array.from(weekMap.keys()).sort();

            if (sortedWeeks.length === 0) {
                return { labels: [] as string[], datasets: [{ data: [0] }], hasRealData: false, noData: true };
            }

            // ── Single week: pad with Arrival ──
            if (sortedWeeks.length === 1) {
                const todayWeek = sortedWeeks[0];
                const labels = ['Arrival', `W${todayWeek}`];
                const weekData = weekMap.get(todayWeek)!;

                // Arrival = 0 unless this IS week 1 (arrival week) and we check arrival_date match
                const isArrivalWeek = arrival && todayWeek === 1;
                const allOnWeek = [...weekData.normal, ...weekData.underweight, ...weekData.overweight];
                const arrivalVal = 0;

                const todayNormal = getAvg(weekData.normal)     ?? 0;
                const todayUnder  = getAvg(weekData.underweight) ?? 0;
                const todayOver   = getAvg(weekData.overweight)  ?? 0;

                const normalFinal = [arrivalVal, parseFloat(todayNormal.toFixed(2))];
                const underFinal  = [arrivalVal, parseFloat(todayUnder.toFixed(2))];
                const overFinal   = [arrivalVal, parseFloat(todayOver.toFixed(2))];
                const zeroAnchorW = { data: [0, 0], color: () => 'transparent', strokeWidth: 0, withDots: false };

                if (selectedTab !== 'All') {
                    const hasData = selectedTab === 'Underweight' ? weekData.underweight.length > 0
                        : selectedTab === 'Normal' ? weekData.normal.length > 0
                        : weekData.overweight.length > 0;
                    if (!hasData) return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true };
                }

                if (selectedTab === 'All') {
                    return {
                        labels,
                        datasets: [
                            { data: normalFinal, color: () => colors.primary,   strokeWidth: 3 },
                            { data: underFinal,  color: () => colors.secondary, strokeWidth: 3 },
                            { data: overFinal,   color: () => OVERWEIGHT_COLOR, strokeWidth: 3 },
                            zeroAnchorW,
                        ],
                        hasRealData: true, noData: false
                    };
                }

                let currentData = normalFinal;
                if (selectedTab === 'Underweight') currentData = underFinal;
                else if (selectedTab === 'Overweight') currentData = overFinal;

                return {
                    labels,
                    datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3 }, zeroAnchorW],
                    hasRealData: true, noData: false
                };
            }

            // ── Multiple weeks ──
            const weeksToUse = sortedWeeks.slice(-6);
            const labels = weeksToUse.map(w => `W${w}`);
            const normalAvgs = weeksToUse.map(w => getAvg(weekMap.get(w)!.normal));
            const underAvgs  = weeksToUse.map(w => getAvg(weekMap.get(w)!.underweight));
            const overAvgs   = weeksToUse.map(w => getAvg(weekMap.get(w)!.overweight));

            const interpolate = (arr: (number | null)[]): number[] => {
                let last: number | null = null;
                return arr.map((v, idx) => {
                    if (v !== null) { last = v; return parseFloat(v.toFixed(2)); }
                    let next: number | null = null;
                    for (let i = idx + 1; i < arr.length; i++) { if (arr[i] !== null) { next = arr[i]; break; } }
                    const base = last !== null && next !== null ? (last + next) / 2 : last ?? next ?? 0;
                    return parseFloat(base.toFixed(2));
                });
            };

            const toActualOnly = (arr: (number | null)[]): number[] =>
                arr.map(v => v !== null ? parseFloat(v.toFixed(2)) : 0);

            const normalFinal = interpolate(normalAvgs);
            const underFinal  = toActualOnly(underAvgs);
            const overFinal   = toActualOnly(overAvgs);

            const zeroAnchorWW = { data: Array(weeksToUse.length).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false };

            if (selectedTab !== 'All') {
                const arr = selectedTab === 'Underweight' ? underAvgs : selectedTab === 'Normal' ? normalAvgs : overAvgs;
                if (arr.every(v => v === null)) {
                    return { labels: [], datasets: [{ data: [0] }], hasRealData: true, noData: true };
                }
            }

            if (selectedTab === 'All') {
                return {
                    labels,
                    datasets: [
                        { data: normalFinal, color: () => colors.primary,   strokeWidth: 3 },
                        { data: underFinal,  color: () => colors.secondary, strokeWidth: 3 },
                        { data: overFinal,   color: () => OVERWEIGHT_COLOR, strokeWidth: 3 },
                        zeroAnchorWW,
                    ],
                    hasRealData: true, noData: false
                };
            }

            let currentData = normalFinal;
            if (selectedTab === 'Underweight') currentData = underFinal;
            else if (selectedTab === 'Overweight') currentData = overFinal;

            return {
                labels,
                datasets: [{ data: currentData, color: () => activeColor, strokeWidth: 3 }, zeroAnchorWW],
                hasRealData: true, noData: false
            };
        }
    }, [weighSessions, selectedTab, timeframe, colors, activeColor, animalType, selectedBatch, OVERWEIGHT_COLOR]);

    // ─── Comparison Chart: Previous vs Current Average Weight ─────────

    // ─── Comparison Chart: Previous vs Current Average Weight ─────────
    const comparisonChartData = useMemo(() => {
        const getAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        if (weighSessions.length === 0) {
            return { noData: true, labels: [] as string[], datasets: [{ data: [0] }] };
        }

        if (timeframe === 'Days') {
            const dateMap = new Map<string, number[]>();
            weighSessions.forEach(s => {
                const key = s.recorded_at.slice(0, 10);
                if (!dateMap.has(key)) dateMap.set(key, []);
                dateMap.get(key)!.push((s.net_weight_grams || 0) / 1000);
            });
            const sortedDates = Array.from(dateMap.keys()).sort();
            if (sortedDates.length < 2) {
                return { noData: true, labels: [] as string[], datasets: [{ data: [0] }] };
            }

            const daysToUse = sortedDates.slice(-6);
            const labels = daysToUse.map(d => {
                const parts = d.split('-');
                return parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
            });

            const currentAvgs = daysToUse.map(d => {
                const v = getAvg(dateMap.get(d)!);
                return v !== null ? parseFloat(v.toFixed(2)) : 0;
            });
            const prevAvgs = daysToUse.map((d, idx) => {
                if (idx === 0) return currentAvgs[0];
                const prevDay = daysToUse[idx - 1];
                const v = getAvg(dateMap.get(prevDay)!);
                return v !== null ? parseFloat(v.toFixed(2)) : currentAvgs[idx];
            });

            const zeroA = { data: Array(daysToUse.length).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false };
            return {
                noData: false, labels,
                datasets: [
                    { data: currentAvgs, color: () => colors.primary, strokeWidth: 3 },
                    { data: prevAvgs, color: () => '#F59E0B', strokeWidth: 2 },
                    zeroA,
                ],
            };
        } else {
            const arrival = selectedBatch?.arrival_date ? new Date(selectedBatch.arrival_date) : null;
            const weekMap = new Map<number, number[]>();
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
                if (!weekMap.has(weekIdx)) weekMap.set(weekIdx, []);
                weekMap.get(weekIdx)!.push((s.net_weight_grams || 0) / 1000);
            });
            const sortedWeeks = Array.from(weekMap.keys()).sort();
            if (sortedWeeks.length < 2) {
                return { noData: true, labels: [] as string[], datasets: [{ data: [0] }] };
            }

            const weeksToUse = sortedWeeks.slice(-6);
            const labels = weeksToUse.map(w => `W${w}`);
            const currentAvgs = weeksToUse.map(w => {
                const v = getAvg(weekMap.get(w)!);
                return v !== null ? parseFloat(v.toFixed(2)) : 0;
            });
            const prevAvgs = weeksToUse.map((w, idx) => {
                if (idx === 0) return currentAvgs[0];
                const prevWeek = weeksToUse[idx - 1];
                const v = getAvg(weekMap.get(prevWeek)!);
                return v !== null ? parseFloat(v.toFixed(2)) : currentAvgs[idx];
            });

            const zeroA = { data: Array(weeksToUse.length).fill(0), color: () => 'transparent', strokeWidth: 0, withDots: false };
            return {
                noData: false, labels,
                datasets: [
                    { data: currentAvgs, color: () => colors.primary, strokeWidth: 3 },
                    { data: prevAvgs, color: () => '#F59E0B', strokeWidth: 2 },
                    zeroA,
                ],
            };
        }
    }, [weighSessions, timeframe, colors, selectedBatch]);

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

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingOptionStr = selectedHousing ? selectedHousing.name : 'No House Selected';

    const batchesOptions = filteredBatches.map(b => b.name);
    const selectedBatchOptionStr = selectedBatch ? selectedBatch.name : 'No Batch Selected';

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} Growth
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
                {/* Intro Text & Day Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginRight: 16, marginTop: 0, marginBottom: 0 }]}>
                        Here are the growth statistics and analytics for your {animalType === 'pig' ? 'pigs' : 'chickens'}.
                    </Text>
                    {currentDay !== null && (
                        <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface, paddingHorizontal: 12 }]}>
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                                DAY
                            </Text>
                            <Text style={[textStyles.h1, { color: colors.primary, fontSize: 24, lineHeight: 28 }]}>
                                {currentDay}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Animal Type Segment Filter */}
                <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, padding: 4, marginBottom: 20 }}>
                    {(['pig', 'chicken'] as const).map(type => {
                        const isSelected = animalType === type;
                        return (
                            <TouchableOpacity
                                key={type}
                                onPress={() => setAnimalType(type)}
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
                                    {type === 'pig' ? 'Pigs' : 'Chickens'}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

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
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>
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
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>
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
                                            onPress={() => setSelectedTab(category)}
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
                                    <MaterialIcons name="pets" size={20} color={activeColor} />
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
                                        onPress={() => setTimeframe(tf)}
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
                                ) : (
                                <>
                                <LineChart
                                    data={lineChartData}
                                    width={width - (hPad * 2) - 18}
                                    height={240}
                                    yAxisLabel=""
                                    yAxisSuffix="kg"
                                    fromZero
                                    withDots={true}
                                    withInnerLines={true}
                                    withOuterLines={false}
                                    withVerticalLines={false}
                                    withHorizontalLines={true}
                                    onDataPointClick={({ x, y, value, index, dataset }) => {
                                        // skip transparent anchor dataset
                                        if (value === 0 && index === 0) return;
                                        const label = lineChartData.labels?.[index] ?? `#${index + 1}`;
                                        setGrowthTooltip(prev =>
                                            prev && prev.x === x && prev.y === y ? null : { x, y, value, label }
                                        );
                                    }}
                                    decorator={() => {
                                        if (!growthTooltip) return null;
                                        const { x, y, value, label } = growthTooltip;
                                        const tipW = 72;
                                        const tipH = 36;
                                        const offsetX = x + tipW + 8 > (width - hPad * 2 - 18) ? x - tipW - 6 : x - tipW / 2;
                                        const offsetY = y - tipH - 10 < 0 ? y + 8 : y - tipH - 8;
                                        return (
                                            <>
                                                <View style={{
                                                    position: 'absolute',
                                                    left: offsetX,
                                                    top: offsetY,
                                                    backgroundColor: colors.text,
                                                    borderRadius: 8,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    width: tipW,
                                                    alignItems: 'center',
                                                    shadowColor: '#000',
                                                    shadowOffset: { width: 0, height: 2 },
                                                    shadowOpacity: 0.25,
                                                    shadowRadius: 4,
                                                    elevation: 6,
                                                }}>
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.surface }}>{value.toFixed(2)} kg</Text>
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.surface, opacity: 0.75 }}>{label}</Text>
                                                </View>
                                            </>
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
                                )}
                            </View>
                        </View>

                        {/* Comparison Chart: Current vs Previous Reading */}
                        <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 0 }]}>Weight Comparison</Text>
                                <View style={{ backgroundColor: '#F59E0B1A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: '#F59E0B' }}>vs Previous Read</Text>
                                </View>
                            </View>
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
                                marginBottom: 24,
                            }}>
                                {comparisonChartData.noData ? (
                                    <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                                        <MaterialIcons name="compare-arrows" size={40} color={colors.textGrey} />
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text, marginTop: 12 }}>There's no current logs</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, marginTop: 4, textAlign: 'center' }}>
                                            At least 2 recording sessions are needed to compare growth.
                                        </Text>
                                    </View>
                                ) : (
                                    <>
                                        <LineChart
                                            data={comparisonChartData}
                                            width={width - (hPad * 2) - 18}
                                            height={200}
                                            yAxisLabel=""
                                            yAxisSuffix="kg"
                                            fromZero
                                            withDots={true}
                                            withInnerLines={true}
                                            withOuterLines={false}
                                            withVerticalLines={false}
                                            withHorizontalLines={true}
                                            onDataPointClick={({ x, y, value, index }) => {
                                                const label = comparisonChartData.labels?.[index] ?? `#${index + 1}`;
                                                setCompTooltip(prev =>
                                                    prev && prev.x === x && prev.y === y ? null : { x, y, value, label }
                                                );
                                            }}
                                            decorator={() => {
                                                if (!compTooltip) return null;
                                                const { x, y, value, label } = compTooltip;
                                                const tipW = 72;
                                                const tipH = 36;
                                                const offsetX = x + tipW + 8 > (width - hPad * 2 - 18) ? x - tipW - 6 : x - tipW / 2;
                                                const offsetY = y - tipH - 10 < 0 ? y + 8 : y - tipH - 8;
                                                return (
                                                    <View style={{
                                                        position: 'absolute',
                                                        left: offsetX,
                                                        top: offsetY,
                                                        backgroundColor: colors.text,
                                                        borderRadius: 8,
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 5,
                                                        width: tipW,
                                                        alignItems: 'center',
                                                        shadowColor: '#000',
                                                        shadowOffset: { width: 0, height: 2 },
                                                        shadowOpacity: 0.25,
                                                        shadowRadius: 4,
                                                        elevation: 6,
                                                    }}>
                                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.surface }}>{value.toFixed(2)} kg</Text>
                                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.surface, opacity: 0.75 }}>{label}</Text>
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
                                        {/* Comparison legend */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingBottom: 10, paddingLeft: 16 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Current</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <View style={{ width: 24, height: 3, borderRadius: 1.5, backgroundColor: '#F59E0B' }} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Previous</Text>
                                            </View>
                                        </View>
                                    </>
                                )}
                            </View>
                        </>

                        <AIInsightCard
                            title="AniBot Insight"
                            staticContent={getGrowthAnalysis()}
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
                        setSelectedHousingId(matched.id);
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
                        setSelectedBatchId(matched.id);
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
        </SafeAreaView>
    );
}

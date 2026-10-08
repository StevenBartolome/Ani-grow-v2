import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

import { BackButton } from '@/components/BackButton';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { PrintReportButton } from '@/components/PrintReportButton';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import { AnimalIcon } from '@/components/AnimalIcon';
import { ReportDocument, ReportStat, ReportChart, formatReportUserRole, formatReportUserName } from '@/lib/pdfReport';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { getStandardForWeek } from '@/constants/growthStandards';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';

// ─── Types ──────────────────────────────────────────────────────────────────

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
    harvest_target_kg?: number | null;
    housings?: {
        farm_id?: string;
        farms?: { id?: string; name?: string } | null;
    } | null;
}

interface WeighSession {
    id: string;
    net_weight_grams: number;
    status: 'underweight' | 'normal' | 'overweight' | string;
    animal_type?: 'pig' | 'chicken';
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

interface HealthRecord {
    id: string;
    record_type: string;
    affected_count: number | null;
    record_date: string;
}

interface MilestonePoint {
    weight: number;
    dayOffset: number;
    dateStr: string;
    shortLabel: string;
    label: string;
    diff: number;
    targetPct: number;
    isTargetMet: boolean;
    gainFromNow: number;
}

// ─── Harvest targets ────────────────────────────────────────────────────────

const HARVEST_TARGET_KG: Record<string, number> = {
    pig: 95,      // Market-ready finisher pig (synced with web)
    chicken: 2.2, // Market-ready broiler chicken (synced with web)
};

function getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(d: Date | null | undefined): string {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLocalDateKey(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr.slice(0, 10);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (_) {
        return dateStr.slice(0, 10);
    }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PredictionReportScreen() {
    const { colors, isDark } = useTheme();
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
    const [weighingSessionEnvelopes, setWeighingSessionEnvelopes] = useState<WeighingSessionEnvelope[]>([]);
    const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);

    // ─── Custom Harvest Target (per-batch override synced with web) ─────────
    const [customTargetKg, setCustomTargetKg] = useState<number | null>(null);
    const [isSavingTarget, setIsSavingTarget] = useState(false);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [targetInputValue, setTargetInputValue] = useState<string>('');

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

    // ─── Shared Persistence Helper ───────────────────────────────────
    const saveSelectionPreference = useCallback(async (type: 'pig' | 'chicken', housingId: string | null, batchId: string | null) => {
        if (!farmId) return;
        try {
            let currentPref: any = { lastAnimalType: type };
            const rawPref = await AsyncStorage.getItem(`analytics_active_selection_${farmId}`);
            if (rawPref) {
                try {
                    currentPref = { ...JSON.parse(rawPref) };
                } catch {}
            }
            currentPref.lastAnimalType = type;
            currentPref[type] = {
                housingId,
                batchId,
            };
            currentPref.animalType = type;
            currentPref.housingId = housingId;
            currentPref.batchId = batchId;

            await AsyncStorage.setItem(
                `analytics_active_selection_${farmId}`,
                JSON.stringify(currentPref)
            );
        } catch (err) {
            console.warn('[PredictionReportScreen] Failed to save selection preference:', err);
        }
    }, [farmId]);

    // ─── Derived lists ───────────────────────────────────────────────────────
    const filteredHousings = useMemo(() => {
        return allHousings.filter(h => h.animal_type === animalType);
    }, [allHousings, animalType]);

    const selectedHousing = useMemo(() => {
        return allHousings.find(h => h.id === selectedHousingId) ?? null;
    }, [allHousings, selectedHousingId]);

    const filteredBatches = useMemo(() => {
        return allBatches.filter(b => b.housing_id === selectedHousingId);
    }, [allBatches, selectedHousingId]);

    const selectedBatch = useMemo(() => {
        return filteredBatches.find(b => b.id === selectedBatchId) ?? null;
    }, [filteredBatches, selectedBatchId]);

    const fetchBatchData = useCallback(async (batchId: string) => {
        setIsDataLoading(true);
        lastLoadedBatchIdRef.current = batchId;
        try {
            const [weighRes, envRes, healthRes] = await Promise.all([
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
                    .neq('status', 'in_progress')
                    .neq('status', 'cancelled')
                    .order('created_at', { ascending: true }),
                supabase
                    .from('health_records')
                    .select('id, record_type, affected_count, record_date')
                    .eq('batch_id', batchId)
                    .is('deleted_at', null),
            ]);

            setWeighSessions((weighRes.data || []) as WeighSession[]);
            setWeighingSessionEnvelopes((envRes.data || []) as WeighingSessionEnvelope[]);
            setHealthRecords((healthRes.data || []) as HealthRecord[]);
        } catch (err) {
            console.error('[PredictionReportScreen] error fetching batch data:', err);
        } finally {
            setIsDataLoading(false);
        }
    }, []);

    // ─── Data Fetching ───────────────────────────────────────────────────────
    const fetchReportMetadata = useCallback(async () => {
        if (!farmId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [housingsRes, batchesRes, farmRes, rawPref] = await Promise.all([
                supabase
                    .from('housings')
                    .select('id, name, animal_type, status, current_count, farm_id, farms(id, name)')
                    .eq('farm_id', farmId)
                    .ilike('status', 'Active')
                    .order('name', { ascending: true }),
                supabase
                    .from('batches')
                    .select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id, harvest_target_kg, housings!inner(farm_id, farms(id, name))')
                    .eq('housings.farm_id', farmId)
                    .ilike('status', 'active')
                    .order('arrival_date', { ascending: false }),
                supabase
                    .from('farms')
                    .select('name')
                    .eq('id', farmId)
                    .maybeSingle(),
                AsyncStorage.getItem(`analytics_active_selection_${farmId}`).catch(() => null),
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

            let savedPref: any = null;
            if (rawPref) {
                try {
                    savedPref = JSON.parse(rawPref);
                } catch {}
            }

            // An explicitly-requested batch wins outright.
            const requestedBatch = typeof requestedBatchId === 'string'
                ? batchesData.find(b => b.id === requestedBatchId)
                : undefined;
            if (requestedBatch) {
                const requestedHousing = housingsData.find(h => h.id === requestedBatch.housing_id);
                const reqType: 'pig' | 'chicken' = requestedHousing?.animal_type === 'chicken' ? 'chicken' : 'pig';
                if (requestedHousing) {
                    setAnimalType(reqType);
                    animalTypeRef.current = reqType;
                }
                setSelectedHousingId(requestedBatch.housing_id);
                setSelectedBatchId(requestedBatch.id);
                saveSelectionPreference(reqType, requestedBatch.housing_id, requestedBatch.id);
                await fetchBatchData(requestedBatch.id);
                setIsLoading(false);
                return;
            }

            let effectiveAnimalType: 'pig' | 'chicken' = 'pig';
            if (typeof type === 'string') {
                effectiveAnimalType = type.toLowerCase().includes('chicken') ? 'chicken' : 'pig';
            } else if (savedPref?.lastAnimalType === 'pig' || savedPref?.lastAnimalType === 'chicken') {
                effectiveAnimalType = savedPref.lastAnimalType;
            } else if (savedPref?.animalType === 'pig' || savedPref?.animalType === 'chicken') {
                effectiveAnimalType = savedPref.animalType;
            }

            setAnimalType(effectiveAnimalType);

            const filteredH = housingsData.filter(h => h.animal_type === effectiveAnimalType);
            let targetHousingId: string | null = null;
            let targetBatchId: string | null = null;

            const savedHousingForType = savedPref?.[effectiveAnimalType]?.housingId || (savedPref?.animalType === effectiveAnimalType ? savedPref?.housingId : null);
            if (savedHousingForType && filteredH.some(h => h.id === savedHousingForType)) {
                targetHousingId = savedHousingForType;
            } else if (filteredH.length > 0) {
                targetHousingId = filteredH[0].id;
            }

            setSelectedHousingId(targetHousingId);

            if (targetHousingId) {
                const filteredB = batchesData.filter(b => b.housing_id === targetHousingId);
                const savedBatchForType = savedPref?.[effectiveAnimalType]?.batchId || (savedPref?.animalType === effectiveAnimalType ? savedPref?.batchId : null);

                if (savedBatchForType && filteredB.some(b => b.id === savedBatchForType)) {
                    targetBatchId = savedBatchForType;
                } else if (filteredB.length > 0) {
                    targetBatchId = filteredB[0].id;
                }
                setSelectedBatchId(targetBatchId);

                if (targetBatchId) {
                    saveSelectionPreference(effectiveAnimalType, targetHousingId, targetBatchId);
                    await fetchBatchData(targetBatchId);
                } else {
                    setWeighSessions([]);
                    setWeighingSessionEnvelopes([]);
                    setHealthRecords([]);
                    lastLoadedBatchIdRef.current = null;
                }
            } else {
                setSelectedBatchId(null);
                setWeighSessions([]);
                setWeighingSessionEnvelopes([]);
                setHealthRecords([]);
                lastLoadedBatchIdRef.current = null;
            }
        } catch (err) {
            console.error('[PredictionReportScreen] error loading metadata:', err);
        } finally {
            setIsLoading(false);
        }
    }, [farmId, requestedBatchId, type, saveSelectionPreference, fetchBatchData]);

    const handleSwitchAnimalType = useCallback(async (type: 'pig' | 'chicken') => {
        if (type === animalType) return;
        setAnimalType(type);
        setForecastTooltip(null);

        let savedPref: any = null;
        if (farmId) {
            try {
                const rawPref = await AsyncStorage.getItem(`analytics_active_selection_${farmId}`);
                if (rawPref) savedPref = JSON.parse(rawPref);
            } catch {}
        }

        const targetHousings = allHousings.filter(h => h.animal_type === type);
        let nextHousingId: string | null = null;
        let nextBatchId: string | null = null;

        const savedHousingForType = savedPref?.[type]?.housingId;
        if (savedHousingForType && targetHousings.some(h => h.id === savedHousingForType)) {
            nextHousingId = savedHousingForType;
        } else if (targetHousings.length > 0) {
            nextHousingId = targetHousings[0].id;
        }
        setSelectedHousingId(nextHousingId);

        if (nextHousingId) {
            const targetBatches = allBatches.filter(b => b.housing_id === nextHousingId);
            const savedBatchForType = savedPref?.[type]?.batchId;

            if (savedBatchForType && targetBatches.some(b => b.id === savedBatchForType)) {
                nextBatchId = savedBatchForType;
            } else if (targetBatches.length > 0) {
                nextBatchId = targetBatches[0].id;
            }
            setSelectedBatchId(nextBatchId);

            if (nextBatchId) {
                fetchBatchData(nextBatchId);
            } else {
                setWeighSessions([]);
                setWeighingSessionEnvelopes([]);
                setHealthRecords([]);
                lastLoadedBatchIdRef.current = null;
            }
        } else {
            setSelectedBatchId(null);
            setWeighSessions([]);
            setWeighingSessionEnvelopes([]);
            setHealthRecords([]);
            lastLoadedBatchIdRef.current = null;
        }

        saveSelectionPreference(type, nextHousingId, nextBatchId);
    }, [animalType, allHousings, allBatches, farmId, fetchBatchData, saveSelectionPreference]);

    const handleSelectHousing = useCallback((housingId: string) => {
        if (housingId === selectedHousingId) return;
        setSelectedHousingId(housingId);
        setForecastTooltip(null);
        const targetBatches = allBatches.filter(b => b.housing_id === housingId);
        let nextBatchId: string | null = null;
        if (targetBatches.length > 0) {
            nextBatchId = targetBatches[0].id;
            setSelectedBatchId(nextBatchId);
            fetchBatchData(nextBatchId);
        } else {
            setSelectedBatchId(null);
            setWeighSessions([]);
            setWeighingSessionEnvelopes([]);
            setHealthRecords([]);
            lastLoadedBatchIdRef.current = null;
        }
        saveSelectionPreference(animalType, housingId, nextBatchId);
    }, [selectedHousingId, allBatches, fetchBatchData, saveSelectionPreference, animalType]);

    const handleSelectBatch = useCallback((batchId: string) => {
        if (batchId === selectedBatchId) return;
        setSelectedBatchId(batchId);
        setForecastTooltip(null);
        fetchBatchData(batchId);
        saveSelectionPreference(animalType, selectedHousingId, batchId);
    }, [selectedBatchId, fetchBatchData, saveSelectionPreference, animalType, selectedHousingId]);

    useEffect(() => { fetchReportMetadata(); }, [fetchReportMetadata]);

    // Load batch data when selectedBatchId changes
    useEffect(() => {
        if (selectedBatchId) {
            if (lastLoadedBatchIdRef.current !== selectedBatchId) {
                fetchBatchData(selectedBatchId);
            }
        } else {
            setWeighSessions([]);
            setWeighingSessionEnvelopes([]);
            setHealthRecords([]);
            lastLoadedBatchIdRef.current = null;
        }
    }, [selectedBatchId, fetchBatchData]);

    // Sync custom target weight when batch changes
    useEffect(() => {
        if (selectedBatch) {
            const saved = selectedBatch.harvest_target_kg != null ? Number(selectedBatch.harvest_target_kg) : null;
            setCustomTargetKg(saved);
            const defaultVal = HARVEST_TARGET_KG[animalType] ?? (animalType === 'pig' ? 95 : 2.2);
            setTargetInputValue(String(saved ?? defaultVal));
        } else {
            setCustomTargetKg(null);
            setTargetInputValue('');
        }
        setIsEditingTarget(false);
    }, [selectedBatch, animalType]);

    const saveHarvestTarget = useCallback(async (newTargetKg: number) => {
        if (!selectedBatchId) return;
        const clampedPig = { min: 50, max: 130 };
        const clampedChicken = { min: 0.5, max: 3.5 };
        const range = animalType === 'pig' ? clampedPig : clampedChicken;
        const clamped = Math.max(range.min, Math.min(range.max, parseFloat(newTargetKg.toFixed(2))));

        setIsSavingTarget(true);
        try {
            const { error } = await supabase
                .from('batches')
                .update({ harvest_target_kg: clamped })
                .eq('id', selectedBatchId);

            if (error) throw error;
            setCustomTargetKg(clamped);
            setTargetInputValue(String(clamped));
            setIsEditingTarget(false);
            setAllBatches(prev => prev.map(b => b.id === selectedBatchId ? { ...b, harvest_target_kg: clamped } : b));
        } catch (err) {
            console.error('[PredictionReportScreen] Failed to save harvest target:', err);
        } finally {
            setIsSavingTarget(false);
        }
    }, [selectedBatchId, animalType]);

    const resetToDefault = useCallback(async () => {
        if (!selectedBatchId) return;
        setIsSavingTarget(true);
        try {
            const { error } = await supabase
                .from('batches')
                .update({ harvest_target_kg: null })
                .eq('id', selectedBatchId);

            if (error) throw error;
            setCustomTargetKg(null);
            const def = HARVEST_TARGET_KG[animalType] ?? (animalType === 'pig' ? 95 : 2.2);
            setTargetInputValue(String(def));
            setIsEditingTarget(false);
            setAllBatches(prev => prev.map(b => b.id === selectedBatchId ? { ...b, harvest_target_kg: null } : b));
        } catch (err) {
            console.error('[PredictionReportScreen] Failed to reset harvest target:', err);
        } finally {
            setIsSavingTarget(false);
        }
    }, [selectedBatchId, animalType]);

    // Realtime listener
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
                    table: 'weighing_sessions',
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

    // ─── Current Age ────────────────────────────────────────────────────────
    const currentAgeDays = useMemo(() => {
        if (!selectedBatch?.arrival_date) return null;
        const arrival = new Date(selectedBatch.arrival_date);
        const now = new Date();
        arrival.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diff = Math.floor((now.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff) + (selectedBatch.age_at_arrival_days || 0);
    }, [selectedBatch]);

    // ─── Session Breakdown ──────────────────────────────────────────────────
    const sessionItems = useMemo(() => {
        if (weighSessions.length === 0) return [];

        if (weighingSessionEnvelopes.length > 0) {
            const activeEnvelopes = weighingSessionEnvelopes.filter(env => {
                if (env.status === 'in_progress' || env.status === 'cancelled') return false;
                const hasLinkedWeights = weighSessions.some(s => s.weighing_session_id === env.id);
                if (hasLinkedWeights) return true;
                const anyHasSessionId = weighSessions.some(s => !!s.weighing_session_id);
                if (!anyHasSessionId) {
                    return weighSessions.some(s => getLocalDateKey(s.recorded_at) === getLocalDateKey(env.created_at));
                }
                return false;
            });

            return activeEnvelopes.map((env, idx) => {
                const num = idx + 1;
                const ordinal = getOrdinal(num);
                let dateLabel = env.created_at ? env.created_at.slice(0, 10) : '';
                try {
                    const d = new Date(env.created_at);
                    if (!isNaN(d.getTime())) {
                        dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                } catch (_) {}

                const isLatest = idx === activeEnvelopes.length - 1;
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
                    dateKeys: [getLocalDateKey(env.created_at), env.created_at ? env.created_at.slice(0, 10) : ''],
                };
            });
        }

        const dateMap = new Map<string, typeof weighSessions>();
        weighSessions.forEach(s => {
            if (!s.recorded_at) return;
            const dateKey = getLocalDateKey(s.recorded_at);
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

    const sessionStatsList = useMemo(() => {
        if (sessionItems.length === 0 || weighSessions.length === 0) return [];

        return sessionItems.map(item => {
            const matchingSessions = weighSessions.filter(s => {
                if (s.weighing_session_id && item.sessionIds?.includes(s.weighing_session_id)) {
                    return true;
                }
                const dk = s.recorded_at ? getLocalDateKey(s.recorded_at) : '';
                return item.dateKeys?.includes(dk);
            });

            const totalCount = matchingSessions.length;
            const totalWeightGrams = matchingSessions.reduce((sum, s) => sum + (s.net_weight_grams || 0), 0);
            const avgWeightKg = totalCount > 0 ? (totalWeightGrams / totalCount) / 1000 : 0;

            return {
                ...item,
                totalCount,
                avgWeightKg,
            };
        });
    }, [sessionItems, weighSessions]);

    // ─── Standard Growth Benchmark Fallback ──────────────────────────────────
    const currentWeekNumber = useMemo(() => {
        const safeAge = Math.max(1, currentAgeDays || (animalType === 'pig' ? 60 : 20));
        return Math.max(1, Math.min(24, Math.ceil(safeAge / 7)));
    }, [currentAgeDays, animalType]);

    const benchmarkWeightKg = useMemo(() => {
        const std = getStandardForWeek(animalType, currentWeekNumber);
        return (std.target_weight_grams || 0) / 1000;
    }, [animalType, currentWeekNumber]);

    const benchmarkAdgKg = useMemo(() => {
        const currentStd = getStandardForWeek(animalType, currentWeekNumber);
        const nextStd = getStandardForWeek(animalType, Math.min(24, currentWeekNumber + 1));
        const weeklyDiffGrams = (nextStd.target_weight_grams || 0) - (currentStd.target_weight_grams || 0);
        if (weeklyDiffGrams > 0) {
            return weeklyDiffGrams / 7 / 1000;
        }
        return animalType === 'pig' ? 0.75 : 0.065;
    }, [animalType, currentWeekNumber]);

    // ─── Live Weight Computations ────────────────────────────────────────────
    const latestSession = useMemo(() => {
        return sessionStatsList.length > 0 ? sessionStatsList[sessionStatsList.length - 1] : null;
    }, [sessionStatsList]);

    const latestAvgWeightKg = useMemo(() => {
        if (latestSession && latestSession.avgWeightKg > 0) {
            return latestSession.avgWeightKg;
        }
        if (weighSessions.length > 0) {
            const total = weighSessions.reduce((sum, w) => sum + (w.net_weight_grams || 0), 0);
            return total / weighSessions.length / 1000;
        }
        return null;
    }, [latestSession, weighSessions]);

    const effectiveBaseWeightKg = useMemo(() => {
        return latestAvgWeightKg;
    }, [latestAvgWeightKg]);

    // ─── Robust Average Daily Gain (ADG) Computation ────────────────────────
    const { dailyGainKg, isBenchmarkGain } = useMemo(() => {
        if (latestAvgWeightKg === null) {
            return { dailyGainKg: null, isBenchmarkGain: false };
        }

        if (sessionStatsList.length >= 2) {
            const first = sessionStatsList[0];
            const latest = sessionStatsList[sessionStatsList.length - 1];

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

            const totalGainKg = latest.avgWeightKg - first.avgWeightKg;
            const rawAdgKg = totalDays > 0 ? totalGainKg / totalDays : 0;
            const minRealistic = animalType === 'pig' ? 0.20 : 0.020;
            const maxRealistic = animalType === 'pig' ? 1.50 : 0.150;

            if (totalDays >= 2 && rawAdgKg >= minRealistic && rawAdgKg <= maxRealistic) {
                return { dailyGainKg: rawAdgKg, isBenchmarkGain: false };
            }
        }

        return { dailyGainKg: benchmarkAdgKg, isBenchmarkGain: true };
    }, [sessionStatsList, animalType, benchmarkAdgKg, latestAvgWeightKg]);

    // Effective harvest target: custom DB value > biological default
    const harvestTargetKg = customTargetKg
        ?? HARVEST_TARGET_KG[animalType]
        ?? (animalType === 'pig' ? 95 : 2.2);

    // ─── Days to Harvest Calculation ────────────────────────────────────────
    const readySession = useMemo(() => {
        return sessionStatsList.find(s => s.avgWeightKg >= harvestTargetKg) || null;
    }, [sessionStatsList, harvestTargetKg]);

    const { daysToHarvest, estimatedHarvestDate, isHarvestReady } = useMemo(() => {
        if (effectiveBaseWeightKg === null || dailyGainKg === null) {
            return { daysToHarvest: null, estimatedHarvestDate: null, isHarvestReady: false };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Case 1: Session achieved target weight
        if (readySession && readySession.dateKeys?.[0]) {
            const [y, m, d] = readySession.dateKeys[0].split('-').map(Number);
            const targetAchievedDate = new Date(y, m - 1, d);
            return {
                daysToHarvest: 0,
                estimatedHarvestDate: targetAchievedDate,
                isHarvestReady: true
            };
        }

        // Case 2: Project from the latest scale reading date
        const baseDateKey = latestSession?.dateKeys?.[0];
        let baseDate: Date;
        if (baseDateKey) {
            const [y, m, d] = baseDateKey.split('-').map(Number);
            baseDate = new Date(y, m - 1, d);
        } else {
            baseDate = new Date(today);
        }

        const remainingKg = Math.max(0, harvestTargetKg - effectiveBaseWeightKg);
        if (remainingKg <= 0) {
            return {
                daysToHarvest: 0,
                estimatedHarvestDate: baseDate,
                isHarvestReady: true
            };
        }

        const effectiveGain = Math.max(animalType === 'pig' ? 0.35 : 0.03, dailyGainKg);
        const daysNeededFromBase = Math.ceil(remainingKg / effectiveGain);
        const projectedDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + daysNeededFromBase);

        const diffDays = Math.round((projectedDate.getTime() - today.getTime()) / 86400000);
        if (diffDays <= 0) {
            return {
                daysToHarvest: 0,
                estimatedHarvestDate: projectedDate,
                isHarvestReady: true
            };
        }

        return {
            daysToHarvest: diffDays,
            estimatedHarvestDate: projectedDate,
            isHarvestReady: false
        };
    }, [effectiveBaseWeightKg, dailyGainKg, readySession, harvestTargetKg, latestSession, animalType]);

    const harvestFulfilledDateStr = useMemo(() => {
        if (readySession?.dateLabel) return readySession.dateLabel;
        if (estimatedHarvestDate) {
            return estimatedHarvestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }, [readySession, estimatedHarvestDate]);

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

    // Feed Stage
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

    // ─── Dynamic Forecast Trajectory Data (Synced 1:1 with Web) ─────────────
    const forecastChartData = useMemo(() => {
        if (effectiveBaseWeightKg === null || dailyGainKg === null) {
            return {
                labels: [],
                datasets: [{ data: [0], color: () => colors.prediction ?? '#8B5CF6', strokeWidth: 3 }],
                detailedPoints: [],
                stepDays: 0,
                hasData: false,
                projectedData: [],
                targetLine: [],
            };
        }

        const baseWeight = effectiveBaseWeightKg;
        const gainPerDay = Math.max(animalType === 'pig' ? 0.35 : 0.03, dailyGainKg);
        const remainingKg = Math.max(0, harvestTargetKg - baseWeight);
        const harvestDays = daysToHarvest ?? (remainingKg <= 0 ? 0 : Math.ceil(remainingKg / gainPerDay));

        const predictionColor = colors.prediction ?? '#8B5CF6';

        // Cohort is already at or past harvest target weight
        if (harvestDays === 0 || remainingKg <= 0) {
            const readyDate = estimatedHarvestDate ?? new Date();
            const dateStr = readyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const diff = parseFloat((baseWeight - harvestTargetKg).toFixed(2));
            const targetPct = Math.max(100, Math.round((baseWeight / harvestTargetKg) * 100));
            const singlePoint: MilestonePoint = {
                weight: parseFloat(baseWeight.toFixed(2)),
                dayOffset: 0,
                dateStr,
                shortLabel: 'Ready',
                label: `Ready (${dateStr}) - Market Ready`,
                diff,
                targetPct,
                isTargetMet: true,
                gainFromNow: 0,
            };
            return {
                labels: ['Ready'],
                datasets: [
                    { data: [parseFloat(baseWeight.toFixed(2))], color: () => '#10B981', strokeWidth: 3 },
                    { data: [harvestTargetKg], color: () => '#EF4444', strokeWidth: 1.5, withDots: false },
                ],
                detailedPoints: [singlePoint],
                stepDays: 0,
                hasData: true,
                projectedData: [parseFloat(baseWeight.toFixed(2))],
                targetLine: [harvestTargetKg],
            };
        }

        const targetEndDay = harvestDays;

        let stepCount: number;
        if (targetEndDay <= 3) {
            stepCount = 1;
        } else if (targetEndDay <= 7) {
            stepCount = 2;
        } else if (targetEndDay <= 14) {
            stepCount = 3;
        } else if (targetEndDay <= 28) {
            stepCount = 4;
        } else if (targetEndDay <= 45) {
            stepCount = 5;
        } else {
            stepCount = 6;
        }

        const dayOffsets: number[] = [0];
        for (let i = 1; i < stepCount; i++) {
            const offset = Math.round((i * targetEndDay) / stepCount);
            if (offset > dayOffsets[dayOffsets.length - 1] && offset < targetEndDay) {
                dayOffsets.push(offset);
            }
        }
        if (!dayOffsets.includes(targetEndDay)) {
            dayOffsets.push(targetEndDay);
        }

        const detailedPoints: MilestonePoint[] = dayOffsets.map((offset, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === dayOffsets.length - 1;

            const d = new Date();
            d.setDate(d.getDate() + offset);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            let weight: number;
            if (isFirst) {
                weight = parseFloat(baseWeight.toFixed(2));
            } else if (isLast) {
                weight = harvestTargetKg;
            } else {
                const calcWeight = baseWeight + offset * gainPerDay;
                weight = parseFloat(Math.min(harvestTargetKg, calcWeight).toFixed(2));
            }

            const isTargetMet = weight >= harvestTargetKg;
            const diff = parseFloat((weight - harvestTargetKg).toFixed(2));
            const targetPct = Math.min(100, Math.round((weight / harvestTargetKg) * 100));
            const gainFromNow = parseFloat((weight - baseWeight).toFixed(2));

            let shortLabel: string;
            let label: string;

            if (isFirst) {
                shortLabel = 'Today';
                label = `Today (${dateStr})`;
            } else if (isLast) {
                shortLabel = `+${offset}d (Harvest)`;
                label = `Harvest Target (+${offset}d, ${dateStr})`;
            } else {
                shortLabel = `+${offset}d`;
                label = `+${offset}d (${dateStr})`;
            }

            return {
                weight,
                dayOffset: offset,
                dateStr,
                shortLabel,
                label,
                diff,
                targetPct,
                isTargetMet,
                gainFromNow,
            };
        });

        const labels = detailedPoints.map((p, idx) => idx === 0 ? 'Today' : p.dateStr);
        const projectedData = detailedPoints.map(p => p.weight);
        const targetLine = detailedPoints.map(() => harvestTargetKg);
        const stepDays = dayOffsets.length > 1 ? Math.round(targetEndDay / (dayOffsets.length - 1)) : 0;

        return {
            labels,
            datasets: [
                { data: projectedData, color: () => predictionColor, strokeWidth: 3 },
                { data: targetLine, color: () => '#EF4444', strokeWidth: 1.5, withDots: false },
            ],
            detailedPoints,
            stepDays,
            hasData: gainPerDay > 0 || baseWeight > 0,
            projectedData,
            targetLine,
        };
    }, [effectiveBaseWeightKg, dailyGainKg, harvestTargetKg, daysToHarvest, estimatedHarvestDate, animalType, colors]);

    // Friendly Forecast Milestones Timeline
    const forecastMilestones = useMemo(() => {
        return forecastChartData.detailedPoints || [];
    }, [forecastChartData]);

    // ─── Factor Analysis (What is happening & what to expect) ───────────────
    const factorAnalysis = useMemo(() => {
        if (!selectedBatch || effectiveBaseWeightKg === null || dailyGainKg === null) return null;

        const currentWeightKg = effectiveBaseWeightKg;
        const gainGrams = Math.round(dailyGainKg * 1000);
        const isTargetMet = currentWeightKg >= harvestTargetKg;
        const remainingKg = Math.max(0, harvestTargetKg - currentWeightKg);

        // 1. Growth & Gain factor
        let growthHeading = isTargetMet ? 'Market-Ready Weight Reached' : 'Active Growth Velocity';
        let growthText = '';
        if (isTargetMet) {
            growthText = `The cohort has achieved an average of ${currentWeightKg.toFixed(2)} kg, fulfilling the commercial harvest standard of ${harvestTargetKg} kg. Animals are in prime selling condition. Continuing feed without harvest increases feed conversion cost (FCR) with diminishing daily returns.`;
        } else if (dailyGainKg > 0) {
            const weeklyGainKg = (dailyGainKg * 7).toFixed(2);
            growthText = `Animals are gaining approximately ${gainGrams} g/day (+${weeklyGainKg} kg/week)${isBenchmarkGain ? ' based on standard breed growth curves' : ' based on recent weighings'}. With ${remainingKg.toFixed(2)} kg remaining to reach ${harvestTargetKg} kg, the cohort is following an active, healthy growth curve.`;
        } else {
            growthText = `Current average weight is ${currentWeightKg.toFixed(2)} kg. Record additional weigh sessions across separate days to calculate the active daily growth rate.`;
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
        let healthHeading = survNum >= 95 ? 'Strong Cohort Uniformity & Health' : 'Cohort Health & Uniformity';
        let healthText = '';
        if (survNum >= 95) {
            healthText = `${animalType === 'pig' ? 'Herd' : 'Flock'} survival rate is excellent at ${survivalRate}% with ${selectedBatch.current_count} active animals. High survival correlates with even uniformity, meaning the vast majority of animals will hit target harvest weight together for single-haul selling.`;
        } else {
            healthText = `Survival rate is ${survivalRate}%. Monitor animal activity at feeders and check water lines. Slower-growing animals may benefit from temporary segregation or additional feeder space.`;
        }

        // 4. Housing & Environment factor
        let envHeading = animalType === 'chicken' ? 'Ventilation & Heat Management' : 'Barn Climate & Comfort';
        let envText = '';
        if (animalType === 'chicken') {
            if (currentWeightKg >= 2.0) {
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
            actionRecommendation = 'Harvest Window Open: The cohort has met commercial weight. Plan harvest and market transport within the next 2–5 days to maximize feed-to-profit conversion.';
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
    }, [selectedBatch, effectiveBaseWeightKg, dailyGainKg, isBenchmarkGain, harvestTargetKg, currentAgeDays, currentFeedStage, animalType, survivalRate, daysToHarvest, estimatedHarvestDate]);

    // ─── Confidence score ──────────────────────────────────────────────────
    const confidencePct = useMemo(() => {
        if (effectiveBaseWeightKg === null || weighSessions.length === 0) return 0;
        const base = Math.min(95, 60 + sessionStatsList.length * 10);
        return base;
    }, [effectiveBaseWeightKg, weighSessions, sessionStatsList]);

    // ─── AI Insight text ────────────────────────────────────────────────────
    const getInsightText = () => {
        if (!selectedBatch) return 'Select a batch to view AI predictions.';
        if (effectiveBaseWeightKg === null) {
            return `"${selectedBatch.name}" does not have any recorded scale weights yet. Conduct an initial weighing session using the AniWeigh scale to generate real-time growth curves, calculate average daily gain (ADG), and unlock harvest predictions.`;
        }
        const currentStr = effectiveBaseWeightKg.toFixed(2);
        const gainStr = dailyGainKg !== null ? dailyGainKg.toFixed(3) : '—';

        let insight = `"${selectedBatch.name}" is tracking at an average weight of ${currentStr} kg with an estimated gain of ${gainStr} kg/day (${isBenchmarkGain ? 'breed standard' : 'actual recorded ADG'}). `;

        if (daysToHarvest === 0) {
            insight += `This batch has reached or exceeded the ${harvestTargetKg} kg market harvest target — schedule harvest or sales preparation soon.`;
        } else if (daysToHarvest !== null) {
            const harvestDateStr = estimatedHarvestDate
                ? estimatedHarvestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—';
            insight += `Projected to reach the ${harvestTargetKg} kg harvest target in approximately ${daysToHarvest} days (around ${harvestDateStr}). `;
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
            { label: 'Avg Weight', value: effectiveBaseWeightKg !== null ? `${effectiveBaseWeightKg.toFixed(2)} kg` : 'No scale recordings' },
            { label: 'Daily Gain', value: dailyGainKg !== null ? `${dailyGainKg.toFixed(3)} kg/day (${isBenchmarkGain ? 'Benchmark' : 'Actual'})` : 'No scale recordings' },
            { label: 'Harvest Target', value: `${harvestTargetKg} kg${customTargetKg ? ' (Custom)' : ' (Standard)'}` },
            { label: 'Prediction Confidence', value: `${confidencePct}%` },
        ];

        const harvestStats: ReportStat[] = [
            { label: 'Days To Harvest', value: daysToHarvest !== null ? (daysToHarvest === 0 ? 'Harvest Ready' : `${daysToHarvest} days`) : 'Pending initial weighing', accent: daysToHarvest === 0 ? 'good' : undefined },
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

        const trajectoryChart: ReportChart | undefined = forecastChartData.detailedPoints.length > 0 ? {
            type: 'line',
            title: `Projected Growth Trajectory Milestones (${daysToHarvest !== null && daysToHarvest > 0 ? `${daysToHarvest}d to Harvest` : 'Market Ready'})`,
            labels: forecastChartData.detailedPoints.map(p => p.label),
            series: [
                {
                    name: 'Projected Weight (kg)',
                    data: forecastChartData.detailedPoints.map(p => Math.round(p.weight * 100) / 100),
                    color: '#16492a',
                },
                {
                    name: 'Harvest Target (kg)',
                    data: forecastChartData.detailedPoints.map(() => harvestTargetKg),
                    color: '#e74c3c',
                },
            ],
            unit: 'kg',
            yAxisLabel: 'Live Weight (kg)',
        } : undefined;

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
                { label: 'Harvest Target', value: `${harvestTargetKg} kg${customTargetKg ? ' (Custom)' : ' (Standard)'}` },
            ],
            sections: [
                { heading: 'Current Growth Status', stats: growthStats },
                { heading: 'Harvest Prediction', stats: harvestStats, paragraphs: [getInsightText()] },
                ...(!isHarvestReady ? [{
                    heading: `Projected Growth Trajectory Milestones (${daysToHarvest !== null && daysToHarvest > 0 ? `${daysToHarvest}d to Harvest` : 'Market Ready'})`,
                    chart: trajectoryChart,
                    table: {
                        headers: ['Timeline Milestone', 'Projected Weight', 'Target Weight', 'Variance to Target'],
                        rows: projectionRows,
                        note: isBenchmarkGain ? 'Projection utilizes standard commercial breed growth curves and targets.' : undefined,
                    },
                }] : []),
            ],
            generatedByName: formatReportUserName(profile),
            generatedByRole: formatReportUserRole(profile?.role),
        };
    }, [selectedBatch, selectedHousing, animalType, currentAgeDays, effectiveBaseWeightKg, dailyGainKg, isBenchmarkGain, harvestTargetKg, customTargetKg, confidencePct, daysToHarvest, estimatedHarvestDate, isHarvestReady, survivalRate, totalDeceased, forecastChartData, currentFeedStage, farmName, profile, managedFarms, selectedFarmIds, activeFarmIds, farmId]);

    const activeColor = animalType === 'pig' ? (colors.pig ?? '#EC4899') : (colors.chicken ?? '#F97316');
    const predictionColor = colors.prediction ?? '#8B5CF6';

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

            {isLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
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
                            backgroundColor: predictionColor + '15',
                            borderWidth: 1,
                            borderColor: predictionColor + '30',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 20,
                            flexShrink: 0,
                        }}>
                            <MaterialIcons name="psychology" size={16} color={predictionColor} />
                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: predictionColor }}>
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
                    {isDataLoading ? (
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
                            {/* ── Key Prediction Metrics Grid ─────────────────────────── */}
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
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: activeColor, textTransform: 'uppercase' }}>Avg Weight</Text>
                                        <AniWeighIcon size={16} />
                                    </View>
                                    <Text style={[textStyles.h1, { fontSize: 22, color: activeColor }]}>
                                        {latestAvgWeightKg !== null ? `${latestAvgWeightKg.toFixed(2)} kg` : '—'}
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                        {latestSession
                                            ? `Latest (${Math.min(5, weighSessions.length)} sessions)`
                                            : weighSessions.length > 0
                                                ? `Across ${weighSessions.length} logs`
                                                : '(no scale data)'}
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
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: '#27AE60', textTransform: 'uppercase' }}>ADG</Text>
                                        <MaterialIcons name="trending-up" size={16} color="#27AE60" />
                                    </View>
                                    <Text style={[textStyles.h1, { fontSize: 22, color: '#27AE60' }]}>
                                        {dailyGainKg !== null ? `${dailyGainKg.toFixed(3)} kg` : '—'}
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                        {dailyGainKg !== null ? 'Per animal / day' : 'Awaiting weighings'}
                                    </Text>
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
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: predictionColor, textTransform: 'uppercase' }}>To Harvest</Text>
                                        <MaterialIcons name="event" size={16} color={predictionColor} />
                                    </View>
                                    <Text style={[textStyles.h1, { fontSize: 22, color: predictionColor }]}>
                                        {daysToHarvest === null ? '—' : daysToHarvest === 0 ? 'Ready' : `${daysToHarvest}d`}
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                        Target: {harvestTargetKg} kg{customTargetKg ? ' (custom)' : ''}
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
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: survivalRate !== null && parseFloat(survivalRate) >= 90 ? '#27AE60' : '#EF4444', textTransform: 'uppercase' }}>Survival</Text>
                                        <MaterialIcons name="favorite" size={16} color={survivalRate !== null && parseFloat(survivalRate) >= 90 ? '#27AE60' : '#EF4444'} />
                                    </View>
                                    <Text style={[textStyles.h1, { fontSize: 22, color: survivalRate !== null && parseFloat(survivalRate) >= 90 ? '#27AE60' : '#EF4444' }]}>
                                        {survivalRate !== null ? `${survivalRate}%` : '—'}
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                        {selectedBatch ? `${selectedBatch.current_count}/${selectedBatch.estimated_count} heads` : '—'}
                                    </Text>
                                </View>
                            </View>

                            {/* ── ESTIMATED HARVEST DATE BANNER (With Target Weight Customizer) ── */}
                            {(estimatedHarvestDate !== null || selectedBatch !== null) && (
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF',
                                    borderWidth: 1.5,
                                    borderColor: predictionColor + '35',
                                    borderRadius: 16,
                                    padding: 16,
                                    marginBottom: 24,
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: predictionColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                                            <MaterialIcons name="calendar-today" size={22} color={predictionColor} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 11, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                Estimated Harvest Date
                                            </Text>
                                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 19, marginTop: 2 }]}>
                                                {effectiveBaseWeightKg === null
                                                    ? 'Awaiting Initial Weighing Session'
                                                    : daysToHarvest === 0
                                                        ? 'Harvest Ready Now'
                                                        : estimatedHarvestDate
                                                            ? formatDate(estimatedHarvestDate)
                                                            : 'Awaiting weigh-in data'}
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11.5, color: colors.textGrey, marginTop: 2 }}>
                                                {effectiveBaseWeightKg === null
                                                    ? 'Log live animal weights to generate an accurate, data-driven harvest forecast.'
                                                    : currentAgeDays !== null
                                                        ? `Current batch age: Day ${currentAgeDays}${currentFeedStage ? ` · ${currentFeedStage} stage` : ''}`
                                                        : ''}
                                            </Text>

                                            {/* Inline Target Weight Editor */}
                                            {selectedBatch && (
                                                <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                    {!isEditingTarget ? (
                                                        <>
                                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey }}>
                                                                Harvest target:{' '}
                                                                <Text style={{ fontFamily: 'Poppins-Bold', color: customTargetKg ? predictionColor : colors.text }}>
                                                                    {harvestTargetKg} kg
                                                                </Text>
                                                            </Text>
                                                            {customTargetKg ? (
                                                                <View style={{ backgroundColor: predictionColor + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                                                    <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 10, color: predictionColor }}>Custom</Text>
                                                                </View>
                                                            ) : (
                                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey }}>(Standard)</Text>
                                                            )}
                                                            <TouchableOpacity
                                                                onPress={() => {
                                                                    setIsEditingTarget(true);
                                                                    setTargetInputValue(String(harvestTargetKg));
                                                                }}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    backgroundColor: predictionColor + '15',
                                                                    borderWidth: 1,
                                                                    borderColor: predictionColor + '30',
                                                                    paddingHorizontal: 8,
                                                                    paddingVertical: 3,
                                                                    borderRadius: 6,
                                                                }}
                                                            >
                                                                <MaterialIcons name="edit" size={13} color={predictionColor} />
                                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: predictionColor }}>Edit</Text>
                                                            </TouchableOpacity>
                                                        </>
                                                    ) : (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.textGrey }}>Target:</Text>
                                                            <TouchableOpacity
                                                                onPress={() => {
                                                                    const step = animalType === 'pig' ? 1 : 0.1;
                                                                    const min = animalType === 'pig' ? 50 : 0.5;
                                                                    const cur = parseFloat(targetInputValue) || harvestTargetKg;
                                                                    const nextVal = Math.max(min, parseFloat((cur - step).toFixed(1)));
                                                                    setTargetInputValue(String(nextVal));
                                                                }}
                                                                style={{
                                                                    width: 28, height: 28, borderRadius: 8,
                                                                    borderWidth: 1.5, borderColor: colors.stroke,
                                                                    backgroundColor: predictionColor + '12',
                                                                    alignItems: 'center', justifyContent: 'center',
                                                                }}
                                                            >
                                                                <MaterialIcons name="remove" size={16} color={predictionColor} />
                                                            </TouchableOpacity>
                                                            <TextInput
                                                                value={targetInputValue}
                                                                onChangeText={setTargetInputValue}
                                                                keyboardType="numeric"
                                                                style={{
                                                                    width: 64,
                                                                    paddingVertical: 3,
                                                                    paddingHorizontal: 6,
                                                                    borderRadius: 8,
                                                                    borderWidth: 1.5,
                                                                    borderColor: predictionColor,
                                                                    backgroundColor: colors.surface,
                                                                    color: colors.text,
                                                                    fontSize: 13,
                                                                    fontFamily: 'Poppins-Bold',
                                                                    textAlign: 'center',
                                                                }}
                                                            />
                                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 12, color: colors.textGrey }}>kg</Text>
                                                            <TouchableOpacity
                                                                onPress={() => {
                                                                    const step = animalType === 'pig' ? 1 : 0.1;
                                                                    const max = animalType === 'pig' ? 130 : 3.5;
                                                                    const cur = parseFloat(targetInputValue) || harvestTargetKg;
                                                                    const nextVal = Math.min(max, parseFloat((cur + step).toFixed(1)));
                                                                    setTargetInputValue(String(nextVal));
                                                                }}
                                                                style={{
                                                                    width: 28, height: 28, borderRadius: 8,
                                                                    borderWidth: 1.5, borderColor: colors.stroke,
                                                                    backgroundColor: predictionColor + '12',
                                                                    alignItems: 'center', justifyContent: 'center',
                                                                }}
                                                            >
                                                                <MaterialIcons name="add" size={16} color={predictionColor} />
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                onPress={() => {
                                                                    const val = parseFloat(targetInputValue);
                                                                    if (!isNaN(val) && val > 0) saveHarvestTarget(val);
                                                                }}
                                                                disabled={isSavingTarget}
                                                                style={{
                                                                    paddingHorizontal: 10,
                                                                    paddingVertical: 5,
                                                                    borderRadius: 8,
                                                                    backgroundColor: predictionColor,
                                                                    opacity: isSavingTarget ? 0.6 : 1,
                                                                }}
                                                            >
                                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: '#FFFFFF' }}>
                                                                    {isSavingTarget ? 'Saving...' : 'Save'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                onPress={() => {
                                                                    setIsEditingTarget(false);
                                                                    setTargetInputValue(String(harvestTargetKg));
                                                                }}
                                                                disabled={isSavingTarget}
                                                                style={{
                                                                    paddingHorizontal: 8,
                                                                    paddingVertical: 5,
                                                                    borderRadius: 8,
                                                                    borderWidth: 1,
                                                                    borderColor: colors.stroke,
                                                                }}
                                                            >
                                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 12, color: colors.textGrey }}>Cancel</Text>
                                                            </TouchableOpacity>
                                                            {customTargetKg !== null && (
                                                                <TouchableOpacity
                                                                    onPress={resetToDefault}
                                                                    disabled={isSavingTarget}
                                                                    style={{
                                                                        paddingHorizontal: 8,
                                                                        paddingVertical: 5,
                                                                        borderRadius: 8,
                                                                        borderWidth: 1,
                                                                        borderColor: '#EF444440',
                                                                    }}
                                                                >
                                                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: '#EF4444' }}>Reset standard</Text>
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* ── DEDICATED MARKET-READY SHOWCASE CARD (When Target Met) ── */}
                            {isHarvestReady && (
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                                    borderWidth: 1.5,
                                    borderColor: '#10B98140',
                                    borderRadius: 18,
                                    padding: 20,
                                    marginBottom: 24,
                                }}>
                                    {/* Top Tag & Status */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                        <View style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 6,
                                            backgroundColor: '#10B98120',
                                            borderColor: '#10B98140',
                                            borderWidth: 1,
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 20,
                                        }}>
                                            <MaterialIcons name="verified" size={15} color="#10B981" />
                                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 11, color: '#10B981', textTransform: 'uppercase' }}>
                                                Ready for Harvest
                                            </Text>
                                        </View>
                                        <View style={{ backgroundColor: '#10B98118', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#10B98135' }}>
                                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 11, color: '#10B981' }}>
                                                100% Target Weight Fulfilled
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Hero Section */}
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                                        <View style={{
                                            width: 54,
                                            height: 54,
                                            borderRadius: 27,
                                            backgroundColor: '#10B98122',
                                            borderWidth: 2,
                                            borderColor: '#10B98145',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            <MaterialIcons name="task-alt" size={32} color="#10B981" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[textStyles.h2, { fontSize: 18, color: colors.text, marginBottom: 4 }]}>
                                                Batch is Ready for Harvest!
                                            </Text>
                                            <Text style={[textStyles.body, { fontSize: 13, color: colors.textGrey, lineHeight: 19 }]}>
                                                <Text style={{ fontFamily: 'Poppins-Bold' }}>{selectedBatch?.name}</Text> has achieved an average weight of{' '}
                                                <Text style={{ fontFamily: 'Poppins-Bold', color: '#10B981' }}>{effectiveBaseWeightKg?.toFixed(2)} kg</Text>, successfully meeting and exceeding the target weight of{' '}
                                                <Text style={{ fontFamily: 'Poppins-Bold' }}>{harvestTargetKg.toFixed(2)} kg</Text>. The cohort is in optimal market-ready condition for sales.
                                            </Text>
                                        </View>
                                    </View>

                                    {/* 4 Stat Highlights Grid */}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                                        {/* Current Avg Weight */}
                                        <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="scale" size={16} color="#10B981" />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textTransform: 'uppercase' }}>Avg Weight</Text>
                                            </View>
                                            <Text style={[textStyles.h2, { fontSize: 19, color: '#10B981' }]}>
                                                {effectiveBaseWeightKg?.toFixed(2)} <Text style={{ fontSize: 12 }}>kg</Text>
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 10, color: '#10B981', marginTop: 2 }}>
                                                +{Math.max(0, (effectiveBaseWeightKg ?? 0) - harvestTargetKg).toFixed(2)} kg over target
                                            </Text>
                                        </View>

                                        {/* Harvest Target */}
                                        <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="flag" size={16} color={colors.primary} />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textTransform: 'uppercase' }}>Target</Text>
                                            </View>
                                            <Text style={[textStyles.h2, { fontSize: 19, color: colors.text }]}>
                                                {harvestTargetKg.toFixed(2)} <Text style={{ fontSize: 12 }}>kg</Text>
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey, marginTop: 2 }}>
                                                Commercial goal
                                            </Text>
                                        </View>

                                        {/* Active Heads */}
                                        <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <AnimalIcon type={animalType} size={16} color="#3B82F6" />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textTransform: 'uppercase' }}>Heads</Text>
                                            </View>
                                            <Text style={[textStyles.h2, { fontSize: 19, color: colors.text }]}>
                                                {selectedBatch?.current_count ?? 0} <Text style={{ fontSize: 12 }}>heads</Text>
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#3B82F6', marginTop: 2 }}>
                                                {survivalRate !== null ? `${survivalRate}% survival` : 'Active cohort'}
                                            </Text>
                                        </View>

                                        {/* Cohort Age */}
                                        <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="calendar-month" size={16} color="#F59E0B" />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textTransform: 'uppercase' }}>Age &amp; Stage</Text>
                                            </View>
                                            <Text style={[textStyles.h2, { fontSize: 19, color: colors.text }]}>
                                                Day {currentAgeDays ?? '—'}
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#F59E0B', marginTop: 2 }}>
                                                {currentFeedStage ?? 'Market Finisher'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Advice Box */}
                                    <View style={{
                                        flexDirection: 'row',
                                        gap: 10,
                                        alignItems: 'center',
                                        backgroundColor: '#10B98118',
                                        borderWidth: 1,
                                        borderColor: '#10B98130',
                                        borderRadius: 12,
                                        padding: 12,
                                    }}>
                                        <MaterialIcons name="lightbulb" size={20} color="#10B981" />
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: '#10B981', flex: 1, lineHeight: 17 }}>
                                            Harvest Window Open: The cohort has met commercial weight. Plan harvest and market transport within the next 2–5 days to maximize feed-to-profit conversion.
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* ── Forecast Chart Section (Hidden when harvest ready) ── */}
                            {!isHarvestReady && (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                                        <View style={{ flex: 1, minWidth: 150, marginRight: 8 }}>
                                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 0 }]}>
                                                Weight Forecast &amp; Harvest Trajectory
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                                {daysToHarvest === 0
                                                    ? 'Target fulfilled — ready for commercial harvest.'
                                                    : estimatedHarvestDate
                                                        ? `Estimated target completion: ${formatDate(estimatedHarvestDate)} (${daysToHarvest} days remaining)`
                                                        : 'Growth trajectory based on latest daily gain.'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Quick Forecast Glance (Milestone Timeline Cards) */}
                                    {forecastMilestones.length > 0 && (
                                        <View style={{ marginTop: 10, marginBottom: 16 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                                    Projected Growth Milestones
                                                </Text>
                                                <View style={{
                                                    backgroundColor: predictionColor + '15',
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 2,
                                                    borderRadius: 6,
                                                }}>
                                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: predictionColor }}>
                                                        Goal: {harvestTargetKg} kg
                                                    </Text>
                                                </View>
                                            </View>

                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                                                {forecastMilestones.map((m, idx) => (
                                                    <View
                                                        key={idx}
                                                        style={{
                                                            width: 96,
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
                                                            backgroundColor: m.isTargetMet ? (colors.primary + '20') : predictionColor + '15',
                                                            paddingHorizontal: 5,
                                                            paddingVertical: 2,
                                                            borderRadius: 4,
                                                            marginTop: 4,
                                                        }}>
                                                            <Text style={{
                                                                fontFamily: 'Poppins-Medium',
                                                                fontSize: 8,
                                                                color: m.isTargetMet ? colors.primary : predictionColor,
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
                                    <View style={{ alignItems: 'center', marginBottom: 20, alignSelf: 'stretch' }}>
                                        {effectiveBaseWeightKg === null ? (
                                            <View style={{
                                                width: '100%',
                                                height: 180,
                                                backgroundColor: colors.surface,
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                padding: 20,
                                            }}>
                                                <MaterialIcons name="show-chart" size={40} color={colors.stroke} style={{ marginBottom: 8 }} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 13, color: colors.textGrey, textAlign: 'center' }}>
                                                    No weight data available.{'\n'}Record weighings to view forecast curve.
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={{
                                                borderRadius: 20,
                                                backgroundColor: colors.surface,
                                                paddingTop: 16,
                                                paddingBottom: 4,
                                                paddingRight: 16,
                                                elevation: 2,
                                                shadowColor: colors.shadow,
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: 0.1,
                                                shadowRadius: 8,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                width: '100%',
                                            }}>
                                            {(() => {
                                                const baseChartWidth = width - hPad * 2 - 18;
                                                const pointSpacing = 68;
                                                const forecastChartWidth = Math.max(baseChartWidth, forecastChartData.labels.length * pointSpacing);
                                                const isScrollable = forecastChartWidth > baseChartWidth;

                                                return (
                                                    <>
                                                        {isScrollable && (
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
                                                                data={forecastChartData}
                                                                width={forecastChartWidth}
                                                                height={230}
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
                                                                        prev && Math.abs(prev.x - x) < 5 && Math.abs(prev.y - y) < 5 ? null : { x, y, value, label }
                                                                    );
                                                                }}
                                                                decorator={() => {
                                                                    if (!forecastTooltip) return null;
                                                                    const { x, y, value, label } = forecastTooltip;
                                                                    const tipW = 126;
                                                                    const tipH = 58;
                                                                    const offsetX = Math.max(6, Math.min(x - tipW / 2, forecastChartWidth - tipW - 6));
                                                                    const offsetY = y - tipH - 10 < 0 ? y + 10 : y - tipH - 10;
                                                                    const isTargetMet = value >= harvestTargetKg;
                                                                    return (
                                                                        <View
                                                                            pointerEvents="none"
                                                                            style={{
                                                                                position: 'absolute',
                                                                                left: offsetX,
                                                                                top: offsetY,
                                                                                backgroundColor: '#182232',
                                                                                borderRadius: 12,
                                                                                paddingHorizontal: 10,
                                                                                paddingVertical: 7,
                                                                                width: tipW,
                                                                                alignItems: 'center',
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
                                                                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 13, color: '#FFFFFF' }}>
                                                                                {value.toFixed(2)} kg
                                                                            </Text>
                                                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: '#94A3B8', textAlign: 'center' }}>
                                                                                {label}
                                                                            </Text>
                                                                            <Text style={{
                                                                                fontFamily: 'Poppins-SemiBold',
                                                                                fontSize: 9,
                                                                                color: isTargetMet ? '#34D399' : '#FBBF24',
                                                                                marginTop: 2,
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
                                                                    fillShadowGradientFrom: predictionColor,
                                                                    fillShadowGradientFromOpacity: 0.2,
                                                                    fillShadowGradientTo: predictionColor,
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
                                                        </ScrollView>
                                                    </>
                                                );
                                            })()}
                                                {/* Legend */}
                                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, paddingLeft: 16, paddingBottom: 6 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: predictionColor }} />
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

                                    {/* ── Projected Growth Trajectory Milestones Table ── */}
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
                                                        Estimated {daysToHarvest}-day trajectory to {harvestTargetKg} kg target
                                                    </Text>
                                                </View>
                                                <View style={{
                                                    backgroundColor: predictionColor + '15',
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 3,
                                                    borderRadius: 6,
                                                }}>
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: predictionColor }}>
                                                        Goal: {harvestTargetKg} kg
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Table Column Header */}
                                            <View style={{
                                                flexDirection: 'row',
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                                                paddingVertical: 8,
                                                paddingHorizontal: 10,
                                                borderRadius: 8,
                                                marginBottom: 4,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                            }}>
                                                <Text style={{ flex: 1.4, fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textTransform: 'uppercase' }}>Milestone</Text>
                                                <Text style={{ flex: 1, fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textAlign: 'center', textTransform: 'uppercase' }}>Projected</Text>
                                                <Text style={{ flex: 1, fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textAlign: 'center', textTransform: 'uppercase' }}>Target</Text>
                                                <Text style={{ flex: 1.2, fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textGrey, textAlign: 'right', textTransform: 'uppercase' }}>Variance</Text>
                                            </View>

                                            {/* Rows */}
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
                                                            paddingVertical: 10,
                                                            paddingHorizontal: 10,
                                                            borderBottomWidth: isLast ? 0 : 1,
                                                            borderBottomColor: colors.stroke,
                                                            backgroundColor: isTargetMet ? (colors.primary + '08') : 'transparent',
                                                        }}
                                                    >
                                                        <Text style={{ flex: 1.4, fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                                            {m.label}
                                                        </Text>
                                                        <Text style={{ flex: 1, fontFamily: 'Poppins-Bold', fontSize: 12, color: isTargetMet ? colors.primary : colors.text, textAlign: 'center' }}>
                                                            {m.weight.toFixed(2)} kg
                                                        </Text>
                                                        <Text style={{ flex: 1, fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, textAlign: 'center' }}>
                                                            {harvestTargetKg.toFixed(2)} kg
                                                        </Text>
                                                        <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                                                            <View style={{
                                                                backgroundColor: isTargetMet ? '#27AE6018' : '#EF444415',
                                                                paddingHorizontal: 6,
                                                                paddingVertical: 2,
                                                                borderRadius: 4,
                                                            }}>
                                                                <Text style={{
                                                                    fontFamily: 'Poppins-Bold',
                                                                    fontSize: 10,
                                                                    color: isTargetMet ? '#27AE60' : '#EF4444',
                                                                }}>
                                                                    {isTargetMet ? (m.diff === 0 ? 'Goal Met' : `${varianceStr}kg`) : `${varianceStr}kg`}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </>
                            )}

                            {/* ── Factor Analysis: What Is Happening Now & What To Expect ── */}
                            {factorAnalysis && (
                                <View style={{
                                    backgroundColor: colors.surface,
                                    borderRadius: 18,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    padding: 16,
                                    marginBottom: 20,
                                    elevation: 2,
                                    shadowColor: colors.shadow,
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.06,
                                    shadowRadius: 6,
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: predictionColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                                            <MaterialIcons name="insights" size={18} color={predictionColor} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 14, color: colors.text }}>
                                                What Is Happening Now &amp; What To Expect
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                Real-world factors shaping your flock's growth trajectory
                                            </Text>
                                        </View>
                                    </View>

                                    {/* 4 Factor Cards */}
                                    <View style={{ gap: 10, marginBottom: 14 }}>
                                        {/* Factor 1: Growth & Gain */}
                                        <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="trending-up" size={16} color="#27AE60" />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: colors.text }}>
                                                    {factorAnalysis.growthHeading}
                                                </Text>
                                            </View>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 16 }}>
                                                {factorAnalysis.growthText}
                                            </Text>
                                        </View>

                                        {/* Factor 2: Feed & Nutrition */}
                                        <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="restaurant" size={16} color={colors.secondary} />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: colors.text }}>
                                                    {factorAnalysis.feedHeading}
                                                </Text>
                                            </View>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 16 }}>
                                                {factorAnalysis.feedText}
                                            </Text>
                                        </View>

                                        {/* Factor 3: Flock Health & Uniformity */}
                                        <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="health-and-safety" size={16} color="#3B82F6" />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: colors.text }}>
                                                    {factorAnalysis.healthHeading}
                                                </Text>
                                            </View>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 16 }}>
                                                {factorAnalysis.healthText}
                                            </Text>
                                        </View>

                                        {/* Factor 4: Barn Climate & Comfort */}
                                        <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <MaterialIcons name="wb-sunny" size={16} color="#F59E0B" />
                                                <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 12, color: colors.text }}>
                                                    {factorAnalysis.envHeading}
                                                </Text>
                                            </View>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, lineHeight: 16 }}>
                                                {factorAnalysis.envText}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Action Recommendation Banner */}
                                    <View style={{
                                        flexDirection: 'row',
                                        gap: 10,
                                        alignItems: 'center',
                                        backgroundColor: factorAnalysis.isTargetMet ? (colors.primary + '12') : (predictionColor + '12'),
                                        borderWidth: 1,
                                        borderColor: factorAnalysis.isTargetMet ? (colors.primary + '30') : (predictionColor + '30'),
                                        borderRadius: 12,
                                        padding: 12,
                                    }}>
                                        <MaterialIcons name="lightbulb" size={20} color={factorAnalysis.isTargetMet ? colors.primary : predictionColor} />
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11.5, color: factorAnalysis.isTargetMet ? colors.primary : predictionColor, flex: 1, lineHeight: 16 }}>
                                            {factorAnalysis.actionRecommendation}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* ── Batch Overview (Total Heads) ─────────────────────────── */}
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
                                gap: 12,
                                elevation: 1,
                                shadowColor: colors.shadow,
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.5,
                                shadowRadius: 4,
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: activeColor + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
                                        <AnimalIcon
                                            type={animalType}
                                            size={22}
                                            color={activeColor}
                                        />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text numberOfLines={1} style={[textStyles.body, { color: colors.textGrey, fontSize: 12, lineHeight: 16 }]}>
                                            {selectedBatch?.name ?? 'Batch'}
                                        </Text>
                                        <Text numberOfLines={1} style={[textStyles.h3, { color: colors.text, fontSize: 14, lineHeight: 19 }]}>
                                            {animalType === 'pig' ? 'Pigs' : 'Chickens'} · {selectedHousing?.name ?? '—'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ alignItems: 'flex-end', flexShrink: 0, minWidth: 48 }}>
                                    <Text style={[textStyles.h1, { color: activeColor, fontSize: 26, lineHeight: 30 }]}>
                                        {selectedBatch?.current_count ?? 0}
                                    </Text>
                                    <Text numberOfLines={1} style={[textStyles.label, { color: activeColor, fontSize: 11, opacity: 0.8 }]}>Heads</Text>
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
            )}

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

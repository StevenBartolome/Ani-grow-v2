import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimalIcon } from '@/components/AnimalIcon';
import { BackButton } from '@/components/BackButton';
import { PrintReportButton } from '@/components/PrintReportButton';
import { SelectionModal } from '@/components/SelectionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { exportReportPdf, ReportDocument, ReportChart, formatReportUserRole, formatReportUserName } from '@/lib/pdfReport';
import { supabase } from '@/lib/supabase';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CompletedBatch {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    estimated_count: number;
    current_count: number;
    sold_count: number;
    arrival_date: string;
    age_at_arrival_days: number;
    harvest_target_kg: number | null;
    supplier: string | null;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    housing_id: string;
    housings?: {
        id: string;
        name: string;
        animal_type: 'chicken' | 'pig';
    } | null;
}

interface HousingItem {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
}

interface WeighSessionItem {
    id: string;
    recorded_at: string;
    animal_count?: number;
    gross_weight_grams?: number | null;
    tare_weight_grams?: number | null;
    net_weight_grams?: number | null;
    avg_weight_grams?: number | null;
    status: 'underweight' | 'normal' | 'overweight' | 'invalid' | string;
    weigh_mode?: 'individual' | 'batch' | string;
    animal_label?: string | null;
    animal_type?: string | null;
}

export const getWeighGrams = (w: WeighSessionItem): number => {
    if (w.net_weight_grams && Number(w.net_weight_grams) > 0) {
        const count = w.animal_count && w.animal_count > 0 ? w.animal_count : 1;
        return w.weigh_mode === 'batch' || count > 1
            ? Math.round(Number(w.net_weight_grams) / count)
            : Number(w.net_weight_grams);
    }
    if (w.avg_weight_grams && Number(w.avg_weight_grams) > 0) {
        return Number(w.avg_weight_grams);
    }
    if (w.gross_weight_grams && Number(w.gross_weight_grams) > 0) {
        const count = w.animal_count && w.animal_count > 0 ? w.animal_count : 1;
        return Math.round(Number(w.gross_weight_grams) / count);
    }
    return 0;
};

export const formatWeighMode = (mode?: string | null): string => {
    if (!mode) return 'Individual';
    const trimmed = mode.trim().toLowerCase();
    if (trimmed === 'batch') return 'Tray';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

interface DispenseRecordItem {
    id: string;
    grams_dispensed: number;
    status: string;
    triggered_by: string;
    dispensed_at: string;
    feed_id: string | null;
    feeds?: {
        id: string;
        name: string;
        brand: string | null;
        category: string | null;
    } | null;
}

interface HealthRecordItem {
    id: string;
    record_type: string;
    title: string;
    notes: string | null;
    severity: 'low' | 'medium' | 'high';
    affected_count: number | null;
    record_date: string;
    medication: string | null;
    dosage: string | null;
    followup_date: string | null;
}

interface VaccinationRecordItem {
    id: string;
    vaccine_name: string;
    administered_date: string;
    administered_by: string | null;
    animals_vaccinated: number | null;
    dose_per_animal: number | null;
    total_dose_used: number | null;
    unit: string | null;
    lot_number: string | null;
    route: string | null;
    notes: string | null;
}

type TabType = 'overview' | 'growth' | 'feed' | 'health' | 'vaccines';
type SortOption = 'newest' | 'oldest' | 'survival' | 'headcount';

const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.1);
    if (width >= 600) return Math.round(width * 0.05);
    return 16;
};

export default function BatchHistoryScreen() {
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;

    const { colors, isDark } = useTheme();
    const textStyles = useTextStyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ initialBatchId?: string }>();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const effectiveFarmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const initialBatchId = params.initialBatchId || null;

    // ─── List State ───────────────────────────────────────────────────────────
    const [batches, setBatches] = useState<CompletedBatch[]>([]);
    const [housings, setHousings] = useState<HousingItem[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [speciesFilter, setSpeciesFilter] = useState<'all' | 'chicken' | 'pig'>('all');
    const [housingFilter, setHousingFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('newest');

    // Filter Selection Modals
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [sortModalVisible, setSortModalVisible] = useState(false);

    // ─── Detail State ─────────────────────────────────────────────────────────
    const [selectedBatch, setSelectedBatch] = useState<CompletedBatch | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    // Dossier Records
    const [weighSessions, setWeighSessions] = useState<WeighSessionItem[]>([]);
    const [dispenseRecords, setDispenseRecords] = useState<DispenseRecordItem[]>([]);
    const [healthRecords, setHealthRecords] = useState<HealthRecordItem[]>([]);
    const [vaccinationRecords, setVaccinationRecords] = useState<VaccinationRecordItem[]>([]);

    // Pagination for detail tabs
    const [weighPage, setWeighPage] = useState(1);
    const [feedPage, setFeedPage] = useState(1);
    const [healthPage, setHealthPage] = useState(1);
    const [vaccinePage, setVaccinePage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        setWeighPage(1);
        setFeedPage(1);
        setHealthPage(1);
        setVaccinePage(1);
    }, [selectedBatch?.id]);

    const paginatedWeighSessions = useMemo(() => {
        const start = (weighPage - 1) * ITEMS_PER_PAGE;
        return weighSessions.slice(start, start + ITEMS_PER_PAGE);
    }, [weighSessions, weighPage]);

    const paginatedDispenseRecords = useMemo(() => {
        const start = (feedPage - 1) * ITEMS_PER_PAGE;
        return dispenseRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [dispenseRecords, feedPage]);

    const paginatedHealthRecords = useMemo(() => {
        const start = (healthPage - 1) * ITEMS_PER_PAGE;
        return healthRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [healthRecords, healthPage]);

    const paginatedVaccinationRecords = useMemo(() => {
        const start = (vaccinePage - 1) * ITEMS_PER_PAGE;
        return vaccinationRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [vaccinationRecords, vaccinePage]);

    // ─── Fetch Completed Batches & Housings ───────────────────────────────────
    const fetchCompletedBatches = useCallback(async (isRefresh = false) => {
        if (!effectiveFarmId) {
            setIsLoadingList(false);
            return;
        }
        if (isRefresh) setRefreshing(true);
        else setIsLoadingList(true);

        try {
            const { data: batchData, error: batchErr } = await supabase
                .from('batches')
                .select(`
                    id,
                    name,
                    animal_type,
                    estimated_count,
                    current_count,
                    sold_count,
                    arrival_date,
                    age_at_arrival_days,
                    harvest_target_kg,
                    supplier,
                    status,
                    notes,
                    created_at,
                    updated_at,
                    housing_id,
                    housings (
                        id,
                        name,
                        animal_type
                    )
                `)
                .eq('farm_id', effectiveFarmId)
                .eq('status', 'completed')
                .order('updated_at', { ascending: false });

            if (batchErr) throw batchErr;

            const typedBatches = ((batchData as unknown) || []) as CompletedBatch[];
            setBatches(typedBatches);

            const { data: housingData } = await supabase
                .from('housings')
                .select('id, name, animal_type')
                .eq('farm_id', effectiveFarmId)
                .order('name', { ascending: true });

            if (housingData) {
                setHousings(housingData as HousingItem[]);
            }

            if (initialBatchId && !selectedBatch) {
                const found = typedBatches.find(b => b.id === initialBatchId);
                if (found) {
                    setSelectedBatch(found);
                }
            }
        } catch (err) {
            console.error('[BatchHistoryScreen] Error fetching completed batches:', err);
        } finally {
            if (isRefresh) setRefreshing(false);
            else setIsLoadingList(false);
        }
    }, [effectiveFarmId, initialBatchId, selectedBatch]);

    useEffect(() => {
        fetchCompletedBatches();
    }, [fetchCompletedBatches]);

    // ─── Fetch Dossier Details when Selected Batch Changes ───────────────────
    const fetchDetails = useCallback(async (batchId: string, housingId?: string | null, arrivalDate?: string, completedDate?: string | null) => {
        if (!batchId) return;
        setIsLoadingDetail(true);
        try {
            let loadedWeighSessions: WeighSessionItem[] = [];
            const { data: weighData } = await supabase
                .from('weigh_sessions')
                .select('id, recorded_at, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, weigh_mode, animal_label, animal_type')
                .eq('batch_id', batchId)
                .order('recorded_at', { ascending: true });

            if (weighData && weighData.length > 0) {
                loadedWeighSessions = weighData as WeighSessionItem[];
            } else {
                const { data: envs } = await supabase
                    .from('weighing_sessions')
                    .select('id')
                    .eq('batch_id', batchId);

                if (envs && envs.length > 0) {
                    const envIds = envs.map(e => e.id);
                    const { data: envWeighData } = await supabase
                        .from('weigh_sessions')
                        .select('id, recorded_at, animal_count, gross_weight_grams, tare_weight_grams, net_weight_grams, avg_weight_grams, status, weigh_mode, animal_label, animal_type')
                        .in('weighing_session_id', envIds)
                        .order('recorded_at', { ascending: true });

                    if (envWeighData && envWeighData.length > 0) {
                        loadedWeighSessions = envWeighData as WeighSessionItem[];
                    }
                }
            }

            let loadedDispenseRecords: DispenseRecordItem[] = [];
            const { data: feedData } = await supabase
                .from('dispense_records')
                .select(`
                    id,
                    grams_dispensed,
                    status,
                    triggered_by,
                    dispensed_at,
                    feed_id,
                    feeds (
                        id,
                        name,
                        brand,
                        category
                    )
                `)
                .eq('batch_id', batchId)
                .order('dispensed_at', { ascending: false });

            if (feedData && feedData.length > 0) {
                loadedDispenseRecords = feedData as unknown as DispenseRecordItem[];
            } else if (housingId && arrivalDate) {
                const arrivalIso = new Date(arrivalDate).toISOString();
                const completedIso = completedDate
                    ? new Date(completedDate).toISOString()
                    : new Date().toISOString();

                const { data: housingFeedData } = await supabase
                    .from('dispense_records')
                    .select(`
                        id,
                        grams_dispensed,
                        status,
                        triggered_by,
                        dispensed_at,
                        feed_id,
                        feeds (
                            id,
                            name,
                            brand,
                            category
                        )
                    `)
                    .eq('housing_id', housingId)
                    .gte('dispensed_at', arrivalIso)
                    .lte('dispensed_at', completedIso)
                    .order('dispensed_at', { ascending: false });

                if (housingFeedData && housingFeedData.length > 0) {
                    loadedDispenseRecords = housingFeedData as unknown as DispenseRecordItem[];
                }
            }

            const { data: healthData } = await supabase
                .from('health_records')
                .select('id, record_type, title, notes, severity, affected_count, record_date, medication, dosage, followup_date')
                .eq('batch_id', batchId)
                .is('deleted_at', null)
                .order('record_date', { ascending: false });

            const { data: vaxData } = await supabase
                .from('vaccination_records')
                .select('id, vaccine_name, administered_date, administered_by, animals_vaccinated, dose_per_animal, total_dose_used, unit, lot_number, route, notes')
                .eq('batch_id', batchId)
                .order('administered_date', { ascending: false });

            setWeighSessions(loadedWeighSessions);
            setDispenseRecords(loadedDispenseRecords);
            setHealthRecords((healthData as HealthRecordItem[]) || []);
            setVaccinationRecords((vaxData as VaccinationRecordItem[]) || []);
        } catch (err) {
            console.error('[BatchHistoryScreen] Error fetching dossier details:', err);
        } finally {
            setIsLoadingDetail(false);
        }
    }, []);

    useEffect(() => {
        if (!selectedBatch) return;
        fetchDetails(selectedBatch.id, selectedBatch.housing_id, selectedBatch.arrival_date, selectedBatch.updated_at);
    }, [selectedBatch, fetchDetails]);

    // ─── Real-time Supabase Subscriptions ─────────────────────────────────────
    useEffect(() => {
        if (!effectiveFarmId) return;

        const channelName = `batch-history-mobile-${effectiveFarmId}-${Date.now()}`;
        const channel = supabase.channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'batches', filter: `farm_id=eq.${effectiveFarmId}` }, () => {
                fetchCompletedBatches(false);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'housings', filter: `farm_id=eq.${effectiveFarmId}` }, () => {
                fetchCompletedBatches(false);
            });

        if (selectedBatch) {
            channel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'weigh_sessions', filter: `batch_id=eq.${selectedBatch.id}` }, () => {
                    fetchDetails(selectedBatch.id, selectedBatch.housing_id, selectedBatch.arrival_date, selectedBatch.updated_at);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'dispense_records', filter: `batch_id=eq.${selectedBatch.id}` }, () => {
                    fetchDetails(selectedBatch.id, selectedBatch.housing_id, selectedBatch.arrival_date, selectedBatch.updated_at);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records', filter: `batch_id=eq.${selectedBatch.id}` }, () => {
                    fetchDetails(selectedBatch.id, selectedBatch.housing_id, selectedBatch.arrival_date, selectedBatch.updated_at);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccination_records', filter: `batch_id=eq.${selectedBatch.id}` }, () => {
                    fetchDetails(selectedBatch.id, selectedBatch.housing_id, selectedBatch.arrival_date, selectedBatch.updated_at);
                });
        }

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [effectiveFarmId, fetchCompletedBatches, fetchDetails, selectedBatch]);

    // ─── Filtered & Sorted Batches ───────────────────────────────────────────
    const filteredBatches = useMemo(() => {
        let result = [...batches];

        if (speciesFilter !== 'all') {
            result = result.filter(b => b.animal_type === speciesFilter);
        }

        if (housingFilter !== 'all') {
            result = result.filter(b => b.housing_id === housingFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(b =>
                b.name.toLowerCase().includes(q) ||
                (b.supplier && b.supplier.toLowerCase().includes(q)) ||
                (b.housings?.name && b.housings.name.toLowerCase().includes(q)) ||
                (b.notes && b.notes.toLowerCase().includes(q))
            );
        }

        result.sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            }
            if (sortBy === 'oldest') {
                return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
            }
            if (sortBy === 'survival') {
                const sA = a.estimated_count > 0 ? (a.sold_count || a.current_count) / a.estimated_count : 0;
                const sB = b.estimated_count > 0 ? (b.sold_count || b.current_count) / b.estimated_count : 0;
                return sB - sA;
            }
            if (sortBy === 'headcount') {
                return (b.sold_count || b.current_count) - (a.sold_count || a.current_count);
            }
            return 0;
        });

        return result;
    }, [batches, speciesFilter, housingFilter, searchQuery, sortBy]);

    // ─── Farm Rollup Stats ───────────────────────────────────────────────────
    const farmStats = useMemo(() => {
        const totalCompleted = batches.length;
        const totalSold = batches.reduce((acc, b) => acc + (b.sold_count || b.current_count || 0), 0);
        const totalInitial = batches.reduce((acc, b) => acc + (b.estimated_count || 0), 0);
        const overallSurvival = totalInitial > 0 ? ((totalSold / totalInitial) * 100).toFixed(1) : '0';
        const chickenBatches = batches.filter(b => b.animal_type === 'chicken').length;
        const pigBatches = batches.filter(b => b.animal_type === 'pig').length;

        return {
            totalCompleted,
            totalSold,
            totalInitial,
            overallSurvival,
            chickenBatches,
            pigBatches,
        };
    }, [batches]);

    // ─── Detail Batch Metrics Calculations ────────────────────────────────────
    const detailMetrics = useMemo(() => {
        if (!selectedBatch) return null;

        const initialHeads = selectedBatch.estimated_count || 0;

        const healthMortalities = healthRecords
            .filter(r => r.record_type === 'mortality')
            .reduce((acc, r) => acc + (r.affected_count && r.affected_count > 0 ? r.affected_count : 1), 0);

        const rawFinal = selectedBatch.sold_count > 0
            ? selectedBatch.sold_count
            : (selectedBatch.current_count && selectedBatch.current_count > 0
                ? selectedBatch.current_count
                : Math.max(0, initialHeads - healthMortalities));
        const finalHeads = rawFinal > 0 ? rawFinal : initialHeads;
        const survivalRate = initialHeads > 0 ? Math.min(100, (finalHeads / initialHeads) * 100) : 0;

        const calculatedLoss = Math.max(0, initialHeads - finalHeads);
        const totalMortalities = Math.max(healthMortalities, calculatedLoss);
        const mortalityRate = initialHeads > 0 ? (totalMortalities / initialHeads) * 100 : 0;

        const start = new Date(selectedBatch.arrival_date);
        const end = new Date(selectedBatch.updated_at);
        const diffMs = end.getTime() - start.getTime();
        const cycleDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

        let startWeightKg: number | null = null;
        let finalWeightKg: number | null = null;
        let adgDays = cycleDays;

        const typeMatchingSessions = weighSessions.filter(w => {
            if (w.status === 'invalid') return false;
            if (selectedBatch.animal_type && w.animal_type && w.animal_type.toLowerCase() !== selectedBatch.animal_type.toLowerCase()) {
                return false;
            }
            return getWeighGrams(w) > 0;
        });

        const arrivalDateMs = new Date(selectedBatch.arrival_date).getTime();
        const sessionsOnOrAfterArrival = typeMatchingSessions.filter(w => {
            const wDateMs = new Date(w.recorded_at).getTime();
            return wDateMs >= (arrivalDateMs - 2 * 86400000);
        });

        const validSessions = (sessionsOnOrAfterArrival.length > 0 ? sessionsOnOrAfterArrival : typeMatchingSessions)
            .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

        if (validSessions.length > 0) {
            const dateMap = new Map<string, number[]>();
            validSessions.forEach(w => {
                const dk = w.recorded_at ? w.recorded_at.slice(0, 10) : 'unknown';
                if (!dateMap.has(dk)) dateMap.set(dk, []);
                dateMap.get(dk)!.push(getWeighGrams(w));
            });

            const sortedDates = Array.from(dateMap.keys()).sort();

            if (sortedDates.length >= 2) {
                const firstWeights = dateMap.get(sortedDates[0])!;
                const lastWeights = dateMap.get(sortedDates[sortedDates.length - 1])!;
                const firstAvgG = firstWeights.reduce((a, b) => a + b, 0) / firstWeights.length;
                const lastAvgG = lastWeights.reduce((a, b) => a + b, 0) / lastWeights.length;

                startWeightKg = parseFloat((firstAvgG / 1000).toFixed(3));
                finalWeightKg = parseFloat((lastAvgG / 1000).toFixed(3));

                try {
                    const d1 = new Date(sortedDates[0]).getTime();
                    const d2 = new Date(sortedDates[sortedDates.length - 1]).getTime();
                    const spanDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                    if (spanDays >= 1) {
                        adgDays = spanDays;
                    }
                } catch (_) {}
            } else {
                const onlyWeights = dateMap.get(sortedDates[0])!;
                const onlyAvgG = onlyWeights.reduce((a, b) => a + b, 0) / onlyWeights.length;
                const recordedKg = parseFloat((onlyAvgG / 1000).toFixed(3));

                const weighDate = new Date(sortedDates[0]);
                const arrivalDate = new Date(selectedBatch.arrival_date);
                const daysFromArrival = Math.max(0, Math.round((weighDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)));

                const isPig = selectedBatch.animal_type === 'pig';
                const arrivalAge = selectedBatch.age_at_arrival_days || 0;
                const baselineArrivalKg = isPig
                    ? (arrivalAge >= 28 ? 7.0 : 1.5)
                    : Math.max(0.040, 0.042 + arrivalAge * 0.035);

                if (daysFromArrival > 3 || recordedKg > (baselineArrivalKg * 1.5)) {
                    finalWeightKg = recordedKg;
                    startWeightKg = parseFloat(baselineArrivalKg.toFixed(3));
                    adgDays = Math.max(1, daysFromArrival);
                } else {
                    startWeightKg = recordedKg;
                    if (selectedBatch.harvest_target_kg && selectedBatch.harvest_target_kg > recordedKg) {
                        finalWeightKg = selectedBatch.harvest_target_kg;
                    } else {
                        finalWeightKg = isPig ? 95 : 2.2;
                    }
                    adgDays = cycleDays;
                }
            }
        } else if (selectedBatch.harvest_target_kg && selectedBatch.harvest_target_kg > 0) {
            finalWeightKg = selectedBatch.harvest_target_kg;
            const isPig = selectedBatch.animal_type === 'pig';
            const arrivalAge = selectedBatch.age_at_arrival_days || 0;
            startWeightKg = isPig ? (arrivalAge >= 28 ? 7.0 : 1.5) : 0.042;
            adgDays = cycleDays;
        }

        const netWeightGainKg = finalWeightKg !== null && startWeightKg !== null
            ? Math.max(0, parseFloat((finalWeightKg - startWeightKg).toFixed(3)))
            : null;

        const adgGrams = netWeightGainKg !== null && adgDays > 0
            ? Math.round((netWeightGainKg * 1000) / adgDays)
            : null;

        const normalCount = weighSessions.filter(w => w.status === 'normal').length;
        const underweightCount = weighSessions.filter(w => w.status === 'underweight').length;
        const overweightCount = weighSessions.filter(w => w.status === 'overweight').length;
        const totalWeighed = normalCount + underweightCount + overweightCount;

        const successfulDispenses = dispenseRecords.filter(r =>
            !r.status || r.status === 'success' || r.status === 'completed' || r.status === 'dispensed'
        );
        const totalFeedGrams = successfulDispenses.reduce((acc, r) => acc + (r.grams_dispensed || 0), 0);
        const totalFeedKg = totalFeedGrams / 1000;

        const feedBreakdownMap = new Map<string, { name: string; brand: string; totalGrams: number }>();
        successfulDispenses.forEach(r => {
            const feedName = r.feeds?.name || 'Standard Feed';
            const feedBrand = r.feeds?.brand || 'Generic';
            const key = `${feedName}-${feedBrand}`;
            const existing = feedBreakdownMap.get(key) || { name: feedName, brand: feedBrand, totalGrams: 0 };
            existing.totalGrams += r.grams_dispensed || 0;
            feedBreakdownMap.set(key, existing);
        });
        const feedBreakdown = Array.from(feedBreakdownMap.values());

        let fcr: number | null = null;
        if (netWeightGainKg !== null && netWeightGainKg > 0 && finalHeads > 0 && totalFeedKg > 0) {
            const totalBiomassGainKg = netWeightGainKg * finalHeads;
            if (totalBiomassGainKg > 0) {
                fcr = parseFloat((totalFeedKg / totalBiomassGainKg).toFixed(2));
            }
        }

        return {
            initialHeads,
            finalHeads,
            survivalRate,
            totalMortalities,
            mortalityRate,
            cycleDays,
            startWeightKg,
            finalWeightKg,
            netWeightGainKg,
            adgGrams,
            totalWeighed,
            normalCount,
            underweightCount,
            overweightCount,
            totalFeedKg,
            feedBreakdown,
            fcr,
        };
    }, [selectedBatch, weighSessions, dispenseRecords, healthRecords]);

    // ─── Export Report Data Builder ───────────────────────────────────────────
    const buildBatchReport = useCallback((): ReportDocument | null => {
        if (!selectedBatch || !detailMetrics) return null;

        const isPig = selectedBatch.animal_type === 'pig';
        const animalLabel = isPig ? 'Swine / Pig' : 'Poultry / Broiler';

        const inventoryChart: ReportChart = {
            type: 'bar',
            title: 'Lifecycle Population Balance (Head Count)',
            labels: ['Initial Stock', 'Harvested / Sold', 'Mortality Loss'],
            series: [
                {
                    name: 'Head Count',
                    data: [detailMetrics.initialHeads, detailMetrics.finalHeads, detailMetrics.totalMortalities],
                    color: '#16492a',
                },
            ],
            unit: 'heads',
            yAxisLabel: 'Heads',
        };

        const validWeights = weighSessions.filter(w => getWeighGrams(w) > 0);
        const weightTrendChart: ReportChart | undefined = validWeights.length > 0 ? {
            type: 'line',
            title: 'Batch Live Weight History (kg)',
            labels: validWeights.slice(-15).map(w => w.recorded_at ? new Date(w.recorded_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—'),
            series: [
                {
                    name: 'Recorded Live Weight (kg)',
                    data: validWeights.slice(-15).map(w => Math.round((getWeighGrams(w) / 1000) * 100) / 100),
                    color: '#16492a',
                },
            ],
            unit: 'kg',
            yAxisLabel: 'Live Weight (kg)',
        } : undefined;

        return {
            reportTitle: `Batch Performance Dossier: ${selectedBatch.name}`,
            farmName: (profile as any)?.farm_name || 'AniGrow Smart Livestock System',
            subtitle: `Completed Lifecycle Report • Provenance: ${selectedBatch.housings?.name || 'General Housing'}`,
            generatedByName: formatReportUserName(profile),
            generatedByRole: formatReportUserRole(profile?.role),
            meta: [
                { label: 'Species', value: animalLabel },
                { label: 'Origin Housing', value: selectedBatch.housings?.name || 'Unassigned' },
                { label: 'Arrival Date', value: formatDate(selectedBatch.arrival_date) },
                { label: 'Harvest Date', value: formatDate(selectedBatch.updated_at) },
                { label: 'Cycle Duration', value: `${detailMetrics.cycleDays} days` },
                { label: 'Supplier', value: selectedBatch.supplier || 'N/A' },
            ],
            summaryText: `Batch ${selectedBatch.name} completed its ${detailMetrics.cycleDays}-day production cycle with a livability rate of ${detailMetrics.survivalRate.toFixed(1)}%. A total of ${detailMetrics.finalHeads} heads were harvested out of ${detailMetrics.initialHeads} initial stock. Total feed consumption was ${detailMetrics.totalFeedKg.toFixed(1)} kg.`,
            sections: [
                {
                    heading: 'Production Performance Key Metrics',
                    stats: [
                        { label: 'Initial Started', value: `${detailMetrics.initialHeads} heads` },
                        { label: 'Harvested / Sold', value: `${detailMetrics.finalHeads} heads`, accent: 'good' },
                        { label: 'Livability Rate', value: `${detailMetrics.survivalRate.toFixed(1)}%`, accent: 'good' },
                        { label: 'Mortality Loss', value: `${detailMetrics.totalMortalities} heads (${detailMetrics.mortalityRate.toFixed(1)}%)`, accent: detailMetrics.totalMortalities > 0 ? 'bad' : 'good' },
                        { label: 'Final Harvest Avg', value: detailMetrics.finalWeightKg !== null ? `${detailMetrics.finalWeightKg.toFixed(2)} kg` : 'N/A' },
                        { label: 'Target Weight', value: selectedBatch.harvest_target_kg ? `${selectedBatch.harvest_target_kg} kg` : 'N/A' },
                        { label: 'Average Daily Gain (ADG)', value: detailMetrics.adgGrams !== null ? `${detailMetrics.adgGrams} g/day` : 'N/A' },
                        { label: 'Total Feed Dispensed', value: `${detailMetrics.totalFeedKg.toFixed(1)} kg` },
                    ],
                    chart: inventoryChart,
                },
                {
                    heading: 'Weight Sampling & Scale Logs',
                    chart: weightTrendChart,
                    table: {
                        headers: ['Date & Time', 'Head Count', 'Avg Weight', 'Gross Weight', 'Classification'],
                        rows: weighSessions.map(w => [
                            formatDateTime(w.recorded_at),
                            w.animal_count || 1,
                            getWeighGrams(w) > 0 ? `${(getWeighGrams(w) / 1000).toFixed(2)} kg` : '—',
                            w.gross_weight_grams ? `${(w.gross_weight_grams / 1000).toFixed(2)} kg` : '—',
                            (w.status || 'normal').toUpperCase(),
                        ]),
                        note: `Total ${weighSessions.length} recorded weighing sessions during this batch cycle.`
                    }
                }
            ],
        };
    }, [selectedBatch, detailMetrics, profile, weighSessions]);

    // ─── Format Helpers ───────────────────────────────────────────────────────
    function formatDate(dateStr?: string | null) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDateTime(dateStr?: string | null) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Options for Selection Modals
    const housingOptions = useMemo(() => {
        return ['All Housings', ...housings.map(h => h.name)];
    }, [housings]);

    const sortOptions = [
        'Newest First',
        'Oldest First',
        'Highest Survival Rate',
        'Largest Head Count',
    ];

    const getSortOptionLabel = (option: SortOption) => {
        switch (option) {
            case 'newest': return 'Newest First';
            case 'oldest': return 'Oldest First';
            case 'survival': return 'Highest Survival Rate';
            case 'headcount': return 'Largest Head Count';
        }
    };

    const handleSelectHousingName = (name: string) => {
        if (name === 'All Housings') {
            setHousingFilter('all');
        } else {
            const found = housings.find(h => h.name === name);
            if (found) setHousingFilter(found.id);
        }
    };

    const handleSelectSortLabel = (label: string) => {
        if (label === 'Newest First') setSortBy('newest');
        else if (label === 'Oldest First') setSortBy('oldest');
        else if (label === 'Highest Survival Rate') setSortBy('survival');
        else if (label === 'Largest Head Count') setSortBy('headcount');
    };

    // ─── RENDER: DOSSIER DETAIL VIEW ──────────────────────────────────────────
    if (selectedBatch && detailMetrics) {
        const isPig = selectedBatch.animal_type === 'pig';
        const themeColor = isPig ? '#EC4899' : '#F97316';

        return (
            <View style={{ flex: 1, backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }}>
                {/* Header Navigation */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: hPad,
                    paddingTop: 16,
                    paddingBottom: 16,
                    minHeight: 56,
                }}>
                    <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
                        <BackButton onPress={() => setSelectedBatch(null)} />
                    </View>

                    <Text
                        style={[textStyles.h1, { fontSize: 18, color: colors.primary, textAlign: 'center', flex: 1, paddingHorizontal: 6 }]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                    >
                        Performance Dossier
                    </Text>

                    <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
                        <PrintReportButton buildReport={buildBatchReport} />
                    </View>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: hPad, paddingVertical: 16, gap: 16 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Hero Dossier Card */}
                    <View style={{
                        backgroundColor: colors.surface,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: colors.stroke,
                        padding: 16,
                        gap: 14,
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{
                                width: 52,
                                height: 52,
                                borderRadius: 16,
                                backgroundColor: themeColor + '1F',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <AnimalIcon type={selectedBatch.animal_type} size={28} color={themeColor} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 19, fontFamily: 'Poppins-Bold' }]}>
                                        {selectedBatch.name}
                                    </Text>
                                    <View style={{ backgroundColor: '#10B9811A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <MaterialIcons name="check-circle" size={13} color="#10B981" />
                                        <Text style={{ color: '#10B981', fontSize: 11, fontFamily: 'Poppins-Bold' }}>Completed</Text>
                                    </View>
                                </View>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                    Housing: <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{selectedBatch.housings?.name || 'General Housing'}</Text>
                                </Text>
                            </View>
                        </View>

                        <View style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 10,
                            paddingTop: 10,
                            borderTopWidth: 1,
                            borderTopColor: colors.stroke + '40',
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <MaterialIcons name="calendar-today" size={14} color={colors.textGrey} />
                                <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                    {formatDate(selectedBatch.arrival_date)} ➔ {formatDate(selectedBatch.updated_at)}
                                </Text>
                            </View>
                            <Text style={{ color: colors.textGrey }}>•</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <MaterialIcons name="timelapse" size={14} color={colors.primary} />
                                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>
                                    {detailMetrics.cycleDays} days cycle
                                </Text>
                            </View>
                            {selectedBatch.supplier ? (
                                <>
                                    <Text style={{ color: colors.textGrey }}>•</Text>
                                    <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                        Source: <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{selectedBatch.supplier}</Text>
                                    </Text>
                                </>
                            ) : null}
                        </View>
                    </View>

                    {/* KPI Grid Cards */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {/* Livability */}
                        <View style={{
                            flex: 1,
                            minWidth: 140,
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1.5,
                            borderColor: colors.stroke,
                            padding: 14,
                            gap: 6,
                        }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Livability</Text>
                                <MaterialIcons name="verified" size={18} color="#10B981" />
                            </View>
                            <Text style={{ fontSize: 20, fontFamily: 'Poppins-Bold', color: '#10B981' }}>
                                {detailMetrics.survivalRate.toFixed(1)}%
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textGrey }}>
                                {detailMetrics.finalHeads} / {detailMetrics.initialHeads} finished
                            </Text>
                        </View>

                        {/* Mortality */}
                        <View style={{
                            flex: 1,
                            minWidth: 140,
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1.5,
                            borderColor: colors.stroke,
                            padding: 14,
                            gap: 6,
                        }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Mortality</Text>
                                <MaterialIcons name="heart-broken" size={18} color={detailMetrics.totalMortalities > 0 ? '#EF4444' : colors.textGrey} />
                            </View>
                            <Text style={{ fontSize: 20, fontFamily: 'Poppins-Bold', color: detailMetrics.totalMortalities > 0 ? '#EF4444' : colors.text }}>
                                {detailMetrics.totalMortalities} heads
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textGrey }}>
                                {detailMetrics.mortalityRate.toFixed(1)}% loss rate
                            </Text>
                        </View>

                        {/* Harvest Weight */}
                        <View style={{
                            flex: 1,
                            minWidth: 140,
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1.5,
                            borderColor: colors.stroke,
                            padding: 14,
                            gap: 6,
                        }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Harvest Weight</Text>
                                <MaterialIcons name="scale" size={18} color={colors.primary} />
                            </View>
                            <Text style={{ fontSize: 20, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                {detailMetrics.finalWeightKg !== null ? `${detailMetrics.finalWeightKg.toFixed(2)} kg` : '—'}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textGrey }}>
                                {selectedBatch.harvest_target_kg ? `Target: ${selectedBatch.harvest_target_kg} kg` : 'Final batch avg'}
                            </Text>
                        </View>

                        {/* Daily Gain */}
                        <View style={{
                            flex: 1,
                            minWidth: 140,
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1.5,
                            borderColor: colors.stroke,
                            padding: 14,
                            gap: 6,
                        }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Daily Gain</Text>
                                <MaterialIcons name="trending-up" size={18} color="#6366F1" />
                            </View>
                            <Text style={{ fontSize: 20, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                {detailMetrics.adgGrams !== null ? `${detailMetrics.adgGrams} g/d` : '—'}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textGrey }}>
                                Average Daily Gain
                            </Text>
                        </View>

                        {/* Total Feed */}
                        <View style={{
                            flex: 1,
                            minWidth: 140,
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1.5,
                            borderColor: colors.stroke,
                            padding: 14,
                            gap: 6,
                        }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Total Feed</Text>
                                <MaterialIcons name="restaurant" size={18} color="#F59E0B" />
                            </View>
                            <Text style={{ fontSize: 20, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                {detailMetrics.totalFeedKg > 0 ? `${detailMetrics.totalFeedKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg` : '0 kg'}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textGrey }}>
                                Dispensed feed logs
                            </Text>
                        </View>
                    </View>

                    {/* Horizontal Scrollable Tabs */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                    >
                        {[
                            { id: 'overview' as TabType, label: 'Overview', icon: 'info' },
                            { id: 'growth' as TabType, label: `Weight (${weighSessions.length})`, icon: 'scale' },
                            { id: 'feed' as TabType, label: `Feed Logs (${dispenseRecords.length})`, icon: 'restaurant' },
                            { id: 'health' as TabType, label: `Health (${healthRecords.length})`, icon: 'medical-services' },
                            { id: 'vaccines' as TabType, label: `Vaccines (${vaccinationRecords.length})`, icon: 'vaccines' },
                        ].map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <TouchableOpacity
                                    key={tab.id}
                                    activeOpacity={0.7}
                                    onPress={() => setActiveTab(tab.id)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                        borderRadius: 20,
                                        backgroundColor: isActive ? colors.primary : colors.surface,
                                        borderWidth: 1,
                                        borderColor: isActive ? colors.primary : colors.stroke,
                                    }}
                                >
                                    <MaterialIcons name={tab.icon as any} size={16} color={isActive ? colors.onPrimary : colors.textGrey} />
                                    <Text style={{
                                        fontSize: 13,
                                        fontFamily: isActive ? 'Poppins-Bold' : 'Poppins-Medium',
                                        color: isActive ? colors.onPrimary : colors.text,
                                    }}>
                                        {tab.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Tab Content */}
                    {isLoadingDetail ? (
                        <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={{ color: colors.textGrey, marginTop: 12, fontSize: 13 }}>Loading batch details...</Text>
                        </View>
                    ) : (
                        <>
                            {/* TAB 1: OVERVIEW */}
                            {activeTab === 'overview' && (
                                <View style={{ gap: 14 }}>
                                    <View style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 16,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        padding: 16,
                                        gap: 12,
                                    }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, fontFamily: 'Poppins-Bold' }]}>
                                            Production Timeline & Lifecycle
                                        </Text>

                                        <View style={{ gap: 10 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey, fontSize: 13 }}>Arrival Date</Text>
                                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>{formatDate(selectedBatch.arrival_date)}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey, fontSize: 13 }}>Age at Arrival</Text>
                                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>{selectedBatch.age_at_arrival_days} day(s) old</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey }}>Harvest Date</Text>
                                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>{formatDate(selectedBatch.updated_at)}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey }}>Production Cycle</Text>
                                                <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Poppins-Bold' }}>{detailMetrics.cycleDays} days</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: colors.textGrey }}>Species</Text>
                                                <Text style={{ color: isPig ? '#EC4899' : '#F97316', fontSize: 13, fontFamily: 'Poppins-Bold', textTransform: 'capitalize' }}>
                                                    {isPig ? 'Pig / Swine' : 'Chicken / Broiler'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 16,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        padding: 16,
                                        gap: 12,
                                    }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, fontFamily: 'Poppins-Bold' }]}>
                                            Stock Movement & Yield
                                        </Text>

                                        <View style={{ gap: 10 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey, fontSize: 13 }}>Initial Started</Text>
                                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>{detailMetrics.initialHeads} heads</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey, fontSize: 13 }}>Harvested / Sold</Text>
                                                <Text style={{ color: '#10B981', fontSize: 13, fontFamily: 'Poppins-Bold' }}>{detailMetrics.finalHeads} heads</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.stroke + '40' }}>
                                                <Text style={{ color: colors.textGrey, fontSize: 13 }}>Mortality Loss</Text>
                                                <Text style={{ color: detailMetrics.totalMortalities > 0 ? '#EF4444' : colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>
                                                    {detailMetrics.totalMortalities} heads ({detailMetrics.mortalityRate.toFixed(1)}%)
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: colors.textGrey, fontSize: 13 }}>Livability Rate</Text>
                                                <Text style={{ color: '#10B981', fontSize: 13, fontFamily: 'Poppins-Bold' }}>{detailMetrics.survivalRate.toFixed(1)}%</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {selectedBatch.notes ? (
                                        <View style={{
                                            backgroundColor: colors.surface,
                                            borderRadius: 16,
                                            borderWidth: 1.5,
                                            borderColor: colors.stroke,
                                            padding: 16,
                                            gap: 6,
                                        }}>
                                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-Bold' }]}>
                                                Batch Notes
                                            </Text>
                                            <Text style={{ color: colors.textGrey, fontSize: 13, lineHeight: 18 }}>
                                                {selectedBatch.notes}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            )}

                            {/* TAB 2: WEIGHT & GROWTH */}
                            {activeTab === 'growth' && (
                                <View style={{ gap: 14 }}>
                                    <View style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 16,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        padding: 16,
                                        gap: 10,
                                    }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-Bold' }]}>
                                            Weight Classification Distribution
                                        </Text>

                                        {detailMetrics.totalWeighed === 0 ? (
                                            <Text style={{ color: colors.textGrey, fontSize: 13 }}>No scale weight classifications recorded.</Text>
                                        ) : (
                                            <>
                                                <View style={{ height: 12, borderRadius: 6, flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.stroke + '40' }}>
                                                    <View style={{ width: `${(detailMetrics.normalCount / detailMetrics.totalWeighed) * 100}%`, backgroundColor: '#10B981' }} />
                                                    <View style={{ width: `${(detailMetrics.underweightCount / detailMetrics.totalWeighed) * 100}%`, backgroundColor: '#F59E0B' }} />
                                                    <View style={{ width: `${(detailMetrics.overweightCount / detailMetrics.totalWeighed) * 100}%`, backgroundColor: '#EF4444' }} />
                                                </View>

                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                                                        <Text style={{ fontSize: 12, color: colors.textGrey }}>
                                                            Normal: <Text style={{ color: colors.text, fontFamily: 'Poppins-Bold' }}>{detailMetrics.normalCount}</Text>
                                                        </Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
                                                        <Text style={{ fontSize: 12, color: colors.textGrey }}>
                                                            Underweight: <Text style={{ color: colors.text, fontFamily: 'Poppins-Bold' }}>{detailMetrics.underweightCount}</Text>
                                                        </Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                                                        <Text style={{ fontSize: 12, color: colors.textGrey }}>
                                                            Overweight: <Text style={{ color: colors.text, fontFamily: 'Poppins-Bold' }}>{detailMetrics.overweightCount}</Text>
                                                        </Text>
                                                    </View>
                                                </View>
                                            </>
                                        )}
                                    </View>

                                    {/* Weighing Logs List */}
                                    {weighSessions.length === 0 ? (
                                        <View style={{ padding: 24, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.stroke }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 13 }}>No weighing sessions recorded for this batch.</Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 8 }}>
                                            {paginatedWeighSessions.map((w, idx) => {
                                                const isNormal = w.status === 'normal';
                                                const isUnder = w.status === 'underweight';
                                                const statusColor = isNormal ? '#10B981' : isUnder ? '#F59E0B' : '#EF4444';
                                                const avgGrams = getWeighGrams(w);

                                                return (
                                                    <View key={w.id || idx} style={{
                                                        backgroundColor: colors.surface,
                                                        borderRadius: 14,
                                                        borderWidth: 1,
                                                        borderColor: colors.stroke,
                                                        padding: 12,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                    }}>
                                                        <View style={{ gap: 2 }}>
                                                            <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>
                                                                {formatDateTime(w.recorded_at)}
                                                            </Text>
                                                            <Text style={{ color: colors.textGrey, fontSize: 11 }}>
                                                                Mode: {formatWeighMode(w.weigh_mode)}
                                                            </Text>
                                                        </View>
                                                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                                            <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Poppins-Bold' }}>
                                                                {avgGrams > 0 ? `${(avgGrams / 1000).toFixed(2)} kg` : '—'}
                                                            </Text>
                                                            <View style={{ backgroundColor: statusColor + '1A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                                                                <Text style={{ color: statusColor, fontSize: 10, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>
                                                                    {w.status}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                );
                                            })}

                                            {/* Pagination */}
                                            {weighSessions.length > ITEMS_PER_PAGE && (
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                    <TouchableOpacity
                                                        disabled={weighPage === 1}
                                                        onPress={() => setWeighPage(p => Math.max(1, p - 1))}
                                                        style={{ opacity: weighPage === 1 ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Previous</Text>
                                                    </TouchableOpacity>
                                                    <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                        Page {weighPage} of {Math.ceil(weighSessions.length / ITEMS_PER_PAGE)}
                                                    </Text>
                                                    <TouchableOpacity
                                                        disabled={weighPage >= Math.ceil(weighSessions.length / ITEMS_PER_PAGE)}
                                                        onPress={() => setWeighPage(p => Math.min(Math.ceil(weighSessions.length / ITEMS_PER_PAGE), p + 1))}
                                                        style={{ opacity: weighPage >= Math.ceil(weighSessions.length / ITEMS_PER_PAGE) ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Next</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* TAB 3: FEED LOGS */}
                            {activeTab === 'feed' && (
                                <View style={{ gap: 14 }}>
                                    <View style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 16,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        padding: 16,
                                        gap: 10,
                                    }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-Bold' }]}>
                                            Feed Dispense Breakdown
                                        </Text>

                                        {detailMetrics.feedBreakdown.length === 0 ? (
                                            <Text style={{ color: colors.textGrey, fontSize: 13 }}>No dispense records logged.</Text>
                                        ) : (
                                            <View style={{ gap: 8 }}>
                                                {detailMetrics.feedBreakdown.map((f, i) => (
                                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                                                        <View>
                                                            <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>{f.name}</Text>
                                                            <Text style={{ color: colors.textGrey, fontSize: 11 }}>Brand: {f.brand}</Text>
                                                        </View>
                                                        <Text style={{ color: '#F59E0B', fontSize: 14, fontFamily: 'Poppins-Bold' }}>
                                                            {(f.totalGrams / 1000).toFixed(1)} kg
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>

                                    {/* Dispense Records List */}
                                    {dispenseRecords.length === 0 ? (
                                        <View style={{ padding: 24, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.stroke }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 13 }}>No dispense events recorded.</Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 8 }}>
                                            {paginatedDispenseRecords.map((r, idx) => (
                                                <View key={r.id || idx} style={{
                                                    backgroundColor: colors.surface,
                                                    borderRadius: 14,
                                                    borderWidth: 1,
                                                    borderColor: colors.stroke,
                                                    padding: 12,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                }}>
                                                    <View style={{ gap: 2 }}>
                                                        <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>
                                                            {r.feeds?.name || 'Standard Feed'}
                                                        </Text>
                                                        <Text style={{ color: colors.textGrey, fontSize: 11 }}>
                                                            {formatDateTime(r.dispensed_at)} • Trigger: {r.triggered_by || 'schedule'}
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                                        <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Poppins-Bold' }}>
                                                            {r.grams_dispensed >= 1000 ? `${(r.grams_dispensed / 1000).toFixed(2)} kg` : `${r.grams_dispensed} g`}
                                                        </Text>
                                                        <View style={{ backgroundColor: r.status === 'success' ? '#10B9811A' : '#EF44441A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                                                            <Text style={{ color: r.status === 'success' ? '#10B981' : '#EF4444', fontSize: 10, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>
                                                                {r.status || 'Success'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            ))}

                                            {/* Pagination */}
                                            {dispenseRecords.length > ITEMS_PER_PAGE && (
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                    <TouchableOpacity
                                                        disabled={feedPage === 1}
                                                        onPress={() => setFeedPage(p => Math.max(1, p - 1))}
                                                        style={{ opacity: feedPage === 1 ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Previous</Text>
                                                    </TouchableOpacity>
                                                    <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                        Page {feedPage} of {Math.ceil(dispenseRecords.length / ITEMS_PER_PAGE)}
                                                    </Text>
                                                    <TouchableOpacity
                                                        disabled={feedPage >= Math.ceil(dispenseRecords.length / ITEMS_PER_PAGE)}
                                                        onPress={() => setFeedPage(p => Math.min(Math.ceil(dispenseRecords.length / ITEMS_PER_PAGE), p + 1))}
                                                        style={{ opacity: feedPage >= Math.ceil(dispenseRecords.length / ITEMS_PER_PAGE) ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Next</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* TAB 4: HEALTH & MORTALITY */}
                            {activeTab === 'health' && (
                                <View style={{ gap: 10 }}>
                                    {healthRecords.length === 0 ? (
                                        <View style={{ padding: 24, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.stroke }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 13 }}>No health incidents or mortality events logged.</Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 8 }}>
                                            {paginatedHealthRecords.map((h, idx) => {
                                                const isMortality = h.record_type === 'mortality';
                                                const sevColor = h.severity === 'high' ? '#EF4444' : h.severity === 'medium' ? '#F59E0B' : '#10B981';

                                                return (
                                                    <View key={h.id || idx} style={{
                                                        backgroundColor: colors.surface,
                                                        borderRadius: 14,
                                                        borderWidth: 1,
                                                        borderColor: colors.stroke,
                                                        padding: 12,
                                                        gap: 8,
                                                    }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                                            <View style={{ flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                <View style={{ backgroundColor: isMortality ? '#EF44441A' : colors.primary + '1A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                                                                    <Text style={{ color: isMortality ? '#EF4444' : colors.primary, fontSize: 10, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>
                                                                        {h.record_type}
                                                                    </Text>
                                                                </View>
                                                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-Bold', flexShrink: 1 }}>{h.title}</Text>
                                                            </View>
                                                            <Text style={{ color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Medium', alignSelf: 'flex-start' }}>{formatDate(h.record_date)}</Text>
                                                        </View>

                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                            <Text style={{ color: isMortality ? '#EF4444' : colors.text, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>
                                                                Affected: {h.affected_count || 1} head(s)
                                                            </Text>
                                                            <View style={{ backgroundColor: sevColor + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                                <Text style={{ color: sevColor, fontSize: 10, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>{h.severity}</Text>
                                                            </View>
                                                        </View>

                                                        {h.medication ? (
                                                            <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                                Rx: <Text style={{ color: colors.text, fontFamily: 'Poppins-Medium' }}>{h.medication} ({h.dosage || 'Standard'})</Text>
                                                            </Text>
                                                        ) : null}

                                                        {h.notes ? (
                                                            <Text style={{ color: colors.textGrey, fontSize: 12, fontStyle: 'italic', lineHeight: 16 }}>{h.notes}</Text>
                                                        ) : null}
                                                    </View>
                                                );
                                            })}

                                            {healthRecords.length > ITEMS_PER_PAGE && (
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                    <TouchableOpacity
                                                        disabled={healthPage === 1}
                                                        onPress={() => setHealthPage(p => Math.max(1, p - 1))}
                                                        style={{ opacity: healthPage === 1 ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Previous</Text>
                                                    </TouchableOpacity>
                                                    <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                        Page {healthPage} of {Math.ceil(healthRecords.length / ITEMS_PER_PAGE)}
                                                    </Text>
                                                    <TouchableOpacity
                                                        disabled={healthPage >= Math.ceil(healthRecords.length / ITEMS_PER_PAGE)}
                                                        onPress={() => setHealthPage(p => Math.min(Math.ceil(healthRecords.length / ITEMS_PER_PAGE), p + 1))}
                                                        style={{ opacity: healthPage >= Math.ceil(healthRecords.length / ITEMS_PER_PAGE) ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Next</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* TAB 5: VACCINATIONS */}
                            {activeTab === 'vaccines' && (
                                <View style={{ gap: 10 }}>
                                    {vaccinationRecords.length === 0 ? (
                                        <View style={{ padding: 24, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.stroke }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 13 }}>No vaccination records logged.</Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 8 }}>
                                            {paginatedVaccinationRecords.map((v, idx) => (
                                                <View key={v.id || idx} style={{
                                                    backgroundColor: colors.surface,
                                                    borderRadius: 14,
                                                    borderWidth: 1,
                                                    borderColor: colors.stroke,
                                                    padding: 12,
                                                    gap: 8,
                                                }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                                        <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Poppins-Bold', flex: 1, minWidth: 160 }}>
                                                            {v.vaccine_name}
                                                        </Text>
                                                        <Text style={{ color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Medium', alignSelf: 'flex-start' }}>{formatDate(v.administered_date)}</Text>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                        <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                            Heads: <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{v.animals_vaccinated || 'Cohort'}</Text>
                                                        </Text>
                                                        <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                            Dose: <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{v.dose_per_animal ? `${v.dose_per_animal} ${v.unit || 'dose'}` : 'Standard'}</Text>
                                                        </Text>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                        <Text style={{ color: colors.textGrey, fontSize: 11, flexShrink: 1 }}>
                                                            Administered by: <Text style={{ color: colors.text, fontFamily: 'Poppins-Medium' }}>{v.administered_by || 'Veterinarian'}</Text>
                                                        </Text>
                                                        {v.lot_number ? (
                                                            <Text style={{ color: colors.textGrey, fontSize: 11 }}>
                                                                Lot #: <Text style={{ color: colors.text, fontFamily: 'Poppins-Medium' }}>{v.lot_number}</Text>
                                                            </Text>
                                                        ) : null}
                                                    </View>
                                                </View>
                                            ))}

                                            {vaccinationRecords.length > ITEMS_PER_PAGE && (
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                    <TouchableOpacity
                                                        disabled={vaccinePage === 1}
                                                        onPress={() => setVaccinePage(p => Math.max(1, p - 1))}
                                                        style={{ opacity: vaccinePage === 1 ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Previous</Text>
                                                    </TouchableOpacity>
                                                    <Text style={{ color: colors.textGrey, fontSize: 12 }}>
                                                        Page {vaccinePage} of {Math.ceil(vaccinationRecords.length / ITEMS_PER_PAGE)}
                                                    </Text>
                                                    <TouchableOpacity
                                                        disabled={vaccinePage >= Math.ceil(vaccinationRecords.length / ITEMS_PER_PAGE)}
                                                        onPress={() => setVaccinePage(p => Math.min(Math.ceil(vaccinationRecords.length / ITEMS_PER_PAGE), p + 1))}
                                                        style={{ opacity: vaccinePage >= Math.ceil(vaccinationRecords.length / ITEMS_PER_PAGE) ? 0.4 : 1, padding: 8 }}
                                                    >
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold' }}>Next</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            </View>
        );
    }

    // ─── RENDER: FARM BATCH ARCHIVE LIST VIEW ─────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }}>
            {/* Header Bar */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: hPad,
                paddingTop: 16,
                paddingBottom: 16,
                minHeight: 56,
            }}>
                <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
                    <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                </View>
                <Text
                    style={[textStyles.h1, { fontSize: 18, color: colors.primary, textAlign: 'center', flex: 1, paddingHorizontal: 6 }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                >
                    Batch History Archive
                </Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: hPad, paddingVertical: 16, gap: 16 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => fetchCompletedBatches(true)}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {/* Rollup Farm Stats Grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{
                        flex: 1,
                        minWidth: 125,
                        backgroundColor: colors.surface,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: colors.stroke,
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <View style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: colors.primary + '1A',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <MaterialIcons name="inventory-2" size={22} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Medium' }} numberOfLines={2}>Completed</Text>
                            <Text style={{ fontSize: 18, fontFamily: 'Poppins-Bold', color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>
                                {farmStats.totalCompleted}
                            </Text>
                        </View>
                    </View>

                    <View style={{
                        flex: 1,
                        minWidth: 140,
                        backgroundColor: colors.surface,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: colors.stroke,
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <View style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: '#10B9811A',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <MaterialIcons name="shopping-cart-checkout" size={22} color="#10B981" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Medium' }} numberOfLines={2}>Harvested Animals</Text>
                            <Text style={{ fontSize: 18, fontFamily: 'Poppins-Bold', color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>
                                {farmStats.totalSold.toLocaleString()} heads
                            </Text>
                        </View>
                    </View>

                    <View style={{
                        flex: 1,
                        minWidth: 125,
                        backgroundColor: colors.surface,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: colors.stroke,
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <View style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: '#6366F11A',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <MaterialIcons name="task-alt" size={22} color="#6366F1" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Medium' }} numberOfLines={2}>Livability</Text>
                            <Text style={{ fontSize: 18, fontFamily: 'Poppins-Bold', color: '#10B981' }} numberOfLines={1} adjustsFontSizeToFit>
                                {farmStats.overallSurvival}%
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Search Bar */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.inputFill || colors.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    paddingHorizontal: 14,
                    height: 46,
                }}>
                    <MaterialIcons name="search" size={20} color={colors.textGrey} style={{ marginRight: 8 }} />
                    <TextInput
                        style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 13 }]}
                        placeholder="Search completed batch, supplier, housing..."
                        placeholderTextColor={colors.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <MaterialIcons name="close" size={18} color={colors.textGrey} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filter Pills Row */}
                <View style={{ gap: 10 }}>
                    {/* Species Selector Pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {[
                            { id: 'all', label: `All Species (${batches.length})` },
                            { id: 'chicken', label: `Chickens (${farmStats.chickenBatches})` },
                            { id: 'pig', label: `Pigs (${farmStats.pigBatches})` },
                        ].map(spec => {
                            const isActive = speciesFilter === spec.id;
                            return (
                                <TouchableOpacity
                                    key={spec.id}
                                    activeOpacity={0.7}
                                    onPress={() => setSpeciesFilter(spec.id as any)}
                                    style={{
                                        paddingHorizontal: 14,
                                        paddingVertical: 8,
                                        borderRadius: 20,
                                        backgroundColor: isActive ? colors.primary : colors.surface,
                                        borderWidth: 1,
                                        borderColor: isActive ? colors.primary : colors.stroke,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 12,
                                        fontFamily: isActive ? 'Poppins-Bold' : 'Poppins-Medium',
                                        color: isActive ? colors.onPrimary : colors.text,
                                    }}>
                                        {spec.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Dropdown Action Controls: Housing Filter & Sort */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setHousingModalVisible(true)}
                            style={{
                                flex: 1,
                                height: 40,
                                borderRadius: 12,
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                paddingHorizontal: 12,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <MaterialIcons name="house-siding" size={16} color={colors.primary} />
                                <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>
                                    {housingFilter === 'all' ? 'All Housings' : (housings.find(h => h.id === housingFilter)?.name || 'Housing')}
                                </Text>
                            </View>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setSortModalVisible(true)}
                            style={{
                                flex: 1,
                                height: 40,
                                borderRadius: 12,
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                paddingHorizontal: 12,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <MaterialIcons name="sort" size={16} color={colors.primary} />
                                <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>
                                    {getSortOptionLabel(sortBy)}
                                </Text>
                            </View>
                            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Batch Cards List */}
                {isLoadingList ? (
                    <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={{ color: colors.textGrey, marginTop: 10, fontSize: 13 }}>Fetching completed batch history...</Text>
                    </View>
                ) : filteredBatches.length === 0 ? (
                    <View style={{
                        paddingVertical: 48,
                        paddingHorizontal: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.surface,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: colors.stroke,
                        marginTop: 10,
                    }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <MaterialIcons name="history" size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 17, textAlign: 'center' }]}>
                            No Completed Batches Found
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 }]}>
                            No completed livestock batches match your current search or filter criteria.
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 12 }}>
                        {filteredBatches.map(batch => {
                            const isPig = batch.animal_type === 'pig';
                            const accentColor = isPig ? '#EC4899' : '#F97316';
                            const sold = batch.sold_count || batch.current_count || 0;
                            const initial = batch.estimated_count || 0;
                            const survivalPct = initial > 0 ? Math.min(100, (sold / initial) * 100).toFixed(1) : '0';

                            return (
                                <TouchableOpacity
                                    key={batch.id}
                                    activeOpacity={0.7}
                                    onPress={() => setSelectedBatch(batch)}
                                    style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 18,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        padding: 16,
                                        gap: 12,
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                            <View style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 12,
                                                backgroundColor: accentColor + '1F',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                <AnimalIcon type={batch.animal_type} size={24} color={accentColor} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 16, fontFamily: 'Poppins-Bold' }]}>
                                                    {batch.name}
                                                </Text>
                                                <Text style={{ color: colors.textGrey, fontSize: 12, marginTop: 1 }}>
                                                    Housing: <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{batch.housings?.name || 'General'}</Text>
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ backgroundColor: '#10B9811A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                            <Text style={{ color: '#10B981', fontSize: 11, fontFamily: 'Poppins-Bold' }}>
                                                {survivalPct}% Livability
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: 10,
                                        borderTopWidth: 1,
                                        borderTopColor: colors.stroke + '40',
                                    }}>
                                        <View style={{ gap: 2 }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 11 }}>Finished Yield</Text>
                                            <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins-Bold' }}>
                                                {sold} / {initial} heads
                                            </Text>
                                        </View>

                                        <View style={{ gap: 2, alignItems: 'flex-end' }}>
                                            <Text style={{ color: colors.textGrey, fontSize: 11 }}>Harvest Date</Text>
                                            <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>
                                                {formatDate(batch.updated_at)}
                                            </Text>
                                        </View>
                                    </View>

                                    {batch.supplier ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <MaterialIcons name="local-shipping" size={14} color={colors.textGrey} />
                                            <Text style={{ color: colors.textGrey, fontSize: 11 }}>
                                                Supplier: <Text style={{ color: colors.text, fontFamily: 'Poppins-Medium' }}>{batch.supplier}</Text>
                                            </Text>
                                        </View>
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            {/* Modals for Dropdowns */}
            <SelectionModal
                visible={housingModalVisible}
                onClose={() => setHousingModalVisible(false)}
                onSelect={handleSelectHousingName}
                title="Filter by Housing"
                description="Select a housing facility to view completed batches"
                icon="house-siding"
                options={housingOptions}
                selectedValue={housingFilter === 'all' ? 'All Housings' : (housings.find(h => h.id === housingFilter)?.name || 'All Housings')}
            />

            <SelectionModal
                visible={sortModalVisible}
                onClose={() => setSortModalVisible(false)}
                onSelect={handleSelectSortLabel}
                title="Sort Batch History"
                description="Select an ordering preference for completed batches"
                icon="sort"
                options={sortOptions}
                selectedValue={getSortOptionLabel(sortBy)}
            />
        </View>
    );
}

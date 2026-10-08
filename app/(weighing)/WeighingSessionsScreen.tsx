import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import ActionModal from '@/components/ActionModal';
import { CalendarPickerModal } from '@/components/CalendarPickerModal';
import { SelectionModal } from '@/components/SelectionModal';
import { PrintReportButton } from '@/components/PrintReportButton';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { ReportDocument, ReportSection, ReportChart, formatReportUserRole, formatReportUserName } from '@/lib/pdfReport';
import { createNotification } from '@/lib/notify';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';

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

interface WeighingSessionRow {
    id: string;
    farm_day: number | null;
    expected_quantity: number;
    completed_quantity: number;
    status: 'in_progress' | 'completed' | 'cancelled';
    created_at: string;
    completed_at: string | null;
}

interface ChildWeighRow {
    weighing_session_id: string | null;
    net_weight_grams: number;
}

interface RangeWeighRow {
    net_weight_grams: number;
    status: 'underweight' | 'normal' | 'overweight' | 'invalid';
    recorded_at: string;
}

interface BatchStats {
    total: number;
    avgG: number;
    growthRateGPerDay: number | null; // linear-regression slope across this batch's own full history
    firstFarmDay: number | null;
    lastFarmDay: number | null;
}

interface DayGroup {
    dateKey: string;
    label: string;
    weekday: string;
    count: number;
    avgG: number;
    minG: number;
    maxG: number;
    under: number;
    normal: number;
    over: number;
}

type RangeMode = 'week1' | 'week2' | 'week3' | 'week4' | 'full' | 'custom';

// UTC getters throughout — every date this screen deals with (farm-day
// conversions, YYYY-MM-DD grouping keys) is UTC-anchored on purpose (see
// calendarDateForFarmDay below); using local getters here would display a
// different calendar day than the one actually being reported on.
function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Farm day N -> the calendar date it falls on, given the batch's own
// arrival_date/age_at_arrival_days (same relationship GrowthReportScreen's
// currentDay uses, just inverted): calendarDate = arrival_date + (N - age).
//
// Anchored in UTC on purpose (Date.UTC, not setHours/setDate) — using
// local-timezone methods here would shift the day boundary by the
// device's UTC offset, silently excluding real rows from the report on
// any phone not set to UTC+0.
function calendarDateForFarmDay(batch: BatchInfo, farmDay: number): Date {
    const arrival = new Date(batch.arrival_date);
    const arrivalUtcMidnight = Date.UTC(arrival.getUTCFullYear(), arrival.getUTCMonth(), arrival.getUTCDate());
    const dayOffset = farmDay - (batch.age_at_arrival_days || 0);
    return new Date(arrivalUtcMidnight + dayOffset * 86400000);
}

// Inverse of the above — an actual picked calendar date (YYYY-MM-DD, from
// the calendar picker) back to a farm-day number, for the custom range.
function farmDayForDate(batch: BatchInfo, dateStr: string): number {
    const arrival = new Date(batch.arrival_date);
    const arrivalUtcMidnight = Date.UTC(arrival.getUTCFullYear(), arrival.getUTCMonth(), arrival.getUTCDate());
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetUtcMidnight = Date.UTC(y, m - 1, d);
    const diffDays = Math.round((targetUtcMidnight - arrivalUtcMidnight) / 86400000);
    return diffDays + (batch.age_at_arrival_days || 0);
}

function weekdayName(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export default function WeighingSessionsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const router = useRouter();

    const { profile } = useAuth();
    const { activeFarmIds, managedFarms } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const currentFarm = managedFarms.find(f => f.id === farmId);
    const [farmName, setFarmName] = useState<string>(currentFarm?.name || (profile as any)?.farm_name || (profile as any)?.farmName || '');

    useEffect(() => {
        if (currentFarm?.name) {
            setFarmName(currentFarm.name);
        }
    }, [currentFarm?.name]);

    const [animalType, setAnimalType] = useState<'pig' | 'chicken'>('pig');
    const [allHousings, setAllHousings] = useState<HousingInfo[]>([]);
    const [selectedHousingId, setSelectedHousingId] = useState<string | null>(null);
    const [allBatches, setAllBatches] = useState<BatchInfo[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [sessions, setSessions] = useState<WeighingSessionRow[]>([]);
    const [childRows, setChildRows] = useState<ChildWeighRow[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    // ── Report range + preview ─────────────────────────────────────
    const [rangeMode, setRangeMode] = useState<RangeMode>('full');
    const [customFromDate, setCustomFromDate] = useState<string | null>(null);
    const [customToDate, setCustomToDate] = useState<string | null>(null);
    const [fromDateModalVisible, setFromDateModalVisible] = useState(false);
    const [toDateModalVisible, setToDateModalVisible] = useState(false);
    const [rangeRows, setRangeRows] = useState<RangeWeighRow[]>([]);
    const [rangeFeedGrams, setRangeFeedGrams] = useState<number | null>(null);
    const [isRangeLoading, setIsRangeLoading] = useState(false);

    // ── Previous batch comparison (same house, batch before this one) ──
    const [previousBatch, setPreviousBatch] = useState<BatchInfo | null>(null);
    const [previousBatchStats, setPreviousBatchStats] = useState<BatchStats | null>(null);
    const [currentBatchStats, setCurrentBatchStats] = useState<BatchStats | null>(null);
    const [isComparisonLoading, setIsComparisonLoading] = useState(false);

    // ── Delete Session State ──────────────────────────────────────
    const [sessionToDelete, setSessionToDelete] = useState<WeighingSessionRow | null>(null);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [isDeletingSession, setIsDeletingSession] = useState(false);

    const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: SnackbarType }>({ visible: false, message: '', type: 'info' });
    const showSnackbar = (message: string, type: SnackbarType = 'info') => setSnackbar({ visible: true, message, type });

    const filteredHousings = allHousings.filter(h => h.animal_type === animalType);
    const selectedHousing = allHousings.find(h => h.id === selectedHousingId) ?? null;
    const filteredBatches = useMemo(() => allBatches.filter(b => b.housing_id === selectedHousingId), [allBatches, selectedHousingId]);
    const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) ?? null;

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
            console.warn('[WeighingSessionsScreen] Failed to save selection preference:', err);
        }
    }, [farmId]);

    const fetchSessions = useCallback(async (batchId: string) => {
        setIsSessionsLoading(true);
        try {
            const [sessionsRes, childRes] = await Promise.all([
                supabase.from('weighing_sessions')
                    .select('id, farm_day, expected_quantity, completed_quantity, status, created_at, completed_at')
                    .eq('batch_id', batchId)
                    .gt('completed_quantity', 0)
                    .order('farm_day', { ascending: true, nullsFirst: false })
                    .order('created_at', { ascending: true }),
                supabase.from('weigh_sessions')
                    .select('weighing_session_id, net_weight_grams')
                    .eq('batch_id', batchId)
                    .not('weighing_session_id', 'is', null),
            ]);
            if (sessionsRes.error) throw sessionsRes.error;
            if (childRes.error) throw childRes.error;
            setSessions((sessionsRes.data || []) as WeighingSessionRow[]);
            setChildRows((childRes.data || []) as ChildWeighRow[]);
        } catch (err) {
            console.error('[WeighingSessionsScreen] sessions error:', err);
        } finally {
            setIsSessionsLoading(false);
        }
    }, []);

    const fetchMetadata = useCallback(async () => {
        if (!farmId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const [housingsRes, batchesRes, farmRes, rawPref] = await Promise.all([
                supabase.from('housings').select('id, name, animal_type, status, current_count')
                    .eq('farm_id', farmId).eq('status', 'Active').order('name', { ascending: true }),
                supabase.from('batches').select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id, housings!inner(farm_id)')
                    .eq('housings.farm_id', farmId).eq('status', 'active').order('arrival_date', { ascending: false }),
                supabase.from('farms').select('name').eq('id', farmId).maybeSingle(),
                AsyncStorage.getItem(`analytics_active_selection_${farmId}`).catch(() => null),
            ]);
            if (housingsRes.error) throw housingsRes.error;
            if (batchesRes.error) throw batchesRes.error;
            if (farmRes.data?.name) {
                setFarmName(farmRes.data.name);
            }
            const housingsData = (housingsRes.data || []) as HousingInfo[];
            const batchesData = (batchesRes.data || []) as BatchInfo[];

            let savedPref: any = null;
            if (rawPref) {
                try {
                    savedPref = JSON.parse(rawPref);
                } catch {}
            }

            const savedLastAnimalType = savedPref?.lastAnimalType || savedPref?.animalType;
            let effectiveAnimalType: 'pig' | 'chicken' = 'pig';
            if (savedLastAnimalType === 'pig' || savedLastAnimalType === 'chicken') {
                effectiveAnimalType = savedLastAnimalType;
            }

            const typePref = savedPref?.[effectiveAnimalType] || (savedPref?.animalType === effectiveAnimalType ? savedPref : undefined);
            const savedHousingId = typePref?.housingId;
            const savedBatchId = typePref?.batchId;

            const filteredH = housingsData.filter(h => h.animal_type === effectiveAnimalType);
            let targetHousingId: string | null = null;
            let targetBatchId: string | null = null;

            if (filteredH.length > 0) {
                const targetHousing = (savedHousingId && filteredH.find(h => h.id === savedHousingId)) || filteredH[0];
                targetHousingId = targetHousing.id;

                const filteredB = batchesData.filter(b => b.housing_id === targetHousingId);
                if (filteredB.length > 0) {
                    const targetBatch = (savedBatchId && filteredB.find(b => b.id === savedBatchId)) || filteredB[0];
                    targetBatchId = targetBatch.id;
                }
            }

            setAllHousings(housingsData);
            setAllBatches(batchesData);
            setAnimalType(effectiveAnimalType);
            setSelectedHousingId(targetHousingId);
            setSelectedBatchId(targetBatchId);

            if (targetHousingId && targetBatchId) {
                saveSelectionPreference(effectiveAnimalType, targetHousingId, targetBatchId);
                await fetchSessions(targetBatchId);
            } else {
                setSessions([]);
                setChildRows([]);
                saveSelectionPreference(effectiveAnimalType, targetHousingId, null);
            }
        } catch (err) {
            console.error('[WeighingSessionsScreen] metadata error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [farmId, saveSelectionPreference, fetchSessions]);

    const handleSwitchAnimalType = useCallback(async (type: 'pig' | 'chicken') => {
        if (type === animalType) return;
        setAnimalType(type);

        let savedHousingId: string | null = null;
        let savedBatchId: string | null = null;
        if (farmId) {
            try {
                const rawPref = await AsyncStorage.getItem(`analytics_active_selection_${farmId}`);
                if (rawPref) {
                    const parsed = JSON.parse(rawPref);
                    const typePref = parsed[type] || (parsed.animalType === type ? parsed : undefined);
                    if (typePref) {
                        savedHousingId = typePref.housingId || null;
                        savedBatchId = typePref.batchId || null;
                    }
                }
            } catch {}
        }

        const targetHousings = allHousings.filter(h => h.animal_type === type);
        if (targetHousings.length > 0) {
            const nextHousing = (savedHousingId && targetHousings.find(h => h.id === savedHousingId)) || targetHousings[0];
            const nextHousingId = nextHousing.id;
            setSelectedHousingId(nextHousingId);

            const targetBatches = allBatches.filter(b => b.housing_id === nextHousingId);
            if (targetBatches.length > 0) {
                const nextBatch = (savedBatchId && targetBatches.find(b => b.id === savedBatchId)) || targetBatches[0];
                const nextBatchId = nextBatch.id;
                setSelectedBatchId(nextBatchId);
                saveSelectionPreference(type, nextHousingId, nextBatchId);
                fetchSessions(nextBatchId);
            } else {
                setSelectedBatchId(null);
                setSessions([]);
                setChildRows([]);
                saveSelectionPreference(type, nextHousingId, null);
            }
        } else {
            setSelectedHousingId(null);
            setSelectedBatchId(null);
            setSessions([]);
            setChildRows([]);
            saveSelectionPreference(type, null, null);
        }
    }, [animalType, farmId, allHousings, allBatches, fetchSessions, saveSelectionPreference]);

    const handleSelectHousing = useCallback((housingId: string) => {
        if (housingId === selectedHousingId) return;
        setSelectedHousingId(housingId);
        const targetBatches = allBatches.filter(b => b.housing_id === housingId);
        if (targetBatches.length > 0) {
            const nextBatchId = targetBatches[0].id;
            setSelectedBatchId(nextBatchId);
            saveSelectionPreference(animalType, housingId, nextBatchId);
            fetchSessions(nextBatchId);
        } else {
            setSelectedBatchId(null);
            setSessions([]);
            setChildRows([]);
            saveSelectionPreference(animalType, housingId, null);
        }
    }, [selectedHousingId, animalType, allBatches, fetchSessions, saveSelectionPreference]);

    const handleSelectBatch = useCallback((batchId: string) => {
        if (batchId === selectedBatchId) return;
        setSelectedBatchId(batchId);
        saveSelectionPreference(animalType, selectedHousingId, batchId);
        fetchSessions(batchId);
    }, [selectedBatchId, animalType, selectedHousingId, fetchSessions, saveSelectionPreference]);

    useEffect(() => { fetchMetadata(); }, [fetchMetadata]);

    // Default the custom-range calendar to the batch's own arrival date ->
    // today whenever the batch changes, so the picker opens somewhere
    // sensible instead of blank.
    useEffect(() => {
        if (selectedBatch) {
            setCustomFromDate(selectedBatch.arrival_date);
            setCustomToDate(new Date().toLocaleDateString('en-CA'));
        }
    }, [selectedBatch?.id]);

    // ── Resolve the current range to [fromDay, toDay] farm-day numbers ──
    const currentDay = useMemo(() => {
        if (!selectedBatch?.arrival_date) return null;
        const arrivalDate = new Date(selectedBatch.arrival_date);
        const today = new Date();
        arrivalDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays) + (selectedBatch.age_at_arrival_days || 0);
    }, [selectedBatch]);

    const resolvedRange = useMemo((): { fromDay: number; toDay: number } | null => {
        if (!selectedBatch) return null;
        switch (rangeMode) {
            case 'week1': return { fromDay: 1, toDay: 7 };
            case 'week2': return { fromDay: 8, toDay: 14 };
            case 'week3': return { fromDay: 15, toDay: 21 };
            case 'week4': return { fromDay: 22, toDay: 28 };
            case 'full': return { fromDay: 0, toDay: Math.max(currentDay ?? 0, 1) };
            case 'custom': {
                if (!customFromDate || !customToDate) return null;
                if (customFromDate > customToDate) return null;
                return {
                    fromDay: farmDayForDate(selectedBatch, customFromDate),
                    toDay: farmDayForDate(selectedBatch, customToDate),
                };
            }
        }
    }, [rangeMode, selectedBatch, currentDay, customFromDate, customToDate]);

    const fetchRangePreview = useCallback(async () => {
        if (!selectedBatch || !resolvedRange) { setRangeRows([]); setRangeFeedGrams(null); return; }
        setIsRangeLoading(true);
        try {
            const startDate = calendarDateForFarmDay(selectedBatch, resolvedRange.fromDay);
            // End of that UTC day — same reasoning as calendarDateForFarmDay,
            // avoid local-timezone-dependent setHours().
            const endDate = new Date(calendarDateForFarmDay(selectedBatch, resolvedRange.toDay).getTime() + 86400000 - 1);

            const [weighRes, feedRes] = await Promise.all([
                supabase.from('weigh_sessions').select('net_weight_grams, status, recorded_at')
                    .eq('batch_id', selectedBatch.id)
                    .neq('status', 'invalid')
                    .gte('recorded_at', startDate.toISOString())
                    .lte('recorded_at', endDate.toISOString())
                    .order('recorded_at', { ascending: true }),
                supabase.from('dispense_records').select('grams_dispensed')
                    .eq('batch_id', selectedBatch.id)
                    .eq('status', 'success')
                    .gte('dispensed_at', startDate.toISOString())
                    .lte('dispensed_at', endDate.toISOString()),
            ]);
            setRangeRows((weighRes.data || []) as RangeWeighRow[]);
            setRangeFeedGrams(feedRes.data ? feedRes.data.reduce((s, r: any) => s + r.grams_dispensed, 0) : null);
        } catch (err) {
            console.error('[WeighingSessionsScreen] range preview error:', err);
        } finally {
            setIsRangeLoading(false);
        }
    }, [selectedBatch, resolvedRange]);

    useEffect(() => { fetchRangePreview(); }, [fetchRangePreview]);

    // Full-history stats for one batch — independent of whatever report
    // range is currently selected, since a fair batch-vs-batch comparison
    // shouldn't depend on which range the user happens to be previewing.
    const computeBatchStats = useCallback(async (batch: BatchInfo): Promise<BatchStats | null> => {
        const { data, error } = await supabase.from('weigh_sessions')
            .select('net_weight_grams, recorded_at')
            .eq('batch_id', batch.id)
            .neq('status', 'invalid')
            .order('recorded_at', { ascending: true });
        if (error || !data || data.length === 0) return null;

        const total = data.length;
        const avgG = data.reduce((s, r: any) => s + r.net_weight_grams, 0) / total;

        // Daily averages -> farm-day numbers -> simple linear regression,
        // same idea PredictionReportScreen.tsx already uses for its own
        // growth-rate figure, just scoped to this one batch's full history.
        const byDay = new Map<string, number[]>();
        for (const r of data as any[]) {
            const d = new Date(r.recorded_at);
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key)!.push(r.net_weight_grams);
        }
        const points = [...byDay.entries()]
            .map(([dateKey, weights]) => ({
                day: farmDayForDate(batch, dateKey),
                avg: weights.reduce((s, w) => s + w, 0) / weights.length,
            }))
            .sort((a, b) => a.day - b.day);

        let growthRateGPerDay: number | null = null;
        if (points.length >= 2) {
            const n = points.length;
            const sumX = points.reduce((s, p) => s + p.day, 0);
            const sumY = points.reduce((s, p) => s + p.avg, 0);
            const sumXY = points.reduce((s, p) => s + p.day * p.avg, 0);
            const sumXX = points.reduce((s, p) => s + p.day * p.day, 0);
            const denom = n * sumXX - sumX * sumX;
            if (denom !== 0) growthRateGPerDay = (n * sumXY - sumX * sumY) / denom;
        }

        return {
            total,
            avgG,
            growthRateGPerDay,
            firstFarmDay: points.length > 0 ? points[0].day : null,
            lastFarmDay: points.length > 0 ? points[points.length - 1].day : null,
        };
    }, []);

    const fetchBatchComparison = useCallback(async () => {
        if (!selectedBatch || !selectedHousing) {
            setPreviousBatch(null); setPreviousBatchStats(null); setCurrentBatchStats(null);
            return;
        }
        setIsComparisonLoading(true);
        try {
            // The most recent OTHER batch that occupied this same house,
            // regardless of status — it's almost always 'completed'/'archived'
            // by the time a new one has arrived, so the active-only filter
            // used elsewhere on this screen would otherwise hide it entirely.
            const { data: prevData } = await supabase.from('batches')
                .select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id')
                .eq('housing_id', selectedHousing.id)
                .neq('id', selectedBatch.id)
                .lt('arrival_date', selectedBatch.arrival_date)
                .order('arrival_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            const prev = (prevData as BatchInfo | null) ?? null;
            setPreviousBatch(prev);

            const [curStats, prevStats] = await Promise.all([
                computeBatchStats(selectedBatch),
                prev ? computeBatchStats(prev) : Promise.resolve(null),
            ]);
            setCurrentBatchStats(curStats);
            setPreviousBatchStats(prevStats);
        } catch (err) {
            console.error('[WeighingSessionsScreen] batch comparison error:', err);
        } finally {
            setIsComparisonLoading(false);
        }
    }, [selectedBatch, selectedHousing, computeBatchStats]);

    useEffect(() => { fetchBatchComparison(); }, [fetchBatchComparison]);

    // Automatically re-fetch dynamically when returning to this screen (e.g. after deleting in SessionReportScreen)
    useFocusEffect(
        useCallback(() => {
            if (selectedBatchId) {
                fetchSessions(selectedBatchId);
                fetchRangePreview();
                fetchBatchComparison();
            }
        }, [selectedBatchId, fetchSessions, fetchRangePreview, fetchBatchComparison])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchMetadata(), selectedBatchId ? fetchSessions(selectedBatchId) : Promise.resolve(), fetchRangePreview(), fetchBatchComparison()]);
        setRefreshing(false);
    }, [fetchMetadata, selectedBatchId, fetchSessions, fetchRangePreview, fetchBatchComparison]);

    const avgWeightForSession = (sessionId: string): number | null => {
        const rows = childRows.filter(r => r.weighing_session_id === sessionId);
        if (rows.length === 0) return null;
        return rows.reduce((sum, r) => sum + r.net_weight_grams, 0) / rows.length;
    };

    const handleLongPressSession = useCallback((session: WeighingSessionRow) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSessionToDelete(session);
        setDeleteModalVisible(true);
    }, []);

    const handleDeleteSession = useCallback(async () => {
        if (!sessionToDelete) return;
        const targetSessionId = sessionToDelete.id;
        setIsDeletingSession(true);

        // 1. Instant optimistic local UI update so the card vanishes immediately
        setSessions(prev => prev.filter(s => s.id !== targetSessionId));
        setChildRows(prev => prev.filter(r => r.weighing_session_id !== targetSessionId));
        setDeleteModalVisible(false);
        setSessionToDelete(null);

        try {
            // 2. Delete associated weigh measurements linked to this session
            const { error: childErr } = await supabase
                .from('weigh_sessions')
                .delete()
                .eq('weighing_session_id', targetSessionId);
            if (childErr) throw childErr;

            // 3. Delete the weighing session envelope
            const { error: sessionErr } = await supabase
                .from('weighing_sessions')
                .delete()
                .eq('id', targetSessionId);
            if (sessionErr) throw sessionErr;

            showSnackbar('Weighing session deleted successfully.', 'success');

            // 4. Dynamically re-fetch metrics so range previews and batch comparisons refresh seamlessly
            if (selectedBatchId) {
                await Promise.all([
                    fetchSessions(selectedBatchId),
                    fetchRangePreview(),
                    fetchBatchComparison()
                ]);
            }
        } catch (err: any) {
            console.error('[WeighingSessionsScreen] Delete session error:', err);
            showSnackbar(err?.message || 'Failed to delete weighing session.', 'error');
            if (selectedBatchId) fetchSessions(selectedBatchId);
        } finally {
            setIsDeletingSession(false);
        }
    }, [sessionToDelete, selectedBatchId, fetchSessions, fetchRangePreview, fetchBatchComparison]);

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingOptionStr = selectedHousing ? selectedHousing.name : 'No House Selected';
    const batchesOptions = filteredBatches.map(b => b.name);
    const selectedBatchOptionStr = selectedBatch ? selectedBatch.name : 'No Batch Selected';

    const rangeTotal = rangeRows.length;
    const rangeUnder = rangeRows.filter(r => r.status === 'underweight').length;
    const rangeNormal = rangeRows.filter(r => r.status === 'normal').length;
    const rangeOver = rangeRows.filter(r => r.status === 'overweight').length;
    const rangeAvgG = rangeTotal > 0 ? rangeRows.reduce((s, r) => s + r.net_weight_grams, 0) / rangeTotal : 0;
    const rangeMinG = rangeTotal > 0 ? Math.min(...rangeRows.map(r => r.net_weight_grams)) : 0;
    const rangeMaxG = rangeTotal > 0 ? Math.max(...rangeRows.map(r => r.net_weight_grams)) : 0;

    // Day-by-day breakdown for the organized report view below.
    const dayGroups: DayGroup[] = useMemo(() => {
        const byDay = new Map<string, RangeWeighRow[]>();
        for (const r of rangeRows) {
            // Group by UTC calendar date — consistent with every other date
            // computation on this screen (see calendarDateForFarmDay above).
            const d = new Date(r.recorded_at);
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key)!.push(r);
        }
        return [...byDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, rows]) => {
                const weights = rows.map(r => r.net_weight_grams);
                return {
                    dateKey,
                    label: formatDate(dateKey),
                    weekday: weekdayName(dateKey),
                    count: rows.length,
                    avgG: weights.reduce((s, w) => s + w, 0) / weights.length,
                    minG: Math.min(...weights),
                    maxG: Math.max(...weights),
                    under: rows.filter(r => r.status === 'underweight').length,
                    normal: rows.filter(r => r.status === 'normal').length,
                    over: rows.filter(r => r.status === 'overweight').length,
                };
            });
    }, [rangeRows]);

    // Whether each individual recorded day falls exactly on a week boundary
    // (day 7/14/21/... of the range) or mid-week — surfaced explicitly in
    // the report rather than silently only showing weekly totals.
    const isMidWeekEntry = (g: DayGroup): boolean => {
        if (!selectedBatch) return false;
        const day = farmDayForDate(selectedBatch, g.dateKey);
        return day % 7 !== 0;
    };

    const rangeButtons: { key: RangeMode; label: string }[] = [
        { key: 'week1', label: 'Week 1' },
        { key: 'week2', label: 'Week 2' },
        { key: 'week3', label: 'Week 3' },
        { key: 'week4', label: 'Week 4' },
        { key: 'full', label: 'Full History' },
        { key: 'custom', label: 'Custom' },
    ];

    // ─── PDF Report Builder ────────────────────────────────────────
    const buildRangeReport = useCallback((): ReportDocument | null => {
        if (!selectedBatch || !resolvedRange || rangeTotal === 0) return null;

        const rangeLabel = `${formatDate(calendarDateForFarmDay(selectedBatch, resolvedRange.fromDay).toISOString())} – ${formatDate(calendarDateForFarmDay(selectedBatch, resolvedRange.toDay).toISOString())} (Day ${resolvedRange.fromDay}–${resolvedRange.toDay})`;

        const dayRows = dayGroups.map(g => [
            `${g.weekday}, ${g.label}${isMidWeekEntry(g) ? ' (mid-week)' : ''}`,
            g.count,
            `${(g.avgG / 1000).toFixed(2)} kg`,
            `${(g.minG / 1000).toFixed(2)} / ${(g.maxG / 1000).toFixed(2)} kg`,
            g.under, g.normal, g.over,
        ]);

        const dayProgressionChart: ReportChart | undefined = dayGroups.length > 0 ? {
            type: 'line',
            title: 'Daily Average Live Weight Progression (kg)',
            labels: dayGroups.map(g => g.label),
            series: [
                {
                    name: 'Average Weight (kg)',
                    data: dayGroups.map(g => Math.round((g.avgG / 1000) * 100) / 100),
                    color: '#16492a',
                },
            ],
            unit: 'kg',
            yAxisLabel: 'Live Weight (kg)',
        } : undefined;

        const classificationDistributionChart: ReportChart = {
            type: 'bar',
            title: 'Weight Classification Distribution (Range Total)',
            labels: ['Underweight', 'Normal', 'Overweight'],
            series: [
                {
                    name: 'Animals Sampled',
                    data: [rangeUnder, rangeNormal, rangeOver],
                    color: '#16492a',
                },
            ],
            unit: 'heads',
            yAxisLabel: 'Animals',
        };

        const sections: ReportSection[] = [
            {
                heading: 'Summary',
                stats: [
                    { label: 'Total Weighed', value: String(rangeTotal) },
                    { label: 'Average Weight', value: `${(rangeAvgG / 1000).toFixed(2)} kg` },
                    { label: 'Min / Max', value: `${(rangeMinG / 1000).toFixed(2)} / ${(rangeMaxG / 1000).toFixed(2)} kg` },
                    ...(rangeFeedGrams !== null ? [{ label: 'Feed Consumed', value: `${(rangeFeedGrams / 1000).toFixed(2)} kg` }] : []),
                    { label: 'Underweight', value: String(rangeUnder), accent: rangeUnder > 0 ? 'warn' as const : undefined },
                    { label: 'Normal', value: String(rangeNormal), accent: 'good' as const },
                    { label: 'Overweight', value: String(rangeOver), accent: rangeOver > 0 ? 'bad' as const : undefined },
                ],
                chart: classificationDistributionChart,
            },
            {
                heading: 'Day-by-Day Breakdown',
                chart: dayProgressionChart,
                table: {
                    headers: ['Date', 'Weighed', 'Avg', 'Min / Max', 'Under', 'Normal', 'Over'],
                    rows: dayRows,
                    note: `${dayGroups.length} of ${resolvedRange.toDay - resolvedRange.fromDay + 1} days in range recorded. Rows marked "mid-week" fall on a day other than the 7th/14th/21st/... of the batch's timeline.`,
                },
            },
        ];

        if (previousBatch && previousBatchStats && currentBatchStats) {
            sections.push({
                heading: 'Compared With Previous Batch',
                stats: [
                    { label: `${previousBatch.name} (Previous)`, value: `${(previousBatchStats.avgG / 1000).toFixed(2)} kg avg` },
                    { label: `${selectedBatch.name} (Current)`, value: `${(currentBatchStats.avgG / 1000).toFixed(2)} kg avg` },
                    {
                        label: 'Average Weight Change',
                        value: `${currentBatchStats.avgG >= previousBatchStats.avgG ? '+' : ''}${((currentBatchStats.avgG - previousBatchStats.avgG) / 1000).toFixed(2)} kg`,
                        accent: currentBatchStats.avgG >= previousBatchStats.avgG ? 'good' : 'bad',
                    },
                    {
                        label: 'Growth Rate (Previous → Current)',
                        value: `${previousBatchStats.growthRateGPerDay !== null ? (previousBatchStats.growthRateGPerDay / 1000).toFixed(3) : '—'} → ${currentBatchStats.growthRateGPerDay !== null ? (currentBatchStats.growthRateGPerDay / 1000).toFixed(3) : '—'} kg/day`,
                    },
                ],
            });
        }

        return {
            reportTitle: 'Weighing History Report',
            farmName,
            subtitle: `${selectedBatch.name} · ${selectedHousing?.name ?? 'No Housing'} · ${animalType === 'pig' ? 'Pigs' : 'Chickens'}`,
            meta: [
                { label: 'Batch', value: selectedBatch.name },
                { label: 'Housing', value: selectedHousing?.name ?? '—' },
                { label: 'Animal Type', value: animalType === 'pig' ? 'Pig' : 'Chicken' },
                { label: 'Report Range', value: rangeLabel },
                { label: 'Head Count', value: String(selectedBatch.current_count) },
            ],
            sections,
            generatedByName: formatReportUserName(profile),
            generatedByRole: formatReportUserRole(profile?.role),
        };
    }, [selectedBatch, selectedHousing, animalType, resolvedRange, rangeTotal, rangeAvgG, rangeMinG, rangeMaxG, rangeFeedGrams, rangeUnder, rangeNormal, rangeOver, dayGroups, previousBatch, previousBatchStats, currentBatchStats, farmName, profile]);

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, flex: 1, textAlign: 'center', marginHorizontal: 8 }]}>
                    {animalType === 'pig' ? 'Pigs Weighing History' : 'Chickens Weighing History'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PrintReportButton
                        buildReport={buildRangeReport}
                        emptyMessage="No weighing records in the selected range yet."
                        onExported={() => showSnackbar('Report exported as PDF.', 'success')}
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
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
                >
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, marginBottom: 20 }]}>
                        Select a house and batch to view its weighing history and generate a report. New weighing runs are started from the AniWeigh device screen itself.
                    </Text>

                    {/* Sliding Animal Type Pill Switcher */}
                    <AnimalTypePillSwitcher
                        selected={animalType}
                        onSelect={handleSwitchAnimalType}
                        style={{ marginBottom: 16 }}
                    />

                    {/* Filters Dropdown (House & Batch beside each other) */}
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 6 }]}>Select a House</Text>
                            <TouchableOpacity
                                activeOpacity={filteredHousings.length > 0 ? 0.8 : 1}
                                disabled={filteredHousings.length === 0}
                                style={[animalStyles.dropdownContainer, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, paddingVertical: 12, paddingHorizontal: 12, opacity: filteredHousings.length > 0 ? 1 : 0.6 }]}
                                onPress={() => setHousingModalVisible(true)}
                            >
                                <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>{selectedHousingOptionStr}</Text>
                                <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 6 }]}>Select a Batch</Text>
                            <TouchableOpacity
                                activeOpacity={filteredBatches.length > 0 ? 0.8 : 1}
                                disabled={filteredBatches.length === 0}
                                style={[animalStyles.dropdownContainer, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, paddingVertical: 12, paddingHorizontal: 12, opacity: filteredBatches.length > 0 ? 1 : 0.6 }]}
                                onPress={() => setBatchModalVisible(true)}
                            >
                                <Text style={[textStyles.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>{selectedBatchOptionStr}</Text>
                                <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {isSessionsLoading ? (
                        <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading session history...</Text>
                        </View>
                    ) : !selectedBatch ? (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center' }}>
                        <MaterialIcons name="layers" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Batch Selected</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            Pick a house and an active batch above to get started.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Previous batch comparison — same house, batch before this one */}
                        <Text style={[textStyles.h3, { color: colors.text, marginBottom: 12 }]}>Compared With Previous Batch</Text>
                        {isComparisonLoading ? (
                            <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 20 }} />
                        ) : !previousBatch || !previousBatchStats || !currentBatchStats ? (
                            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 20, marginBottom: 20 }}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                    Not enough previous data — no earlier batch has occupied {selectedHousing?.name} yet.
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.menuCard, { flexDirection: 'column', alignItems: 'stretch', marginBottom: 20 }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, flex: 1 }]} numberOfLines={1}>
                                        {previousBatch.name} (previous)
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>{(previousBatchStats.avgG / 1000).toFixed(2)} kg avg</Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, flex: 1 }]} numberOfLines={1}>
                                        {selectedBatch.name} (current)
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>{(currentBatchStats.avgG / 1000).toFixed(2)} kg avg</Text>
                                </View>
                                <View style={{ height: 1, backgroundColor: colors.stroke, marginVertical: 8 }} />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Average Weight Change</Text>
                                    <Text style={[textStyles.h3, { color: currentBatchStats.avgG >= previousBatchStats.avgG ? colors.primary : colors.error, fontSize: 14 }]}>
                                        {currentBatchStats.avgG >= previousBatchStats.avgG ? '+' : ''}{((currentBatchStats.avgG - previousBatchStats.avgG) / 1000).toFixed(2)} kg
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Growth Rate</Text>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                        {previousBatchStats.growthRateGPerDay !== null ? `${(previousBatchStats.growthRateGPerDay / 1000).toFixed(3)} kg/day` : '—'}
                                        {' → '}
                                        {currentBatchStats.growthRateGPerDay !== null ? `${(currentBatchStats.growthRateGPerDay / 1000).toFixed(3)} kg/day` : '—'}
                                    </Text>
                                </View>
                                {previousBatchStats.growthRateGPerDay !== null && currentBatchStats.growthRateGPerDay !== null && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 4 }]}>
                                        {selectedBatch.name} is growing{' '}
                                        {currentBatchStats.growthRateGPerDay > previousBatchStats.growthRateGPerDay ? 'faster' : currentBatchStats.growthRateGPerDay < previousBatchStats.growthRateGPerDay ? 'slower' : 'at the same rate'}
                                        {' '}than {previousBatch.name} did.
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* Report range picker */}
                        <Text style={[textStyles.h3, { color: colors.text, marginBottom: 12 }]}>Generate Report</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            {rangeButtons.map(btn => {
                                const isSelected = rangeMode === btn.key;
                                return (
                                    <TouchableOpacity
                                        key={btn.key}
                                        activeOpacity={0.8}
                                        onPress={() => setRangeMode(btn.key)}
                                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: isSelected ? colors.primary : colors.surface, borderWidth: 1, borderColor: isSelected ? colors.primary : colors.stroke }}
                                    >
                                        <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 13 }]}>{btn.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {rangeMode === 'custom' && (
                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 6 }]}>From Date</Text>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => setFromDateModalVisible(true)}
                                        style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.stroke, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface }}
                                    >
                                        <MaterialIcons name="event" size={16} color={colors.textGrey} style={{ marginRight: 8 }} />
                                        <Text style={[textStyles.body, { color: customFromDate ? colors.text : colors.textGrey, fontSize: 13, flex: 1 }]}>
                                            {customFromDate ? formatDate(customFromDate) : 'Select date'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 6 }]}>To Date</Text>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => setToDateModalVisible(true)}
                                        style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.stroke, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface }}
                                    >
                                        <MaterialIcons name="event" size={16} color={colors.textGrey} style={{ marginRight: 8 }} />
                                        <Text style={[textStyles.body, { color: customToDate ? colors.text : colors.textGrey, fontSize: 13, flex: 1 }]}>
                                            {customToDate ? formatDate(customToDate) : 'Select date'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {resolvedRange && (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 12 }]}>
                                {formatDate(calendarDateForFarmDay(selectedBatch, resolvedRange.fromDay).toISOString())} – {formatDate(calendarDateForFarmDay(selectedBatch, resolvedRange.toDay).toISOString())}
                                {' '}(Day {resolvedRange.fromDay}–{resolvedRange.toDay})
                            </Text>
                        )}

                        {isRangeLoading ? (
                            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
                        ) : !resolvedRange ? (
                            <Text style={[textStyles.body, { color: colors.error, fontSize: 13, marginBottom: 16 }]}>Enter a valid day range (From ≤ To).</Text>
                        ) : rangeTotal === 0 ? (
                            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 20, marginBottom: 20 }}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>No weighing records in this range yet.</Text>
                            </View>
                        ) : (
                            <View style={[styles.menuCard, { flexDirection: 'column', alignItems: 'stretch', marginBottom: 20 }]}>
                                {/* Report header */}
                                <Text style={[textStyles.h3, { color: colors.text, marginBottom: 2 }]}>
                                    {selectedBatch.name} — {selectedHousing?.name}
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 16 }]}>
                                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} · Day {resolvedRange?.fromDay}–{resolvedRange?.toDay}
                                </Text>

                                {/* Summary stats */}
                                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                                    <View style={{ minWidth: 80, flexShrink: 1 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>TOTAL WEIGHED</Text>
                                        <Text style={[textStyles.h2, { color: colors.text }]}>{rangeTotal}</Text>
                                    </View>
                                    <View style={{ minWidth: 80, flexShrink: 1 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>AVERAGE</Text>
                                        <Text style={[textStyles.h2, { color: colors.text }]}>{(rangeAvgG / 1000).toFixed(2)} kg</Text>
                                    </View>
                                    <View style={{ minWidth: 100, flexShrink: 1 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>MIN / MAX</Text>
                                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 15 }]}>{(rangeMinG / 1000).toFixed(2)} / {(rangeMaxG / 1000).toFixed(2)} kg</Text>
                                    </View>
                                    {rangeFeedGrams !== null && (
                                        <View style={{ minWidth: 90, flexShrink: 1 }}>
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>FEED CONSUMED</Text>
                                            <Text style={[textStyles.h2, { color: colors.text }]}>{(rangeFeedGrams / 1000).toFixed(2)} kg</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Classification breakdown */}
                                <View style={{ flexDirection: 'row', height: 10, borderRadius: 8, overflow: 'hidden', marginBottom: 10, gap: 2 }}>
                                    <View style={{ flex: rangeUnder || 1, backgroundColor: colors.warning, borderRadius: 8 }} />
                                    <View style={{ flex: rangeNormal || 1, backgroundColor: colors.primary }} />
                                    <View style={{ flex: rangeOver || 1, backgroundColor: colors.error, borderRadius: 8 }} />
                                </View>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 16 }]}>
                                    Underweight {rangeUnder} · Normal {rangeNormal} · Overweight {rangeOver}
                                </Text>

                                {/* Day-by-day breakdown */}
                                {dayGroups.length > 0 && resolvedRange && (
                                    <>
                                        <View style={{ height: 1, backgroundColor: colors.stroke, marginBottom: 12 }} />
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                                            <Text style={[textStyles.label, { color: colors.text, fontSize: 12, flexShrink: 1 }]}>DAY-BY-DAY BREAKDOWN</Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, flexShrink: 1 }]}>
                                                {dayGroups.length} of {resolvedRange.toDay - resolvedRange.fromDay + 1} days recorded
                                            </Text>
                                        </View>
                                        {dayGroups.length >= 2 && (() => {
                                            const change = dayGroups[dayGroups.length - 1].avgG - dayGroups[0].avgG;
                                            return (
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, lineHeight: 16, marginBottom: 12 }]}>
                                                    {change >= 0 ? '+' : ''}{(change / 1000).toFixed(2)} kg average change from {dayGroups[0].label} to {dayGroups[dayGroups.length - 1].label}
                                                </Text>
                                            );
                                        })()}

                                        {dayGroups.map(g => {
                                            const midWeek = isMidWeekEntry(g);
                                            return (
                                                <View key={g.dateKey} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.stroke + '80' }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1, lineHeight: 18 }]}>{g.weekday}, {g.label}</Text>
                                                            {midWeek && (
                                                                <View style={{ backgroundColor: colors.info + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'center' }}>
                                                                    <Text style={[textStyles.label, { color: colors.info, fontSize: 9 }]}>MID-WEEK</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 0, textAlign: 'right', lineHeight: 18 }]}>{(g.avgG / 1000).toFixed(2)} kg avg</Text>
                                                    </View>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, lineHeight: 16 }]}>
                                                        {g.count} weighed · min {(g.minG / 1000).toFixed(2)} / max {(g.maxG / 1000).toFixed(2)} kg
                                                    </Text>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2, lineHeight: 16 }]}>
                                                        Underweight {g.under} · Normal {g.normal} · Overweight {g.over}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </>
                                )}
                            </View>
                        )}

                        {/* History — glimpse of past discrete weighing runs */}
                        <Text style={[textStyles.h3, { color: colors.text, marginBottom: 12 }]}>History</Text>

                        {isSessionsLoading ? (
                            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
                        ) : sessions.filter(s => s.status !== 'in_progress').length === 0 ? (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginBottom: 24 }]}>
                                No completed weighing sessions yet for this batch.
                            </Text>
                        ) : (
                            sessions.filter(s => s.status !== 'in_progress').slice().reverse().map(session => {
                                const avg = avgWeightForSession(session.id);
                                return (
                                    <TouchableOpacity
                                        key={session.id}
                                        activeOpacity={0.8}
                                        delayLongPress={350}
                                        onPress={() => router.push(`/(weighing)/SessionReportScreen?sessionId=${session.id}` as any)}
                                        onLongPress={() => handleLongPressSession(session)}
                                        style={styles.menuCard}
                                    >
                                        <View style={styles.menuIconContainer}>
                                            <AniWeighIcon size={22} />
                                        </View>
                                        <View style={[styles.menuContent, { flex: 1, marginRight: 8 }]}>
                                            <Text style={[textStyles.h3, styles.menuTitle, { fontSize: 14, lineHeight: 18 }]}>
                                                {session.farm_day !== null ? `Day ${session.farm_day}` : formatDate(session.created_at)}
                                            </Text>
                                            <Text style={[textStyles.body, styles.menuSubtitle, { fontSize: 12, lineHeight: 16, marginTop: 2 }]}>
                                                {session.completed_quantity}/{session.expected_quantity} weighed
                                                {avg !== null ? ` · avg ${(avg / 1000).toFixed(2)} kg` : ''}
                                                {session.status === 'cancelled' ? ' · Cancelled' : ''}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </>
                )}
            </ScrollView>
            )}

            <SelectionModal
                visible={housingModalVisible}
                onClose={() => setHousingModalVisible(false)}
                onSelect={(val) => {
                    const matched = filteredHousings.find(h => h.name === val);
                    if (matched) handleSelectHousing(matched.id);
                    setHousingModalVisible(false);
                }}
                title="Select House"
                description="Choose a house to review its batch."
                icon="home"
                options={housingsOptions}
                selectedValue={selectedHousingOptionStr}
                requireConfirm={false}
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
                description="Choose an active batch to review."
                icon="layers"
                options={batchesOptions}
                selectedValue={selectedBatchOptionStr}
                requireConfirm={false}
            />

            {selectedBatch && (
                <>
                    <CalendarPickerModal
                        visible={fromDateModalVisible}
                        onClose={() => setFromDateModalVisible(false)}
                        onSelect={setCustomFromDate}
                        title="From Date"
                        selectedDate={customFromDate ?? undefined}
                        minDate={selectedBatch.arrival_date}
                        maxDate={customToDate ?? undefined}
                    />
                    <CalendarPickerModal
                        visible={toDateModalVisible}
                        onClose={() => setToDateModalVisible(false)}
                        onSelect={setCustomToDate}
                        title="To Date"
                        selectedDate={customToDate ?? undefined}
                        minDate={customFromDate ?? selectedBatch.arrival_date}
                    />
                </>
            )}

            <ActionModal
                visible={deleteModalVisible}
                type="warning"
                title="Delete Weighing Session?"
                message={`Are you sure you want to delete ${sessionToDelete
                        ? sessionToDelete.farm_day !== null
                            ? `Day ${sessionToDelete.farm_day} (${formatDate(sessionToDelete.created_at)})`
                            : formatDate(sessionToDelete.created_at)
                        : 'this session'
                    }? All weight measurements recorded during this session will be permanently removed from reports.`}
                confirmText="Delete"
                cancelText="Cancel"
                isLoading={isDeletingSession}
                onConfirm={handleDeleteSession}
                onCancel={() => {
                    if (!isDeletingSession) {
                        setDeleteModalVisible(false);
                        setSessionToDelete(null);
                    }
                }}
            />

            <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar(s => ({ ...s, visible: false }))} />
        </View>
    );
}

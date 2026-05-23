import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, PieChart } from 'react-native-chart-kit';

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

interface HealthRecord {
    id: string;
    record_type: 'vaccination' | 'treatment' | 'observation' | 'illness' | 'deworming' | 'vitamins' | 'mortality';
    severity: 'low' | 'medium' | 'high';
    affected_count: number | null;
    record_date: string;
    title: string;
}

export default function HealthReportScreen() {
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
    const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
    const [timeframe, setTimeframe] = useState<'This Week' | 'This Month'>('This Week');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isHealthLoading, setIsHealthLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    const lastLoadedBatchIdRef = React.useRef<string | null>(null);
    const animalTypeRef = React.useRef(animalType);

    useEffect(() => {
        animalTypeRef.current = animalType;
    }, [animalType]);

    // Filtered housings based on selected animal type (pig/chicken)
    const filteredHousings = allHousings.filter(h => h.animal_type === animalType);
    const selectedHousing = allHousings.find(h => h.id === selectedHousingId) ?? null;

    // Filtered batches based on selected housing (computed locally to avoid API waterfalls!)
    const filteredBatches = useMemo(() => {
        return allBatches.filter(b => b.housing_id === selectedHousingId);
    }, [allBatches, selectedHousingId]);

    const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) ?? null;

    // ─── Parallel Metadata Fetching (Eliminates Waterfalls!) ──────
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

            // Synchronously resolve first selectedHousingId and selectedBatchId to avoid waterfall flickers on mount
            const filteredH = housingsData.filter(h => h.animal_type === animalTypeRef.current);
            if (filteredH.length > 0) {
                const targetHousingId = filteredH[0].id;
                setSelectedHousingId(targetHousingId);

                const filteredB = batchesData.filter(b => b.housing_id === targetHousingId);
                if (filteredB.length > 0) {
                    const targetBatchId = filteredB[0].id;
                    setSelectedBatchId(targetBatchId);
                    
                    // Fetch initial health records synchronously inside loading state
                    const { data: recordsData, error: recordsError } = await supabase
                        .from('health_records')
                        .select('id, record_type, severity, affected_count, record_date, title')
                        .eq('batch_id', targetBatchId)
                        .is('deleted_at', null)
                        .order('record_date', { ascending: true });

                    if (recordsError) throw recordsError;
                    
                    setHealthRecords((recordsData || []) as HealthRecord[]);
                    lastLoadedBatchIdRef.current = targetBatchId;
                } else {
                    setSelectedBatchId(null);
                    setHealthRecords([]);
                    lastLoadedBatchIdRef.current = null;
                }
            } else {
                setSelectedHousingId(null);
                setSelectedBatchId(null);
                setHealthRecords([]);
                lastLoadedBatchIdRef.current = null;
            }
        } catch (err) {
            console.error('[HealthReportScreen] error loading metadata:', err);
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    // ─── Fetch Health Records ────────────────────────────────────
    const fetchHealthRecords = useCallback(async (batchId: string) => {
        setIsHealthLoading(true);
        lastLoadedBatchIdRef.current = batchId;
        try {
            const { data, error } = await supabase
                .from('health_records')
                .select('id, record_type, severity, affected_count, record_date, title')
                .eq('batch_id', batchId)
                .is('deleted_at', null)
                .order('record_date', { ascending: true });

            if (error) throw error;
            setHealthRecords((data || []) as HealthRecord[]);
        } catch (err) {
            console.error('[HealthReportScreen] error loading health records:', err);
        } finally {
            setIsHealthLoading(false);
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

    // Load health records when selected batch changes
    useEffect(() => {
        if (selectedBatchId) {
            if (lastLoadedBatchIdRef.current !== selectedBatchId) {
                fetchHealthRecords(selectedBatchId);
            }
        } else {
            setHealthRecords([]);
            lastLoadedBatchIdRef.current = null;
        }
    }, [selectedBatchId, fetchHealthRecords]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchReportMetadata();
        if (selectedBatchId) {
            await fetchHealthRecords(selectedBatchId);
        }
        setRefreshing(false);
    }, [fetchReportMetadata, selectedBatchId, fetchHealthRecords]);

    // ─── Stats Computations ──────────────────────────────────────
    const totalDeceased = useMemo(() => {
        return healthRecords
            .filter(r => r.record_type === 'mortality')
            .reduce((sum, r) => sum + (r.affected_count ?? 1), 0);
    }, [healthRecords]);

    const mortalityRate = useMemo(() => {
        if (!selectedBatch || selectedBatch.estimated_count <= 0) return '0.0';
        return ((totalDeceased / selectedBatch.estimated_count) * 100).toFixed(1);
    }, [selectedBatch, totalDeceased]);

    const activeIllnesses = useMemo(() => {
        return healthRecords.filter(r => 
            (r.record_type === 'illness' || r.record_type === 'observation') && 
            (r.severity === 'medium' || r.severity === 'high')
        ).length;
    }, [healthRecords]);

    const vaccinationCount = useMemo(() => {
        return healthRecords.filter(r => r.record_type === 'vaccination').length;
    }, [healthRecords]);

    const routineCareCount = useMemo(() => {
        return healthRecords.filter(r => r.record_type === 'vitamins' || r.record_type === 'deworming').length;
    }, [healthRecords]);

    // ── Pie Chart Data ────────────────────────────────────────────
    const pieData = useMemo(() => {
        const valCount = healthRecords.filter(r => r.record_type === 'vaccination').length;
        const illCount = healthRecords.filter(r => r.record_type === 'illness').length;
        const txCount = healthRecords.filter(r => r.record_type === 'treatment').length;
        const obsCount = healthRecords.filter(r => r.record_type === 'observation').length;
        const routineCount = healthRecords.filter(r => r.record_type === 'vitamins' || r.record_type === 'deworming').length;

        return [
            { name: 'Vaccination', population: valCount, color: '#27AE60', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Illness', population: illCount, color: '#E74C3C', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Treatment', population: txCount, color: '#2980B9', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Observation', population: obsCount, color: '#8E44AD', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Routine Care', population: routineCount, color: '#E67E22', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Mortality', population: totalDeceased, color: '#7F1D1D', legendFontColor: colors.textGrey, legendFontSize: 10 },
        ].filter(p => p.population > 0);
    }, [healthRecords, totalDeceased, colors]);

    // ── Timeline Line Chart Data ────────────────────────────────────────────────
    const lineChartData = useMemo(() => {
        const last6Months: string[] = [];
        const last6MonthsKeys: string[] = []; // YYYY-MM
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthName = d.toLocaleDateString('en-US', { month: 'short' });
            last6Months.push(monthName);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            last6MonthsKeys.push(`${year}-${month}`);
        }

        const incidentsByMonth = Array(6).fill(0);
        const mortalityByMonth = Array(6).fill(0);

        healthRecords.forEach(r => {
            if (!r.record_date) return;
            const key = r.record_date.slice(0, 7); // YYYY-MM
            const idx = last6MonthsKeys.indexOf(key);
            if (idx !== -1) {
                if (r.record_type === 'mortality') {
                    mortalityByMonth[idx] += (r.affected_count ?? 1);
                } else if (r.record_type === 'illness' || r.record_type === 'treatment' || r.record_type === 'observation') {
                    incidentsByMonth[idx] += 1;
                }
            }
        });

        const showMortality = mortalityByMonth.some(val => val > 0);
        const showIncidents = incidentsByMonth.some(val => val > 0);

        const datasets: any[] = [];
        if (showIncidents || !showMortality) {
            datasets.push({
                data: incidentsByMonth,
                color: (opacity = 1) => colors.primary,
                strokeWidth: 3,
            });
        }
        if (showMortality) {
            datasets.push({
                data: mortalityByMonth,
                color: (opacity = 1) => '#EF4444',
                strokeWidth: 3,
            });
        }

        return {
            labels: last6Months,
            datasets: datasets.length > 0 ? datasets : [{ data: Array(6).fill(0), color: () => colors.stroke, strokeWidth: 1 }],
            hasRealData: showMortality || showIncidents,
        };
    }, [healthRecords, colors]);

    // ─── Fast Local Analysation Texts ───────────────────────────
    const getPieDescriptionText = () => {
        if (healthRecords.length === 0) return '';
        const vaccines = healthRecords.filter(r => r.record_type === 'vaccination').length;
        const total = healthRecords.length;
        const vaccPct = Math.round((vaccines / total) * 100);
        
        return `This breakdown displays the proportional occurrence of registered health events. Proactive care (vaccinations & routine vitamin supplements) represents ${vaccPct}% of the overall health records, demonstrating high bio-security standards. Active illness logs occupy the remainder and should be managed alongside specific treatments.`;
    };

    const getTimelineDescriptionText = () => {
        if (healthRecords.length === 0) return '';
        return `This timeline tracks cumulative monthly health incidents and mortality occurrences over the last 6 months. Reviewing this trend allows for identifying seasonal patterns, where temperature shifts or local humidity changes correlate with spikes in symptoms, prompting early ventilation or supplement administration.`;
    };

    // ─── Fast Local AI Recommendations (Loads instantly!) ─────────
    const getHealthAnalysis = () => {
        if (healthRecords.length === 0) {
            return `No health records logged for ${selectedBatch ? selectedBatch.name : 'this batch'} in the selected timeframe.`;
        }
        const severityWord = parseFloat(mortalityRate) > 3.0 ? 'above' : 'within';
        const illnessStatus = activeIllnesses > 0 ? `with ${activeIllnesses} active illness cases needing close monitoring` : 'with no active severe illnesses';
        return `Batch "${selectedBatch?.name}" currently shows a mortality rate of ${mortalityRate}% with ${totalDeceased} deceased heads, which is ${severityWord} the safe threshold. The cohort has recorded ${healthRecords.length} total events, ${illnessStatus}.`;
    };

    const getBiosecurityAnalysis = () => {
        if (healthRecords.length === 0) {
            return "Log routine vaccinations and vitamins in the health screen to view coverages and prevent outbreaks.";
        }
        const level = parseFloat(mortalityRate) > 3.0 ? 'high priority' : 'routine';
        return `We have recorded ${vaccinationCount} vaccination logs and ${routineCareCount} routine supplement coverages. Maintaining scheduled vaccine coverages and rigorous cleaning protocols are the most effective ways to keep mortality rates within target levels under a ${level} environment.`;
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
                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} Health Report
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
                {/* Intro Text & Value Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginRight: 16, marginTop: 0, marginBottom: 0 }]}>
                        Monitor vaccine coverages, active illnesses, routine deworming care, and dynamic mortality statistics.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface, paddingHorizontal: 12 }]}>
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                            MORTALITY
                        </Text>
                        <Text style={[textStyles.h1, { color: '#EF4444', fontSize: 24, lineHeight: 28 }]}>
                            {mortalityRate}<Text style={{fontSize: 14}}>%</Text>
                        </Text>
                    </View>
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

                {isLoading || isHealthLoading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading health reports...</Text>
                    </View>
                ) : filteredHousings.length === 0 ? (
                    /* Empty Housings State */
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <MaterialIcons name="home" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Houses Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            There are no active houses registered for {animalType === 'pig' ? 'pigs' : 'chickens'} on this farm yet.
                        </Text>
                    </View>
                ) : filteredBatches.length === 0 ? (
                    /* Empty Batches State */
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <MaterialIcons name="layers" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Active Batches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            There are no batches currently registered in {selectedHousing?.name ?? 'this housing'}.
                        </Text>
                    </View>
                ) : (
                    /* Dynamic Health Consumption Report Content */
                    <>
                        {/* Core Health Metrics Grid */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                            {/* Mortality card */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Mortality Rate</Text>
                                    <MaterialIcons name="remove-circle" size={16} color="#EF4444" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 24, color: '#EF4444' }]}>{mortalityRate}%</Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>{totalDeceased} deceased heads</Text>
                            </View>

                            {/* Active Illness card */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Active Illnesses</Text>
                                    <MaterialIcons name="sick" size={16} color="#E67E22" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 24, color: '#E67E22' }]}>{activeIllnesses}</Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>Needs monitoring</Text>
                            </View>

                            {/* Vaccines card */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Vaccinations</Text>
                                    <MaterialIcons name="vaccines" size={16} color="#27AE60" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 24, color: '#27AE60' }]}>{vaccinationCount}</Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>Doses logged</Text>
                            </View>

                            {/* Routine Supplements card */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Supplements</Text>
                                    <MaterialIcons name="medical-services" size={16} color="#2980B9" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 24, color: '#2980B9' }]}>{routineCareCount}</Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>Vitamins & Deworming</Text>
                            </View>
                        </View>

                        {/* Pie Chart: Record Breakdown */}
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 12 }]}>Record Breakdown</Text>
                        <View style={{
                            borderRadius: 20,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            padding: 16,
                            marginBottom: 12,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.1, shadowRadius: 10,
                            elevation: 3,
                        }}>
                            {pieData.length === 0 ? (
                                <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                                    <MaterialIcons name="analytics" size={40} color={colors.stroke} style={{ marginBottom: 8 }} />
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 13, color: colors.textGrey }}>No health records for this batch.</Text>
                                </View>
                            ) : (
                                <PieChart
                                    data={pieData}
                                    width={width - hPad * 2 - 40}
                                    height={180}
                                    chartConfig={{
                                        color: (opacity = 1) => colors.text,
                                    }}
                                    accessor="population"
                                    backgroundColor="transparent"
                                    paddingLeft="10"
                                    center={[5, 0]}
                                    absolute
                                />
                            )}
                        </View>
                        
                        {/* Pie Chart descriptive explanation */}
                        {healthRecords.length > 0 && (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 14, padding: 12, marginBottom: 24,
                                flexDirection: 'row', gap: 8, alignItems: 'flex-start'
                            }}>
                                <MaterialIcons name="assessment" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, flex: 1, lineHeight: 18 }}>
                                    {getPieDescriptionText()}
                                </Text>
                            </View>
                        )}

                        {/* Line Chart: Incidents & Mortality Timeline */}
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 12 }]}>Timeline & Trends</Text>
                        <View style={{
                            borderRadius: 20,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            paddingTop: 16, paddingRight: 16, paddingBottom: 8,
                            marginBottom: 12,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.1, shadowRadius: 10,
                            elevation: 3,
                        }}>
                            {!lineChartData.hasRealData ? (
                                <View style={{ height: 220, justifyContent: 'center', alignItems: 'center', paddingLeft: 16 }}>
                                    <MaterialIcons name="show-chart" size={40} color={colors.stroke} style={{ marginBottom: 8 }} />
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 13, color: colors.textGrey, textAlign: 'center' }}>No historical events recorded in the last 6 months.</Text>
                                </View>
                            ) : (
                                <>
                                    <LineChart
                                        data={lineChartData}
                                        width={width - hPad * 2 - 28}
                                        height={220}
                                        yAxisLabel=""
                                        yAxisSuffix=""
                                        withDots={true}
                                        withInnerLines={true}
                                        withOuterLines={false}
                                        withVerticalLines={false}
                                        withHorizontalLines={true}
                                        bezier
                                        chartConfig={{
                                            backgroundColor: colors.surface,
                                            backgroundGradientFrom: colors.surface,
                                            backgroundGradientTo: colors.surface,
                                            decimalPlaces: 0,
                                            color: (opacity = 1) => colors.stroke,
                                            labelColor: (opacity = 1) => colors.textGrey,
                                            strokeWidth: 3,
                                            fillShadowGradientFrom: colors.primary,
                                            fillShadowGradientFromOpacity: 0.15,
                                            fillShadowGradientTo: colors.primary,
                                            fillShadowGradientToOpacity: 0.02,
                                            propsForDots: {
                                                r: "4",
                                                strokeWidth: "2",
                                                stroke: colors.surface,
                                            }
                                        }}
                                        style={{
                                            borderRadius: 16,
                                        }}
                                    />
                                    {/* Legend explanation */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10, paddingLeft: 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Incidents</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Mortality</Text>
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>
                        
                        {/* Line Chart descriptive explanation */}
                        {healthRecords.length > 0 && (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 14, padding: 12, marginBottom: 24,
                                flexDirection: 'row', gap: 8, alignItems: 'flex-start'
                            }}>
                                <MaterialIcons name="assessment" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, flex: 1, lineHeight: 18 }}>
                                    {getTimelineDescriptionText()}
                                </Text>
                            </View>
                        )}

                        {/* Fast, Dynamic, Instant AI Analysis Recommendations */}
                        <AIInsightCard 
                            title="AniBot Analysis"
                            staticContent={getHealthAnalysis()}
                            variant="green"
                        />

                        <AIInsightCard 
                            title="Biosecurity & Prevention"
                            staticContent={getBiosecurityAnalysis()}
                            variant="orange"
                        />
                    </>
                )}
            </ScrollView>

            {/* Selection Modals */}
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
                description="Choose a house to view its health report."
                icon="home"
                options={housingsOptions}
                selectedValue={selectedHousingOptionStr}
                requireConfirm={false}
                enableSearch={false}
            />

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
                description="Choose a batch to view its health report."
                icon="layers"
                options={batchesOptions}
                selectedValue={selectedBatchOptionStr}
                requireConfirm={false}
                enableSearch={false}
            />
        </SafeAreaView>
    );
}

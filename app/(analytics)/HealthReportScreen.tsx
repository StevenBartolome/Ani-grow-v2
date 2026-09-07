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
import { PrintReportButton } from '@/components/PrintReportButton';
import { ReportDocument } from '@/lib/pdfReport';
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
    medication?: string | null;
    dosage?: string | null;
    notes?: string | null;
    followup_date?: string | null;
}

const RECORD_TYPE_CONFIG: Record<
    string,
    { label: string; color: string; icon: keyof typeof MaterialIcons.glyphMap }
> = {
    vaccination: { label: 'Vaccination', color: '#27AE60', icon: 'vaccines' },
    vitamins: { label: 'Vitamins', color: '#16A085', icon: 'medical-services' },
    deworming: { label: 'Deworming', color: '#E67E22', icon: 'bug-report' },
    treatment: { label: 'Treatment', color: '#2980B9', icon: 'healing' },
    observation: { label: 'Observation', color: '#8E44AD', icon: 'visibility' },
    illness: { label: 'Illness', color: '#E74C3C', icon: 'sick' },
    mortality: { label: 'Mortality', color: '#7F1D1D', icon: 'remove-circle' },
};

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
    const { activeFarmIds, managedFarms, selectedFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const currentFarm = managedFarms.find(f => f.id === farmId);
    const [farmName, setFarmName] = useState<string>(currentFarm?.name || (profile as any)?.farm_name || (profile as any)?.farmName || '');

    useEffect(() => {
        if (currentFarm?.name) {
            setFarmName(currentFarm.name);
        }
    }, [currentFarm?.name]);

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
    const [showAllEvents, setShowAllEvents] = useState(false);

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

    // Filtered batches based on selected housing
    const filteredBatches = useMemo(() => {
        return allBatches.filter(b => b.housing_id === selectedHousingId);
    }, [allBatches, selectedHousingId]);

    const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) ?? null;

    // ─── Parallel Metadata Fetching ───────────────────────────────────────────
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
                    .eq('status', 'active')
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

            const filteredH = housingsData.filter(h => h.animal_type === animalTypeRef.current);
            if (filteredH.length > 0) {
                const targetHousingId = filteredH[0].id;
                setSelectedHousingId(targetHousingId);

                const filteredB = batchesData.filter(b => b.housing_id === targetHousingId);
                if (filteredB.length > 0) {
                    const targetBatchId = filteredB[0].id;
                    setSelectedBatchId(targetBatchId);

                    const { data: recordsData, error: recordsError } = await supabase
                        .from('health_records')
                        .select('id, record_type, severity, affected_count, record_date, title, medication, dosage, notes, followup_date')
                        .eq('batch_id', targetBatchId)
                        .is('deleted_at', null)
                        .order('record_date', { ascending: false });

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

    // ─── Fetch Health Records ─────────────────────────────────────────────────
    const fetchHealthRecords = useCallback(async (batchId: string) => {
        setIsHealthLoading(true);
        lastLoadedBatchIdRef.current = batchId;
        try {
            const { data, error } = await supabase
                .from('health_records')
                .select('id, record_type, severity, affected_count, record_date, title, medication, dosage, notes, followup_date')
                .eq('batch_id', batchId)
                .is('deleted_at', null)
                .order('record_date', { ascending: false });

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

    // ─── Stats Computations ───────────────────────────────────────────────────
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

    const observationCount = useMemo(() => {
        return healthRecords.filter(r => r.record_type === 'observation').length;
    }, [healthRecords]);

    const treatmentCount = useMemo(() => {
        return healthRecords.filter(r => r.record_type === 'treatment').length;
    }, [healthRecords]);

    const illnessCount = useMemo(() => {
        return healthRecords.filter(r => r.record_type === 'illness').length;
    }, [healthRecords]);

    // ─── Biosecurity & Health Insights (Descriptive Performance) ───────────────
    const biosecurityInsights = useMemo(() => {
        const total = healthRecords.length;
        const proactiveCount = vaccinationCount + routineCareCount;
        const proactivePct = total > 0 ? Math.round((proactiveCount / total) * 100) : 100;

        const survivalRate = selectedBatch && selectedBatch.estimated_count > 0
            ? (((selectedBatch.estimated_count - totalDeceased) / selectedBatch.estimated_count) * 100).toFixed(1)
            : '100.0';

        // Age and days on farm
        let daysOnFarm = 0;
        let currentAgeDays = selectedBatch?.age_at_arrival_days || 0;
        if (selectedBatch?.arrival_date) {
            try {
                const arr = new Date(selectedBatch.arrival_date);
                const now = new Date();
                arr.setHours(0, 0, 0, 0);
                now.setHours(0, 0, 0, 0);
                const diff = Math.floor((now.getTime() - arr.getTime()) / 86400000);
                if (diff > 0) {
                    daysOnFarm = diff;
                    currentAgeDays += diff;
                }
            } catch (_) {}
        }

        // Distinct vaccines administered
        const distinctVaccines = Array.from(
            new Set(
                healthRecords
                    .filter(r => r.record_type === 'vaccination' && r.title)
                    .map(r => r.title)
            )
        );

        // Status rating
        let statusRating = 'Optimal Health';
        let statusColor = colors.primary;
        let statusBg = colors.primary + '18';

        if (parseFloat(mortalityRate) > 5.0 || activeIllnesses > 3) {
            statusRating = 'High Risk Alert';
            statusColor = colors.error;
            statusBg = colors.error + '18';
        } else if (parseFloat(mortalityRate) > 2.0 || activeIllnesses > 0) {
            statusRating = 'Guarded Trajectory';
            statusColor = colors.warning;
            statusBg = colors.warning + '18';
        } else if (proactivePct >= 80 && vaccinationCount >= 2) {
            statusRating = 'Optimal Biosecurity';
            statusColor = colors.primary;
            statusBg = colors.primary + '18';
        } else {
            statusRating = 'Stable Health';
            statusColor = colors.primary;
            statusBg = colors.primary + '18';
        }

        // Descriptive narrative
        let narrative = '';
        const speciesLabel = animalType === 'pig' ? 'swine herd' : 'flock';
        const headCountLabel = selectedBatch ? `${selectedBatch.current_count} heads` : 'the cohort';

        if (total === 0) {
            narrative = `No veterinary or health events have been recorded for ${selectedBatch ? selectedBatch.name : 'this batch'} yet. Routine immunization and baseline health checks are recommended upon cohort introduction.`;
        } else {
            const vaccineSummary = distinctVaccines.length > 0
                ? `Core pathogen defenses include completed immunizations for ${distinctVaccines.join(', ')}.`
                : 'Vaccination records are pending logging.';

            const mortalitySentence = totalDeceased === 0
                ? `Mortality is maintained at 0 heads (${survivalRate}% survival rate), demonstrating superior biosecurity and environmental management.`
                : `A total of ${totalDeceased} deceased heads (${mortalityRate}% mortality) have been recorded, remaining ${parseFloat(mortalityRate) <= 3.0 ? 'within safe industry limits' : 'elevated, requiring sanitation review'}.`;

            const illnessSentence = activeIllnesses === 0
                ? 'Zero acute morbidity or active infectious cases are present.'
                : `${activeIllnesses} active case${activeIllnesses === 1 ? ' requires' : 's require'} strict isolation and symptom monitoring.`;

            narrative = `The ${speciesLabel} has been on-farm for ${daysOnFarm} days (arrived on ${selectedBatch?.arrival_date || 'N/A'}, current age ~${currentAgeDays} days). ${mortalitySentence} Proactive healthcare accounts for ${proactivePct}% of all logs. ${vaccineSummary} ${illnessSentence}`;
        }

        return {
            survivalRate,
            proactivePct,
            proactiveCount,
            distinctVaccines,
            daysOnFarm,
            currentAgeDays,
            statusRating,
            statusColor,
            statusBg,
            narrative,
        };
    }, [healthRecords, selectedBatch, totalDeceased, mortalityRate, activeIllnesses, vaccinationCount, routineCareCount, animalType, colors]);

    // ─── Category Breakdown & Proportional Distribution ───────────────────────
    const categoryExplanation = useMemo(() => {
        const total = healthRecords.length;
        if (total === 0) return null;

        const vaccPct = Math.round((vaccinationCount / total) * 100);
        const routinePct = Math.round((routineCareCount / total) * 100);
        const obsPct = Math.round((observationCount / total) * 100);
        const treatPct = Math.round((treatmentCount / total) * 100);
        const illPct = Math.round((illnessCount / total) * 100);
        const mortPct = Math.max(0, 100 - vaccPct - routinePct - obsPct - treatPct - illPct);

        // Plain English assessments
        let immunizationAssessment = '';
        if (vaccinationCount >= 3) {
            immunizationAssessment = `Robust immunization protocol: ${vaccinationCount} vaccinations administered across key growth stages. Protection covers primary endemic pathogens with full dosage compliance.`;
        } else if (vaccinationCount > 0) {
            immunizationAssessment = `Active immunization program: ${vaccinationCount} vaccination${vaccinationCount === 1 ? '' : 's'} registered. Continue tracking booster intervals and observe withdrawal dates prior to harvest.`;
        } else {
            immunizationAssessment = 'Zero vaccinations logged to date. Consult veterinary schedule to establish core pathogen coverage.';
        }

        let parasiteStressAssessment = '';
        if (routineCareCount > 0) {
            parasiteStressAssessment = `Preventative maintenance confirmed: ${routineCareCount} nutritional stress pack and anti-parasite deworming interventions applied. Reduces subclinical drag and stabilizes feed conversion.`;
        } else {
            parasiteStressAssessment = 'No routine deworming or vitamin supplements logged. Schedule oral hydration electrolytes during high-temperature periods.';
        }

        let morbidityAssessment = '';
        if (activeIllnesses === 0 && totalDeceased === 0) {
            morbidityAssessment = 'Flock health index is optimal with 100% clean clinical surveillance. No respiratory, digestive, or locomotor disorders detected.';
        } else if (activeIllnesses > 0) {
            morbidityAssessment = `${activeIllnesses} animal(s) flagged with moderate-to-severe symptoms. Enforce isolation pens to prevent lateral transmission to healthy pen-mates.`;
        } else {
            morbidityAssessment = `Past mortality noted (${totalDeceased} heads), but current active clinical illness is clear. Daily feed and water intake remain steady.`;
        }

        let actionableRecommendation = '';
        if (animalType === 'pig') {
            if (biosecurityInsights.currentAgeDays > 75) {
                actionableRecommendation = 'Recommendation: Verify slaughter withdrawal windows for recent injectable vaccines and ensure clean water flow in finishing pens.';
            } else {
                actionableRecommendation = 'Recommendation: Maintain strict pen disinfection, check nipple drinker flow rates (1.5-2 L/min), and monitor growth uniformity following weaner transitions.';
            }
        } else {
            if (biosecurityInsights.currentAgeDays > 28) {
                actionableRecommendation = 'Recommendation: Monitor litter dryness to prevent footpad dermatitis and check drinker height as birds reach finisher weight.';
            } else {
                actionableRecommendation = 'Recommendation: Ensure brooding heat zones are uniform, administer post-vaccination electrolytes, and verify fresh starter crumb access.';
            }
        }

        return {
            vaccPct,
            routinePct,
            obsPct,
            treatPct,
            illPct,
            mortPct,
            immunizationAssessment,
            parasiteStressAssessment,
            morbidityAssessment,
            actionableRecommendation,
        };
    }, [healthRecords, vaccinationCount, routineCareCount, observationCount, treatmentCount, illnessCount, activeIllnesses, totalDeceased, animalType, biosecurityInsights]);

    // ─── Pie Chart Data ───────────────────────────────────────────────────────
    const pieData = useMemo(() => {
        const valCount = vaccinationCount;
        const illCount = illnessCount;
        const txCount = treatmentCount;
        const obsCount = observationCount;
        const routineCount = routineCareCount;

        return [
            { name: 'Vaccination', population: valCount, color: '#27AE60', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Routine Care', population: routineCount, color: '#16A085', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Observation', population: obsCount, color: '#8E44AD', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Treatment', population: txCount, color: '#2980B9', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Illness', population: illCount, color: '#E74C3C', legendFontColor: colors.textGrey, legendFontSize: 10 },
            { name: 'Mortality', population: totalDeceased, color: '#7F1D1D', legendFontColor: colors.textGrey, legendFontSize: 10 },
        ].filter(p => p.population > 0);
    }, [vaccinationCount, illnessCount, treatmentCount, observationCount, routineCareCount, totalDeceased, colors]);

    // ─── Timeline Line Chart Data ─────────────────────────────────────────────
    const lineChartData = useMemo(() => {
        const last6Months: string[] = [];
        const last6MonthsKeys: string[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setDate(1);
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
            const key = r.record_date.slice(0, 7);
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

    // ─── Fast Local AI Recommendations ────────────────────────────────────────
    const getHealthAnalysis = () => {
        if (healthRecords.length === 0) {
            return `No health records logged for ${selectedBatch ? selectedBatch.name : 'this batch'} yet. Begin recording vaccinations and routine care to populate analytics.`;
        }
        const severityWord = parseFloat(mortalityRate) > 3.0 ? 'above' : 'within';
        const illnessStatus = activeIllnesses > 0 ? `with ${activeIllnesses} active illness case(s) needing isolation and monitoring` : 'with no active severe clinical illnesses';
        return `Batch "${selectedBatch?.name}" maintains a herd survival rate of ${biosecurityInsights.survivalRate}% with a mortality rate of ${mortalityRate}% (${totalDeceased} deceased heads), which is ${severityWord} normal operational tolerance. The cohort has recorded ${healthRecords.length} total events (${biosecurityInsights.proactivePct}% proactive preventive care), ${illnessStatus}. Complete vaccination coverage supports stable growth trajectory.`;
    };

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingOptionStr = selectedHousing ? selectedHousing.name : 'No House Selected';

    const batchesOptions = filteredBatches.map(b => b.name);
    const selectedBatchOptionStr = selectedBatch ? selectedBatch.name : 'No Batch Selected';

    // ─── PDF Report Builder ───────────────────────────────────────────────────
    const buildHealthReport = useCallback((): ReportDocument | null => {
        if (!selectedBatch) return null;

        const eventRows = healthRecords.map(r => {
            let dateLabel = r.record_date;
            try {
                dateLabel = new Date(r.record_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch { /* raw */ }

            const typeConfig = RECORD_TYPE_CONFIG[r.record_type] || { label: r.record_type };
            const dosageInfo = r.dosage ? `${r.dosage}` : (r.affected_count ? `${r.affected_count} heads` : '—');

            return [
                dateLabel,
                typeConfig.label,
                r.title || '—',
                dosageInfo,
                r.severity ? r.severity.toUpperCase() : 'LOW',
                r.notes || '—',
            ];
        });

        const recs: string[] = [];
        if (categoryExplanation?.actionableRecommendation) {
            recs.push(categoryExplanation.actionableRecommendation.replace('Recommendation: ', ''));
        }
        recs.push(`Maintain biosecurity protocols and disinfect pen boundaries daily.`);
        if (biosecurityInsights.distinctVaccines.length > 0) {
            recs.push(`Documented immunization coverage: ${biosecurityInsights.distinctVaccines.join(', ')}.`);
        }

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
            reportTitle: 'Comprehensive Health & Biosecurity Report',
            farmName: selectedFarmDisplayName,
            subtitle: `${selectedBatch.name} · ${selectedHousing?.name ?? 'No Housing'} · ${animalType === 'pig' ? 'Swine Herd' : 'Poultry Flock'}`,
            meta: [
                { label: 'Farm / Facility', value: selectedFarmDisplayName },
                { label: 'Batch Name', value: selectedBatch.name },
                { label: 'Housing Unit', value: selectedHousing?.name ?? '—' },
                { label: 'Animal Species', value: animalType === 'pig' ? 'Swine (Pig)' : 'Poultry (Chicken)' },
                { label: 'Current Inventory', value: `${selectedBatch.current_count} heads (Initial: ${selectedBatch.estimated_count})` },
                { label: 'Arrival Date', value: `${selectedBatch.arrival_date} (${biosecurityInsights.daysOnFarm} days on-farm)` },
                { label: 'Cohort Age', value: `~${biosecurityInsights.currentAgeDays} days` },
            ],
            sections: [
                {
                    heading: 'Executive Health Summary',
                    stats: [
                        { label: 'Herd Survival', value: `${biosecurityInsights.survivalRate}%`, accent: parseFloat(mortalityRate) === 0 ? 'good' : 'warn' },
                        { label: 'Proactive Care', value: `${biosecurityInsights.proactivePct}%`, accent: 'good' },
                        { label: 'Vaccinations', value: String(vaccinationCount), accent: 'good' },
                        { label: 'Routine Care', value: String(routineCareCount) },
                        { label: 'Active Illnesses', value: String(activeIllnesses), accent: activeIllnesses > 0 ? 'warn' : undefined },
                        { label: 'Mortality Rate', value: `${mortalityRate}%`, accent: parseFloat(mortalityRate) > 3 ? 'bad' : 'good' },
                    ],
                    paragraphs: [
                        biosecurityInsights.narrative,
                        getHealthAnalysis(),
                    ],
                },
                {
                    heading: 'Clinical Findings & Surveillance',
                    paragraphs: [
                        categoryExplanation?.immunizationAssessment || 'Immunization status is steady.',
                        categoryExplanation?.parasiteStressAssessment || 'Nutritional routine is stable.',
                        categoryExplanation?.morbidityAssessment || 'No active severe cases reported.',
                    ],
                    bullets: recs,
                },
                {
                    heading: 'Complete Health Event Ledger',
                    table: {
                        headers: ['Date', 'Type', 'Title', 'Dose / Heads', 'Severity', 'Clinical Notes'],
                        rows: eventRows,
                        note: eventRows.length === 0 ? 'No health events recorded for this batch yet.' : undefined,
                    },
                },
            ],
        };
    }, [selectedBatch, selectedHousing, animalType, healthRecords, vaccinationCount, routineCareCount, activeIllnesses, mortalityRate, totalDeceased, biosecurityInsights, categoryExplanation, farmName]);

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, flex: 1, textAlign: 'center', marginHorizontal: 8 }]}>
                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} Health Report
                </Text>
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <PrintReportButton
                        buildReport={buildHealthReport}
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
                {/* Intro Text & Value Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4, gap: 12 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginTop: 0, marginBottom: 0 }]}>
                        Monitor vaccine coverages, active illnesses, routine deworming care, and dynamic mortality statistics.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface, paddingHorizontal: 12, flexShrink: 0 }]}>
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                            MORTALITY
                        </Text>
                        <Text style={[textStyles.h1, { color: '#EF4444', fontSize: 24, lineHeight: 28 }]}>
                            {mortalityRate}<Text style={{ fontSize: 14 }}>%</Text>
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
                                },
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
                                },
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

                {isLoading || isHealthLoading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading health reports...</Text>
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
                        {/* Core Health Metrics Grid */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                            {/* Mortality card */}
                            <View style={{
                                flex: 1, minWidth: '45%',
                                backgroundColor: colors.surface,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 16, padding: 14,
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
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
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
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
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
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
                                elevation: 1, shadowColor: colors.shadow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>Supplements</Text>
                                    <MaterialIcons name="medical-services" size={16} color="#2980B9" />
                                </View>
                                <Text style={[textStyles.h1, { fontSize: 24, color: '#2980B9' }]}>{routineCareCount}</Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>Vitamins & Deworming</Text>
                            </View>
                        </View>

                        {/* ─── NEW: Biosecurity & Health Insights Card (Descriptive) ──── */}
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
                            overflow: 'hidden',
                        }}>
                            {/* Card Header with Status Badge */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 170 }}>
                                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <MaterialIcons name="verified-user" size={20} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text }}>
                                            Biosecurity & Health Insights
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                            Clinical Trajectory & Protection Analysis
                                        </Text>
                                    </View>
                                </View>
                                <View style={{
                                    backgroundColor: biosecurityInsights.statusBg,
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: biosecurityInsights.statusColor + '30',
                                    flexShrink: 0,
                                }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: biosecurityInsights.statusColor }}>
                                        {biosecurityInsights.statusRating}
                                    </Text>
                                </View>
                            </View>

                            {/* 4 Metric Pill Boxes - Responsive 2x2 on phones, 1x4 on tablets */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                <View style={{ flex: 1, minWidth: width >= 600 ? '22%' : '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Herd Survival</Text>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.primary, marginTop: 2 }}>
                                        {biosecurityInsights.survivalRate}%
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                        {totalDeceased} deceased
                                    </Text>
                                </View>

                                <View style={{ flex: 1, minWidth: width >= 600 ? '22%' : '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Proactive Care</Text>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.primary, marginTop: 2 }}>
                                        {biosecurityInsights.proactivePct}%
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                        {biosecurityInsights.proactiveCount} preventive
                                    </Text>
                                </View>

                                <View style={{ flex: 1, minWidth: width >= 600 ? '22%' : '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Vaccine Shield</Text>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text, marginTop: 2 }}>
                                        {biosecurityInsights.distinctVaccines.length} Types
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                        {vaccinationCount} doses logged
                                    </Text>
                                </View>

                                <View style={{ flex: 1, minWidth: width >= 600 ? '22%' : '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>Active Morbidity</Text>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: activeIllnesses > 0 ? colors.warning : colors.text, marginTop: 2 }}>
                                        {activeIllnesses} Cases
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.textGrey }}>
                                        Clinical review
                                    </Text>
                                </View>
                            </View>

                            {/* Descriptive Narrative Box */}
                            <View style={{ backgroundColor: colors.bgLight, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.stroke }}>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, lineHeight: 18 }}>
                                    {biosecurityInsights.narrative}
                                </Text>
                            </View>
                        </View>

                        {/* ─── Record Breakdown & Categorical Analysis ─────────────────── */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            <View style={{ flex: 1, minWidth: 170 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 0 }]}>
                                    Health Event Distribution
                                </Text>
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 2 }}>
                                    Clinical Event Categories & Disease Surveillance
                                </Text>
                            </View>
                            {categoryExplanation && (
                                <View style={{
                                    backgroundColor: colors.primary + '15',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: colors.primary + '30',
                                    flexShrink: 0,
                                }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.primary }}>
                                        {healthRecords.length} Total Events
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Breakdown Visualizer Card */}
                        {categoryExplanation && (
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
                                overflow: 'hidden',
                            }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                        Categorical Ratio & Herd Coverage
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                        Lifetime Cohort Logs
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
                                    {categoryExplanation.vaccPct > 0 && (
                                        <View style={{ width: `${categoryExplanation.vaccPct}%`, backgroundColor: '#27AE60' }} />
                                    )}
                                    {categoryExplanation.routinePct > 0 && (
                                        <View style={{ width: `${categoryExplanation.routinePct}%`, backgroundColor: '#16A085' }} />
                                    )}
                                    {categoryExplanation.obsPct > 0 && (
                                        <View style={{ width: `${categoryExplanation.obsPct}%`, backgroundColor: '#8E44AD' }} />
                                    )}
                                    {categoryExplanation.treatPct > 0 && (
                                        <View style={{ width: `${categoryExplanation.treatPct}%`, backgroundColor: '#2980B9' }} />
                                    )}
                                    {categoryExplanation.illPct > 0 && (
                                        <View style={{ width: `${categoryExplanation.illPct}%`, backgroundColor: '#E74C3C' }} />
                                    )}
                                    {categoryExplanation.mortPct > 0 && (
                                        <View style={{ width: `${categoryExplanation.mortPct}%`, backgroundColor: '#7F1D1D' }} />
                                    )}
                                </View>

                                {/* Category Breakdown Badges - Responsive wrap */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                    {/* Vaccinations */}
                                    <View style={{
                                        flex: 1, minWidth: width >= 600 ? '30%' : '47%',
                                        backgroundColor: '#27AE6012',
                                        borderRadius: 10, padding: 10,
                                        borderWidth: 1, borderColor: '#27AE6030',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#27AE60' }}>VACCINES</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#27AE60', marginTop: 2 }}>{vaccinationCount}</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>{categoryExplanation.vaccPct}% of total</Text>
                                    </View>

                                    {/* Routine Care */}
                                    <View style={{
                                        flex: 1, minWidth: width >= 600 ? '30%' : '47%',
                                        backgroundColor: '#16A08512',
                                        borderRadius: 10, padding: 10,
                                        borderWidth: 1, borderColor: '#16A08530',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#16A085' }}>ROUTINE CARE</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#16A085', marginTop: 2 }}>{routineCareCount}</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>{categoryExplanation.routinePct}% of total</Text>
                                    </View>

                                    {/* Observations */}
                                    <View style={{
                                        flex: 1, minWidth: width >= 600 ? '30%' : '47%',
                                        backgroundColor: '#8E44AD12',
                                        borderRadius: 10, padding: 10,
                                        borderWidth: 1, borderColor: '#8E44AD30',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#8E44AD' }}>OBSERVATION</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#8E44AD', marginTop: 2 }}>{observationCount}</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>{categoryExplanation.obsPct}% of total</Text>
                                    </View>

                                    {/* Illnesses */}
                                    <View style={{
                                        flex: 1, minWidth: width >= 600 ? '30%' : '47%',
                                        backgroundColor: '#E74C3C12',
                                        borderRadius: 10, padding: 10,
                                        borderWidth: 1, borderColor: '#E74C3C30',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#E74C3C' }}>ILLNESSES</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#E74C3C', marginTop: 2 }}>{illnessCount}</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>{categoryExplanation.illPct}% of total</Text>
                                    </View>

                                    {/* Mortality */}
                                    <View style={{
                                        flex: 1, minWidth: width >= 600 ? '30%' : '47%',
                                        backgroundColor: '#7F1D1D12',
                                        borderRadius: 10, padding: 10,
                                        borderWidth: 1, borderColor: '#7F1D1D30',
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10, color: '#7F1D1D' }}>MORTALITY</Text>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: '#7F1D1D', marginTop: 2 }}>{totalDeceased}</Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>{mortalityRate}% of flock</Text>
                                    </View>
                                </View>

                                {/* Categorized Narrative Assessments */}
                                <View style={{ gap: 10, marginBottom: 12 }}>
                                    {/* Immunization Assessment */}
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                        <MaterialIcons name="check-circle" size={16} color="#27AE60" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>
                                            {categoryExplanation.immunizationAssessment}
                                        </Text>
                                    </View>

                                    {/* Parasite & Stress Management */}
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                        <MaterialIcons name="shield" size={16} color="#16A085" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>
                                            {categoryExplanation.parasiteStressAssessment}
                                        </Text>
                                    </View>

                                    {/* Morbidity Oversight */}
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                        <MaterialIcons name="info-outline" size={16} color={activeIllnesses > 0 ? colors.warning : colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>
                                            {categoryExplanation.morbidityAssessment}
                                        </Text>
                                    </View>
                                </View>

                                {/* Actionable Veterinary Recommendation */}
                                <View style={{
                                    flexDirection: 'row',
                                    gap: 8,
                                    alignItems: 'flex-start',
                                    backgroundColor: colors.primary + '10',
                                    borderWidth: 1,
                                    borderColor: colors.primary + '25',
                                    borderRadius: 10,
                                    padding: 10,
                                }}>
                                    <MaterialIcons name="lightbulb" size={16} color={colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.primary, flex: 1, lineHeight: 16 }}>
                                        {categoryExplanation.actionableRecommendation}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Pie Chart Card */}
                        <View style={{
                            borderRadius: 20,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            padding: 16,
                            marginBottom: 24,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.1, shadowRadius: 10,
                            elevation: 3,
                            overflow: 'hidden',
                        }}>
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text, marginBottom: 8 }}>
                                Proportional Event Breakdown
                            </Text>
                            {pieData.length === 0 ? (
                                <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                                    <MaterialIcons name="analytics" size={40} color={colors.stroke} style={{ marginBottom: 8 }} />
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 13, color: colors.textGrey }}>No health records for this batch.</Text>
                                </View>
                            ) : (
                                <View style={{ alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                                    <PieChart
                                        data={pieData}
                                        width={Math.max(260, width - hPad * 2 - 32)}
                                        height={180}
                                        chartConfig={{
                                            color: (opacity = 1) => colors.text,
                                        }}
                                        accessor="population"
                                        backgroundColor="transparent"
                                        paddingLeft="5"
                                        center={[0, 0]}
                                        absolute
                                    />
                                </View>
                            )}
                        </View>

                        {/* ─── Line Chart: Incidents & Mortality Timeline ─────────────── */}
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
                            overflow: 'hidden',
                        }}>
                            {!lineChartData.hasRealData ? (
                                <View style={{ height: 220, justifyContent: 'center', alignItems: 'center', paddingLeft: 16 }}>
                                    <MaterialIcons name="show-chart" size={40} color={colors.stroke} style={{ marginBottom: 8 }} />
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 13, color: colors.textGrey, textAlign: 'center' }}>No historical events recorded in the last 6 months.</Text>
                                </View>
                            ) : (
                                <>
                                    <View style={{ alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                                        <LineChart
                                            data={lineChartData}
                                            width={Math.max(260, width - hPad * 2 - 28)}
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
                                                    r: '4',
                                                    strokeWidth: '2',
                                                    stroke: colors.surface,
                                                },
                                            }}
                                            style={{
                                                borderRadius: 16,
                                            }}
                                        />
                                    </View>
                                    {/* Legend */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10, paddingLeft: 16, flexWrap: 'wrap' }}>
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
                                flexDirection: 'row', gap: 8, alignItems: 'flex-start',
                            }}>
                                <MaterialIcons name="assessment" size={16} color={colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, flex: 1, lineHeight: 18 }}>
                                    This timeline tracks cumulative monthly health incidents and mortality occurrences over the last 6 months. Longitudinal surveillance assists farm management in detecting seasonal disease pressures, verifying vaccine timing, and optimizing biosecurity standards across batches.
                                </Text>
                            </View>
                        )}

                        {/* ─── NEW: Health Events Log Ledger Card ─────────────────────── */}
                        {healthRecords.length > 0 && (
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
                                overflow: 'hidden',
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 170 }}>
                                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <MaterialIcons name="history-edu" size={18} color={colors.primary} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text }}>
                                                Recent Health Events Log
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                Detailed veterinary interventions and observations
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{
                                        backgroundColor: colors.bgLight,
                                        paddingHorizontal: 8,
                                        paddingVertical: 3,
                                        borderRadius: 8,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        flexShrink: 0,
                                    }}>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey }}>
                                            {healthRecords.length} records
                                        </Text>
                                    </View>
                                </View>

                                {/* Event List Items */}
                                <View style={{ gap: 10 }}>
                                    {(showAllEvents ? healthRecords : healthRecords.slice(0, 4)).map((record) => {
                                        const cfg = RECORD_TYPE_CONFIG[record.record_type] || {
                                            label: record.record_type,
                                            color: colors.primary,
                                            icon: 'healing',
                                        };

                                        let formattedDate = record.record_date;
                                        try {
                                            const d = new Date(record.record_date);
                                            formattedDate = d.toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            });
                                        } catch (_) {}

                                        return (
                                            <View
                                                key={record.id}
                                                style={{
                                                    backgroundColor: colors.bgLight,
                                                    borderRadius: 12,
                                                    padding: 12,
                                                    borderWidth: 1,
                                                    borderColor: colors.stroke,
                                                }}
                                            >
                                                {/* Top Row: Date, Badge, Severity */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                                                        <View style={{
                                                            backgroundColor: cfg.color + '18',
                                                            paddingHorizontal: 8,
                                                            paddingVertical: 2,
                                                            borderRadius: 6,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            flexShrink: 0,
                                                        }}>
                                                            <MaterialIcons name={cfg.icon} size={12} color={cfg.color} />
                                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: cfg.color }}>
                                                                {cfg.label}
                                                            </Text>
                                                        </View>
                                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                            {formattedDate}
                                                        </Text>
                                                    </View>

                                                    {record.severity && record.severity !== 'low' && (
                                                        <View style={{
                                                            backgroundColor: (record.severity === 'high' ? colors.error : colors.warning) + '18',
                                                            paddingHorizontal: 6,
                                                            paddingVertical: 2,
                                                            borderRadius: 6,
                                                            flexShrink: 0,
                                                        }}>
                                                            <Text style={{
                                                                fontFamily: 'Poppins-SemiBold',
                                                                fontSize: 9,
                                                                color: record.severity === 'high' ? colors.error : colors.warning,
                                                                textTransform: 'uppercase',
                                                            }}>
                                                                {record.severity} Severity
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Title */}
                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                                    {record.title}
                                                </Text>

                                                {/* Dosage & Affected info */}
                                                {(record.dosage || record.affected_count !== null) && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                                        {record.affected_count !== null && (
                                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                                Heads: {record.affected_count}
                                                            </Text>
                                                        )}
                                                        {record.dosage && (
                                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                                {record.affected_count !== null ? '· ' : ''}Dosage: {record.dosage}
                                                            </Text>
                                                        )}
                                                    </View>
                                                )}

                                                {/* Notes snippet */}
                                                {record.notes && (
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 4, lineHeight: 16 }}>
                                                        {record.notes}
                                                    </Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>

                                {/* Show More / Show Less Toggle Button */}
                                {healthRecords.length > 4 && (
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => setShowAllEvents(!showAllEvents)}
                                        style={{
                                            marginTop: 12,
                                            paddingVertical: 8,
                                            borderRadius: 8,
                                            backgroundColor: colors.cardFill,
                                            alignItems: 'center',
                                            flexDirection: 'row',
                                            justifyContent: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 12, color: colors.primary }}>
                                            {showAllEvents ? 'Show Fewer Events' : `View All ${healthRecords.length} Events`}
                                        </Text>
                                        <MaterialIcons
                                            name={showAllEvents ? 'expand-less' : 'expand-more'}
                                            size={18}
                                            color={colors.primary}
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Fast, Dynamic, Instant AI Analysis Recommendations */}
                        <AIInsightCard
                            title="AniBot Health Analysis"
                            staticContent={getHealthAnalysis()}
                            variant="green"
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

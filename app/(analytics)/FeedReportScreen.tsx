import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { PrintReportButton } from '@/components/PrintReportButton';
import { AniFeedIcon } from '@/components/AniFeedIcon';
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

interface FeedItemBreakdown {
    feedId: string;
    category: string;
    feedName: string;
    brand: string;
    consumption: number; // in kg
    stockKg: number;
    percentage: number;
}

export default function FeedReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

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
    const [reportData, setReportData] = useState<FeedItemBreakdown[]>([]);
    const [totalDispenses, setTotalDispenses] = useState<number>(0);
    const [timeframe, setTimeframe] = useState<'This Week' | 'This Month'>('This Week');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    
    // Interactive chart tooltip
    const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; value: number; label: string } | null>(null);

    const [chartData, setChartData] = useState<{
        labels: string[];
        datasets: {
            data: number[];
            strokeWidth?: number;
        }[];
    } | null>(null);

    // Filtered housings based on selected animal type (pig/chicken)
    const filteredHousings = useMemo(() => {
        return allHousings.filter(h => h.animal_type === animalType);
    }, [allHousings, animalType]);

    const selectedHousing = useMemo(() => {
        return allHousings.find(h => h.id === selectedHousingId) ?? null;
    }, [allHousings, selectedHousingId]);

    // Active batch in the selected housing
    const activeBatch = useMemo(() => {
        if (!selectedHousingId) return null;
        return allBatches.find(b => b.housing_id === selectedHousingId) || null;
    }, [allBatches, selectedHousingId]);

    // Calculate current age of the batch in days
    const batchAgeDays = useMemo(() => {
        if (!activeBatch) return null;
        const arrival = new Date(activeBatch.arrival_date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.max(0, Math.floor((today.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)));
        return (activeBatch.age_at_arrival_days || 0) + diffDays;
    }, [activeBatch]);

    const headCount = activeBatch?.current_count || selectedHousing?.current_count || 0;

    // ─── Fetch Housings & Batches ────────────────────────────────
    const fetchHousingsAndBatches = useCallback(async () => {
        if (!farmId) {
            setIsLoading(false);
            return;
        }
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
                    .select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id')
                    .eq('farm_id', farmId)
                    .eq('status', 'active')
                    .order('arrival_date', { ascending: false }),
            ]);

            if (housingsRes.error) throw housingsRes.error;
            if (batchesRes.error) throw batchesRes.error;

            setAllHousings((housingsRes.data || []) as HousingInfo[]);
            setAllBatches((batchesRes.data || []) as BatchInfo[]);
        } catch (err) {
            console.error('[FeedReportScreen] error loading housings and batches:', err);
        }
    }, [farmId]);

    useEffect(() => {
        fetchHousingsAndBatches();
    }, [fetchHousingsAndBatches]);

    const handleSwitchAnimalType = useCallback((type: 'pig' | 'chicken') => {
        if (type === animalType) return;
        setAnimalType(type);
        setChartTooltip(null);
        const targetHousings = allHousings.filter(h => h.animal_type === type);
        if (targetHousings.length > 0) {
            const nextHousingId = targetHousings[0].id;
            setSelectedHousingId(nextHousingId);
        } else {
            setSelectedHousingId(null);
            setReportData([]);
            setChartData(null);
            setTotalDispenses(0);
        }
    }, [animalType, allHousings]);

    const handleSelectHousing = useCallback((housingId: string) => {
        if (housingId === selectedHousingId) return;
        setSelectedHousingId(housingId);
        setChartTooltip(null);
    }, [selectedHousingId]);

    // ─── Resolve selected housing when animal type or housings change ─
    useEffect(() => {
        if (filteredHousings.length > 0) {
            const exists = filteredHousings.some(h => h.id === selectedHousingId);
            if (!exists) {
                setSelectedHousingId(filteredHousings[0].id);
            }
        } else {
            setSelectedHousingId(null);
        }
    }, [animalType, filteredHousings, selectedHousingId]);

    // ─── Fetch Feed Consumption (Dispense Records) ───────────────
    const fetchConsumption = useCallback(async () => {
        if (!selectedHousingId) {
            setReportData([]);
            setChartData(null);
            setTotalDispenses(0);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setChartTooltip(null);
        try {
            const now = new Date();
            const startDate = new Date();
            if (timeframe === 'This Week') {
                startDate.setDate(now.getDate() - 7);
            } else {
                startDate.setDate(now.getDate() - 30);
            }

            const { data, error } = await supabase
                .from('dispense_records')
                .select(`
                    id,
                    grams_dispensed,
                    dispensed_at,
                    feed_id,
                    status,
                    triggered_by,
                    feeds (
                        id,
                        name,
                        brand,
                        category,
                        stock_kg
                    )
                `)
                .eq('housing_id', selectedHousingId)
                .eq('status', 'success')
                .gte('dispensed_at', startDate.toISOString())
                .order('dispensed_at', { ascending: true });

            if (error) throw error;

            const records = data || [];
            setTotalDispenses(records.length);

            // Calculate total consumption
            let totalGrams = 0;
            const groupedMap = new Map<string, {
                feedId: string;
                category: string;
                feedName: string;
                brand: string;
                consumption: number;
                stockKg: number;
            }>();

            records.forEach((record: any) => {
                const feed = record.feeds;
                const grams = record.grams_dispensed || 0;
                totalGrams += grams;
                const kg = grams / 1000;

                const categoryName = feed?.category || 'General';
                const feedTitle = feed?.name || 'General Feed';
                const brandName = feed?.brand || '';
                const stock = Number(feed?.stock_kg || 0);

                const key = feed?.id || `${categoryName}-${feedTitle}`;
                if (groupedMap.has(key)) {
                    const existing = groupedMap.get(key)!;
                    existing.consumption += kg;
                } else {
                    groupedMap.set(key, {
                        feedId: feed?.id || key,
                        category: categoryName,
                        feedName: feedTitle,
                        brand: brandName,
                        consumption: kg,
                        stockKg: stock,
                    });
                }
            });

            const totalKg = totalGrams / 1000;
            const breakdownList: FeedItemBreakdown[] = Array.from(groupedMap.values()).map(item => ({
                ...item,
                percentage: totalKg > 0 ? Math.round((item.consumption / totalKg) * 100) : 0,
            }));

            setReportData(breakdownList);

            // ─── Generate Chart Data ──────────────────────────────────────
            const chartLabels: string[] = [];
            const chartValues: number[] = [];

            if (timeframe === 'This Week') {
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(now.getDate() - i);
                    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
                    chartLabels.push(label);

                    const startOfDay = new Date(d);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(d);
                    endOfDay.setHours(23, 59, 59, 999);

                    const sumGrams = records.reduce((sum: number, r: any) => {
                        const rDate = new Date(r.dispensed_at);
                        if (rDate >= startOfDay && rDate <= endOfDay) {
                            return sum + (r.grams_dispensed || 0);
                        }
                        return sum;
                    }, 0);

                    chartValues.push(Math.round((sumGrams / 1000) * 10) / 10); // in kg with 1 decimal
                }
            } else {
                for (let i = 5; i >= 0; i--) {
                    const daysAgo = i * 5;
                    const d = new Date();
                    d.setDate(now.getDate() - daysAgo);
                    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    chartLabels.push(label);

                    const startRange = new Date(d);
                    startRange.setDate(d.getDate() - 4);
                    startRange.setHours(0, 0, 0, 0);
                    const endRange = new Date(d);
                    endRange.setHours(23, 59, 59, 999);

                    const sumGrams = records.reduce((sum: number, r: any) => {
                        const rDate = new Date(r.dispensed_at);
                        if (rDate >= startRange && rDate <= endRange) {
                            return sum + (r.grams_dispensed || 0);
                        }
                        return sum;
                    }, 0);

                    chartValues.push(Math.round((sumGrams / 1000) * 10) / 10); // in kg
                }
            }

            setChartData({
                labels: chartLabels,
                datasets: [
                    {
                        data: chartValues,
                        strokeWidth: 3,
                    }
                ]
            });
        } catch (err) {
            console.error('[FeedReportScreen] error loading consumption:', err);
            setChartData(null);
        } finally {
            setIsLoading(false);
        }
    }, [selectedHousingId, timeframe]);

    useEffect(() => {
        fetchConsumption();
    }, [fetchConsumption]);

    // ─── Realtime: Live update consumption when new dispense records land ───
    useEffect(() => {
        if (!farmId) return;
        const channel = supabase
            .channel(`realtime-feed-report-${farmId}-${selectedHousingId || 'all'}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'dispense_records',
                    filter: `farm_id=eq.${farmId}`,
                },
                () => {
                    fetchConsumption();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [farmId, selectedHousingId, fetchConsumption]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchHousingsAndBatches();
        await fetchConsumption();
        setRefreshing(false);
    }, [fetchHousingsAndBatches, fetchConsumption]);

    // Helpers
    const getCategoryColor = (category: string) => {
        const cat = category.toLowerCase();
        if (cat.includes('booster') || cat.includes('pre-starter')) return colors.secondary;
        if (cat.includes('finisher')) return colors.warning;
        if (cat.includes('starter')) return colors.info;
        return colors.primary; // Grower / normal
    };

    const totalConsumption = useMemo(() => {
        return reportData.reduce((sum, item) => sum + item.consumption, 0);
    }, [reportData]);

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingOptionStr = selectedHousing ? selectedHousing.name : 'No House Selected';

    // ─── Dynamic Feed Analysis & Descriptive Insights ─────────────
    const feedAnalysis = useMemo(() => {
        if (reportData.length === 0 || totalConsumption <= 0) {
            return null;
        }

        const daysCount = timeframe === 'This Week' ? 7 : 30;
        const avgDailyKg = totalConsumption / daysCount;
        const count = headCount > 0 ? headCount : (animalType === 'chicken' ? 30 : 10);
        const dailyIntakePerHeadGrams = Math.round((avgDailyKg * 1000) / count);

        let stageName = '';
        let targetIntakeGrams = 0;
        let stageDesc = '';

        if (animalType === 'chicken') {
            if (!batchAgeDays || batchAgeDays > 24) {
                stageName = 'Broiler Finisher Stage';
                targetIntakeGrams = 160;
                stageDesc = 'Finisher pellets provide high metabolizable energy and balanced protein for optimal muscle gain as birds approach target market weight.';
            } else if (batchAgeDays > 10) {
                stageName = 'Broiler Starter Stage';
                targetIntakeGrams = 85;
                stageDesc = 'Starter crumbles support rapid skeleton development and lean muscle frame formation.';
            } else {
                stageName = 'Chick Booster Stage';
                targetIntakeGrams = 35;
                stageDesc = 'Booster micro-crumbles provide concentrated nutrients for vital organ and immune system establishment.';
            }
        } else {
            if (!batchAgeDays || batchAgeDays > 90) {
                stageName = 'Swine Finisher Stage';
                targetIntakeGrams = 2800;
                stageDesc = 'Finishing ration delivers high energy density for maximum weight gain and optimal backfat thickness.';
            } else if (batchAgeDays > 60) {
                stageName = 'Swine Grower Stage';
                targetIntakeGrams = 1800;
                stageDesc = 'Grower pellets promote lean muscle deposition and skeletal expansion.';
            } else if (batchAgeDays > 30) {
                stageName = 'Pig Starter Stage';
                targetIntakeGrams = 1000;
                stageDesc = 'Post-weaning starter ration strengthens intestinal villi and transitions weanlings smoothly to solid dry feed.';
            } else {
                stageName = 'Pig Pre-Starter Stage';
                targetIntakeGrams = 350;
                stageDesc = 'Creep pre-starter features milk proteins and easily digestible cooked grains for young piglets.';
            }
        }

        // Benchmark comparison
        const benchmarkRatio = targetIntakeGrams > 0 ? (dailyIntakePerHeadGrams / targetIntakeGrams) : 1;
        let appetiteStatus = 'Optimal Appetite';
        let appetiteColor = colors.primary;
        let appetiteBadgeText = 'Healthy Intake';

        if (benchmarkRatio > 1.15) {
            appetiteStatus = 'Elevated Appetite';
            appetiteColor = colors.info;
            appetiteBadgeText = 'High Feed Demand';
        } else if (benchmarkRatio < 0.85) {
            appetiteStatus = 'Sub-Optimal Intake';
            appetiteColor = colors.warning;
            appetiteBadgeText = 'Appetite Monitored';
        }

        // Trajectory calculation (first half vs second half of chart values)
        let trajectoryStatus = 'Consistent Intake';
        if (chartData && chartData.datasets[0]?.data.length >= 4) {
            const dataArr = chartData.datasets[0].data;
            const mid = Math.floor(dataArr.length / 2);
            const firstHalf = dataArr.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
            const secondHalf = dataArr.slice(mid).reduce((a, b) => a + b, 0) / (dataArr.length - mid);
            const pctDiff = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

            if (pctDiff >= 8) {
                trajectoryStatus = `+${Math.round(pctDiff)}% Rising Appetite`;
            } else if (pctDiff <= -8) {
                trajectoryStatus = `${Math.round(pctDiff)}% Slowing Intake`;
            } else {
                trajectoryStatus = 'Consistent Daily Intake';
            }
        }

        const sortedFeeds = [...reportData].sort((a, b) => b.consumption - a.consumption);
        const topFeed = sortedFeeds[0];
        const topPct = totalConsumption > 0 ? Math.round((topFeed.consumption / totalConsumption) * 100) : 0;

        const totalRemainingStock = reportData.reduce((sum, item) => sum + (item.stockKg || 0), 0);
        const estimatedRunwayDays = avgDailyKg > 0 ? Math.max(1, Math.round(totalRemainingStock / avgDailyKg)) : 30;

        return {
            stageName,
            stageDesc,
            dailyIntakePerHeadGrams,
            targetIntakeGrams,
            benchmarkRatio,
            avgDailyKg,
            appetiteStatus,
            appetiteColor,
            appetiteBadgeText,
            trajectoryStatus,
            topFeedName: topFeed.feedName,
            topFeedBrand: topFeed.brand,
            topFeedCategory: topFeed.category,
            topPct,
            totalDispenses,
            estimatedRunwayDays,
            totalRemainingStock,
        };
    }, [reportData, totalConsumption, timeframe, headCount, animalType, batchAgeDays, chartData, colors, totalDispenses]);

    // Dynamic AI Insights text for AniBot card
    const getBotAnalysis = () => {
        if (!feedAnalysis) {
            return `No feed consumption records found for ${selectedHousing ? selectedHousing.name : 'this house'} in ${timeframe.toLowerCase()}.`;
        }

        const animalLabel = animalType === 'pig' ? 'pigs' : 'chickens';
        return `In ${selectedHousing?.name ?? 'this house'}, ${headCount} ${animalLabel} consumed a total of ${totalConsumption.toFixed(1)} kg over ${timeframe.toLowerCase()}. Daily feed intake averages ${feedAnalysis.dailyIntakePerHeadGrams} g/head (${Math.round(feedAnalysis.benchmarkRatio * 100)}% of the ${feedAnalysis.targetIntakeGrams} g standard). Primary diet is ${feedAnalysis.topFeedName} (${feedAnalysis.topFeedCategory}), accounting for ${feedAnalysis.topPct}% of intake with approximately ${feedAnalysis.estimatedRunwayDays} days of storage remaining.`;
    };

    // ─── PDF Report Builder ──────────────────────────────────────
    const buildFeedReport = useCallback((): ReportDocument | null => {
        if (!selectedHousing) return null;

        const sorted = [...reportData].sort((a, b) => b.consumption - a.consumption);
        const rows = sorted.map(item => [
            item.brand ? `${item.feedName} (${item.brand})` : item.feedName,
            item.category,
            `${item.consumption.toFixed(2)} kg`,
            `${item.percentage}%`,
            item.stockKg > 0 ? `${item.stockKg} kg` : 'N/A',
        ]);

        return {
            reportTitle: 'Feed Consumption & Nutritional Report',
            farmName,
            subtitle: `${selectedHousing.name} · ${animalType === 'pig' ? 'Pigs' : 'Chickens'} · ${timeframe}`,
            meta: [
                { label: 'Housing', value: selectedHousing.name },
                { label: 'Batch', value: activeBatch ? `${activeBatch.name} (Day ${batchAgeDays ?? 'N/A'})` : 'No Batch' },
                { label: 'Animal Type', value: animalType === 'pig' ? 'Pig' : 'Chicken' },
                { label: 'Head Count', value: `${headCount} heads` },
                { label: 'Report Period', value: timeframe },
                { label: 'Total Dispenses', value: `${totalDispenses} records` },
            ],
            sections: [
                {
                    heading: 'Executive Feeding Performance',
                    stats: [
                        { label: 'Total Consumed', value: `${totalConsumption.toFixed(1)} kg` },
                        { label: 'Avg Daily / Head', value: feedAnalysis ? `${feedAnalysis.dailyIntakePerHeadGrams} g/day` : 'N/A' },
                        { label: 'Appetite Rating', value: feedAnalysis?.appetiteStatus || 'Normal' },
                        { label: 'Feed Runway', value: feedAnalysis ? `~${feedAnalysis.estimatedRunwayDays} days` : 'N/A' },
                    ],
                    paragraphs: [
                        getBotAnalysis(),
                        feedAnalysis ? feedAnalysis.stageDesc : '',
                    ].filter(Boolean),
                },
                {
                    heading: 'Feed Ration Breakdown',
                    table: {
                        headers: ['Feed & Brand', 'Category', 'Consumption', '% of Total', 'Stock Left'],
                        rows,
                        note: rows.length === 0 ? 'No feed consumption recorded for this period.' : undefined,
                    },
                },
            ],
        };
    }, [selectedHousing, activeBatch, batchAgeDays, animalType, headCount, timeframe, totalDispenses, reportData, totalConsumption, feedAnalysis, farmName]);

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, flex: 1, textAlign: 'center', marginHorizontal: 8 }]}>
                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} Feed Report
                </Text>
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <PrintReportButton
                        buildReport={buildFeedReport}
                        emptyMessage="Select a housing first."
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 4, gap: 12 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginTop: 0, marginBottom: 0 }]}>
                        Monitor feeding efficiency, daily intake per head, and ration stock for your {animalType === 'pig' ? 'pigs' : 'chickens'}.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.stroke, flexShrink: 0 }]}>
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.85 }]}>
                            CONSUMED
                        </Text>
                        <Text style={[textStyles.h1, { color: colors.primary, fontSize: 24, lineHeight: 28 }]}>
                            {totalConsumption.toFixed(1)}<Text style={{ fontSize: 14 }}> kg</Text>
                        </Text>
                    </View>
                </View>

                {/* Animal Type Segment Filter */}
                <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.stroke, padding: 4, marginBottom: 18 }}>
                    {(['pig', 'chicken'] as const).map(type => {
                        const isSelected = animalType === type;
                        return (
                            <TouchableOpacity
                                key={type}
                                onPress={() => handleSwitchAnimalType(type)}
                                activeOpacity={0.8}
                                style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 10,
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

                {/* House Selection Dropdown */}
                <View style={{ marginBottom: 20 }}>
                    <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 6 }]}>
                        Select a house
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
                                elevation: 1,
                                shadowColor: colors.shadow,
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.5,
                                shadowRadius: 4,
                                paddingVertical: 14,
                                borderRadius: 14,
                                opacity: filteredHousings.length > 0 ? 1 : 0.6,
                            }
                        ]}
                        onPress={() => setHousingModalVisible(true)}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <MaterialIcons name="home" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>
                                    {selectedHousingOptionStr}
                                </Text>
                                {activeBatch && (
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 1 }}>
                                        {activeBatch.name} · {headCount} heads {batchAgeDays !== null ? `· Day ${batchAgeDays}` : ''}
                                    </Text>
                                )}
                            </View>
                        </View>
                        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>

                {isLoading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading report details...</Text>
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
                ) : reportData.length === 0 ? (
                    /* Empty Feed Logs State */
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                            <AniFeedIcon size={32} />
                        </View>
                        <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center' }]}>No Feed Logs</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            No successful feed dispense records were found for {selectedHousing?.name} in {timeframe.toLowerCase()}.
                        </Text>
                    </View>
                ) : (
                    /* ─── Informative Feed Consumption Content ─── */
                    <>
                        {/* KPI 4-Metric Grid (Two explicit 2-column rows to prevent flexWrap calculation overflow) */}
                        <View style={{ gap: 10, marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {/* Total Consumed */}
                                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.stroke }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <MaterialIcons name="inventory-2" size={16} color={colors.primary} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Total Consumed</Text>
                                    </View>
                                    <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 19, color: colors.text }}>
                                        {totalConsumption.toFixed(1)} <Text style={{ fontSize: 12, fontFamily: 'Poppins-Regular', color: colors.textGrey }}>kg</Text>
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey, marginTop: 2 }}>
                                        {totalDispenses} automated dispenses
                                    </Text>
                                </View>

                                {/* Daily Intake / Head */}
                                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.stroke }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <MaterialIcons name="speed" size={16} color={colors.secondary} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Avg Daily / Head</Text>
                                    </View>
                                    <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 19, color: colors.text }}>
                                        {feedAnalysis?.dailyIntakePerHeadGrams ?? 0} <Text style={{ fontSize: 12, fontFamily: 'Poppins-Regular', color: colors.textGrey }}>g/day</Text>
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey, marginTop: 2 }}>
                                        Standard: ~{feedAnalysis?.targetIntakeGrams ?? 0} g
                                    </Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {/* Appetite Index */}
                                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.stroke }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <MaterialIcons name="check-circle" size={16} color={feedAnalysis?.appetiteColor || colors.primary} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Appetite Status</Text>
                                    </View>
                                    <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 15, color: feedAnalysis?.appetiteColor || colors.primary, marginTop: 2 }}>
                                        {feedAnalysis?.appetiteStatus || 'Normal'}
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey, marginTop: 2 }}>
                                        {feedAnalysis?.trajectoryStatus || 'Steady Intake'}
                                    </Text>
                                </View>

                                {/* Stock Runway */}
                                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.stroke }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <MaterialIcons name="schedule" size={16} color={colors.warning} />
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>Feed Runway</Text>
                                    </View>
                                    <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 18, color: colors.text }}>
                                        ~{feedAnalysis?.estimatedRunwayDays ?? 30} <Text style={{ fontSize: 12, fontFamily: 'Poppins-Regular', color: colors.textGrey }}>days left</Text>
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey, marginTop: 2 }}>
                                        {Math.round(feedAnalysis?.totalRemainingStock ?? 0)} kg remaining
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Timeframe Toggle & Chart Title */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Daily Feed Intake</Text>
                            <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke, padding: 2 }}>
                                {(['This Week', 'This Month'] as const).map(tf => (
                                    <TouchableOpacity
                                        key={tf}
                                        onPress={() => setTimeframe(tf)}
                                        style={{
                                            paddingHorizontal: 12,
                                            paddingVertical: 6,
                                            borderRadius: 6,
                                            backgroundColor: timeframe === tf ? colors.primary + '1A' : 'transparent',
                                        }}
                                    >
                                        <Text style={[textStyles.label, { color: timeframe === tf ? colors.primary : colors.textGrey, fontSize: 11 }]}>{tf}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Feed Consumption Interactive Chart */}
                        {chartData && chartData.datasets[0].data.length > 0 && (
                            <View style={{ alignItems: 'center', marginBottom: 20, alignSelf: 'stretch' }}>
                                <View style={{
                                    borderRadius: 20,
                                    backgroundColor: colors.surface,
                                    paddingTop: 16,
                                    paddingBottom: 6,
                                    overflow: 'hidden',
                                    elevation: 3,
                                    shadowColor: colors.shadow,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.08,
                                    shadowRadius: 10,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    width: '100%',
                                }}>
                                    <LineChart
                                        data={chartData}
                                        width={Math.max(260, width - (hPad * 2) - 4)}
                                        height={220}
                                        yAxisLabel=""
                                        yAxisSuffix=" kg"
                                        fromZero
                                        withDots={true}
                                        withInnerLines={true}
                                        withOuterLines={false}
                                        withVerticalLines={false}
                                        withHorizontalLines={true}
                                        onDataPointClick={({ x, y, value, index }) => {
                                            const label = chartData.labels?.[index] ?? `#${index + 1}`;
                                            setChartTooltip(prev =>
                                                prev && prev.x === x && prev.y === y ? null : { x, y, value, label }
                                            );
                                        }}
                                        decorator={() => {
                                            if (!chartTooltip) return null;
                                            const { x, y, value, label } = chartTooltip;
                                            const tipW = 84;
                                            const tipH = 38;
                                            const maxChartW = Math.max(260, width - (hPad * 2) - 4);
                                            const rawX = x + tipW + 8 > maxChartW ? x - tipW - 6 : x - tipW / 2;
                                            const offsetX = Math.max(6, Math.min(rawX, maxChartW - tipW - 6));
                                            const offsetY = y - tipH - 10 < 0 ? y + 8 : y - tipH - 8;
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
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.surface }}>{value.toFixed(1)} kg</Text>
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 9, color: colors.surface, opacity: 0.75 }}>{label}</Text>
                                                </View>
                                            );
                                        }}
                                        chartConfig={{
                                            backgroundColor: colors.surface,
                                            backgroundGradientFrom: colors.surface,
                                            backgroundGradientTo: colors.surface,
                                            decimalPlaces: 1,
                                            color: (opacity = 1) => colors.primary,
                                            labelColor: (opacity = 1) => colors.textGrey,
                                            strokeWidth: 3,
                                            fillShadowGradientFrom: colors.primary,
                                            fillShadowGradientFromOpacity: 0.2,
                                            fillShadowGradientTo: colors.primary,
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
                                            paddingRight: 36,
                                        }}
                                    />
                                </View>
                            </View>
                        )}

                        {/* ─── Informative In-Depth Analysis Card ─── */}
                        {feedAnalysis && (
                            <View style={{
                                backgroundColor: colors.surface,
                                borderRadius: 18,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                padding: 18,
                                shadowColor: colors.shadow,
                                shadowOffset: { width: 0, height: 3 },
                                shadowOpacity: 0.08,
                                shadowRadius: 8,
                                elevation: 2,
                                marginBottom: 22,
                            }}>
                                {/* Header with Icon and Velocity Badge */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                                                                    <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14.5, color: colors.text }}>
                                                Feed Intake & Appetite
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                Nutritional Trajectory & Growth
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{
                                         backgroundColor: feedAnalysis.appetiteColor + '18',
                                         paddingHorizontal: 10,
                                         paddingVertical: 4,
                                         borderRadius: 999,
                                         borderWidth: 1,
                                         borderColor: feedAnalysis.appetiteColor + '30',
                                         flexShrink: 0,
                                     }}>
                                         <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 10.5, color: feedAnalysis.appetiteColor }}>
                                             {feedAnalysis.appetiteBadgeText}
                                         </Text>
                                     </View>
                                 </View>

                                 {/* Quick Metric Pills (2x2 grid for generous width and zero truncation) */}
                                 <View style={{ gap: 8, marginBottom: 14 }}>
                                     <View style={{ flexDirection: 'row', gap: 8 }}>
                                         <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                             <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey }}>Daily Intake / Head</Text>
                                             <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13.5, color: colors.text, marginTop: 2 }}>
                                                 {feedAnalysis.dailyIntakePerHeadGrams} g/day
                                             </Text>
                                         </View>
                                         <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                             <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey }}>Feeding Stage</Text>
                                             <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text, marginTop: 2 }}>
                                                 {feedAnalysis.stageName}
                                             </Text>
                                         </View>
                                     </View>
                                     <View style={{ flexDirection: 'row', gap: 8 }}>
                                         <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                             <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey }}>Appetite Trend</Text>
                                             <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: feedAnalysis.appetiteColor, marginTop: 2 }}>
                                                 {feedAnalysis.trajectoryStatus}
                                             </Text>
                                         </View>
                                         <View style={{ flex: 1, backgroundColor: colors.bgLight, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.stroke }}>
                                             <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey }}>Target Standard</Text>
                                             <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text, marginTop: 2 }}>
                                                 ~{feedAnalysis.targetIntakeGrams} g/head
                                             </Text>
                                         </View>
                                     </View>
                                 </View>

                                 <View style={{ height: 1, backgroundColor: colors.divider, marginBottom: 14 }} />

                                 {/* Detailed Narrative Explanation */}
                                 <View style={{ gap: 10 }}>
                                     <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12.5, color: colors.text, lineHeight: 19 }}>
                                         In <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{selectedHousing?.name}</Text>, the active flock of <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{headCount} {animalType === 'pig' ? 'pigs' : 'chickens'}</Text> {activeBatch ? `(${activeBatch.name}${batchAgeDays !== null ? `, Day ${batchAgeDays}` : ''})` : ''} consumed a total of <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.primary }}>{totalConsumption.toFixed(1)} kg</Text> of feed across {totalDispenses} automated dispenses over {timeframe.toLowerCase()}. Daily feed intake averages <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{feedAnalysis.dailyIntakePerHeadGrams} g/head/day</Text> ({feedAnalysis.avgDailyKg.toFixed(1)} kg/day house consumption).
                                     </Text>

                                     <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12.5, color: colors.text, lineHeight: 19 }}>
                                         <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.text }}>Growth Alignment: </Text>
                                         {feedAnalysis.stageDesc} The primary diet currently being dispensed is <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{feedAnalysis.topFeedName}</Text> ({feedAnalysis.topFeedCategory}), representing <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.primary }}>{feedAnalysis.topPct}%</Text> of total intake.
                                     </Text>

                                     <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12.5, color: colors.text, lineHeight: 19 }}>
                                         <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.text }}>Appetite Assessment: </Text>
                                         Intake is running at <Text style={{ fontFamily: 'Poppins-SemiBold', color: feedAnalysis.appetiteColor }}>{Math.round(feedAnalysis.benchmarkRatio * 100)}% of the target standard</Text> (~{feedAnalysis.targetIntakeGrams} g/day). {feedAnalysis.benchmarkRatio >= 0.9 && feedAnalysis.benchmarkRatio <= 1.15 ? 'Feeding rhythm is stable and healthy across morning, midday, and evening automated dispenses.' : feedAnalysis.benchmarkRatio > 1.15 ? 'Appetite is vigorous, indicating high metabolic rate and accelerated growth rate.' : 'Intake is slightly below target; verify water supply, pen temperature, and feeder hopper clearance.'}
                                     </Text>

                                     {/* Actionable Recommendations */}
                                     <View style={{ backgroundColor: colors.bgLight, borderRadius: 12, padding: 12, marginTop: 4, borderWidth: 1, borderColor: colors.stroke }}>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                             <MaterialIcons name="lightbulb" size={16} color={colors.warning} />
                                             <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                                 Farm Management Guidance
                                             </Text>
                                         </View>
                                         <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11.5, color: colors.textGrey, lineHeight: 17 }}>
                                             • Ensure constant access to cool drinking water ({animalType === 'chicken' ? 'broilers require 1.8–2.0x water to feed ratio' : 'swine require 2.0–2.5x water to feed ratio'}).{'\n'}
                                             • Feeder hopper inventory has approximately <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.text }}>~{feedAnalysis.estimatedRunwayDays} days of feed remaining</Text> at current daily consumption rates.{'\n'}
                                             • Clean feeder trays regularly to avoid dust accumulation and optimize feed conversion ratio (FCR).
                                         </Text>
                                     </View>
                                 </View>
                             </View>
                         )}

                         {/* ─── Category & Feed Ration Breakdown Card ─── */}
                         <View style={{
                             backgroundColor: colors.surface,
                             borderRadius: 18,
                             borderWidth: 1,
                             borderColor: colors.stroke,
                             marginBottom: 20,
                             padding: 16,
                             shadowColor: colors.shadow,
                             shadowOffset: { width: 0, height: 3 },
                             shadowOpacity: 0.08,
                             shadowRadius: 8,
                             elevation: 2,
                         }}>
                             <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                 <View style={{ flex: 1, marginRight: 8 }}>
                                     <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>Feed Rations Used</Text>
                                     <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                         Detailed share and stock availability by feed type
                                     </Text>
                                 </View>
                                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.primary + '15', flexShrink: 0 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.primary }}>
                                        {reportData.length} active {reportData.length === 1 ? 'ration' : 'rations'}
                                    </Text>
                                </View>
                            </View>

                            <View style={{ gap: 14 }}>
                                {reportData.map((item) => {
                                    const catColor = getCategoryColor(item.category);
                                    return (
                                        <View key={item.feedId} style={{ backgroundColor: colors.bgLight, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.stroke }}>
                                            {/* Top row: Name + Category Pill + Kg */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                                <View style={{ flex: 1, marginRight: 10 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13.5, color: colors.text }}>
                                                            {item.feedName}
                                                        </Text>
                                                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: catColor + '18' }}>
                                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: catColor }}>
                                                                {item.category}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    {item.brand ? (
                                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, marginTop: 1 }}>
                                                            Brand: {item.brand}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                                <View style={{ alignItems: 'flex-end', flexShrink: 0, minWidth: 70 }}>
                                                    <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 15, color: colors.text }}>
                                                        {item.consumption.toFixed(1)} kg
                                                    </Text>
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey }}>
                                                        {item.percentage}% of diet
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Progress Bar */}
                                            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.stroke + '80', overflow: 'hidden', marginVertical: 4 }}>
                                                <View style={{ height: '100%', width: `${Math.min(100, Math.max(5, item.percentage))}%`, backgroundColor: catColor, borderRadius: 3 }} />
                                            </View>

                                            {/* Bottom row: Remaining stock indicator */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10.5, color: colors.textGrey }}>
                                                    Storage Stock: <Text style={{ fontFamily: 'Poppins-SemiBold', color: item.stockKg <= 50 ? colors.warning : colors.text }}>{item.stockKg} kg</Text>
                                                </Text>
                                                {item.stockKg <= 50 && item.stockKg > 0 && (
                                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.warning }}>
                                                        Reorder Soon
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* AI Insight Card */}
                        <AIInsightCard
                            title="AniBot Feeding Advice"
                            category="feed_report"
                            farmId={farmId}
                            subKey={activeBatch?.id ? `${activeBatch.id}_${animalType}` : (selectedHousingId ? `${selectedHousingId}_${animalType}` : animalType)}
                            staticContent={getBotAnalysis()}
                            context={{
                                type: 'feed',
                                animalType,
                                housingName: selectedHousing?.name,
                                data: {
                                    batchId: activeBatch?.id,
                                    housingId: selectedHousingId,
                                    totalConsumption,
                                    totalDispenses,
                                    headCount,
                                    batchAgeDays,
                                    timeframe,
                                    appetiteStatus: feedAnalysis?.appetiteStatus,
                                    dailyIntakePerHeadGrams: feedAnalysis?.dailyIntakePerHeadGrams,
                                    reportSummary: reportData.map(r => ({ id: r.feedId, name: r.feedName, kg: r.consumption })),
                                }
                            }}
                            variant="orange"
                        />
                    </>
                )}
            </ScrollView>

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
                description="Choose a house to view its specific feed report."
                icon="home"
                options={housingsOptions}
                selectedValue={selectedHousingOptionStr}
                requireConfirm={false}
                enableSearch={false}
            />
        </SafeAreaView>
    );
}

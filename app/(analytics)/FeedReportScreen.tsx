import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
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
    const [reportData, setReportData] = useState<{
        category: string;
        feedName: string;
        consumption: number;
    }[]>([]);
    const [timeframe, setTimeframe] = useState<'This Week' | 'This Month'>('This Week');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [chartData, setChartData] = useState<{
        labels: string[];
        datasets: {
            data: number[];
            strokeWidth?: number;
        }[];
    } | null>(null);

    // Filtered housings based on selected animal type (pig/chicken)
    const filteredHousings = allHousings.filter(h => h.animal_type === animalType);
    const selectedHousing = allHousings.find(h => h.id === selectedHousingId) ?? null;

    // ─── Fetch Housings ──────────────────────────────────────────
    const fetchAllHousings = useCallback(async () => {
        if (!farmId) {
            setIsLoading(false);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('housings')
                .select('id, name, animal_type, status, current_count')
                .eq('farm_id', farmId)
                .eq('status', 'Active')
                .order('name', { ascending: true });

            if (error) throw error;
            setAllHousings((data || []) as any[] as HousingInfo[]);
        } catch (err) {
            console.error('[FeedReportScreen] error loading housings:', err);
        }
    }, [farmId]);

    useEffect(() => {
        fetchAllHousings();
    }, [fetchAllHousings]);

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
    }, [animalType, allHousings, selectedHousingId]);

    // ─── Fetch Feed Consumption (Dispense Records) ───────────────
    const fetchConsumption = useCallback(async () => {
        if (!selectedHousingId) {
            setReportData([]);
            setChartData(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const now = new Date();
            let startDate = new Date();
            if (timeframe === 'This Week') {
                startDate.setDate(now.getDate() - 7);
            } else {
                startDate.setDate(now.getDate() - 30);
            }

            const { data, error } = await supabase
                .from('dispense_records')
                .select(`
                    grams_dispensed,
                    dispensed_at,
                    feed_id,
                    feeds (
                        id,
                        name,
                        brand,
                        category
                    )
                `)
                .eq('housing_id', selectedHousingId)
                .eq('status', 'success')
                .gte('dispensed_at', startDate.toISOString());

            if (error) throw error;

            // Group by feed category or feed name
            const groupedMap = new Map<string, {
                category: string;
                feedName: string;
                consumption: number;
            }>();

            (data || []).forEach((record: any) => {
                const feed = record.feeds;
                const grams = record.grams_dispensed || 0;
                const kg = grams / 1000;

                const categoryName = feed?.category || 'General';
                const brandName = feed ? (feed.brand ? `${feed.name} (${feed.brand})` : feed.name) : 'Unknown Feed';

                const key = `${categoryName}-${brandName}`;
                if (groupedMap.has(key)) {
                    const existing = groupedMap.get(key)!;
                    existing.consumption += kg;
                } else {
                    groupedMap.set(key, {
                        category: categoryName,
                        feedName: brandName,
                        consumption: kg,
                    });
                }
            });

            setReportData(Array.from(groupedMap.values()));

            // ─── Generate Chart Data ──────────────────────────────────────
            const chartLabels: string[] = [];
            const chartValues: number[] = [];

            if (timeframe === 'This Week') {
                // Generate last 7 days chronologically
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(now.getDate() - i);
                    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
                    chartLabels.push(label);

                    // Sum up grams dispensed on this specific date
                    const startOfDay = new Date(d);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(d);
                    endOfDay.setHours(23, 59, 59, 999);

                    const sumGrams = (data || []).reduce((sum: number, r: any) => {
                        const rDate = new Date(r.dispensed_at);
                        if (rDate >= startOfDay && rDate <= endOfDay) {
                            return sum + (r.grams_dispensed || 0);
                        }
                        return sum;
                    }, 0);

                    chartValues.push(sumGrams / 1000); // in kg
                }
            } else {
                // This Month: Group into 6 intervals of 5 days each
                for (let i = 5; i >= 0; i--) {
                    const daysAgo = i * 5;
                    const d = new Date();
                    d.setDate(now.getDate() - daysAgo);
                    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    chartLabels.push(label);

                    // Group logs in the 5-day window ending at this point
                    const startRange = new Date(d);
                    startRange.setDate(d.getDate() - 4);
                    startRange.setHours(0, 0, 0, 0);
                    const endRange = new Date(d);
                    endRange.setHours(23, 59, 59, 999);

                    const sumGrams = (data || []).reduce((sum: number, r: any) => {
                        const rDate = new Date(r.dispensed_at);
                        if (rDate >= startRange && rDate <= endRange) {
                            return sum + (r.grams_dispensed || 0);
                        }
                        return sum;
                    }, 0);

                    chartValues.push(sumGrams / 1000); // in kg
                }
            }

            setChartData({
                labels: chartLabels,
                datasets: [
                    {
                        data: chartValues,
                        strokeWidth: 4,
                    }
                ]
            });
        } catch (err) {
            console.error('[FeedReportScreen] error loading consumption:', err);
            setChartData(null);
        } finally {
            setIsLoading(false);
        }
    }, [selectedHousingId, timeframe, allHousings]);

    useEffect(() => {
        fetchConsumption();
    }, [fetchConsumption]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchAllHousings();
        setRefreshing(false);
    }, [fetchAllHousings]);

    // Helpers
    const getCategoryColor = (category: string) => {
        const cat = category.toLowerCase();
        if (cat.includes('booster') || cat.includes('pre-starter')) return colors.secondary;
        if (cat.includes('finisher')) return colors.warning;
        if (cat.includes('starter')) return colors.info;
        return colors.primary; // Grower / normal
    };

    const totalConsumption = reportData.reduce((sum, item) => sum + item.consumption, 0);

    const housingsOptions = filteredHousings.map(h => h.name);
    const selectedHousingOptionStr = selectedHousing ? selectedHousing.name : 'No House Selected';

    // Dynamic AI Insights
    const getBotAnalysis = () => {
        if (reportData.length === 0) {
            return `No feed consumption records found for ${selectedHousing ? selectedHousing.name : 'this house'} in the selected timeframe.`;
        }
        const sorted = [...reportData].sort((a, b) => b.consumption - a.consumption);
        const topFeed = sorted[0];
        const pct = totalConsumption > 0 ? Math.round((topFeed.consumption / totalConsumption) * 100) : 0;

        return `${selectedHousing?.name ?? 'This house'} has consumed a total of ${totalConsumption.toFixed(1)} kg of feed. The primary feed was ${topFeed.feedName} (${topFeed.category}), accounting for ${pct}% of overall intake.`;
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(analytics)/AnalyticsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    {animalType === 'pig' ? 'Pigs' : 'Chickens'} Feed Report
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
                        Monitor feeding efficiency, waste tracked, and overall feed intake for your {animalType === 'pig' ? 'pigs' : 'chickens'}.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface, paddingHorizontal: 12 }]}>
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                            CONSUMED
                        </Text>
                        <Text style={[textStyles.h1, { color: colors.primary, fontSize: 24, lineHeight: 28 }]}>
                            {Math.round(totalConsumption)}<Text style={{fontSize: 14}}>kg</Text>
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
                                onPress={() => {
                                    setAnimalType(type);
                                }}
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

                {/* House Selection */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 0 }]}>
                        Select a house
                    </Text>
                </View>

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
                            marginBottom: 24,
                            paddingVertical: 14,
                            opacity: filteredHousings.length > 0 ? 1 : 0.6,
                        }
                    ]}
                    onPress={() => setHousingModalVisible(true)}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <MaterialIcons name="home" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, flex: 1 }]} numberOfLines={1}>
                            {selectedHousingOptionStr}
                        </Text>
                    </View>
                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                </TouchableOpacity>

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
                        <MaterialIcons name="restaurant" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>No Feed Logs</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13 }]}>
                            No successful feed dispense records were found for {selectedHousing?.name} in {timeframe.toLowerCase()}.
                        </Text>
                    </View>
                ) : (
                    /* Dynamic Feed Consumption Report Content */
                    <>
                        {/* Timeframe Toggle */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>Feed Consumption</Text>
                            <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke, padding: 2 }}>
                                {['This Week', 'This Month'].map(tf => (
                                    <TouchableOpacity
                                        key={tf}
                                        onPress={() => setTimeframe(tf as 'This Week' | 'This Month')}
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
                        {/* Feed Consumption Chart */}
                        {chartData && chartData.datasets[0].data.length > 0 && (
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
                                }}>
                                    <LineChart
                                        data={chartData}
                                        width={width - (hPad * 2) - 18} // exact calculated width fitting its container
                                        height={220}
                                        yAxisLabel=""
                                        yAxisSuffix=" kg"
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
                                        }}
                                    />
                                </View>
                            </View>
                        )}

                        {/* Consumption Table container */}
                        <View style={{
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            marginBottom: 24,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.1,
                            shadowRadius: 10,
                            elevation: 2,
                            overflow: 'hidden'
                        }}>
                            <View style={{ flexDirection: 'row', backgroundColor: colors.inputFill, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                                <Text style={[textStyles.h3, { flex: 2, color: colors.text, fontSize: 13 }]}>Category / Feed</Text>
                                <Text style={[textStyles.h3, { flex: 1, textAlign: 'right', color: colors.text, fontSize: 13 }]}>Total (kg)</Text>
                            </View>
                            
                            {reportData.map((data, idx) => (
                                <View key={idx} style={{ 
                                    flexDirection: 'row', 
                                    padding: 16, 
                                    borderBottomWidth: idx < reportData.length - 1 ? 1 : 0, 
                                    borderBottomColor: colors.stroke 
                                }}>
                                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'flex-start' }}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getCategoryColor(data.category), marginTop: 6, marginRight: 12 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginBottom: 2 }]}>{data.category}</Text>
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]} numberOfLines={1}>{data.feedName}</Text>
                                        </View>
                                    </View>
                                    <View style={{ flex: 1, justifyContent: 'center' }}>
                                        <Text style={[textStyles.h3, { textAlign: 'right', color: colors.text, fontSize: 14 }]}>
                                            {data.consumption.toFixed(1)} kg
                                        </Text>
                                    </View>
                                </View>
                            ))}

                            <View style={{ flexDirection: 'row', backgroundColor: colors.inputFill, padding: 16, borderTopWidth: 1, borderTopColor: colors.stroke }}>
                                <Text style={[textStyles.h3, { flex: 2, color: colors.text }]}>Total</Text>
                                <Text style={[textStyles.h2, { flex: 1, textAlign: 'right', color: colors.primary, fontSize: 16 }]}>
                                    {totalConsumption.toFixed(1)} kg
                                </Text>
                            </View>
                        </View>

                        <AIInsightCard
                            title="AniBot Analysis"
                            staticContent={getBotAnalysis()}
                            variant="green"
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
                        setSelectedHousingId(matched.id);
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

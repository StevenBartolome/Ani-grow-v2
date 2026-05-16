import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';

import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';

export default function GrowthReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const [selectedTab, setSelectedTab] = useState('All');
    const [selectedBatch, setSelectedBatch] = useState('1');
    const [batchModalVisible, setBatchModalVisible] = useState(false);
    const [timeframe, setTimeframe] = useState<'Days' | 'Weeks'>('Days');

    const tabs = ['All', 'Underweight', 'Normal', 'Overweight'];
    const batches = ['1', '2', '3'];

    const underweightCount = 12;
    const normalCount = 85;
    const overweightCount = 3;

    const { type } = useLocalSearchParams();
    const animalType = typeof type === 'string' ? type : 'Pigs';

    const getFormattedDate = () => {
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    };

    const getCategoryCount = (category: string) => {
        if (category === 'Underweight') return underweightCount;
        if (category === 'Normal') return normalCount;
        if (category === 'Overweight') return overweightCount;
        return underweightCount + normalCount + overweightCount;
    };

    const getTabColor = (category: string) => {
        if (category === 'Underweight') return colors.secondary;
        if (category === 'Overweight') return colors.warning; // Mapping to warning/orange
        return colors.primary;
    };

    const activeColor = getTabColor(selectedTab);

    const getChartData = () => {
        let labels = timeframe === 'Days' ? ['17', '18', '19', '20', '21', '22'] : ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
        
        // Highly accurate progressive growth data simulation (in kg)
        const normalData = timeframe === 'Days' 
            ? [0.62, 0.70, 0.78, 0.86, 0.95, 1.04]
            : [0.18, 0.45, 0.85, 1.40, 2.05, 2.80];

        const underData = timeframe === 'Days'
            ? [0.55, 0.61, 0.67, 0.74, 0.80, 0.88]
            : [0.15, 0.38, 0.70, 1.15, 1.70, 2.30];

        const overData = timeframe === 'Days'
            ? [0.70, 0.80, 0.90, 1.02, 1.12, 1.25]
            : [0.20, 0.52, 1.00, 1.65, 2.40, 3.20];

        if (selectedTab === 'All') {
            return {
                labels,
                datasets: [
                    {
                        data: normalData,
                        color: (opacity = 1) => colors.primary,
                        strokeWidth: 4
                    },
                    {
                        data: underData,
                        color: (opacity = 1) => colors.secondary,
                        strokeWidth: 4
                    },
                    {
                        data: overData,
                        color: (opacity = 1) => colors.warning,
                        strokeWidth: 4
                    }
                ]
            };
        }

        let currentData = normalData;
        if (selectedTab === 'Underweight') currentData = underData;
        else if (selectedTab === 'Overweight') currentData = overData;

        return {
            labels,
            datasets: [
                {
                    data: currentData,
                    color: (opacity = 1) => activeColor,
                    strokeWidth: 4
                }
            ]
        };
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header matches AnimalDetails.tsx */}
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    {animalType} Growth
                </Text>
                <View style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[animalStyles.scrollContent, { paddingTop: 8, paddingBottom: 60 }]}>

                {/* Intro Text & Day Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginRight: 16, marginTop: 0, marginBottom: 0 }]}>
                        Here are the growth statistics and analytics for your {animalType.toLowerCase()}.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface }]}>
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                            DAY
                        </Text>
                        <Text style={[textStyles.h1, { color: colors.primary, fontSize: 24, lineHeight: 28 }]}>
                            22
                        </Text>
                    </View>
                </View>

                {/* Batch Selection matches AnimalDetails.tsx */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[textStyles.label, animalStyles.dropdownLabel, { color: colors.text, marginBottom: 0 }]}>
                        Select a batch no.
                    </Text>
                </View>

                <TouchableOpacity
                    activeOpacity={0.8}
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
                        }
                    ]}
                    onPress={() => setBatchModalVisible(true)}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="layers" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>Batch {selectedBatch}</Text>
                    </View>
                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                </TouchableOpacity>

                {/* Filter Chips matching DevicesScreen.tsx */}
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
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Total Animals</Text>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>{selectedTab} Group</Text>
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[textStyles.h1, { color: activeColor, fontSize: 28, lineHeight: 32 }]}>
                            {getCategoryCount(selectedTab)}
                        </Text>
                        <Text style={[textStyles.label, { color: activeColor, fontSize: 11, opacity: 0.8 }]}>Heads</Text>
                    </View>
                </View>

                {/* Timeframe Toggle & Chart */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke, padding: 2 }}>
                        {['Days', 'Weeks'].map(tf => (
                            <TouchableOpacity
                                key={tf}
                                onPress={() => setTimeframe(tf as 'Days' | 'Weeks')}
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
                    }}>
                        <LineChart
                            data={getChartData()}
                            width={width - (hPad * 2) - 18} // exact calculated width fitting its container
                            height={240}
                            yAxisLabel=""
                            yAxisSuffix="kg"
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
                    </View>
                </View>

                <AIInsightCard 
                    title="AniBot Insight"
                    staticContent="Your animals are showing steady growth. The normal group is exceeding weight targets by 2%. Monitor the underweight group for feed competition."
                    variant="green"
                />

            </ScrollView>

            {/* Batch Selection Modal */}
            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={(val) => {
                    setSelectedBatch(val);
                    setBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose a batch number to view its specific growth report."
                icon="layers"
                options={batches}
                selectedValue={selectedBatch}
                requireConfirm={false}
                enableSearch={false}
            />
        </SafeAreaView>
    );
}

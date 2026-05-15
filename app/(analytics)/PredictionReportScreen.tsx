import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';

import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';

export default function PredictionReportScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const animalStyles = useAnimalStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const [selectedBatch, setSelectedBatch] = useState('1');
    const [batchModalVisible, setBatchModalVisible] = useState(false);
    const [timeframe, setTimeframe] = useState<'30 Days' | '60 Days'>('30 Days');

    const tabs = ['Chickens', 'Pigs'];
    const batches = ['1', '2', '3'];

    const chickenCount = 100;
    const pigCount = 50;

    const { type } = useLocalSearchParams();
    const animalType = typeof type === 'string' ? type : 'Pigs';

    const getFormattedDate = () => {
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    };

    const getCategoryCount = (category: string) => {
        if (category === 'Chickens') return chickenCount;
        if (category === 'Pigs') return pigCount;
        return 0;
    };

    const getTabColor = (category: string) => {
        if (category === 'Pigs') return colors.pig || '#EC4899';
        if (category === 'Chickens') return colors.chicken || '#F97316';
        return colors.prediction;
    };

    const activeColor = getTabColor(animalType);

    const getChartData = () => {
        let labels = timeframe === '30 Days' ? ['+5D', '+10D', '+15D', '+20D', '+25D', '+30D'] : ['+10D', '+20D', '+30D', '+40D', '+50D', '+60D'];
        
        // Highly accurate predictive growth data simulation (in kg)
        const chickenData = timeframe === '30 Days' 
            ? [1.2, 1.4, 1.6, 1.8, 2.05, 2.3]
            : [1.3, 1.6, 1.9, 2.2, 2.5, 2.8];

        const pigData = timeframe === '30 Days'
            ? [25, 30, 35, 41, 48, 55]
            : [30, 40, 50, 62, 75, 90];

        const currentData = animalType === 'Pigs' ? pigData : chickenData;

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
                    Prediction & Forecast
                </Text>
                <View style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[animalStyles.scrollContent, { paddingTop: 8, paddingBottom: 60 }]}>

                {/* Intro Text & Day Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginRight: 16, marginTop: 0, marginBottom: 0 }]}>
                        Review AI-driven growth trajectory projections and forecasting estimates.
                    </Text>
                    <View style={[styles.dayBadge, { marginBottom: 0, backgroundColor: colors.surface }]}>
                        <Text style={[textStyles.label, { color: colors.prediction, fontSize: 10, letterSpacing: 1.2, opacity: 0.8 }]}>
                            CONFIDENCE
                        </Text>
                        <Text style={[textStyles.h1, { color: colors.prediction, fontSize: 24, lineHeight: 28 }]}>
                            92%
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
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>{animalType} Group</Text>
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[textStyles.h1, { color: activeColor, fontSize: 28, lineHeight: 32 }]}>
                            {getCategoryCount(animalType)}
                        </Text>
                        <Text style={[textStyles.label, { color: activeColor, fontSize: 11, opacity: 0.8 }]}>Heads</Text>
                    </View>
                </View>

                {/* Timeframe Toggle & Chart */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke, padding: 2 }}>
                        {['30 Days', '60 Days'].map(tf => (
                            <TouchableOpacity
                                key={tf}
                                onPress={() => setTimeframe(tf as '30 Days' | '60 Days')}
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

                {/* AniBot Insight */}
                <LinearGradient
                    colors={[colors.prediction || '#8E24AA', '#BA68C8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={animalStyles.insightCard}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                        <View style={animalStyles.insightIconBox}>
                            <MaterialIcons name="auto-awesome" size={20} color="#FFF" />
                        </View>
                        <Text style={[textStyles.h3, { color: '#FFF', marginLeft: 12 }]}>AniBot Prediction</Text>
                    </View>
                    <Text style={[textStyles.body, { color: '#FFF', opacity: 0.9, lineHeight: 22 }]}>
                        Based on current feeding trends, your {animalType.toLowerCase()} will reach optimal harvest weight 4 days earlier than initially expected. Consider adjusting the feed mixture in the final week for fat marbling.
                    </Text>
                </LinearGradient>

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

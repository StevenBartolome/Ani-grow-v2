import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { AIInsightCard } from '@/components/AIInsightCard';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';

export default function FeedReportScreen() {
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
    const [timeframe, setTimeframe] = useState<'This Week' | 'This Month'>('This Week');

    const batches = ['1', '2', '3'];

    const { type } = useLocalSearchParams();
    const animalType = typeof type === 'string' ? type : 'Pigs';

    const getCategoryColor = (category: string) => {
        if (category === 'Underweight') return colors.secondary;
        if (category === 'Overweight') return colors.warning;
        return colors.primary;
    };

    const multiplier = timeframe === 'This Month' ? 4 : 1;

    // Data mapped directly from dart concept with multiplier for interaction
    const reportData = [
        {
            category: 'Underweight',
            feedName: 'Purina (Booster)',
            consumption: 150.5 * multiplier,
            costPerKg: 42.50,
        },
        {
            category: 'Normal',
            feedName: 'B-Meg (Grower)',
            consumption: 500.2 * multiplier,
            costPerKg: 38.00,
        },
        {
            category: 'Overweight',
            feedName: 'Vitarich (Finisher)',
            consumption: 80.0 * multiplier,
            costPerKg: 36.50,
        },
    ];

    const totalConsumption = reportData.reduce((sum, item) => sum + item.consumption, 0);
    const totalCost = reportData.reduce((sum, item) => sum + (item.consumption * item.costPerKg), 0);

    const formatCurrency = (amount: number) => {
        return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={animalStyles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    {animalType} Feed Report
                </Text>
                <View style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[animalStyles.scrollContent, { paddingTop: 8, paddingBottom: 60 }]}>
                {/* Intro Text & Value Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
                    <Text style={[textStyles.body, animalStyles.detailsSubtitle, { color: colors.textGrey, flex: 1, marginRight: 16, marginTop: 0, marginBottom: 0 }]}>
                        Monitor feeding efficiency, waste tracked, and overall feed intake for your {animalType.toLowerCase()}.
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

                {/* Batch Selection */}
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
                                <View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginBottom: 2 }]}>{data.category}</Text>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>{data.feedName}</Text>
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
                    staticContent="Normal weight group consumed 68% of total feed (B-Meg). Underweight group shows steady intake of Purina (Booster)."
                    variant="green"
                />

                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginTop: 16, marginBottom: 16 }]}>Feed Cost</Text>

                {/* Cost Table container */}
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
                        <Text style={[textStyles.h3, { flex: 2, color: colors.text, fontSize: 13 }]}>Category</Text>
                        <Text style={[textStyles.h3, { flex: 1, textAlign: 'right', color: colors.text, fontSize: 13 }]}>Cost/kg</Text>
                        <Text style={[textStyles.h3, { flex: 1, textAlign: 'right', color: colors.text, fontSize: 13 }]}>Total</Text>
                    </View>
                    
                    {reportData.map((data, idx) => (
                        <View key={idx} style={{ 
                            flexDirection: 'row', 
                            padding: 16, 
                            borderBottomWidth: idx < reportData.length - 1 ? 1 : 0, 
                            borderBottomColor: colors.stroke,
                            alignItems: 'center'
                        }}>
                            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getCategoryColor(data.category), marginRight: 12 }} />
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 13 }]}>{data.category}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.label, { textAlign: 'right', color: colors.textGrey, fontSize: 13 }]}>
                                    ₱{data.costPerKg.toFixed(0)}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.h3, { textAlign: 'right', color: colors.text, fontSize: 13 }]}>
                                    ₱{formatCurrency(data.consumption * data.costPerKg)}
                                </Text>
                            </View>
                        </View>
                    ))}

                    <View style={{ flexDirection: 'row', backgroundColor: colors.inputFill, padding: 16, borderTopWidth: 1, borderTopColor: colors.stroke }}>
                        <Text style={[textStyles.h3, { flex: 2, color: colors.text }]}>Overall Cost</Text>
                        <Text style={[textStyles.h2, { flex: 2, textAlign: 'right', color: colors.warning, fontSize: 16 }]}>
                            ₱{formatCurrency(totalCost)}
                        </Text>
                    </View>
                </View>

                <AIInsightCard 
                    title="Cost Efficiency"
                    staticContent="Total cost is optimized. Purina (Booster) for underweight animals cost ₱42.50/kg, which is investment-heavy but necessary for recovery."
                    variant="orange"
                />

            </ScrollView>

            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={(val) => {
                    setSelectedBatch(val);
                    setBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose a batch number to view its specific feed report."
                icon="layers"
                options={batches}
                selectedValue={selectedBatch}
                requireConfirm={false}
                enableSearch={false}
            />
        </SafeAreaView>
    );
}

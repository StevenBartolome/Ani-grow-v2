import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniFeedStyles } from '@/styles/anifeedStyles';

// Mock Types
interface DispenseLogEntry {
    id: string;
    amount: string;
    time: string;
    status: 'success' | 'error' | 'pending';
    timestamp: number;
}

interface DispenseTime {
    time: string;
    amount: string;
    status: 'success' | 'error' | 'pending';
}

interface DispenseStat {
    id: string;
    dateLabel: string;
    totalAmount: string;
    totalTimes: number;
    history: DispenseTime[];
}

export default function DispenseRecordsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAniFeedStyles();
    const router = useRouter();

    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

    const toggleCard = (id: string) => {
        setExpandedCards(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const { deviceId } = useLocalSearchParams();
    const [stats, setStats] = useState<DispenseStat[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch and aggregate logs (Mocked)
    useEffect(() => {
        const timer = setTimeout(() => {
            const now = new Date();
            const todayStr = now.toDateString();
            
            const mockLogs: DispenseLogEntry[] = [
                { id: '1', amount: '500g', time: '06:00 AM', status: 'success', timestamp: now.getTime() - 1000000 },
                { id: '2', amount: '500g', time: '12:00 PM', status: 'success', timestamp: now.getTime() - 5000000 },
                { id: '3', amount: '500g', time: '06:00 AM', status: 'success', timestamp: now.getTime() - 86400000 - 1000000 },
            ];

            // Group logs by date string
            const groupedLogs = mockLogs.reduce((acc, log) => {
                const date = new Date(log.timestamp);
                const dayStr = date.toDateString();
                if (!acc[dayStr]) {
                    acc[dayStr] = { dateObj: date, logs: [] };
                }
                acc[dayStr].logs.push(log);
                return acc;
            }, {} as Record<string, { dateObj: Date, logs: DispenseLogEntry[] }>);

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yestStr = yesterday.toDateString();
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            const computedStats: DispenseStat[] = Object.keys(groupedLogs).map(dayStr => {
                const group = groupedLogs[dayStr];
                
                let dateLabel = '';
                if (dayStr === todayStr) dateLabel = `Today (${monthNames[now.getMonth()]} ${now.getDate()})`;
                else if (dayStr === yestStr) dateLabel = `Yesterday (${monthNames[yesterday.getMonth()]} ${yesterday.getDate()})`;
                else dateLabel = `${monthNames[group.dateObj.getMonth()]} ${group.dateObj.getDate()}, ${group.dateObj.getFullYear()}`;

                let totalGrams = 0;
                const history: DispenseTime[] = [];

                group.logs.forEach(l => {
                    const parsedAmount = parseInt(l.amount.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(parsedAmount) && l.status === 'success') {
                        totalGrams += parsedAmount;
                    }
                    history.push({
                        time: l.time,
                        amount: l.amount,
                        status: l.status
                    });
                });

                return {
                    id: `stats-${dayStr.replace(/\s+/g, '-')}`,
                    dateLabel,
                    totalAmount: `${totalGrams}g`,
                    totalTimes: history.length,
                    history
                };
            });

            computedStats.sort((a, b) => b.id.localeCompare(a.id));

            setStats(computedStats);
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [deviceId]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return { icon: 'check-circle' as const, color: colors.success };
            case 'error': return { icon: 'error' as const, color: colors.error };
            default: return { icon: 'schedule' as const, color: colors.textGrey };
        }
    };

    const renderStatsCard = (stat: DispenseStat) => {
        const isExpanded = !!expandedCards[stat.id];

        return (
            <View key={stat.id} style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: isExpanded ? 16 : 0
                    }}
                    onPress={() => toggleCard(stat.id)}
                >
                    <View>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>{stat.dateLabel}</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>View full breakdown</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[textStyles.h2, { color: colors.text, marginRight: 12 }]}>{stat.totalAmount} <Text style={{ fontSize: 14, color: colors.textGrey }}>Total</Text></Text>
                        <MaterialIcons name={isExpanded ? "expand-less" : "expand-more"} size={24} color={colors.textGrey} />
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.stroke, paddingTop: 8 }}>
                        {stat.history.map((record, index) => {
                            const statusInfo = getStatusIcon(record.status);
                            return (
                                <View key={index} style={[styles.statsRow, index === stat.history.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <MaterialIcons name={statusInfo.icon} size={18} color={statusInfo.color} style={{ marginRight: 8 }} />
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{record.time}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginRight: 12 }]}>{record.amount}</Text>
                                        <Text style={[textStyles.label, { color: statusInfo.color, fontSize: 12, width: 60, textAlign: 'right' }]}>
                                            {record.status === 'success' ? 'Success' : record.status === 'error' ? 'Failed' : 'Pending'}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>
            <View style={styles.header}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>All Dispense Records</Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            {/* Date Range Picker (Mock UI) */}
            <View style={styles.datePickerContainer}>
                <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 8 }]}>Date Range</Text>
                <TouchableOpacity style={[styles.datePickerButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]} activeOpacity={0.7}>
                    <MaterialIcons name="date-range" size={20} color={colors.textGrey} />
                    <Text style={[textStyles.body, { color: colors.text, marginLeft: 12, flex: 1 }]}>Oct 14, 2026 - Oct 16, 2026</Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Fetching dispense logs...</Text>
                    </View>
                ) : stats.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                        <MaterialIcons name="receipt-long" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Logs Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 8 }]}>This device hasn't dispensed any feed yet. Historical logs will appear here when available.</Text>
                    </View>
                ) : (
                    stats.map(renderStatsCard)
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

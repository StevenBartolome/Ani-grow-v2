import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { useAuth } from '@/context/AuthContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniWeighStyles } from '@/styles/aniweighStyles';

// Mock Types
interface WeighLogEntry {
    id: string;
    weight_g: number;
    status: 'underweight' | 'normal' | 'overweight';
    timestamp: number;
    animal: string;
}

interface SegregationStat {
    id: string;
    dateLabel: string;
    total: number;
    underweight: { count: number; percentage: number; color: string };
    normal: { count: number; percentage: number; color: string };
    overweight: { count: number; percentage: number; color: string };
}

export default function SegregationRecordsScreen() {
    const { profile } = useAuth();
    const farmId = profile?.farmId || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAniWeighStyles();
    const router = useRouter();

    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
    const [dateRangeLabel, setDateRangeLabel] = useState<string>('—');

    const formatShortDate = (d: Date) => {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    };

    const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const toggleCard = (id: string) => {
        setExpandedCards(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const { deviceId } = useLocalSearchParams();
    const [stats, setStats] = useState<SegregationStat[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch and aggregate logs (Mocked)
    useEffect(() => {
        if (!deviceId || !farmId) return;

        const timer = setTimeout(() => {
            const now = new Date();
            const mockLogs: WeighLogEntry[] = [
                { id: '1', weight_g: 1250, status: 'normal', timestamp: now.getTime(), animal: 'Chicken' },
                { id: '2', weight_g: 750, status: 'underweight', timestamp: now.getTime() - 1000, animal: 'Chicken' },
                { id: '3', weight_g: 1600, status: 'overweight', timestamp: now.getTime() - 2000, animal: 'Chicken' },
                { id: '4', weight_g: 1200, status: 'normal', timestamp: now.getTime() - 86400000, animal: 'Chicken' },
                { id: '5', weight_g: 700, status: 'underweight', timestamp: now.getTime() - 86400000 - 1000, animal: 'Chicken' },
            ];

            // Compute date range
            const timestamps = mockLogs.map(l => l.timestamp);
            const minTs = Math.min(...timestamps);
            const maxTs = Math.max(...timestamps);
            const startLabel = formatShortDate(new Date(minTs));
            const endLabel = formatShortDate(new Date(maxTs));
            setDateRangeLabel(startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`);

            // Group logs by date
            const groupedLogs = mockLogs.reduce((acc, log) => {
                const date = new Date(log.timestamp);
                const dayStr = date.toDateString();
                if (!acc[dayStr]) {
                    acc[dayStr] = { dateObj: date, logs: [] };
                }
                acc[dayStr].logs.push(log);
                return acc;
            }, {} as Record<string, { dateObj: Date, logs: WeighLogEntry[] }>);

            const todayStr = now.toDateString();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yestStr = yesterday.toDateString();
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            const computedStats: SegregationStat[] = Object.keys(groupedLogs).map(dayStr => {
                const group = groupedLogs[dayStr];
                let dateLabel = '';
                if (dayStr === todayStr) dateLabel = `Today (${monthNames[now.getMonth()]} ${now.getDate()})`;
                else if (dayStr === yestStr) dateLabel = `Yesterday (${monthNames[yesterday.getMonth()]} ${yesterday.getDate()})`;
                else dateLabel = `${monthNames[group.dateObj.getMonth()]} ${group.dateObj.getDate()}, ${group.dateObj.getFullYear()}`;

                let under = 0; let normal = 0; let over = 0;
                const total = group.logs.length;
                group.logs.forEach(l => {
                    if (l.status === 'underweight') under++;
                    else if (l.status === 'overweight') over++;
                    else normal++;
                });

                return {
                    id: `stats-${dayStr.replace(/\s+/g, '-')}`,
                    dateLabel,
                    total,
                    underweight: { count: under, percentage: Math.round((under/total)*100) || 0, color: colors.warning },
                    normal: { count: normal, percentage: Math.round((normal/total)*100) || 0, color: colors.primary },
                    overweight: { count: over, percentage: Math.round((over/total)*100) || 0, color: colors.error }
                };
            });

            computedStats.sort((a, b) => b.id.localeCompare(a.id));
            setStats(computedStats);
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [deviceId, farmId]);

    const renderStatsCard = (stat: SegregationStat) => {
        const isExpanded = !!expandedCards[stat.id];

        return (
            <View key={stat.id} style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.statsHeader}
                    onPress={() => toggleCard(stat.id)}
                >
                    <View>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>{stat.dateLabel}</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>View full breakdown</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[textStyles.h2, { color: colors.text, marginRight: 12 }]}>{stat.total} <Text style={{ fontSize: 14, color: colors.textGrey }}>Total</Text></Text>
                        <MaterialIcons name={isExpanded ? "expand-less" : "expand-more"} size={24} color={colors.textGrey} />
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View style={[styles.statsExpandedContent, { borderTopColor: colors.stroke }]}>
                        {/* Visual Bar */}
                        <View style={styles.statsVisualBar}>
                            <View style={[styles.statsVisualSegment, { flex: stat.underweight.percentage || 1, backgroundColor: stat.underweight.color, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
                            <View style={[styles.statsVisualSegment, { flex: stat.normal.percentage || 1, backgroundColor: stat.normal.color }]} />
                            <View style={[styles.statsVisualSegment, { flex: stat.overweight.percentage || 1, backgroundColor: stat.overweight.color, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
                        </View>

                        {/* Legend / Details */}
                        <View style={styles.statDetailRow}>
                            <View style={styles.statLegend}>
                                <View style={[styles.legendDot, { backgroundColor: stat.underweight.color }]} />
                                <View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Underweight</Text>
                                    <Text style={[textStyles.label, { color: colors.text }]}>{stat.underweight.count} ({stat.underweight.percentage}%)</Text>
                                </View>
                            </View>
                            <View style={styles.statLegend}>
                                <View style={[styles.legendDot, { backgroundColor: stat.normal.color }]} />
                                <View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Normal</Text>
                                    <Text style={[textStyles.label, { color: colors.text }]}>{stat.normal.count} ({stat.normal.percentage}%)</Text>
                                </View>
                            </View>
                            <View style={styles.statLegend}>
                                <View style={[styles.legendDot, { backgroundColor: stat.overweight.color }]} />
                                <View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Overweight</Text>
                                    <Text style={[textStyles.label, { color: colors.text }]}>{stat.overweight.count} ({stat.overweight.percentage}%)</Text>
                                </View>
                            </View>
                        </View>
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
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>All Segregation Records</Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            {/* Date Range (derived from actual records shown) */}
            <View style={styles.datePickerContainer}>
                <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 8 }]}>Date Range</Text>
                <TouchableOpacity style={[styles.datePickerButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]} activeOpacity={0.7}>
                    <MaterialIcons name="date-range" size={20} color={colors.textGrey} />
                    <Text style={[textStyles.body, { color: colors.text, marginLeft: 12, flex: 1 }]}>{dateRangeLabel}</Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Crunching segregation data...</Text>
                    </View>
                ) : stats.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                        <MaterialIcons name="monitor-weight" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Records Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 8 }]}>This device hasn't recorded any weigh events yet. When livestock step on the scale, their historical breakdown will appear here.</Text>
                    </View>
                ) : (
                    stats.map(renderStatsCard)
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

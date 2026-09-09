import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniWeighStyles } from '@/styles/aniweighStyles';
import { supabase } from '@/lib/supabase';

interface SegregationStat {
    id: string;
    dateLabel: string;
    total: number;
    underweight: { count: number; percentage: number; color: string };
    normal:      { count: number; percentage: number; color: string };
    overweight:  { count: number; percentage: number; color: string };
}

function formatDateLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (dateKey === todayKey) {
        const d = new Date();
        return `Today (${monthNames[d.getMonth()]} ${d.getDate()})`;
    }
    if (dateKey === yesterdayKey) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return `Yesterday (${monthNames[y.getMonth()]} ${y.getDate()})`;
    }
    const d = new Date(dateKey + 'T00:00:00');
    return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function SegregationRecordsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAniWeighStyles();
    const { deviceId } = useLocalSearchParams();

    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
    const [stats, setStats] = useState<SegregationStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [dateRangeLabel, setDateRangeLabel] = useState('—');

    const toggleCard = (id: string) => {
        setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const fetchRecords = useCallback(async () => {
        if (!deviceId) { setLoading(false); return; }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('weigh_sessions')
                .select('id, status, recorded_at')
                .eq('device_id', deviceId as string)
                .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
                .order('recorded_at', { ascending: false })
                .limit(500);
            if (error) throw error;

            if (!data || data.length === 0) {
                setStats([]);
                setDateRangeLabel('—');
                return;
            }

            const now = new Date();
            const todayKey = now.toLocaleDateString('en-CA');
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            const yesterdayKey = yest.toLocaleDateString('en-CA');

            const grouped: Record<string, { under: number; normal: number; over: number; total: number }> = {};
            for (const row of data) {
                const key = new Date(row.recorded_at).toLocaleDateString('en-CA');
                if (!grouped[key]) grouped[key] = { under: 0, normal: 0, over: 0, total: 0 };
                grouped[key].total++;
                if (row.status === 'underweight') grouped[key].under++;
                else if (row.status === 'overweight') grouped[key].over++;
                else grouped[key].normal++;
            }

            const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const formatShort = (dateKey: string) => {
                const d = new Date(dateKey + 'T00:00:00');
                return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
            };

            if (sortedKeys.length > 0) {
                const oldest = sortedKeys[sortedKeys.length - 1];
                const newest = sortedKeys[0];
                setDateRangeLabel(oldest === newest ? formatShort(oldest) : `${formatShort(oldest)} - ${formatShort(newest)}`);
            }

            const computedStats: SegregationStat[] = sortedKeys.map(dateKey => {
                const g = grouped[dateKey];
                const pct = (n: number) => g.total > 0 ? Math.round((n / g.total) * 100) : 0;
                return {
                    id: `stats-${dateKey}`,
                    dateLabel: formatDateLabel(dateKey, todayKey, yesterdayKey),
                    total: g.total,
                    underweight: { count: g.under,  percentage: pct(g.under),  color: colors.warning },
                    normal:      { count: g.normal, percentage: pct(g.normal), color: colors.primary },
                    overweight:  { count: g.over,   percentage: pct(g.over),   color: colors.error },
                };
            });

            setStats(computedStats);
        } catch (err) {
            console.error('[SegregationRecordsScreen] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [deviceId]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchRecords();
        setRefreshing(false);
    }, [fetchRecords]);

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
                        <Text style={[textStyles.h2, { color: colors.text, marginRight: 12 }]}>
                            {stat.total} <Text style={{ fontSize: 14, color: colors.textGrey }}>Total</Text>
                        </Text>
                        <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={24} color={colors.textGrey} />
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View style={[styles.statsExpandedContent, { borderTopColor: colors.stroke }]}>
                        <View style={styles.statsVisualBar}>
                            <View style={[styles.statsVisualSegment, { flex: stat.underweight.percentage || 1, backgroundColor: stat.underweight.color, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
                            <View style={[styles.statsVisualSegment, { flex: stat.normal.percentage || 1,      backgroundColor: stat.normal.color }]} />
                            <View style={[styles.statsVisualSegment, { flex: stat.overweight.percentage || 1,  backgroundColor: stat.overweight.color, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
                        </View>

                        <View style={styles.statDetailRow}>
                            {[
                                { label: 'Underweight', ...stat.underweight },
                                { label: 'Normal',      ...stat.normal },
                                { label: 'Overweight',  ...stat.overweight },
                            ].map(s => (
                                <View key={s.label} style={styles.statLegend}>
                                    <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                                    <View>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{s.label}</Text>
                                        <Text style={[textStyles.label, { color: colors.text }]}>{s.count} ({s.percentage}%)</Text>
                                    </View>
                                </View>
                            ))}
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
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>All Segregation Records</Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            <View style={styles.datePickerContainer}>
                <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 8 }]}>Date Range</Text>
                <View style={[styles.datePickerButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                    <MaterialIcons name="date-range" size={20} color={colors.textGrey} />
                    <Text style={[textStyles.body, { color: colors.text, marginLeft: 12, flex: 1 }]}>{dateRangeLabel}</Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
            >
                {loading && !refreshing ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Crunching segregation data...</Text>
                    </View>
                ) : stats.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                        <AniWeighIcon size={48} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Records Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 8 }]}>
                            This device hasn't recorded any weigh events yet. When livestock step on the scale, their historical breakdown will appear here.
                        </Text>
                    </View>
                ) : (
                    stats.map(renderStatsCard)
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

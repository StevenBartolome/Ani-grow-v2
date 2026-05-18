import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniFeedStyles } from '@/styles/anifeedStyles';
import { supabase } from '@/lib/supabase';

interface DispenseRecord {
    id: string;
    grams_dispensed: number;
    status: 'success' | 'error' | 'pending';
    dispensed_at: string;
    deviceId: string;
    deviceName: string;
    housingId: string | null;
    housingName: string;
}

interface HousingOption { id: string; name: string }

type StatusFilter = 'all' | 'success' | 'error' | 'pending';

function formatTime(ts: string): string {
    const date = new Date(ts);
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
}

function formatDateLabel(dateStr: string, todayStr: string, yestStr: string): string {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (dateStr === todayStr) {
        const d = new Date();
        return `Today (${monthNames[d.getMonth()]} ${d.getDate()})`;
    }
    if (dateStr === yestStr) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        return `Yesterday (${monthNames[y.getMonth()]} ${y.getDate()})`;
    }
    const d = new Date(dateStr + 'T00:00:00');
    return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function DispenseRecordsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAniFeedStyles();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();

    const [records, setRecords] = useState<DispenseRecord[]>([]);
    const [housingOptions, setHousingOptions] = useState<HousingOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
    const [filterHousingId, setFilterHousingId] = useState<string>('all');
    const [showFilters, setShowFilters] = useState(true);

    const fetchRecords = useCallback(async () => {
        if (!farmId) { setLoading(false); return; }
        setLoading(true);
        try {
            // Fetch all devices in this farm with housing info
            const { data: devicesData } = await supabase
                .from('devices')
                .select('id, name, housing_id, housings(id, name)')
                .eq('farm_id', farmId);

            if (!devicesData || devicesData.length === 0) { setLoading(false); return; }

            const deviceMap: Record<string, { name: string; housingId: string | null; housingName: string }> = {};
            const housingMap: Record<string, string> = {};
            (devicesData as any[]).forEach(d => {
                const hId = d.housing_id ?? null;
                const hName = (d.housings as any)?.name ?? 'Unassigned';
                deviceMap[d.id] = { name: d.name, housingId: hId, housingName: hName };
                if (hId && !housingMap[hId]) housingMap[hId] = hName;
            });

            setHousingOptions(Object.entries(housingMap).map(([id, name]) => ({ id, name })));

            // Scope to specific device if provided, else all farm devices
            const targetIds = deviceId ? [deviceId as string] : Object.keys(deviceMap);

            const { data, error } = await supabase
                .from('dispense_records')
                .select('id, grams_dispensed, status, dispensed_at, device_id')
                .in('device_id', targetIds)
                .order('dispensed_at', { ascending: false })
                .limit(300);

            if (error) throw error;

            const mapped: DispenseRecord[] = (data ?? []).map((r: any) => {
                const dev = deviceMap[r.device_id];
                return {
                    id: r.id,
                    grams_dispensed: r.grams_dispensed,
                    status: r.status,
                    dispensed_at: r.dispensed_at,
                    deviceId: r.device_id,
                    deviceName: dev?.name ?? 'Unknown Device',
                    housingId: dev?.housingId ?? null,
                    housingName: dev?.housingName ?? 'Unassigned',
                };
            });
            setRecords(mapped);
        } catch (err) {
            console.error('[DispenseRecordsScreen] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [farmId, deviceId]);

    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchRecords(); setRefreshing(false); }, [fetchRecords]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    // Apply filters
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            const byStatus  = filterStatus === 'all' || r.status === filterStatus;
            const byHousing = filterHousingId === 'all' || r.housingId === filterHousingId;
            return byStatus && byHousing;
        });
    }, [records, filterStatus, filterHousingId]);

    const isFiltered = filterStatus !== 'all' || filterHousingId !== 'all';

    // Group filtered records by date
    const groupedByDate = useMemo(() => {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA');
        const yest = new Date(now); yest.setDate(yest.getDate() - 1);
        const yestStr = yest.toLocaleDateString('en-CA');

        const groups: Record<string, DispenseRecord[]> = {};
        filteredRecords.forEach(r => {
            const key = new Date(r.dispensed_at).toLocaleDateString('en-CA');
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });

        return Object.keys(groups)
            .sort((a, b) => b.localeCompare(a))
            .map(dateKey => ({
                dateKey,
                dateLabel: formatDateLabel(dateKey, todayStr, yestStr),
                records: groups[dateKey],
                totalGrams: groups[dateKey].filter(r => r.status === 'success').reduce((s, r) => s + r.grams_dispensed, 0),
                totalCount: groups[dateKey].length,
            }));
    }, [filteredRecords]);

    const getStatusColor = (status: string) =>
        status === 'success' ? colors.primary : status === 'error' ? colors.error : colors.warning;
    const getStatusIcon = (status: string): any =>
        status === 'success' ? 'check-circle' : status === 'error' ? 'error' : 'schedule';
    const getStatusLabel = (status: string) =>
        status === 'success' ? 'Success' : status === 'error' ? 'Failed' : 'Pending';

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>All Dispense Records</Text>
                    {isFiltered && (
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 11 }]}>Filtered • {filteredRecords.length} records</Text>
                    )}
                </View>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setShowFilters(!showFilters)}
                >
                    <MaterialIcons
                        name={showFilters ? 'filter-list-off' : 'filter-list'}
                        size={24}
                        color={isFiltered ? colors.primary : showFilters ? colors.primary : colors.textGrey}
                    />
                </TouchableOpacity>
            </View>

            {/* Filter panel */}
            {showFilters && (
                <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
                    {/* Status filter */}
                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Status</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: housingOptions.length > 1 ? 12 : 0 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {(['all', 'success', 'error', 'pending'] as StatusFilter[]).map(s => {
                                const isActive = filterStatus === s;
                                const chipColor = s === 'success' ? colors.primary : s === 'error' ? colors.error : s === 'pending' ? colors.warning : colors.textGrey;
                                return (
                                    <TouchableOpacity
                                        key={s}
                                        onPress={() => setFilterStatus(s)}
                                        activeOpacity={0.7}
                                        style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: isActive ? chipColor + '20' : colors.cardFill, borderWidth: 1, borderColor: isActive ? chipColor : 'transparent' }}
                                    >
                                        <Text style={[textStyles.label, { color: isActive ? chipColor : colors.textGrey, fontSize: 12 }]}>
                                            {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>

                    {/* Housing filter */}
                    {housingOptions.length > 1 && (
                        <>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Housing</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity
                                        onPress={() => setFilterHousingId('all')}
                                        activeOpacity={0.7}
                                        style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: filterHousingId === 'all' ? colors.info + '20' : colors.cardFill, borderWidth: 1, borderColor: filterHousingId === 'all' ? colors.info : 'transparent' }}
                                    >
                                        <Text style={[textStyles.label, { color: filterHousingId === 'all' ? colors.info : colors.textGrey, fontSize: 12 }]}>All Housings</Text>
                                    </TouchableOpacity>
                                    {housingOptions.map(h => (
                                        <TouchableOpacity
                                            key={h.id}
                                            onPress={() => setFilterHousingId(h.id)}
                                            activeOpacity={0.7}
                                            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: filterHousingId === h.id ? colors.info + '20' : colors.cardFill, borderWidth: 1, borderColor: filterHousingId === h.id ? colors.info : 'transparent' }}
                                        >
                                            <Text style={[textStyles.label, { color: filterHousingId === h.id ? colors.info : colors.textGrey, fontSize: 12 }]}>{h.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>
                        </>
                    )}
                </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Fetching dispense logs...</Text>
                    </View>
                ) : records.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                        <MaterialIcons name="receipt-long" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Logs Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 8 }]}>
                            This device hasn't dispensed any feed yet.
                        </Text>
                    </View>
                ) : groupedByDate.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <MaterialIcons name="search-off" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Matches</Text>
                        <TouchableOpacity
                            onPress={() => { setFilterStatus('all'); setFilterHousingId('all'); }}
                            style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary + '20', borderRadius: 20 }}
                            activeOpacity={0.7}
                        >
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 13 }]}>Clear Filters</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    groupedByDate.map(group => {
                        const isExpanded = !!expandedDates[group.dateKey];
                        return (
                            <View key={group.dateKey} style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke, marginBottom: 12 }]}>
                                {/* Date header row */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isExpanded ? 12 : 0 }}
                                    onPress={() => setExpandedDates(prev => ({ ...prev, [group.dateKey]: !prev[group.dateKey] }))}
                                >
                                    <View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>{group.dateLabel}</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                            {group.totalCount} event{group.totalCount !== 1 ? 's' : ''} · tap to expand
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                                                {group.totalGrams >= 1000 ? `${(group.totalGrams / 1000).toFixed(1)}kg` : `${group.totalGrams}g`}
                                            </Text>
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>success total</Text>
                                        </View>
                                        <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={24} color={colors.textGrey} />
                                    </View>
                                </TouchableOpacity>

                                {/* Expanded records */}
                                {isExpanded && (
                                    <View style={{ borderTopWidth: 1, borderTopColor: colors.stroke, paddingTop: 8 }}>
                                        {group.records.map((record, idx) => {
                                            const sc = getStatusColor(record.status);
                                            const si = getStatusIcon(record.status);
                                            const sl = getStatusLabel(record.status);
                                            return (
                                                <View
                                                    key={record.id}
                                                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgLight, borderRadius: 12, padding: 10, marginBottom: idx < group.records.length - 1 ? 8 : 0, overflow: 'hidden' }}
                                                >
                                                    {/* Mini accent */}
                                                    <View style={{ width: 3, height: '100%', backgroundColor: sc, borderRadius: 2, marginRight: 10, alignSelf: 'stretch' }} />
                                                    {/* Icon */}
                                                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: sc + '18', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                                        <MaterialIcons name={si} size={17} color={sc} />
                                                    </View>
                                                    {/* Info */}
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>{formatTime(record.dispensed_at)}</Text>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                                <MaterialIcons name="home" size={10} color={colors.textGrey} />
                                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10, marginLeft: 2 }]}>{record.housingName}</Text>
                                                            </View>
                                                        </View>
                                                        <Text style={[textStyles.label, { color: sc, fontSize: 11, marginTop: 2 }]}>{sl}</Text>
                                                    </View>
                                                    {/* Amount */}
                                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>{record.grams_dispensed}g</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

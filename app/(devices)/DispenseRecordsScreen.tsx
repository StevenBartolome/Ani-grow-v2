import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AniFeedIcon } from '@/components/AniFeedIcon';
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
                .select('id, grams_dispensed, status, dispensed_at, device_id, housing_id, housings(id, name)')
                .in('device_id', targetIds)
                .order('dispensed_at', { ascending: false })
                .limit(300);

            if (error) throw error;

            const mapped: DispenseRecord[] = (data ?? []).map((r: any) => {
                const dev = deviceMap[r.device_id];
                // Prefer the housing stored on this specific dispense record.
                // Fall back to device's current housing only if the record has no housing_id.
                const recordHousingId: string | null = (r.housings as any)?.id ?? r.housing_id ?? null;
                const recordHousingName: string = (r.housings as any)?.name ?? dev?.housingName ?? 'Unassigned';

                // Also register this housing in the filter options
                if (recordHousingId && !housingMap[recordHousingId]) {
                    housingMap[recordHousingId] = recordHousingName;
                }

                return {
                    id: r.id,
                    grams_dispensed: r.grams_dispensed,
                    status: r.status,
                    dispensed_at: r.dispensed_at,
                    deviceId: r.device_id,
                    deviceName: dev?.name ?? 'Unknown Device',
                    housingId: recordHousingId,
                    housingName: recordHousingName,
                };
            });

            // Rebuild housing options from actual record data (not just device current state)
            setHousingOptions(Object.entries(housingMap).map(([id, name]) => ({ id, name })));
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

    const activeFilterCount = (filterStatus !== 'all' ? 1 : 0) + (filterHousingId !== 'all' ? 1 : 0);

    const activeFilterSummary = useMemo(() => {
        const parts: string[] = [];
        if (filterStatus !== 'all') {
            parts.push(getStatusLabel(filterStatus));
        }
        if (filterHousingId !== 'all') {
            const h = housingOptions.find(opt => opt.id === filterHousingId);
            if (h) parts.push(h.name);
        }
        if (parts.length === 0) return 'All Records';
        return parts.join(' · ');
    }, [filterStatus, filterHousingId, housingOptions]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>

            {/* ── Header ───────────────────────────────────────────────── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
                <View style={{ width: 40 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>Dispense Records</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                        {isFiltered ? `${filteredRecords.length} of ${records.length} records` : `${records.length} records`}
                    </Text>
                </View>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: showFilters ? colors.secondary + '15' : 'transparent' }}
                    onPress={() => setShowFilters(v => !v)}
                >
                    <MaterialIcons name="tune" size={22} color={activeFilterCount > 0 || showFilters ? colors.secondary : colors.textGrey} />
                    {activeFilterCount > 0 && (
                        <View style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary, borderWidth: 1.5, borderColor: colors.surface }} />
                    )}
                </TouchableOpacity>
            </View>

            {/* ── Filter Panel (Collapsible, Wrapping, Pill Round Shaped) ── */}
            {showFilters && (
                <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12 }}>

                    {/* Summary bar + Reset button */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: activeFilterCount > 0 ? colors.secondary + '18' : colors.cardFill,
                            paddingHorizontal: 10,
                            paddingVertical: 3,
                            borderRadius: 999,
                        }}>
                            <Text style={{ fontFamily: activeFilterCount > 0 ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11, color: activeFilterCount > 0 ? colors.secondary : colors.textGrey }}>
                                {activeFilterSummary}
                            </Text>
                        </View>

                        {activeFilterCount > 0 && (
                            <TouchableOpacity
                                onPress={() => { setFilterStatus('all'); setFilterHousingId('all'); }}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    paddingHorizontal: 10,
                                    paddingVertical: 3,
                                    borderRadius: 999,
                                    backgroundColor: colors.secondary + '12',
                                }}
                            >
                                <MaterialIcons name="close" size={12} color={colors.secondary} />
                                <Text style={{ fontFamily: 'Poppins-Medium', color: colors.secondary, fontSize: 11 }}>Reset</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Status row (wrapped pills) */}
                    <View>
                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                            Dispense Status
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {(['all', 'success', 'error', 'pending'] as StatusFilter[]).map(s => {
                                const active = filterStatus === s;
                                const c = s === 'success' ? colors.primary : s === 'error' ? colors.error : s === 'pending' ? colors.warning : colors.secondary;
                                const icon: any = s === 'success' ? 'check-circle' : s === 'error' ? 'error' : s === 'pending' ? 'schedule' : 'grain';
                                return (
                                    <TouchableOpacity
                                        key={s}
                                        onPress={() => setFilterStatus(s)}
                                        activeOpacity={0.75}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 5,
                                            paddingHorizontal: 14,
                                            paddingVertical: 6,
                                            borderRadius: 999,
                                            backgroundColor: active ? (s === 'all' ? colors.secondary + '18' : c + '18') : colors.surface,
                                            borderWidth: 1.5,
                                            borderColor: active ? (s === 'all' ? colors.secondary : c) : colors.stroke,
                                        }}
                                    >
                                        <MaterialIcons name={icon} size={13} color={active ? (s === 'all' ? colors.secondary : c) : colors.textGrey} />
                                        <Text style={{
                                            fontFamily: active ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                            fontSize: 11.5,
                                            color: active ? (s === 'all' ? colors.secondary : c) : colors.textGrey,
                                        }}>
                                            {s === 'all' ? 'All Statuses' : s === 'error' ? 'Failed' : s.charAt(0).toUpperCase() + s.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Housing row (wrapped pills) */}
                    {housingOptions.length > 0 && (
                        <View>
                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                Housing
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {[{ id: 'all', name: 'All Housings' }, ...housingOptions].map(h => {
                                    const active = filterHousingId === h.id;
                                    return (
                                        <TouchableOpacity
                                            key={h.id}
                                            onPress={() => setFilterHousingId(h.id)}
                                            activeOpacity={0.75}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 5,
                                                paddingHorizontal: 14,
                                                paddingVertical: 6,
                                                borderRadius: 999,
                                                backgroundColor: active ? colors.info + '18' : colors.surface,
                                                borderWidth: 1.5,
                                                borderColor: active ? colors.info : colors.stroke,
                                            }}
                                        >
                                            <MaterialIcons name="home" size={13} color={active ? colors.info : colors.textGrey} />
                                            <Text style={{
                                                fontFamily: active ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                fontSize: 11.5,
                                                color: active ? colors.info : colors.textGrey,
                                            }}>
                                                {h.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* ── Content ──────────────────────────────────────────────── */}
            <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} colors={[colors.secondary]} />}>

                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <ActivityIndicator size="large" color={colors.secondary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Fetching dispense records…</Text>
                    </View>

                ) : records.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <AniFeedIcon size={30} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 17, marginBottom: 5 }]}>No Records Yet</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingHorizontal: 40, fontSize: 13 }]}>
                            Feed dispense events from your AniFeed devices will appear here.
                        </Text>
                    </View>

                ) : groupedByDate.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <MaterialIcons name="search-off" size={30} color={colors.textGrey} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 17, marginBottom: 5 }]}>No Matches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingHorizontal: 40, marginBottom: 16, fontSize: 13 }]}>Try adjusting your filters.</Text>
                        <TouchableOpacity onPress={() => { setFilterStatus('all'); setFilterHousingId('all'); }} activeOpacity={0.7}
                            style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: colors.secondary, borderRadius: 999 }}>
                            <Text style={[textStyles.label, { color: '#fff', fontSize: 12.5 }]}>Clear Filters</Text>
                        </TouchableOpacity>
                    </View>

                ) : (
                    groupedByDate.map(group => {
                        const isExpanded = !!expandedDates[group.dateKey];
                        const gramLabel = group.totalGrams >= 1000
                            ? `${(group.totalGrams / 1000).toFixed(1)}kg`
                            : `${group.totalGrams}g`;

                        return (
                            <View key={group.dateKey} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.stroke, overflow: 'hidden' }}>

                                {/* ── Date group header ── */}
                                <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={() => setExpandedDates(prev => ({ ...prev, [group.dateKey]: !prev[group.dateKey] }))}
                                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11, gap: 11 }}
                                >
                                    {/* Feed icon */}
                                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary + '15', alignItems: 'center', justifyContent: 'center' }}>
                                        <AniFeedIcon size={19} />
                                    </View>

                                    {/* Date + count */}
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13.5, color: colors.text }} numberOfLines={1}>
                                            {group.dateLabel}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', color: colors.textGrey, fontSize: 11, marginTop: 1 }}>
                                            {group.totalCount} event{group.totalCount !== 1 ? 's' : ''}
                                        </Text>
                                    </View>

                                    {/* Total grams + chevron */}
                                    <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                                        <Text style={{ fontFamily: 'Poppins-Bold', color: colors.secondary, fontSize: 16 }}>
                                            {gramLabel}
                                        </Text>
                                        <Text style={{ fontFamily: 'Poppins-Regular', color: colors.textGrey, fontSize: 10 }}>
                                            dispensed
                                        </Text>
                                    </View>
                                    <MaterialIcons name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={colors.textGrey} />
                                </TouchableOpacity>

                                {/* ── Expanded records ── */}
                                {isExpanded && (
                                    <View style={{ borderTopWidth: 1, borderTopColor: colors.stroke }}>
                                        {group.records.map((record, idx) => {
                                            const sc = getStatusColor(record.status);
                                            const si = getStatusIcon(record.status);
                                            const sl = getStatusLabel(record.status);
                                            const isLast = idx === group.records.length - 1;

                                            return (
                                                <View
                                                    key={record.id}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        paddingHorizontal: 13,
                                                        paddingVertical: 9,
                                                        borderBottomWidth: isLast ? 0 : 1,
                                                        borderBottomColor: colors.stroke + '40',
                                                        gap: 10,
                                                    }}
                                                >
                                                    {/* Time badge */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, width: 74 }}>
                                                        <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                        <Text style={{ fontFamily: 'Poppins-Medium', color: colors.textGrey, fontSize: 11 }}>
                                                            {formatTime(record.dispensed_at)}
                                                        </Text>
                                                    </View>

                                                    {/* Housing + device info */}
                                                    <View style={{ flex: 1, minWidth: 0 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <MaterialIcons name="home" size={12} color={colors.textGrey} />
                                                            <Text style={{ fontFamily: 'Poppins-Medium', color: colors.text, fontSize: 12.5, flexShrink: 1 }} numberOfLines={1}>
                                                                {record.housingName}
                                                            </Text>
                                                        </View>
                                                        <Text style={{ fontFamily: 'Poppins-Regular', color: colors.textGrey, fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>
                                                            {record.deviceName}
                                                        </Text>
                                                    </View>

                                                    {/* Amount + status pill */}
                                                    <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
                                                        <Text style={{ fontFamily: 'Poppins-Bold', color: colors.text, fontSize: 13.5 }}>
                                                            {record.grams_dispensed}g
                                                        </Text>
                                                        <View style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 3,
                                                            paddingHorizontal: 7,
                                                            paddingVertical: 1.5,
                                                            borderRadius: 999,
                                                            backgroundColor: sc + '18',
                                                        }}>
                                                            <MaterialIcons name={si} size={10.5} color={sc} />
                                                            <Text style={{
                                                                fontFamily: 'Poppins-SemiBold',
                                                                color: sc,
                                                                fontSize: 9.5,
                                                            }}>
                                                                {sl}
                                                            </Text>
                                                        </View>
                                                    </View>
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

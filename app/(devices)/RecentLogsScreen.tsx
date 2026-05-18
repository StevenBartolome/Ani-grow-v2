import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AnimalIcon } from '@/components/AnimalIcon';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { supabase } from '@/lib/supabase';

interface WeighLogEntry {
    id: string;
    weight_g: number;
    status: 'underweight' | 'normal' | 'overweight';
    timestamp: number;
    animal: string;
    housingId: string | null;
    housingName: string;
    deviceId: string;
    deviceName: string;
}

interface HousingOption {
    id: string;
    name: string;
}

function formatLogTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes} ${ampm}`;

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${timeStr}`;
}

export default function RecentLogsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useDevicesStyles();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { deviceId } = useLocalSearchParams<{ deviceId?: string; animalType?: string }>();

    type StatusFilter = 'all' | 'underweight' | 'normal' | 'overweight';
    type AnimalFilter = 'all' | 'Pig' | 'Chicken';

    const [logs, setLogs] = useState<WeighLogEntry[]>([]);
    const [housingOptions, setHousingOptions] = useState<HousingOption[]>([]);
    const [loading, setLoading] = useState(true);
    // Ref so the realtime callback always has the latest device→housing map without stale closures
    const deviceMapRef = useRef<Record<string, { name: string; housingId: string | null; housingName: string }>>({});
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
    const [filterAnimal, setFilterAnimal] = useState<AnimalFilter>('all');
    const [filterHousingId, setFilterHousingId] = useState<string>('all');
    const [showFilters, setShowFilters] = useState(true);
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const fetchLogs = useCallback(async () => {
        if (!farmId) { setLoading(false); return; }
        setLoading(true);
        try {
            // Fetch all devices in this farm with housing info
            const { data: devicesData } = await supabase
                .from('devices')
                .select('id, name, housing_id, housings(id, name)')
                .eq('farm_id', farmId);

            if (!devicesData || devicesData.length === 0) {
                setLoading(false);
                return;
            }

            // Build device map for housing lookup
            const deviceMap: Record<string, { name: string; housingId: string | null; housingName: string }> = {};
            const housingMap: Record<string, string> = {}; // housingId → housingName
            (devicesData as any[]).forEach(d => {
                const hId = d.housing_id ?? null;
                const hName = (d.housings as any)?.name ?? 'Unassigned';
                deviceMap[d.id] = { name: d.name, housingId: hId, housingName: hName };
                if (hId && !housingMap[hId]) housingMap[hId] = hName;
            });

            // Keep ref in sync so realtime callback always has the latest map
            deviceMapRef.current = deviceMap;

            // Build housing filter options
            setHousingOptions(Object.entries(housingMap).map(([id, name]) => ({ id, name })));

            // Determine which device IDs to query
            const allFarmDeviceIds = Object.keys(deviceMap);
            // If we came from a specific device screen, scope to that device but still show its housing
            const targetDeviceIds = deviceId ? [deviceId as string] : allFarmDeviceIds;

            const { data, error } = await supabase
                .from('weigh_sessions')
                .select('id, net_weight_grams, status, animal_type, recorded_at, device_id')
                .in('device_id', targetDeviceIds)
                .order('recorded_at', { ascending: false })
                .limit(200);

            if (error) throw error;

            const mapped: WeighLogEntry[] = (data ?? []).map((s: any) => {
                const dev = deviceMap[s.device_id];
                return {
                    id: s.id,
                    weight_g: s.net_weight_grams,
                    status: s.status,
                    timestamp: new Date(s.recorded_at).getTime(),
                    animal: s.animal_type === 'pig' ? 'Pig' : 'Chicken',
                    housingId: dev?.housingId ?? null,
                    housingName: dev?.housingName ?? 'Unassigned',
                    deviceId: s.device_id,
                    deviceName: dev?.name ?? 'Unknown Device',
                };
            });
            setLogs(mapped);
        } catch (err) {
            console.error('[RecentLogsScreen] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [farmId, deviceId]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchLogs(); setRefreshing(false); }, [fetchLogs]);

    // ─── Realtime — prepend new weigh_sessions rows without re-fetching ──
    useEffect(() => {
        if (!farmId) return;

        const channel = supabase
            .channel(`recent-logs-live-${farmId}${deviceId ?? ''}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'weigh_sessions' },
                (payload) => {
                    const row = payload.new as any;
                    const map = deviceMapRef.current;

                    // If scoped to a specific device, ignore events from other devices
                    if (deviceId && row.device_id !== deviceId) return;

                    // If the device isn't in our farm's map, ignore it
                    const dev = map[row.device_id];
                    if (!dev) return;

                    const newEntry: WeighLogEntry = {
                        id: row.id,
                        weight_g: row.net_weight_grams,
                        status: row.status ?? 'normal',
                        timestamp: row.recorded_at
                            ? new Date(row.recorded_at).getTime()
                            : Date.now(),
                        animal: row.animal_type === 'pig' ? 'Pig' : 'Chicken',
                        housingId: dev.housingId,
                        housingName: dev.housingName,
                        deviceId: row.device_id,
                        deviceName: dev.name,
                    };

                    // Prepend directly — no re-fetch, no flicker
                    setLogs(prev => [newEntry, ...prev]);
                    // Jump to page 1 so the new entry is immediately visible
                    setPage(1);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [farmId, deviceId]);

    useEffect(() => { setPage(1); }, [filterStatus, filterAnimal, filterHousingId]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const byStatus  = filterStatus === 'all' || log.status === filterStatus;
            const byAnimal  = filterAnimal === 'all' || log.animal === filterAnimal;
            const byHousing = filterHousingId === 'all' || log.housingId === filterHousingId;
            return byStatus && byAnimal && byHousing;
        });
    }, [logs, filterStatus, filterAnimal, filterHousingId]);

    const isFiltered = filterStatus !== 'all' || filterAnimal !== 'all' || filterHousingId !== 'all';

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
    const safePage   = Math.min(page, totalPages);
    const pagedLogs  = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return filteredLogs.slice(start, start + pageSize);
    }, [filteredLogs, safePage]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>All Recent Logs</Text>
                    {isFiltered && (
                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 11 }]}>Filtered • {filteredLogs.length} results</Text>
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
                    {/* Status */}
                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Status</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {(['all', 'underweight', 'normal', 'overweight'] as StatusFilter[]).map(s => {
                                const isActive = filterStatus === s;
                                const chipColor = s === 'underweight' ? colors.warning : s === 'overweight' ? colors.error : s === 'normal' ? colors.primary : colors.textGrey;
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

                    {/* Animal type */}
                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Animal</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: housingOptions.length > 0 ? 12 : 0 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {(['all', 'Pig', 'Chicken'] as AnimalFilter[]).map(a => {
                                const isActive = filterAnimal === a;
                                const chipColor = a === 'Pig' ? colors.pig : a === 'Chicken' ? colors.chicken : colors.textGrey;
                                return (
                                    <TouchableOpacity
                                        key={a}
                                        onPress={() => setFilterAnimal(a)}
                                        activeOpacity={0.7}
                                        style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: isActive ? chipColor + '20' : colors.cardFill, borderWidth: 1, borderColor: isActive ? chipColor : 'transparent' }}
                                    >
                                        <Text style={[textStyles.label, { color: isActive ? chipColor : colors.textGrey, fontSize: 12 }]}>
                                            {a === 'all' ? 'All Animals' : a}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>

                    {/* Housing — only shown when there are multiple housings */}
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
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading logs...</Text>
                    </View>
                ) : logs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <MaterialIcons name="history" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Logs Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center' }]}>
                            When your device records weights, they will appear here.
                        </Text>
                    </View>
                ) : filteredLogs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <MaterialIcons name="search-off" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Matches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center' }]}>
                            No entries match your active filters.
                        </Text>
                        <TouchableOpacity
                            onPress={() => { setFilterStatus('all'); setFilterAnimal('all'); setFilterHousingId('all'); }}
                            style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary + '20', borderRadius: 20 }}
                            activeOpacity={0.7}
                        >
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 13 }]}>Clear Filters</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {pagedLogs.map((log, index) => {
                            const statusColor = log.status === 'underweight' ? colors.warning : log.status === 'overweight' ? colors.error : colors.primary;
                            const statusIcon: any = log.status === 'underweight' ? 'arrow-downward' : log.status === 'overweight' ? 'arrow-upward' : 'check';
                            const kg = (log.weight_g / 1000).toFixed(2);
                            return (
                                <View
                                    key={log.id ?? index}
                                    style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        marginBottom: 10,
                                        overflow: 'hidden',
                                        flexDirection: 'row',
                                    }}
                                >
                                    {/* Left accent strip */}
                                    <View style={{ width: 4, backgroundColor: statusColor }} />

                                    {/* Card content */}
                                    <View style={{ flex: 1, padding: 12 }}>
                                        {/* Top row: housing + weight */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <View style={{ flex: 1, marginRight: 12 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                                    <MaterialIcons name="home" size={13} color={colors.textGrey} />
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginLeft: 3 }]} numberOfLines={1}>{log.housingName}</Text>
                                                </View>
                                                {/* Status badge */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: statusColor + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                                    <MaterialIcons name={statusIcon} size={11} color={statusColor} />
                                                    <Text style={[textStyles.label, { color: statusColor, fontSize: 11, marginLeft: 3, fontWeight: '700' }]}>
                                                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                                                    </Text>
                                                </View>
                                            </View>
                                            {/* Weight — prominent right side */}
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>{kg}</Text>
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>kg</Text>
                                            </View>
                                        </View>

                                        {/* Bottom chips */}
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                                                <AnimalIcon type={log.animal as any} size={11} color={colors.textGrey} />
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{log.animal}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                                                <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{formatLogTime(log.timestamp)}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                                                <MaterialIcons name="monitor-weight" size={11} color={colors.textGrey} />
                                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{log.deviceName}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}

                        {/* Pagination */}
                        {filteredLogs.length > pageSize && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 }}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                    style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.stroke, backgroundColor: safePage <= 1 ? colors.bgLight : colors.surface, opacity: safePage <= 1 ? 0.5 : 1 }}
                                >
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13 }]}>← Prev</Text>
                                </TouchableOpacity>
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>
                                    {safePage} / {totalPages}
                                </Text>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={safePage >= totalPages}
                                    style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.stroke, backgroundColor: safePage >= totalPages ? colors.bgLight : colors.surface, opacity: safePage >= totalPages ? 0.5 : 1 }}
                                >
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13 }]}>Next →</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

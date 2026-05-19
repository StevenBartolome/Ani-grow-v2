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

    const activeFilterCount = (filterStatus !== 'all' ? 1 : 0) + (filterAnimal !== 'all' ? 1 : 0) + (filterHousingId !== 'all' ? 1 : 0);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>

            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                <View style={{ width: 40 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>Weight Logs</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                        {isFiltered ? `${filteredLogs.length} of ${logs.length} entries` : `${logs.length} entries`}
                    </Text>
                </View>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: showFilters ? colors.primary + '15' : 'transparent' }}
                    onPress={() => setShowFilters(v => !v)}
                >
                    <MaterialIcons name="tune" size={22} color={activeFilterCount > 0 || showFilters ? colors.primary : colors.textGrey} />
                    {activeFilterCount > 0 && (
                        <View style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.surface }} />
                    )}
                </TouchableOpacity>
            </View>

            {/* ── Filter Panel ────────────────────────────────────────── */}
            {showFilters && (
                <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke, paddingTop: 12, paddingBottom: 12, gap: 8 }}>

                    {/* Status row */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', gap: 8 }}>
                        {(['all', 'underweight', 'normal', 'overweight'] as StatusFilter[]).map(s => {
                            const active = filterStatus === s;
                            const c = s === 'underweight' ? colors.warning : s === 'overweight' ? colors.error : s === 'normal' ? colors.primary : colors.textGrey;
                            const icon: any = s === 'underweight' ? 'arrow-downward' : s === 'overweight' ? 'arrow-upward' : s === 'normal' ? 'check-circle' : 'monitor-weight';
                            return (
                                <TouchableOpacity key={s} onPress={() => setFilterStatus(s)} activeOpacity={0.75}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: active ? c : colors.bgLight, borderWidth: 1, borderColor: active ? c : colors.stroke }}>
                                    <MaterialIcons name={icon} size={13} color={active ? '#fff' : colors.textGrey} />
                                    <Text style={[textStyles.label, { fontSize: 12, color: active ? '#fff' : colors.textGrey }]}>
                                        {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Divider */}
                    <View style={{ height: 1, backgroundColor: colors.stroke, marginHorizontal: 16 }} />

                    {/* Animal + Housing row */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        {(['all', 'Pig', 'Chicken'] as AnimalFilter[]).map(a => {
                            const active = filterAnimal === a;
                            const c = a === 'Pig' ? colors.pig : a === 'Chicken' ? colors.chicken : colors.textGrey;
                            return (
                                <TouchableOpacity key={a} onPress={() => setFilterAnimal(a)} activeOpacity={0.75}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: active ? c : colors.bgLight, borderWidth: 1, borderColor: active ? c : colors.stroke }}>
                                    {a !== 'all' && <AnimalIcon type={a.toLowerCase() as any} size={12} color={active ? '#fff' : colors.textGrey} />}
                                    {a === 'all' && <MaterialIcons name="pets" size={13} color={active ? '#fff' : colors.textGrey} />}
                                    <Text style={[textStyles.label, { fontSize: 12, color: active ? '#fff' : colors.textGrey }]}>
                                        {a === 'all' ? 'All Animals' : a}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {housingOptions.length > 1 && (
                            <>
                                <View style={{ width: 1, height: 20, backgroundColor: colors.stroke }} />
                                {[{ id: 'all', name: 'All Housings' }, ...housingOptions].map(h => {
                                    const active = filterHousingId === h.id;
                                    return (
                                        <TouchableOpacity key={h.id} onPress={() => setFilterHousingId(h.id)} activeOpacity={0.75}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: active ? colors.info : colors.bgLight, borderWidth: 1, borderColor: active ? colors.info : colors.stroke }}>
                                            <MaterialIcons name="home" size={13} color={active ? '#fff' : colors.textGrey} />
                                            <Text style={[textStyles.label, { fontSize: 12, color: active ? '#fff' : colors.textGrey }]}>{h.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </>
                        )}
                    </ScrollView>

                    {activeFilterCount > 0 && (
                        <TouchableOpacity onPress={() => { setFilterStatus('all'); setFilterAnimal('all'); setFilterHousingId('all'); }} activeOpacity={0.7}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16 }}>
                            <MaterialIcons name="close" size={13} color={colors.error} />
                            <Text style={[textStyles.label, { color: colors.error, fontSize: 11 }]}>Clear all filters</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* ── Log List ─────────────────────────────────────────────── */}
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading logs…</Text>
                    </View>

                ) : logs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <MaterialIcons name="monitor-weight" size={34} color={colors.textGrey} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 6 }]}>No Logs Yet</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingHorizontal: 40 }]}>
                            Weight sessions recorded by your AniWeigh devices will appear here.
                        </Text>
                    </View>

                ) : filteredLogs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <MaterialIcons name="search-off" size={34} color={colors.textGrey} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 6 }]}>No Matches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingHorizontal: 40, marginBottom: 20 }]}>Try adjusting your filters.</Text>
                        <TouchableOpacity onPress={() => { setFilterStatus('all'); setFilterAnimal('all'); setFilterHousingId('all'); }} activeOpacity={0.7}
                            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 10 }}>
                            <Text style={[textStyles.label, { color: '#fff', fontSize: 13 }]}>Clear Filters</Text>
                        </TouchableOpacity>
                    </View>

                ) : (
                    <>
                        {pagedLogs.map((log, index) => {
                            const statusColor = log.status === 'underweight' ? colors.warning : log.status === 'overweight' ? colors.error : colors.primary;
                            const statusIcon: any = log.status === 'underweight' ? 'arrow-downward' : log.status === 'overweight' ? 'arrow-upward' : 'check';
                            const kg = (log.weight_g / 1000).toFixed(2);

                            return (
                                <View key={log.id ?? index} style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, overflow: 'hidden' }}>
                                    {/* Thin status bar across top */}
                                    <View style={{ height: 3, backgroundColor: statusColor }} />

                                    <View style={{ flexDirection: 'row', padding: 14, gap: 14, alignItems: 'center' }}>
                                        {/* Status icon box */}
                                        <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: statusColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                                            <MaterialIcons name={statusIcon} size={26} color={statusColor} />
                                        </View>

                                        {/* Main content */}
                                        <View style={{ flex: 1 }}>
                                            {/* Weight + status badge */}
                                            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                                                    <Text style={[textStyles.h1, { color: colors.text, fontSize: 26, lineHeight: 30 }]}>{kg}</Text>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>kg</Text>
                                                </View>
                                                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: statusColor + '18' }}>
                                                    <Text style={[textStyles.label, { color: statusColor, fontSize: 11 }]}>
                                                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Housing · Animal */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                                                <MaterialIcons name="home" size={12} color={colors.textGrey} />
                                                <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontFamily: 'Poppins-Medium', flex: 1 }]} numberOfLines={1}>{log.housingName}</Text>
                                                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.stroke }} />
                                                <AnimalIcon type={log.animal as any} size={12} color={colors.textGrey} />
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{log.animal}</Text>
                                            </View>

                                            {/* Time · Device */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                    <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>{formatLogTime(log.timestamp)}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                    <MaterialIcons name="monitor-weight" size={11} color={colors.textGrey} />
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>{log.deviceName}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}

                        {/* ── Pagination ──────────────────────────────────── */}
                        {filteredLogs.length > pageSize && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                                <TouchableOpacity activeOpacity={0.7} onPress={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, opacity: safePage <= 1 ? 0.4 : 1 }}>
                                    <MaterialIcons name="chevron-left" size={18} color={colors.text} />
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13 }]}>Prev</Text>
                                </TouchableOpacity>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Page {safePage} of {totalPages}</Text>
                                <TouchableOpacity activeOpacity={0.7} onPress={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, opacity: safePage >= totalPages ? 0.4 : 1 }}>
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 13 }]}>Next</Text>
                                    <MaterialIcons name="chevron-right" size={18} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

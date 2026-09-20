import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AnimalIcon } from '@/components/AnimalIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
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
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { deviceId } = useLocalSearchParams<{ deviceId?: string; animalType?: string }>();

    type StatusFilter = 'all' | 'underweight' | 'normal' | 'overweight';
    type AnimalFilter = 'all' | 'Pig' | 'Chicken';

    const [deviceName, setDeviceName] = useState<string | null>(null);
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

    const isSpecificDevice = Boolean(deviceId && deviceId !== 'undefined');

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
                if (isSpecificDevice) {
                    if (d.id === deviceId && hId && !housingMap[hId]) housingMap[hId] = hName;
                } else {
                    if (hId && !housingMap[hId]) housingMap[hId] = hName;
                }
            });

            if (isSpecificDevice && deviceMap[deviceId as string]) {
                setDeviceName(deviceMap[deviceId as string].name);
            }

            // Keep ref in sync so realtime callback always has the latest map
            deviceMapRef.current = deviceMap;

            // Build housing filter options
            setHousingOptions(Object.entries(housingMap).map(([id, name]) => ({ id, name })));

            // Determine which device IDs to query
            const allFarmDeviceIds = Object.keys(deviceMap);
            // If we came from a specific device screen, scope strictly to that device
            const targetDeviceIds = isSpecificDevice ? [deviceId as string] : allFarmDeviceIds;

            const { data, error } = await supabase
                .from('weigh_sessions')
                .select('id, net_weight_grams, status, animal_type, recorded_at, device_id')
                .in('device_id', targetDeviceIds)
                .neq('status', 'invalid')  // ghost/test readings marked invalid, not deleted — see migration_006
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

    const activeFilterSummary = useMemo(() => {
        const parts: string[] = [];
        if (filterStatus !== 'all') {
            parts.push(filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1));
        }
        if (filterAnimal !== 'all') {
            parts.push(filterAnimal);
        }
        if (filterHousingId !== 'all') {
            const h = housingOptions.find(opt => opt.id === filterHousingId);
            if (h) parts.push(h.name);
        }
        if (parts.length === 0) return 'All Logs';
        return parts.join(' · ');
    }, [filterStatus, filterAnimal, filterHousingId, housingOptions]);

    return (
        <View style={[styles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>

            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
                <View style={{ width: 40 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>Weight Logs</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                        {deviceName ? `${deviceName} · ` : ''}{isFiltered ? `${filteredLogs.length} of ${logs.length} entries` : `${logs.length} entries`}
                    </Text>
                </View>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: showFilters ? colors.primary + '15' : 'transparent' }}
                    onPress={() => setShowFilters(v => !v)}
                >
                    <MaterialIcons name="tune" size={22} color={activeFilterCount > 0 || showFilters ? colors.primary : colors.textGrey} />
                    {activeFilterCount > 0 && (
                        <View style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.surface }} />
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
                            backgroundColor: activeFilterCount > 0 ? colors.primary + '18' : colors.cardFill,
                            paddingHorizontal: 10,
                            paddingVertical: 3,
                            borderRadius: 999,
                        }}>
                            <Text style={{ fontFamily: activeFilterCount > 0 ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11, color: activeFilterCount > 0 ? colors.primary : colors.textGrey }}>
                                {activeFilterSummary}
                            </Text>
                        </View>

                        {activeFilterCount > 0 && (
                            <TouchableOpacity
                                onPress={() => { setFilterStatus('all'); setFilterAnimal('all'); setFilterHousingId('all'); }}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    paddingHorizontal: 10,
                                    paddingVertical: 3,
                                    borderRadius: 999,
                                    backgroundColor: colors.primary + '12',
                                }}
                            >
                                <MaterialIcons name="close" size={12} color={colors.primary} />
                                <Text style={{ fontFamily: 'Poppins-Medium', color: colors.primary, fontSize: 11 }}>Reset</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Status row (wrapped pills) */}
                    <View>
                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                            Weight Status
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {(['all', 'underweight', 'normal', 'overweight'] as StatusFilter[]).map(s => {
                                const active = filterStatus === s;
                                const c = s === 'underweight' ? colors.warning : s === 'overweight' ? colors.error : s === 'normal' ? colors.primary : colors.textGrey;
                                const icon: any = s === 'underweight' ? 'arrow-downward' : s === 'overweight' ? 'arrow-upward' : s === 'normal' ? 'check-circle' : 'monitor-weight';
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
                                            backgroundColor: active ? (s === 'all' ? colors.primary + '18' : c + '18') : colors.surface,
                                            borderWidth: 1.5,
                                            borderColor: active ? (s === 'all' ? colors.primary : c) : colors.stroke,
                                        }}
                                    >
                                        <MaterialIcons name={icon} size={13} color={active ? (s === 'all' ? colors.primary : c) : colors.textGrey} />
                                        <Text style={{
                                            fontFamily: active ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                            fontSize: 11.5,
                                            color: active ? (s === 'all' ? colors.primary : c) : colors.textGrey,
                                        }}>
                                            {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Animal row (wrapped pills) */}
                    <View>
                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                            Animal Type
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {(['all', 'Pig', 'Chicken'] as AnimalFilter[]).map(a => {
                                const active = filterAnimal === a;
                                const c = a === 'Pig' ? colors.pig : a === 'Chicken' ? colors.chicken : colors.primary;
                                return (
                                    <TouchableOpacity
                                        key={a}
                                        onPress={() => setFilterAnimal(a)}
                                        activeOpacity={0.75}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 5,
                                            paddingHorizontal: 14,
                                            paddingVertical: 6,
                                            borderRadius: 999,
                                            backgroundColor: active ? (a === 'all' ? colors.primary + '18' : c + '18') : colors.surface,
                                            borderWidth: 1.5,
                                            borderColor: active ? (a === 'all' ? colors.primary : c) : colors.stroke,
                                        }}
                                    >
                                        {a !== 'all' && <AnimalIcon type={a.toLowerCase() as any} size={12} color={active ? c : colors.textGrey} />}
                                        {a === 'all' && (
                                            <Image
                                                source={require('../../assets/icons/animals-filled.svg')}
                                                style={{ width: 14, height: 14 }}
                                                contentFit="contain"
                                            />
                                        )}
                                        <Text style={{
                                            fontFamily: active ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                            fontSize: 11.5,
                                            color: active ? (a === 'all' ? colors.primary : c) : colors.textGrey,
                                        }}>
                                            {a === 'all' ? 'All Animals' : a}
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

            {/* ── Log List ─────────────────────────────────────────────── */}
            <ScrollView contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading logs…</Text>
                    </View>

                ) : logs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <AniWeighIcon size={30} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 17, marginBottom: 5 }]}>No Logs Yet</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingHorizontal: 40, fontSize: 13 }]}>
                            Weight sessions recorded by your AniWeigh devices will appear here.
                        </Text>
                    </View>

                ) : filteredLogs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <MaterialIcons name="search-off" size={30} color={colors.textGrey} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 17, marginBottom: 5 }]}>No Matches</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingHorizontal: 40, marginBottom: 16, fontSize: 13 }]}>Try adjusting your filters.</Text>
                        <TouchableOpacity onPress={() => { setFilterStatus('all'); setFilterAnimal('all'); setFilterHousingId('all'); }} activeOpacity={0.7}
                            style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 999 }}>
                            <Text style={[textStyles.label, { color: '#fff', fontSize: 12.5 }]}>Clear Filters</Text>
                        </TouchableOpacity>
                    </View>

                ) : (
                    <>
                        {pagedLogs.map((log, index) => {
                            const statusColor = log.status === 'underweight' ? colors.warning : log.status === 'overweight' ? colors.error : colors.primary;
                            const statusIcon: any = log.status === 'underweight' ? 'arrow-downward' : log.status === 'overweight' ? 'arrow-upward' : 'check';
                            const kg = (log.weight_g / 1000).toFixed(2);
                            const animalColor = log.animal === 'Pig' ? colors.pig : colors.chicken;

                            return (
                                <View
                                    key={log.id ?? index}
                                    style={{
                                        backgroundColor: colors.surface,
                                        borderRadius: 14,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        borderLeftWidth: 3.5,
                                        borderLeftColor: statusColor,
                                        paddingHorizontal: 13,
                                        paddingVertical: 10,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 11,
                                    }}
                                >
                                    {/* Compact Status Icon (34x34 circle) */}
                                    <View style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: 17,
                                        backgroundColor: statusColor + '15',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}>
                                        <MaterialIcons name={statusIcon} size={18} color={statusColor} />
                                    </View>

                                    {/* Middle info */}
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        {/* Top line: Housing name & Animal pill */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                            <Text
                                                style={{
                                                    fontFamily: 'Poppins-SemiBold',
                                                    fontSize: 13,
                                                    color: colors.text,
                                                    flexShrink: 1,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {log.housingName}
                                            </Text>
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 3,
                                                paddingHorizontal: 6,
                                                paddingVertical: 1.5,
                                                borderRadius: 999,
                                                backgroundColor: animalColor + '14',
                                                flexShrink: 0,
                                            }}>
                                                <AnimalIcon type={log.animal.toLowerCase() as any} size={10} color={animalColor} />
                                                <Text style={{
                                                    fontFamily: 'Poppins-Medium',
                                                    fontSize: 10,
                                                    color: animalColor,
                                                }}>
                                                    {log.animal}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Bottom line: Time · Device */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                    {formatLogTime(log.timestamp)}
                                                </Text>
                                            </View>
                                            <Text style={{ color: colors.textGrey, fontSize: 8 }}>•</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
                                                <AniWeighIcon size={11} />
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }} numberOfLines={1}>
                                                    {log.deviceName}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Right: Weight & Status Pill */}
                                    <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 4 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                                            <Text style={{
                                                fontFamily: 'Poppins-Bold',
                                                fontSize: 17,
                                                color: colors.text,
                                                letterSpacing: -0.2,
                                            }}>
                                                {kg}
                                            </Text>
                                            <Text style={{
                                                fontFamily: 'Poppins-Medium',
                                                fontSize: 11,
                                                color: colors.textGrey,
                                            }}>
                                                kg
                                            </Text>
                                        </View>
                                        <View style={{
                                            paddingHorizontal: 7,
                                            paddingVertical: 1.5,
                                            borderRadius: 999,
                                            backgroundColor: statusColor + '18',
                                            marginTop: 2,
                                        }}>
                                            <Text style={{
                                                fontFamily: 'Poppins-SemiBold',
                                                color: statusColor,
                                                fontSize: 9.5,
                                                textTransform: 'capitalize',
                                            }}>
                                                {log.status}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}

                        {/* ── Pagination ──────────────────────────────────── */}
                        {filteredLogs.length > pageSize && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
                                <TouchableOpacity activeOpacity={0.7} onPress={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, opacity: safePage <= 1 ? 0.4 : 1 }}>
                                    <MaterialIcons name="chevron-left" size={16} color={colors.text} />
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 12 }]}>Prev</Text>
                                </TouchableOpacity>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Page {safePage} of {totalPages}</Text>
                                <TouchableOpacity activeOpacity={0.7} onPress={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, opacity: safePage >= totalPages ? 0.4 : 1 }}>
                                    <Text style={[textStyles.label, { color: colors.text, fontSize: 12 }]}>Next</Text>
                                    <MaterialIcons name="chevron-right" size={16} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

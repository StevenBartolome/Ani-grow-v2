import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, AppStateStatus, Platform, RefreshControl, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { Header } from '@/components/Header';
import { AnimalIcon } from '@/components/AnimalIcon';
import { DeviceIcon } from '@/components/DeviceIcon';
import ActionModal from '@/components/ActionModal';
import { supabase } from '@/lib/supabase';
import { getDeviceDisplayStatus } from '@/lib/deviceStatus';
import { createNotification } from '@/lib/notify';

interface RegisteredDevice {
    id: string;
    name: string;
    unique_code: string;
    status: 'online' | 'offline' | 'maintenance';
    lastSeen: string | null;
    type: 'AniFeed' | 'AniWeigh';
    animalType?: 'Pig' | 'Chicken';
}

type FilterType = 'All' | 'AniFeed' | 'AniWeigh';

const DeviceCard = ({
    device,
    index = 0,
    shouldAnimate = false,
    onPress,
    onConnectPress,
}: {
    device: RegisteredDevice;
    index?: number;
    shouldAnimate?: boolean;
    onPress: () => void;
    onConnectPress: () => void;
}) => {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    const isOnline = device.status === 'online';
    const isWeigh = device.type === 'AniWeigh';

    const accentColor = isWeigh ? colors.smartScale : colors.secondary;
    const animalColor = device.animalType === 'Pig' ? colors.pig : colors.chicken;

    const fadeAnim = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
    const translateYAnim = useRef(new Animated.Value(shouldAnimate ? 12 : 0)).current;

    useEffect(() => {
        if (!shouldAnimate) {
            fadeAnim.setValue(1);
            translateYAnim.setValue(0);
            return;
        }

        fadeAnim.setValue(0);
        translateYAnim.setValue(12);

        const delay = Math.min(index * 40, 240);
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(translateYAnim, {
                    toValue: 0,
                    damping: 18,
                    stiffness: 220,
                    mass: 0.8,
                    useNativeDriver: true,
                }),
            ]).start();
        }, delay);

        return () => clearTimeout(timer);
    }, [shouldAnimate, device.id]);

    return (
        <Animated.View
            style={{
                flex: 1,
                opacity: fadeAnim,
                transform: [{ translateY: translateYAnim }],
            }}
        >
            <TouchableOpacity
                activeOpacity={0.75}
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    padding: 16,
                    opacity: isOnline ? 1 : 0.6,
                    overflow: 'hidden',
                }}
                onPress={onPress}
            >
                {/* Top row: icon box + status dot */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <View style={{
                        width: 46, height: 46, borderRadius: 13,
                        backgroundColor: isOnline ? accentColor + '1A' : colors.bgLight,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <DeviceIcon
                            type={device.type}
                            size={24}
                        />
                    </View>

                    {/* Connection cloud icon — tap to open IoT setup */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onConnectPress}
                        style={{
                            width: 32, height: 32, borderRadius: 10,
                            backgroundColor: isOnline ? colors.primary + '15' : colors.bgLight,
                            alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1, borderColor: isOnline ? colors.primary + '30' : colors.stroke,
                        }}
                    >
                        <MaterialIcons
                            name={isOnline ? 'cloud-done' : 'cloud-off'}
                            size={18}
                            color={isOnline ? colors.primary : colors.textGrey}
                        />
                    </TouchableOpacity>
                </View>

                {/* Device name */}
                <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginBottom: 10 }]} numberOfLines={2}>
                    {device.name}
                </Text>

                {/* Bottom: type label + animal tag — pinned to bottom */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
                    <Text style={[textStyles.label, { color: accentColor, fontSize: 11 }]}>{device.type}</Text>
                    {device.animalType ? (
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: animalColor + '18',
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
                        }}>
                            <AnimalIcon type={device.animalType.toLowerCase() as any} size={11} color={animalColor} />
                            <Text style={[textStyles.label, { color: animalColor, fontSize: 11 }]}>{device.animalType}</Text>
                        </View>
                    ) : (
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            backgroundColor: colors.cardFill,
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
                            borderWidth: 1, borderColor: colors.stroke,
                        }}>
                            <MaterialIcons name="home-work" size={10} color={colors.textGrey} />
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>Unassigned</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

export default function DevicesScreen() {
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useDevicesStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { profile, permissions, role, isLoading: authLoading } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    // Responsive grid: 2 cols on phones, 3+ on tablets
    const numCols = width >= 768 ? 3 : 2;
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;
    const cardGap = 12;
    const cardWidth = (width - hPad * 2 - cardGap * (numCols - 1)) / numCols;

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? '';

    const RESTRICTED_ROLES = ['caretaker', 'veterinarian', 'flockman'];
    const canViewDevices = !role || !RESTRICTED_ROLES.includes(role)
        || permissions['devices:view'] === true;

    useEffect(() => {
        if (authLoading || !role) return;
        if (RESTRICTED_ROLES.includes(role) && !permissions['devices:view']) {
            router.replace('/(dashboard)/HomeScreen' as any);
        }
    }, [authLoading, role, permissions]);

    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [shouldAnimateCards, setShouldAnimateCards] = useState(false);
    const hasInitialAnimatedRef = useRef(false);
    const devicesLoadedRef = useRef(false);

    // Ticks forward periodically so a device's derived online/offline status
    // re-evaluates against DEVICE_ONLINE_THRESHOLD_MS purely from the passage
    // of time — no new data needed for a stale device to flip to "Offline".
    const [nowTick, setNowTick] = useState(Date.now());
    useEffect(() => {
        const interval = setInterval(() => setNowTick(Date.now()), 15000);
        return () => clearInterval(interval);
    }, []);

    const filters: FilterType[] = ['All', 'AniFeed', 'AniWeigh'];

    const [refreshing, setRefreshing] = useState(false);

    // Disconnect confirmation modal
    const [disconnectModalVisible, setDisconnectModalVisible] = useState(false);
    const [disconnectTarget, setDisconnectTarget] = useState<RegisteredDevice | null>(null);

    const handleCloudPress = (device: RegisteredDevice) => {
        if (device.status === 'online') {
            // Already connected — prompt to disconnect
            setDisconnectTarget(device);
            setDisconnectModalVisible(true);
        } else {
            // Offline — go to provisioning
            router.push(
                `/(devices)/AddDeviceScreen?existingDeviceId=${device.id}&existingDeviceName=${encodeURIComponent(device.name)}&existingDeviceType=${device.type}&existingDeviceCode=${encodeURIComponent(device.unique_code)}` as any
            );
        }
    };

    const handleDisconnectConfirm = async () => {
        if (!disconnectTarget) return;
        setDisconnectModalVisible(false);
        await supabase.from('devices').update({ status: 'offline' }).eq('id', disconnectTarget.id);
        setDevices(prev => prev.map(d => d.id === disconnectTarget.id ? { ...d, status: 'offline' } : d));
        setDisconnectTarget(null);
    };

    const fetchDevices = useCallback(async (isRefresh = false) => {
        if (!farmId) { setLoading(false); return; }
        if (isRefresh) setRefreshing(true);
        else if (!devicesLoadedRef.current) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('devices')
                .select('id, name, unique_code, type, status, last_seen, housing_id, housings(id, animal_type)')
                .eq('farm_id', farmId)
                .order('name', { ascending: true });
            if (error) throw error;

            const devicesList = data ?? [];

            // Read temp_animal_type overrides from AsyncStorage in parallel
            const tempTypeEntries = await Promise.all(
                devicesList.map(async (d: any) => {
                    try {
                        const temp = await AsyncStorage.getItem(`temp_animal_type_${d.id}`);
                        return [d.id, temp] as [string, string | null];
                    } catch (_) {
                        return [d.id, null] as [string, string | null];
                    }
                })
            );
            const tempTypeMap = new Map(tempTypeEntries);

            const mapped: RegisteredDevice[] = devicesList.map((d: any) => {
                const housingObj = Array.isArray(d.housings) ? d.housings[0] : d.housings;
                const dbType = housingObj?.animal_type?.toLowerCase();
                const tempType = tempTypeMap.get(d.id);

                let resolvedType: 'Pig' | 'Chicken' | undefined = undefined;
                if (tempType === 'Pig' || tempType === 'Piglet') {
                    resolvedType = 'Pig';
                } else if (tempType === 'Chicken' || tempType === 'Chicks' || tempType === 'Chicks (with caution: must be in crate)') {
                    resolvedType = 'Chicken';
                } else if (dbType === 'pig') {
                    resolvedType = 'Pig';
                } else if (dbType === 'chicken') {
                    resolvedType = 'Chicken';
                }

                return {
                    id: d.id,
                    name: d.name,
                    unique_code: d.unique_code ?? '',
                    status: d.status ?? 'offline',
                    lastSeen: d.last_seen ?? null,
                    type: d.type === 'anifeed' ? 'AniFeed' : 'AniWeigh',
                    animalType: resolvedType,
                };
            });
            setDevices(mapped);
            devicesLoadedRef.current = true;

            // Only trigger fade-in animation on initial mount or manual pull-to-refresh
            if (!hasInitialAnimatedRef.current || isRefresh) {
                hasInitialAnimatedRef.current = true;
                setShouldAnimateCards(true);
                setTimeout(() => setShouldAnimateCards(false), 600);
            }
        } catch (err) {
            console.error('[DevicesScreen] fetch error:', err);
        } finally {
            if (isRefresh) setRefreshing(false);
            else setLoading(false);
        }
    }, [farmId]);

    // Initial load
    useEffect(() => { fetchDevices(false); }, [fetchDevices]);

    // Silent background auto-sync on focus
    useFocusEffect(
        useCallback(() => {
            fetchDevices(false);
        }, [fetchDevices])
    );

    // Live Supabase Realtime channel
    useEffect(() => {
        if (!farmId) return;
        let debounceTimer: any = null;
        const triggerSync = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchDevices(false);
            }, 300);
        };

        const channel = supabase
            .channel(`devices-live-sync-${farmId}-${Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `farm_id=eq.${farmId}` }, triggerSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'housings', filter: `farm_id=eq.${farmId}` }, triggerSync)
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [farmId, fetchDevices]);

    // AppState listener
    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (nextState === 'active' && farmId) {
                fetchDevices(false);
            }
        });
        return () => sub.remove();
    }, [farmId, fetchDevices]);

    // Resolve each device's *real* status (manual flag + heartbeat freshness)
    // against the current tick, so staleness shows up without a refetch.
    // If GoldenWeigh (AniWeigh) is online on this farm, keep AniFeed devices online too.
    const hasOnlineAniWeigh = devices.some(
        d => d.type === 'AniWeigh' && getDeviceDisplayStatus(d.status, d.lastSeen, nowTick) === 'online'
    );

    const liveDevices: RegisteredDevice[] = devices.map(d => {
        let displayStatus = getDeviceDisplayStatus(d.status, d.lastSeen, nowTick);
        if (d.type === 'AniFeed' && hasOnlineAniWeigh) {
            displayStatus = 'online';
        }
        return {
            ...d,
            status: displayStatus,
        };
    });

    const filteredDevices = activeFilter === 'All'
        ? liveDevices
        : liveDevices.filter(d => d.type === activeFilter);

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>
                {/* Top Nav / Logo Row */}
                <Header />

                <View style={{ paddingHorizontal: hPad, paddingTop: 4, marginBottom: 12 }}>
                    <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, fontFamily: 'Poppins-Bold' }]}>Device Monitor</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 2, fontFamily: 'Poppins-Regular' }]}>
                        Real-time control center
                    </Text>
                </View>

                {/* Filters Row */}
                <View style={styles.filterContainer}>
                    {filters.map(filter => (
                        <TouchableOpacity
                            key={filter}
                            activeOpacity={0.7}
                            onPress={() => setActiveFilter(filter)}
                            style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
                        >
                            <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
                                {filter}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <ScrollView
                    style={styles.container}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchDevices(true)} colors={[colors.primary]} tintColor={colors.primary} />}
                >
                    {loading && devices.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading devices...</Text>
                        </View>
                    ) : filteredDevices.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
                            <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                <MaterialIcons name="devices" size={36} color={colors.primary} />
                            </View>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center', marginBottom: 8 }]}>
                                {devices.length === 0 ? 'No Devices Registered' : `No ${activeFilter} Devices`}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                {devices.length === 0
                                    ? 'Add your first AniWeigh or AniFeed device to start monitoring your livestock.'
                                    : `No ${activeFilter} devices match the current filter.`}
                            </Text>
                        </View>
                    ) : (
                        <View style={{ paddingHorizontal: hPad, paddingBottom: 24 }}>
                            {/* Section header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Registered Devices</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {[
                                        { label: 'Online', count: filteredDevices.filter(d => d.status === 'online').length, color: colors.primary },
                                        { label: 'Offline', count: filteredDevices.filter(d => d.status === 'offline').length, color: colors.textGrey },
                                    ].filter(s => s.count > 0).map(s => (
                                        <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: s.color + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.color }} />
                                            <Text style={[textStyles.label, { color: s.color, fontSize: 11 }]}>{s.count} {s.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            {/* Grid */}
                            {Array.from({ length: Math.ceil(filteredDevices.length / numCols) }).map((_, rowIdx) => (
                                <View key={rowIdx} style={{ flexDirection: 'row', gap: cardGap, marginBottom: cardGap }}>
                                    {filteredDevices.slice(rowIdx * numCols, rowIdx * numCols + numCols).map((device, colIdx) => (
                                        <View key={device.id} style={{ width: cardWidth }}>
                                            <DeviceCard
                                                device={device}
                                                index={rowIdx * numCols + colIdx}
                                                shouldAnimate={shouldAnimateCards}
                                                onPress={() => {
                                                    if (device.type === 'AniWeigh') {
                                                        router.push(`/(devices)/AniWeighScreen?deviceId=${device.id}&status=${device.status}` as any);
                                                    } else {
                                                        router.push(`/(devices)/AniFeedScreen?deviceId=${device.id}&status=${device.status}` as any);
                                                    }
                                                }}
                                                onConnectPress={() => handleCloudPress(device)}
                                            />
                                        </View>
                                    ))}
                                    {/* Fill empty slot in last row so cards don't stretch */}
                                    {filteredDevices.slice(rowIdx * numCols, rowIdx * numCols + numCols).length < numCols && (
                                        <View style={{ width: cardWidth }} />
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>
            </View>

            <FloatingNavBar />

            <ActionModal
                visible={disconnectModalVisible}
                type="confirmation"
                title={`Disconnect ${disconnectTarget?.name ?? 'Device'}?`}
                message={`This will take "${disconnectTarget?.name}" offline. You can reconnect it anytime by tapping the cloud icon.`}
                confirmText="Disconnect"
                cancelText="Cancel"
                onConfirm={handleDisconnectConfirm}
                onCancel={() => { setDisconnectModalVisible(false); setDisconnectTarget(null); }}
            />
        </View>
    );
}


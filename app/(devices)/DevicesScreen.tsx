import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { supabase } from '@/lib/supabase';

interface RegisteredDevice {
    id: string;
    name: string;
    status: 'online' | 'offline';
    type: 'AniFeed' | 'AniWeigh';
    animalType?: 'Pig' | 'Chicken';
}

type FilterType = 'All' | 'AniFeed' | 'AniWeigh';

const DeviceCard = ({ device, onPress }: { device: RegisteredDevice; onPress: () => void }) => {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    const isOnline = device.status === 'online';
    const isWeigh = device.type === 'AniWeigh';

    const accentColor = isWeigh ? colors.smartScale : colors.secondary;
    const animalColor = device.animalType === 'Pig' ? colors.pig : colors.chicken;

    return (
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
                    <MaterialIcons
                        name={isWeigh ? 'monitor-weight' : 'grain'}
                        size={24}
                        color={isOnline ? accentColor : colors.textGrey}
                    />
                </View>

                {/* Status dot */}
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: isOnline ? colors.primary + '15' : colors.bgLight,
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
                    borderWidth: 1, borderColor: isOnline ? colors.primary + '30' : colors.stroke,
                }}>
                    <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: isOnline ? colors.primary : colors.textGrey,
                    }} />
                    <Text style={[textStyles.label, { fontSize: 10, color: isOnline ? colors.primary : colors.textGrey }]}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>
                </View>
            </View>

            {/* Device name */}
            <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginBottom: 10 }]} numberOfLines={2}>
                {device.name}
            </Text>

            {/* Bottom: type label + animal tag — pinned to bottom */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
                <Text style={[textStyles.label, { color: accentColor, fontSize: 11 }]}>{device.type}</Text>
                {device.animalType && (
                    <View style={{
                        backgroundColor: animalColor + '18',
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
                    }}>
                        <Text style={[textStyles.label, { color: animalColor, fontSize: 11 }]}>{device.animalType}</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

export default function DevicesScreen() {
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
        || permissions['devices'] === true;

    useEffect(() => {
        if (authLoading || !role) return;
        if (RESTRICTED_ROLES.includes(role) && !permissions['devices']) {
            router.replace('/(dashboard)/HomeScreen' as any);
        }
    }, [authLoading, role, permissions]);

    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [loading, setLoading] = useState(true);

    const filters: FilterType[] = ['All', 'AniFeed', 'AniWeigh'];

    const fetchDevices = useCallback(async () => {
        if (!farmId) { setLoading(false); return; }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('devices')
                .select('id, name, type, status, housings(animal_type)')
                .eq('farm_id', farmId)
                .order('name', { ascending: true });
            if (error) throw error;

            const mapped: RegisteredDevice[] = (data ?? []).map((d: any) => ({
                id: d.id,
                name: d.name,
                status: d.status === 'online' ? 'online' : 'offline',
                type: d.type === 'anifeed' ? 'AniFeed' : 'AniWeigh',
                animalType: d.housings?.animal_type === 'pig' ? 'Pig' :
                    d.housings?.animal_type === 'chicken' ? 'Chicken' : undefined,
            }));
            setDevices(mapped);
        } catch (err) {
            console.error('[DevicesScreen] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [farmId]);

    useEffect(() => { fetchDevices(); }, [fetchDevices]);

    const filteredDevices = activeFilter === 'All'
        ? devices
        : devices.filter(d => d.type === activeFilter);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Top Nav / Logo Row */}
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTitleRow}>
                        <TouchableOpacity
                            style={{ marginRight: 8, padding: 4 }}
                            onPress={() => setProfileDrawerOpen(true)}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="menu" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={{ width: 36, height: 36, marginRight: 10 }}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 24 }]}>
                            Ani-Grow
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(devices)/AddDeviceScreen')}>
                        <MaterialIcons name="add" size={22} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>

                <View style={styles.headerContainer}>
                    <View style={styles.headerTextContainer}>
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>Device Monitor</Text>
                        <Text style={[textStyles.body, styles.headerSubtitle, { color: colors.textGrey, fontSize: 16 }]}>
                            Real-time control center
                        </Text>
                    </View>
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
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDevices} colors={[colors.primary]} tintColor={colors.primary} />}
                >
                    {loading ? (
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
                            {devices.length === 0 && (
                                <TouchableOpacity
                                    style={{ backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 100 }}
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/(devices)/AddDeviceScreen')}
                                >
                                    <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>Add Device</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <View style={{ paddingHorizontal: hPad, paddingBottom: 24 }}>
                            {/* Section header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Registered Devices</Text>
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
                                    {filteredDevices.slice(rowIdx * numCols, rowIdx * numCols + numCols).map(device => (
                                        <View key={device.id} style={{ width: cardWidth }}>
                                            <DeviceCard
                                                device={device}
                                                onPress={() => {
                                                    if (device.type === 'AniWeigh') {
                                                        router.push(`/(devices)/AniWeighScreen?deviceId=${device.id}` as any);
                                                    } else {
                                                        router.push(`/(devices)/AniFeedScreen?deviceId=${device.id}` as any);
                                                    }
                                                }}
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
            <ProfileDrawer
                visible={profileDrawerOpen}
                onClose={() => setProfileDrawerOpen(false)}
                activeFarmName={farmName}
            />
        </SafeAreaView>
    );
}


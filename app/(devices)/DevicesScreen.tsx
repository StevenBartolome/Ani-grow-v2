import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';

// Mock Types
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
    const styles = useDevicesStyles();

    const [isOnline, setIsOnline] = useState(device.status === 'online');

    const isWeigh = device.type === 'AniWeigh';

    const iconColor = isWeigh ? colors.smartScale : colors.secondary;
    const bgColor = isWeigh ? colors.smartScale + '1A' : colors.secondary + '1A';

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            style={[
                styles.deviceCard,
                { backgroundColor: colors.surface, borderColor: colors.stroke },
                !isOnline && styles.deviceCardOffline
            ]}
            onPress={onPress}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={[styles.deviceIconBox, { backgroundColor: bgColor }, !isOnline && styles.deviceIconBoxOffline]}>
                    <MaterialIcons name={isWeigh ? "monitor-weight" : "grain"} size={26} color={isOnline ? iconColor : colors.textGrey} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {device.animalType && (
                        <View style={{ 
                            paddingHorizontal: 10, 
                            paddingVertical: 3, 
                            borderRadius: 100, 
                            backgroundColor: (device.animalType === 'Pig' ? colors.pig : colors.chicken) + '1A',
                            borderWidth: 1,
                            borderColor: (device.animalType === 'Pig' ? colors.pig : colors.chicken) + '33'
                        }}>
                            <Text style={{ 
                                color: device.animalType === 'Pig' ? colors.pig : colors.chicken, 
                                fontSize: 10, 
                                fontFamily: 'Poppins-Bold' 
                            }}>
                                {device.animalType.toUpperCase()}
                            </Text>
                        </View>
                    )}
                    <View style={styles.deviceStatusDotContainer}>
                        {isOnline && <View style={styles.deviceStatusDot} />}
                    </View>
                </View>
            </View>
            <View style={[styles.deviceInfoBottom, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }, !isOnline && styles.deviceTextOffline]} numberOfLines={2}>
                        {device.name}
                    </Text>
                    <Text style={[textStyles.body, { color: isOnline ? colors.primary : colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
};

export default function DevicesScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useDevicesStyles();
    const router = useRouter();

    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [loading, setLoading] = useState(true);

    const filters: FilterType[] = ['All', 'AniFeed', 'AniWeigh'];

    // ─── Loading (Mocked) ───────────────────
    useEffect(() => {
        const timer = setTimeout(() => {
            const mockDevices: RegisteredDevice[] = [
                { id: '1', name: 'AniWeigh Unit 01', status: 'online', type: 'AniWeigh', animalType: 'Pig' },
                { id: '2', name: 'AniFeed Unit 01', status: 'online', type: 'AniFeed', animalType: 'Chicken' },
                { id: '3', name: 'AniFeed Unit 02', status: 'offline', type: 'AniFeed', animalType: 'Pig' },
            ];
            setDevices(mockDevices);
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, []);

    const filteredDevices = activeFilter === 'All'
        ? devices
        : devices.filter(d => d.type === activeFilter);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Top Nav / Logo Row */}
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTitleRow}>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={{ width: 36, height: 36, marginRight: 10 }}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 28 }]}>
                            Ani-Grow
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(devices)/AddDeviceScreen')}>
                        <MaterialIcons name="add" size={22} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>

                <View style={styles.headerContainer}>
                    <View style={styles.headerTextContainer}>
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>
                            Device Monitor
                        </Text>
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
                            style={[
                                styles.filterChip,
                                activeFilter === filter && styles.filterChipActive
                            ]}
                        >
                            <Text style={[
                                styles.filterChipText,
                                activeFilter === filter && styles.filterChipTextActive
                            ]}>
                                {filter}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                    {/* Section Title */}
                    <View style={styles.sectionTitleRow}>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                            Registered Devices
                        </Text>
                    </View>

                    {/* Loading State */}
                    {loading && (
                        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading devices...</Text>
                        </View>
                    )}

                    {/* Empty State */}
                    {!loading && filteredDevices.length === 0 && (
                        <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
                            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                <MaterialIcons name="devices" size={36} color={colors.primary} />
                            </View>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center', marginBottom: 8 }]}>
                                No Devices Registered
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                Add your first AniWeigh or AniFeed device to start monitoring your livestock.
                            </Text>
                            <TouchableOpacity
                                style={{ backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 100 }}
                                activeOpacity={0.8}
                                onPress={() => router.push('/(devices)/AddDeviceScreen')}
                            >
                                <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>Add Device</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Grid Section */}
                    {!loading && filteredDevices.length > 0 && (
                        <View style={styles.gridContainer}>
                            {filteredDevices.map(device => (
                                <DeviceCard 
                                    key={device.id} 
                                    device={device} 
                                    onPress={() => {
                                        if (device.type === 'AniWeigh') {
                                            router.push(`/(devices)/AniWeighScreen?deviceId=${device.id}` as any);
                                        } else {
                                            router.push(`/(devices)/AniFeedScreen?deviceId=${device.id}` as any);
                                        }
                                    }}
                                />
                            ))}
                        </View>
                    )}
                </ScrollView>

                <FloatingNavBar />
            </View>
        </SafeAreaView>
    );
}


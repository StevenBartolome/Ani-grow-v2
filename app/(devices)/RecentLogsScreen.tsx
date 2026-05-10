import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { useAuth } from '@/context/AuthContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { useAniWeighStyles } from '@/styles/aniweighStyles';

// Mock Types
interface WeighLogEntry {
    id: string;
    weight_g: number;
    status: 'underweight' | 'normal' | 'overweight';
    timestamp: number;
    animal: string;
    unit?: 'kg' | 'g';
}

export default function RecentLogsScreen() {
    const { profile } = useAuth();
    const farmId = profile?.farmId || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useDevicesStyles();
    const aniweighStyles = useAniWeighStyles();
    const router = useRouter();
    const { deviceId, animalType } = useLocalSearchParams();
    const defaultAnimalName = (animalType as string) || 'Animal';

    type AnimalFilter = 'All' | 'Pig' | 'Chicken';
    type StatusFilter = 'All' | 'Normal' | 'Underweight' | 'Overweight';

    const statusFilters: StatusFilter[] = ['All', 'Normal', 'Underweight', 'Overweight'];

    const [logs, setLogs] = useState<WeighLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeAnimalFilter, setActiveAnimalFilter] = useState<AnimalFilter>('All');
    const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>('All');
    const [showFilters, setShowFilters] = useState(true);
    const [page, setPage] = useState(1);
    const pageSize = 8;

    const availableAnimals: AnimalFilter[] = ['All', 'Pig', 'Chicken'];

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const effectiveAnimal = (log.animal || defaultAnimalName).toLowerCase();
            const byAnimal =
                activeAnimalFilter === 'All' ||
                effectiveAnimal === activeAnimalFilter.toLowerCase();
            const byStatus =
                activeStatusFilter === 'All' ||
                log.status.toLowerCase() === activeStatusFilter.toLowerCase();
            return byAnimal && byStatus;
        });
    }, [logs, activeAnimalFilter, activeStatusFilter, defaultAnimalName]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedLogs = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return filteredLogs.slice(start, start + pageSize);
    }, [filteredLogs, safePage]);

    // ─── Loading (Mocked) ───────────────────
    useEffect(() => {
        const timer = setTimeout(() => {
            const mockLogs: WeighLogEntry[] = [
                { id: '1', weight_g: 1250, status: 'normal', timestamp: Date.now() - 3600000, animal: 'Chicken', unit: 'kg' },
                { id: '2', weight_g: 750, status: 'underweight', timestamp: Date.now() - 7200000, animal: 'Chicken', unit: 'kg' },
                { id: '3', weight_g: 1600, status: 'overweight', timestamp: Date.now() - 10800000, animal: 'Chicken', unit: 'kg' },
                { id: '4', weight_g: 85000, status: 'normal', timestamp: Date.now() - 14400000, animal: 'Pig', unit: 'kg' },
                { id: '5', weight_g: 1300, status: 'normal', timestamp: Date.now() - 18000000, animal: 'Chicken', unit: 'kg' },
                { id: '6', weight_g: 65000, status: 'underweight', timestamp: Date.now() - 21600000, animal: 'Pig', unit: 'kg' },
                { id: '7', weight_g: 95000, status: 'overweight', timestamp: Date.now() - 25200000, animal: 'Pig', unit: 'kg' },
                { id: '8', weight_g: 1200, status: 'normal', timestamp: Date.now() - 28800000, animal: 'Chicken', unit: 'kg' },
                { id: '9', weight_g: 1100, status: 'normal', timestamp: Date.now() - 32400000, animal: 'Chicken', unit: 'kg' },
            ];
            setLogs(mockLogs);
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [deviceId, farmId]);

    useEffect(() => {
        // Reset pagination whenever the dataset being displayed changes materially
        setPage(1);
    }, [deviceId, activeAnimalFilter, activeStatusFilter]);

    const formatLogTime = (timestamp: number) => {
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
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${timeStr}`;
    };

    const getLogIcon = (status: string) => {
        switch (status) {
            case 'underweight':
                return { icon: 'warning' as const, color: colors.warning };
            case 'overweight':
                return { icon: 'error' as const, color: colors.error };
            default:
                return { icon: 'check-circle' as const, color: colors.primary };
        }
    };

    const getLogMessage = (log: WeighLogEntry) => {
        const unit: 'kg' | 'g' = log.unit || 'kg';
        const value = unit === 'kg'
            ? log.weight_g / 1000
            : log.weight_g;
        const formatted = unit === 'kg'
            ? value.toFixed(2)
            : value.toFixed(0);
        const weightStr = `${formatted} ${unit}`;
        const animalName = log.animal || defaultAnimalName;
        switch (log.status) {
            case 'underweight':
                return `Underweight ${animalName} detected at ${weightStr}.`;
            case 'overweight':
                return `Overweight ${animalName} detected at ${weightStr}.`;
            default:
                return `${animalName} weighed at ${weightStr} — Normal.`;
        }
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>All Recent Logs</Text>
                <TouchableOpacity 
                    activeOpacity={0.7}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setShowFilters(!showFilters)}
                >
                    <MaterialIcons 
                        name={showFilters ? "filter-list-off" : "filter-list"} 
                        size={24} 
                        color={showFilters ? colors.primary : colors.textGrey} 
                    />
                </TouchableOpacity>
            </View>

            {/* Modern Filters */}
            {showFilters && (
                <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                    {/* Animal Filter */}
                    <View style={{ marginBottom: 16 }}>
                        <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                            Filter by Animal
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {availableAnimals.map(animal => {
                                    const isActive = activeAnimalFilter === animal;
                                    let chipColor = colors.primary;
                                    if (animal === 'Pig') chipColor = colors.pig;
                                    if (animal === 'Chicken') chipColor = colors.chicken;

                                    return (
                                        <TouchableOpacity
                                            key={animal}
                                            activeOpacity={0.7}
                                            onPress={() => setActiveAnimalFilter(animal)}
                                            style={{
                                                paddingHorizontal: 16,
                                                paddingVertical: 8,
                                                borderRadius: 100,
                                                backgroundColor: isActive ? chipColor : colors.surface,
                                                borderWidth: 1,
                                                borderColor: isActive ? chipColor : colors.stroke,
                                                elevation: isActive ? 2 : 0,
                                                shadowColor: chipColor,
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: isActive ? 0.2 : 0,
                                                shadowRadius: 4,
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    textStyles.body,
                                                    {
                                                        fontSize: 13,
                                                        fontFamily: isActive ? 'Poppins-SemiBold' : 'Poppins-Medium',
                                                        color: isActive ? '#FFF' : colors.textGrey,
                                                    },
                                                ]}
                                            >
                                                {animal}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Status Filter */}
                    <View>
                        <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                            Filter by Status
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {statusFilters.map(filter => {
                                    const isActive = activeStatusFilter === filter;
                                    let chipColor = colors.primary;
                                    if (filter === 'Normal') chipColor = colors.success;
                                    if (filter === 'Underweight') chipColor = colors.warning;
                                    if (filter === 'Overweight') chipColor = colors.error;

                                    return (
                                        <TouchableOpacity
                                            key={filter}
                                            activeOpacity={0.7}
                                            onPress={() => setActiveStatusFilter(filter)}
                                            style={{
                                                paddingHorizontal: 16,
                                                paddingVertical: 8,
                                                borderRadius: 100,
                                                backgroundColor: isActive ? chipColor : colors.surface,
                                                borderWidth: 1,
                                                borderColor: isActive ? chipColor : colors.stroke,
                                                elevation: isActive ? 2 : 0,
                                                shadowColor: chipColor,
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: isActive ? 0.2 : 0,
                                                shadowRadius: 4,
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    textStyles.body,
                                                    {
                                                        fontSize: 13,
                                                        fontFamily: isActive ? 'Poppins-SemiBold' : 'Poppins-Medium',
                                                        color: isActive ? '#FFF' : colors.textGrey,
                                                    },
                                                ]}
                                            >
                                                {filter}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading logs...</Text>
                    </View>
                ) : logs.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <MaterialIcons name="history" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginTop: 16 }]}>No Logs Found</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center' }]}>When your device records weights, they will appear here.</Text>
                    </View>
                ) : (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.stroke }}>
                        {pagedLogs.map((log, index) => {
                            const { icon, color } = getLogIcon(log.status);
                            return (
                                <View key={log.id ?? index} style={[aniweighStyles.logItem, { marginTop: index === 0 ? 0 : 16 }]}>
                                    <View style={[aniweighStyles.logIcon, { backgroundColor: color + '1A' }]}>
                                        <MaterialIcons name={icon} size={16} color={color} />
                                    </View>
                                    <View style={aniweighStyles.logContent}>
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{getLogMessage(log)}</Text>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>{formatLogTime(log.timestamp)}</Text>
                                    </View>
                                </View>
                            );
                        })}
                        {filteredLogs.length === 0 && (
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingVertical: 12 }]}>
                                No
                                {activeStatusFilter === 'All'
                                    ? ' logs'
                                    : ` ${activeStatusFilter.toLowerCase()} animals`}
                                {activeAnimalFilter !== 'All'
                                    ? ` for ${activeAnimalFilter.toLowerCase()}`
                                    : ''}{' '}
                                found.
                            </Text>
                        )}

                        {filteredLogs.length > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: 999,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        backgroundColor: safePage <= 1 ? colors.bgLight : colors.surface,
                                        opacity: safePage <= 1 ? 0.6 : 1,
                                    }}
                                >
                                    <Text style={[textStyles.label, { color: colors.text }]}>Prev</Text>
                                </TouchableOpacity>

                                <Text style={[textStyles.label, { color: colors.textGrey }]}>
                                    Page {safePage} of {totalPages}
                                </Text>

                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={safePage >= totalPages}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: 999,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        backgroundColor: safePage >= totalPages ? colors.bgLight : colors.surface,
                                        opacity: safePage >= totalPages ? 0.6 : 1,
                                    }}
                                >
                                    <Text style={[textStyles.label, { color: colors.text }]}>Next</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

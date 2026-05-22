import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniFeedStyles } from '@/styles/anifeedStyles';
import { AnimalIcon } from '@/components/AnimalIcon';
import { AIInsightCard } from '@/components/AIInsightCard';
import { supabase } from '@/lib/supabase';

interface DeviceInfo {
    name: string;
    status: string;
    housingId: string | null;
    housingName: string;
    animalType: 'Pig' | 'Chicken';
}

interface FeedScheduleInfo {
    id: string | null;
    timesPerDay: number;
    gramsPerDispense: number;
    feedId: string | null;
    feedBrand: string;
}

interface DispenseLogEntry {
    id: string;
    status: 'success' | 'error' | 'pending';
    amount: string;
    amountGrams: number;
    timestamp: number;
    housingName: string;
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

function getFormattedDate(): string {
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

export default function AniFeedScreen() {
    const { systemConfig, profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const anifeedStyles = useAniFeedStyles();
    const router = useRouter();
    const { deviceId } = useLocalSearchParams();

    if (systemConfig?.featureFlags && !systemConfig.featureFlags.feedingEnabled) {
        return (
            <SafeAreaView style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight, justifyContent: 'center', alignItems: 'center' }]}>
                <MaterialIcons name="block" size={64} color={colors.textGrey} />
                <Text style={[textStyles.h2, { color: colors.text, marginTop: 20 }]}>Feeding Module Disabled</Text>
                <Text style={[textStyles.body, { textAlign: 'center', marginTop: 10, color: colors.textGrey, paddingHorizontal: 40 }]}>
                    This feature is currently disabled by the system administrator.
                </Text>
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(devices)/DevicesScreen' as any)} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    // ─── Device + Schedule State ─────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(true);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [schedule, setSchedule] = useState<FeedScheduleInfo | null>(null);
    const [dispenseLogs, setDispenseLogs] = useState<DispenseLogEntry[]>([]);
    const [lastDispensed, setLastDispensed] = useState<string | null>(null);
    const [liveTodayGrams, setLiveTodayGrams] = useState<number | null>(null);
    const [liveFlash, setLiveFlash] = useState(false);

    // Options for edit modals (fetched from farm)
    const [farmHousings, setFarmHousings] = useState<{ id: string; name: string; animal_type: string }[]>([]);
    const [farmFeeds, setFarmFeeds] = useState<{ id: string; name: string; brand: string; animal_type: string }[]>([]);

    // Schedule edit modal
    const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
    const [tempTimesPerDay, setTempTimesPerDay] = useState('3');
    const [tempGrams, setTempGrams] = useState('500');

    // Edit field modal (Housing, Brand, AnimalType)
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Housing' | 'Brand' | 'AnimalType' | null>(null);

    // Action confirm modal
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('info');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');

    // Snackbar
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // ─── Fetch ───────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        if (!deviceId || !farmId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const [deviceResult, scheduleResult, logsResult, housingsResult, feedsResult] = await Promise.all([
                supabase
                    .from('devices')
                    .select('id, name, status, housing_id, housings(name, animal_type)')
                    .eq('id', deviceId as string)
                    .single(),
                supabase
                    .from('feed_schedules')
                    .select('id, times_per_day, grams_per_dispense, feed_id, feeds(brand)')
                    .eq('device_id', deviceId as string)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('dispense_records')
                    .select('id, grams_dispensed, status, dispensed_at')
                    .eq('device_id', deviceId as string)
                    .order('dispensed_at', { ascending: false })
                    .limit(3),
                supabase
                    .from('housings')
                    .select('id, name, animal_type')
                    .eq('farm_id', farmId)
                    .eq('status', 'Active'),
                supabase
                    .from('feeds')
                    .select('id, name, brand, animal_type')
                    .eq('farm_id', farmId),
            ]);

            if (deviceResult.data) {
                const d = deviceResult.data as any;
                setDeviceInfo({
                    name: d.name,
                    status: d.status,
                    housingId: d.housing_id ?? null,
                    housingName: d.housings?.name ?? 'Unassigned',
                    animalType: d.housings?.animal_type === 'pig' ? 'Pig' : 'Chicken',
                });
                setIsConnected(d.status === 'online');
            }

            if (scheduleResult.data) {
                const s = scheduleResult.data as any;
                setSchedule({
                    id: s.id,
                    timesPerDay: s.times_per_day,
                    gramsPerDispense: s.grams_per_dispense,
                    feedId: s.feed_id ?? null,
                    feedBrand: s.feeds?.brand ?? 'Not set',
                });
                setTempTimesPerDay(String(s.times_per_day));
                setTempGrams(String(s.grams_per_dispense));
            }

            if (logsResult.data && logsResult.data.length > 0) {
                const housingName = (deviceResult.data as any)?.housings?.name ?? 'Unassigned';
                const mapped: DispenseLogEntry[] = logsResult.data.map((r: any) => ({
                    id: r.id,
                    status: r.status,
                    amount: `${r.grams_dispensed}g`,
                    amountGrams: r.grams_dispensed,
                    timestamp: new Date(r.dispensed_at).getTime(),
                    housingName,
                }));
                setDispenseLogs(mapped);
                setLastDispensed(`${formatLogTime(mapped[0].timestamp)} (${mapped[0].amount})`);
            }

            if (housingsResult.data) setFarmHousings(housingsResult.data as any);
            if (feedsResult.data) setFarmFeeds(feedsResult.data as any);
        } catch (err) {
            console.error('[AniFeedScreen] fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [deviceId, farmId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ─── Today's total dispensed ─────────────────────────────────
    const fetchTodayTotal = useCallback(async () => {
        if (!deviceId) return;
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { data } = await supabase
            .from('dispense_records')
            .select('grams_dispensed')
            .eq('device_id', deviceId as string)
            .eq('status', 'success')
            .gte('dispensed_at', startOfDay.toISOString());
        if (data) {
            const total = (data as any[]).reduce((sum, r) => sum + (r.grams_dispensed || 0), 0);
            setLiveTodayGrams(total);
        }
    }, [deviceId]);

    // ─── Realtime subscription ───────────────────────────────────
    useEffect(() => {
        if (!deviceId) return;
        fetchTodayTotal();
        const channel = supabase.channel(`anifeed-live-${deviceId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispense_records', filter: `device_id=eq.${deviceId}` },
                (payload) => {
                    const row = payload.new as any;
                    if (row.status === 'success') {
                        setLiveTodayGrams(prev => (prev ?? 0) + (row.grams_dispensed || 0));
                    }
                    setLiveFlash(true);
                    setTimeout(() => setLiveFlash(false), 600);
                    fetchAll();
                })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [deviceId, fetchAll, fetchTodayTotal]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); }, [fetchAll]);

    // ─── Derived display ─────────────────────────────────────────
    const animalType = deviceInfo?.animalType ?? 'Chicken';
    const housing = deviceInfo?.housingName ?? 'Unassigned';
    const brand = schedule?.feedBrand ?? 'Not set';
    const animalColor = animalType === 'Pig' ? colors.pig : colors.chicken;

    const dailyCapacity = schedule ? schedule.timesPerDay * schedule.gramsPerDispense : 0;
    const feedLevelPercent = liveTodayGrams !== null && dailyCapacity > 0
        ? Math.min(100, Math.round((liveTodayGrams / dailyCapacity) * 100))
        : null;
    const circleRadius = 78;
    const circleCircumference = 2 * Math.PI * circleRadius;
    const progressDash = feedLevelPercent !== null ? (feedLevelPercent / 100) * circleCircumference : 0;
    const progressColor = feedLevelPercent === null ? colors.textGrey
        : feedLevelPercent >= 80 ? colors.primary
        : feedLevelPercent >= 40 ? colors.warning
        : colors.error;

    // ─── Connection toggle ────────────────────────────────────────
    const handleConnectionToggle = () => {
        if (isConnected) {
            setModalType('confirmation');
            setModalTitle('Disconnect AniFeed?');
            setModalMessage('Are you sure you want to disconnect this device from the network? Auto-dispensing may be paused.');
        } else {
            setModalType('confirmation');
            setModalTitle('Connect AniFeed?');
            setModalMessage('Please make sure your AniFeed device is turned on and ready to connect.');
        }
        setModalVisible(true);
    };

    const handleModalConfirm = async () => {
        setModalVisible(false);
        if (modalTitle.includes('Disconnect')) {
            await supabase.from('devices').update({ status: 'offline' }).eq('id', deviceId as string);
            setIsConnected(false);
            setDeviceInfo(prev => prev ? { ...prev, status: 'offline' } : null);
            showSnackbar('AniFeed disconnected.');
        } else if (modalTitle.includes('Connect')) {
            await supabase.from('devices').update({ status: 'online' }).eq('id', deviceId as string);
            setIsConnected(true);
            setDeviceInfo(prev => prev ? { ...prev, status: 'online' } : null);
            showSnackbar('AniFeed connected.');
        }
    };

    // ─── Schedule save ────────────────────────────────────────────
    const handleSaveSchedule = async () => {
        const timesPerDay = parseInt(tempTimesPerDay);
        const gramsPerDispense = parseInt(tempGrams);
        if (isNaN(timesPerDay) || isNaN(gramsPerDispense) || timesPerDay < 1 || gramsPerDispense < 1) {
            showSnackbar('Enter valid numbers for both fields.', 'error');
            return;
        }
        try {
            const payload = {
                device_id: deviceId as string,
                farm_id: farmId,
                animal_type: animalType.toLowerCase(),
                times_per_day: timesPerDay,
                grams_per_dispense: gramsPerDispense,
                adjusted_at: new Date().toISOString(),
            };
            if (schedule?.id) {
                await supabase.from('feed_schedules').update(payload).eq('id', schedule.id);
            } else {
                const { data } = await supabase.from('feed_schedules').insert(payload).select('id').single();
                setSchedule(prev => prev ? { ...prev, id: (data as any)?.id ?? null } : null);
            }
            setSchedule(prev => prev
                ? { ...prev, timesPerDay, gramsPerDispense }
                : { id: null, timesPerDay, gramsPerDispense, feedId: null, feedBrand: brand }
            );
            setScheduleModalVisible(false);
            showSnackbar('Schedule updated.');
        } catch (err) {
            showSnackbar('Failed to save schedule.', 'error');
        }
    };

    // ─── Edit modal ───────────────────────────────────────────────
    const openEditModal = (target: 'Housing' | 'Brand' | 'AnimalType') => {
        setEditTarget(target);
        setEditModalVisible(true);
    };

    const getEditOptions = (): string[] => {
        if (editTarget === 'AnimalType') return ['Pig', 'Chicken'];
        if (editTarget === 'Housing') {
            return farmHousings
                .filter(h => h.animal_type === animalType.toLowerCase())
                .map(h => h.name);
        }
        if (editTarget === 'Brand') {
            const feedsForType = farmFeeds.filter(f => f.animal_type === animalType.toLowerCase());
            return feedsForType.length > 0
                ? feedsForType.map(f => f.brand ? `${f.name} (${f.brand})` : f.name)
                : farmFeeds.map(f => f.brand ? `${f.name} (${f.brand})` : f.name);
        }
        return [];
    };

    const handleEditConfirm = async (val: string) => {
        setEditModalVisible(false);
        try {
            if (editTarget === 'AnimalType') {
                const selectedType = val as 'Pig' | 'Chicken';
                // Unassign housing when animal type changes — user must reassign manually
                await supabase.from('devices').update({ housing_id: null }).eq('id', deviceId as string);
                setDeviceInfo(prev => prev ? { ...prev, housingId: null, housingName: 'Unassigned', animalType: selectedType } : null);
                showSnackbar(`Animal type set to ${selectedType}. Please reassign a housing.`);
            } else if (editTarget === 'Housing') {
                const h = farmHousings.find(h => h.name === val);
                if (!h) return;
                await supabase.from('devices').update({ housing_id: h.id }).eq('id', deviceId as string);
                setDeviceInfo(prev => prev ? { ...prev, housingId: h.id, housingName: h.name, animalType: h.animal_type === 'pig' ? 'Pig' : 'Chicken' } : null);
                showSnackbar('Housing updated.');
            } else if (editTarget === 'Brand') {
                const f = farmFeeds.find(fd => val.startsWith(fd.name));
                if (!f) return;
                if (schedule?.id) {
                    await supabase.from('feed_schedules').update({ feed_id: f.id }).eq('id', schedule.id);
                }
                setSchedule(prev => prev ? { ...prev, feedId: f.id, feedBrand: f.brand ?? f.name } : null);
                showSnackbar('Feed brand updated.');
            }
        } catch {
            showSnackbar(`Failed to update ${editTarget}.`, 'error');
        }
    };

    const getLogIcon = (status: string) => {
        switch (status) {
            case 'error':   return { icon: 'error' as const,        color: colors.error };
            case 'pending': return { icon: 'schedule' as const,     color: colors.warning };
            default:        return { icon: 'check-circle' as const, color: colors.primary };
        }
    };

    return (
        <SafeAreaView style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={anifeedStyles.header}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                </View>
                <View style={anifeedStyles.headerActions}>
                    <TouchableOpacity
                        style={{
                            height: 44,
                            paddingHorizontal: 16,
                            borderRadius: 22,
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onPress={() => router.push('/(devices)/ManageFeedsScreen' as any)}
                        activeOpacity={0.8}
                    >
                        <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 13 }]}>Manage Feeds</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[anifeedStyles.actionButton, { backgroundColor: isConnected ? colors.primary + '1A' : colors.surface, borderWidth: isConnected ? 0 : 1.5, borderColor: isConnected ? 'transparent' : colors.stroke }]}
                        onPress={handleConnectionToggle}
                    >
                        <MaterialIcons name={isConnected ? 'cloud-done' : 'cloud-off'} size={20} color={isConnected ? colors.primary : colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[anifeedStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke }]}
                        onPress={() => router.push('/(devices)/DeviceSettingsScreen?type=AniFeed')}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="settings" size={20} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={anifeedStyles.contentContainer} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                    {/* Title Section */}
                    <View style={anifeedStyles.titleSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                                <MaterialIcons name="grain" size={12} color={colors.secondary} />
                                <Text style={[textStyles.label, { color: colors.secondary, fontSize: 10, marginLeft: 4 }]}>AniFeed</Text>
                            </View>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 13 }]}>{getFormattedDate()}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 28, flex: 1, marginRight: 10 }]} numberOfLines={1} adjustsFontSizeToFit>{deviceInfo?.name ?? 'AniFeed Unit'}</Text>
                            <View style={[anifeedStyles.connectionBadge, { backgroundColor: isConnected ? colors.primary + '1A' : colors.error + '1A', flexShrink: 0 }]}>
                                <View style={[anifeedStyles.connectionDot, { backgroundColor: isConnected ? colors.primary : colors.error }]} />
                                <Text style={[textStyles.label, { color: isConnected ? colors.primary : colors.error, fontSize: 12, marginLeft: 6 }]}>
                                    {isConnected ? 'Online' : 'Offline'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                            <View style={[anifeedStyles.tagsContainer, { marginTop: 0 }]}>
                                <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: animalColor + '1A', paddingRight: 6 }]} onPress={() => openEditModal('AnimalType')}>
                                    <AnimalIcon type={animalType as any} size={14} color={animalColor} />
                                    <Text style={[textStyles.label, { color: animalColor, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{animalType}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={animalColor} />
                                </TouchableOpacity>
                                <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: colors.info + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Housing')}>
                                    <MaterialIcons name="home" size={14} color={colors.info} />
                                    <Text style={[textStyles.label, { color: colors.info, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{housing}</Text>
                                    <MaterialIcons name="arrow-drop-down" size={16} color={colors.info} />
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>

                    {/* Start Simulation Button */}
                    {(() => {
                        const canSimulate = !!deviceInfo?.housingId && deviceInfo?.housingName !== 'Unassigned';
                        return (
                            <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
                                <TouchableOpacity
                                    activeOpacity={canSimulate ? 0.8 : 1}
                                    disabled={!canSimulate}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        paddingVertical: 13,
                                        borderRadius: 16,
                                        backgroundColor: canSimulate ? colors.secondary : colors.cardFill,
                                        borderWidth: canSimulate ? 0 : 1,
                                        borderColor: colors.stroke,
                                        opacity: canSimulate ? 1 : 0.55,
                                    }}
                                >
                                    <MaterialIcons name="play-circle-filled" size={20} color={canSimulate ? colors.onPrimary : colors.textGrey} />
                                    <Text style={[textStyles.btnLabel, { color: canSimulate ? colors.onPrimary : colors.textGrey, fontSize: 14 }]}>
                                        Start Simulation
                                    </Text>
                                </TouchableOpacity>
                                {!canSimulate && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, textAlign: 'center', marginTop: 6 }]}>
                                        Assign an animal type and housing to enable simulation.
                                    </Text>
                                )}
                            </View>
                        );
                    })()}

                    {/* Feed Level (IoT placeholder) */}
                    <View style={anifeedStyles.liveSection}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 18 }]}>Current Feed Level</Text>
                        </View>
                        <View style={[anifeedStyles.liveCard, { backgroundColor: colors.surface, borderColor: liveFlash ? progressColor : colors.stroke, borderWidth: liveFlash ? 2 : 1 }]}>
                            <View style={anifeedStyles.liveScaleCircle}>
                                <Svg width={180} height={180} style={{ position: 'absolute' }} viewBox="0 0 180 180">
                                    {/* Track */}
                                    <Circle cx={90} cy={90} r={circleRadius} stroke={colors.stroke} strokeWidth={6} fill="none" />
                                    {/* Progress arc */}
                                    {feedLevelPercent !== null && (
                                        <Circle
                                            cx={90} cy={90} r={circleRadius}
                                            stroke={progressColor}
                                            strokeWidth={6}
                                            fill="none"
                                            strokeDasharray={circleCircumference}
                                            strokeDashoffset={circleCircumference - progressDash}
                                            strokeLinecap="round"
                                            transform="rotate(-90 90 90)"
                                        />
                                    )}
                                </Svg>
                                <View style={anifeedStyles.liveScaleInnerCircle}>
                                    {feedLevelPercent !== null ? (
                                        <>
                                            <MaterialIcons name="grain" size={24} color={progressColor} />
                                            <Text style={[textStyles.h1, { color: progressColor, fontSize: 28, marginTop: 2 }]}>
                                                {feedLevelPercent}%
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 10, textAlign: 'center' }]}>
                                                today's target
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <MaterialIcons name="sensors-off" size={32} color={colors.textGrey} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 6, textAlign: 'center' }]}>
                                                Live data{'\n'}pending
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </View>

                            <View style={anifeedStyles.liveStatsContainer}>
                                <View style={anifeedStyles.liveStatItem}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Today</Text>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 13, marginTop: 4 }]} numberOfLines={2}>
                                        {liveTodayGrams !== null ? `${liveTodayGrams}g` : '—'}
                                        {dailyCapacity > 0 ? `\n/ ${dailyCapacity}g` : ''}
                                    </Text>
                                </View>
                                <View style={[anifeedStyles.liveStatDivider, { backgroundColor: colors.stroke }]} />
                                <TouchableOpacity style={anifeedStyles.liveStatItem} onPress={() => openEditModal('Brand')}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Brand</Text>
                                        <MaterialIcons name="edit" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 13, marginTop: 4 }]} numberOfLines={1}>{brand}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Dispense Schedule */}
                    <View style={[anifeedStyles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                        <View style={anifeedStyles.statsHeader}>
                            <View>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>Dispense Schedule</Text>
                                {schedule ? (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                        {schedule.timesPerDay}× per day · {schedule.gramsPerDispense}g each
                                    </Text>
                                ) : (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>No schedule set</Text>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => {
                                if (schedule) {
                                    setTempTimesPerDay(String(schedule.timesPerDay));
                                    setTempGrams(String(schedule.gramsPerDispense));
                                }
                                setScheduleModalVisible(true);
                            }} style={{ padding: 4 }}>
                                <MaterialIcons name="edit" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        </View>

                        {schedule ? (
                            <>
                                <View style={[anifeedStyles.statsRow, { borderBottomWidth: 0 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <MaterialIcons name="repeat" size={18} color={colors.textGrey} style={{ marginRight: 8 }} />
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>Frequency</Text>
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{schedule.timesPerDay}× / day</Text>
                                </View>
                                <View style={[anifeedStyles.statsRow, { borderBottomWidth: 0 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <MaterialIcons name="line-weight" size={18} color={colors.textGrey} style={{ marginRight: 8 }} />
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>Per dispense</Text>
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{schedule.gramsPerDispense}g</Text>
                                </View>
                            </>
                        ) : (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, paddingVertical: 8 }]}>
                                Tap the edit button to set up a dispense schedule.
                            </Text>
                        )}

                        <TouchableOpacity
                            style={[anifeedStyles.recordsLink, { borderTopColor: colors.stroke, marginTop: 16, marginHorizontal: -20, marginBottom: -20 }]}
                            activeOpacity={0.7}
                            onPress={() => router.push(`/(devices)/DispenseRecordsScreen?deviceId=${deviceId}` as any)}
                        >
                            <Text style={[textStyles.label, { color: colors.primary }]}>View All Dispense Records</Text>
                            <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    {/* AI Feed Recommendations */}
                    <AIInsightCard
                        title="AI Feed Recommendations"
                        context={{
                            type: 'feed',
                            animalType: deviceInfo?.animalType ?? 'livestock',
                            housingName: deviceInfo?.housingName ?? '',
                            data: {
                                feedBrand: schedule?.feedBrand ?? null,
                                timesPerDay: schedule?.timesPerDay ?? null,
                                gramsPerDispense: schedule?.gramsPerDispense ?? null,
                                todayTotalGrams: liveTodayGrams ?? null,
                                recentDispenses: dispenseLogs.slice(0, 5).map(l => ({
                                    amountGrams: l.amountGrams,
                                    status: l.status,
                                    time: new Date(l.timestamp).toISOString(),
                                })),
                            },
                        }}
                    />

                    {/* Recent Logs */}
                    <View style={anifeedStyles.logsSection}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 12 }]}>Recent Logs</Text>
                        {dispenseLogs.length === 0 ? (
                            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                <MaterialIcons name="history" size={32} color={colors.textGrey} />
                                <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>No dispense events recorded yet.</Text>
                            </View>
                        ) : (
                            dispenseLogs.slice(0, 3).map((log, index) => {
                                const statusColor = log.status === 'error' ? colors.error : log.status === 'pending' ? colors.warning : colors.primary;
                                const statusIcon: any = log.status === 'error' ? 'error-outline' : log.status === 'pending' ? 'schedule' : 'check-circle';
                                const statusLabel = log.status === 'error' ? 'Failed' : log.status === 'pending' ? 'Pending' : 'Success';
                                return (
                                    <View
                                        key={log.id ?? index}
                                        style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, marginBottom: 10, overflow: 'hidden', flexDirection: 'row' }}
                                    >
                                        {/* Left accent strip */}
                                        <View style={{ width: 4, backgroundColor: statusColor }} />

                                        {/* Card content */}
                                        <View style={{ flex: 1, padding: 12 }}>
                                            {/* Top row */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                <View style={{ flex: 1, marginRight: 12 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                                        <MaterialIcons name="home" size={13} color={colors.textGrey} />
                                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginLeft: 3 }]} numberOfLines={1}>{log.housingName}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: statusColor + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                                        <MaterialIcons name={statusIcon} size={11} color={statusColor} />
                                                        <Text style={[textStyles.label, { color: statusColor, fontSize: 11, marginLeft: 3, fontWeight: '700' }]}>{statusLabel}</Text>
                                                    </View>
                                                </View>
                                                {/* Amount — prominent right */}
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 24, lineHeight: 28 }]}>{log.amount}</Text>
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>dispensed</Text>
                                                </View>
                                            </View>

                                            {/* Bottom chip */}
                                            <View style={{ flexDirection: 'row', gap: 6 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardFill, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                                                    <MaterialIcons name="access-time" size={11} color={colors.textGrey} />
                                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginLeft: 3 }]}>{formatLogTime(log.timestamp)}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        {/* View All link */}
                        {dispenseLogs.length > 0 && (
                            <TouchableOpacity
                                onPress={() => router.push(`/(devices)/DispenseRecordsScreen?deviceId=${deviceId}` as any)}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                    paddingVertical: 12, marginTop: 2,
                                    borderWidth: 1, borderColor: colors.stroke,
                                    borderRadius: 12, backgroundColor: colors.surface,
                                }}
                            >
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 13 }]}>View All Logs</Text>
                                <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
                            </TouchableOpacity>
                        )}

                    </View>

                </ScrollView>
            )}

            {/* Connection confirm modal */}
            <ActionModal
                visible={modalVisible}
                type={modalType}
                title={modalTitle}
                message={modalMessage}
                confirmText={modalTitle.includes('Disconnect') ? 'Disconnect' : 'Connect'}
                cancelText="Cancel"
                onConfirm={handleModalConfirm}
                onCancel={() => setModalVisible(false)}
            />

            {/* Schedule modal */}
            <Modal visible={scheduleModalVisible} transparent animationType="fade">
                <View style={[anifeedStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                    <View style={[anifeedStyles.modalContent, { backgroundColor: colors.surface, maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }]}>
                        <View style={[anifeedStyles.iconContainer, { backgroundColor: colors.primary + '1A' }]}>
                            <MaterialIcons name="edit-calendar" size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Edit Schedule</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Set how many times per day to dispense and how much feed per dispense.
                        </Text>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Times per day"
                                icon="repeat"
                                value={tempTimesPerDay}
                                onChangeText={t => setTempTimesPerDay(t.replace(/[^0-9]/g, ''))}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>
                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput
                                label="Grams per dispense"
                                icon="line-weight"
                                value={tempGrams}
                                onChangeText={t => setTempGrams(t.replace(/[^0-9]/g, ''))}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={[anifeedStyles.actionContainer, { width: '100%' }]}>
                            <TouchableOpacity
                                style={[anifeedStyles.btn, { backgroundColor: colors.cardFill }]}
                                onPress={() => setScheduleModalVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[anifeedStyles.btn, { backgroundColor: colors.primary, opacity: (tempTimesPerDay && tempGrams) ? 1 : 0.5 }]}
                                onPress={handleSaveSchedule}
                                activeOpacity={0.7}
                                disabled={!(tempTimesPerDay && tempGrams)}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Edit Housing / Brand / AnimalType modal */}
            {editTarget && (
                <SelectionModal
                    visible={editModalVisible}
                    onClose={() => setEditModalVisible(false)}
                    onSelect={handleEditConfirm}
                    title={editTarget === 'AnimalType' ? 'Animal Type' : `Edit ${editTarget}`}
                    description={
                        editTarget === 'AnimalType'
                            ? 'Select the animal type for this feeder.'
                            : `Select a new ${editTarget.toLowerCase()} for this device.`
                    }
                    icon="edit"
                    options={getEditOptions()}
                    selectedValue={
                        editTarget === 'Housing' ? housing
                        : editTarget === 'AnimalType' ? animalType
                        : brand
                    }
                    enableSearch={editTarget !== 'AnimalType'}
                />
            )}

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

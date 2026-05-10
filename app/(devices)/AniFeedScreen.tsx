import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useAuth } from '@/context/AuthContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniFeedStyles } from '@/styles/anifeedStyles';
import { AnimalIcon } from '@/components/AnimalIcon';

// Mock Types
interface AniFeedSettings {
    brand: string;
    animalType: string;
    weightClass: string;
    housing: string;
}

interface FeedSchedule {
    id: string;
    time: string;
    amount: string;
}

interface DispenseLogEntry {
    id: string;
    status: 'success' | 'error' | 'pending';
    amount: string;
    timestamp: number;
}

interface RegisteredDevice {
    id: string;
    name: string;
    status: 'online' | 'offline';
}

export default function AniFeedScreen() {
    const { systemConfig, profile } = useAuth();
    const farmId = profile?.farmId || '';
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
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    // Device States
    const [isConnected, setIsConnected] = useState(true);
    const [deviceInfo, setDeviceInfo] = useState<RegisteredDevice | null>({
        id: (deviceId as string) || 'unit-01',
        name: 'AniFeed Unit 01',
        status: 'online'
    });
    const [settings, setSettings] = useState<AniFeedSettings | null>({
        brand: 'Premium Grower',
        animalType: 'Pig',
        weightClass: 'Normal',
        housing: 'Pig Housing 1'
    });

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('info');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');

    // Edit Settings Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Brand' | 'Animal Type' | 'Weight Class' | 'Housing' | null>(null);
    const [editValue, setEditValue] = useState('');

    // Schedule Settings State
    const [scheduleSettingsVisible, setScheduleSettingsVisible] = useState(false);
    const [tempTime, setTempTime] = useState('');
    const [tempAmount, setTempAmount] = useState('');
    const [schedules, setSchedules] = useState<FeedSchedule[]>([
        { id: '1', time: '06:00 AM', amount: '500g' },
        { id: '2', time: '12:00 PM', amount: '500g' },
        { id: '3', time: '06:00 PM', amount: '500g' },
    ]);
    const [dispenseLogs, setDispenseLogs] = useState<DispenseLogEntry[]>([
        { id: 'l1', status: 'success', amount: '500g', timestamp: Date.now() - 3600000 },
        { id: 'l2', status: 'success', amount: '500g', timestamp: Date.now() - 86400000 },
    ]);

    useEffect(() => {
        // Mocking subscriptions
        return () => {};
    }, [deviceId, farmId]);

    // Format utility
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
            case 'error': return { icon: 'error' as const, color: colors.error };
            case 'pending': return { icon: 'schedule' as const, color: colors.warning };
            default: return { icon: 'check-circle' as const, color: colors.primary };
        }
    };

    // Fallback values if settings not yet initialized
    const brand = settings?.brand || 'Premium Grower';
    const animalType = settings?.animalType || 'Pig';
    const weightClass = settings?.weightClass || 'Normal';
    const housing = settings?.housing || 'Unassigned';

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const openEditModal = (target: 'Brand' | 'Animal Type' | 'Weight Class' | 'Housing', currentValue: string) => {
        setEditTarget(target);
        setEditValue(currentValue);
        setEditModalVisible(true);
    };

    const handleEditConfirmClick = async (val: string = editValue) => {
        setEditValue(val);
        setEditModalVisible(false);
        try {
            if (deviceId) {
                const updates: Partial<AniFeedSettings> = {};
                if (editTarget === 'Brand') updates.brand = val;
                if (editTarget === 'Animal Type') updates.animalType = val;
                if (editTarget === 'Weight Class') updates.weightClass = val;
                if (editTarget === 'Housing') updates.housing = val;
                
                // Mock update settings
                setSettings(prev => prev ? { ...prev, ...updates } : null);
                
                showSnackbar(`${editTarget} updated successfully.`);
            }
        } catch (e) {
            showSnackbar(`Failed to update ${editTarget}.`, 'error');
        }
    };

    const openScheduleSettings = () => {
        setScheduleSettingsVisible(true);
    };

    const handleSaveSchedule = async () => {
        if (tempTime && tempAmount && deviceId) {
            const formattedTime = tempTime.trim();
            const timeExists = schedules.some(s => s.time === formattedTime);
            
            if (timeExists) {
                showSnackbar(`Schedule at ${formattedTime} already exists.`, 'error');
                return;
            }

            try {
                // Mock add schedule
                const newSchedule: FeedSchedule = {
                    id: Math.random().toString(),
                    time: formattedTime,
                    amount: `${tempAmount.trim()}g`
                };
                setSchedules(prev => [...prev, newSchedule].sort((a, b) => a.time.localeCompare(b.time)));
                
                setTempTime('');
                setTempAmount('');
                setScheduleSettingsVisible(false);
                showSnackbar('Schedule added successfully.');
            } catch (e) {
                showSnackbar('Failed to add schedule.', 'error');
            }
        }
    };

    const removeSchedule = async (id?: string) => {
        if (!deviceId || !id) return;
        try {
            // Mock remove schedule
            setSchedules(prev => prev.filter(s => s.id !== id));
            showSnackbar('Schedule removed.');
        } catch (e) {
            showSnackbar('Failed to remove schedule.', 'error');
        }
    };

    const handleTimeChange = (text: string) => {
        setTempTime(text.replace(/[^0-9:\sAPM]/gi, '')); // only numbers, colon, space, A, P, M
    };

    const handleAmountChange = (text: string) => {
        setTempAmount(text.replace(/[^0-9]/g, '')); // strictly numbers only
    };

    const handleConnectionToggle = () => {
        if (isConnected) {
            setModalType('confirmation');
            setModalTitle('Disconnect AniFeed?');
            setModalMessage('Are you sure you want to disconnect this device from the network? Auto-dispensing may be paused.');
            setModalVisible(true);
        } else {
            setModalType('confirmation');
            setModalTitle('Connect AniFeed?');
            setModalMessage('Please make sure your AniFeed device is turned on and ready to connect to the network before proceeding.');
            setModalVisible(true);
        }
    };

    const handleModalConfirm = () => {
        if (modalType === 'confirmation') {
            if (modalTitle.includes('Disconnect')) {
                setIsConnected(false);
                showSnackbar('AniFeed disconnected from App View.');
            } else if (modalTitle.includes('Connect')) {
                setIsConnected(true);
                showSnackbar('AniFeed connected to App View.');
            }
        }
        setModalVisible(false);
    };

    const getFormattedDate = () => {
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    };

    const feedLevel = 89; // Percentage
    const statusColor = feedLevel > 20 ? colors.primary : colors.error;

    // Circle calculation
    const circleRadius = 78;
    const circleCircumference = 2 * Math.PI * circleRadius;
    const strokeDashoffset = circleCircumference - (feedLevel / 100) * circleCircumference;

    const animalColor = animalType === 'Pig' ? colors.pig : colors.chicken;

    const getEditOptions = () => {
        switch (editTarget) {
            case 'Brand': return ['Starter Mash', 'Grower Pellets', 'Finisher Pellets', 'Premium Mix', 'Organic Mix', 'Custom Mix A', 'Custom Mix B'];
            case 'Animal Type': return ['Pig', 'Chicken'];
            case 'Weight Class': return ['Underweight', 'Normal', 'Overweight'];
            case 'Housing': return animalType === 'Pig' ? ['Pig Housing 1', 'Pig Housing 2', 'Pig Housing 3', 'Pig Housing 4', 'Pig Housing 5', 'Pig Housing 6', 'Pig Housing 7', 'Pig Housing 8', 'Isolation Pen'] : ['Chicken Coop A', 'Chicken Coop B', 'Chicken Coop C', 'Chicken Coop D', 'Chicken Coop E', 'Chicken Coop F', 'Chicken Coop G', 'Brooder', 'Isolation Coop'];
            default: return [];
        }
    };

    return (
        <SafeAreaView style={[anifeedStyles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={anifeedStyles.header}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <View style={anifeedStyles.headerActions}>
                    <TouchableOpacity
                        style={[
                            anifeedStyles.actionButton,
                            {
                                backgroundColor: isConnected ? colors.primary + '1A' : colors.surface,
                                borderWidth: isConnected ? 0 : 1.5,
                                borderColor: isConnected ? 'transparent' : colors.stroke
                            }
                        ]}
                        onPress={handleConnectionToggle}
                    >
                        <MaterialIcons
                            name={isConnected ? "cloud-done" : "cloud-off"}
                            size={20}
                            color={isConnected ? colors.primary : colors.textGrey}
                        />
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

            <ScrollView contentContainerStyle={anifeedStyles.contentContainer} showsVerticalScrollIndicator={false}>

                {/* Title Section (Date, Name, Batch details) */}
                <View style={anifeedStyles.titleSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                            <MaterialIcons name="grain" size={12} color={colors.secondary} />
                            <Text style={[textStyles.label, { color: colors.secondary, fontSize: 10, marginLeft: 4 }]}>AniFeed</Text>
                        </View>
                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 13 }]}>{getFormattedDate()}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 28 }]}>{deviceInfo?.name || 'AniFeed Unit'}</Text>
                        <View style={[anifeedStyles.connectionBadge, { backgroundColor: isConnected ? colors.primary + '1A' : colors.error + '1A' }]}>
                            <View style={[anifeedStyles.connectionDot, { backgroundColor: isConnected ? colors.primary : colors.error }]} />
                            <Text style={[textStyles.label, { color: isConnected ? colors.primary : colors.error, fontSize: 12, marginLeft: 6 }]}>
                                {isConnected ? 'Online' : 'Offline'}
                            </Text>
                        </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                        <View style={[anifeedStyles.tagsContainer, { marginTop: 0 }]}>
                            <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: animalColor + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Animal Type', animalType)}>
                                <AnimalIcon type={animalType as any} size={14} color={animalColor} />
                                <Text style={[textStyles.label, { color: animalColor, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{animalType}</Text>
                                <MaterialIcons name="arrow-drop-down" size={16} color={animalColor} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: colors.primary + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Weight Class', weightClass)}>
                                <MaterialIcons name="line-weight" size={14} color={colors.primary} />
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{weightClass}</Text>
                                <MaterialIcons name="arrow-drop-down" size={16} color={colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[anifeedStyles.tag, { backgroundColor: colors.info + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Housing', housing)}>
                                <MaterialIcons name="home" size={14} color={colors.info} />
                                <Text style={[textStyles.label, { color: colors.info, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{housing}</Text>
                                <MaterialIcons name="arrow-drop-down" size={16} color={colors.info} />
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>

                {/* Live Feed Level View */}
                <View style={anifeedStyles.liveSection}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 18 }]}>Current Feed Level</Text>
                    </View>
                    <View style={[anifeedStyles.liveCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>

                        <View style={anifeedStyles.liveScaleCircle}>
                            <Svg width={180} height={180} style={{ position: 'absolute' }}>
                                <Circle
                                    cx={90}
                                    cy={90}
                                    r={circleRadius}
                                    stroke={colors.stroke}
                                    strokeWidth={6}
                                    fill="none"
                                />
                                {isConnected && (
                                    <Circle
                                        cx={90}
                                        cy={90}
                                        r={circleRadius}
                                        stroke={statusColor}
                                        strokeWidth={6}
                                        fill="none"
                                        strokeDasharray={circleCircumference}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        transform="rotate(-90, 90, 90)"
                                    />
                                )}
                            </Svg>
                            <View style={anifeedStyles.liveScaleInnerCircle}>
                                {isConnected ? (
                                    <>
                                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 48, lineHeight: 56 }]}>
                                            {feedLevel}%
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey }]}>Full</Text>
                                    </>
                                ) : (
                                    <Text style={[textStyles.body, { color: colors.textGrey }]}>Offline</Text>
                                )}
                            </View>
                        </View>

                        <View style={anifeedStyles.liveStatsContainer}>
                            <View style={anifeedStyles.liveStatItem}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Refilled</Text>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 14, marginTop: 4 }]}>Oct 24, 2023</Text>
                            </View>
                            <View style={[anifeedStyles.liveStatDivider, { backgroundColor: colors.stroke }]} />
                            <TouchableOpacity style={anifeedStyles.liveStatItem} onPress={() => openEditModal('Brand', brand)}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Brand</Text>
                                    <MaterialIcons name="edit" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 14, marginTop: 4 }]} numberOfLines={1}>{brand}</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </View>

                {/* Dispense Details */}
                <View style={[anifeedStyles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                    <View style={anifeedStyles.statsHeader}>
                        <View>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>Dispense Schedule</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Last dispensed: Today, 08:00 AM (500g)</Text>
                        </View>
                        <TouchableOpacity onPress={openScheduleSettings} style={{ padding: 4 }}>
                            <MaterialIcons name="edit" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    {schedules.map((schedule, idx) => (
                        <View key={schedule.id} style={[anifeedStyles.statsRow, idx === schedules.length - 1 && { borderBottomWidth: 0 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="schedule" size={18} color={colors.textGrey} style={{ marginRight: 8 }} />
                                <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{schedule.time}</Text>
                            </View>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{schedule.amount}</Text>
                        </View>
                    ))}
                    {schedules.length === 0 && (
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, paddingVertical: 8 }]}>No dispense schedule set.</Text>
                    )}

                    {/* Link to Dispense Records Page */}
                    <TouchableOpacity
                        style={[anifeedStyles.recordsLink, { borderTopColor: colors.stroke, marginTop: 16, marginHorizontal: -20, marginBottom: -20 }]}
                        activeOpacity={0.7}
                        onPress={() => router.push(`/(devices)/DispenseRecordsScreen?deviceId=${deviceId}` as any)}
                    >
                        <Text style={[textStyles.label, { color: colors.primary }]}>View All Dispense Records</Text>
                        <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Device Logs */}
                <View style={anifeedStyles.logsSection}>
                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 16 }]}>Recent Logs</Text>
                    {dispenseLogs.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                            <MaterialIcons name="history" size={32} color={colors.textGrey} />
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>No dispense events recorded yet.</Text>
                        </View>
                    ) : (
                        dispenseLogs.slice(0, 4).map((log, index) => {
                            const { icon, color } = getLogIcon(log.status);
                            return (
                                <View key={log.id || index} style={anifeedStyles.logItem}>
                                    <View style={[anifeedStyles.logIcon, { backgroundColor: color + '1A' }]}>
                                        <MaterialIcons name={icon} size={16} color={color} />
                                    </View>
                                    <View style={anifeedStyles.logContent}>
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>
                                            {log.status === 'error' ? `Failed to dispense ${log.amount}.` : 
                                             log.status === 'pending' ? `Dispensing ${log.amount}...` :
                                             `Successfully dispensed ${log.amount} of feed.`}
                                        </Text>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>{formatLogTime(log.timestamp)}</Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

            </ScrollView>

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

            {/* Schedule Settings Modal */}
            <Modal visible={scheduleSettingsVisible} transparent animationType="fade">
                <View style={[anifeedStyles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]}>
                    <View style={[anifeedStyles.modalContent, { backgroundColor: colors.surface, maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }]}>

                        <View style={[anifeedStyles.iconContainer, { backgroundColor: colors.primary + '1A' }]}>
                            <MaterialIcons name="edit-calendar" size={32} color={colors.primary} />
                        </View>

                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Manage Schedule</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>Add or remove daily feed dispense times.</Text>

                        <ScrollView style={{ width: '100%', maxHeight: 150, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
                            {schedules.map((schedule) => (
                                <View key={schedule.id} style={anifeedStyles.dispenseTimeRow}>
                                    <View>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{schedule.time}</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{schedule.amount}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => removeSchedule(schedule.id)}>
                                        <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Time (e.g. 05:00 PM)"
                                icon="schedule"
                                value={tempTime}
                                onChangeText={handleTimeChange}
                                backgroundColor={colors.surface}
                            />
                        </View>
                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput
                                label="Amount (e.g. 500)"
                                icon="line-weight"
                                value={tempAmount}
                                onChangeText={handleAmountChange}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        {/* Actions - Side by Side */}
                        <View style={[anifeedStyles.actionContainer, { width: '100%' }]}>
                            <TouchableOpacity
                                style={[anifeedStyles.btn, { backgroundColor: colors.cardFill }]}
                                onPress={() => setScheduleSettingsVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Close</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[anifeedStyles.btn, { backgroundColor: colors.primary, opacity: (tempTime && tempAmount) ? 1 : 0.5 }]}
                                onPress={handleSaveSchedule}
                                activeOpacity={0.7}
                                disabled={!(tempTime && tempAmount)}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Edit Field Modal */}
            {editTarget && (
                <SelectionModal
                    visible={editModalVisible}
                    onClose={() => setEditModalVisible(false)}
                    onSelect={(val) => handleEditConfirmClick(val)}
                    title={`Edit ${editTarget}`}
                    description={`Change the value for ${editTarget}.`}
                    icon="edit"
                    options={getEditOptions()}
                    selectedValue={editTarget === 'Animal Type' ? animalType : editTarget === 'Weight Class' ? weightClass : editTarget === 'Housing' ? housing : brand}
                    enableSearch={editTarget === 'Housing' || editTarget === 'Brand'}
                />
            )}

            {/* Snackbar Overlay */}
            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

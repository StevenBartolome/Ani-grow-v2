import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniWeighStyles } from '@/styles/aniweighStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { AnimalIcon } from '@/components/AnimalIcon';

// Mock Types
interface LiveWeight {
    weight_g: number;
    weight_oz: number;
    timestamp: number;
}

interface WeighLogEntry {
    id: string;
    weight_g: number;
    status: 'underweight' | 'normal' | 'overweight';
    timestamp: number;
    animal: string;
    unit: 'kg' | 'g';
}

interface SegregationStats {
    total: number;
    underweight: { count: number; percentage: number };
    normal: { count: number; percentage: number };
    overweight: { count: number; percentage: number };
}

const STALE_TIMEOUT_MS = 10_000; // 10 seconds to consider device offline

export default function AniWeighScreen() {
    const { systemConfig, profile } = useAuth();
    const farmId = profile?.farmId || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const aniweighStyles = useAniWeighStyles();
    const devicesStyles = useDevicesStyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ deviceId?: string }>();
    const deviceId = params.deviceId || 'aniweigh_01';

    if (systemConfig?.featureFlags && !systemConfig.featureFlags.weighingEnabled) {
        return (
            <SafeAreaView style={[aniweighStyles.safeArea, { backgroundColor: colors.bgLight, justifyContent: 'center', alignItems: 'center' }]}>
                <MaterialIcons name="block" size={64} color={colors.textGrey} />
                <Text style={[textStyles.h2, { color: colors.text, marginTop: 20 }]}>Weighing Module Disabled</Text>
                <Text style={[textStyles.body, { textAlign: 'center', marginTop: 10, color: colors.textGrey, paddingHorizontal: 40 }]}>
                    This feature is currently disabled by the system administrator.
                </Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 30, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    // Device info
    const [deviceName, setDeviceName] = useState('AniWeigh');

    const [animalType, setAnimalType] = useState('Chicken');
    const [housing, setHousing] = useState('Chicken Coop A');
    const isPigMode = animalType === 'Pig';
    const [statsExpanded, setStatsExpanded] = useState(false);
    const [isKg, setIsKg] = useState(true);

    // ─── Live Weight State ───────────────────────────────────────────
    const [liveWeight, setLiveWeight] = useState<LiveWeight | null>({ weight_g: 1250, weight_oz: 44.1, timestamp: Date.now() });
    const [isConnected, setIsConnected] = useState(true);
    const [lastDataTime, setLastDataTime] = useState<number>(Date.now());
    const lastRecordedWeight = useRef<number | null>(null);
    const lastReportedDeviceStatus = useRef<'online' | 'offline' | null>('online');

    // ─── Weight Logs State ───────────────────────────────────────────
    const [weightLogs, setWeightLogs] = useState<WeighLogEntry[]>([
        { id: 'w1', weight_g: 1250, status: 'normal', timestamp: Date.now() - 3600000, animal: 'Chicken', unit: 'kg' },
        { id: 'w2', weight_g: 750, status: 'underweight', timestamp: Date.now() - 7200000, animal: 'Chicken', unit: 'kg' },
        { id: 'w3', weight_g: 1600, status: 'overweight', timestamp: Date.now() - 10800000, animal: 'Chicken', unit: 'kg' },
    ]);
    const [segregationStats, setSegregationStats] = useState<SegregationStats>({
        total: 3,
        underweight: { count: 1, percentage: 33 },
        normal: { count: 1, percentage: 33 },
        overweight: { count: 1, percentage: 34 },
    });

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('info');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');

    // Edit Settings Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Animal Type' | 'Housing' | null>(null);
    const [editValue, setEditValue] = useState('');

    const openEditModal = (target: 'Animal Type' | 'Housing', currentValue: string) => {
        setEditTarget(target);
        setEditValue(currentValue);
        setEditModalVisible(true);
    };

    const handleEditConfirmClick = (val: string = editValue) => {
        setEditValue(val);
        setEditModalVisible(false);
        setModalType('confirmation');
        setModalTitle(`Update ${editTarget}?`);
        setModalMessage(`Are you sure you want to update the ${editTarget} to "${val}"?`);
        setModalVisible(true);
    };

    const [rangeSettingsVisible, setRangeSettingsVisible] = useState(false);
    const [currentUnderweight, setCurrentUnderweight] = useState('0.8');
    const [currentOverweight, setCurrentOverweight] = useState('1.5');
    const [rangeUnit, setRangeUnit] = useState<'kg' | 'g'>('kg');
    
    // Temp states for Modal
    const [tempUnderweight, setTempUnderweight] = useState('0.8');
    const [tempOverweight, setTempOverweight] = useState('1.5');
    const [tempRangeUnit, setTempRangeUnit] = useState<'kg' | 'g'>('kg');

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const openRangeSettings = () => {
        setTempUnderweight(currentUnderweight);
        setTempOverweight(currentOverweight);
        setTempRangeUnit(rangeUnit);
        setRangeSettingsVisible(true);
    };

    const handleSaveRanges = async () => {
        setCurrentUnderweight(tempUnderweight);
        setCurrentOverweight(tempOverweight);
        setRangeUnit(tempRangeUnit);
        setRangeSettingsVisible(false);
        
        showSnackbar(`Weight range updated (${tempRangeUnit}).`);
    };

    // ─── Subscriptions (Mocked) ──────────────────────────
    useEffect(() => {
        // Mock data updates
        return () => {};
    }, [deviceId, farmId]);

    const handleConnectionToggle = () => {
        if (isConnected) {
            setModalType('confirmation');
            setModalTitle('Disconnect AniWeigh?');
            setModalMessage('Are you sure you want to disconnect this device from the network? Live data will be paused.');
            setModalVisible(true);
        } else {
            setModalType('confirmation');
            setModalTitle('Connect AniWeigh?');
            setModalMessage('Please make sure your AniWeigh device is turned on and ready to connect to the network before proceeding.');
            setModalVisible(true);
        }
    };

    const handleModalConfirm = () => {
        if (modalType === 'confirmation') {
            if (modalTitle.includes('Disconnect')) {
                setIsConnected(false);
                lastReportedDeviceStatus.current = 'offline';
                showSnackbar('AniWeigh disconnected successfully.');
            } else if (modalTitle.includes('Connect')) {
                setIsConnected(true);
                lastReportedDeviceStatus.current = 'online';
                showSnackbar('AniWeigh connected successfully.');
            } else if (modalTitle.includes('Update')) {
                if (editTarget === 'Animal Type') setAnimalType(editValue);
                if (editTarget === 'Housing') setHousing(editValue);
                showSnackbar(`${editTarget} updated successfully.`);
            }
        }
        setModalVisible(false);
    };

    const getFormattedDate = () => {
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    };

    const animalColor = animalType === 'Pig' ? colors.pig : colors.chicken;

    const getEditOptions = () => {
        switch (editTarget) {
            case 'Animal Type': return ['Pig', 'Chicken'];
            case 'Housing': return animalType === 'Pig' ? ['Pig Housing 1', 'Pig Housing 2', 'Pig Housing 3', 'Pig Housing 4', 'Pig Housing 5', 'Pig Housing 6', 'Pig Housing 7', 'Pig Housing 8', 'Isolation Pen'] : ['Chicken Coop A', 'Chicken Coop B', 'Chicken Coop C', 'Chicken Coop D', 'Chicken Coop E'];
            default: return [];
        }
    };

    // ─── Derived display values ──────────────────────────────────────
    const liveWeightKg = liveWeight ? liveWeight.weight_g / 1000 : 0;
    const liveWeightDisplay = isKg
        ? liveWeightKg.toFixed(1)
        : (liveWeight ? liveWeight.weight_g.toFixed(0) : '0');
    const weightUnit = isKg ? 'kg' : 'g';

    const numUnder = (parseFloat(currentUnderweight) || 0.8) * (rangeUnit === 'kg' ? 1 : 0.001);
    const numOver = (parseFloat(currentOverweight) || 1.5) * (rangeUnit === 'kg' ? 1 : 0.001);

    let currentStatus = 'Normal';
    let statusColor = colors.primary;

    if (isConnected && liveWeight) {
        if (liveWeightKg < numUnder) {
            currentStatus = 'Underweight';
            statusColor = colors.warning;
        } else if (liveWeightKg > numOver) {
            currentStatus = 'Overweight';
            statusColor = colors.error;
        }
    } else {
        currentStatus = '--';
        statusColor = colors.textGrey;
    }

    // ─── Format log timestamp ────────────────────────────────────────
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
        const unit: 'kg' | 'g' = log.unit || rangeUnit || 'kg';
        const value = unit === 'kg'
            ? log.weight_g / 1000
            : log.weight_g;
        const formatted = unit === 'kg'
            ? value.toFixed(2)
            : value.toFixed(0);
        const weightStr = `${formatted} ${unit}`;
        const animal = log.animal || animalType;
        switch (log.status) {
            case 'underweight':
                return `Underweight ${animal} detected at ${weightStr}.`;
            case 'overweight':
                return `Overweight ${animal} detected at ${weightStr}.`;
            default:
                return `${animal} weighed at ${weightStr} — Normal.`;
        }
    };

    // ─── Last updated label for stats (today only) ───────────────────
    const todayStr = new Date().toDateString();
    const todayLogs = weightLogs.filter(l => new Date(l.timestamp).toDateString() === todayStr);
    const lastUpdatedLabel = todayLogs.length > 0
        ? `Last updated: ${formatLogTime(todayLogs[0].timestamp)}`
        : 'No data today';

    return (
        <SafeAreaView style={[aniweighStyles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={aniweighStyles.header}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <View style={aniweighStyles.headerActions}>
                    <TouchableOpacity
                        style={[
                            aniweighStyles.actionButton,
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
                        style={[aniweighStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, marginRight: 8 }]}
                        onPress={() => router.push(`/(devices)/RecentLogsScreen?deviceId=${deviceId}&animalType=${animalType}` as any)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="history" size={20} color={colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[aniweighStyles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke }]}
                        onPress={() => router.push(`/(devices)/DeviceSettingsScreen?type=AniWeigh&deviceId=${deviceId}` as any)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="settings" size={20} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={aniweighStyles.contentContainer} showsVerticalScrollIndicator={false}>

                {/* Title Section (Date, Name, Batch details) */}
                <View style={aniweighStyles.titleSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.smartScale + '1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                            <MaterialIcons name="monitor-weight" size={12} color={colors.smartScale} />
                            <Text style={[textStyles.label, { color: colors.smartScale, fontSize: 10, marginLeft: 4 }]}>AniWeigh</Text>
                        </View>
                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 13 }]}>{getFormattedDate()}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 28 }]}>{deviceName}</Text>
                        <View style={[aniweighStyles.connectionBadge, { backgroundColor: isConnected ? colors.primary + '1A' : colors.error + '1A' }]}>
                            <View style={[aniweighStyles.connectionDot, { backgroundColor: isConnected ? colors.primary : colors.error }]} />
                            <Text style={[textStyles.label, { color: isConnected ? colors.primary : colors.error, fontSize: 12, marginLeft: 6 }]}>
                                {isConnected ? 'Online' : 'Offline'}
                            </Text>
                        </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                        <View style={[aniweighStyles.tagsContainer, { marginTop: 0 }]}>
                            <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: animalColor + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Animal Type', animalType)}>
                                <AnimalIcon type={animalType as any} size={14} color={animalColor} />
                                <Text style={[textStyles.label, { color: animalColor, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{animalType}</Text>
                                <MaterialIcons name="arrow-drop-down" size={16} color={animalColor} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[aniweighStyles.tag, { backgroundColor: colors.info + '1A', paddingRight: 6 }]} onPress={() => openEditModal('Housing', housing)}>
                                <MaterialIcons name="home" size={14} color={colors.info} />
                                <Text style={[textStyles.label, { color: colors.info, fontSize: 12, marginLeft: 4, marginRight: 2 }]}>{housing}</Text>
                                <MaterialIcons name="arrow-drop-down" size={16} color={colors.info} />
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>

                {/* Statistics Section (Expandable) */}
                <View style={[aniweighStyles.statsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        style={aniweighStyles.statsHeader}
                        onPress={() => setStatsExpanded(!statsExpanded)}
                    >
                        <View>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>Segregation Stats</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{lastUpdatedLabel}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[textStyles.h2, { color: colors.text, marginRight: 12 }]}>
                                {segregationStats.total}{' '}
                                <Text style={{ fontSize: 14, color: colors.textGrey }}>Today</Text>
                            </Text>
                            <MaterialIcons name={statsExpanded ? "expand-less" : "expand-more"} size={24} color={colors.textGrey} />
                        </View>
                    </TouchableOpacity>

                    {statsExpanded && (
                        <View style={[aniweighStyles.statsExpandedContent, { borderTopColor: colors.stroke }]}>
                            {/* Visual Bar */}
                            <View style={aniweighStyles.statsVisualBar}>
                                <View style={[aniweighStyles.statsVisualSegment, { flex: segregationStats.underweight.percentage || 1, backgroundColor: colors.warning, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
                                <View style={[aniweighStyles.statsVisualSegment, { flex: segregationStats.normal.percentage || 1, backgroundColor: colors.primary }]} />
                                <View style={[aniweighStyles.statsVisualSegment, { flex: segregationStats.overweight.percentage || 1, backgroundColor: colors.error, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
                            </View>

                            {/* Legend / Details */}
                            <View style={aniweighStyles.statDetailRow}>
                                <View style={aniweighStyles.statLegend}>
                                    <View style={[aniweighStyles.legendDot, { backgroundColor: colors.warning }]} />
                                    <View>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Underweight</Text>
                                        <Text style={[textStyles.label, { color: colors.text }]}>{segregationStats.underweight.count} ({segregationStats.underweight.percentage}%)</Text>
                                    </View>
                                </View>
                                <View style={aniweighStyles.statLegend}>
                                    <View style={[aniweighStyles.legendDot, { backgroundColor: colors.primary }]} />
                                    <View>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Normal</Text>
                                        <Text style={[textStyles.label, { color: colors.text }]}>{segregationStats.normal.count} ({segregationStats.normal.percentage}%)</Text>
                                    </View>
                                </View>
                                <View style={aniweighStyles.statLegend}>
                                    <View style={[aniweighStyles.legendDot, { backgroundColor: colors.error }]} />
                                    <View>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Overweight</Text>
                                        <Text style={[textStyles.label, { color: colors.text }]}>{segregationStats.overweight.count} ({segregationStats.overweight.percentage}%)</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Link to Segregation Records Page */}
                    <TouchableOpacity
                        style={[aniweighStyles.recordsLink, { borderTopColor: colors.stroke }]}
                        activeOpacity={0.7}
                        onPress={() => router.push(`/(devices)/SegregationRecordsScreen?deviceId=${deviceId}` as any)}
                    >
                        <Text style={[textStyles.label, { color: colors.primary }]}>View All Segregation Records</Text>
                        <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Live Scaling View */}
                <View style={aniweighStyles.liveSection}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 18 }]}>Live Scaling</Text>
                        <TouchableOpacity onPress={openRangeSettings} style={{ padding: 4, marginRight: 8 }}>
                            <MaterialIcons name="tune" size={24} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>
                    <View style={[aniweighStyles.liveCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>

                        <View style={aniweighStyles.liveScaleCircle}>
                            <View style={[aniweighStyles.liveScaleInnerCircle, { borderColor: isConnected ? statusColor : colors.stroke }]}>
                                {isConnected && liveWeight ? (
                                    <>
                                        <Text style={[textStyles.h1, { color: colors.text, fontSize: liveWeightDisplay.length > 3 ? 40 : 48, lineHeight: 56 }]}>
                                            {liveWeightDisplay}
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey }]}>{weightUnit}</Text>
                                    </>
                                ) : (
                                    <Text style={[textStyles.body, { color: colors.textGrey }]}>Offline</Text>
                                )}
                            </View>
                        </View>

                        {/* Unit Toggle */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[aniweighStyles.unitToggle, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}
                            onPress={() => setIsKg(!isKg)}
                        >
                            <Text style={[textStyles.label, { color: isKg ? colors.primary : colors.textGrey, paddingHorizontal: 12, paddingVertical: 4 }]}>
                                KG
                            </Text>
                            <View style={{ width: 1, height: 16, backgroundColor: colors.stroke }} />
                            <Text style={[textStyles.label, { color: !isKg ? colors.primary : colors.textGrey, paddingHorizontal: 12, paddingVertical: 4 }]}>
                                GRAMS
                            </Text>
                        </TouchableOpacity>

                        <View style={aniweighStyles.liveStatsContainer}>
                            <View style={aniweighStyles.liveStatItem}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Detected</Text>
                                <Text style={[textStyles.h2, { color: colors.text }]}>{isPigMode ? 'Pig' : 'Chicken'}</Text>
                            </View>
                            <View style={[aniweighStyles.liveStatDivider, { backgroundColor: colors.stroke }]} />
                            <View style={aniweighStyles.liveStatItem}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Status</Text>
                                <Text style={[textStyles.h2, { color: statusColor }]}>{currentStatus}</Text>
                            </View>
                        </View>

                    </View>
                </View>

                {/* Device Logs */}
                <View style={aniweighStyles.logsSection}>
                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 16 }]}>Recent Logs</Text>
                    {weightLogs.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                            <MaterialIcons name="history" size={32} color={colors.textGrey} />
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>No weigh events recorded yet.</Text>
                        </View>
                    ) : (
                        weightLogs.slice(0, 4).map((log, index) => {
                            const { icon, color } = getLogIcon(log.status);
                            return (
                                <View key={log.id ?? index} style={aniweighStyles.logItem}>
                                    <View style={[aniweighStyles.logIcon, { backgroundColor: color + '1A' }]}>
                                        <MaterialIcons name={icon} size={16} color={color} />
                                    </View>
                                    <View style={aniweighStyles.logContent}>
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{getLogMessage(log)}</Text>
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

            {/* Range Settings Modal */}
            <Modal visible={rangeSettingsVisible} transparent animationType="fade">
                <View style={[aniweighStyles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]}>
                    <View style={[aniweighStyles.modalContent, { backgroundColor: colors.surface, maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }]}>

                        {/* Icon Background */}
                        <View style={[aniweighStyles.iconContainer, { backgroundColor: colors.primary + '1A' }]}>
                            <MaterialIcons name="tune" size={32} color={colors.primary} />
                        </View>

                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Weight Range ({isPigMode ? 'Pig' : 'Chicken'})</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 16 }]}>Set the target weight thresholds for determining segregation status.</Text>

                        {/* Unit Toggle for Modal */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[aniweighStyles.unitToggle, { backgroundColor: colors.bgLight, borderColor: colors.stroke, marginBottom: 24, alignSelf: 'center', position: 'relative', top: 0, right: 0 }]}
                            onPress={() => setTempRangeUnit(tempRangeUnit === 'kg' ? 'g' : 'kg')}
                        >
                            <Text style={[textStyles.label, { color: tempRangeUnit === 'kg' ? colors.primary : colors.textGrey, paddingHorizontal: 12, paddingVertical: 4 }]}>
                                KG
                            </Text>
                            <View style={{ width: 1, height: 16, backgroundColor: colors.stroke }} />
                            <Text style={[textStyles.label, { color: tempRangeUnit === 'g' ? colors.primary : colors.textGrey, paddingHorizontal: 12, paddingVertical: 4 }]}>
                                GRAMS
                            </Text>
                        </TouchableOpacity>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label={`Underweight Max (${tempRangeUnit})`}
                                icon="scale"
                                value={tempUnderweight}
                                onChangeText={setTempUnderweight}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput
                                label={`Overweight Min (${tempRangeUnit})`}
                                icon="scale"
                                value={tempOverweight}
                                onChangeText={setTempOverweight}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        {/* Actions - Side by Side */}
                        <View style={[aniweighStyles.actionContainer, { width: '100%' }]}>
                            <TouchableOpacity
                                style={[aniweighStyles.btn, { backgroundColor: colors.cardFill }]}
                                onPress={() => setRangeSettingsVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[aniweighStyles.btn, { backgroundColor: colors.primary }]}
                                onPress={handleSaveRanges}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Save</Text>
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
                    selectedValue={editTarget === 'Animal Type' ? animalType : housing}
                    enableSearch={editTarget === 'Housing'}
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

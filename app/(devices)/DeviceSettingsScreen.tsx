import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

// Mock Types
interface RegisteredDevice {
    id: string;
    name: string;
    status: 'online' | 'offline';
    type?: string;
}

export default function DeviceSettingsScreen() {
    const { profile } = useAuth();
    const farmId = profile?.farmId || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useSettingsSubPageStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ type?: string; deviceId?: string }>();
    const deviceId = params.deviceId || '';
    const currentDeviceType = params.type === 'AniFeed' ? 'AniFeed' : 'AniWeigh';

    const [device, setDevice] = useState<RegisteredDevice | null>(null);
    const [deviceName, setDeviceName] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<ActionModalType>('confirmation');
    const [modalTitle, setModalTitle] = useState('');
    const [modalMessage, setModalMessage] = useState('');
    const [modalAction, setModalAction] = useState<'save' | 'delete'>('save');

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // ─── Loading (Mocked) ──────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => {
            const mockDevice: RegisteredDevice = {
                id: deviceId || 'unit-01',
                name: deviceId ? `Unit ${deviceId}` : 'New Device',
                status: 'online',
                type: currentDeviceType
            };
            setDevice(mockDevice);
            setDeviceName(mockDevice.name);
            setLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [deviceId, currentDeviceType]);

    const handleSave = () => {
        setModalAction('save');
        setModalType('confirmation');
        setModalTitle('Save Changes?');
        setModalMessage('Are you sure you want to update the settings for this device?');
        setModalVisible(true);
    };

    const handleDelete = () => {
        setModalAction('delete');
        setModalType('confirmation');
        setModalTitle('Remove Device?');
        setModalMessage('Are you sure you want to remove this device? This action cannot be undone.');
        setModalVisible(true);
    };

    const confirmAction = async () => {
        setModalVisible(false);

        if (modalAction === 'save') {
            try {
                // Mock save
                setDevice(prev => prev ? { ...prev, name: deviceName.trim() } : null);
                showSnackbar('Device settings updated successfully.');
                setTimeout(() => router.back(), 1500);
            } catch (error) {
                showSnackbar('Failed to save changes.', 'error');
            }
        } else if (modalAction === 'delete') {
            try {
                // Mock delete
                showSnackbar('Device removed successfully.');
                setTimeout(() => router.back(), 1200);
            } catch (error) {
                showSnackbar('Failed to remove device.', 'error');
            }
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton onPress={() => router.back()} />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Device Settings
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>General Details</Text>
                        <Text style={styles.sectionDescription}>Update the name and location of this unit.</Text>

                        <Text style={[textStyles.h3, { color: colors.primary, marginBottom: 12 }]}>
                            {device?.type || currentDeviceType} Device
                        </Text>

                        <View style={[styles.card, { paddingVertical: 8 }]}>
                            <View style={styles.inputGroup}>
                                <FloatingLabelInput
                                    label="Device Name"
                                    icon="devices"
                                    value={deviceName}
                                    onChangeText={setDeviceName}
                                    backgroundColor={colors.surface}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Device Info Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Device Information</Text>
                        <Text style={styles.sectionDescription}>Technical details about this device.</Text>

                        <View style={[styles.card, { paddingVertical: 16 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                                <View style={deviceStyles.deviceIconBox}>
                                    <MaterialIcons name="fingerprint" size={24} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Device ID</Text>
                                    <Text style={[textStyles.h3, { color: colors.text, marginTop: 2 }]}>{deviceId || 'N/A'}</Text>
                                </View>
                            </View>

                            <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }, { marginTop: 16 }]}>
                                <View style={deviceStyles.deviceIconBox}>
                                    <MaterialIcons name="circle" size={24} color={device?.status === 'online' ? colors.primary : colors.textGrey} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Status</Text>
                                    <Text style={[textStyles.h3, { color: device?.status === 'online' ? colors.primary : colors.textGrey, marginTop: 2 }]}>
                                        {device?.status === 'online' ? 'Online' : 'Offline'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleSave}>
                        <Text style={styles.buttonText}>Save Changes</Text>
                    </TouchableOpacity>

                    {/* Delete Device Button */}
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.error + '1A', marginTop: 12 }]}
                        activeOpacity={0.8}
                        onPress={handleDelete}
                    >
                        <Text style={[styles.buttonText, { color: colors.error }]}>Remove Device</Text>
                    </TouchableOpacity>

                </ScrollView>
            </View>

            <ActionModal
                visible={modalVisible}
                type={modalType}
                title={modalTitle}
                message={modalMessage}
                confirmText={modalAction === 'delete' ? 'Remove' : 'Save'}
                cancelText="Cancel"
                onConfirm={confirmAction}
                onCancel={() => setModalVisible(false)}
            />

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

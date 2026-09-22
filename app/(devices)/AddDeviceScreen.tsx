import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { AniFeedIcon } from '@/components/AniFeedIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { DeviceIcon } from '@/components/DeviceIcon';
import { supabase } from '@/lib/supabase';

type DeviceType = 'AniFeed' | 'AniWeigh' | null;

export default function AddDeviceScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useDevicesStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const router = useRouter();

    // When opened from an existing device's cloud icon, these params are passed
    const params = useLocalSearchParams<{ existingDeviceId?: string; existingDeviceName?: string; existingDeviceType?: string; existingDeviceCode?: string }>();
    const isExistingDevice = !!params.existingDeviceId;
    const existingType = params.existingDeviceType as DeviceType | undefined;
    const existingName = params.existingDeviceName ?? '';
    const existingCode = params.existingDeviceCode ?? '';

    const [selectedType, setSelectedType] = useState<DeviceType>(isExistingDevice ? (existingType ?? null) : null);
    // Skip type selection step for existing devices — go straight to hotspot step
    const [step, setStep] = useState(isExistingDevice ? 2 : 1);
    const [wifiSsid, setWifiSsid] = useState('');
    const [wifiPassword, setWifiPassword] = useState('');
    const [deviceName, setDeviceName] = useState(isExistingDevice ? existingName : '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSendingConfig, setIsSendingConfig] = useState(false);
    const [hardwareDeviceId, setHardwareDeviceId] = useState<string | null>(null);
    // After /save succeeds the phone is still on the ESP hotspot (no internet).
    // We park here and wait for the user to switch back before calling Supabase.
    const [waitingReconnect, setWaitingReconnect] = useState(false);
    const [configuredSsid, setConfiguredSsid] = useState('');

    const getHotspotName = () => {
        // Board 1 broadcasts: AniGrow_Setup_<chip_id>  where chip_id == unique_code
        if (existingCode) return `AniGrow_Setup_${existingCode}`;
        // Fallback for new-device flow (type selected but no code yet)
        const prefix = selectedType === 'AniWeigh' ? 'AW' : 'AF';
        return `AniGrow_Setup_${prefix}XXXXXXXXXX`;
    };

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const handleNext = async () => {
        if (step === 1 && selectedType) {
            setStep(2);
        } else if (step === 2) {
            setStep(3);
        } else if (step === 3 && wifiSsid.trim()) {
            setIsSendingConfig(true);
            try {
                const url = `http://192.168.4.1/save?ssid=${encodeURIComponent(wifiSsid.trim())}&pass=${encodeURIComponent(wifiPassword.trim())}`;
                
                const fetchWithRetry = async (targetUrl: string, retries = 3, delayMs = 2000): Promise<Response> => {
                    for (let attempt = 1; attempt <= retries; attempt++) {
                        try {
                            console.log(`[AddDevice] Config send attempt ${attempt} of ${retries}...`);
                            const res = await Promise.race([
                                fetch(targetUrl, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } }),
                                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
                            ]);
                            return res;
                        } catch (err) {
                            if (attempt === retries) {
                                throw err;
                            }
                            console.warn(`[AddDevice] Send attempt ${attempt} failed. Retrying in ${delayMs}ms...`, err);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }
                    throw new Error('All attempts failed');
                };

                const res = await fetchWithRetry(url);

                if (res.ok) {
                    let chipId = '';
                    try {
                        const data = await res.json();
                        chipId = data?.chip_id || data?.device_id || '';
                        if (chipId) setHardwareDeviceId(chipId);
                    } catch { /* parse is optional */ }

                    if (isExistingDevice && params.existingDeviceId) {
                        // Verify chip_id matches registered unique_code
                        if (chipId && existingCode && chipId !== existingCode) {
                            showSnackbar(
                                `Wrong hotspot — board ID (${chipId}) doesn't match registered code (${existingCode}). Join the correct AniGrow_Setup network.`,
                                'error'
                            );
                            setIsSendingConfig(false);
                            return;
                        }

                        // SUCCESS — but we are still on the ESP hotspot (no internet).
                        // Show a "switch back to your WiFi" prompt; Supabase update
                        // happens only after the user confirms they have internet again.
                        setConfiguredSsid(wifiSsid.trim());
                        setWaitingReconnect(true);
                    } else {
                        // New-device flow: /save worked, device is restarting.
                        // Tell user to switch back to regular WiFi before naming device.
                        setConfiguredSsid(wifiSsid.trim());
                        showSnackbar(`Config sent! Reconnect your phone to "${wifiSsid.trim()}" WiFi, then name your device.`, 'success');
                        setStep(4);
                    }
                } else {
                    throw new Error('Device responded with error status.');
                }
            } catch (error) {
                console.error('[AddDevice] send config error:', error);
                showSnackbar(
                    'Could not reach the device. Make sure:\n• Your phone is connected to the AniGrow_Setup hotspot\n• Mobile data is OFF\n• No VPN is active',
                    'error'
                );
            }
            setIsSendingConfig(false);
        } else if (step === 4 && deviceName.trim()) {
            // New device flow: register it in Supabase after successful WiFi config
            setIsSubmitting(true);
            try {
                const { error } = await supabase.from('devices').insert({
                    name: deviceName.trim(),
                    type: selectedType!.toLowerCase(),
                    unique_code: hardwareDeviceId ?? '',
                    status: 'online',
                    last_seen: new Date().toISOString(),
                });
                if (error) throw error;

                showSnackbar(`${selectedType} registered successfully!`);
                setTimeout(() => {
                    if (router.canGoBack()) router.back();
                    else router.replace('/(devices)/DevicesScreen');
                }, 1200);
            } catch (error) {
                console.error('[AddDevice] register error:', error);
                showSnackbar('Failed to register device. Please try again.', 'error');
                setIsSubmitting(false);
            }
        }
    };

    // Called after user confirms they've switched back to regular WiFi.
    // Now we have internet and can safely reach Supabase.
    const handleConfirmReconnected = async () => {
        setIsSubmitting(true);
        try {
            const { error: dbErr } = await supabase
                .from('devices')
                .update({ status: 'online', last_seen: new Date().toISOString() })
                .eq('id', params.existingDeviceId!);

            if (dbErr) {
                console.error('[AddDevice] Supabase update failed:', dbErr);
                showSnackbar('Still no internet — make sure your phone rejoined your regular WiFi, then try again.', 'error');
            } else {
                showSnackbar(`${existingName} is now online!`);
                setTimeout(() => {
                    if (router.canGoBack()) router.back();
                    else router.replace('/(devices)/DevicesScreen');
                }, 1400);
            }
        } catch (e) {
            console.error('[AddDevice] confirm reconnect error:', e);
            showSnackbar('Network error. Make sure you\'re back on your regular WiFi.', 'error');
        }
        setIsSubmitting(false);
    };

    return (
        <View style={[styles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            {/* Header */}
            <View style={styles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => {
                        // For existing devices, step 2 is the first step — go back to the device screen
                        if (!isExistingDevice && step > 1) {
                            setStep(step - 1);
                        } else {
                            if (router.canGoBack()) {
                                router.back();
                            } else {
                                router.replace('/(devices)/DevicesScreen');
                            }
                        }
                    }} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    {isExistingDevice
                        ? (step === 2 ? `Connect ${existingName}` : step === 3 ? `Setup ${existingName}` : `${existingName}`)
                        : (step === 1 ? 'Add New Device' : step === 2 ? `Connect to ${selectedType}` : step === 3 ? `Setup ${selectedType}` : 'Name Device')}
                </Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                
                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.progressHeader}>
                            <Text style={[textStyles.body, { color: colors.primary, fontFamily: 'Poppins-SemiBold' }]}>Step 1 of 3</Text>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, marginTop: 8 }]}>Select Device Type</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                                What kind of Ani-Grow device would you like to register today?
                            </Text>
                        </View>

                        <View style={styles.optionsContainer}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                style={[
                                    styles.deviceOptionCard,
                                    { backgroundColor: 'transparent', borderColor: colors.stroke },
                                    selectedType === 'AniFeed' && { borderColor: colors.secondary }
                                ]}
                                onPress={() => setSelectedType('AniFeed')}
                            >
                                <View style={[styles.iconBox, { backgroundColor: colors.secondary + '1A' }]}>
                                    <AniFeedIcon size={32} />
                                </View>
                                <View style={styles.optionTextContainer}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 4 }]}>AniFeed</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Automatic feed dispenser for optimal livestock nutrition.</Text>
                                </View>
                                <View style={[styles.radioCircle, { borderColor: colors.stroke }]}>
                                    {selectedType === 'AniFeed' && <View style={[styles.radioDot, { backgroundColor: colors.secondary }]} />}
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.7}
                                style={[
                                    styles.deviceOptionCard,
                                    { backgroundColor: 'transparent', borderColor: colors.stroke },
                                    selectedType === 'AniWeigh' && { borderColor: colors.smartScale }
                                ]}
                                onPress={() => setSelectedType('AniWeigh')}
                            >
                                <View style={[styles.iconBox, { backgroundColor: colors.smartScale + '1A' }]}>
                                    <AniWeighIcon size={32} />
                                </View>
                                <View style={styles.optionTextContainer}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 4 }]}>AniWeigh</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>Smart scale hub for precision growth tracking.</Text>
                                </View>
                                <View style={[styles.radioCircle, { borderColor: colors.stroke }]}>
                                    {selectedType === 'AniWeigh' && <View style={[styles.radioDot, { backgroundColor: colors.smartScale }]} />}
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 2 && (
                    <View style={[styles.stepContainer, { alignItems: 'center', paddingTop: 40 }]}>
                        {/* Device type badge */}
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            backgroundColor: selectedType === 'AniWeigh' ? colors.smartScale + '1A' : colors.secondary + '1A',
                            paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 20,
                        }}>
                            <DeviceIcon
                                type={selectedType}
                                size={16}
                            />
                            <Text style={[textStyles.label, { color: selectedType === 'AniWeigh' ? colors.smartScale : colors.secondary, fontSize: 13 }]}>
                                {selectedType ?? 'Device'}
                            </Text>
                        </View>

                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, textAlign: 'center', marginBottom: 24 }]}>
                            Connect to Your {isExistingDevice ? existingName : selectedType} Device
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 16, lineHeight: 24, paddingHorizontal: 20 }]}>
                            Go to your phone's or tablet's Wi-Fi settings and join your device's Setup network:
                        </Text>
                        <View style={{
                            backgroundColor: colors.primary + '15',
                            paddingHorizontal: 20, paddingVertical: 14,
                            borderRadius: 12, marginVertical: 16,
                            borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary + '60',
                            alignItems: 'center', gap: 6,
                        }}>
                            <MaterialIcons name="wifi" size={20} color={colors.primary} />
                            <Text style={[textStyles.h2, { color: colors.primary, fontSize: 16, fontFamily: 'Poppins-Bold', textAlign: 'center', letterSpacing: 0.4 }]}>
                                {getHotspotName()}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, textAlign: 'center' }]}>
                                Open your phone's WiFi settings, find this network and connect to it
                            </Text>
                        </View>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 16 }]}>
                            Then return to this app.
                        </Text>
                    </View>
                )}

                {step === 3 && !waitingReconnect && (
                    <View style={styles.stepContainer}>
                        <Text style={[textStyles.h1, { color: '#006400', fontSize: 26, marginBottom: 8 }]}>
                            Setup {isExistingDevice ? existingName : selectedType}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 32 }]}>
                            Follow these steps to connect your {isExistingDevice ? existingName : selectedType} to WiFi.
                        </Text>

                        {/* Sub-step 1 */}
                        <View style={{ marginBottom: 32 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.numberCircle, { backgroundColor: '#006400', width: 24, height: 24, borderRadius: 12, marginRight: 12 }]}>
                                    <Text style={[styles.numberText, { fontSize: 12 }]}>1</Text>
                                </View>
                                <Text style={[textStyles.h3, { color: colors.text }]}>Enter Home WiFi Details</Text>
                            </View>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginLeft: 36, marginBottom: 16 }]}>
                                Enter the name and password of the WiFi you want the device to connect to.
                            </Text>

                            <View style={{ marginLeft: 36, gap: 12 }}>
                                <FloatingLabelInput
                                    label="WiFi Name (SSID)"
                                    icon="wifi"
                                    value={wifiSsid}
                                    onChangeText={setWifiSsid}
                                />
                                <FloatingLabelInput
                                    label="WiFi Password"
                                    icon="lock"
                                    secureTextEntry
                                    value={wifiPassword}
                                    onChangeText={setWifiPassword}
                                />
                            </View>
                        </View>

                        {/* Sub-step 2 */}
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.numberCircle, { backgroundColor: '#006400', width: 24, height: 24, borderRadius: 12, marginRight: 12 }]}>
                                    <Text style={[styles.numberText, { fontSize: 12 }]}>2</Text>
                                </View>
                                <Text style={[textStyles.h3, { color: colors.text }]}>Send Configuration</Text>
                            </View>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginLeft: 36, marginBottom: 16 }]}>
                                Tap 'Connect Device' to send these credentials to your device.
                            </Text>

                            <TouchableOpacity
                                style={{
                                    backgroundColor: '#006400',
                                    paddingVertical: 16,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    marginLeft: 36,
                                    opacity: wifiSsid.trim() && !isSendingConfig ? 1 : 0.6
                                }}
                                activeOpacity={0.8}
                                onPress={handleNext}
                                disabled={!wifiSsid.trim() || isSendingConfig}
                            >
                                {isSendingConfig ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={[textStyles.btnLabel, { color: '#FFFFFF' }]}>Connect Device</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {step === 3 && waitingReconnect && (
                    <View style={[styles.stepContainer, { alignItems: 'center', paddingTop: 40 }]}>
                        {/* Success badge */}
                        <View style={{
                            width: 72, height: 72, borderRadius: 36,
                            backgroundColor: '#006400' + '1A',
                            alignItems: 'center', justifyContent: 'center',
                            marginBottom: 24,
                        }}>
                            <MaterialIcons name="check-circle" size={44} color="#006400" />
                        </View>

                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 22, textAlign: 'center', marginBottom: 8 }]}>
                            Credentials Sent!
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 15, lineHeight: 22, marginBottom: 32 }]}>
                            The device is restarting and connecting to your WiFi.{'\n'}
                            Now switch your phone back to your regular WiFi:
                        </Text>

                        {/* WiFi name */}
                        <View style={{
                            backgroundColor: colors.primary + '15',
                            paddingHorizontal: 20, paddingVertical: 14,
                            borderRadius: 12, marginBottom: 32,
                            borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary + '60',
                            alignItems: 'center', gap: 6, width: '100%',
                        }}>
                            <MaterialIcons name="wifi" size={22} color={colors.primary} />
                            <Text style={[textStyles.h2, { color: colors.primary, fontSize: 16, fontFamily: 'Poppins-Bold', textAlign: 'center' }]}>
                                {configuredSsid || 'Your regular WiFi'}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, textAlign: 'center' }]}>
                                Open your phone's WiFi settings and reconnect to this network
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={{
                                backgroundColor: '#006400',
                                paddingVertical: 16,
                                paddingHorizontal: 32,
                                borderRadius: 8,
                                alignItems: 'center',
                                width: '100%',
                                opacity: isSubmitting ? 0.6 : 1,
                            }}
                            activeOpacity={0.8}
                            onPress={handleConfirmReconnected}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={[textStyles.btnLabel, { color: '#FFFFFF' }]}>
                                    I'm Back on Regular WiFi
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {step === 4 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.progressHeader}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, marginTop: 8 }]}>Name your {selectedType}</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                                Give your device a descriptive name so you can easily identify it later.
                            </Text>
                        </View>

                        {/* Reconnect reminder for new-device flow */}
                        <View style={{
                            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                            backgroundColor: colors.primary + '12',
                            padding: 12, borderRadius: 10, marginBottom: 20,
                            borderWidth: 1, borderColor: colors.primary + '40',
                        }}>
                            <MaterialIcons name="info-outline" size={18} color={colors.primary} style={{ marginTop: 1 }} />
                            <Text style={[textStyles.body, { color: colors.primary, fontSize: 13, flex: 1 }]}>
                                Make sure your phone is reconnected to{configuredSsid ? ` "${configuredSsid}"` : ' your regular WiFi'} before finishing.
                            </Text>
                        </View>

                        <View style={styles.inputContainer}>
                            <FloatingLabelInput
                                label="Device Name"
                                icon="edit"
                                value={deviceName}
                                onChangeText={setDeviceName}
                                autoCapitalize="words"
                            />
                        </View>
                    </View>
                )}

            </ScrollView>

            {/* Bottom bar hidden on:
                - step 3 WiFi form (has its own Connect Device button)
                - step 3 reconnect prompt (has its own "I'm Back" button)
                - step 4 on existing-device flow (naming is skipped for existing) */}
            {step !== 3 && !(isExistingDevice && step === 4) && (
                <View style={[styles.bottomBar, { backgroundColor: 'transparent' }]}>
                    <TouchableOpacity
                        style={[
                            styles.primaryButton,
                            { backgroundColor: colors.primary },
                            ((step === 1 && !selectedType) || (step === 4 && !deviceName.trim()) || isSubmitting) ? { opacity: 0.5 } : {}
                        ]}
                        activeOpacity={0.8}
                        onPress={handleNext}
                        disabled={(step === 1 && !selectedType) || (step === 4 && !deviceName.trim()) || isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color={colors.onPrimary} />
                        ) : (
                            <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>
                                {step === 1 ? 'Continue' : step === 2 ? 'I\'ve Connected to Device Wi-Fi' : 'Finish Setup'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </View>
    );
}

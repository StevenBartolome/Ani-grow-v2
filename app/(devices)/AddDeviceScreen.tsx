import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useDevicesStyles } from '@/styles/devicesStyles';

type DeviceType = 'AniFeed' | 'AniWeigh' | null;

export default function AddDeviceScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useDevicesStyles();
    const router = useRouter();

    const [selectedType, setSelectedType] = useState<DeviceType>(null);
    const [step, setStep] = useState(1);
    const [wifiSsid, setWifiSsid] = useState('');
    const [wifiPassword, setWifiPassword] = useState('');
    const [deviceName, setDeviceName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSendingConfig, setIsSendingConfig] = useState(false);
    const [hardwareDeviceId, setHardwareDeviceId] = useState<string | null>(null);

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
            // Attempt to send configuration to ESP32
            setIsSendingConfig(true);
            try {
                // Send credentials to ESP32 AP WebServer
                const res = await Promise.race([
                    fetch(`http://192.168.4.1/save?ssid=${encodeURIComponent(wifiSsid.trim())}&pass=${encodeURIComponent(wifiPassword.trim())}`, {
                        method: 'GET',
                        headers: { 'Cache-Control': 'no-cache' }
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                ]) as Response;

                if (res && res.ok) {
                    try {
                        const data = await res.json();
                        if (data && data.device_id) {
                            setHardwareDeviceId(data.device_id);
                        }
                    } catch (e) {
                        console.warn('Failed to parse hardware device ID JSON:', e);
                    }
                    showSnackbar('Configuration sent! Device restarting...');
                    setStep(4);
                } else {
                    throw new Error('Device responded with error status.');
                }
            } catch (error) {
                console.error('Failed to send config:', error);
                // Show real error so user knows it failed
                showSnackbar('Failed to reach device. Make sure Mobile Data is OFF and you are connected to AniWeigh_Setup.', 'error');
            }
            setIsSendingConfig(false);
        } else if (step === 4 && deviceName.trim()) {
            // Register the device in Firebase RTDB
            setIsSubmitting(true);
            try {
                // Use hardware ID if provided by the scale, otherwise fall back to generating one
                const fallbackId = `${selectedType!.toLowerCase()}_${deviceName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
                const deviceIdToRegister = hardwareDeviceId || fallbackId;

                // Simulate device registration
                // await registerDevice(deviceIdToRegister, deviceName.trim(), selectedType!);
                await new Promise(resolve => setTimeout(resolve, 1000));

                showSnackbar(`${selectedType} registered successfully!`);
                setTimeout(() => {
                    router.back();
                }, 1200);
            } catch (error) {
                console.error('Failed to register device:', error);
                showSnackbar('Failed to register device. Please try again.', 'error');
                setIsSubmitting(false);
            }
        }
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgLight }]}>
            {/* Header */}
            <View style={styles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => { 
                        if (step > 1) {
                            setStep(step - 1);
                        } else {
                            router.back();
                        }
                    }} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    {step === 1 ? 'Add New Device' : step === 2 ? `Connect to ${selectedType}` : step === 3 ? `Setup ${selectedType}` : 'Name Device'}
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
                                    <MaterialIcons name="grain" size={32} color={colors.secondary} />
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
                                    <MaterialIcons name="monitor-weight" size={32} color={colors.smartScale} />
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
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, textAlign: 'center', marginBottom: 24 }]}>
                            Connect to Your {selectedType} Device
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 16, lineHeight: 24, paddingHorizontal: 20 }]}>
                            Go to your phone's or tablet's Wi-Fi settings and join your {selectedType} device's network:
                        </Text>
                        <View style={{ backgroundColor: colors.primary + '1A', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginVertical: 16 }}>
                            <Text style={[textStyles.h2, { color: colors.primary, fontSize: 18 }]}>AniWeigh_Setup</Text>
                        </View>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 16 }]}>
                            Then return to this app.
                        </Text>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.stepContainer}>
                        <Text style={[textStyles.h1, { color: '#006400', fontSize: 26, marginBottom: 8 }]}>
                            Setup {selectedType}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 32 }]}>
                            Follow these steps to connect your scale to WiFi.
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
                                Enter the name and password of the WiFi you want the scale to connect to.
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
                                Tap 'Connect Device' to send these credentials to your {selectedType} scale.
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

                {step === 4 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.progressHeader}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, marginTop: 8 }]}>Name your {selectedType}</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                                Give your device a descriptive name so you can easily identify it later.
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

            {/* The bottom bar is hidden on step 3 because it has its own Connect Device button */}
            {step !== 3 && (
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
        </SafeAreaView>
    );
}

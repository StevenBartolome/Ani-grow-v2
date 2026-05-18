import React, { useState, useEffect } from 'react';
import { 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Image,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BackButton } from '@/components/BackButton';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function MFAScreen() {
  const styles = useSettingsSubPageStyles();
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const { enrollMFA, verifyMFA, getMFAFactors, unenrollMFA } = useAuth();

  const [step, setStep] = useState<'status' | 'enroll' | 'verify'>('status');
  const [factors, setFactors] = useState<any[]>([]);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Snackbar State
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

  const showSnackbar = (message: string, type: SnackbarType = 'error') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setIsInitialLoading(true);
    try {
      const activeFactors = await getMFAFactors();
      setFactors(activeFactors);
      setStep('status');
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to fetch MFA status.');
    } finally {
      setIsInitialLoading(false);
    }
  };

  const handleStartEnroll = async () => {
    setIsLoading(true);
    try {
      const data = await enrollMFA();
      setEnrollData(data);
      setStep('enroll');
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to start MFA enrollment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEnroll = async () => {
    if (!code || code.length < 6) {
      showSnackbar('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      await verifyMFA(enrollData!.factorId, code);
      showSnackbar('MFA enabled successfully!', 'success');
      fetchStatus();
    } catch (error: any) {
      showSnackbar(error.message || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableMFA = async (factorId: string) => {
    setIsLoading(true);
    try {
      await unenrollMFA(factorId);
      showSnackbar('MFA disabled successfully.', 'success');
      fetchStatus();
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to disable MFA.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    showSnackbar('Secret key copied to clipboard!', 'success');
  };

  if (isInitialLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isEnabled = factors.some(f => f.status === 'verified');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
            <View style={{ width: 44, height: 44 }}>
                <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
            </View>
            <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                {step === 'status' ? 'MFA Settings' : step === 'enroll' ? 'Scan QR Code' : 'Verify MFA'}
            </Text>
            <View style={{ width: 44, height: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            {step === 'status' && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Security Status</Text>
                    <Text style={styles.sectionDescription}>Two-factor authentication adds an extra layer of security to your account.</Text>

                    <View style={[styles.card, { padding: 32, alignItems: 'center' }]}>
                        <MaterialIcons 
                            name={isEnabled ? "verified-user" : "gpp-maybe"} 
                            size={64} 
                            color={isEnabled ? "#10b981" : colors.textGrey} 
                        />
                        <Text style={[textStyles.h2, { color: colors.text, marginTop: 16 }]}>
                            {isEnabled ? 'MFA is Enabled' : 'MFA is Disabled'}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center' }]}>
                            Your account is protected with {isEnabled ? 'an active' : 'no'} second factor.
                        </Text>
                    </View>

                    {factors.length > 0 && (
                        <>
                            <Text style={styles.sectionTitle}>MFA Factors</Text>
                            <View style={styles.card}>
                                {factors.map((factor, index) => (
                                    <View key={factor.id} style={[styles.row, index !== factors.length - 1 && styles.rowBorder]}>
                                        <View style={styles.rowContent}>
                                            <View style={[mfaStyles.iconBox, { backgroundColor: factor.status === 'verified' ? '#10b9811A' : '#f59e0b1A' }]}>
                                                <MaterialIcons 
                                                    name={factor.status === 'verified' ? "check-circle" : "pending"} 
                                                    size={22} 
                                                    color={factor.status === 'verified' ? '#10b981' : '#f59e0b'} 
                                                />
                                            </View>
                                            <View style={styles.rowTextContainer}>
                                                <Text style={styles.rowTitle}>{factor.friendly_name || 'Authenticator App'}</Text>
                                                <Text style={styles.rowDescription}>Status: {factor.status === 'verified' ? 'Verified' : 'Pending'}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity onPress={() => handleDisableMFA(factor.id)} disabled={isLoading}>
                                            <MaterialIcons name="delete-outline" size={24} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        </>
                    )}

                    {!isEnabled && (
                        <TouchableOpacity 
                            style={[styles.button, isLoading && { opacity: 0.7 }]} 
                            activeOpacity={0.8} 
                            onPress={handleStartEnroll}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>{isLoading ? 'Loading...' : factors.length > 0 ? 'Complete Enrollment' : 'Enable MFA'}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {step === 'enroll' && enrollData && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Step 1: Scan QR Code</Text>
                    <Text style={styles.sectionDescription}>Scan this QR code with your authenticator app (like Google Authenticator or Authy).</Text>

                    <View style={[styles.card, { padding: 32, alignItems: 'center' }]}>
                        <View style={[mfaStyles.qrContainer, { borderColor: colors.stroke }]}>
                            <Image 
                                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(enrollData.qrCode)}` }}
                                style={{ width: 200, height: 200 }}
                            />
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Manual Entry</Text>
                    <Text style={styles.sectionDescription}>If you can't scan the QR code, copy this secret key instead.</Text>
                    
                    <View style={styles.card}>
                        <TouchableOpacity 
                            style={styles.row}
                            activeOpacity={0.7}
                            onPress={() => copyToClipboard(enrollData.secret)}
                        >
                            <View style={styles.rowContent}>
                                <View style={[mfaStyles.iconBox, { backgroundColor: colors.primary + '1A' }]}>
                                    <MaterialIcons name="vpn-key" size={22} color={colors.primary} />
                                </View>
                                <View style={styles.rowTextContainer}>
                                    <Text style={styles.rowTitle}>Secret Key</Text>
                                    <Text style={styles.rowDescription} numberOfLines={1}>{enrollData.secret}</Text>
                                </View>
                            </View>
                            <MaterialIcons name="content-copy" size={20} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        style={styles.button} 
                        activeOpacity={0.8} 
                        onPress={() => setStep('verify')}
                    >
                        <Text style={styles.buttonText}>Next Step</Text>
                    </TouchableOpacity>
                </View>
            )}

            {step === 'verify' && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Step 2: Verify Code</Text>
                    <Text style={styles.sectionDescription}>Enter the 6-digit code generated by your authenticator app.</Text>

                    <View style={styles.card}>
                        <View style={styles.inputGroup}>
                            <FloatingLabelInput
                                label="Verification Code"
                                icon="vpn-key"
                                value={code}
                                onChangeText={setCode}
                                keyboardType="number-pad"
                                maxLength={6}
                                backgroundColor={colors.surface}
                            />
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={[styles.button, isLoading && { opacity: 0.7 }]} 
                        activeOpacity={0.8} 
                        onPress={handleVerifyEnroll}
                        disabled={isLoading}
                    >
                        <Text style={styles.buttonText}>{isLoading ? 'Verifying...' : 'Complete Setup'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={{ marginTop: 20, alignItems: 'center' }}
                        onPress={() => setStep('enroll')}
                    >
                        <Text style={[textStyles.label, { color: colors.primary }]}>Go back to QR Code</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
      </View>

      <Snackbar
        visible={snackbarVisible}
        message={snackbarMessage}
        type={snackbarType}
        onDismiss={() => setSnackbarVisible(false)}
      />
    </SafeAreaView>
  );
}

const mfaStyles = StyleSheet.create({
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrContainer: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  }
});

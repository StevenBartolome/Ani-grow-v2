import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  Image,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useTextStyles } from '../../src/constants/textStyles';
import FloatingLabelInput from '../../src/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '../../src/components/Snackbar';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

export default function MFAScreen() {
  const router = useRouter();
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
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[textStyles.h2, { color: colors.text }]}>MFA Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {step === 'status' && (
          <View>
            <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
              <MaterialIcons 
                name={factors.some(f => f.status === 'verified') ? "verified-user" : "gpp-maybe"} 
                size={48} 
                color={factors.some(f => f.status === 'verified') ? "#10b981" : colors.textGrey} 
              />
              <Text style={[textStyles.h3, { color: colors.text, marginTop: 16 }]}>
                {factors.some(f => f.status === 'verified') ? 'MFA is Enabled' : 'MFA is Disabled'}
              </Text>
              <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center' }]}>
                Two-factor authentication adds an extra layer of security to your account by requiring a second verification step during login.
              </Text>
            </View>

            {factors.length > 0 ? (
              <View style={{ marginTop: 24 }}>
                <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 12 }]}>MFA FACTORS</Text>
                {factors.map((factor) => (
                  <View key={factor.id} style={[styles.factorItem, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[textStyles.body, { color: colors.text }]}>{factor.friendly_name || 'Authenticator App'}</Text>
                        <View style={[
                          styles.smallBadge, 
                          { backgroundColor: factor.status === 'verified' ? '#10b98120' : '#f59e0b20' }
                        ]}>
                          <Text style={[
                            textStyles.label, 
                            { fontSize: 10, color: factor.status === 'verified' ? '#10b981' : '#f59e0b' }
                          ]}>
                            {factor.status === 'verified' ? 'Verified' : 'Pending'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 10 }]}>ID: {factor.id}</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => handleDisableMFA(factor.id)}
                      disabled={isLoading}
                    >
                      <Text style={[textStyles.label, { color: colors.error }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                
                {!factors.some(f => f.status === 'verified') && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 20 }]}
                    onPress={handleStartEnroll}
                    disabled={isLoading}
                  >
                    <Text style={[textStyles.btnLabel, { color: '#fff' }]}>
                      {isLoading ? 'Loading...' : 'Start New Enrollment'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 32 }]}
                onPress={handleStartEnroll}
                disabled={isLoading}
              >
                <Text style={[textStyles.btnLabel, { color: '#fff' }]}>
                  {isLoading ? 'Loading...' : 'Enable MFA'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {step === 'enroll' && enrollData && (
          <View>
            <Text style={[textStyles.h3, { color: colors.text }]}>Step 1: Scan QR Code</Text>
            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
              Scan this QR code with your authenticator app (like Google Authenticator or Authy).
            </Text>

            <View style={[styles.qrContainer, { backgroundColor: '#fff', borderColor: colors.stroke }]}>
              {/* Use qrserver.com to generate QR code from data */}
              <Image 
                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(enrollData.qrCode)}` }}
                style={{ width: 200, height: 200 }}
              />
            </View>

            <View style={{ marginTop: 24 }}>
              <Text style={[textStyles.body, { color: colors.text }]}>Can't scan the QR code?</Text>
              <Text style={[textStyles.label, { color: colors.textGrey, marginTop: 4 }]}>Copy this secret key instead:</Text>
              <TouchableOpacity 
                style={[styles.secretBox, { backgroundColor: colors.surface, borderColor: colors.stroke }]}
                onPress={() => copyToClipboard(enrollData.secret)}
              >
                <Text style={[textStyles.body, { color: colors.text, flex: 1 }]}>{enrollData.secret}</Text>
                <MaterialIcons name="content-copy" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 32 }]}
              onPress={() => setStep('verify')}
            >
              <Text style={[textStyles.btnLabel, { color: '#fff' }]}>Next Step</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'verify' && (
          <View>
            <Text style={[textStyles.h3, { color: colors.text }]}>Step 2: Verify Code</Text>
            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
              Enter the 6-digit code generated by your authenticator app to confirm the setup.
            </Text>

            <View style={{ marginTop: 32 }}>
              <FloatingLabelInput
                label="Verification Code"
                icon="vpn-key"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
              />

              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 24 }]}
                onPress={handleVerifyEnroll}
                disabled={isLoading}
              >
                <Text style={[textStyles.btnLabel, { color: '#fff' }]}>
                  {isLoading ? 'Verifying...' : 'Complete Setup'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ marginTop: 20, alignItems: 'center' }}
                onPress={() => setStep('enroll')}
              >
                <Text style={[textStyles.label, { color: colors.primary }]}>Go back to QR Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        message={snackbarMessage}
        type={snackbarType}
        onDismiss={() => setSnackbarVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  smallBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  scrollContent: {
    padding: 24,
  },
  statusCard: {
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  qrContainer: {
    marginTop: 24,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'center',
  },
  secretBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  }
});

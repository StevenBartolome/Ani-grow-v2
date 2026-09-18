import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Image,
  ActivityIndicator,
  StyleSheet,
  Platform,
  PanResponder,
  Animated
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BackButton } from '@/components/BackButton';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import ActionModal from '@/components/ActionModal';
import { supabase } from '@/lib/supabase';

// Custom Swipeable Factor Row utilizing PanResponder
const SwipeableFactorRow = ({ factor, onDelete, colors, textStyles, index, total }: any) => {
  const translateX = useRef(new Animated.Value(0)).current;
  
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Activate PanResponder ONLY on horizontal left swipes
        return Math.abs(gestureState.dx) > 10 && gestureState.dx < 0;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(-80, gestureState.dx));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -40) {
          // Open delete action
          Animated.spring(translateX, {
            toValue: -80,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        } else {
          // Closed state
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  const handleClose = () => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={mfaStyles.swipeRowContainer}>
      {/* Background delete drawer item */}
      <View style={mfaStyles.deleteActionWrapper}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[mfaStyles.deleteActionButton, { backgroundColor: colors.error }]}
          onPress={() => {
            handleClose();
            onDelete(factor.id);
          }}
        >
          <MaterialIcons name="delete" size={20} color="#FFFFFF" />
          <Text style={mfaStyles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground scrollable content item */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          mfaStyles.swipeFront,
          {
            backgroundColor: colors.surface,
            transform: [{ translateX }],
            borderBottomWidth: index === total - 1 ? 0 : 1,
            borderBottomColor: colors.stroke,
          }
        ]}
      >
        <View style={mfaStyles.swipeContentInner}>
          <View style={[mfaStyles.iconBox, { backgroundColor: factor.status === 'verified' ? '#10b9811A' : '#f59e0b1A' }]}>
            <MaterialIcons 
              name={factor.status === 'verified' ? "check-circle" : "pending"} 
              size={22} 
              color={factor.status === 'verified' ? '#10b981' : '#f59e0b'} 
            />
          </View>
          <View style={mfaStyles.rowTextContainer}>
            <Text style={mfaStyles.rowTitle}>{factor.friendly_name || 'Authenticator App'}</Text>
            <Text style={mfaStyles.rowDescription}>Status: {factor.status === 'verified' ? 'Verified' : 'Pending'}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[textStyles.body, { fontSize: 10, color: colors.textGrey, opacity: 0.5 }]}>Swipe Left</Text>
          <MaterialIcons name="chevron-left" size={16} color={colors.textGrey} style={{ opacity: 0.4 }} />
        </View>
      </Animated.View>
    </View>
  );
};

export default function MFAScreen() {
  const styles = useSettingsSubPageStyles();
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const insets = useSafeAreaInsets();
  const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
  const { user, enrollMFA, verifyMFA, getMFAFactors, unenrollMFA } = useAuth();

  const [step, setStep] = useState<'status' | 'enroll' | 'verify'>('status');
  const [factors, setFactors] = useState<any[]>([]);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Custom Switch and Confirmation Modal States
  const [isDisableModalVisible, setDisableModalVisible] = useState(false);
  const [factorToDisable, setFactorToDisable] = useState<string | null>(null);

  // Local state for instant Switch toggle rendering
  const [localMfaEnabled, setLocalMfaEnabled] = useState(false);

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

  // Sync local switch state with factors & user metadata
  useEffect(() => {
    const isVerified = factors.some(f => f.status === 'verified');
    const isMetadataEnabled = user?.user_metadata?.mfa_enabled !== false;
    setLocalMfaEnabled(isVerified && isMetadataEnabled);
  }, [factors, user]);

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
      // Ensure metadata is active on successful verification
      await supabase.auth.updateUser({
        data: { mfa_enabled: true }
      });
      setLocalMfaEnabled(true);
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
      // Disable in metadata too
      await supabase.auth.updateUser({
        data: { mfa_enabled: false }
      });
      setLocalMfaEnabled(false);
      showSnackbar('Factor deleted successfully.', 'success');
      fetchStatus();
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to delete factor.');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDisableMFA = (factorId: string) => {
    setFactorToDisable(factorId);
    setDisableModalVisible(true);
  };

  const confirmDisableMFA = async () => {
    setDisableModalVisible(false);
    if (!factorToDisable) return;
    
    setIsLoading(true);
    try {
      await unenrollMFA(factorToDisable);
      // Ensure local metadata disables it too
      await supabase.auth.updateUser({
        data: { mfa_enabled: false }
      });
      setLocalMfaEnabled(false);
      showSnackbar('MFA factor deleted successfully.', 'success');
      setFactorToDisable(null);
      fetchStatus();
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to delete MFA factor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMFA = async () => {
    setIsLoading(true);
    const targetState = !localMfaEnabled;
    try {
      if (!targetState) {
        // Toggle OFF -> Update user metadata only! Secret keys remain preserved.
        const { error } = await supabase.auth.updateUser({
          data: { mfa_enabled: false }
        });
        if (error) throw error;
        setLocalMfaEnabled(false);
        showSnackbar('Two-factor authentication disabled.', 'success');
        fetchStatus();
      } else {
        // Toggle ON
        if (isEnabled) {
          // If already verified factor exists, just set metadata to true! No re-scanning!
          const { error } = await supabase.auth.updateUser({
            data: { mfa_enabled: true }
          });
          if (error) throw error;
          setLocalMfaEnabled(true);
          showSnackbar('Two-factor authentication active!', 'success');
          fetchStatus();
        } else {
          // No verified factors, trigger TOTP setup
          const pendingFactor = factors.find(f => f.status === 'pending');
          if (pendingFactor) {
            if (enrollData) {
              setCode('');
              setStep('verify');
            } else {
              handleReEnroll(pendingFactor.id);
            }
          } else {
            handleStartEnroll();
          }
        }
      }
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to toggle MFA.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReEnroll = async (pendingFactorId: string) => {
    setIsLoading(true);
    try {
      await unenrollMFA(pendingFactorId);
      const data = await enrollMFA();
      setEnrollData(data);
      setStep('enroll');
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to restart MFA enrollment.');
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
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
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
                    <Text style={styles.sectionTitle}>Two-Factor Authentication (MFA)</Text>
                    <Text style={styles.sectionDescription}>
                        Add an extra layer of security. Toggle it on/off directly, or swipe left to permanently delete factors.
                    </Text>

                    {/* Premium Card: Status Overview */}
                    <View style={[styles.card, { padding: 24, alignItems: 'center', marginBottom: 20 }]}>
                        <View style={[
                            mfaStyles.statusIconOuter, 
                            { backgroundColor: localMfaEnabled ? '#10b9811A' : colors.textGrey + '1A' }
                        ]}>
                            <MaterialIcons 
                                name={localMfaEnabled ? "shield" : "gpp-maybe"} 
                                size={40} 
                                color={localMfaEnabled ? "#10b981" : colors.textGrey} 
                            />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, marginTop: 14, fontFamily: 'Poppins-Bold' }]}>
                            {localMfaEnabled ? 'MFA is Security Active' : 'MFA is Inactive'}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 6, textAlign: 'center', fontSize: 13, lineHeight: 18 }]}>
                            {localMfaEnabled 
                                ? 'Two-factor authentication prompts are active during password login.' 
                                : 'Enable security alerts to safeguard livestock and device controls.'
                            }
                        </Text>
                    </View>

                    {/* Premium Toggle Row */}
                    <View style={[mfaStyles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                        <View style={mfaStyles.toggleTextWrapper}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-SemiBold' }]}>
                                Authenticator App Setup
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2, lineHeight: 16 }]}>
                                {localMfaEnabled ? 'ON — OTP login enabled' : 'OFF — Password only'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={handleToggleMFA}
                            disabled={isLoading}
                            style={[
                                mfaStyles.switchContainer,
                                { backgroundColor: localMfaEnabled ? '#10b981' : colors.textGrey + '33' }
                            ]}
                        >
                            <View 
                                style={[
                                    mfaStyles.switchCircle,
                                    { 
                                        backgroundColor: '#FFFFFF',
                                        alignSelf: localMfaEnabled ? 'flex-end' : 'flex-start'
                                    }
                                ]} 
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Active Factors - Swipe to delete */}
                    {factors.length > 0 && (
                        <>
                            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Registered Keys</Text>
                            <Text style={[styles.sectionDescription, { marginBottom: 12 }]}>
                                Swipe an authenticator key to the left to delete/wipe it permanently.
                            </Text>
                            <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
                                {factors.map((factor, index) => (
                                    <SwipeableFactorRow
                                        key={factor.id}
                                        factor={factor}
                                        colors={colors}
                                        textStyles={textStyles}
                                        index={index}
                                        total={factors.length}
                                        onDelete={triggerDisableMFA}
                                    />
                                ))}
                            </View>
                        </>
                    )}

                    {/* Pending enrollment alert row */}
                    {factors.length > 0 && !isEnabled && (
                        <View style={[mfaStyles.pendingAlertCard, { backgroundColor: '#F59E0B0A', borderColor: '#F59E0B22' }]}>
                            <MaterialIcons name="warning" size={20} color="#F59E0B" />
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.h3, { color: '#F59E0B', fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                    Setup Incomplete
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2, lineHeight: 14 }]}>
                                    You have a pending authenticator factor. Tap the button to verify and complete.
                                </Text>
                            </View>
                            <TouchableOpacity 
                                activeOpacity={0.8}
                                style={[mfaStyles.pendingButton, { backgroundColor: '#F59E0B' }]}
                                onPress={handleToggleMFA}
                            >
                                <Text style={mfaStyles.pendingButtonText}>Complete</Text>
                            </TouchableOpacity>
                        </View>
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

      <ActionModal
        visible={isDisableModalVisible}
        type="warning"
        title="Delete Factor?"
        message="Are you sure you want to permanently delete this authenticator key from your account? You will need to scan a new QR code to configure it again."
        confirmText="Permanently Delete"
        cancelText="Cancel"
        onConfirm={confirmDisableMFA}
        onCancel={() => setDisableModalVisible(false)}
      />
    </View>
  );
}

const mfaStyles = StyleSheet.create({
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrContainer: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  statusIconOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  toggleTextWrapper: {
    flex: 1,
    paddingRight: 16,
  },
  switchContainer: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 3,
    justifyContent: 'center',
  },
  switchCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }
    })
  },
  pendingAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 8,
    gap: 12,
  },
  pendingButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pendingButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins-Bold',
  },
  swipeRowContainer: {
    height: 72,
    position: 'relative',
    overflow: 'hidden',
  },
  deleteActionWrapper: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteActionButton: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Poppins-Bold',
  },
  swipeFront: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: '100%',
    width: '100%',
  },
  swipeContentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000', // standard black, will adapt inside context if using custom styles
  },
  rowDescription: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#666666',
  }
});

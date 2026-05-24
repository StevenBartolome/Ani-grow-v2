import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ScrollView, TouchableOpacity, View, TextInput, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { MaterialIcons } from '@expo/vector-icons';

import { SafeAreaView } from 'react-native-safe-area-context';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type ScreenState = 'passwords' | 'methods' | 'otp';
type VerificationMethod = 'email' | 'sms' | 'authenticator';

export default function ChangePasswordScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();
    const { profile, updatePassword, getMFAFactors, verifyMFA } = useAuth();

    // Password Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Multi-Step Verification State
    const [screenState, setScreenState] = useState<ScreenState>('passwords');
    const [selectedMethod, setSelectedMethod] = useState<VerificationMethod>('email');
    const [otpCode, setOtpCode] = useState('');
    const [timer, setTimer] = useState(0);

    // MFA Factor info for authenticator
    const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
    const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
    const [hasMfaFactor, setHasMfaFactor] = useState(false);

    // User details from Profile
    const userEmail = profile?.email || '';
    const userPhone = profile?.phone || (profile as any)?.phoneNumber || '';
    const isPhoneAvailable = !!userPhone.trim();

    // Masking helpers
    const maskEmail = (email: string) => {
        if (!email) return '';
        const [local, domain] = email.split('@');
        if (local.length <= 2) return `${local[0]}***@${domain}`;
        return `${local[0]}***${local[local.length - 1]}@${domain}`;
    };

    const maskPhone = (phone: string) => {
        if (!phone) return '';
        const clean = phone.trim();
        if (clean.length <= 4) return clean;
        return `${clean.slice(0, 3)}******${clean.slice(-2)}`;
    };

    // Load MFA factors on mount to check if authenticator is available
    useEffect(() => {
        getMFAFactors().then(factors => {
            const verified = factors.find((f: any) => f.status === 'verified');
            if (verified) {
                setHasMfaFactor(true);
                setMfaFactorId(verified.id);
            }
        }).catch(() => {
            // ignore - authenticator option just won't show
        });
    }, []);

    // Countdown Timer Effect
    useEffect(() => {
        let interval: any;
        if (screenState === 'otp' && timer > 0) {
            interval = setInterval(() => {
                setTimer(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [screenState, timer]);

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // Proceed to verification selection
    const handleProceedToVerification = () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showSnackbar('Please complete all password fields.');
            return;
        }

        if (newPassword !== confirmPassword) {
            showSnackbar('New passwords do not match.');
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            showSnackbar('Password does not meet complexity requirements.');
            return;
        }

        setScreenState('methods');
    };

    // ── Real OTP / Challenge Sending ────────────────────────────────
    const handleSendCode = async () => {
        setIsLoading(true);
        try {
            if (selectedMethod === 'email') {
                // Send a real email OTP via Supabase signInWithOtp
                const { error } = await supabase.auth.signInWithOtp({
                    email: userEmail,
                    options: {
                        shouldCreateUser: false,
                    },
                });
                if (error) throw error;
                showSnackbar(`Verification code sent to ${maskEmail(userEmail)}`, 'success');

            } else if (selectedMethod === 'sms') {
                // Send a real SMS OTP via Supabase signInWithOtp
                const phone = userPhone.trim();
                if (!phone) throw new Error('No phone number available.');
                const { error } = await supabase.auth.signInWithOtp({
                    phone,
                });
                if (error) throw error;
                showSnackbar(`Verification code sent to ${maskPhone(phone)}`, 'success');

            } else if (selectedMethod === 'authenticator') {
                // Create a TOTP challenge against the user's registered MFA factor
                if (!mfaFactorId) throw new Error('No authenticator factor registered.');
                const { data, error } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
                if (error) throw error;
                setMfaChallengeId(data.id);
                showSnackbar('Open your authenticator app and enter the 6-digit code.', 'success');
            }

            setTimer(60);
            setOtpCode('');
            setScreenState('otp');
        } catch (err: any) {
            console.error('[ChangePassword] Send code error:', err);
            showSnackbar(err.message || 'Failed to send verification code.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Verify OTP and complete password update ──────────────────────
    const handleVerifyAndSave = async (enteredOtp: string) => {
        if (enteredOtp.length < 6) return;
        setIsLoading(true);
        try {
            if (selectedMethod === 'email') {
                // Verify email OTP — this also upgrades the session AAL
                const { error } = await supabase.auth.verifyOtp({
                    email: userEmail,
                    token: enteredOtp,
                    type: 'email',
                });
                if (error) throw error;

            } else if (selectedMethod === 'sms') {
                // Verify SMS OTP
                const phone = userPhone.trim();
                const { error } = await supabase.auth.verifyOtp({
                    phone,
                    token: enteredOtp,
                    type: 'sms',
                });
                if (error) throw error;

            } else if (selectedMethod === 'authenticator') {
                // Verify TOTP challenge
                if (!mfaFactorId) throw new Error('No authenticator factor available.');
                if (!mfaChallengeId) throw new Error('No active challenge. Please resend the code.');
                await verifyMFA(mfaFactorId, enteredOtp, mfaChallengeId);
            }

            // All verification methods passed — now update the password
            await updatePassword(newPassword);

            showSnackbar('Password updated successfully!', 'success');
            setTimeout(() => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/(dashboard)/HomeScreen');
                }
            }, 1500);
        } catch (error: any) {
            console.error('[ChangePassword] Verify error:', error);
            const msg = error.message || 'Invalid verification code. Please try again.';
            showSnackbar(msg);
            setIsLoading(false);
        }
    };

    // Trigger check on typing OTP
    const handleOtpChange = (text: string) => {
        const numeric = text.replace(/[^0-9]/g, '');
        if (numeric.length <= 6) {
            setOtpCode(numeric);
            if (numeric.length === 6) {
                handleVerifyAndSave(numeric);
            }
        }
    };

    // Header Back action override based on steps
    const handleHeaderBack = () => {
        if (screenState === 'otp') {
            setScreenState('methods');
            setOtpCode('');
        } else if (screenState === 'methods') {
            setScreenState('passwords');
        } else {
            if (router.canGoBack()) {
                router.back();
            } else {
                router.replace('/(dashboard)/HomeScreen');
            }
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity 
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            backgroundColor: colors.surface,
                            zIndex: 99
                        }}
                        onPress={handleHeaderBack}
                        activeOpacity={0.8}
                    >
                        <MaterialIcons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1, marginRight: 44 }]}>
                        {screenState === 'passwords' ? 'Change Password' : screenState === 'methods' ? 'Verify Identity' : 'Verify Code'}
                    </Text>
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    {/* Step 1: Input Passwords */}
                    {screenState === 'passwords' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Security</Text>
                            <Text style={styles.sectionDescription}>Choose a strong, unique password to protect your account.</Text>

                            <View style={[styles.card, { paddingVertical: 8 }]}>
                                <View style={styles.inputGroup}>
                                    <FloatingLabelInput
                                        label="Current Password"
                                        icon="lock"
                                        value={currentPassword}
                                        onChangeText={setCurrentPassword}
                                        isPassword
                                        backgroundColor={colors.surface}
                                    />
                                    <View style={{ marginTop: 0 }}>
                                        <FloatingLabelInput
                                            label="New Password"
                                            icon="lock"
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                            isPassword
                                            backgroundColor={colors.surface}
                                        />
                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4, lineHeight: 18 }]}>
                                            Passwords must have at least 8 characters and include a mix of uppercase letters, lowercase letters, numbers, and symbols.
                                        </Text>
                                    </View>
                                    <FloatingLabelInput
                                        label="Confirm New Password"
                                        icon="lock"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        isPassword
                                        backgroundColor={colors.surface}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity 
                                style={[styles.button, { marginTop: 24 }]} 
                                activeOpacity={0.8} 
                                onPress={handleProceedToVerification}
                            >
                                <Text style={styles.buttonText}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Step 2: Choose Verification Method */}
                    {screenState === 'methods' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Security Verification</Text>
                            <Text style={styles.sectionDescription}>Select how you would like to verify your identity before changing your password:</Text>

                            {/* Email OTP Option */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 16,
                                    borderRadius: 16,
                                    borderWidth: 1.5,
                                    borderColor: selectedMethod === 'email' ? colors.primary : colors.stroke,
                                    backgroundColor: selectedMethod === 'email' ? colors.primary + '0D' : colors.surface,
                                    marginBottom: 12,
                                    gap: 12,
                                }}
                                onPress={() => setSelectedMethod('email')}
                            >
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '1F', alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="email" size={22} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>Email OTP</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                        Code sent to {maskEmail(userEmail)}
                                    </Text>
                                </View>
                                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedMethod === 'email' ? colors.primary : colors.stroke, alignItems: 'center', justifyContent: 'center' }}>
                                    {selectedMethod === 'email' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                </View>
                            </TouchableOpacity>

                            {/* SMS OTP Option */}
                            <TouchableOpacity
                                activeOpacity={isPhoneAvailable ? 0.8 : 1}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 16,
                                    borderRadius: 16,
                                    borderWidth: 1.5,
                                    borderColor: selectedMethod === 'sms' ? colors.primary : colors.stroke,
                                    backgroundColor: selectedMethod === 'sms' ? colors.primary + '0D' : colors.surface,
                                    marginBottom: 12,
                                    gap: 12,
                                    opacity: isPhoneAvailable ? 1 : 0.45,
                                }}
                                onPress={() => isPhoneAvailable && setSelectedMethod('sms')}
                            >
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.secondary + '1F', alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="phone-iphone" size={22} color={colors.secondary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>SMS OTP</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                        {isPhoneAvailable ? `Code sent to ${maskPhone(userPhone)}` : 'Phone number not set up in profile'}
                                    </Text>
                                </View>
                                {isPhoneAvailable && (
                                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedMethod === 'sms' ? colors.primary : colors.stroke, alignItems: 'center', justifyContent: 'center' }}>
                                        {selectedMethod === 'sms' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                    </View>
                                )}
                            </TouchableOpacity>

                            {/* Authenticator App Option */}
                            <TouchableOpacity
                                activeOpacity={hasMfaFactor ? 0.8 : 1}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 16,
                                    borderRadius: 16,
                                    borderWidth: 1.5,
                                    borderColor: selectedMethod === 'authenticator' ? colors.primary : colors.stroke,
                                    backgroundColor: selectedMethod === 'authenticator' ? colors.primary + '0D' : colors.surface,
                                    marginBottom: 24,
                                    gap: 12,
                                    opacity: hasMfaFactor ? 1 : 0.45,
                                }}
                                onPress={() => hasMfaFactor && setSelectedMethod('authenticator')}
                            >
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#6C63FF1F', alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="security" size={22} color="#6C63FF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>Authenticator App</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                        {hasMfaFactor ? 'Generate code from your authenticator app' : 'No authenticator app set up in MFA settings'}
                                    </Text>
                                </View>
                                {hasMfaFactor && (
                                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedMethod === 'authenticator' ? colors.primary : colors.stroke, alignItems: 'center', justifyContent: 'center' }}>
                                        {selectedMethod === 'authenticator' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.button, isLoading && { opacity: 0.7 }]} 
                                activeOpacity={0.8} 
                                onPress={handleSendCode}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator size="small" color={colors.onPrimary} />
                                ) : (
                                    <Text style={styles.buttonText}>Send Code</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Step 3: Enter OTP */}
                    {screenState === 'otp' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                {selectedMethod === 'authenticator' ? 'Authenticator Code' : 'Verification Code'}
                            </Text>
                            <Text style={styles.sectionDescription}>
                                {selectedMethod === 'email'
                                    ? `Enter the 6-digit code sent to your email `
                                    : selectedMethod === 'sms'
                                    ? `Enter the 6-digit code sent to your phone `
                                    : `Open your authenticator app and enter the current 6-digit code `
                                }
                                <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>
                                    {selectedMethod === 'email'
                                        ? maskEmail(userEmail)
                                        : selectedMethod === 'sms'
                                        ? maskPhone(userPhone)
                                        : ''}
                                </Text>
                                {selectedMethod !== 'authenticator' ? '.' : ''}
                            </Text>

                            <View style={{ marginVertical: 24, width: '100%' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', position: 'relative', width: '100%', paddingHorizontal: 4 }}>
                                    {[0, 1, 2, 3, 4, 5].map((index) => {
                                        const isFocused = otpCode.length === index || (otpCode.length === 6 && index === 5);
                                        const isFilled = otpCode.length > index;

                                        return (
                                            <View
                                                key={index}
                                                style={{
                                                    flex: 1,
                                                    maxWidth: 46,
                                                    aspectRatio: 0.8,
                                                    borderRadius: 12,
                                                    backgroundColor: isFocused ? colors.primary + '10' : colors.surface,
                                                    borderWidth: 2,
                                                    borderColor: isFocused ? colors.primary : isFilled ? colors.primary + '40' : colors.stroke,
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <Text 
                                                    style={[
                                                        textStyles.h1, 
                                                        { 
                                                            fontSize: 24, 
                                                            color: isFocused ? colors.primary : colors.text,
                                                            lineHeight: 28
                                                        }
                                                    ]}
                                                >
                                                    {otpCode[index] || ''}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    <TextInput
                                        value={otpCode}
                                        onChangeText={handleOtpChange}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        autoFocus
                                        caretHidden
                                        style={{
                                            position: 'absolute',
                                            width: '100%',
                                            height: '100%',
                                            opacity: 0,
                                            zIndex: 10,
                                        }}
                                    />
                                </View>
                            </View>

                            {isLoading ? (
                                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
                            ) : (
                                <>
                                    {/* Resend button — not shown for authenticator */}
                                    {selectedMethod !== 'authenticator' && (
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                                            <Text style={[textStyles.body, { color: colors.textGrey }]}>Didn't receive code? </Text>
                                            <TouchableOpacity 
                                                disabled={timer > 0} 
                                                onPress={handleSendCode}
                                            >
                                                <Text style={[textStyles.label, { color: timer > 0 ? colors.textGrey : colors.primary }]}>
                                                    {timer > 0 ? `Resend in ${timer}s` : 'Resend Code'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <TouchableOpacity 
                                        style={{ alignSelf: 'center', paddingVertical: 8 }}
                                        onPress={() => {
                                            setOtpCode('');
                                            setMfaChallengeId(null);
                                            setScreenState('methods');
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.label, { color: colors.primary }]}>Try another way</Text>
                                    </TouchableOpacity>
                                </>
                            )}
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

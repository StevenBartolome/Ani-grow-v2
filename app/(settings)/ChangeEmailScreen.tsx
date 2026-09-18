import { useRouter } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, TouchableOpacity, View, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/components/Text';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

/**
 * Change Email Flow (4 steps):
 *   1. 'input'    — Enter new email address
 *   2. 'verify_current' — Verify identity via current email OTP | SMS | Authenticator
 *   3. 'otp_current'    — Enter code for current identity verification
 *   4. 'otp_new'        — Enter OTP sent to new email to confirm ownership
 */
type Step = 'input' | 'verify_current' | 'otp_current' | 'otp_new';
type VerificationMethod = 'email' | 'sms' | 'authenticator';

export default function ChangeEmailScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();
    const router = useRouter();
    const { profile, getMFAFactors, verifyMFA, refreshProfile } = useAuth();

    const currentEmail = profile?.email || '';
    const userPhone = profile?.phone || (profile as any)?.phoneNumber || '';
    const isPhoneAvailable = !!userPhone.trim();

    const [newEmail, setNewEmail] = useState('');
    const [newEmailError, setNewEmailError] = useState('');

    // Step state
    const [step, setStep] = useState<Step>('input');
    const [selectedMethod, setSelectedMethod] = useState<VerificationMethod>('email');
    const [otpCode, setOtpCode] = useState('');
    const [timer, setTimer] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // TextInput ref — focused once when entering OTP step to avoid keyboard spam
    const otpInputRef = useRef<TextInput>(null);

    // MFA Factor state
    const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
    const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
    const [hasMfaFactor, setHasMfaFactor] = useState(false);

    // Masking helpers
    const maskEmail = (email: string) => {
        if (!email) return '';
        const [local, domain] = email.split('@');
        if (!local || !domain) return email;
        if (local.length <= 2) return `${local[0]}***@${domain}`;
        return `${local[0]}***${local[local.length - 1]}@${domain}`;
    };
    const maskPhone = (phone: string) => {
        if (!phone) return '';
        const clean = phone.trim();
        if (clean.length <= 4) return clean;
        return `${clean.slice(0, 3)}******${clean.slice(-2)}`;
    };

    // Snackbar
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');
    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // Load MFA factors on mount
    useEffect(() => {
        getMFAFactors().then(factors => {
            const verified = factors.find((f: any) => f.status === 'verified');
            if (verified) {
                setHasMfaFactor(true);
                setMfaFactorId(verified.id);
            }
        }).catch(() => { /* ignore */ });
    }, []);

    // Focus the hidden input once when entering an OTP step
    useEffect(() => {
        if (step === 'otp_current' || step === 'otp_new') {
            setTimeout(() => otpInputRef.current?.focus(), 100);
        }
    }, [step]);

    // Countdown timer
    useEffect(() => {
        let interval: any;
        if ((step === 'otp_current' || step === 'otp_new') && timer > 0) {
            interval = setInterval(() => setTimer(prev => prev - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [step, timer]);

    // ── Step 1: Validate new email and proceed ──────────────────────
    const handleProceed = async () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!newEmail.trim()) {
            setNewEmailError('Please enter a new email address.');
            return;
        }
        if (!emailRegex.test(newEmail.trim())) {
            setNewEmailError('Please enter a valid email address.');
            return;
        }
        if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) {
            setNewEmailError('New email must be different from your current email.');
            return;
        }
        setNewEmailError('');

        if (!hasMfaFactor) {
            // Bypass current identity verification completely when MFA is disabled!
            setIsLoading(true);
            await sendNewEmailOtp();
        } else {
            // MFA is enabled — force authenticator re-verification
            setIsLoading(true);
            try {
                if (!mfaFactorId) throw new Error('No authenticator factor registered.');
                const { data, error } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
                if (error) throw error;
                
                setMfaChallengeId(data.id);
                setSelectedMethod('authenticator');
                setOtpCode('');
                setTimer(0);
                setStep('otp_current');
                showSnackbar('Open your authenticator app and enter the 6-digit code.', 'success');
            } catch (err: any) {
                showSnackbar(err.message || 'Failed to initiate MFA challenge.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    // ── Step 2: Send identity verification code ─────────────────────
    const handleSendCurrentVerification = async () => {
        setIsLoading(true);
        try {
            if (selectedMethod === 'email') {
                const { error } = await supabase.auth.signInWithOtp({
                    email: currentEmail,
                    options: { shouldCreateUser: false },
                });
                if (error) throw error;
                showSnackbar(`Code sent to ${maskEmail(currentEmail)}`, 'success');
            } else if (selectedMethod === 'sms') {
                if (!userPhone.trim()) throw new Error('No phone number available.');
                const { error } = await supabase.auth.signInWithOtp({ phone: userPhone.trim() });
                if (error) throw error;
                showSnackbar(`Code sent to ${maskPhone(userPhone)}`, 'success');
            } else if (selectedMethod === 'authenticator') {
                if (!mfaFactorId) throw new Error('No authenticator factor registered.');
                const { data, error } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
                if (error) throw error;
                setMfaChallengeId(data.id);
                showSnackbar('Open your authenticator app and enter the 6-digit code.', 'success');
            }
            setOtpCode('');
            setTimer(60);
            setStep('otp_current');
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to send verification code.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step 3: Verify current identity OTP ────────────────────────
    const handleVerifyCurrentOtp = async (code: string) => {
        if (code.length < 6) return;
        setIsLoading(true);
        try {
            if (selectedMethod === 'email') {
                const { error } = await supabase.auth.verifyOtp({
                    email: currentEmail,
                    token: code,
                    type: 'email',
                });
                if (error) throw error;
            } else if (selectedMethod === 'sms') {
                const { error } = await supabase.auth.verifyOtp({
                    phone: userPhone.trim(),
                    token: code,
                    type: 'sms',
                });
                if (error) throw error;
            } else if (selectedMethod === 'authenticator') {
                if (!mfaFactorId) throw new Error('No authenticator factor available.');
                if (!mfaChallengeId) throw new Error('No active challenge. Please resend.');
                await verifyMFA(mfaFactorId, code, mfaChallengeId);
            }

            // Identity verified — now trigger new email OTP
            await sendNewEmailOtp();
        } catch (err: any) {
            showSnackbar(err.message || 'Invalid code. Please try again.');
            setIsLoading(false);
        }
    };

    // ── Step 4: Send OTP to new email address ───────────────────────
    const sendNewEmailOtp = async () => {
        try {
            // Initiate the email change in Supabase Auth (this automatically sends the OTP/confirmation to the new address)
            const { error: updateErr } = await supabase.auth.updateUser({
                email: newEmail.trim(),
            });
            if (updateErr) throw updateErr;

            showSnackbar(`Confirmation code sent to ${maskEmail(newEmail)}`, 'success');
            setOtpCode('');
            setTimer(60);
            setStep('otp_new');
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to send confirmation to new email.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step 4: Verify new email OTP ────────────────────────────────
    const handleVerifyNewEmailOtp = async (code: string) => {
        if (code.length < 6) return;
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.verifyOtp({
                email: newEmail.trim(),
                token: code,
                type: 'email_change',
            });
            if (error) throw error;

            // Update email in users table
            if (profile?.uid) {
                await supabase.from('users').update({
                    email: newEmail.trim(),
                    updated_at: new Date().toISOString(),
                }).eq('id', profile.uid);
            }

            await refreshProfile();
            showSnackbar('Email updated successfully!', 'success');
            setTimeout(() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(dashboard)/HomeScreen');
            }, 1500);
        } catch (err: any) {
            showSnackbar(err.message || 'Invalid code. Please try again.');
            setIsLoading(false);
        }
    };

    // Generic OTP change handler — routes to the right verifier
    const handleOtpChange = (text: string) => {
        const numeric = text.replace(/[^0-9]/g, '');
        if (numeric.length <= 6) {
            setOtpCode(numeric);
            if (numeric.length === 6) {
                if (step === 'otp_current') handleVerifyCurrentOtp(numeric);
                else if (step === 'otp_new') handleVerifyNewEmailOtp(numeric);
            }
        }
    };

    // Header back logic
    const handleBack = () => {
        if (step === 'otp_new') {
            // Go back to new email OTP resend (step 4 doesn't have another option)
            setOtpCode('');
        } else if (step === 'otp_current') {
            setOtpCode('');
            setMfaChallengeId(null);
            setStep('verify_current');
        } else if (step === 'verify_current') {
            setStep('input');
        } else {
            if (router.canGoBack()) router.back();
            else router.replace('/(dashboard)/HomeScreen');
        }
    };

    // Step title helper
    const stepTitle = () => {
        if (step === 'input') return 'Change Email';
        if (step === 'verify_current') return 'Verify Identity';
        if (step === 'otp_current') return 'Verify Code';
        return 'Confirm New Email';
    };


    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={{
                            width: 44, height: 44, borderRadius: 22,
                            alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1, borderColor: colors.stroke,
                            backgroundColor: colors.surface, zIndex: 99,
                        }}
                        onPress={handleBack}
                        activeOpacity={0.8}
                    >
                        <MaterialIcons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1, marginRight: 44 }]}>
                        {stepTitle()}
                    </Text>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    {/* ─── Step 1: New email input ─────────────────────────────── */}
                    {step === 'input' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>New Email Address</Text>
                            <Text style={styles.sectionDescription}>
                                Enter the email address you want to switch to. You'll need to verify both your current identity and access to the new address.
                            </Text>

                            <View style={[styles.card, { paddingVertical: 8 }]}>
                                {/* Current email (read-only) */}
                                <View style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 12,
                                    paddingHorizontal: 16, paddingVertical: 14,
                                    borderRadius: 12, borderWidth: 1, borderColor: colors.stroke,
                                    backgroundColor: colors.cardFill, marginBottom: 16,
                                }}>
                                    <MaterialIcons name="email" size={20} color={colors.textGrey} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.body, { fontSize: 11, color: colors.textGrey, marginBottom: 2 }]}>Current Email</Text>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]} translate={false}>{currentEmail}</Text>
                                    </View>
                                    <View style={{ backgroundColor: colors.primary + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                                        <Text style={[textStyles.body, { fontSize: 10, color: colors.primary }]}>Current</Text>
                                    </View>
                                </View>

                                <View style={styles.inputGroup}>
                                    <FloatingLabelInput
                                        label="New Email Address"
                                        icon="alternate-email"
                                        value={newEmail}
                                        onChangeText={(t) => { setNewEmail(t); setNewEmailError(''); }}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        backgroundColor={colors.surface}
                                    />
                                    {!!newEmailError && (
                                        <Text style={{ color: colors.error, fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 }}>
                                            {newEmailError}
                                        </Text>
                                    )}
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.button, { marginTop: 24 }]}
                                activeOpacity={0.8}
                                onPress={handleProceed}
                            >
                                <Text style={styles.buttonText}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ─── Step 2: Verify current identity ────────────────────── */}
                    {step === 'verify_current' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Verify Your Identity</Text>
                            <Text style={styles.sectionDescription}>
                                Before changing your email, confirm it's really you. Choose how you'd like to verify:
                            </Text>

                            {/* Email OTP */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    padding: 16, borderRadius: 16, borderWidth: 1.5,
                                    borderColor: selectedMethod === 'email' ? colors.primary : colors.stroke,
                                    backgroundColor: selectedMethod === 'email' ? colors.primary + '0D' : colors.surface,
                                    marginBottom: 12, gap: 12,
                                }}
                                onPress={() => setSelectedMethod('email')}
                            >
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '1F', alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="email" size={22} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>Email OTP</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                        Code to {maskEmail(currentEmail)}
                                    </Text>
                                </View>
                                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedMethod === 'email' ? colors.primary : colors.stroke, alignItems: 'center', justifyContent: 'center' }}>
                                    {selectedMethod === 'email' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                </View>
                            </TouchableOpacity>

                            {/* SMS OTP */}
                            <TouchableOpacity
                                activeOpacity={isPhoneAvailable ? 0.8 : 1}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    padding: 16, borderRadius: 16, borderWidth: 1.5,
                                    borderColor: selectedMethod === 'sms' ? colors.primary : colors.stroke,
                                    backgroundColor: selectedMethod === 'sms' ? colors.primary + '0D' : colors.surface,
                                    marginBottom: 12, gap: 12,
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
                                        {isPhoneAvailable ? `Code to ${maskPhone(userPhone)}` : 'No phone number set up in profile'}
                                    </Text>
                                </View>
                                {isPhoneAvailable && (
                                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedMethod === 'sms' ? colors.primary : colors.stroke, alignItems: 'center', justifyContent: 'center' }}>
                                        {selectedMethod === 'sms' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                    </View>
                                )}
                            </TouchableOpacity>

                            {/* Authenticator App */}
                            <TouchableOpacity
                                activeOpacity={hasMfaFactor ? 0.8 : 1}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    padding: 16, borderRadius: 16, borderWidth: 1.5,
                                    borderColor: selectedMethod === 'authenticator' ? colors.primary : colors.stroke,
                                    backgroundColor: selectedMethod === 'authenticator' ? colors.primary + '0D' : colors.surface,
                                    marginBottom: 24, gap: 12,
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
                                        {hasMfaFactor ? 'Generate code from your authenticator app' : 'No authenticator app set up'}
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
                                onPress={handleSendCurrentVerification}
                                disabled={isLoading}
                            >
                                {isLoading
                                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                                    : <Text style={styles.buttonText}>Send Code</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ─── Step 3: OTP for current identity ───────────────────── */}
                    {step === 'otp_current' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                {selectedMethod === 'authenticator' ? 'Authenticator Code' : 'Verification Code'}
                            </Text>
                            <Text style={styles.sectionDescription}>
                                {selectedMethod === 'email'
                                    ? `Enter the 6-digit code sent to your current email `
                                    : selectedMethod === 'sms'
                                    ? `Enter the 6-digit code sent to `
                                    : `Enter the current 6-digit code from your authenticator app.`
                                }
                                {selectedMethod !== 'authenticator' && (
                                    <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>
                                        {selectedMethod === 'email' ? maskEmail(currentEmail) : maskPhone(userPhone)}
                                    </Text>
                                )}
                            </Text>

                            <View style={{ marginVertical: 24, width: '100%' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', position: 'relative', width: '100%', paddingHorizontal: 4 }}>
                                    {[0, 1, 2, 3, 4, 5].map((index) => {
                                        const isFocused = otpCode.length === index || (otpCode.length === 6 && index === 5);
                                        const isFilled = otpCode.length > index;
                                        return (
                                            <View key={index} style={{
                                                flex: 1, maxWidth: 46, aspectRatio: 0.8, borderRadius: 12,
                                                backgroundColor: isFocused ? colors.primary + '10' : colors.surface,
                                                borderWidth: 2,
                                                borderColor: isFocused ? colors.primary : isFilled ? colors.primary + '40' : colors.stroke,
                                                justifyContent: 'center', alignItems: 'center',
                                            }}>
                                                <Text style={[textStyles.h1, { fontSize: 24, color: isFocused ? colors.primary : colors.text, lineHeight: 28 }]}>
                                                    {otpCode[index] || ''}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    <TextInput
                                        ref={otpInputRef}
                                        value={otpCode}
                                        onChangeText={handleOtpChange}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        caretHidden
                                        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, zIndex: 10 }}
                                    />
                                </View>
                            </View>

                            {isLoading ? (
                                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
                            ) : (
                                <>
                                    {selectedMethod !== 'authenticator' && (
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                                            <Text style={[textStyles.body, { color: colors.textGrey }]}>Didn't receive code? </Text>
                                            <TouchableOpacity disabled={timer > 0} onPress={handleSendCurrentVerification}>
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
                                            setStep('verify_current');
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.label, { color: colors.primary }]}>Try another way</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    )}

                    {/* ─── Step 4: OTP for new email ───────────────────────────── */}
                    {step === 'otp_new' && (
                        <View style={styles.section}>
                            {/* Step progress indicator */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: colors.primary + '10',
                                borderRadius: 12, padding: 12, marginBottom: 16, gap: 10,
                            }}>
                                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="check" size={18} color={colors.onPrimary} />
                                </View>
                                <Text style={[textStyles.body, { flex: 1, color: colors.primary, fontSize: 12 }]}>
                                    Identity verified. Now confirm access to your new email.
                                </Text>
                            </View>

                            <Text style={styles.sectionTitle}>Confirm New Email</Text>
                            <Text style={styles.sectionDescription}>
                                We've sent a 6-digit confirmation code to your new email address{' '}
                                <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{maskEmail(newEmail)}</Text>
                                {'. '}Enter it below to complete the change:
                            </Text>

                            <View style={{ marginVertical: 24, width: '100%' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', position: 'relative', width: '100%', paddingHorizontal: 4 }}>
                                    {[0, 1, 2, 3, 4, 5].map((index) => {
                                        const isFocused = otpCode.length === index || (otpCode.length === 6 && index === 5);
                                        const isFilled = otpCode.length > index;
                                        return (
                                            <View key={index} style={{
                                                flex: 1, maxWidth: 46, aspectRatio: 0.8, borderRadius: 12,
                                                backgroundColor: isFocused ? colors.primary + '10' : colors.surface,
                                                borderWidth: 2,
                                                borderColor: isFocused ? colors.primary : isFilled ? colors.primary + '40' : colors.stroke,
                                                justifyContent: 'center', alignItems: 'center',
                                            }}>
                                                <Text style={[textStyles.h1, { fontSize: 24, color: isFocused ? colors.primary : colors.text, lineHeight: 28 }]}>
                                                    {otpCode[index] || ''}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    <TextInput
                                        ref={otpInputRef}
                                        value={otpCode}
                                        onChangeText={handleOtpChange}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        caretHidden
                                        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, zIndex: 10 }}
                                    />
                                </View>
                            </View>

                            {isLoading ? (
                                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
                            ) : (
                                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey }]}>Didn't receive code? </Text>
                                    <TouchableOpacity disabled={timer > 0} onPress={sendNewEmailOtp}>
                                        <Text style={[textStyles.label, { color: timer > 0 ? colors.textGrey : colors.primary }]}>
                                            {timer > 0 ? `Resend in ${timer}s` : 'Resend Code'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
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
        </View>
    );
}

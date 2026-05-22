import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuthStyles } from '@/styles/authStyles';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type InviteData = {
    invite_id: string;
    farm_id: string;
    role: string;
    farm_name: string;
    permissions: Record<string, boolean>;
};

const PERMISSION_LABELS: Record<string, { label: string; icon: string }> = {
    dashboard:       { label: 'Dashboard',       icon: 'dashboard' },
    devices:         { label: 'Devices',         icon: 'devices' },
    animals_guide:   { label: 'Animals Guide',    icon: 'pets' },
    health_records:  { label: 'Health Records',   icon: 'medical-services' },
    analytics:       { label: 'Analytics',        icon: 'analytics' },
    feeding_control: { label: 'Feeding Control',  icon: 'restaurant' },
};

export default function RegisterScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const authStyles = useAuthStyles();
    const { signInWithGoogle, resendVerificationCode } = useAuth();

    // Step 1 — Invite code
    const [inviteCodeInput, setInviteCodeInput] = useState('');
    const [inviteData, setInviteData] = useState<InviteData | null>(null);
    const [isValidatingCode, setIsValidatingCode] = useState(false);
    const [codeError, setCodeError] = useState('');

    // Step 2 — Personal details
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');

    // Step 3 — Account credentials
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [agreeTerms, setAgreeTerms] = useState(false);

    // Step 4 — OTP
    const [otpCode, setOtpCode] = useState('');
    const [pendingEmail, setPendingEmail] = useState('');

    // Shared
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const getStepInfo = () => {
        switch (step) {
            case 1: return { title: 'Enter Invite Code', subtitle: 'Your farm admin will provide an AGR-XXXXXX invite code.' };
            case 2: return { title: 'Personal Details',  subtitle: 'Tell us a bit about yourself.' };
            case 3: return { title: 'Create Account',    subtitle: 'Set up your login credentials.' };
            case 4: return { title: 'Verify Email',      subtitle: 'Enter the 6-digit code we sent to your email.' };
            default: return { title: '', subtitle: '' };
        }
    };

    // ── Step 1: Validate invite code via anon-accessible RPC ──────
    const handleValidateCode = async () => {
        const code = inviteCodeInput.trim().toUpperCase();
        if (!code) { setCodeError('Please enter an invite code.'); return; }
        if (!/^AGR-[A-Z0-9]{6}$/.test(code)) {
            setCodeError('Invalid format. Code should look like AGR-XXXXXX.');
            return;
        }

        setCodeError('');
        setInviteData(null);
        setIsValidatingCode(true);

        try {
            const { data, error } = await supabase.rpc('validate_invite_code', { code_input: code });

            if (error) throw error;

            const result = Array.isArray(data) ? data[0] : data;

            if (!result || !result.valid) {
                setCodeError('This code is invalid, expired, or has already been used.');
                return;
            }

            setInviteData({
                invite_id:   result.invite_id,
                farm_id:     result.farm_id,
                role:        result.role,
                farm_name:   result.farm_name,
                permissions: result.permissions ?? {},
            });
        } catch (err: any) {
            setCodeError(err.message || 'Failed to validate code. Please try again.');
        } finally {
            setIsValidatingCode(false);
        }
    };

    // ── Create user profile + mark invite used (post-auth) ────────
    const createUserProfile = async (userId: string, userEmail: string) => {
        if (!inviteData) return;

        const { error: profileError } = await supabase
            .from('users')
            .upsert({
                id:          userId,
                email:       userEmail,
                first_name:  firstName.trim(),
                last_name:   lastName.trim(),
                username:    username.trim().toLowerCase(),
                role:        inviteData.role,
                farm_id:     inviteData.farm_id,
                permissions: inviteData.permissions,
                status:      'Active',
                invited_by:  inviteData.invite_id,
                updated_at:  new Date().toISOString(),
            });

        if (profileError) throw profileError;

        // Mark the invite code as used via SECURITY DEFINER RPC
        await supabase.rpc('mark_invite_used', { p_invite_id: inviteData.invite_id });
    };

    // ── Step 3: Sign up with email/password ───────────────────────
    const handleRegister = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    data: {
                        first_name: firstName.trim(),
                        last_name:  lastName.trim(),
                        username:   username.trim().toLowerCase(),
                    },
                },
            });

            if (error) throw error;

            if (data.user) {
                setPendingEmail(email.trim());
                if (data.session) {
                    // Email confirmation disabled — active session immediately
                    await createUserProfile(data.user.id, data.user.email ?? email.trim());
                    showSnackbar('Account created successfully!', 'success');
                    setTimeout(() => router.replace('/(auth)/LoginScreen'), 1500);
                } else {
                    showSnackbar('Verification code sent to your email.', 'success');
                    setStep(4);
                }
            }
        } catch (err: any) {
            if (err.message?.includes('already registered')) {
                showSnackbar('This email is already registered.', 'error');
            } else {
                showSnackbar(err.message || 'Registration failed. Please try again.', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step 4: Verify OTP ────────────────────────────────────────
    const handleVerifyOtp = async () => {
        if (otpCode.length < 6) {
            showSnackbar('Please enter the complete 6-digit code.');
            return;
        }

        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email: pendingEmail || email.trim(),
                token: otpCode,
                type:  'signup',
            });

            if (error) throw error;

            if (data.user) {
                await createUserProfile(data.user.id, data.user.email ?? pendingEmail);
                showSnackbar('Email verified! Account created.', 'success');
                setTimeout(() => router.replace('/(auth)/LoginScreen'), 1500);
            }
        } catch (err: any) {
            showSnackbar(err.message || 'Invalid verification code.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Google OAuth (requires invite validated in step 1) ────────
    const handleGoogleSignup = async () => {
        if (!inviteData) {
            showSnackbar('Please validate your invite code first (step 1).');
            return;
        }

        setIsLoading(true);
        try {
            await signInWithGoogle();

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: existing } = await supabase
                    .from('users')
                    .select('id')
                    .eq('id', user.id)
                    .maybeSingle();

                if (!existing) {
                    await createUserProfile(user.id, user.email ?? '');
                    showSnackbar('Google account linked successfully!', 'success');
                }
                router.replace('/(dashboard)' as any);
            }
        } catch (err: any) {
            if (err.message !== 'canceled') {
                showSnackbar(err.message || 'Google sign-up failed.', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ── Navigation ────────────────────────────────────────────────
    const handleNext = async () => {
        if (isLoading) return;

        if (step === 1) {
            if (!inviteData) { setCodeError('Please validate your invite code first.'); return; }
            setStep(2);

        } else if (step === 2) {
            if (!firstName.trim() || !lastName.trim() || !username.trim()) {
                showSnackbar('Please complete all fields.');
                return;
            }
            if (/\s/.test(username.trim())) {
                showSnackbar('Username cannot contain spaces.');
                return;
            }
            setStep(3);

        } else if (step === 3) {
            if (!email.trim() || !password || !confirmPassword) {
                showSnackbar('Please complete all fields.');
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                showSnackbar('Please enter a valid email address.');
                return;
            }
            if (password.length < 8) {
                showSnackbar('Password must be at least 8 characters.');
                return;
            }
            if (password !== confirmPassword) {
                showSnackbar('Passwords do not match.');
                return;
            }
            if (!agreeTerms) {
                showSnackbar('Please agree to the Terms of Service and Privacy Policy.');
                return;
            }
            await handleRegister();

        } else if (step === 4) {
            await handleVerifyOtp();
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        } else {
            router.back();
        }
    };

    const handleResendCode = async () => {
        try {
            await resendVerificationCode((pendingEmail || email).trim());
            showSnackbar('New code sent! Check your email.', 'success');
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to resend code.', 'error');
        }
    };

    const stepInfo = getStepInfo();

    return (
        <SafeAreaView style={authStyles.safeArea}>
            <KeyboardAvoidingView
                style={authStyles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={authStyles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={authStyles.container}>

                        {/* ── Top nav row ── */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            width: '100%',
                            marginBottom: 32,
                            justifyContent: 'space-between',
                            zIndex: 10,
                        }}>
                            <View style={{ width: 44, height: 44 }}>
                                <BackButton onPress={handleBack} />
                            </View>

                            {/* Step indicators */}
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {[1, 2, 3, 4].map((s, index) => {
                                    const isCompleted = step > s;
                                    const isActive    = step === s;
                                    const isFuture    = step < s;
                                    return (
                                        <React.Fragment key={s}>
                                            <View style={{
                                                width: 30, height: 30, borderRadius: 15,
                                                backgroundColor: isActive ? colors.primary : colors.surface,
                                                borderWidth: isFuture ? 1 : 2,
                                                borderColor: isFuture ? colors.stroke : colors.primary,
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {isCompleted ? (
                                                    <MaterialIcons name="check" size={16} color={colors.primary} />
                                                ) : (
                                                    <Text style={[textStyles.label, { color: isActive ? colors.onPrimary : colors.textGrey, fontSize: 12, marginTop: 1 }]}>
                                                        {s}
                                                    </Text>
                                                )}
                                            </View>
                                            {index < 3 && (
                                                <View style={{ width: 18, height: 2, backgroundColor: isCompleted ? colors.primary : colors.stroke, marginHorizontal: 3 }} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </View>
                            <View style={{ width: 44, height: 44 }} />
                        </View>

                        {/* ── Branding + title ── */}
                        <View style={[authStyles.brandingWrapper, { alignItems: 'flex-start', marginBottom: 24 }]}>
                            <View style={[authStyles.brandingRow, { marginBottom: 16, flexDirection: 'row', alignItems: 'center' }]}>
                                <Image
                                    source={require('../../assets/branding/anigrow_logo.svg')}
                                    style={{ width: 44, height: 44 }}
                                    contentFit="contain"
                                />
                                <Text style={[textStyles.h1, { fontSize: 24, color: colors.primary, marginLeft: 12, lineHeight: 44 }]}>
                                    Ani-Grow
                                </Text>
                            </View>
                            <Text style={[textStyles.h1, { fontSize: 32, lineHeight: 40, color: colors.text }]}>
                                {stepInfo.title}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                                {stepInfo.subtitle}
                            </Text>
                        </View>

                        <View style={authStyles.form}>

                            {/* ══ Step 1: Invite Code ══ */}
                            {step === 1 && (
                                <View>
                                    <FloatingLabelInput
                                        label="Invite Code"
                                        icon="vpn-key"
                                        value={inviteCodeInput}
                                        onChangeText={(text) => {
                                            setInviteCodeInput(text.toUpperCase());
                                            setCodeError('');
                                            if (inviteData) setInviteData(null);
                                        }}
                                        autoCapitalize="characters"
                                        error={codeError}
                                    />

                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            paddingVertical: 14,
                                            paddingHorizontal: 20,
                                            borderRadius: 14,
                                            borderWidth: 1.5,
                                            borderColor: colors.primary,
                                            backgroundColor: `${colors.primary}10`,
                                            marginBottom: 20,
                                            gap: 8,
                                        }}
                                        onPress={handleValidateCode}
                                        disabled={isValidatingCode}
                                    >
                                        <MaterialIcons
                                            name={isValidatingCode ? 'hourglass-empty' : 'verified'}
                                            size={20}
                                            color={colors.primary}
                                        />
                                        <Text style={[textStyles.label, { color: colors.primary }]}>
                                            {isValidatingCode ? 'Validating...' : 'Validate Code'}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Validation result card */}
                                    {inviteData && (
                                        <View style={{
                                            backgroundColor: `${colors.primary}08`,
                                            borderWidth: 1.5,
                                            borderColor: `${colors.primary}40`,
                                            borderRadius: 16,
                                            padding: 16,
                                            marginBottom: 20,
                                        }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                                <View style={{
                                                    width: 36, height: 36, borderRadius: 10,
                                                    backgroundColor: `${colors.primary}20`,
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[textStyles.h3, { color: colors.primary, fontSize: 14 }]}>Code Accepted</Text>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{inviteData.farm_name}</Text>
                                                </View>
                                                <View style={{ backgroundColor: `${colors.primary}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                                                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, textTransform: 'capitalize' }]}>
                                                        {inviteData.role.replace('_', ' ')}
                                                    </Text>
                                                </View>
                                            </View>

                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, marginBottom: 8, letterSpacing: 0.5 }]}>
                                                ACCESS PERMISSIONS
                                            </Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                {Object.entries(inviteData.permissions)
                                                    .filter(([, granted]) => granted)
                                                    .map(([key]) => (
                                                        <View key={key} style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            backgroundColor: colors.surface,
                                                            borderWidth: 1,
                                                            borderColor: colors.stroke,
                                                            paddingHorizontal: 8,
                                                            paddingVertical: 4,
                                                            borderRadius: 8,
                                                            gap: 4,
                                                        }}>
                                                            <MaterialIcons
                                                                name={PERMISSION_LABELS[key]?.icon as any ?? 'check'}
                                                                size={12}
                                                                color={colors.primary}
                                                            />
                                                            <Text style={[textStyles.body, { fontSize: 11, color: colors.text }]}>
                                                                {PERMISSION_LABELS[key]?.label ?? key}
                                                            </Text>
                                                        </View>
                                                    ))}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* ══ Step 2: Personal Details ══ */}
                            {step === 2 && (
                                <>
                                    <FloatingLabelInput
                                        label="First Name"
                                        icon="person"
                                        value={firstName}
                                        onChangeText={setFirstName}
                                        autoCapitalize="words"
                                    />
                                    <FloatingLabelInput
                                        label="Last Name"
                                        icon="person"
                                        value={lastName}
                                        onChangeText={setLastName}
                                        autoCapitalize="words"
                                    />
                                    <View>
                                        <FloatingLabelInput
                                            label="Username"
                                            icon="alternate-email"
                                            value={username}
                                            onChangeText={setUsername}
                                            autoCapitalize="none"
                                        />
                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4 }]}>
                                            Must be unique and contain no spaces.
                                        </Text>
                                    </View>
                                </>
                            )}

                            {/* ══ Step 3: Account Credentials ══ */}
                            {step === 3 && (
                                <>
                                    <FloatingLabelInput
                                        label="Email Address"
                                        icon="email"
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                    <View>
                                        <FloatingLabelInput
                                            label="Password"
                                            icon="lock"
                                            value={password}
                                            onChangeText={setPassword}
                                            isPassword
                                        />
                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4, lineHeight: 18 }]}>
                                            At least 8 characters with uppercase, lowercase, numbers, and symbols.
                                        </Text>
                                    </View>
                                    <FloatingLabelInput
                                        label="Confirm Password"
                                        icon="lock"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        isPassword
                                    />
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => setAgreeTerms(!agreeTerms)}
                                            style={{
                                                width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                                                borderColor: agreeTerms ? colors.primary : colors.stroke,
                                                backgroundColor: agreeTerms ? colors.primary : 'transparent',
                                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                                            }}
                                        >
                                            {agreeTerms && <MaterialIcons name="check" size={16} color={colors.onPrimary} />}
                                        </TouchableOpacity>
                                        <Text style={[textStyles.body, { flex: 1, fontSize: 13, color: colors.textGrey, lineHeight: 20 }]}>
                                            I agree to the{' '}
                                            <Text onPress={() => router.push('/(auth)/TermsOfServiceScreen')} style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold' }}>Terms of Service</Text>
                                            {' '}and{' '}
                                            <Text onPress={() => router.push('/(settings)/PrivacyPolicyScreen')} style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold' }}>Privacy Policy</Text>
                                        </Text>
                                    </View>
                                </>
                            )}

                            {/* ══ Step 4: OTP Verification ══ */}
                            {step === 4 && (
                                <View>
                                    <Text style={[textStyles.body, { marginBottom: 16, color: colors.textGrey, textAlign: 'center' }]}>
                                        Please enter the code sent to{'\n'}
                                        <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>
                                            {pendingEmail || email}
                                        </Text>
                                    </Text>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', position: 'relative', paddingHorizontal: 4, marginBottom: 24 }}>
                                        {[0, 1, 2, 3, 4, 5].map((index) => {
                                            const isFocused = otpCode.length === index || (otpCode.length === 6 && index === 5);
                                            const isFilled  = otpCode.length > index;
                                            return (
                                                <View key={index} style={{
                                                    width: 50, height: 64, borderRadius: 14,
                                                    backgroundColor: isFocused ? `${colors.primary}10` : colors.surface,
                                                    borderWidth: 2,
                                                    borderColor: isFocused ? colors.primary : isFilled ? `${colors.primary}40` : colors.stroke,
                                                    justifyContent: 'center', alignItems: 'center',
                                                    shadowColor: isFocused ? colors.primary : '#000',
                                                    shadowOffset: { width: 0, height: isFocused ? 4 : 2 },
                                                    shadowOpacity: isFocused ? 0.3 : 0.05,
                                                    shadowRadius: isFocused ? 8 : 4,
                                                    elevation: isFocused ? 6 : 2,
                                                }}>
                                                    <Text style={[textStyles.h1, { fontSize: 28, color: isFocused ? colors.primary : colors.text, lineHeight: 34 }]}>
                                                        {otpCode[index] || ''}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                        <TextInput
                                            value={otpCode}
                                            onChangeText={(text) => {
                                                const numeric = text.replace(/[^0-9]/g, '');
                                                if (numeric.length <= 6) setOtpCode(numeric);
                                            }}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            autoFocus
                                            caretHidden
                                            style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, zIndex: 10 }}
                                        />
                                    </View>

                                    <TouchableOpacity onPress={handleResendCode} style={{ alignSelf: 'center', marginBottom: 16 }}>
                                        <Text style={[textStyles.label, { color: colors.primary }]}>Resend Code</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* ── Primary action button ── */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={[authStyles.primaryButton, isLoading && { opacity: 0.7 }]}
                                onPress={handleNext}
                                disabled={isLoading}
                            >
                                <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>
                                    {isLoading
                                        ? 'Processing...'
                                        : step === 4
                                            ? 'Verify & Create'
                                            : step === 3
                                                ? 'Send Code'
                                                : 'Next'}
                                </Text>
                            </TouchableOpacity>

                            {/* Google option on step 3 */}
                            {step === 3 && (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 16 }}>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
                                        <Text style={[textStyles.label, { color: colors.textGrey, marginHorizontal: 16 }]}>Or sign up with</Text>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
                                    </View>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[authStyles.socialButton, isLoading && { opacity: 0.7 }]}
                                        onPress={handleGoogleSignup}
                                        disabled={isLoading}
                                    >
                                        <Image
                                            source={require('../../assets/branding/google_logo.svg')}
                                            style={{ width: 24, height: 24 }}
                                            contentFit="contain"
                                        />
                                        <Text style={authStyles.socialButtonText}>Continue with Google</Text>
                                    </TouchableOpacity>
                                </>
                            )}

                            {/* Login link on step 1 */}
                            {step === 1 && (
                                <View style={authStyles.authLinkRow}>
                                    <Text style={[textStyles.body, authStyles.authLinkPrompt]}>
                                        Already have an account?{' '}
                                    </Text>
                                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => router.push('/(auth)/LoginScreen')}>
                                        <Text style={[textStyles.label, authStyles.authLinkText]}>Log In</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

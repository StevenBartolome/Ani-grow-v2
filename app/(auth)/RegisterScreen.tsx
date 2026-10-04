import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
import { supabase } from '@/lib/supabase';

type InviteData = {
    invite_id: string;
    farm_id: string;
    role: string;
    farm_name: string;
    permissions: Record<string, boolean>;
};

// Category-level chips shown when reviewing an invite code's granted permissions
const PERM_CATEGORY_CHIPS: { id: string; label: string; icon: string; keys: string[] }[] = [
    { id: 'devices',        label: 'Devices',   icon: 'devices',          keys: ['devices:view','devices:create','devices:edit','devices:delete','aniweigh:control','anifeed:dispense','feeds:manage','housing:manage','segregation:manage'] },
    { id: 'animals',        label: 'Animals',   icon: 'pets',             keys: ['animals:view','animals:create','animals:edit','animals:delete'] },
    { id: 'health',         label: 'Health',    icon: 'medical-services', keys: ['health:view','health:create','health:edit','vaccine:manage','mortality:manage'] },
    { id: 'analytics',      label: 'Analytics', icon: 'analytics',        keys: ['reports:view','predictions:view','predictions:configure','ai_assistant:use'] },
    { id: 'administration', label: 'Admin',     icon: 'settings',         keys: ['farms:manage','staff:invite','staff:manage_roles','settings:manage'] },
];

// ── Validation helpers ────────────────────────────────────────────────────────
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidName  = (v: string) => v.trim().length >= 2 && /^[a-zA-ZÀ-ÿ' -]+$/.test(v.trim());
const isValidUsername = (v: string) => v.trim().length >= 3 && /^\w+$/.test(v.trim());
const isStrongPassword = (v: string) =>
    v.length >= 8 &&
    /[A-Z]/.test(v) &&
    /[a-z]/.test(v) &&
    /[0-9]/.test(v) &&
    /[^A-Za-z0-9]/.test(v);

export default function RegisterScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ email?: string; step?: string }>();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const authStyles = useAuthStyles();

    // Step 1 — Invite code
    const [inviteCodeInput, setInviteCodeInput] = useState('');
    const [inviteData, setInviteData] = useState<InviteData | null>(null);
    const [codeError, setCodeError] = useState('');

    // Step 2 — Personal details + email
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');

    // Step 2 inline errors
    const [emailError, setEmailError] = useState('');
    const [firstNameError, setFirstNameError] = useState('');
    const [lastNameError, setLastNameError] = useState('');
    const [usernameError, setUsernameError] = useState('');

    // Step 3 — Password
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [agreeTerms, setAgreeTerms] = useState(false);

    // Step 3 inline errors
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    // Step 4 — OTP
    const [otpCode, setOtpCode] = useState('');
    const [pendingEmail, setPendingEmail] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const otpInputRef = useRef<TextInput>(null);

    // Shared
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    useEffect(() => {
        if (params.email) {
            setEmail(params.email);
            setPendingEmail(params.email);
        }
        if (params.step) {
            const s = parseInt(params.step, 10);
            if (s >= 1 && s <= 4) {
                setStep(s);
            } else if (s === 5) {
                setStep(4);
            }
        }
    }, [params.email, params.step]);

    useEffect(() => {
        if (step === 4) {
            const timer = setTimeout(() => {
                otpInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const getStepInfo = () => {
        switch (step) {
            case 1: return { title: 'Enter Invite Code', subtitle: 'Your farm admin will provide an invite code.' };
            case 2: return { title: 'Personal Details',  subtitle: 'Tell us a bit about yourself.' };
            case 3: return { title: 'Create Account',    subtitle: 'Set up a secure password for your account.' };
            case 4: return { title: 'Verify Email',      subtitle: 'Enter the 6-digit code we sent to your email.' };
            default: return { title: '', subtitle: '' };
        }
    };


    // ── Create user profile + mark invite used (post-auth) ────────
    const createUserProfile = async (userId: string, userEmail: string, userMeta?: any) => {
        const meta = userMeta || {};
        const fName = firstName.trim() || meta.first_name || '';
        const lName = lastName.trim() || meta.last_name || '';
        const uName = username.trim().toLowerCase() || meta.username || '';
        const role = inviteData?.role || meta.role || 'caretaker';
        const farmId = inviteData?.farm_id || meta.farm_id || null;
        const permissions = inviteData?.permissions || meta.permissions || {};
        const inviteId = inviteData?.invite_id || meta.invite_id || null;

        const profilePayload: Record<string, any> = {
            id:          userId,
            email:       userEmail,
            first_name:  fName,
            last_name:   lName,
            username:    uName,
            role:        role,
            farm_id:     farmId,
            permissions: permissions,
            status:      'Active',
            updated_at:  new Date().toISOString(),
            created_at:  new Date().toISOString(),
        };

        const { error: profileError } = await supabase
            .from('users')
            .upsert(profilePayload, { onConflict: 'id' });

        if (profileError) {
            console.error('[RegisterScreen] Profile upsert error:', profileError);
            throw new Error(profileError.message || 'Failed to save profile in database.');
        }

        // Mark the invite code as used via SECURITY DEFINER RPC
        if (inviteId) {
            try {
                await supabase.rpc('mark_invite_used', { p_invite_id: inviteId });
            } catch (rpcErr) {
                console.warn('[RegisterScreen] mark_invite_used RPC warning:', rpcErr);
            }
        }
    };

    // ── Step 3: Sign up with email/password ───────────────────────
    const handleRegister = async () => {
        setIsLoading(true);
        try {
            const targetEmail = email.trim();
            const { data, error } = await supabase.auth.signUp({
                email: targetEmail,
                password,
                options: {
                    data: {
                        first_name:  firstName.trim(),
                        last_name:   lastName.trim(),
                        username:    username.trim().toLowerCase(),
                        role:        inviteData?.role,
                        farm_id:     inviteData?.farm_id,
                        invite_id:   inviteData?.invite_id,
                        permissions: inviteData?.permissions,
                    },
                },
            });

            if (error) throw error;

            setPendingEmail(targetEmail);

            if (data?.session) {
                // Email confirmation disabled — active session immediately
                if (data.user) {
                    await createUserProfile(data.user.id, data.user.email ?? targetEmail, data.user.user_metadata);
                }
                showSnackbar('Account created successfully!', 'success');
                setTimeout(() => router.replace('/(auth)/LoginScreen'), 1500);
            } else {
                showSnackbar('Verification code sent to your email.', 'success');
                setResendCooldown(60);
                setStep(4);
            }
        } catch (err: any) {
            const msg = err.message || '';
            if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
                // Attempt to resend code for unconfirmed users
                try {
                    const targetEmail = email.trim();
                    const { error: resendErr } = await supabase.auth.resend({
                        type: 'signup',
                        email: targetEmail,
                    });
                    if (!resendErr) {
                        setPendingEmail(targetEmail);
                        showSnackbar('Verification code sent to your email.', 'success');
                        setResendCooldown(60);
                        setStep(4);
                        return;
                    }
                } catch (_) {
                    // Ignore resend error and fall through
                }
                showSnackbar('This email is already registered. Please log in.', 'error');
            } else {
                showSnackbar(msg || 'Registration failed. Please try again.', 'error');
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
                await createUserProfile(data.user.id, data.user.email ?? pendingEmail, data.user.user_metadata);
                showSnackbar('Email verified! Account created.', 'success');
                setTimeout(() => router.replace('/(auth)/LoginScreen'), 1500);
            }
        } catch (err: any) {
            showSnackbar(err.message || 'Invalid verification code.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step 2 validation ─────────────────────────────────────────
    const validateStep2 = () => {
        let valid = true;

        if (!email.trim()) {
            setEmailError('Email address is required.');
            valid = false;
        } else if (!isValidEmail(email.trim())) {
            setEmailError('Please enter a valid email address.');
            valid = false;
        } else {
            setEmailError('');
        }

        if (!firstName.trim()) {
            setFirstNameError('First name is required.');
            valid = false;
        } else if (!isValidName(firstName)) {
            setFirstNameError('Must be at least 2 letters. No numbers or special characters.');
            valid = false;
        } else {
            setFirstNameError('');
        }

        if (!lastName.trim()) {
            setLastNameError('Last name is required.');
            valid = false;
        } else if (!isValidName(lastName)) {
            setLastNameError('Must be at least 2 letters. No numbers or special characters.');
            valid = false;
        } else {
            setLastNameError('');
        }

        if (!username.trim()) {
            setUsernameError('Username is required.');
            valid = false;
        } else if (!isValidUsername(username)) {
            setUsernameError('Min 3 characters. Only letters, numbers, and underscores.');
            valid = false;
        } else {
            setUsernameError('');
        }

        return valid;
    };

    // ── Step 3 validation ─────────────────────────────────────────
    const validateStep3 = () => {
        let valid = true;

        if (!password) {
            setPasswordError('Password is required.');
            valid = false;
        } else if (!isStrongPassword(password)) {
            setPasswordError('Min 8 characters with uppercase, lowercase, number, and symbol.');
            valid = false;
        } else {
            setPasswordError('');
        }

        if (!confirmPassword) {
            setConfirmPasswordError('Please confirm your password.');
            valid = false;
        } else if (password !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match.');
            valid = false;
        } else {
            setConfirmPasswordError('');
        }

        if (!agreeTerms) {
            showSnackbar('Please agree to the Terms of Service and Privacy Policy.');
            valid = false;
        }

        return valid;
    };

    // ── Navigation ────────────────────────────────────────────────
    const handleNext = async () => {
        if (isLoading) return;

        if (step === 1) {
            const code = inviteCodeInput.trim().toUpperCase();
            if (!code) { setCodeError('Please enter an invite code.'); return; }

            setCodeError('');
            setIsLoading(true);

            try {
                const { data, error } = await supabase.rpc('validate_invite_code', { code_input: code });

                if (error) throw error;

                const result = Array.isArray(data) ? data[0] : data;

                if (!result || !result.valid) {
                    setCodeError('This code is invalid, expired, or has already been used.');
                    setIsLoading(false);
                    return;
                }

                setInviteData({
                    invite_id:   result.invite_id,
                    farm_id:     result.farm_id,
                    role:        result.role,
                    farm_name:   result.farm_name,
                    permissions: result.permissions ?? {},
                });
                
                setStep(2);
            } catch (err: any) {
                setCodeError(err.message || 'Failed to validate code. Please try again.');
            } finally {
                setIsLoading(false);
            }

        } else if (step === 2) {
            if (!validateStep2()) return;
            setStep(3);

        } else if (step === 3) {
            if (!validateStep3()) return;
            await handleRegister();

        } else if (step === 4) {
            await handleVerifyOtp();
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        } else {
            if (router.canGoBack()) {
                router.back();
            } else {
                router.replace('/(auth)/LoginScreen');
            }
        }
    };

    const handleResendCode = async () => {
        if (resendCooldown > 0 || isLoading) return;

        const targetEmail = (pendingEmail || email).trim();
        if (!targetEmail) {
            showSnackbar('Email address is missing. Please re-enter your details.', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: targetEmail,
            });

            if (error) throw error;

            showSnackbar('New verification code sent! Check your email.', 'success');
            setResendCooldown(60);
        } catch (err: any) {
            const msg = err.message || '';
            if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('60 seconds') || msg.toLowerCase().includes('security purposes')) {
                showSnackbar('Please wait a minute before requesting a new code.', 'info');
                if (resendCooldown === 0) setResendCooldown(60);
            } else {
                showSnackbar(msg || 'Failed to resend code.', 'error');
            }
        } finally {
            setIsLoading(false);
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

                                </View>
                            )}

                            {/* ══ Step 2: Personal Details + Email ══ */}
                            {step === 2 && (
                                <>
                                    <FloatingLabelInput
                                        label="Email Address"
                                        icon="email"
                                        value={email}
                                        onChangeText={(v) => {
                                            setEmail(v);
                                            if (emailError) setEmailError('');
                                        }}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        error={emailError}
                                    />
                                    <FloatingLabelInput
                                        label="First Name"
                                        icon="person"
                                        value={firstName}
                                        onChangeText={(v) => {
                                            setFirstName(v);
                                            if (firstNameError) setFirstNameError('');
                                        }}
                                        autoCapitalize="words"
                                        error={firstNameError}
                                    />
                                    <FloatingLabelInput
                                        label="Last Name"
                                        icon="person"
                                        value={lastName}
                                        onChangeText={(v) => {
                                            setLastName(v);
                                            if (lastNameError) setLastNameError('');
                                        }}
                                        autoCapitalize="words"
                                        error={lastNameError}
                                    />
                                    <View>
                                        <FloatingLabelInput
                                            label="Username"
                                            icon="alternate-email"
                                            value={username}
                                            onChangeText={(v) => {
                                                setUsername(v);
                                                if (usernameError) setUsernameError('');
                                            }}
                                            autoCapitalize="none"
                                            error={usernameError}
                                        />
                                        {!usernameError && (
                                            <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4 }]}>
                                                Min 3 characters. Letters, numbers, and underscores only.
                                            </Text>
                                        )}
                                    </View>
                                </>
                            )}

                            {/* ══ Step 3: Password ══ */}
                            {step === 3 && (
                                <>
                                    <View>
                                        <FloatingLabelInput
                                            label="Password"
                                            icon="lock"
                                            value={password}
                                            onChangeText={(v) => {
                                                setPassword(v);
                                                if (passwordError) setPasswordError('');
                                                // Live confirm match check
                                                if (confirmPassword && v !== confirmPassword) {
                                                    setConfirmPasswordError('Passwords do not match.');
                                                } else if (confirmPassword) {
                                                    setConfirmPasswordError('');
                                                }
                                            }}
                                            isPassword
                                            error={passwordError}
                                        />
                                        {!passwordError && (
                                            <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4, lineHeight: 18 }]}>
                                                Min 8 characters with uppercase, lowercase, numbers, and symbols.
                                            </Text>
                                        )}
                                    </View>
                                    <FloatingLabelInput
                                        label="Confirm Password"
                                        icon="lock"
                                        value={confirmPassword}
                                        onChangeText={(v) => {
                                            setConfirmPassword(v);
                                            if (v && password && v !== password) {
                                                setConfirmPasswordError('Passwords do not match.');
                                            } else {
                                                setConfirmPasswordError('');
                                            }
                                        }}
                                        isPassword
                                        error={confirmPasswordError}
                                    />
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8, paddingHorizontal: 4 }}>
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

                                    <TouchableOpacity
                                        activeOpacity={1}
                                        onPress={() => otpInputRef.current?.focus()}
                                        style={{ flexDirection: 'row', justifyContent: 'space-between', position: 'relative', paddingHorizontal: 4, marginBottom: 24 }}
                                    >
                                        {[0, 1, 2, 3, 4, 5].map((index) => {
                                            const isFocused = otpCode.length === index || (otpCode.length === 6 && index === 5);
                                            const isFilled  = otpCode.length > index;
                                            return (
                                                <View
                                                    key={index}
                                                    pointerEvents="none"
                                                    style={{
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
                                                    }}
                                                >
                                                    <Text style={[textStyles.h1, { fontSize: 28, color: isFocused ? colors.primary : colors.text, lineHeight: 34 }]}>
                                                        {otpCode[index] || ''}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                        <TextInput
                                            ref={otpInputRef}
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
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={handleResendCode}
                                        disabled={resendCooldown > 0 || isLoading}
                                        style={{ alignSelf: 'center', marginBottom: 16, opacity: (resendCooldown > 0 || isLoading) ? 0.5 : 1 }}
                                    >
                                        <Text style={[textStyles.label, { color: (resendCooldown > 0 || isLoading) ? colors.textGrey : colors.primary }]}>
                                            {resendCooldown > 0
                                                ? `Resend Code (${resendCooldown}s)`
                                                : isLoading
                                                    ? 'Sending...'
                                                    : 'Resend Code'}
                                        </Text>
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

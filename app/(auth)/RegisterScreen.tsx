import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../../src/components/BackButton';
import FloatingLabelInput from '../../src/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '../../src/components/Snackbar';
import { useTextStyles } from '../../src/constants/textStyles';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStyles } from '../../src/styles/authStyles';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';

export default function RegisterScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const authStyles = useAuthStyles();
    const { signUp } = useAuth();

    // Personal details
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState('');

    // Password
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [agreeTerms, setAgreeTerms] = useState(false);

    // Farm setup
    const [farmSetupMode, setFarmSetupMode] = useState<'create' | 'join'>('create');
    const [farmName, setFarmName] = useState('');
    const [inviteCode, setInviteCode] = useState('');

    // Flow control
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [registerOtp, setRegisterOtp] = useState('');

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const handleNext = async () => {
        if (isLoading) return;

        // Step 1: Email
        if (step === 1) {
            setEmailError('');
            if (!email) {
                setEmailError('Please enter your email address.');
                return;
            }
            const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
            if (!emailRegex.test(email.trim())) {
                setEmailError('Please enter a valid email address.');
                return;
            }

            // Check if email already exists
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('email')
                    .ilike('email', email.trim())
                    .maybeSingle();

                if (error) {
                    console.error('Email check error:', error);
                    showSnackbar('Unable to verify email. Please try again.');
                    return;
                }

                if (data) {
                    setEmailError('This email is already registered. Please use another email.');
                    setIsLoading(false);
                    return;
                }

                setStep(2);
            } catch (err) {
                console.error('[Register] Unexpected error:', err);
                showSnackbar('An unexpected error occurred.');
            } finally {
                setIsLoading(false);
            }

        // Step 2: Personal Details
        } else if (step === 2) {
            if (!firstName.trim() || !lastName.trim() || !username.trim()) {
                showSnackbar('Please complete all personal details.');
                return;
            }
            setStep(3);

        // Step 3: Farm Setup
        } else if (step === 3) {
            if (farmSetupMode === 'create' && !farmName.trim()) {
                showSnackbar('Please enter a name for your Farm.');
                return;
            }
            if (farmSetupMode === 'join' && !inviteCode.trim()) {
                showSnackbar('Please enter your Farm Invite Code.');
                return;
            }
            setStep(4);

        // Step 4: Password
        } else if (step === 4) {
            if (!password || !confirmPassword) {
                showSnackbar('Please enter your password.');
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
            // In real Supabase, this sends the signup request
            handleRegister();
        } else if (step === 5) {
            handleVerifyOtp();
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    const getTitles = () => {
        switch (step) {
            case 1: return { title: 'Create an account', subtitle: "Let's start with your email address." };
            case 2: return { title: 'Personal details', subtitle: "What's your full name?" };
            case 3: return { title: 'Organization', subtitle: "Set up or join a farm." };
            case 4: return { title: 'Set your password', subtitle: "Make it secure and memorable." };
            case 5: return { title: 'Verify Email', subtitle: "We sent a code to your email." };
            default: return { title: '', subtitle: '' };
        }
    };

    const handleVerifyOtp = async () => {
        if (!registerOtp || registerOtp.length < 6) {
            showSnackbar('Please enter the 6-digit code.');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.auth.verifyOtp({
                email: email.trim(),
                token: registerOtp,
                type: 'signup'
            });

            if (error) throw error;

            showSnackbar('Email verified successfully!', 'success');
            setTimeout(() => {
                router.replace('/(auth)/LoginScreen');
            }, 2000);
        } catch (error: any) {
            showSnackbar(error.message || 'Invalid verification code.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async () => {
        setIsLoading(true);
        try {
            await signUp({ 
                email: email.trim(), 
                password, 
                firstName, 
                lastName, 
                username, 
                farmName 
            });
            showSnackbar('Code sent! Check your email.', 'success');
            setStep(5);
        } catch (error: any) {
            showSnackbar(error.message || 'Registration failed.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const stepInfo = getTitles();

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

                        {/* Top nav row */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            width: '100%',
                            marginBottom: 32,
                            justifyContent: 'space-between',
                            zIndex: 10,
                        }}>
                            <View style={{ width: 44, height: 44 }}>
                                {step > 1 && <BackButton onPress={handleBack} />}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                {[1, 2, 3, 4, 5].map((strStep, index) => {
                                    const isCompleted = step > strStep;
                                    const isActive = step === strStep;
                                    const isFuture = step < strStep;

                                    return (
                                        <React.Fragment key={strStep}>
                                            <View style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: 15,
                                                backgroundColor: isActive ? colors.primary : colors.surface,
                                                borderWidth: isFuture ? 1 : 2,
                                                borderColor: isFuture ? colors.stroke : colors.primary,
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {isCompleted ? (
                                                    <MaterialIcons name="check" size={16} color={colors.primary} />
                                                ) : (
                                                    <Text style={[textStyles.label, { color: isActive ? colors.onPrimary : colors.textGrey, fontSize: 12, marginTop: 1 }]}>
                                                        {strStep}
                                                    </Text>
                                                )}
                                            </View>
                                            {index < 4 && (
                                                <View style={{ width: 18, height: 2, backgroundColor: isCompleted ? colors.primary : colors.stroke, marginHorizontal: 3 }} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </View>
                            <View style={{ width: 44, height: 44 }} />
                        </View>

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
                            {step > 1 && (
                                <View style={{ backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.stroke, marginBottom: 16 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>{email}</Text>
                                </View>
                            )}
                            <Text style={[textStyles.h1, { fontSize: 32, lineHeight: 40, color: colors.text }]}>
                                {stepInfo.title}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                                {stepInfo.subtitle}
                            </Text>
                        </View>

                        <View style={authStyles.form}>
                            {step === 1 && (
                                <FloatingLabelInput
                                    label="Email Address"
                                    icon="email"
                                    value={email}
                                    onChangeText={(text) => { setEmail(text); setEmailError(''); }}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    error={emailError}
                                />
                            )}
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
                            {step === 3 && (
                                <>
                                    <View style={{ flexDirection: 'row', marginBottom: 24, paddingHorizontal: 4 }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={{ flex: 1, padding: 16, borderWidth: 2, borderColor: farmSetupMode === 'create' ? colors.primary : colors.stroke, borderRadius: 12, marginRight: 8, alignItems: 'center' }}
                                            onPress={() => setFarmSetupMode('create')}
                                        >
                                            <MaterialIcons name="add-business" size={32} color={farmSetupMode === 'create' ? colors.primary : colors.textGrey} style={{ marginBottom: 8 }} />
                                            <Text style={[textStyles.h3, { color: farmSetupMode === 'create' ? colors.primary : colors.textGrey, fontSize: 14 }]}>Create New</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={{ flex: 1, padding: 16, borderWidth: 2, borderColor: farmSetupMode === 'join' ? colors.primary : colors.stroke, borderRadius: 12, marginLeft: 8, alignItems: 'center' }}
                                            onPress={() => setFarmSetupMode('join')}
                                        >
                                            <MaterialIcons name="group-add" size={32} color={farmSetupMode === 'join' ? colors.primary : colors.textGrey} style={{ marginBottom: 8 }} />
                                            <Text style={[textStyles.h3, { color: farmSetupMode === 'join' ? colors.primary : colors.textGrey, fontSize: 14 }]}>Join Existing</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {farmSetupMode === 'create' ? (
                                        <FloatingLabelInput
                                            label="Farm Name"
                                            icon="business"
                                            value={farmName}
                                            onChangeText={setFarmName}
                                            autoCapitalize="words"
                                        />
                                    ) : (
                                        <FloatingLabelInput
                                            label="Invite Code"
                                            icon="vpn-key"
                                            value={inviteCode}
                                            onChangeText={setInviteCode}
                                            autoCapitalize="characters"
                                        />
                                    )}
                                </>
                            )}
                            {step === 4 && (
                                <>
                                    <View>
                                        <FloatingLabelInput
                                            label="Password"
                                            icon="lock"
                                            value={password}
                                            onChangeText={setPassword}
                                            isPassword
                                        />
                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4, lineHeight: 18 }]}>
                                            Passwords must have at least 8 characters and include a mix of uppercase letters, lowercase letters, numbers, and symbols.
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
                                                width: 24,
                                                height: 24,
                                                borderRadius: 6,
                                                borderWidth: 2,
                                                borderColor: agreeTerms ? colors.primary : colors.stroke,
                                                backgroundColor: agreeTerms ? colors.primary : 'transparent',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginRight: 12
                                            }}
                                        >
                                            {agreeTerms && (
                                                <MaterialIcons name="check" size={16} color={colors.onPrimary} />
                                            )}
                                        </TouchableOpacity>
                                        <Text style={[textStyles.body, { flex: 1, fontSize: 13, color: colors.textGrey, lineHeight: 20 }]}>
                                            I agree to the{' '}
                                            <Text onPress={() => router.push('/(auth)/TermsOfServiceScreen')} style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold' }}>Terms of Service</Text>
                                            {' '}and{' '}
                                            <Text onPress={() => router.push('/(auth)/PrivacyPolicyScreen')} style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold' }}>Privacy Policy</Text>
                                        </Text>
                                    </View>
                                </>
                            )}
                            {step === 5 && (
                                <>
                                    <View>
                                        <FloatingLabelInput
                                            label="Verification Code"
                                            icon="lock"
                                            value={registerOtp}
                                            onChangeText={setRegisterOtp}
                                            keyboardType="numeric"
                                            maxLength={6}
                                        />
                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4 }]}>
                                            Enter the 6-digit code sent to {email}.
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleRegister}
                                        style={{ alignSelf: 'center', marginTop: 8, marginBottom: 16 }}
                                    >
                                        <Text style={[textStyles.label, { color: colors.primary }]}>Resend Code</Text>
                                    </TouchableOpacity>
                                </>
                            )}

                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={[authStyles.primaryButton, isLoading && { opacity: 0.7 }]}
                                onPress={handleNext}
                                disabled={isLoading}
                            >
                                <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>
                                    {isLoading
                                        ? 'Processing...'
                                        : step === 5
                                            ? 'Verify & Create'
                                            : step === 4
                                                ? 'Send Code'
                                                : 'Next'}
                                </Text>
                            </TouchableOpacity>

                            {step === 1 && (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 32 }}>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
                                        <Text style={[textStyles.label, { color: colors.textGrey, marginHorizontal: 16 }]}>Or sign up with</Text>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
                                    </View>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={authStyles.socialButton}
                                        onPress={() => showSnackbar('Google registration triggered.', 'info')}
                                    >
                                        <Image
                                            source={require('../../assets/branding/google_logo.svg')}
                                            style={{ width: 24, height: 24 }}
                                            contentFit="contain"
                                        />
                                        <Text style={authStyles.socialButtonText}>Continue with Google</Text>
                                    </TouchableOpacity>
                                    <View style={authStyles.authLinkRow}>
                                        <Text style={[textStyles.body, authStyles.authLinkPrompt]}>
                                            Already have an account?{' '}
                                        </Text>
                                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => router.push('/(auth)/LoginScreen')}>
                                            <Text style={[textStyles.label, authStyles.authLinkText]}>
                                                Log In
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
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

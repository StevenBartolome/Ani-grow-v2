import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    TouchableOpacity,
    View,
    StyleSheet,
    Animated,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuthStyles } from '@/styles/authStyles';
import { supabase } from '@/lib/supabase';

interface InviteCodeData {
    id: string;
    code: string;
    farm_id: string;
    role: string;
    permissions: any;
    status: string;
}

export default function SetupAccountScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const authStyles = useAuthStyles();
    const router = useRouter();
    const { profile, signOut, refreshProfile } = useAuth();

    // Screen steps: 'invite_code' | 'profile_details'
    const [step, setStep] = useState<'invite_code' | 'profile_details'>('invite_code');

    // Step 1: Invite Code State
    const [inviteCode, setInviteCode] = useState('');
    const [inviteCodeError, setInviteCodeError] = useState('');
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [inviteCodeData, setInviteCodeData] = useState<InviteCodeData | null>(null);

    // Step 2: Profile Form State
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('+63');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // SMS Verification State
    const [otpCode, setOtpCode] = useState('');
    const [isOtpSending, setIsOtpSending] = useState(false);
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [isOtpVerified, setIsOtpVerified] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [countdown, setCountdown] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Snackbar Notification State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // Prefill fields when profile changes (e.g., Google user loaded)
    useEffect(() => {
        if (profile) {
            setFirstName(profile.firstName || (profile as any).first_name || '');
            setLastName(profile.lastName || (profile as any).last_name || '');
            setUsername((profile as any).username || '');
        }
    }, [profile]);

    // OTP Countdown Timer
    useEffect(() => {
        if (countdown > 0) {
            timerRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
        } else if (countdown === 0 && timerRef.current) {
            clearTimeout(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [countdown]);

    // Handle logout in case user needs to go back to login
    const handleLogout = async () => {
        try {
            await signOut();
            router.replace('/(auth)/LoginScreen');
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to logout.');
        }
    };

    // Step 1: Verify unique farm invite code
    const handleVerifyInviteCode = async () => {
        if (!inviteCode.trim()) {
            setInviteCodeError('Farm invite code is required.');
            return;
        }

        setIsVerifyingCode(true);
        setInviteCodeError('');

        try {
            // Expire any stale codes using database function
            await supabase.rpc('expire_stale_invite_codes');

            const { data, error } = await supabase
                .from('invite_codes')
                .select('id, code, farm_id, role, permissions, status, expires_at')
                .eq('code', inviteCode.trim().toUpperCase())
                .eq('status', 'unused')
                .single();

            if (error || !data) {
                setInviteCodeError('Invalid or expired invite code.');
                showSnackbar('Please enter a valid, active invite code.');
                return;
            }

            // Check if code is expired
            if (new Date(data.expires_at).getTime() < Date.now()) {
                setInviteCodeError('This invite code has expired.');
                showSnackbar('This invite code is no longer active.');
                return;
            }

            setInviteCodeData(data as InviteCodeData);
            showSnackbar('Invite code verified successfully!', 'success');
            setTimeout(() => {
                setStep('profile_details');
            }, 1000);

        } catch (err: any) {
            console.error('[SetupAccountScreen] code verification error:', err);
            setInviteCodeError('An error occurred. Please try again.');
        } finally {
            setIsVerifyingCode(false);
        }
    };

    // Validate phone number format (PH format "+639xxxxxxxxx")
    const validatePhone = (phone: string) => {
        if (!phone || phone === '+63') return 'Phone number is required.';
        if (!/^\+639\d{9}$/.test(phone)) return 'Enter a valid PH mobile number (+639XXXXXXXXX).';
        return '';
    };

    // Phone formatting
    const handlePhoneChange = (val: string) => {
        let cleaned = val.replace(/[^\d+]/g, '');
        
        if (cleaned === '' || cleaned === '+') {
            setPhoneNumber('+63');
            return;
        }
        
        if (!cleaned.startsWith('+63')) {
            if (cleaned.startsWith('63')) {
                cleaned = '+' + cleaned;
            } else if (cleaned.startsWith('09')) {
                cleaned = '+63' + cleaned.substring(1);
            } else if (cleaned.startsWith('9')) {
                cleaned = '+63' + cleaned;
            } else {
                cleaned = '+63' + cleaned.replace(/^\+?63?/, '');
            }
        }
        
        if (cleaned.length > 13) {
            cleaned = cleaned.substring(0, 13);
        }
        
        setPhoneNumber(cleaned);
        if (formErrors.phoneNumber) setFormErrors(prev => ({ ...prev, phoneNumber: '' }));
    };

    // Validate all form fields
    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!firstName.trim()) errors.firstName = 'First name is required.';
        if (!lastName.trim()) errors.lastName = 'Last name is required.';
        if (!username.trim()) errors.username = 'Username is required.';
        
        const phoneErr = validatePhone(phoneNumber);
        if (phoneErr) errors.phoneNumber = phoneErr;

        if (!password) {
            errors.password = 'Password is required.';
        } else if (password.length < 6) {
            errors.password = 'Password must be at least 6 characters.';
        }

        if (password !== confirmPassword) {
            errors.confirmPassword = 'Passwords do not match.';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Step 2 SMS OTP dispatch
    const handleProceedToVerification = async () => {
        if (!validateForm()) {
            showSnackbar('Please fix the errors before proceeding.');
            return;
        }

        setIsOtpSending(true);
        setOtpError('');

        try {
            // Check if phone number is already registered in 'users' table
            const { data: existingPhone } = await supabase
                .from('users')
                .select('id')
                .eq('phone', phoneNumber)
                .maybeSingle();

            const userUuid = profile?.uid || (profile as any)?.id;
            if (existingPhone && existingPhone.id !== userUuid) {
                const phoneErrorMsg = 'This phone number is already registered to another account.';
                setFormErrors(prev => ({ ...prev, phoneNumber: phoneErrorMsg }));
                showSnackbar(phoneErrorMsg);
                return;
            }

            // Dispatch SMS OTP (using updateUser to trigger verification for currently logged in user)
            const { error } = await supabase.auth.updateUser({ phone: phoneNumber });
            if (error) throw error;

            setIsOtpSent(true);
            setCountdown(60);
            showSnackbar('Verification code sent to your phone!', 'success');

        } catch (err: any) {
            console.error('[SetupAccountScreen] SMS send error:', err);
            showSnackbar(err.message || 'Failed to send SMS code.');
        } finally {
            setIsOtpSending(false);
        }
    };

    // Verify SMS OTP and immediately complete registration setup
    const handleVerifyOtpAndCompleteSetup = async () => {
        if (otpCode.length !== 6) {
            setOtpError('Please enter the 6-digit verification code.');
            return;
        }

        setIsSubmitting(true);
        setOtpError('');

        try {
            const userUuid = profile?.uid || (profile as any)?.id;
            if (!userUuid || !inviteCodeData) throw new Error('Session details or invite data missing.');

            // 1. Verify OTP
            const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
                phone: phoneNumber,
                token: otpCode,
                type: 'phone_change',
            });

            if (otpError || !otpData.user) {
                setOtpError(otpError?.message || 'Incorrect verification code.');
                showSnackbar(otpError?.message || 'Verification failed. Try again.');
                setIsSubmitting(false);
                return;
            }

            // 2. Update password in Supabase Auth (phone is verified and linked)
            const { error: authUpdateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (authUpdateError) throw authUpdateError;

            // 3. Build profile update record
            const updatedProfile = {
                id: userUuid,
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                username: username.trim().toLowerCase(),
                phone: phoneNumber,
                farm_id: inviteCodeData.farm_id,
                role: inviteCodeData.role,
                permissions: inviteCodeData.permissions,
                status: 'Active',
                updated_at: new Date().toISOString(),
            };

            // 4. Update profile record in 'users' table
            const { error: profileError } = await supabase
                .from('users')
                .update(updatedProfile)
                .eq('id', userUuid);

            if (profileError) throw profileError;

            // 5. Consume the invite code via SECURITY DEFINER RPC to bypass RLS restrictions
            const { error: codeError } = await supabase.rpc('mark_invite_used', { 
                p_invite_id: inviteCodeData.id 
            });

            if (codeError) throw codeError;

            setIsOtpVerified(true);
            showSnackbar('Account setup complete! Redirecting...', 'success');
            
            // 6. Refresh context and redirect
            setTimeout(async () => {
                await refreshProfile();
                router.replace('/(dashboard)/HomeScreen');
            }, 1500);

        } catch (err: any) {
            console.error('[SetupAccountScreen] Final setup submit error:', err);
            showSnackbar(err.message || 'Failed to complete setup. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoid}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, fontFamily: 'Poppins-Bold' }]}>
                        Ani-Grow
                    </Text>
                    <TouchableOpacity
                        onPress={handleLogout}
                        activeOpacity={0.7}
                        style={styles.logoutButton}
                    >
                        <MaterialIcons name="logout" size={18} color={colors.textGrey} />
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, fontFamily: 'Poppins-Medium' }]}>
                            Logout
                        </Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Welcome Banner */}
                    <View style={styles.bannerContainer}>
                        <View style={[styles.iconWrapper, { backgroundColor: colors.primary + '1A' }]}>
                            <MaterialIcons name="settings-suggest" size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h1, { fontSize: 24, color: colors.text, textAlign: 'center', marginTop: 12 }]}>
                            Setup Your Account
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 }]}>
                            {step === 'invite_code'
                                ? 'To start managing farm operations, please enter your unique farm invite code.'
                                : isOtpSent
                                    ? 'Verify your phone number to activate your account.'
                                    : 'Complete your user profile details to activate your permissions.'
                            }
                        </Text>
                    </View>

                    {/* Step 1: Invite Code Entry */}
                    {step === 'invite_code' && (
                        <View style={styles.cardContainer}>
                            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                <Text style={[textStyles.h2, { fontSize: 16, color: colors.text, marginBottom: 16, fontFamily: 'Poppins-SemiBold' }]}>
                                    Farm Invite Code
                                </Text>
                                
                                <FloatingLabelInput
                                    label="Invite Code"
                                    icon="vpn-key"
                                    value={inviteCode}
                                    onChangeText={(val) => {
                                        setInviteCode(val);
                                        if (inviteCodeError) setInviteCodeError('');
                                    }}
                                    autoCapitalize="characters"
                                    placeholder="Enter Invite Code"
                                    error={inviteCodeError}
                                    backgroundColor={colors.surface}
                                  />

                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={handleVerifyInviteCode}
                                    disabled={isVerifyingCode}
                                    style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                                >
                                    {isVerifyingCode ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <View style={styles.buttonRow}>
                                            <Text style={styles.buttonText}>Next</Text>
                                            <MaterialIcons name="chevron-right" size={20} color="#FFF" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Step 2: Complete User Profile Form & OTP Verification */}
                    {step === 'profile_details' && (
                        <View style={styles.cardContainer}>
                            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                {!isOtpSent ? (
                                    <>
                                        <Text style={[textStyles.h2, { fontSize: 16, color: colors.text, marginBottom: 20, fontFamily: 'Poppins-SemiBold' }]}>
                                            Complete Your Details
                                        </Text>

                                        {/* Names Row */}
                                        <View style={styles.row}>
                                            <View style={styles.flexItem}>
                                                <FloatingLabelInput
                                                    label="First Name"
                                                    icon="person"
                                                    value={firstName}
                                                    onChangeText={(val) => {
                                                        setFirstName(val);
                                                        if (formErrors.firstName) setFormErrors(prev => ({ ...prev, firstName: '' }));
                                                    }}
                                                    error={formErrors.firstName}
                                                    backgroundColor={colors.surface}
                                                />
                                            </View>
                                            <View style={styles.flexItem}>
                                                <FloatingLabelInput
                                                    label="Last Name"
                                                    icon="person"
                                                    value={lastName}
                                                    onChangeText={(val) => {
                                                        setLastName(val);
                                                        if (formErrors.lastName) setFormErrors(prev => ({ ...prev, lastName: '' }));
                                                    }}
                                                    error={formErrors.lastName}
                                                    backgroundColor={colors.surface}
                                                />
                                            </View>
                                        </View>

                                        {/* Username */}
                                        <FloatingLabelInput
                                            label="Username"
                                            icon="alternate-email"
                                            value={username}
                                            onChangeText={(val) => {
                                                setUsername(val.replace(/\s+/g, ''));
                                                if (formErrors.username) setFormErrors(prev => ({ ...prev, username: '' }));
                                            }}
                                            autoCapitalize="none"
                                            error={formErrors.username}
                                            backgroundColor={colors.surface}
                                        />

                                        {/* Phone Number with smart formatting */}
                                        <FloatingLabelInput
                                            label="Phone Number"
                                            icon="phone"
                                            value={phoneNumber}
                                            onChangeText={handlePhoneChange}
                                            keyboardType="phone-pad"
                                            placeholder="+639XXXXXXXXX"
                                            error={formErrors.phoneNumber}
                                            backgroundColor={colors.surface}
                                        />

                                        <View style={styles.divider} />

                                        {/* Passwords */}
                                        <FloatingLabelInput
                                            label="Password"
                                            icon="lock"
                                            isPassword
                                            value={password}
                                            onChangeText={(val) => {
                                                setPassword(val);
                                                if (formErrors.password) setFormErrors(prev => ({ ...prev, password: '' }));
                                            }}
                                            error={formErrors.password}
                                            backgroundColor={colors.surface}
                                        />

                                        <FloatingLabelInput
                                            label="Confirm Password"
                                            icon="lock"
                                            isPassword
                                            value={confirmPassword}
                                            onChangeText={(val) => {
                                                setConfirmPassword(val);
                                                if (formErrors.confirmPassword) setFormErrors(prev => ({ ...prev, confirmPassword: '' }));
                                            }}
                                            error={formErrors.confirmPassword}
                                            backgroundColor={colors.surface}
                                        />

                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={handleProceedToVerification}
                                            disabled={isOtpSending}
                                            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 16 }]}
                                        >
                                            {isOtpSending ? (
                                                <ActivityIndicator size="small" color="#FFF" />
                                            ) : (
                                                <View style={styles.buttonRow}>
                                                    <Text style={styles.buttonText}>Proceed to Verification</Text>
                                                    <MaterialIcons name="chevron-right" size={20} color="#FFF" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <>
                                        {/* Dedicated OTP Verification Card */}
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => setIsOtpSent(false)}
                                            disabled={isSubmitting}
                                            style={styles.backToEditButton}
                                        >
                                            <MaterialIcons name="arrow-back" size={18} color={colors.textGrey} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, fontFamily: 'Poppins-Medium' }]}>
                                                Back to Edit Details
                                            </Text>
                                        </TouchableOpacity>

                                        <View style={[styles.otpIconContainer, { backgroundColor: colors.primary + '1A' }]}>
                                            <MaterialIcons name="sms" size={40} color={colors.primary} />
                                        </View>

                                        <Text style={[textStyles.h2, { fontSize: 18, color: colors.text, textAlign: 'center', marginTop: 16, fontFamily: 'Poppins-Bold' }]}>
                                            Verify Your Phone
                                        </Text>

                                        <Text style={[textStyles.body, { textAlign: 'center', color: colors.textGrey, marginTop: 8, marginBottom: 24, fontSize: 14, paddingHorizontal: 8 }]}>
                                            We sent a 6-digit verification code to <Text style={{ fontFamily: 'Poppins-Bold', color: colors.text }}>{phoneNumber}</Text>. Please enter it below.
                                        </Text>

                                        <FloatingLabelInput
                                            label="6-Digit SMS Code"
                                            icon="sms"
                                            value={otpCode}
                                            onChangeText={(val) => {
                                                setOtpCode(val.replace(/\D/g, ''));
                                                if (otpError) setOtpError('');
                                            }}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            error={otpError || formErrors.otpCode}
                                            backgroundColor={colors.surface}
                                        />

                                        <View style={{ marginTop: 8, marginBottom: 24 }}>
                                            {countdown > 0 ? (
                                                <Text style={[textStyles.body, { fontSize: 13, color: colors.textGrey, textAlign: 'center' }]}>
                                                    Resend code in <Text style={{ color: colors.primary, fontFamily: 'Poppins-Medium' }}>{countdown}s</Text>
                                                </Text>
                                            ) : (
                                                <TouchableOpacity 
                                                    onPress={handleProceedToVerification} 
                                                    disabled={isOtpSending}
                                                    activeOpacity={0.7}
                                                    style={{ alignSelf: 'center', padding: 8 }}
                                                >
                                                    {isOtpSending ? (
                                                        <ActivityIndicator size="small" color={colors.primary} />
                                                    ) : (
                                                        <Text style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold', fontSize: 13 }}>
                                                            Resend Verification Code
                                                        </Text>
                                                    )}
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={handleVerifyOtpAndCompleteSetup}
                                            disabled={isSubmitting || otpCode.length !== 6}
                                            style={[styles.primaryButton, { backgroundColor: colors.success, opacity: (otpCode.length !== 6 || isSubmitting) ? 0.6 : 1 }]}
                                        >
                                            {isSubmitting ? (
                                                <ActivityIndicator size="small" color="#FFF" />
                                            ) : (
                                                <View style={styles.buttonRow}>
                                                    <Text style={styles.buttonText}>Verify & Complete Setup</Text>
                                                    <MaterialIcons name="check" size={20} color="#FFF" />
                                                </View>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={{ alignSelf: 'center', marginTop: 16, padding: 8 }}
                                            onPress={() => {
                                                setIsOtpSent(false);
                                                setOtpCode('');
                                                setOtpError('');
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={{ color: colors.primary, fontFamily: 'Poppins-Medium', fontSize: 13 }}>
                                                Incorrect phone number? Edit Details
                                            </Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </View>
                    )}
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

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    keyboardAvoid: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 40,
    },
    bannerContainer: {
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 24,
    },
    iconWrapper: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardContainer: {
        paddingHorizontal: 24,
    },
    card: {
        borderRadius: 24,
        borderWidth: 1,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    flexItem: {
        flex: 1,
    },
    phoneGroup: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    verifyButton: {
        height: 58,
        paddingHorizontal: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 100,
    },
    verifyButtonText: {
        color: '#FFFFFF',
        fontFamily: 'Poppins-SemiBold',
        fontSize: 13,
    },
    otpSection: {
        marginTop: 4,
        marginBottom: 16,
        padding: 16,
        borderWidth: 1,
        borderRadius: 16,
        backgroundColor: '#F9FAFB',
    },
    verifyCodeButton: {
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
        alignSelf: 'flex-start',
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 16,
    },
    primaryButton: {
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    buttonText: {
        color: '#FFFFFF',
        fontFamily: 'Poppins-Bold',
        fontSize: 15,
        letterSpacing: 0.5,
    },
    otpIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginTop: 8,
    },
    backToEditButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        marginBottom: 16,
        paddingVertical: 6,
        borderRadius: 8,
    },
});

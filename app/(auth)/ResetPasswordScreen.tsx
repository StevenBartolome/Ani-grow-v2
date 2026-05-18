import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator
} from 'react-native';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar from '@/components/Snackbar';
import { Text } from '@/components/Text';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useAuthStyles } from '@/styles/authStyles';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const authStyles = useAuthStyles();
  const { resetPassword, updatePassword, verifyMFA } = useAuth();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'info'>('error');

  const showSnackbar = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const handleSendOtp = async () => {
    setEmailError('');
    if (!email) {
      setEmailError('Please enter your email address.');
      return;
    }
    
    setLoading(true);
    try {
      // 1. Check if user exists
      const { data, error: checkError } = await supabase
        .from('users')
        .select('email')
        .ilike('email', email.trim())
        .maybeSingle();

      if (checkError) throw checkError;

      if (!data) {
        setEmailError('This email address is not registered.');
        setLoading(false);
        return;
      }

      // 2. Send OTP
      await resetPassword(email.trim());

      showSnackbar('Verification code sent successfully!', 'success');
      setStep(2);
    } catch (error: any) {
      console.error('Send OTP error:', error);
      showSnackbar(error.message || 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      showSnackbar('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: 'email'
      });

      if (error) throw error;

      // Check if MFA is required
      const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
      if (!factorError && factorData.all.length > 0) {
        const verifiedFactors = factorData.all.filter(f => f.status === 'verified');
        if (verifiedFactors.length > 0) {
          setMfaFactorId(verifiedFactors[0].id);
          showSnackbar('MFA verification required.', 'info');
          setStep(4); // Move to MFA step
          setLoading(false);
          return;
        }
      }

      showSnackbar('Code verified!', 'success');
      setStep(3);
    } catch (error: any) {
      showSnackbar(error.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMFA = async () => {
    if (!mfaCode || mfaCode.length < 6) {
      showSnackbar('Please enter the 6-digit MFA code.');
      return;
    }
    setLoading(true);
    try {
      if (!mfaFactorId) {
        throw new Error('MFA Factor ID not found. Please try again.');
      }

      // The AuthContext verifyMFA already handles the challenge internally if challengeId is missing
      await verifyMFA(mfaFactorId, mfaCode);

      showSnackbar('MFA verified!', 'success');
      setStep(3); // Now allow password reset
    } catch (error: any) {
      console.error('MFA Verify error:', error);
      showSnackbar(error.message || 'Invalid MFA code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      await resetPassword(email.trim());
      showSnackbar('Verification code resent!', 'success');
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      showSnackbar('Please enter and confirm your new password.');
      return;
    }
    if (password !== confirmPassword) {
      showSnackbar('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);

      showSnackbar('Password updated successfully!', 'success');
      setTimeout(() => {
        router.push('/(auth)/LoginScreen');
      }, 2000);
    } catch (error: any) {
      showSnackbar(error.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 4) {
      setStep(2); // From MFA back to OTP
    } else if (step === 3) {
      if (mfaFactorId) {
        setStep(4); // From New Password back to MFA if it was required
      } else {
        setStep(2); // From New Password back to OTP if no MFA
      }
    } else if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

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
              <View style={{ width: 44, height: 44 }} />
            </View>

            <View style={[authStyles.brandingWrapper, { alignItems: 'flex-start', marginBottom: 32 }]}>
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

              <Text style={[textStyles.h1, { fontSize: 32, lineHeight: 40, color: colors.text, marginBottom: 8 }]}>
                {step === 1 ? 'Forgot Password' : step === 2 ? 'Verify Code' : step === 4 ? 'MFA Verification' : 'Reset Password'}
              </Text>
              <Text style={[textStyles.body, { color: colors.textGrey }]}>
                {step === 1 
                  ? 'Enter your email to receive a verification code.' 
                  : step === 2 
                    ? `Enter the 6-digit code sent to ${email}` 
                    : step === 4
                      ? 'Enter the 6-digit code from your authenticator app.'
                      : 'Please enter your new password below.'}
              </Text>
            </View>

            <View style={authStyles.form}>
              {step === 1 && (
                <View>
                  <FloatingLabelInput
                    label="Email Address"
                    icon="mail-outline"
                    value={email}
                    onChangeText={(text) => { setEmail(text); setEmailError(''); }}
                    autoCapitalize="none"
                    error={emailError}
                  />
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[authStyles.primaryButton, { marginTop: 16 }]}
                    onPress={handleSendOtp}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>Send OTP</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {step === 2 && (
                <View>
                  <View style={{ marginBottom: 32 }}>
                    <Text style={[textStyles.body, { marginBottom: 16, color: colors.textGrey, textAlign: 'center' }]}>
                      Please enter the code below
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', position: 'relative', paddingHorizontal: 4 }}>
                      {[0, 1, 2, 3, 4, 5].map((index) => {
                        const isFocused = otp.length === index || (otp.length === 6 && index === 5);
                        const isFilled = otp.length > index;

                        return (
                          <View
                            key={index}
                            style={{
                              width: 50,
                              height: 64,
                              borderRadius: 14,
                              backgroundColor: isFocused ? colors.primary + '10' : colors.surface,
                              borderWidth: 2,
                              borderColor: isFocused ? colors.primary : isFilled ? colors.primary + '40' : colors.stroke,
                              justifyContent: 'center',
                              alignItems: 'center',
                              shadowColor: isFocused ? colors.primary : '#000',
                              shadowOffset: { width: 0, height: isFocused ? 4 : 2 },
                              shadowOpacity: isFocused ? 0.3 : 0.05,
                              shadowRadius: isFocused ? 8 : 4,
                              elevation: isFocused ? 6 : 2,
                            }}
                          >
                            <Text 
                              style={[
                                textStyles.h1, 
                                { 
                                  fontSize: 28, 
                                  color: isFocused ? colors.primary : colors.text, lineHeight: 34
                                }
                              ]}
                            >
                              {otp[index] || ''}
                            </Text>
                          </View>
                        );
                      })}
                      <TextInput
                        value={otp}
                        onChangeText={(text) => {
                          const numericText = text.replace(/[^0-9]/g, '');
                          if (numericText.length <= 6) {
                            setOtp(numericText);
                          }
                        }}
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
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[authStyles.primaryButton, { marginTop: 8 }]}
                    onPress={handleVerifyOtp}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>Verify Code</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleResendCode}
                    style={{ alignSelf: 'center', marginTop: 16 }}
                  >
                    <Text style={[textStyles.label, { color: colors.primary }]}>Resend Code</Text>
                  </TouchableOpacity>
                </View>
              )}

              {step === 4 && (
                <View>
                  <FloatingLabelInput
                    label="MFA Verification Code"
                    icon="security"
                    value={mfaCode}
                    onChangeText={setMfaCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[authStyles.primaryButton, { marginTop: 16 }]}
                    onPress={handleVerifyMFA}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>Verify MFA</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {step === 3 && (
                <View>
                  <View style={{ marginTop: 0 }}>
                    <FloatingLabelInput
                      label="New Password"
                      icon="lock-outline"
                      value={password}
                      onChangeText={setPassword}
                      isPassword
                    />
                    <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4, lineHeight: 18 }]}>
                      Passwords must have at least 8 characters and include a mix of uppercase letters, lowercase letters, numbers, and symbols.
                    </Text>
                  </View>

                  <FloatingLabelInput
                    label="Confirm New Password"
                    icon="lock-outline"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    isPassword
                  />

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[authStyles.primaryButton, { marginTop: 16 }]}
                    onPress={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>Change Password</Text>
                    )}
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

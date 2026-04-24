import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator
} from 'react-native';
import { BackButton } from '../../src/components/BackButton';
import FloatingLabelInput from '../../src/components/FloatingLabelInput';
import Snackbar from '../../src/components/Snackbar';
import { useTextStyles } from '../../src/constants/textStyles';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStyles } from '../../src/styles/authStyles';

export default function ResetPasswordScreen() {
  const router = useRouter();
  
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const authStyles = useAuthStyles();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error'>('error');

  const showSnackbar = (message: string, type: 'success' | 'error' = 'error') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const handleSendOtp = async () => {
    if (!email) {
      showSnackbar('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      showSnackbar('Sending verification code (Mocked)...', 'success');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStep(2);
    } catch (error: any) {
      showSnackbar('Failed to send code.');
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
      showSnackbar('Code verified (Mocked)!', 'success');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStep(3);
    } catch (error: any) {
      showSnackbar('Invalid code.');
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
      showSnackbar('Password changed (Mocked)!', 'success');
      await new Promise(resolve => setTimeout(resolve, 1500));
      router.push('/(auth)/LoginScreen');
    } catch (error: any) {
      showSnackbar('Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
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
                {step === 1 ? 'Forgot Password' : step === 2 ? 'Verify Code' : 'Reset Password'}
              </Text>
              <Text style={[textStyles.body, { color: colors.textGrey }]}>
                {step === 1 
                  ? 'Enter your email to receive a verification code.' 
                  : step === 2 
                    ? `Enter the 6-digit code sent to ${email}` 
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
                    onChangeText={setEmail}
                    autoCapitalize="none"
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
                                  color: isFocused ? colors.primary : colors.text,
                                  lineHeight: 34
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

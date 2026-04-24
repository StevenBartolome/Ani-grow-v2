import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../../src/components/BackButton';
import FloatingLabelInput from '../../src/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '../../src/components/Snackbar';
import { useTextStyles } from '../../src/constants/textStyles';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuthStyles } from '../../src/styles/authStyles';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const authStyles = useAuthStyles();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Snackbar State
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

  const showSnackbar = (message: string, type: SnackbarType = 'error') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const handleResetPassword = async () => {
    if (!email) {
      showSnackbar('Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showSnackbar('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      showSnackbar('Sending reset link (Mocked)...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1500));
      showSnackbar('Password reset link sent (Mocked)!', 'success');
      setTimeout(() => {
        router.back();
      }, 2000);
    } catch (error: any) {
      showSnackbar('An error occurred.', 'error');
    } finally {
      setIsLoading(false);
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
                <BackButton onPress={() => router.back()} />
              </View>
              <View style={{ width: 44, height: 44 }} />
            </View>

            {/* Branding & Header Content */}
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
                Forgot Password
              </Text>
              <Text style={[textStyles.body, { color: colors.textGrey }]}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>
            </View>

            {/* Form */}
            <View style={authStyles.form}>
              <FloatingLabelInput
                label="Email Address"
                icon="email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TouchableOpacity
                activeOpacity={0.8}
                style={[authStyles.primaryButton, { marginTop: 16 }, isLoading && { opacity: 0.7 }]}
                onPress={handleResetPassword}
                disabled={isLoading}
              >
                <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Text>
              </TouchableOpacity>
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

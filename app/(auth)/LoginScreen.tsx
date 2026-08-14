import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuthStyles } from '@/styles/authStyles';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const authStyles = useAuthStyles();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleLogin = async () => {
    if (!email || !password) {
      showSnackbar('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn(email.trim(), password);
      
      if (result?.mfaRequired) {
        showSnackbar('MFA Verification required.', 'info');
        setTimeout(() => {
          router.replace({
            pathname: '/(auth)/MFAChallengeScreen',
            params: { email: email.trim() }
          });
        }, 1000);
        return;
      }

      showSnackbar('Login successful! Welcome back.', 'success');
        router.replace('/(dashboard)/HomeScreen');
    } catch (error: any) {
      if (error.message?.includes('Email not confirmed')) {
        showSnackbar('Email not confirmed. Redirecting to verification...', 'info');
        setTimeout(() => {
            router.push({
                pathname: '/(auth)/RegisterScreen',
                params: { email: email.trim(), step: '5' }
            });
        }, 1500);
        return;
      }
      showSnackbar(error.message || 'Invalid email or password.', 'error');
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

            {/* Branding */}
            <View style={[authStyles.brandingWrapper, { alignItems: 'flex-start', marginBottom: 40 }]}>
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
                Welcome back!
              </Text>
              <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                Please login to your account to continue.
              </Text>
            </View>

            {/* Form */}
            <View style={authStyles.form}>

              {/* Email */}
              <FloatingLabelInput
                label="Email Address"
                icon="email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {/* Password */}
              <View>
                <FloatingLabelInput
                  label="Password"
                  icon="lock"
                  value={password}
                  onChangeText={setPassword}
                  isPassword
                />

                {/* Forgot Password */}
                <TouchableOpacity style={[authStyles.forgotWrapper, { marginTop: -12 }]} onPress={() => router.push('/(auth)/ResetPasswordScreen')}>
                  <Text style={[textStyles.label, authStyles.forgotText]}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={[authStyles.primaryButton, isLoading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                <Text style={[textStyles.btnLabel, authStyles.primaryButtonText]}>
                    {isLoading ? 'Logging in...' : 'Log In'}
                </Text>
              </TouchableOpacity>

              {/* Sign Up Link */}
              <View style={authStyles.authLinkRow}>
                <Text style={[textStyles.body, authStyles.authLinkPrompt]}>
                  Don't have an account?{' '}
                </Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} onPress={() => router.push('/(auth)/RegisterScreen')}>
                  <Text style={[textStyles.label, authStyles.authLinkText]}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>

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

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
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuthStyles } from '@/styles/authStyles';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const authStyles = useAuthStyles();
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState('');

  // Snackbar State
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

  const showSnackbar = (message: string, type: SnackbarType = 'error') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const testConnection = async () => {
    setTestResult('Testing...');
    try {
      const { data, error } = await supabase
        .from('test_connection')
        .select('*')
        .limit(1);

      if (error) throw error;
      setTestResult(data && data.length > 0 ? `Success: ${data[0].message}` : 'Connected, but table is empty.');
    } catch (err: any) {
      setTestResult(`Error: ${err.message}`);
    }
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

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // No need to show snackbar here as the app will automatically redirect once auth is complete
    } catch (error: any) {
      if (error.message !== 'canceled') {
        showSnackbar(error.message || 'Google login failed.', 'error');
      }
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

              {/* Divider */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 32 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
                <Text style={[textStyles.label, { color: colors.textGrey, marginHorizontal: 16 }]}>Or login with</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
              </View>

              {/* Google Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={[authStyles.socialButton, isLoading && { opacity: 0.7 }]}
                onPress={handleGoogleLogin}
                disabled={isLoading}
              >
                <Image
                  source={require('../../assets/branding/google_logo.svg')}
                  style={{ width: 24, height: 24 }}
                  contentFit="contain"
                />
                <Text style={authStyles.socialButtonText}>Continue with Google</Text>
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

              {/* Database Debugger */}
              <View style={{ marginTop: 40, padding: 15, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke }}>
                <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 8, textAlign: 'center' }]}>Database Debugger</Text>
                <TouchableOpacity onPress={testConnection} style={{ backgroundColor: colors.primary + '20', padding: 12, borderRadius: 8 }}>
                  <Text style={{ color: colors.primary, textAlign: 'center', fontFamily: 'Poppins-SemiBold' }}>Test DB Connection</Text>
                </TouchableOpacity>
                {testResult ? <Text style={{ marginTop: 10, fontSize: 12, color: testResult.includes('Success') ? '#10b981' : '#ef4444', textAlign: 'center' }}>{testResult}</Text> : null}
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

import React, { useState, useEffect } from 'react';
import { 
  View, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView 
} from 'react-native';
import { Text } from '@/components/Text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { MaterialIcons } from '@expo/vector-icons';

export default function MFAChallengeScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const { getMFAFactors, verifyMFA } = useAuth();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Snackbar State
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

  const showSnackbar = (message: string, type: SnackbarType = 'error') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  useEffect(() => {
    const fetchFactors = async () => {
      try {
        const factors = await getMFAFactors();
        const verifiedFactor = factors.find(f => f.status === 'verified');
        if (verifiedFactor) {
          setFactorId(verifiedFactor.id);
        } else {
          showSnackbar('No verified MFA factors found. Please contact support.');
        }
      } catch (error: any) {
        showSnackbar(error.message || 'Failed to fetch MFA factors.');
      }
    };
    fetchFactors();
  }, []);

  const handleVerify = async () => {
    if (!code || code.length < 6) {
      showSnackbar('Please enter the 6-digit verification code.');
      return;
    }

    if (!factorId) {
      showSnackbar('Factor ID not found. Please try logging in again.');
      return;
    }

    setIsLoading(true);
    try {
      await verifyMFA(factorId, code);
      showSnackbar('MFA verified! Redirecting...', 'success');
      setTimeout(() => {
        router.replace('/(dashboard)/HomeScreen');
      }, 1500);
    } catch (error: any) {
      showSnackbar(error.message || 'Invalid verification code.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => router.replace('/(auth)/LoginScreen')}
              style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]}
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={[styles.iconWrapper, { backgroundColor: colors.primary + '15' }]}>
              <MaterialIcons name="security" size={48} color={colors.primary} />
            </View>

            <Text style={[textStyles.h1, { color: colors.text, marginTop: 24, textAlign: 'center' }]}>
              Two-Factor Auth
            </Text>
            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center' }]}>
              Enter the 6-digit code from your authenticator app to continue.
            </Text>

            <View style={styles.form}>
              <FloatingLabelInput
                label="Verification Code"
                icon="vpn-key"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
              />

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.primaryButton, 
                  { backgroundColor: colors.primary },
                  (isLoading || !factorId) && { opacity: 0.7 }
                ]}
                onPress={handleVerify}
                disabled={isLoading || !factorId}
              >
                <Text style={[textStyles.btnLabel, { color: '#fff' }]}>
                  {isLoading ? 'Verifying...' : 'Verify & Login'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.cancelLink}
                onPress={() => router.replace('/(auth)/LoginScreen')}
              >
                <Text style={[textStyles.label, { color: colors.primary }]}>
                  Cancel and go back
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    width: '100%',
    marginTop: 32,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  cancelLink: {
    marginTop: 20,
    alignItems: 'center',
  }
});

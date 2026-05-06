import "../global.css";
import { Stack } from "expo-router";
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
    'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
    'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
    'Poppins-Italic': require('../assets/fonts/Poppins-Italic.ttf'),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)/LoginScreen" />
            <Stack.Screen name="(auth)/RegisterScreen" />
            <Stack.Screen name="(auth)/ForgotPasswordScreen" />
            <Stack.Screen name="(auth)/ResetPasswordScreen" />
            <Stack.Screen name="(auth)/PrivacyPolicyScreen" />
            <Stack.Screen name="(auth)/TermsOfServiceScreen" />
            <Stack.Screen name="(auth)/MFAChallengeScreen" />
          </Stack>
          <ThemeToggleButton />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

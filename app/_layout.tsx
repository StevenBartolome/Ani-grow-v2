// Intercept browser console warnings to keep devtools completely clean
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    if (
      message.includes('shadow*') ||
      message.includes('shadowColor') ||
      message.includes('shadowOffset') ||
      message.includes('shadowOpacity') ||
      message.includes('shadowRadius') ||
      message.includes('boxShadow') ||
      message.includes('pointerEvents') ||
      message.includes('Expo AV')
    ) {
      return;
    }
    originalWarn(...args);
  };
}

import "../global.css";
import { Stack } from "expo-router";
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox, Platform } from 'react-native';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { FarmFilterProvider } from '@/context/FarmFilterContext';
import { AniBotFAB } from '@/components/AniBotFAB';

// Silence non-critical deprecation and third-party package warnings
LogBox.ignoreLogs([
  '[expo-av]: Expo AV has been deprecated',
  '"shadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
]);

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
          <FarmFilterProvider>
            <Stack screenOptions={{ headerShown: false }}>
              {/* Main nav screens — instant switch, no slide */}
              <Stack.Screen name="(dashboard)/HomeScreen" options={{ animation: 'none' }} />
              <Stack.Screen name="(devices)/DevicesScreen" options={{ animation: 'none' }} />
              <Stack.Screen name="(animals)/AnimalsScreen" options={{ animation: 'none' }} />
              <Stack.Screen name="(analytics)/AnalyticsScreen" options={{ animation: 'none' }} />
              <Stack.Screen name="(guide)/GuideScreen" options={{ animation: 'none' }} />
              <Stack.Screen name="(ai)/AIAssistantScreen" />
              <Stack.Screen name="(auth)/LoginScreen" />
              <Stack.Screen name="(auth)/RegisterScreen" />
              <Stack.Screen name="(auth)/ForgotPasswordScreen" />
              <Stack.Screen name="(auth)/ResetPasswordScreen" />
              <Stack.Screen name="(auth)/SetupAccountScreen" />
              <Stack.Screen name="(settings)/PrivacyPolicyScreen" />
              <Stack.Screen name="(auth)/TermsOfServiceScreen" />
              <Stack.Screen name="(auth)/MFAChallengeScreen" />
            </Stack>
            <AniBotFAB />
          </FarmFilterProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

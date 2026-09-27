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
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { LogBox, Platform } from 'react-native';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { FarmFilterProvider, useFarmFilter } from '@/context/FarmFilterContext';
import { AniBotFAB } from '@/components/AniBotFAB';
import { OfflineSyncBanner } from '@/components/OfflineSyncBanner';
import { NotificationWatcher } from '@/components/NotificationWatcher';
import { registerForPushNotificationsAsync } from '@/lib/pushToken';
import { useAuth } from '@/context/AuthContext';
import { ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';

function PushTokenRegistrar() {
  const { user } = useAuth();
  const { activeFarmIds } = useFarmFilter();

  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync(user.id, activeFarmIds[0]);
    }
  }, [user?.id, activeFarmIds]);

  return null;
}

// Silence non-critical deprecation and third-party package warnings
LogBox.ignoreLogs([
  '[expo-av]: Expo AV has been deprecated',
  '"shadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
]);

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { colors, isDark } = useTheme();

  const baseTheme = isDark ? DarkTheme : DefaultTheme;

  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.bgLight,
      card: colors.surface,
      text: colors.text,
      border: colors.stroke,
      primary: colors.primary,
      notification: colors.error,
    },
  };

  useEffect(() => {
    // Set root background color to prevent white flickers on web and native
    SystemUI.setBackgroundColorAsync(colors.bgLight);
  }, [colors.bgLight]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgLight } }}>
        {/* Main nav screens — instant switch, no slide */}
        <Stack.Screen name="(dashboard)/HomeScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(dashboard)/VetDashboardScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(devices)/DevicesScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(animals)/AnimalsScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(animals)/BatchHistoryScreen" />
        <Stack.Screen name="(animals)/HealthRecordsScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(analytics)/AnalyticsScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(guide)/GuideScreen" options={{ animation: 'none' }} />
        <Stack.Screen name="(ai)/AIAssistantScreen" />
        <Stack.Screen name="(auth)/LoginScreen" />
        <Stack.Screen name="(auth)/RegisterScreen" />
        <Stack.Screen name="(auth)/ForgotPasswordScreen" />
        <Stack.Screen name="(auth)/ResetPasswordScreen" />
        <Stack.Screen name="(auth)/SetupAccountScreen" />
        <Stack.Screen name="(settings)/PrivacyPolicyScreen" />
        <Stack.Screen name="(settings)/UserManualScreen" />
        <Stack.Screen name="(auth)/TermsOfServiceScreen" />
        <Stack.Screen name="(auth)/MFAChallengeScreen" />
      </Stack>
    </NavigationThemeProvider>
  );
}

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
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <AuthProvider>
          <FarmFilterProvider>
            <RootNavigator />
            <AniBotFAB />
            <OfflineSyncBanner />
            <NotificationWatcher />
            <PushTokenRegistrar />
          </FarmFilterProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

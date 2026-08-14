import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export default function Index() {
  const { session, profile, isLoading } = useAuth();
  const { colors } = useTheme();

  // Wait until auth is initialized and profile is loaded if session exists
  if (isLoading || (session && !profile)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgLight }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (session) {
    const hasFarm = profile?.farmId || (profile as any)?.farm_id;
    if (!hasFarm) {
      return <Redirect href="/(auth)/SetupAccountScreen" />;
    }
    return <Redirect href="/(dashboard)/HomeScreen" />; 
  }

  return <Redirect href="/(auth)/LoginScreen" />;
}

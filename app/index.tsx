import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { session, profile, isLoading } = useAuth();

  // Wait until auth is initialized and profile is loaded if session exists
  if (isLoading || (session && !profile)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
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

import { Stack } from 'expo-router';
import React from 'react';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeScreen" />
      <Stack.Screen name="SettingsScreen" />
      <Stack.Screen name="MFAScreen" />
    </Stack>
  );
}

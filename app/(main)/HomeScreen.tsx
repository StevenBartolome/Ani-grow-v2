import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useTextStyles } from '../../src/constants/textStyles';
import { MaterialIcons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../src/components/ConfirmationModal';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile, role, signOut } = useAuth();
  const { colors } = useTheme();
  const textStyles = useTextStyles();

  // Modal State
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Helper to get role-specific content
  const renderRoleContent = () => {
    switch (role) {
      case 'caretaker':
        return (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
            <MaterialIcons name="local-hospital" size={32} color={colors.primary} />
            <Text style={[textStyles.h3, { marginTop: 12, color: colors.text }]}>Caretaker Vista</Text>
            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 4 }]}>
              You have access to animal health records and daily feeding schedules.
            </Text>
          </View>
        );
      case 'owner':
        return (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
            <MaterialIcons name="business" size={32} color={colors.primary} />
            <Text style={[textStyles.h3, { marginTop: 12, color: colors.text }]}>Farm Owner Dashboard</Text>
            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 4 }]}>
              View financial reports and manage your staff.
            </Text>
          </View>
        );
      default:
        return (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
            <MaterialIcons name="help-outline" size={32} color={colors.textGrey} />
            <Text style={[textStyles.h3, { marginTop: 12, color: colors.text }]}>Guest Access</Text>
            <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 4 }]}>
              Your role is still being authorized.
            </Text>
          </View>
        );
    }
  };

  const handleLogout = async () => {
    try {
      setShowLogoutModal(false);
      await signOut();
      router.replace('/(auth)/LoginScreen');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[textStyles.body, { color: colors.textGrey }]}>Welcome back,</Text>
            <Text style={[textStyles.h1, { color: colors.text, fontSize: 24 }]}>
                {profile?.firstName || user?.email?.split('@')[0]} 👋
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity 
              onPress={() => router.push('/(main)/SettingsScreen')}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]}
            >
              <MaterialIcons name="person-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setShowLogoutModal(true)}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]}
            >
              <MaterialIcons name="logout" size={20} color={colors.error || '#ef4444'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Role Badge */}
        <View style={[styles.badge, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[textStyles.label, { color: colors.primary, textTransform: 'capitalize' }]}>
            Role: {role || 'Caretaker'}
          </Text>
        </View>

        {/* Dynamic Content Based on Role */}
        <Text style={[textStyles.h2, { marginTop: 24, marginBottom: 16, color: colors.text }]}>
            Your Dashboard
        </Text>
        
        {renderRoleContent()}

        {/* Sample Actions */}
        <View style={styles.actionGrid}>
            <TouchableOpacity style={[styles.actionItem, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                <MaterialIcons name="pets" size={24} color={colors.primary} />
                <Text style={[textStyles.label, { marginTop: 8, color: colors.text }]}>Animals</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionItem, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                <MaterialIcons name="event-note" size={24} color={colors.primary} />
                <Text style={[textStyles.label, { marginTop: 8, color: colors.text }]}>Schedules</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Custom Logout Modal */}
      <ConfirmationModal
        visible={showLogoutModal}
        title="Logout"
        message="Are you sure you want to log out of your account?"
        confirmLabel="Logout"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconButton: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  actionItem: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  }
});

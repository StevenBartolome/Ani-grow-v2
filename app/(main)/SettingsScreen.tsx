import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useTextStyles } from '../../src/constants/textStyles';
import { MaterialIcons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, role } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const textStyles = useTextStyles();

  const SettingItem = ({ icon, label, value, onPress, isLast = false, rightElement }: any) => (
    <TouchableOpacity 
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.settingItem, 
        { borderBottomColor: isLast ? 'transparent' : colors.stroke }
      ]}
    >
      <View style={styles.settingItemLeft}>
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '10' }]}>
          <MaterialIcons name={icon} size={22} color={colors.primary} />
        </View>
        <Text style={[textStyles.body, { color: colors.text, marginLeft: 12 }]}>{label}</Text>
      </View>
      <View style={styles.settingItemRight}>
        {value && <Text style={[textStyles.body, { color: colors.textGrey, marginRight: 8 }]}>{value}</Text>}
        {rightElement ? rightElement : (
          onPress && <MaterialIcons name="chevron-right" size={24} color={colors.textGrey} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.stroke }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[textStyles.h2, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} /> {/* Spacer */}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {profile?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[textStyles.h3, { color: colors.text }]}>
              {profile?.firstName} {profile?.lastName}
            </Text>
            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14 }]}>
              {user?.email}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, textTransform: 'capitalize' }]}>
                {role || 'User'}
              </Text>
            </View>
          </View>
        </View>

        {/* Account Settings */}
        <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 12, marginTop: 24 }]}>ACCOUNT</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
          <SettingItem icon="person-outline" label="Personal Information" onPress={() => {}} />
          <SettingItem icon="security" label="Multi-Factor Authentication" onPress={() => router.push('/(main)/MFAScreen')} />
          <SettingItem icon="notifications-none" label="Notifications" onPress={() => {}} isLast={true} />
        </View>

        {/* Preferences */}
        <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 12, marginTop: 24 }]}>PREFERENCES</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
          <SettingItem 
            icon="dark-mode" 
            label="Dark Mode" 
            rightElement={
              <Switch 
                value={isDark} 
                onValueChange={toggleTheme}
                trackColor={{ false: colors.stroke, true: colors.primary + '80' }}
                thumbColor={isDark ? colors.primary : '#f4f3f4'}
              />
            }
          />
          <SettingItem icon="language" label="Language" value="English" onPress={() => {}} isLast={true} />
        </View>

        {/* Support */}
        <Text style={[textStyles.label, { color: colors.textGrey, marginBottom: 12, marginTop: 24 }]}>SUPPORT</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
          <SettingItem icon="help-outline" label="Help Center" onPress={() => {}} />
          <SettingItem icon="info-outline" label="About Ani-Grow" onPress={() => {}} isLast={true} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  scrollContent: {
    padding: 24,
  },
  profileCard: {
    flexDirection: 'row',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});

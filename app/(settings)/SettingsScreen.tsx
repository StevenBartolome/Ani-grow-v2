import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { useSettingsStyles } from '@/styles/settingsStyles';
import ActionModal from '@/components/ActionModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';

export default function SettingsScreen() {
    const { profile, signOut } = useAuth();
    const settingsStyles = useSettingsStyles();
    const textStyles = useTextStyles();
    const { colors, isDark, themeMode, setThemeMode, language } = useTheme();
    const router = useRouter();

    const userName = profile?.displayName || ((profile as any)?.firstName ? `${(profile as any).firstName} ${(profile as any).lastName}` : "User");
    const userEmail = profile?.email || "Unknown Email";
    const isAdminRole = ['super_admin', 'farm_admin', 'admin'].includes(profile?.role ?? '');
    const userBadge = profile?.role === 'super_admin' ? 'Super Admin' : isAdminRole ? 'Farm Admin' : 'Employee';

    const [isLogoutModalVisible, setLogoutModalVisible] = useState(false);
    const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

    const themeOptions: { mode: ThemeMode; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }[] = [
        { mode: 'device', label: 'Device Default', icon: 'phone-android' },
        { mode: 'light',  label: 'Light',          icon: 'wb-sunny' },
        { mode: 'dark',   label: 'Dark',            icon: 'nightlight-round' },
    ];
    const activeThemeLabel = themeOptions.find(o => o.mode === themeMode)?.label ?? 'Device Default';

    const handleLogoutMenu = () => setLogoutModalVisible(true);

    const confirmLogout = async () => {
        setLogoutModalVisible(false);
        try {
            await signOut();
            router.replace('/(auth)/LoginScreen');
        } catch (error) {
            console.error('Logout Error:', error);
            Alert.alert('Error', 'Failed to log out. Please try again.');
        }
    };

    const languageLabel = language === 'fil' ? 'Filipino' : 'English';

    return (
        <SafeAreaView style={settingsStyles.safeArea}>
            <View style={settingsStyles.container}>

                {/* Header */}
                <View style={settingsStyles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Settings
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    {/* Profile Section */}
                    <View style={settingsStyles.profileSection}>
                        <View style={settingsStyles.profileAvatar}>
                            <Text translate={false} style={settingsStyles.profileAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text translate={false} style={[textStyles.h2, settingsStyles.profileName]}>{userName}</Text>
                        <Text style={[textStyles.body, settingsStyles.profileEmail]}>{userEmail}</Text>
                        <View style={settingsStyles.profileBadge}>
                            <MaterialIcons name="verified" size={14} color={colors.primary} />
                            <Text style={[settingsStyles.profileBadgeText, { color: colors.primary }]}>{userBadge}</Text>
                        </View>
                    </View>

                    {/* General Settings */}
                    <View style={settingsStyles.section}>
                        <Text style={settingsStyles.sectionTitle}>General</Text>
                        <View style={settingsStyles.card}>
                            {/* Language */}
                            <TouchableOpacity
                                style={settingsStyles.row}
                                activeOpacity={0.7}
                                onPress={() => router.push('/(settings)/LanguageScreen')}
                            >
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: colors.primary + '1A' }]}>
                                        <MaterialIcons name="translate" size={22} color={colors.primary} />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Language</Text>
                                </View>
                                <View style={settingsStyles.rowRight}>
                                    <Text style={settingsStyles.rowValue} translate={false}>{languageLabel}</Text>
                                    <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>

                            {/* Notifications */}
                            <TouchableOpacity
                                style={[settingsStyles.row, settingsStyles.rowNoBorder]}
                                activeOpacity={0.7}
                                onPress={() => router.push('/(settings)/NotificationSettingsScreen')}
                            >
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#3B82F6' + '1A' }]}>
                                        <MaterialIcons name="notifications-none" size={22} color="#3B82F6" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Notifications</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* App Preferences */}
                    <View style={settingsStyles.section}>
                        <Text style={settingsStyles.sectionTitle}>App Preferences</Text>
                        <View style={settingsStyles.card}>
                            {/* Theme */}
                            <TouchableOpacity
                                style={[settingsStyles.row, settingsStyles.rowNoBorder]}
                                activeOpacity={0.7}
                                onPress={() => setThemeDropdownOpen(v => !v)}
                            >
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#8B5CF6' + '1A' }]}>
                                        <MaterialIcons
                                            name={isDark ? 'nightlight-round' : 'wb-sunny'}
                                            size={22}
                                            color="#8B5CF6"
                                        />
                                    </View>
                                    <View>
                                        <Text style={settingsStyles.rowTitle}>Theme</Text>
                                        <Text style={settingsStyles.rowDescription}>{activeThemeLabel}</Text>
                                    </View>
                                </View>
                                <MaterialIcons
                                    name={themeDropdownOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                                    size={22}
                                    color={colors.textGrey}
                                />
                            </TouchableOpacity>

                            {themeDropdownOpen && (
                                <View style={{ borderTopWidth: 1, borderTopColor: colors.stroke, paddingVertical: 8, paddingHorizontal: 16, gap: 4 }}>
                                    {themeOptions.map(opt => {
                                        const isSelected = themeMode === opt.mode;
                                        return (
                                            <TouchableOpacity
                                                key={opt.mode}
                                                activeOpacity={0.7}
                                                onPress={() => { setThemeMode(opt.mode); setThemeDropdownOpen(false); }}
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center',
                                                    paddingVertical: 10, paddingHorizontal: 12,
                                                    borderRadius: 10,
                                                    backgroundColor: isSelected ? colors.primary + '12' : 'transparent',
                                                }}
                                            >
                                                <MaterialIcons
                                                    name={opt.icon}
                                                    size={18}
                                                    color={isSelected ? colors.primary : colors.textGrey}
                                                    style={{ marginRight: 12 }}
                                                />
                                                <Text style={[settingsStyles.rowTitle, { color: isSelected ? colors.primary : colors.text, fontSize: 14 }]}>
                                                    {opt.label}
                                                </Text>
                                                {isSelected && (
                                                    <MaterialIcons name="check" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Farm Admin */}
                    {isAdminRole && profile?.role !== 'super_admin' && (
                        <View style={settingsStyles.section}>
                            <Text style={settingsStyles.sectionTitle}>Farm Administration</Text>
                            <View style={settingsStyles.card}>

                                {/* My Farms */}
                                <TouchableOpacity
                                    style={settingsStyles.row}
                                    activeOpacity={0.7}
                                    onPress={() => router.push('/(settings)/FarmsScreen' as any)}
                                >
                                    <View style={settingsStyles.rowContent}>
                                        <View style={[settingsStyles.iconBox, { backgroundColor: '#10B981' + '1A' }]}>
                                            <MaterialIcons name="add-home-work" size={22} color="#10B981" />
                                        </View>
                                        <View>
                                            <Text style={settingsStyles.rowTitle}>My Farms</Text>
                                            <Text style={settingsStyles.rowDescription}>Add farms, switch active farm</Text>
                                        </View>
                                    </View>
                                    <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                                </TouchableOpacity>

                                {/* Invite Codes */}
                                <TouchableOpacity
                                    style={[settingsStyles.row, settingsStyles.rowNoBorder]}
                                    activeOpacity={0.7}
                                    onPress={() => router.push('/(settings)/InviteCodesScreen')}
                                >
                                    <View style={settingsStyles.rowContent}>
                                        <View style={[settingsStyles.iconBox, { backgroundColor: colors.primary + '1A' }]}>
                                            <MaterialIcons name="group-add" size={22} color={colors.primary} />
                                        </View>
                                        <View>
                                            <Text style={settingsStyles.rowTitle}>Invite Codes</Text>
                                            <Text style={settingsStyles.rowDescription}>Manage staff invite codes</Text>
                                        </View>
                                    </View>
                                    <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Account */}
                    <View style={settingsStyles.section}>
                        <Text style={settingsStyles.sectionTitle}>Account</Text>
                        <View style={settingsStyles.card}>
                            <TouchableOpacity 
                                style={settingsStyles.row} 
                                activeOpacity={0.7}
                                onPress={() => router.push('/(settings)/EditProfileScreen')}
                            >
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#3B82F6' + '1A' }]}>
                                        <MaterialIcons name="manage-accounts" size={22} color="#3B82F6" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Edit Profile</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={settingsStyles.row}
                                activeOpacity={0.7}
                                onPress={() => router.push('/(settings)/ChangePasswordScreen')}
                            >
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#F59E0B' + '1A' }]}>
                                        <MaterialIcons name="lock-outline" size={22} color="#F59E0B" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Change Password</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[settingsStyles.row, settingsStyles.rowNoBorder]}
                                activeOpacity={0.7}
                                onPress={() => router.push('/(settings)/MFAScreen')}
                            >
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#10B981' + '1A' }]}>
                                        <MaterialIcons name="security" size={22} color="#10B981" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Multi-Factor Authentication</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Information */}
                    <View style={settingsStyles.section}>
                        <Text style={settingsStyles.sectionTitle}>Information</Text>
                        <View style={settingsStyles.card}>
                            <TouchableOpacity style={settingsStyles.row} activeOpacity={0.7} onPress={() => router.push('/(settings)/AboutAppScreen')}>
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#64748B' + '1A' }]}>
                                        <MaterialIcons name="info-outline" size={22} color="#64748B" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>About App</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            <TouchableOpacity style={settingsStyles.row} activeOpacity={0.7} onPress={() => router.push('/(auth)/TermsOfServiceScreen')}>
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#10B981' + '1A' }]}>
                                        <MaterialIcons name="description" size={22} color="#10B981" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Terms of Service</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            <TouchableOpacity style={[settingsStyles.row, settingsStyles.rowNoBorder]} activeOpacity={0.7} onPress={() => router.push('/(auth)/PrivacyPolicyScreen')}>
                                <View style={settingsStyles.rowContent}>
                                    <View style={[settingsStyles.iconBox, { backgroundColor: '#64748B' + '1A' }]}>
                                        <MaterialIcons name="shield" size={22} color="#64748B" />
                                    </View>
                                    <Text style={settingsStyles.rowTitle}>Privacy Policy</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Logout Button */}
                    <TouchableOpacity
                        style={settingsStyles.logoutButton}
                        activeOpacity={0.8}
                        onPress={handleLogoutMenu}
                    >
                        <MaterialIcons name="logout" size={22} color="#EF4444" />
                        <Text style={settingsStyles.logoutText}>Log Out</Text>
                    </TouchableOpacity>

                </ScrollView>
            </View>

            {/* ─── Logout Confirmation Modal ──────────────────────────────────────────── */}
            <ActionModal
                visible={isLogoutModalVisible}
                type="warning"
                title="Log Out"
                message="Are you sure you want to log out of your account?"
                confirmText="Log Out"
                cancelText="Cancel"
                onConfirm={confirmLogout}
                onCancel={() => setLogoutModalVisible(false)}
            />


        </SafeAreaView>
    );
}
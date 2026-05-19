import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import ActionModal from '@/components/ActionModal';

interface Props {
    visible: boolean;
    onClose: () => void;
    activeFarmName: string;
}

export const ProfileDrawer: React.FC<Props> = ({ visible, onClose, activeFarmName }) => {
    const { colors, isDark, themeMode, setThemeMode } = useTheme();
    const textStyles = useTextStyles();
    const { profile, signOut } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();

    const [isLogoutModalVisible, setLogoutModalVisible] = useState(false);

    // Compute drawer width (about 78% of screen, capped at 300px for larger displays)
    const DRAWER_WIDTH = Math.min(width * 0.78, 300);

    // Slide-out and fade animations
    const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(fadeAnim,  { toValue: 0.4, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 240, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(fadeAnim,  { toValue: 0,   duration: 200, useNativeDriver: Platform.OS !== 'web' }),
            ]).start();
        }
    }, [visible, DRAWER_WIDTH]);

    const handleLink = (route: string) => {
        // Animate out, then navigate
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(fadeAnim,  { toValue: 0,   duration: 160, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => {
            onClose();
            router.push(route as any);
        });
    };

    const handleLogoutTrigger = () => {
        setLogoutModalVisible(true);
    };

    const confirmLogout = async () => {
        setLogoutModalVisible(false);
        try {
            // Close drawer animations first
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(fadeAnim,  { toValue: 0,   duration: 150, useNativeDriver: Platform.OS !== 'web' }),
            ]).start(async () => {
                onClose();
                await signOut();
                router.replace('/(auth)/LoginScreen');
            });
        } catch (error) {
            console.error('Logout Error:', error);
            Alert.alert('Error', 'Failed to log out. Please try again.');
        }
    };

    const userName = profile?.firstName
        ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
        : profile?.displayName || 'User';
    const userEmail = profile?.email || 'Unknown Email';
    
    const isAdminRole = ['super_admin', 'farm_admin', 'admin'].includes(profile?.role ?? '');
    const userBadge = profile?.role === 'super_admin' ? 'Super Admin' : isAdminRole ? 'Farm Admin' : 'Employee';

    const themeOptions: { mode: ThemeMode; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }[] = [
        { mode: 'device', label: 'Device', icon: 'phone-android' },
        { mode: 'light',  label: 'Light',  icon: 'wb-sunny' },
        { mode: 'dark',   label: 'Dark',   icon: 'nightlight-round' },
    ];

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <View style={styles.modalRoot}>
                {/* Backdrop */}
                <Animated.View
                    style={[
                        styles.backdrop,
                        {
                            opacity: fadeAnim,
                        }
                    ]}
                >
                    <Pressable style={{ flex: 1 }} onPress={onClose} />
                </Animated.View>

                {/* Left Drawer Panel */}
                <Animated.View
                    style={[
                        styles.drawerPanel,
                        {
                            width: DRAWER_WIDTH,
                            backgroundColor: colors.surface,
                            borderRightColor: colors.stroke,
                            transform: [{ translateX: slideAnim }],
                            paddingTop: Math.max(insets.top, 16),
                            paddingBottom: Math.max(insets.bottom, 16),
                        }
                    ]}
                >
                    {/* Header: User Profile Info */}
                    <View style={styles.drawerHeader}>
                        <View style={[styles.avatarBox, { backgroundColor: colors.primary }]}>
                            <Text translate={false} style={styles.avatarInitial}>{userName.charAt(0).toUpperCase()}</Text>
                        </View>

                        <Text translate={false} numberOfLines={1} style={[textStyles.h2, styles.profileName, { color: colors.text }]}>
                            {userName}
                        </Text>
                        <Text numberOfLines={1} style={[textStyles.body, styles.profileEmail, { color: colors.textGrey }]}>
                            {userEmail}
                        </Text>

                        {/* Verified badge style */}
                        <View style={[styles.roleBadge, { backgroundColor: colors.primary + '1A' }]}>
                            <MaterialIcons name="verified" size={12} color={colors.primary} />
                            <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{userBadge}</Text>
                        </View>

                        {/* Active Farm Quick Indicator */}
                        <View style={[styles.activeFarmBox, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                            <MaterialIcons name="home-work" size={14} color={colors.primary} />
                            <Text numberOfLines={1} style={[styles.activeFarmText, { color: colors.text }]}>
                                {activeFarmName}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.stroke }]} />

                    {/* Scrollable Navigation List */}
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        <Text style={[styles.menuSectionHeader, { color: colors.textGrey }]}>Account Settings</Text>
                        
                        <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/EditProfileScreen')}>
                            <View style={[styles.iconContainer, { backgroundColor: '#3B82F61A' }]}>
                                <MaterialIcons name="manage-accounts" size={20} color="#3B82F6" />
                            </View>
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Edit Profile</Text>
                            <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/ChangePasswordScreen')}>
                            <View style={[styles.iconContainer, { backgroundColor: '#F59E0B1A' }]}>
                                <MaterialIcons name="lock-outline" size={20} color="#F59E0B" />
                            </View>
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Change Password</Text>
                            <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/MFAScreen')}>
                            <View style={[styles.iconContainer, { backgroundColor: '#10B9811A' }]}>
                                <MaterialIcons name="security" size={20} color="#10B981" />
                            </View>
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Security & MFA</Text>
                            <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                        </TouchableOpacity>

                        {/* Admin Specific Links */}
                        {isAdminRole && (
                            <>
                                <View style={[styles.sectionDivider, { backgroundColor: colors.stroke }]} />
                                <Text style={[styles.menuSectionHeader, { color: colors.textGrey }]}>Administration</Text>

                                <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/FarmsScreen')}>
                                    <View style={[styles.iconContainer, { backgroundColor: '#10B9811A' }]}>
                                        <MaterialIcons name="add-home-work" size={20} color="#10B981" />
                                    </View>
                                    <Text style={[styles.menuItemText, { color: colors.text }]}>My Farms</Text>
                                    <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/InviteCodesScreen')}>
                                    <View style={[styles.iconContainer, { backgroundColor: colors.primary + '1A' }]}>
                                        <MaterialIcons name="group-add" size={20} color={colors.primary} />
                                    </View>
                                    <Text style={[styles.menuItemText, { color: colors.text }]}>Invite Codes</Text>
                                    <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                                </TouchableOpacity>
                            </>
                        )}

                        <View style={[styles.sectionDivider, { backgroundColor: colors.stroke }]} />
                        <Text style={[styles.menuSectionHeader, { color: colors.textGrey }]}>App & Information</Text>

                        <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/NotificationSettingsScreen')}>
                            <View style={[styles.iconContainer, { backgroundColor: '#3B82F61A' }]}>
                                <MaterialIcons name="notifications-none" size={20} color="#3B82F6" />
                            </View>
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Notifications</Text>
                            <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(settings)/AboutAppScreen')}>
                            <View style={[styles.iconContainer, { backgroundColor: '#64748B1A' }]}>
                                <MaterialIcons name="info-outline" size={20} color="#64748B" />
                            </View>
                            <Text style={[styles.menuItemText, { color: colors.text }]}>About Ani-Grow</Text>
                            <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={() => handleLink('/(auth)/PrivacyPolicyScreen')}>
                            <View style={[styles.iconContainer, { backgroundColor: '#64748B1A' }]}>
                                <MaterialIcons name="shield" size={20} color="#64748B" />
                            </View>
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Privacy Policy</Text>
                            <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} style={styles.chevron} />
                        </TouchableOpacity>
                    </ScrollView>

                    {/* Bottom Section: Theme & Logout */}
                    <View style={[styles.drawerFooter, { borderTopColor: colors.stroke }]}>
                        {/* Theme Segment Selector */}
                        <View style={styles.themeSelector}>
                            <View style={[styles.themePillContainer, { backgroundColor: colors.bgLight }]}>
                                {themeOptions.map(opt => {
                                    const isSelected = themeMode === opt.mode;
                                    return (
                                        <TouchableOpacity
                                            key={opt.mode}
                                            activeOpacity={0.7}
                                            onPress={() => setThemeMode(opt.mode)}
                                            style={[
                                                styles.themePill,
                                                isSelected && { backgroundColor: colors.surface }
                                            ]}
                                        >
                                            <MaterialIcons
                                                name={opt.icon}
                                                size={15}
                                                color={isSelected ? colors.primary : colors.textGrey}
                                            />
                                            <Text style={[
                                                styles.themePillText,
                                                { color: isSelected ? colors.primary : colors.textGrey }
                                            ]}>
                                                {opt.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Logout Option */}
                        <TouchableOpacity
                            style={[styles.logoutButton, { backgroundColor: colors.cardFill }]}
                            activeOpacity={0.8}
                            onPress={handleLogoutTrigger}
                        >
                            <MaterialIcons name="logout" size={18} color="#EF4444" />
                            <Text style={styles.logoutText}>Log Out</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>

            {/* Logout Confirmation ActionModal */}
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
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
        flexDirection: 'row',
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000',
    },
    drawerPanel: {
        height: '100%',
        borderRightWidth: 1,
        ...Platform.select({
            web: { boxShadow: '6px 0px 24px rgba(0, 0, 0, 0.12)' },
            default: {
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 16,
                shadowOffset: { width: 4, height: 0 },
                elevation: 16,
            }
        })
    },
    drawerHeader: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        alignItems: 'flex-start',
    },
    avatarBox: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontSize: 22,
        fontFamily: 'Poppins-Bold',
    },
    profileName: {
        fontSize: 18,
        fontFamily: 'Poppins-SemiBold',
        marginBottom: 2,
    },
    profileEmail: {
        fontSize: 12,
        fontFamily: 'Poppins-Regular',
        marginBottom: 10,
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        marginBottom: 10,
    },
    roleBadgeText: {
        fontSize: 10,
        fontFamily: 'Poppins-SemiBold',
    },
    activeFarmBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        width: '100%',
    },
    activeFarmText: {
        fontSize: 11,
        fontFamily: 'Poppins-Medium',
        flex: 1,
    },
    divider: {
        height: 1,
        width: '100%',
    },
    sectionDivider: {
        height: 1,
        marginHorizontal: 20,
        marginVertical: 12,
        opacity: 0.7,
    },
    scrollContent: {
        paddingVertical: 14,
    },
    menuSectionHeader: {
        fontSize: 10,
        fontFamily: 'Poppins-SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        paddingHorizontal: 20,
        marginBottom: 6,
        marginTop: 2,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuItemText: {
        fontSize: 13,
        fontFamily: 'Poppins-Medium',
        flex: 1,
    },
    chevron: {
        opacity: 0.6,
    },
    drawerFooter: {
        borderTopWidth: 1,
        paddingHorizontal: 20,
        paddingTop: 14,
        gap: 12,
    },
    themeSelector: {
        width: '100%',
    },
    themePillContainer: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 3,
        justifyContent: 'space-between',
        gap: 2,
    },
    themePill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        gap: 4,
    },
    themePillText: {
        fontSize: 10,
        fontFamily: 'Poppins-Medium',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 10,
        gap: 6,
        width: '100%',
    },
    logoutText: {
        color: '#EF4444',
        fontSize: 13,
        fontFamily: 'Poppins-SemiBold',
    },
});

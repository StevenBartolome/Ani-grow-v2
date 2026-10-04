import React, { useState, useEffect, useCallback } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    ScrollView,
    Switch,
    TouchableOpacity,
    View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { registerForPushNotificationsAsync } from '@/lib/pushToken';
import { syncAllScheduledNotifications } from '@/lib/notificationScheduler';
import {
    isPushNotificationEnabled,
    setPushNotificationEnabled,
    createNotification,
    EMAIL_NOTIFS_ENABLED_KEY,
    MARKETING_NOTIFS_ENABLED_KEY,
} from '@/lib/notify';

export default function NotificationSettingsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();
    const { user, profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const userId = user?.id || (profile as any)?.id || '';
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    const [isLoading, setIsLoading] = useState(true);
    const [isUpdatingPush, setIsUpdatingPush] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(true);
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [marketingEnabled, setMarketingEnabled] = useState(false);

    // ─── Load Preferences on Mount ─────────────────────────────
    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const pushVal = await isPushNotificationEnabled();
                const emailVal = (await AsyncStorage.getItem(EMAIL_NOTIFS_ENABLED_KEY)) === 'true';
                const mktVal = (await AsyncStorage.getItem(MARKETING_NOTIFS_ENABLED_KEY)) === 'true';

                if (isMounted) {
                    setPushEnabled(pushVal);
                    setEmailEnabled(emailVal);
                    setMarketingEnabled(mktVal);
                }
            } catch (err) {
                console.error('[NotificationSettings] load error:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        })();
        return () => {
            isMounted = false;
        };
    }, []);

    // ─── Push Notification Toggle Handler ──────────────────────
    const handleTogglePush = async (nextValue: boolean) => {
        setIsUpdatingPush(true);
        try {
            if (nextValue) {
                // User is enabling push notifications
                if (Platform.OS !== 'web') {
                    const { status: existingStatus } = await Notifications.getPermissionsAsync();
                    let finalStatus = existingStatus;

                    if (existingStatus !== 'granted') {
                        const { status } = await Notifications.requestPermissionsAsync();
                        finalStatus = status;
                    }

                    if (finalStatus !== 'granted') {
                        // Permission denied at OS level
                        Alert.alert(
                            'Notifications Permission Required',
                            'Push notifications are currently disabled in your device settings. Please allow notifications in system settings to receive farm alerts.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Open Settings',
                                    onPress: () => {
                                        if (Platform.OS === 'ios') {
                                            Linking.openURL('app-settings:');
                                        } else {
                                            Linking.openSettings();
                                        }
                                    },
                                },
                            ]
                        );
                        setPushEnabled(false);
                        await setPushNotificationEnabled(false);
                        return;
                    }

                    // Register device token in database & sync scheduled alarms
                    if (userId) {
                        await registerForPushNotificationsAsync(userId, farmId);
                    }
                    if (farmId) {
                        await syncAllScheduledNotifications(farmId);
                    }
                }

                setPushEnabled(true);
                await setPushNotificationEnabled(true);
                Alert.alert('Push Notifications Enabled', 'You will receive real-time push alerts and scheduled farm reminders on this device.');
            } else {
                // User is disabling push notifications
                setPushEnabled(false);
                await setPushNotificationEnabled(false);

                if (Platform.OS !== 'web') {
                    await Notifications.cancelAllScheduledNotificationsAsync();
                }

                Alert.alert(
                    'Push Notifications Disabled',
                    'Push alerts and reminders have been turned off for this device. You can turn them back on anytime.'
                );
            }
        } catch (err: any) {
            console.error('[NotificationSettings] toggle error:', err);
            Alert.alert('Error', err?.message || 'Failed to update notification settings.');
        } finally {
            setIsUpdatingPush(false);
        }
    };

    // ─── Email Toggle Handler ──────────────────────────────────
    const handleToggleEmail = async (nextValue: boolean) => {
        setEmailEnabled(nextValue);
        try {
            await AsyncStorage.setItem(EMAIL_NOTIFS_ENABLED_KEY, nextValue ? 'true' : 'false');
        } catch (err) {
            console.error('[NotificationSettings] email toggle error:', err);
        }
    };

    // ─── Marketing Toggle Handler ──────────────────────────────
    const handleToggleMarketing = async (nextValue: boolean) => {
        setMarketingEnabled(nextValue);
        try {
            await AsyncStorage.setItem(MARKETING_NOTIFS_ENABLED_KEY, nextValue ? 'true' : 'false');
        } catch (err) {
            console.error('[NotificationSettings] marketing toggle error:', err);
        }
    };

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Notification Settings
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                {isLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Alerts & Notifications</Text>
                            <Text style={styles.sectionDescription}>Decide how you receive alerts and reminders on this device.</Text>

                            <View style={styles.card}>
                                {/* Push Notifications Switch */}
                                <View style={[styles.row, styles.rowBorder]}>
                                    <View style={styles.rowTextContainer}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.rowTitle}>Push Notifications</Text>
                                            {isUpdatingPush && <ActivityIndicator size="small" color={colors.primary} />}
                                        </View>
                                        <Text style={styles.rowDescription}>
                                            {pushEnabled
                                                ? 'Active • Receives real-time banners and scheduled offline alerts.'
                                                : 'Disabled • No notification banners will be displayed.'}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={pushEnabled}
                                        onValueChange={handleTogglePush}
                                        disabled={isUpdatingPush}
                                        trackColor={{ false: colors.stroke, true: colors.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                </View>

                                {/* Email Updates Switch */}
                                <View style={[styles.row, styles.rowBorder]}>
                                    <View style={styles.rowTextContainer}>
                                        <Text style={styles.rowTitle}>Email Updates</Text>
                                        <Text style={styles.rowDescription}>Get important account and farm summaries by email.</Text>
                                    </View>
                                    <Switch
                                        value={emailEnabled}
                                        onValueChange={handleToggleEmail}
                                        trackColor={{ false: colors.stroke, true: colors.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                </View>

                                {/* Marketing & Offers Switch */}
                                <View style={styles.row}>
                                    <View style={styles.rowTextContainer}>
                                        <Text style={styles.rowTitle}>Product Tips & Guides</Text>
                                        <Text style={styles.rowDescription}>Receive AI recommendations and livestock SOP guides.</Text>
                                    </View>
                                    <Switch
                                        value={marketingEnabled}
                                        onValueChange={handleToggleMarketing}
                                        trackColor={{ false: colors.stroke, true: colors.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                )}
            </View>
        </View>
    );
}

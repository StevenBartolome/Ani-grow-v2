import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

let lastRegisteredToken: string | null = null;
let lastRegisteredUser: string | null = null;

export async function registerForPushNotificationsAsync(userId?: string, farmId?: string): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    if (!userId) return null;

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            return null;
        }

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'AniGrow Notifications',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#16A34A',
            });
        }

        let token: string | null = null;

        try {
            if (Platform.OS === 'android') {
                const tokenData = await Notifications.getDevicePushTokenAsync();
                token = typeof tokenData.data === 'string' ? tokenData.data : (tokenData as any)?.data?.token ?? null;
            } else {
                // On iOS, fallback gracefully to Expo push token if APNs entitlement is not configured (e.g. in Expo Go / simulator)
                try {
                    const tokenData = await Notifications.getDevicePushTokenAsync();
                    token = typeof tokenData.data === 'string' ? tokenData.data : null;
                } catch {
                    const expoToken = await Notifications.getExpoPushTokenAsync();
                    token = expoToken.data;
                }
            }
        } catch {
            // Fallback for development environments
            try {
                const fallback = await Notifications.getExpoPushTokenAsync();
                token = fallback.data;
            } catch {
                token = null;
            }
        }

        if (!token) return null;

        // Skip redundant database updates if token and user haven't changed
        if (token === lastRegisteredToken && userId === lastRegisteredUser) {
            return token;
        }

        const { error } = await supabase.from('user_push_tokens').upsert(
            {
                user_id: userId,
                farm_id: farmId || null,
                fcm_token: token,
                device_type: Platform.OS,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,fcm_token' }
        );

        if (error) {
            console.warn('[pushToken] Failed to save token in Supabase:', error.message);
        } else {
            lastRegisteredToken = token;
            lastRegisteredUser = userId;
        }

        return token;
    } catch (error) {
        console.warn('[pushToken] Registration error:', error);
        return null;
    }
}

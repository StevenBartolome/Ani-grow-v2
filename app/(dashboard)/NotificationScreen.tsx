import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useNotificationStyles } from '@/styles/notificationStyles';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { AniFeedIcon } from '@/components/AniFeedIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { supabase } from '@/lib/supabase';
import { sortByPriority } from '@/lib/notify';

interface AppNotification {
    id: string;
    title: string;
    message: string;
    time: string;
    type: 'alert' | 'info' | 'warning' | 'success';
    category: string | null;
    actionUrl?: string | null;
    created_at: string;
    isRead: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
    device_alert: 'Device',
    weight_alert: 'Weight',
    feed_alert: 'Feed',
    health_alert: 'Health',
};

function formatNotificationDate(ts: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
}

function mapType(type: string): AppNotification['type'] {
    if (type === 'error') return 'alert';
    if (type === 'warning' || type === 'success' || type === 'info') return type;
    return 'info';
}

function resolveNotificationRoute(
    actionUrl: string | null | undefined,
    category: string | null | undefined,
    title: string,
    message: string
): string | null {
    let url = (actionUrl || '').trim();

    if (url) {
        // Normalize legacy paths that omit route group parentheses
        if (url.startsWith('/AnimalDetails')) url = url.replace('/AnimalDetails', '/(animals)/AnimalDetails');
        if (url.startsWith('/AnimalsScreen')) url = url.replace('/AnimalsScreen', '/(animals)/AnimalsScreen');
        if (url.startsWith('/HealthRecordsScreen')) url = url.replace('/HealthRecordsScreen', '/(animals)/HealthRecordsScreen');
        if (url.startsWith('/MortalityRecordsScreen')) url = url.replace('/MortalityRecordsScreen', '/(animals)/MortalityRecordsScreen');
        if (url.startsWith('/DevicesScreen')) url = url.replace('/DevicesScreen', '/(devices)/DevicesScreen');
        if (url.startsWith('/DeviceSettingsScreen')) url = url.replace('/DeviceSettingsScreen', '/(devices)/DeviceSettingsScreen');
        if (url.startsWith('/AniWeighScreen')) url = url.replace('/AniWeighScreen', '/(devices)/AniWeighScreen');
        if (url.startsWith('/AniFeedScreen')) url = url.replace('/AniFeedScreen', '/(devices)/AniFeedScreen');
        if (url.startsWith('/RecentLogsScreen')) url = url.replace('/RecentLogsScreen', '/(devices)/RecentLogsScreen');
        if (url.startsWith('/DispenseRecordsScreen')) url = url.replace('/DispenseRecordsScreen', '/(devices)/DispenseRecordsScreen');
        if (url.startsWith('/ManageFeedsScreen')) url = url.replace('/ManageFeedsScreen', '/(devices)/ManageFeedsScreen');
        if (url.startsWith('/ManageHousingsScreen')) url = url.replace('/ManageHousingsScreen', '/(devices)/ManageHousingsScreen');
        if (url.startsWith('/VaccineScreen')) url = url.replace('/VaccineScreen', '/(health)/VaccineScreen');
        if (url.startsWith('/(vaccine)/VaccineScreen')) url = url.replace('/(vaccine)/VaccineScreen', '/(health)/VaccineScreen');
        if (url.startsWith('/AnalyticsScreen')) url = url.replace('/AnalyticsScreen', '/(analytics)/AnalyticsScreen');
        if (url.startsWith('/GrowthReportScreen')) url = url.replace('/GrowthReportScreen', '/(analytics)/GrowthReportScreen');
        if (url.startsWith('/FeedReportScreen')) url = url.replace('/FeedReportScreen', '/(analytics)/FeedReportScreen');
        if (url.startsWith('/HealthReportScreen')) url = url.replace('/HealthReportScreen', '/(analytics)/HealthReportScreen');
        if (url.startsWith('/PredictionReportScreen')) url = url.replace('/PredictionReportScreen', '/(analytics)/PredictionReportScreen');
        if (url.startsWith('/HomeScreen')) url = url.replace('/HomeScreen', '/(dashboard)/HomeScreen');
        if (url.startsWith('/NotificationScreen')) url = url.replace('/NotificationScreen', '/(dashboard)/NotificationScreen');
        if (url.startsWith('/GuideScreen')) url = url.replace('/GuideScreen', '/(guide)/GuideScreen');
        if (url.startsWith('/FarmsScreen')) url = url.replace('/FarmsScreen', '/(settings)/FarmsScreen');
        if (url.startsWith('/InviteCodesScreen')) url = url.replace('/InviteCodesScreen', '/(settings)/InviteCodesScreen');
        return url;
    }

    // Smart fallback routing when no actionUrl is set
    const text = `${title} ${message}`.toLowerCase();
    if (category === 'weight_alert' || text.includes('weigh') || text.includes('weight')) {
        return '/(devices)/RecentLogsScreen';
    }
    if (category === 'feed_alert' || text.includes('feed') || text.includes('dispense')) {
        if (text.includes('dispense')) return '/(devices)/DispenseRecordsScreen';
        return '/(devices)/ManageFeedsScreen';
    }
    if (category === 'health_alert' || text.includes('vaccin') || text.includes('mortality') || text.includes('health') || text.includes('deceased')) {
        if (text.includes('vaccin')) return '/(health)/VaccineScreen';
        return '/(animals)/HealthRecordsScreen';
    }
    if (category === 'device_alert' || text.includes('device') || text.includes('offline') || text.includes('online')) {
        return '/(devices)/DevicesScreen';
    }
    if (category === 'farm_registered' || text.includes('farm')) {
        return '/(settings)/FarmsScreen';
    }
    if (category === 'invite' || text.includes('invite') || text.includes('code')) {
        return '/(settings)/InviteCodesScreen';
    }
    if (category === 'ai_suggestion' || text.includes('insight') || text.includes('ai')) {
        return '/(ai)/AIAssistantScreen';
    }

    return null;
}

export default function NotificationScreen() {
    const router = useRouter();
    const notificationStyles = useNotificationStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const userId = (profile as any)?.uid || (profile as any)?.id;

    const fetchNotifications = useCallback(async (isPullToRefresh = false) => {
        if (!userId) {
            setIsLoading(false);
            setRefreshing(false);
            return;
        }
        if (isPullToRefresh) {
            setRefreshing(true);
        } else {
            setIsLoading(true);
        }
        try {
            let query = supabase
                .from('notifications')
                .select('id, title, message, type, category, action_url, is_read, created_at')
                .order('created_at', { ascending: false });

            if (activeFarmIds.length > 0) {
                const farmConditions = activeFarmIds.map(fId => `farm_id.eq.${fId}`).join(',');
                query = query.or(`user_id.eq.${userId},${farmConditions}`);
            } else if (farmId) {
                query = query.or(`user_id.eq.${userId},farm_id.eq.${farmId}`);
            } else {
                query = query.eq('user_id', userId);
            }

            const { data, error } = await query;
            if (error) throw error;

            setNotifications(
                sortByPriority(data ?? []).map(n => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    time: formatNotificationDate(n.created_at),
                    type: mapType(n.type),
                    category: n.category,
                    actionUrl: n.action_url,
                    created_at: n.created_at,
                    isRead: n.is_read,
                }))
            );
        } catch (err) {
            console.error('[Notifications] fetch error:', err);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [userId, farmId, activeFarmIds]);

    useFocusEffect(
        useCallback(() => {
            fetchNotifications();
        }, [fetchNotifications])
    );

    // Dynamic Realtime Postgres changes listener
    useEffect(() => {
        const channelName = `notif-screen-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                fetchNotifications();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchNotifications]);

    const onRefresh = useCallback(async () => {
        await fetchNotifications(true);
    }, [fetchNotifications]);

    const markAsRead = async (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    };

    const markAllAsRead = async () => {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        if (!userId) return;
        let query = supabase.from('notifications').update({ is_read: true });
        if (farmId) {
            query = query.or(`user_id.eq.${userId},farm_id.eq.${farmId}`);
        } else {
            query = query.eq('user_id', userId);
        }
        await query;
    };

    const getIconDetails = (item: AppNotification) => {
        const text = `${item.title} ${item.message}`.toLowerCase();

        // 1. Weight alerts (use exact same colors & icons like in the logs: overweight=error, underweight=warning, normal=primary)
        if (item.category === 'weight_alert' || text.includes('weight') || text.includes('weigh')) {
            if (text.includes('reminder') || text.includes('scheduled')) {
                return { customComponent: 'aniweigh', color: colors.primary, bgColor: colors.primary + '18' };
            }
            if (text.includes('underweight') || text.includes('low weight')) {
                return { name: 'arrow-downward', color: colors.warning, bgColor: colors.warning + '18' };
            }
            if (text.includes('overweight') || text.includes('high weight')) {
                return { name: 'arrow-upward', color: colors.error, bgColor: colors.error + '18' };
            }
            if (text.includes('normal') || text.includes('good')) {
                return { name: 'check', color: colors.primary, bgColor: colors.primary + '18' };
            }
            return { customComponent: 'aniweigh', color: colors.primary, bgColor: colors.primary + '18' };
        }

        // 2. Health & Vaccines
        if (item.category === 'health_alert' || text.includes('health') || text.includes('vaccin') || text.includes('mortality') || text.includes('deceased')) {
            if (text.includes('vaccin')) {
                return { name: 'vaccines', color: '#27AE60', bgColor: '#27AE6018' };
            }
            if (text.includes('mortality') || text.includes('deceased')) {
                return { name: 'warning', color: colors.error, bgColor: colors.error + '18' };
            }
            return { name: 'medical-services', color: '#27AE60', bgColor: '#27AE6018' };
        }

        // 3. Feeds & Dispense (use AniFeed icon for feeding reminders and feeds)
        if (item.category === 'feed_alert' || text.includes('feed') || text.includes('dispense')) {
            if (text.includes('expired') || text.includes('failed') || text.includes('error')) {
                return { name: 'error-outline', color: colors.error, bgColor: colors.error + '18' };
            }
            if (text.includes('low') || text.includes('expiring')) {
                return { customComponent: 'anifeed', color: colors.warning, bgColor: colors.warning + '18' };
            }
            return { customComponent: 'anifeed', color: colors.secondary, bgColor: colors.secondary + '18' };
        }

        // 4. Devices
        if (item.category === 'device_alert' || text.includes('device') || text.includes('online') || text.includes('offline')) {
            if (item.type === 'alert' || text.includes('offline')) {
                return { name: 'phonelink-erase', color: colors.error, bgColor: colors.error + '18' };
            }
            if (item.type === 'success' || text.includes('online')) {
                return { name: 'devices', color: '#10B981', bgColor: '#10B98118' };
            }
            return { name: 'devices', color: colors.primary, bgColor: colors.primary + '18' };
        }

        switch (item.type) {
            case 'alert':   return { name: 'error',         color: colors.error,   bgColor: colors.error   + '18' };
            case 'warning': return { name: 'warning-amber', color: colors.warning, bgColor: colors.warning + '18' };
            case 'success': return { name: 'check-circle',  color: '#10B981',      bgColor: '#10B98118' };
            default:        return { name: 'info',          color: colors.primary, bgColor: colors.primary + '18' };
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const handlePressItem = (item: AppNotification) => {
        markAsRead(item.id);
        const route = resolveNotificationRoute(item.actionUrl, item.category, item.title, item.message);
        if (route) {
            try {
                router.push(route as any);
            } catch (err) {
                console.warn('[NotificationScreen] Routing failed:', err);
            }
        }
    };

    const renderItem = ({ item, index }: { item: AppNotification; index: number }) => {
        const iconInfo = getIconDetails(item);
        const isFirst = index === 0;
        const isLast = index === notifications.length - 1;

        return (
            <TouchableOpacity
                style={[
                    notificationStyles.notificationItem,
                    {
                        backgroundColor: item.isRead ? colors.surface : colors.primary + '08',
                        borderTopLeftRadius: isFirst ? 16 : 0,
                        borderTopRightRadius: isFirst ? 16 : 0,
                        borderBottomLeftRadius: isLast ? 16 : 0,
                        borderBottomRightRadius: isLast ? 16 : 0,
                        borderTopWidth: isFirst ? 1 : 0,
                        borderBottomWidth: isLast ? 1 : 0,
                        borderLeftWidth: 1,
                        borderRightWidth: 1,
                        borderColor: colors.stroke,
                    },
                ]}
                activeOpacity={0.7}
                onPress={() => handlePressItem(item)}
            >
                <View style={[notificationStyles.iconBox, { backgroundColor: iconInfo.bgColor }]}>
                    {iconInfo.customComponent === 'aniweigh' ? (
                        <AniWeighIcon size={19} />
                    ) : iconInfo.customComponent === 'anifeed' ? (
                        <AniFeedIcon size={19} />
                    ) : (
                        <MaterialIcons name={iconInfo.name as any} size={20} color={iconInfo.color} />
                    )}
                </View>
                <View style={notificationStyles.contentContainer}>
                    <View style={notificationStyles.titleRow}>
                        <Text style={[textStyles.body, { color: colors.text, fontSize: 13.5, fontFamily: item.isRead ? 'Poppins-Medium' : 'Poppins-SemiBold', flex: 1, marginRight: 8 }]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Regular' }]}>{item.time}</Text>
                            {!item.isRead && (
                                <View style={notificationStyles.unreadDot} />
                            )}
                        </View>
                    </View>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12.5, lineHeight: 18, marginTop: 1, fontFamily: 'Poppins-Regular' }]} numberOfLines={2}>
                        {item.message}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={notificationStyles.safeArea}>
            <View style={notificationStyles.container}>
                <View style={notificationStyles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Notifications
                    </Text>
                    <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
                        {unreadCount > 0 && (
                            <TouchableOpacity onPress={markAllAsRead} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialIcons name="done-all" size={24} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {isLoading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
                ) : (
                    <FlatList
                        data={notifications}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => (
                            <View style={{ backgroundColor: colors.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.stroke }}>
                                <View style={notificationStyles.divider} />
                            </View>
                        )}
                        contentContainerStyle={notificationStyles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={colors.primary}
                                colors={[colors.primary]}
                            />
                        }
                        ListEmptyComponent={
                            <View style={notificationStyles.emptyContainer}>
                                <MaterialIcons name="notifications-off" size={48} color={colors.textGrey} />
                                <Text style={[textStyles.h2, { color: colors.text, marginTop: 16 }]}>No notifications yet</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 8 }]}>
                                    You're all caught up! New alerts and messages will appear here.
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    FlatList,
    TouchableOpacity,
    View,
    ActivityIndicator,
    RefreshControl,
    Animated,
    Easing,
    Alert,
    Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
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
import { sortByPriority, canUserViewNotification, createNotification } from '@/lib/notify';

interface AppNotification {
    id: string;
    title: string;
    message: string;
    time: string;
    shortTime: string;
    type: 'alert' | 'info' | 'warning' | 'success';
    category: string | null;
    actionUrl?: string | null;
    created_at: string;
    isRead: boolean;
}

function formatNotificationDate(ts: string): { full: string; short: string } {
    if (!ts) return { full: '', short: '' };
    const d = new Date(ts);
    if (isNaN(d.getTime())) return { full: '', short: '' };
    const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;

    return {
        full: `${month} ${day}, ${year} at ${hour12}:${minutes} ${ampm}`,
        short: `${month} ${day}`,
    };
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
    let raw = (actionUrl || '').trim();

    if (raw) {
        if (!raw.startsWith('/')) raw = `/${raw}`;
        const [path, queryString] = raw.split('?');
        const query = queryString ? `?${queryString}` : '';

        // Analytics routes
        if (path.includes('Trajectory') || path.includes('trajectory') || path.includes('GrowthReport') || path.includes('growth')) {
            return `/(analytics)/GrowthReportScreen${query}`;
        }
        if (path.includes('Prediction') || path.includes('prediction')) {
            return `/(analytics)/PredictionReportScreen${query}`;
        }
        if (path.includes('FeedReport') || path.includes('feed_report')) {
            return `/(analytics)/FeedReportScreen${query}`;
        }
        if (path.includes('HealthReport') || path.includes('health_report')) {
            return `/(analytics)/HealthReportScreen${query}`;
        }
        if (path.includes('AnalyticsScreen') || path === '/Analytics' || path === '/(analytics)') {
            return `/(analytics)/AnalyticsScreen${query}`;
        }

        // Animal & Health routes
        if (path.includes('AnimalDetails') || path.includes('animal_details') || path.includes('batch')) {
            return `/(animals)/AnimalDetails${query}`;
        }
        if (path.includes('Mortality') || path.includes('mortality')) {
            return `/(animals)/MortalityRecordsScreen${query}`;
        }
        if (path.includes('HealthRecords') || path.includes('health_records')) {
            return `/(animals)/HealthRecordsScreen${query}`;
        }
        if (path.includes('AnimalsScreen') || path === '/Animals' || path === '/(animals)') {
            return `/(animals)/AnimalsScreen${query}`;
        }
        if (path.includes('Vaccine') || path.includes('vaccin')) {
            return `/(health)/VaccineScreen${query}`;
        }

        // Device & Weighing/Feeding routes
        if (path.includes('AniWeigh') || path.includes('aniweigh')) {
            return `/(devices)/AniWeighScreen${query}`;
        }
        if (path.includes('AniFeed') || path.includes('anifeed')) {
            return `/(devices)/AniFeedScreen${query}`;
        }
        if (path.includes('DispenseRecords') || path.includes('dispense')) {
            return `/(devices)/DispenseRecordsScreen${query}`;
        }
        if (path.includes('ManageFeeds') || path.includes('feeds')) {
            return `/(devices)/ManageFeedsScreen${query}`;
        }
        if (path.includes('ManageHousings') || path.includes('housings')) {
            return `/(devices)/ManageHousingsScreen${query}`;
        }
        if (path.includes('Segregation') || path.includes('segregation')) {
            return `/(devices)/SegregationRecordsScreen${query}`;
        }
        if (path.includes('DeviceSettings') || path.includes('device_settings')) {
            return `/(devices)/DeviceSettingsScreen${query}`;
        }
        if (path.includes('RecentLogs') || path.includes('recent_logs') || path.includes('logs')) {
            return `/(devices)/RecentLogsScreen${query}`;
        }
        if (path.includes('DevicesScreen') || path === '/Devices' || path === '/(devices)') {
            return `/(devices)/DevicesScreen${query}`;
        }
        if (path.includes('SessionReport') || path.includes('session_report')) {
            return `/(weighing)/SessionReportScreen${query}`;
        }
        if (path.includes('WeighingSessions') || path.includes('weighing_sessions')) {
            return `/(weighing)/WeighingSessionsScreen${query}`;
        }

        // Guide, AI & Dashboard routes
        if (path.includes('Guide') || path.includes('guide') || path.includes('roadmap')) {
            return `/(guide)/GuideScreen${query}`;
        }
        if (path.includes('AI') || path.includes('ai') || path.includes('AniBot') || path.includes('chat')) {
            return `/(ai)/AIAssistantScreen${query}`;
        }
        if (path.includes('VetDashboard') || path.includes('vet')) {
            return `/(dashboard)/VetDashboardScreen${query}`;
        }
        if (path.includes('HomeScreen') || path === '/Home' || path === '/home') {
            return `/(dashboard)/HomeScreen${query}`;
        }
        if (path.includes('NotificationScreen') || path.includes('notifications')) {
            return `/(dashboard)/NotificationScreen${query}`;
        }

        // Settings routes
        if (path.includes('FarmsScreen') || path.includes('farms')) {
            return `/(settings)/FarmsScreen${query}`;
        }
        if (path.includes('InviteCodesScreen') || path.includes('invite')) {
            return `/(settings)/InviteCodesScreen${query}`;
        }
        if (path.includes('SettingsScreen') || path.includes('settings')) {
            return `/(settings)/SettingsScreen${query}`;
        }

        return raw;
    }

    // Semantic fallback routing
    const text = `${title} ${message}`.toLowerCase();
    if (category === 'weight_alert' || text.includes('weigh') || text.includes('weight')) {
        if (text.includes('session') || text.includes('finished') || text.includes('complete')) {
            return '/(weighing)/WeighingSessionsScreen';
        }
        return '/(devices)/RecentLogsScreen';
    }
    if (category === 'feed_alert' || text.includes('feed') || text.includes('dispense')) {
        if (text.includes('dispense')) return '/(devices)/DispenseRecordsScreen';
        return '/(devices)/ManageFeedsScreen';
    }
    if (category === 'health_alert' || text.includes('vaccin') || text.includes('mortality') || text.includes('health') || text.includes('deceased') || text.includes('vet')) {
        if (text.includes('vaccin')) return '/(health)/VaccineScreen';
        if (text.includes('mortality')) return '/(animals)/MortalityRecordsScreen';
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
    if (category === 'ai_suggestion' || text.includes('insight') || text.includes('ai') || text.includes('guide') || text.includes('briefing') || text.includes('trajectory') || text.includes('growth')) {
        if (text.includes('growth') || text.includes('trajectory') || text.includes('analytic')) return '/(analytics)/GrowthReportScreen';
        if (text.includes('guide') || text.includes('briefing') || text.includes('task')) return '/(guide)/GuideScreen';
        return '/(ai)/AIAssistantScreen';
    }

    return '/(dashboard)/HomeScreen';
}

// ── Smooth Slide Accordion Notification Item ────────────────────────────
interface NotificationItemProps {
    item: AppNotification;
    isFirst: boolean;
    isLast: boolean;
    isExpanded: boolean;
    onToggle: (item: AppNotification) => void;
    onNavigate: (item: AppNotification) => void;
    iconInfo: any;
    colors: any;
    textStyles: any;
    notificationStyles: any;
}

const ExpandableNotificationItem: React.FC<NotificationItemProps> = ({
    item,
    isFirst,
    isLast,
    isExpanded,
    onToggle,
    onNavigate,
    iconInfo,
    colors,
    textStyles,
    notificationStyles,
}) => {
    const animVal = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(animVal, {
            toValue: isExpanded ? 1 : 0,
            duration: 260,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: false,
        }).start();
    }, [isExpanded, animVal]);

    const rotateChevron = animVal.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const slideY = animVal.interpolate({
        inputRange: [0, 1],
        outputRange: [-8, 0],
    });

    const extendedOpacity = animVal.interpolate({
        inputRange: [0, 0.35, 1],
        outputRange: [0, 0, 1],
    });

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
                    borderColor: isExpanded ? colors.primary + '60' : colors.stroke,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                },
            ]}
            activeOpacity={0.85}
            onPress={() => onToggle(item)}
        >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={[notificationStyles.iconBox, { backgroundColor: iconInfo.bgColor, marginTop: 2 }]}>
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
                        <Text
                            style={[
                                textStyles.body,
                                {
                                    color: colors.text,
                                    fontSize: 13.5,
                                    fontFamily: item.isRead ? 'Poppins-Medium' : 'Poppins-SemiBold',
                                    flex: 1,
                                    marginRight: 8,
                                },
                            ]}
                            numberOfLines={isExpanded ? undefined : 1}
                        >
                            {item.title}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text
                                style={[
                                    textStyles.label,
                                    {
                                        color: colors.textGrey,
                                        fontSize: 11,
                                        fontFamily: 'Poppins-Regular',
                                        marginRight: 4,
                                    },
                                ]}
                            >
                                {isExpanded ? '' : item.shortTime}
                            </Text>
                            {!item.isRead && <View style={notificationStyles.unreadDot} />}
                            <Animated.View style={{ transform: [{ rotate: rotateChevron }], marginLeft: 4 }}>
                                <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.textGrey} />
                            </Animated.View>
                        </View>
                    </View>

                    {/* Message content */}
                    <Text
                        style={[
                            textStyles.body,
                            {
                                color: isExpanded ? colors.text : colors.textGrey,
                                fontSize: 12.5,
                                lineHeight: 19,
                                marginTop: 4,
                                fontFamily: 'Poppins-Regular',
                            },
                        ]}
                        numberOfLines={isExpanded ? undefined : 2}
                    >
                        {item.message}
                    </Text>

                    {/* Smooth sliding extended details */}
                    {isExpanded && (
                        <Animated.View
                            style={{
                                opacity: extendedOpacity,
                                transform: [{ translateY: slideY }],
                                marginTop: 12,
                                paddingTop: 10,
                                borderTopWidth: 1,
                                borderTopColor: colors.stroke,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>
                                {item.time}
                            </Text>

                            <TouchableOpacity
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: colors.primary,
                                    paddingVertical: 6,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    gap: 4,
                                }}
                                activeOpacity={0.8}
                                onPress={() => onNavigate(item)}
                            >
                                <Text
                                    style={[
                                        textStyles.body,
                                        { color: '#FFFFFF', fontSize: 12, fontFamily: 'Poppins-Medium' },
                                    ]}
                                >
                                    View Page
                                </Text>
                                <MaterialIcons name="arrow-forward" size={14} color="#FFFFFF" />
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
};

export default function NotificationScreen() {
    const router = useRouter();
    const notificationStyles = useNotificationStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const { profile, hasPermission, role } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const userId = (profile as any)?.uid || (profile as any)?.id;

    const fetchNotifications = useCallback(
        async (isPullToRefresh = false, isSilent = false) => {
            if (!userId) {
                setIsLoading(false);
                setRefreshing(false);
                return;
            }
            if (isPullToRefresh) {
                setRefreshing(true);
            } else if (!isSilent && notifications.length === 0) {
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

                const filteredRows = (data ?? []).filter(n =>
                    canUserViewNotification(n.category, n.action_url, hasPermission, role)
                );

                setNotifications(
                    sortByPriority(filteredRows).map(n => {
                        const dateFormatted = formatNotificationDate(n.created_at);
                        return {
                            id: n.id,
                            title: n.title,
                            message: n.message,
                            time: dateFormatted.full,
                            shortTime: dateFormatted.short,
                            type: mapType(n.type),
                            category: n.category,
                            actionUrl: n.action_url,
                            created_at: n.created_at,
                            isRead: n.is_read,
                        };
                    })
                );
            } catch (err) {
                console.error('[Notifications] fetch error:', err);
            } finally {
                setIsLoading(false);
                setRefreshing(false);
            }
        },
        [userId, farmId, activeFarmIds, hasPermission, role, notifications.length]
    );

    useFocusEffect(
        useCallback(() => {
            fetchNotifications(false, notifications.length > 0);
        }, [fetchNotifications, notifications.length])
    );

    // Dynamic Realtime Postgres changes listener (silent background fetch)
    useEffect(() => {
        const channelName = `notif-screen-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                fetchNotifications(false, true);
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
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
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

    const toggleExpand = (item: AppNotification) => {
        if (expandedId === item.id) {
            setExpandedId(null);
        } else {
            markAsRead(item.id);
            setExpandedId(item.id);
        }
    };

    const handleNavigate = (item: AppNotification) => {
        markAsRead(item.id);
        const route = resolveNotificationRoute(item.actionUrl, item.category, item.title, item.message);
        if (route) {
            try {
                router.push(route as any);
            } catch (err) {
                console.warn('[NotificationScreen] Routing failed, fallback to Home:', err);
                try {
                    router.push('/(dashboard)/HomeScreen');
                } catch {
                    /* best-effort */
                }
            }
        }
    };

    const getIconDetails = (item: AppNotification) => {
        const text = `${item.title} ${item.message}`.toLowerCase();

        // 1. Weight alerts
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
            if (text.includes('complete') || text.includes('finish') || text.includes('normal')) {
                return { customComponent: 'aniweigh', color: colors.primary, bgColor: colors.primary + '18' };
            }
            return { customComponent: 'aniweigh', color: colors.primary, bgColor: colors.primary + '18' };
        }

        // 2. Health & Vaccines & Mortality
        if (
            item.category === 'health_alert' ||
            text.includes('health') ||
            text.includes('vaccin') ||
            text.includes('mortality') ||
            text.includes('deceased')
        ) {
            if (text.includes('vaccin')) {
                return { name: 'vaccines', color: '#27AE60', bgColor: '#27AE6018' };
            }
            if (text.includes('mortality') || text.includes('deceased')) {
                return { name: 'warning', color: colors.error, bgColor: colors.error + '18' };
            }
            return { name: 'medical-services', color: '#27AE60', bgColor: '#27AE6018' };
        }

        // 3. Feeds & Dispense
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
            if (item.type === 'success' || text.includes('online') || text.includes('connected')) {
                return { name: 'devices', color: '#10B981', bgColor: '#10B98118' };
            }
            return { name: 'devices', color: colors.primary, bgColor: colors.primary + '18' };
        }

        // 5. Guide / Briefing / Analytics
        if (
            item.category === 'ai_suggestion' ||
            text.includes('briefing') ||
            text.includes('guide') ||
            text.includes('analytic') ||
            text.includes('growth')
        ) {
            if (text.includes('analytic') || text.includes('growth')) {
                return { name: 'insights', color: '#3B82F6', bgColor: '#3B82F618' };
            }
            return { name: 'menu-book', color: colors.primary, bgColor: colors.primary + '18' };
        }

        switch (item.type) {
            case 'alert':
                return { name: 'error', color: colors.error, bgColor: colors.error + '18' };
            case 'warning':
                return { name: 'warning-amber', color: colors.warning, bgColor: colors.warning + '18' };
            case 'success':
                return { name: 'check-circle', color: '#10B981', bgColor: '#10B98118' };
            default:
                return { name: 'info', color: colors.primary, bgColor: colors.primary + '18' };
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const renderItem = ({ item, index }: { item: AppNotification; index: number }) => {
        const iconInfo = getIconDetails(item);
        const isFirst = index === 0;
        const isLast = index === notifications.length - 1;
        const isExpanded = expandedId === item.id;

        return (
            <ExpandableNotificationItem
                item={item}
                isFirst={isFirst}
                isLast={isLast}
                isExpanded={isExpanded}
                onToggle={toggleExpand}
                onNavigate={handleNavigate}
                iconInfo={iconInfo}
                colors={colors}
                textStyles={textStyles}
                notificationStyles={notificationStyles}
            />
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
                    <View style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                        {unreadCount > 0 ? (
                            <TouchableOpacity onPress={markAllAsRead} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialIcons name="done-all" size={24} color={colors.primary} />
                            </TouchableOpacity>
                        ) : null}
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
                                    You are all caught up. New alerts and messages will appear here.
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

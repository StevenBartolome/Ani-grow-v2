import { MaterialIcons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useNotificationStyles } from '@/styles/notificationStyles';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface AppNotification {
    id: string;
    title: string;
    message: string;
    time: string;
    type: 'alert' | 'info' | 'warning' | 'success';
    isRead: boolean;
}

function formatTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return new Date(ts).toLocaleDateString();
}

function mapType(type: string): AppNotification['type'] {
    if (type === 'error') return 'alert';
    if (type === 'warning' || type === 'success' || type === 'info') return type;
    return 'info';
}

export default function NotificationScreen() {
    const notificationStyles = useNotificationStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const { profile } = useAuth();

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const farmId = (profile as any)?.farm_id;
    const userId = (profile as any)?.uid || (profile as any)?.id;

    const fetchNotifications = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            let query = supabase
                .from('notifications')
                .select('id, title, message, type, is_read, created_at')
                .order('created_at', { ascending: false });

            if (farmId) {
                query = query.or(`user_id.eq.${userId},farm_id.eq.${farmId}`);
            } else {
                query = query.eq('user_id', userId);
            }

            const { data, error } = await query;
            if (error) throw error;

            setNotifications(
                (data ?? []).map(n => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    time: formatTime(n.created_at),
                    type: mapType(n.type),
                    isRead: n.is_read,
                }))
            );
        } catch (err) {
            console.error('[Notifications] fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId, farmId]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

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

    const getIconDetails = (type: AppNotification['type']) => {
        switch (type) {
            case 'alert':   return { name: 'error',          color: colors.error,   bgColor: colors.error   + '1A' };
            case 'warning': return { name: 'warning-amber',  color: colors.warning, bgColor: colors.warning + '1A' };
            case 'success': return { name: 'check-circle',   color: colors.success, bgColor: colors.success + '1A' };
            default:        return { name: 'info',           color: colors.info,    bgColor: colors.info    + '1A' };
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const renderItem = ({ item }: { item: AppNotification }) => {
        const { name, color, bgColor } = getIconDetails(item.type);
        return (
            <TouchableOpacity
                style={[
                    notificationStyles.notificationCard,
                    {
                        backgroundColor: item.isRead ? colors.surface : colors.primary + '0A',
                        borderColor: item.isRead ? colors.stroke : colors.primary + '30',
                    }
                ]}
                activeOpacity={0.7}
                onPress={() => markAsRead(item.id)}
            >
                <View style={[notificationStyles.iconBox, { backgroundColor: bgColor }]}>
                    <MaterialIcons name={name as any} size={24} color={color} />
                </View>
                <View style={notificationStyles.contentContainer}>
                    <View style={notificationStyles.titleRow}>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 16, flex: 1, marginRight: 8 }]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>{item.time}</Text>
                            {!item.isRead && (
                                <View style={[notificationStyles.unreadDot, { backgroundColor: colors.primary }]} />
                            )}
                        </View>
                    </View>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, lineHeight: 20 }]} numberOfLines={2}>
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
                        contentContainerStyle={notificationStyles.listContent}
                        showsVerticalScrollIndicator={false}
                        onRefresh={fetchNotifications}
                        refreshing={isLoading}
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

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useNotificationStyles } from '@/styles/notificationStyles';

interface AppNotification {
    id: string;
    title: string;
    message: string;
    time: string;
    type: 'alert' | 'info' | 'warning' | 'success';
    isRead: boolean;
}

const INITIAL_NOTIFICATIONS: AppNotification[] = [
    {
        id: '1',
        title: 'Low Feed Alert',
        message: 'Pig Housing 2 Feeder is running low on feed. Less than 10% remaining.',
        time: 'Just now',
        type: 'warning',
        isRead: false,
    },
    {
        id: '2',
        title: 'Device Offline',
        message: 'AniWeigh Unit 03 has lost connection. Please check power and network.',
        time: '12 mins ago',
        type: 'alert',
        isRead: false,
    },
    {
        id: '3',
        title: 'Harvest Target Reached',
        message: 'Pig Batch #3 has reached the 90kg target weight.',
        time: '1 hour ago',
        type: 'success',
        isRead: false,
    },
    {
        id: '4',
        title: 'System Update Completed',
        message: 'Ani-Grow app has been successfully updated to version 2.1.',
        time: '2 hours ago',
        type: 'info',
        isRead: true,
    },
    {
        id: '5',
        title: 'Daily Report Available',
        message: 'Your farm activity report for yesterday is now ready to view.',
        time: 'Yesterday',
        type: 'info',
        isRead: true,
    },
    {
        id: '6',
        title: 'New Device Registered',
        message: 'AniFeed Unit 06 was successfully registered to Chicken Housing 1.',
        time: 'Yesterday',
        type: 'success',
        isRead: true,
    },
    {
        id: '7',
        title: 'Offline Warning',
        message: 'AniWeigh Unit 01 experienced a brief dropout but is back online.',
        time: '2 days ago',
        type: 'warning',
        isRead: true,
    }
];

export default function NotificationScreen() {
    const notificationStyles = useNotificationStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(notif => ({ ...notif, isRead: true })));
    };

    const markAsRead = (id: string) => {
        setNotifications(prev => prev.map(notif => 
            notif.id === id ? { ...notif, isRead: true } : notif
        ));
    };

    const getIconDetails = (type: AppNotification['type']) => {
        switch (type) {
            case 'alert': return { name: 'error', color: colors.error, bgColor: colors.error + '1A' };
            case 'warning': return { name: 'warning-amber', color: colors.warning, bgColor: colors.warning + '1A' };
            case 'success': return { name: 'check-circle', color: colors.success, bgColor: colors.success + '1A' };
            case 'info': default: return { name: 'info', color: colors.info, bgColor: colors.info + '1A' };
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
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>
                                {item.time}
                            </Text>
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
                
                {/* Header */}
                <View style={notificationStyles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton onPress={() => router.back()} />
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

                {/* List Container */}
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={notificationStyles.listContent}
                    showsVerticalScrollIndicator={false}
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

            </View>
        </SafeAreaView>
    );
}

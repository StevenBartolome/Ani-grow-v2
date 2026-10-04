import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { FarmSwitcherDrawer } from '@/components/FarmSwitcherDrawer';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { supabase } from '@/lib/supabase';
import { canUserViewNotification } from '@/lib/notify';

const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

let cachedUnreadNotifCount = 0;
let cachedFarmNames: Record<string, string> = {};

export const Header: React.FC = () => {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);

    const {
        activeFarmIds,
        managedFarms,
        isMultiFarm,
    } = useFarmFilter();

    const { hasPermission, role } = useAuth();

    // Derive farmName synchronously on frame 0 so there is no layout jump or empty text delay
    const initialFarmName = useMemo(() => {
        if (!activeFarmIds.length) return '';
        if (activeFarmIds.length === 1) {
            const found = managedFarms.find(f => f.id === activeFarmIds[0]);
            if (found?.name) return found.name;
            if (cachedFarmNames[activeFarmIds[0]]) return cachedFarmNames[activeFarmIds[0]];
            return '';
        }
        return `${activeFarmIds.length} Farms`;
    }, [activeFarmIds, managedFarms]);

    const [farmName, setFarmName] = useState(initialFarmName);
    const [unreadNotifCount, setUnreadNotifCount] = useState(cachedUnreadNotifCount);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

    useEffect(() => {
        if (initialFarmName) {
            setFarmName(initialFarmName);
        }
    }, [initialFarmName]);

    const fetchHeaderData = useCallback(async () => {
        if (!activeFarmIds.length) return;
        try {
            const isSingle = activeFarmIds.length === 1;
            const needsFarmQuery = isSingle && !managedFarms.find(f => f.id === activeFarmIds[0])?.name;
            const [farmRes, notifRes] = await Promise.all([
                needsFarmQuery
                    ? supabase.from('farms').select('name').eq('id', activeFarmIds[0]).single()
                    : Promise.resolve({ data: null, error: null }),
                supabase
                    .from('notifications')
                    .select('id, category, action_url')
                    .in('farm_id', activeFarmIds)
                    .eq('is_read', false),
            ]);

            if (isSingle && (farmRes as any).data?.name) {
                cachedFarmNames[activeFarmIds[0]] = (farmRes as any).data.name;
                setFarmName((farmRes as any).data.name);
            } else if (!isSingle && managedFarms.length > 0) {
                setFarmName(`${activeFarmIds.length} Farms`);
            }

            const unreadItems = (notifRes.data ?? []).filter((n: any) =>
                canUserViewNotification(n.category, n.action_url, hasPermission, role)
            );
            const count = unreadItems.length;
            cachedUnreadNotifCount = count;
            setUnreadNotifCount(count);
        } catch (err) {
            console.error('[Header] fetchHeaderData error:', err);
        }
    }, [activeFarmIds, managedFarms, hasPermission, role]);

    useEffect(() => {
        fetchHeaderData();

        const channelName = `header-notif-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                fetchHeaderData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchHeaderData]);

    return (
        <>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: hPad,
                    paddingTop: 16,
                    paddingBottom: 16,
                    minHeight: 68,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                        style={{ marginRight: 10, width: 36, height: 36, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => setProfileDrawerOpen(true)}
                        activeOpacity={0.8}
                    >
                        <MaterialIcons name="menu" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Image
                        source={require('../../assets/branding/anigrow_logo.svg')}
                        style={{ width: 36, height: 36, marginRight: 10 }}
                        contentFit="contain"
                    />
                    <View style={{ minHeight: 40, justifyContent: 'center' }}>
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 24 }]}>
                            Ani-Grow
                        </Text>
                        <TouchableOpacity
                            onPress={() => isMultiFarm && setSwitcherOpen(true)}
                            disabled={!isMultiFarm}
                            activeOpacity={0.62}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1, minHeight: 16 }}
                        >
                            <Text translate={false} style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>
                                {farmName || (managedFarms.length > 0 ? managedFarms[0]?.name : '')}
                            </Text>
                            {isMultiFarm && (
                                <MaterialIcons name="arrow-drop-down" size={16} color={colors.textGrey} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <TouchableOpacity
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.surface,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: colors.stroke,
                        }}
                        onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                    >
                        <View style={{ position: 'relative' }}>
                            <MaterialIcons name="notifications" size={24} color={colors.icon} />
                            {unreadNotifCount > 0 && (
                                <View style={{
                                    position: 'absolute', top: -3, right: -3,
                                    backgroundColor: '#EF4444', minWidth: 16, height: 16,
                                    borderRadius: 8, justifyContent: 'center', alignItems: 'center',
                                    paddingHorizontal: 3, borderWidth: 2, borderColor: colors.surface,
                                }}>
                                    <Text style={{ color: '#FFF', fontSize: 9, fontFamily: 'Poppins-Bold' }}>
                                        {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            <FarmSwitcherDrawer visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
            <ProfileDrawer
                visible={profileDrawerOpen}
                onClose={() => setProfileDrawerOpen(false)}
                activeFarmName={farmName || (managedFarms.length > 0 ? managedFarms[0]?.name : '')}
            />
        </>
    );
};

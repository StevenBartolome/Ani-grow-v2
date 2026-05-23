import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { FarmSwitcherDrawer } from '@/components/FarmSwitcherDrawer';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { supabase } from '@/lib/supabase';

const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

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

    const [farmName, setFarmName] = useState('your farm');
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

    const fetchHeaderData = useCallback(async () => {
        if (!activeFarmIds.length) return;
        try {
            const isSingle = activeFarmIds.length === 1;
            const [farmRes, notifRes] = await Promise.all([
                isSingle
                    ? supabase.from('farms').select('name').eq('id', activeFarmIds[0]).single()
                    : Promise.resolve({ data: null, error: null }),
                supabase
                    .from('notifications')
                    .select('id', { count: 'exact' })
                    .in('farm_id', activeFarmIds)
                    .eq('is_read', false),
            ]);

            if (isSingle && (farmRes as any).data?.name) {
                setFarmName((farmRes as any).data.name);
            } else if (!isSingle && managedFarms.length > 0) {
                setFarmName(`${activeFarmIds.length} Farms`);
            }

            if (notifRes.count !== null && notifRes.count !== undefined) {
                setUnreadNotifCount(notifRes.count);
            } else if (notifRes.data) {
                setUnreadNotifCount(notifRes.data.length);
            }
        } catch (err) {
            console.error('[Header] fetchHeaderData error:', err);
        }
    }, [activeFarmIds, managedFarms]);

    useEffect(() => {
        fetchHeaderData();
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
                    backgroundColor: colors.surface,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.stroke,
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
                    <View>
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 24 }]}>
                            Ani-Grow
                        </Text>
                        <TouchableOpacity
                            onPress={() => isMultiFarm && setSwitcherOpen(true)}
                            disabled={!isMultiFarm}
                            activeOpacity={0.62}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 }}
                        >
                            <Text translate={false} style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>
                                {farmName}
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
                            backgroundColor: colors.bgLight,
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
                activeFarmName={farmName}
            />
        </>
    );
};

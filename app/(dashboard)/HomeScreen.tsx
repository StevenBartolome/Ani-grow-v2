import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useHomeStyles } from '@/styles/homeStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';

export default function HomeScreen() {
    const { profile } = useAuth();
    const homeStyles = useHomeStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    const [farmName, setFarmName] = useState('your farm');
    const userName = profile?.displayName || ((profile as any)?.firstName ? `${(profile as any).firstName} ${(profile as any).lastName}` : "User"); // Dynamic user name fallback
    const unreadNotifCount = 3; // Mock unread count

    useEffect(() => {
        // Mock farm name if available in profile
        if (profile?.farmId) {
            setFarmName('Ani-Grow Farm'); // Mock fallback
        }
    }, [profile?.farmId]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Good morning';
        if (hour >= 12 && hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <SafeAreaView style={homeStyles.safeArea}>
            <View style={homeStyles.container}>

                {/* Header Row */}
                <View style={homeStyles.header}>
                    {/* Left: Logo and Brand */}
                    <View style={homeStyles.headerLeft}>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={homeStyles.logo}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 28 }]}>
                            Ani-Grow
                        </Text>
                    </View>

                    {/* Right: Notification and Profile */}
                    <View style={homeStyles.headerRight}>
                        <TouchableOpacity
                            style={homeStyles.iconButton}
                            onPress={() => router.push('/(dashboard)/NotificationScreen' as any)}
                        >
                            <View style={{ position: 'relative' }}>
                                <MaterialIcons name="notifications" size={26} color={colors.icon} />
                                {unreadNotifCount > 0 && (
                                    <View style={{
                                        position: 'absolute',
                                        top: -2,
                                        right: -2,
                                        backgroundColor: '#EF4444',
                                        minWidth: 18,
                                        height: 18,
                                        borderRadius: 9,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        paddingHorizontal: 4,
                                        borderWidth: 2,
                                        borderColor: colors.bgLight
                                    }}>
                                        <Text style={{ color: '#FFF', fontSize: 10, fontFamily: 'Poppins-Bold' }}>
                                            {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={homeStyles.profileIcon} onPress={() => router.push('/(settings)/SettingsScreen' as any)}>
                            <Text style={homeStyles.profileInitial}>{userName.charAt(0)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Scrollable Main Content */}
                <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                    {/* Greeting Section */}
                    <View style={homeStyles.greetingContainer}>
                        <Text style={[textStyles.h1, { fontSize: 28, color: colors.text, lineHeight: 34 }]}>
                            {getGreeting()},
                        </Text>
                        <Text style={[textStyles.h1, { fontSize: 28, color: colors.primary, lineHeight: 34 }]}>
                            {userName}!
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8 }]}>
                            Here's an overview of {farmName} today.
                        </Text>
                    </View>

                    <View style={homeStyles.content}>

                        {/* Info Banner */}
                        <View style={[homeStyles.infoBanner, { backgroundColor: colors.primary }]}>
                            <View style={homeStyles.infoBannerIconBox}>
                                <MaterialIcons name="tips-and-updates" size={22} color="#fff" />
                            </View>
                            <View style={{ marginLeft: 16, flex: 1 }}>
                                <Text style={[textStyles.h2, { color: '#fff', fontSize: 16 }]}>
                                    Harvest Approaches
                                </Text>
                                <Text style={[textStyles.body, { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 4 }]}>
                                    Your Pig Batch #3 is near 90kg target weight.
                                </Text>
                            </View>
                        </View>

                        {/* Section: Important Alerts */}
                        <Text style={[homeStyles.sectionTitle, { color: colors.text }]}>Important Alerts</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={homeStyles.alertCarousel}
                        >
                            <View style={[homeStyles.alertChipCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                <View style={[homeStyles.alertChipIconBox, { backgroundColor: '#F97316' + '1A' }]}>
                                    <MaterialIcons name="grain" size={20} color="#F97316" />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 14, marginTop: 12 }]}>
                                    Low Feed
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 4 }]} numberOfLines={2}>
                                    Pig Housing 2 Feeder
                                </Text>
                            </View>

                            <View style={[homeStyles.alertChipCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                <View style={[homeStyles.alertChipIconBox, { backgroundColor: '#EF4444' + '1A' }]}>
                                    <MaterialIcons name="wifi-off" size={20} color="#EF4444" />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 14, marginTop: 12 }]}>
                                    Offline
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 4 }]} numberOfLines={2}>
                                    Feeder Unit 03
                                </Text>
                            </View>
                        </ScrollView>

                        {/* Section: Farm State */}
                        <View style={homeStyles.sectionHeaderRow}>
                            <Text style={[homeStyles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0 }]}>
                                Farm State
                            </Text>
                            <MaterialIcons name="more-horiz" size={22} color={colors.textGrey} />
                        </View>

                        {/* Farm State Grid */}
                        <View style={homeStyles.farmStateGrid}>
                            <View style={homeStyles.farmStateRow}>
                                <View style={[homeStyles.farmStateCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: colors.primary + '1A' }]}>
                                        <Image
                                            source={require('../../assets/icons/animals-filled.svg')}
                                            style={{ width: 24, height: 24 }}
                                            contentFit="contain"
                                        />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 15, marginTop: 24 }]} numberOfLines={1}>
                                        Total Animals
                                    </Text>
                                    <View style={homeStyles.farmStateValueRow}>
                                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 18 }]}>185</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginLeft: 6 }]} numberOfLines={1}>Heads</Text>
                                    </View>
                                </View>

                                <View style={[homeStyles.farmStateCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#F97316' + '1A' }]}>
                                        <MaterialIcons name="warning-amber" size={24} color="#F97316" />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 15, marginTop: 24 }]} numberOfLines={1}>
                                        Active Alerts
                                    </Text>
                                    <View style={homeStyles.farmStateValueRow}>
                                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 18 }]}>3</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginLeft: 6 }]} numberOfLines={1}>Attention</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={homeStyles.farmStateRow}>
                                <View style={[homeStyles.farmStateCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#10B981' + '1A' }]}>
                                        <MaterialIcons name="grain" size={24} color="#10B981" />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 15, marginTop: 24 }]} numberOfLines={1}>
                                        Active AniFeed
                                    </Text>
                                    <View style={homeStyles.farmStateValueRow}>
                                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 18 }]}>5/6</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginLeft: 6 }]} numberOfLines={1}>Operational</Text>
                                    </View>
                                </View>

                                <View style={[homeStyles.farmStateCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[homeStyles.farmStateIconBox, { backgroundColor: '#6C63FF' + '1A' }]}>
                                        <MaterialIcons name="monitor-weight" size={24} color="#6C63FF" />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 15, marginTop: 24 }]} numberOfLines={1}>
                                        Active AniWeigh
                                    </Text>
                                    <View style={homeStyles.farmStateValueRow}>
                                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 18 }]}>2/2</Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginLeft: 6 }]} numberOfLines={1}>Operational</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Section: Quick Actions */}
                        <Text style={[homeStyles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
                        <View style={[homeStyles.quickActionsCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                            <View style={homeStyles.quickActionRow}>
                                <TouchableOpacity
                                    style={homeStyles.actionButton}
                                    activeOpacity={0.7}
                                    onPress={() => { }}
                                >
                                    <View style={[homeStyles.actionIconBox, { backgroundColor: colors.bgLight }]}>
                                        <MaterialIcons name="grain" size={26} color={colors.primary} />
                                    </View>
                                    <Text style={[textStyles.label, { color: colors.text, marginTop: 8 }]}>Feeds</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={homeStyles.actionButton}
                                    activeOpacity={0.7}
                                    onPress={() => { }}
                                >
                                    <View style={[homeStyles.actionIconBox, { backgroundColor: colors.bgLight }]}>
                                        <MaterialIcons name="devices" size={26} color={colors.primary} />
                                    </View>
                                    <Text style={[textStyles.label, { color: colors.text, marginTop: 8 }]}>Devices</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={homeStyles.actionButton}
                                    activeOpacity={0.7}
                                    onPress={() => { }}
                                >
                                    <View style={[homeStyles.actionIconBox, { backgroundColor: colors.bgLight }]}>
                                        <Image
                                            source={require('../../assets/icons/animals-filled.svg')}
                                            style={{ width: 26, height: 26 }}
                                            contentFit="contain"
                                        />
                                    </View>
                                    <Text style={[textStyles.label, { color: colors.text, marginTop: 8 }]}>Animals</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={homeStyles.actionButton}
                                    activeOpacity={0.7}
                                    onPress={() => { }}
                                >
                                    <View style={[homeStyles.actionIconBox, { backgroundColor: colors.bgLight }]}>
                                        <MaterialIcons name="show-chart" size={26} color={colors.primary} />
                                    </View>
                                    <Text style={[textStyles.label, { color: colors.text, marginTop: 8 }]}>Growth</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                    </View>
                </ScrollView>

                <FloatingNavBar />
            </View>
        </SafeAreaView>
    );
}
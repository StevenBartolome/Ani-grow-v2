import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { Header } from '@/components/Header';

interface MenuItem {
    title: string;
    description: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
    color: string;
    route: string;
}

export default function AnalyticsScreen() {
    const insets = useSafeAreaInsets();
    const { refreshProfile } = useAuth();
    const { colors, isDark } = useTheme();
    const textStyles = useTextStyles();
    const router = useRouter();
    const { width } = useWindowDimensions();

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshProfile();
        } catch (e) {
            console.error('[AnalyticsScreen] refresh error:', e);
        } finally {
            setRefreshing(false);
        }
    };

    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 18;

    const menuItems: MenuItem[] = [
        {
            title: 'Weighing History & Reports',
            description: 'Browse past weighing sessions and generate Week 1–4 or custom date-range reports.',
            icon: 'scale',
            color: '#6366F1',
            route: '/(weighing)/WeighingSessionsScreen',
        },
        {
            title: 'Growth Report',
            description: 'Analyze average daily gains (ADG) and overall weight trends across your livestock.',
            icon: 'trending-up',
            color: '#10B981',
            route: '/(analytics)/GrowthReportScreen',
        },
        {
            title: 'Feed Consumption Report',
            description: 'Monitor feeding efficiency, waste tracked, and overall feed conversion ratio (FCR).',
            icon: 'restaurant',
            color: '#F59E0B',
            route: '/(analytics)/FeedReportScreen',
        },
        {
            title: 'Health Report',
            description: 'Track mortality rates, illness documentation, and overall herd health status.',
            icon: 'favorite',
            color: '#F43F5E',
            route: '/(analytics)/HealthReportScreen',
        },
        {
            title: 'Prediction Forecast Report',
            description: 'AI-driven projections estimating harvest dates and growth trajectories based on farm data.',
            icon: 'insights',
            color: '#0284C7',
            route: '/(analytics)/PredictionReportScreen',
        },
    ];

    return (
        <View style={[styles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top }]}>
            <View style={styles.container}>
                <Header />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingHorizontal: hPad, paddingBottom: 110 }]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >
                    {/* Header */}
                    <View style={styles.headerTextContainer}>
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 24, fontFamily: 'Poppins-Bold' }]}>
                            Analytics
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 2, fontFamily: 'Poppins-Regular' }]}>
                            Data-driven farm insights & reporting
                        </Text>
                    </View>

                    {/* 5 Menu Cards */}
                    <View style={styles.menuList}>
                        {menuItems.map((item, index) => (
                            <TouchableOpacity
                                key={index}
                                activeOpacity={0.7}
                                style={[
                                    styles.menuCard,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.stroke,
                                    },
                                ]}
                                onPress={() => router.push(item.route as any)}
                            >
                                {/* Left Color Icon */}
                                <View
                                    style={[
                                        styles.iconContainer,
                                        {
                                            backgroundColor: item.color + (isDark ? '22' : '14'),
                                            borderColor: item.color + '2E',
                                        },
                                    ]}
                                >
                                    <MaterialIcons name={item.icon} size={20} color={item.color} />
                                </View>

                                {/* Center Content (Full original descriptions, no ellipsis) */}
                                <View style={styles.textContent}>
                                    <Text
                                        style={[
                                            textStyles.h3,
                                            styles.titleText,
                                            { color: colors.text },
                                        ]}
                                    >
                                        {item.title}
                                    </Text>
                                    <Text
                                        style={[
                                            textStyles.body,
                                            styles.descriptionText,
                                            { color: colors.textGrey },
                                        ]}
                                    >
                                        {item.description}
                                    </Text>
                                </View>

                                {/* Right Arrow */}
                                <View
                                    style={[
                                        styles.arrowContainer,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                        },
                                    ]}
                                >
                                    <MaterialIcons name="chevron-right" size={20} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </View>

            <FloatingNavBar />
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 6,
    },
    headerTextContainer: {
        marginBottom: 14,
        paddingTop: 2,
    },
    menuList: {
        gap: 10,
    },
    menuCard: {
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1.5 },
                shadowOpacity: 0.03,
                shadowRadius: 6,
            },
            android: {
                elevation: 1.5,
            },
            default: {
                boxShadow: '0px 2px 6px rgba(0,0,0,0.02)',
            },
        }),
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 13,
    },
    textContent: {
        flex: 1,
        marginRight: 8,
    },
    titleText: {
        fontSize: 14,
        fontFamily: 'Poppins-SemiBold',
        marginBottom: 2,
    },
    descriptionText: {
        fontSize: 11.5,
        lineHeight: 16,
        fontFamily: 'Poppins-Regular',
    },
    arrowContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

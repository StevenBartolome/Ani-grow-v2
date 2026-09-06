import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { Header } from '@/components/Header';

export default function AnalyticsScreen() {
    const { profile, refreshProfile } = useAuth();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? '';
    const styles = useAnalyticsStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();

    const [animalFilter, setAnimalFilter] = useState<'Pigs' | 'Chickens'>('Pigs');
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

    const menuItems = [
        {
            title: 'Weighing History & Reports',
            description: 'Browse past weighing sessions and generate a Week 1-4, full-history, or custom date-range report.',
            icon: 'scale' as React.ComponentProps<typeof MaterialIcons>['name'],
            route: '/(weighing)/WeighingSessionsScreen',
        },
        {
            title: 'Growth Report',
            description: 'Analyze average daily gains and overall weight trends across your livestock.',
            icon: 'trending-up' as React.ComponentProps<typeof MaterialIcons>['name'],
            route: '/(analytics)/GrowthReportScreen', // Placeholder routes
        },
        {
            title: 'Feed Consumption Report',
            description: 'Monitor feeding efficiency, waste tracked, and overall feed intake.',
            icon: 'restaurant' as React.ComponentProps<typeof MaterialIcons>['name'],
            route: '/(analytics)/FeedReportScreen',
        },
        {
            title: 'Health Report',
            description: 'Track mortality rates, illness documentation, and overall herd health status.',
            icon: 'favorite' as React.ComponentProps<typeof MaterialIcons>['name'],
            route: '/(analytics)/HealthReportScreen',
        },
        {
            title: 'Prediction Forecast Report',
            description: 'AI-driven projections estimating harvest dates and growth trajectories based on your active farm data.',
            icon: 'insights' as React.ComponentProps<typeof MaterialIcons>['name'],
            route: '/(analytics)/PredictionReportScreen',
        },
    ];

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Header />

                <View style={{ paddingBottom: 16 }}>
                    <View style={styles.headerContainer}>
                        <View style={styles.headerTextContainer}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>
                                Analytics
                            </Text>
                            <Text style={[textStyles.body, styles.headerSubtitle, { color: colors.textGrey, fontSize: 16, marginBottom: 16 }]}>
                                Data-driven farm insights
                            </Text>
                        </View>
                    </View>

                    {/* Animal Tab Filter (Pigs / Chickens) */}
                    <View style={[deviceStyles.filterContainer, { marginBottom: 8 }]}>
                        {['Pigs', 'Chickens'].map((filter) => (
                            <TouchableOpacity
                                key={filter}
                                activeOpacity={0.7}
                                onPress={() => setAnimalFilter(filter as 'Pigs' | 'Chickens')}
                                style={[
                                    deviceStyles.filterChip,
                                    animalFilter === filter && deviceStyles.filterChipActive
                                ]}
                            >
                                <Text style={[
                                    deviceStyles.filterChipText,
                                    animalFilter === filter && deviceStyles.filterChipTextActive
                                ]}>
                                    {filter}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 120 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >
                    <View style={styles.menuContainer}>
                        {menuItems.map((item, index) => (
                            <TouchableOpacity
                                key={index}
                                activeOpacity={0.8}
                                style={styles.menuCard}
                                onPress={() => router.push(`${item.route}?type=${animalFilter}` as any)}
                            >
                                <View style={styles.menuIconContainer}>
                                    <MaterialIcons name={item.icon} size={24} color={colors.primary} />
                                </View>
                                <View style={styles.menuContent}>
                                    <Text style={[textStyles.h2, styles.menuTitle, { fontSize: 16 }]}>
                                        {item.title}
                                    </Text>
                                    <Text style={[textStyles.body, styles.menuSubtitle]}>
                                        {item.description}
                                    </Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={20} color={colors.textGrey} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </View>
            <FloatingNavBar />
        </SafeAreaView>
    );
}

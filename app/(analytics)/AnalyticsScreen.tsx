import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnalyticsStyles } from '@/styles/analyticsStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';

export default function AnalyticsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnalyticsStyles();
    const deviceStyles = useDevicesStyles();
    const router = useRouter();

    const [animalFilter, setAnimalFilter] = useState<'Pigs' | 'Chickens'>('Pigs');

    const menuItems = [
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
            description: 'AI-driven projections estimating harvest dates and long-term costs based on active data.',
            icon: 'insights' as React.ComponentProps<typeof MaterialIcons>['name'],
            route: '/(analytics)/PredictionReportScreen',
        },
    ];

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTitleRow}>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={{ width: 36, height: 36, marginRight: 10 }}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 28 }]}>
                            Ani-Grow
                        </Text>
                    </View>
                    <View style={{ width: 40, height: 40 }} />
                </View>

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

import { Image } from 'expo-image';
import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function AboutAppScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();

    const features = [
        {
            icon: 'sensors' as const,
            title: 'AniFeed™ Smart Feeder Automation',
            desc: 'Precision motor-controlled feed dispensing with gram-level portioning, customizable daily schedules, and hopper refill monitoring for poultry coops and swine pens.',
        },
        {
            icon: 'monitor-weight' as const,
            title: 'AniWeigh™ Biometric Scale Telemetry',
            desc: 'Real-time livestock weight capturing, tare zero-calibration, and instant classification into Underweight, Normal, and Overweight according to target breed growth curves.',
        },
        {
            icon: 'psychology' as const,
            title: 'AniBot™ AI Farm Analytics & Insights',
            desc: 'Machine learning intelligence forecasting harvest readiness, tracking Feed Conversion Ratio (FCR), predicting growth anomalies, and assisting veterinary care.',
        },
        {
            icon: 'sync-problem' as const,
            title: 'Offline-First Synchronization',
            desc: 'Continuous coop and pen operations during rural connectivity interruptions with seamless background data sync upon reconnecting.',
        },
        {
            icon: 'admin-panel-settings' as const,
            title: 'Role-Based Multi-Farm Management',
            desc: 'Multi-farm support with granular access control for Super Admins, Farm Admins, Veterinarians, Caretakers, and Flockmen.',
        },
    ];

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        About Ani-Grow
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                    {/* Brand Banner */}
                    <View style={localStyles.brandSection}>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={localStyles.brandLogo}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 26, color: colors.primary, marginTop: 12 }]}>
                            Ani-Grow™
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center', marginTop: 2 }]}>
                            Precision Livestock & Poultry Telemetry Platform
                        </Text>
                        <View style={[localStyles.badge, { backgroundColor: colors.primary + '18' }]}>
                            <MaterialIcons name="verified" size={14} color={colors.primary} />
                            <Text style={[localStyles.badgeText, { color: colors.primary }]}>Version 2.5.0</Text>
                        </View>
                    </View>

                    {/* Mission Section */}
                    <View style={styles.section}>
                        <View style={[styles.card, { padding: 20, marginBottom: 16 }]}>
                            <View style={localStyles.cardHeaderRow}>
                                <MaterialIcons name="flag" size={22} color={colors.primary} />
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>
                                    Our Mission
                                </Text>
                            </View>
                            <Text style={[textStyles.body, { color: colors.textGrey, lineHeight: 22, marginTop: 8 }]}>
                                Ani-Grow is built to modernize poultry and livestock farming across the Philippines and globally. By uniting automated feeding hardware, real-time weighing scales, and AI-driven growth analytics, Ani-Grow empowers farm owners, managers, and caretakers to eliminate feed wastage, detect health risks early, and achieve peak farm productivity.
                            </Text>
                        </View>
                    </View>

                    {/* Core Features */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Key Technologies & Capabilities</Text>
                        <View style={[styles.card, { padding: 16, gap: 16 }]}>
                            {features.map((f, idx) => (
                                <View key={idx} style={[localStyles.featureItem, idx < features.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.stroke, paddingBottom: 14 }]}>
                                    <View style={[localStyles.featureIconBox, { backgroundColor: colors.primary + '14' }]}>
                                        <MaterialIcons name={f.icon} size={22} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h2, { fontSize: 14, color: colors.text, marginBottom: 4 }]}>
                                            {f.title}
                                        </Text>
                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, lineHeight: 18 }]}>
                                            {f.desc}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Support & Contact Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Support & Inquiries</Text>
                        <View style={[styles.card, { padding: 20 }]}>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 16, marginBottom: 8 }]}>
                                Need Assistance or Hardware Inquiries?
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20, marginBottom: 16 }]}>
                                Our dedicated farm telemetry and technical support team is available to help with device pairing, calibration, firmware updates, and account setups.
                            </Text>

                            <View style={localStyles.contactRow}>
                                <MaterialIcons name="email" size={18} color={colors.primary} />
                                <Text style={[localStyles.contactText, { color: colors.text }]}>anigrow.app@gmail.com</Text>
                            </View>

                            <View style={localStyles.contactRow}>
                                <MaterialIcons name="language" size={18} color={colors.primary} />
                                <Text style={[localStyles.contactText, { color: colors.text }]}>anigrow.vercel.app</Text>
                            </View>
                        </View>
                    </View>

                    {/* Footer Copyright */}
                    <View style={localStyles.footerBox}>
                        <Text style={[localStyles.footerText, { color: colors.textGrey }]}>
                            © 2026 Ani-Grow™
                        </Text>
                        <Text style={[localStyles.footerSub, { color: colors.textGrey }]}>
                            All rights reserved. Designed for precision agriculture and livestock welfare.
                        </Text>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}

const localStyles = StyleSheet.create({
    brandSection: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    brandLogo: {
        width: 84,
        height: 84,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        marginTop: 10,
    },
    badgeText: {
        fontSize: 11,
        fontFamily: 'Poppins-SemiBold',
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    featureIconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    contactText: {
        fontSize: 13,
        fontFamily: 'Poppins-Medium',
    },
    footerBox: {
        alignItems: 'center',
        marginTop: 24,
        paddingHorizontal: 20,
    },
    footerText: {
        fontSize: 12,
        fontFamily: 'Poppins-SemiBold',
    },
    footerSub: {
        fontSize: 10,
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
        marginTop: 4,
    },
});

import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

interface PolicySection {
    num: string;
    title: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
    paragraphs: string[];
    bullets?: string[];
}

const POLICY_SECTIONS: PolicySection[] = [
    {
        num: '1.0',
        title: 'Introduction & Scope of Policy',
        icon: 'verified-user',
        paragraphs: [
            'Ani-Grow ("we", "us", or "our") is dedicated to safeguarding the privacy and security of your personal information and farm operational data. This Privacy Policy outlines how we collect, process, store, and protect your information when you access or use the Ani-Grow Mobile Application, Web Farm Portal, hardware devices (including AniFeed and AniWeigh), and associated services (collectively, the "Platform").',
            'By creating an account, connecting hardware devices, or accessing our services, you acknowledge that you have read, understood, and consented to the practices described in this Privacy Policy in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and applicable international data protection standards.',
        ],
    },
    {
        num: '2.0',
        title: 'Information We Collect',
        icon: 'folder-shared',
        paragraphs: [
            'To provide precision livestock management, telemetry analysis, and hardware coordination, we collect the following categories of data:',
        ],
        bullets: [
            'Account & Personal Identity Data: Full name, email address, contact phone number, farm role (e.g. Super Admin, Farm Admin, Veterinarian, Caretaker, Flockman), and multi-factor authentication preferences.',
            'Farm & Housing Structure Data: Farm business name, geographic region, housing facilities (coops, pens, sheds), animal categories (poultry broilers/layers, swine growers/sows/piglets), and pen capacity specifications.',
            'Livestock & Biometric Telemetry: Active batch IDs, arrival dates, initial age, headcount, daily feed distribution (grams), water consumption, animal weight scaling logs, tare baselines, mortality records, and veterinary medication schedules.',
            'Hardware Device Data: Hardware sticker registration codes (e.g. AF-8842-P1, AW-3321-S4), MAC addresses, firmware versions, local Wi-Fi SSID configuration, signal strength (RSSI), battery telemetry, and motor dispense cycle logs.',
            'System Diagnostics & Usage Logs: IP address, mobile operating system version, crash diagnostics, audit timestamps of administrative actions (e.g., staff invitations, schedule edits, batch closures).',
        ],
    },
    {
        num: '3.0',
        title: 'How We Use Your Data',
        icon: 'analytics',
        paragraphs: [
            'Ani-Grow processes your personal and farm data strictly for legitimate operational and agricultural optimization purposes, including:',
        ],
        bullets: [
            'Executing automated feeding schedules according to programmed portion amounts and dispensing hours via AniFeed hardware.',
            'Processing live weight measurements from AniWeigh platforms to compute Average Daily Gain (ADG), Feed Conversion Ratio (FCR), and target harvest projections.',
            'Powering AniBot™ AI analytics to generate predictive alerts regarding growth anomalies, underfeeding risks, and biosecurity advisories.',
            'Compiling formal, printable PDF biometric audits and veterinary performance reports.',
            'Delivering high-priority push notifications and alerts regarding low feed hopper levels, animal health flags, or scale calibration offsets.',
            'Preventing unauthorized access through role-based access control and multi-factor verification.',
        ],
    },
    {
        num: '4.0',
        title: 'Data Security & Storage Safeguards',
        icon: 'security',
        paragraphs: [
            'We implement strict technical and organizational security measures to protect your farm data against unauthorized access, loss, alteration, or disclosure:',
            'All data transmissions between mobile devices, hardware controllers, and cloud servers are encrypted using Transport Layer Security (TLS 1.3). Database records are encrypted at rest using AES-256 standard encryption.',
            'Our cloud infrastructure utilizes Row-Level Security (RLS) policies within Supabase PostgreSQL, ensuring strict tenant isolation so that your farm records are accessible exclusively by your authorized staff members.',
        ],
    },
    {
        num: '5.0',
        title: 'Offline Storage & Local Synchronization',
        icon: 'sync-lock',
        paragraphs: [
            'Ani-Grow incorporates an offline-first architecture designed for rural agricultural environments. When network connectivity is unavailable, feeding schedules, weighing records, and mortality logs are stored securely in local encrypted device storage.',
            'Upon reconnecting to the internet, pending changes are automatically validated and synchronized with the cloud farm database without duplicating records.',
        ],
    },
    {
        num: '6.0',
        title: 'Third-Party Service Providers',
        icon: 'extension',
        paragraphs: [
            'We do not sell, rent, or monetize your personal or farm data to third-party advertisers. We engage trusted third-party cloud infrastructure providers strictly to maintain platform operations:',
        ],
        bullets: [
            'Cloud Database & Authentication: Supabase (PostgreSQL hosting, user auth, and storage).',
            'Push Notifications: Expo Notification Services & Google Firebase Cloud Messaging (FCM) for operational alerts.',
            'AI Analytical Processing: Google Gemini AI APIs for farm health summaries and growth recommendations (data transmitted is strictly anonymized telemetry without personal identifiers).',
        ],
    },
    {
        num: '7.0',
        title: 'Your Rights & Data Ownership',
        icon: 'assignment-ind',
        paragraphs: [
            'You retain full ownership of all livestock and biometric data generated on your farm. Under the Data Privacy Act of 2012, you hold the following rights regarding your information:',
        ],
        bullets: [
            'Right to Access: Request a copy of all personal and farm records stored in your account.',
            'Right to Rectification: Correct inaccurate or outdated profile and livestock information at any time directly through the app.',
            'Right to Data Portability: Export your farm reports, batch logs, and weighing histories into PDF or standardized formats.',
            'Right to Erasure / Account Deletion: Request the complete permanent deletion of your user account and associated farm records.',
        ],
    },
    {
        num: '8.0',
        title: 'Data Retention & Account Termination',
        icon: 'delete-sweep',
        paragraphs: [
            'We retain active batch data and farm records for as long as your account remains active or as needed to provide ongoing historical growth tracking and multi-cycle performance audits.',
            'When you close a farm or delete your account, your personal credentials and device linkages will be permanently scrubbed or anonymized within thirty (30) business days, except where retention is required by statutory legal or financial recordkeeping obligations.',
        ],
    },
    {
        num: '9.0',
        title: 'Updates to This Privacy Policy',
        icon: 'update',
        paragraphs: [
            'We may update this Privacy Policy periodically to reflect new hardware features, evolving agricultural standards, or legal changes. When significant modifications are made, we will notify you through the Ani-Grow Mobile App or via your registered email address prior to the changes taking effect.',
        ],
    },
    {
        num: '10.0',
        title: 'Contact Information',
        icon: 'contact-support',
        paragraphs: [
            'If you have questions, feedback, or privacy-related requests regarding this Privacy Policy or our handling of farm telemetry, please contact us:',
            'Email: anigrow.app@gmail.com\nWebsite: anigrow.vercel.app',
        ],
    },
];

export default function PrivacyPolicyScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(settings)/SettingsScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Privacy Policy
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                    {/* Policy Metadata Card */}
                    <View style={styles.section}>
                        <View style={[styles.card, { padding: 18, marginTop: 8, marginBottom: 16, backgroundColor: colors.surface }]}>
                            <View style={localStyles.metaHeaderRow}>
                                <View style={[localStyles.shieldIconBox, { backgroundColor: colors.primary + '18' }]}>
                                    <MaterialIcons name="security" size={24} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 16 }]}>
                                        Ani-Grow™ Privacy Policy
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                        Reference: POL-AG-PRIV-2026 • Rev 2.5
                                    </Text>
                                </View>
                            </View>

                            <View style={[localStyles.divider, { backgroundColor: colors.stroke }]} />

                            <View style={localStyles.badgeRow}>
                                <View style={[localStyles.infoPill, { backgroundColor: colors.bgLight }]}>
                                    <MaterialIcons name="event" size={13} color={colors.primary} />
                                    <Text style={[localStyles.infoPillText, { color: colors.text }]}>Last Updated: September 2026</Text>
                                </View>
                                <View style={[localStyles.infoPill, { backgroundColor: colors.bgLight }]}>
                                    <MaterialIcons name="gavel" size={13} color={colors.primary} />
                                    <Text style={[localStyles.infoPillText, { color: colors.text }]}>RA 10173 Compliant</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Policy Sections */}
                    <View style={styles.section}>
                        <View style={{ gap: 14 }}>
                            {POLICY_SECTIONS.map((sec) => (
                                <View key={sec.num} style={[styles.card, { padding: 18 }]}>
                                    <View style={localStyles.sectionHeadingRow}>
                                        <View style={[localStyles.secNumBox, { backgroundColor: colors.primary + '14' }]}>
                                            <MaterialIcons name={sec.icon} size={18} color={colors.primary} />
                                        </View>
                                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 15, flex: 1 }]}>
                                            {sec.num} {sec.title}
                                        </Text>
                                    </View>

                                    <View style={{ marginTop: 10, gap: 8 }}>
                                        {sec.paragraphs.map((p, pIdx) => (
                                            <Text key={pIdx} style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20 }]}>
                                                {p}
                                            </Text>
                                        ))}

                                        {sec.bullets && (
                                            <View style={localStyles.bulletsContainer}>
                                                {sec.bullets.map((b, bIdx) => (
                                                    <View key={bIdx} style={localStyles.bulletRow}>
                                                        <View style={[localStyles.bulletDot, { backgroundColor: colors.primary }]} />
                                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12.5, lineHeight: 19, flex: 1 }]}>
                                                            {b}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Contact Footer */}
                    <View style={localStyles.footerBox}>
                        <Text style={[localStyles.footerText, { color: colors.textGrey }]}>
                            Ani-Grow™
                        </Text>
                        <Text style={[localStyles.footerSub, { color: colors.textGrey }]}>
                            For inquiries or data subject rights requests, contact anigrow.app@gmail.com.
                        </Text>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}

const localStyles = StyleSheet.create({
    metaHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    shieldIconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        height: 1,
        marginVertical: 12,
    },
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    infoPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    infoPillText: {
        fontSize: 11,
        fontFamily: 'Poppins-Medium',
    },
    sectionHeadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    secNumBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulletsContainer: {
        marginTop: 6,
        gap: 8,
        paddingLeft: 4,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    bulletDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 6,
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

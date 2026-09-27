import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

interface TermSection {
    num: string;
    title: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
    paragraphs: string[];
    bullets?: string[];
}

const TERMS_SECTIONS: TermSection[] = [
    {
        num: '1.0',
        title: 'Acceptance of Terms',
        icon: 'assignment',
        paragraphs: [
            'By downloading, accessing, or using the Ani-Grow Mobile Application, Web Farm Portal, hardware firmware, and cloud services (collectively, the "Service"), you agree to be bound by these Terms of Service. If you are entering into this agreement on behalf of a farm enterprise or commercial poultry/livestock company, you represent that you possess the requisite authority to bind that entity.',
        ],
    },
    {
        num: '2.0',
        title: 'User Accounts & Access Permissions',
        icon: 'manage-accounts',
        paragraphs: [
            'Farm Administrators are responsible for maintaining the confidentiality of staff access codes, email credentials, and Multi-Factor Authentication (MFA) tokens.',
        ],
        bullets: [
            'Staff Roles: Roles such as Super Admin, Farm Admin, Veterinarian, Caretaker, and Flockman must only be granted to authorized farm personnel.',
            'Account Security: You agree to notify Ani-Grow immediately upon becoming aware of any unauthorized access, compromised passwords, or hardware security breaches.',
            'Accuracy of Records: Users agree to record genuine flock and herd telemetry, headcount arrivals, and mortality logs to ensure valid analytics.',
        ],
    },
    {
        num: '3.0',
        title: 'Hardware Operations & Safety Guidelines',
        icon: 'precision-manufacturing',
        paragraphs: [
            'Ani-Grow provides telemetry integration for AniFeed automated feeders and AniWeigh scale platforms. Safe deployment in agricultural coops and pens requires adherence to manufacturer guidelines:',
        ],
        bullets: [
            'Electrical Safety: Ensure hardware power adapters, solar charge controllers, and battery units are protected from excessive moisture, water spray, and rodent damage.',
            'Mechanical Maintenance: Regular hopper cleaning, feed chute unclogging, and load-cell tare calibration are the operational responsibility of the farm operator.',
            'Animal Welfare: Automated feeding systems are intended as precision operational aids and do not substitute regular physical inspection of animal flock health and water lines.',
        ],
    },
    {
        num: '4.0',
        title: 'Data Ownership & Intellectual Property',
        icon: 'copyright',
        paragraphs: [
            'All livestock biometric records, farm layout profiles, weighing session logs, and batch production histories generated through the Service remain the sole property of the respective farm account holder.',
            'The Ani-Grow software, branding, UI designs, firmware algorithms, predictive AI models, and documentation are the exclusive intellectual property of Ani-Grow and protected by copyright and intellectual property laws.',
        ],
    },
    {
        num: '5.0',
        title: 'Service Availability & Cloud Connectivity',
        icon: 'cloud-done',
        paragraphs: [
            'While Ani-Grow utilizes high-availability cloud infrastructure and offline-first local synchronization, continuous uninterrupted connectivity cannot be guaranteed in extreme weather or rural telecommunication failures.',
            'Offline caching ensures hardware continues scheduled dispensations and scales continue logging measurements independently of cloud uptime.',
        ],
    },
    {
        num: '6.0',
        title: 'Limitation of Liability',
        icon: 'gavel',
        paragraphs: [
            'Ani-Grow provides growth forecasting, FCR estimates, and AI recommendations for informational and optimization purposes. Farm operators maintain final discretion over veterinary treatments, feed rationing, and harvest logistics.',
            'To the maximum extent permitted by applicable law, Ani-Grow shall not be liable for indirect, incidental, or consequential livestock losses arising from power outages, physical hardware tampering, or improper equipment installation.',
        ],
    },
    {
        num: '7.0',
        title: 'Termination & Account Cancellation',
        icon: 'cancel',
        paragraphs: [
            'You may terminate your farm account at any time by submitting an account cancellation request or contacting anigrow.app@gmail.com. Upon termination, data export tools remain available for thirty (30) days prior to permanent record archiving.',
        ],
    },
];

export default function TermsOfServiceScreen() {
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
                        Terms of Service
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                    {/* Header Card */}
                    <View style={styles.section}>
                        <View style={[styles.card, { padding: 18, marginTop: 8, marginBottom: 16, backgroundColor: colors.surface }]}>
                            <View style={localStyles.metaHeaderRow}>
                                <View style={[localStyles.shieldIconBox, { backgroundColor: colors.primary + '18' }]}>
                                    <MaterialIcons name="description" size={24} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 16 }]}>
                                        Ani-Grow™ Terms of Service
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                        Reference: TOS-AG-SERV-2026 • Rev 2.5
                                    </Text>
                                </View>
                            </View>

                            <View style={[localStyles.divider, { backgroundColor: colors.stroke }]} />

                            <View style={localStyles.badgeRow}>
                                <View style={[localStyles.infoPill, { backgroundColor: colors.bgLight }]}>
                                    <MaterialIcons name="event" size={13} color={colors.primary} />
                                    <Text style={[localStyles.infoPillText, { color: colors.text }]}>Effective Date: September 2026</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Terms Sections */}
                    <View style={styles.section}>
                        <View style={{ gap: 14 }}>
                            {TERMS_SECTIONS.map((sec) => (
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

                    {/* Footer */}
                    <View style={localStyles.footerBox}>
                        <Text style={[localStyles.footerText, { color: colors.textGrey }]}>
                            Ani-Grow™
                        </Text>
                        <Text style={[localStyles.footerSub, { color: colors.textGrey }]}>
                            For legal inquiries or commercial enterprise contracts, contact anigrow.app@gmail.com.
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

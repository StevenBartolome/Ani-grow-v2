import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function PrivacyPolicyScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(auth)/LoginScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Privacy Policy
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <View style={[styles.card, { padding: 24, marginTop: 12 }]}>
                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                1. Data Collection
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                We collect various types of information for various purposes to provide and improve our service to you. This includes Personal Data (like your email address, first name, and last name) as well as Usage Data regarding how you connect and interact with our application.
                            </Text>

                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                2. Use of Data
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                Ani-Grow uses the collected data to provide and maintain our service, to notify you about changes to our application, to allow you to participate in interactive features when you choose to do so, and to provide customer support.
                            </Text>

                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                3. Data Security
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
                            </Text>

                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                4. Third-Party Services
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 8, lineHeight: 22 }]}>
                                We may employ third party companies and individuals to facilitate our Service, to provide the Service on our behalf, or to assist us in analyzing how our Service is used. They have access to your Personal Data only to perform these tasks.
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

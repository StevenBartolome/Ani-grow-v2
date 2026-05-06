import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function TermsOfServiceScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton onPress={() => router.back()} />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Terms of Service
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <View style={[styles.card, { padding: 24, marginTop: 12 }]}>
                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                1. Introduction
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                Welcome to Ani-Grow. By accessing or using our application, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you may not access our service.
                            </Text>

                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                2. User Accounts
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                When you create an account with us, you must provide accurate, complete, and current information at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.
                            </Text>

                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                3. Acceptable Use
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                You agree not to use the application to engage in any unlawful conduct or to upload any content that is harmful, offensive, or violates the rights of others.
                            </Text>

                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>
                                4. Modifications
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 8, lineHeight: 22 }]}>
                                We reserve the right to modify or replace these Terms at any time. We will try to provide at least 30 days notice prior to any new terms taking effect.
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

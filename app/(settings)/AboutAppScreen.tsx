import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function AboutAppScreen() {
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
                        About App
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    
                    <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 24 }}>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={{ width: 80, height: 80, marginBottom: 16 }}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 28, color: colors.primary }]}>
                            Ani-Grow
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 4 }]}>
                            Version 1.0.0
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <View style={[styles.card, { padding: 24 }]}>
                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8, fontSize: 18 }]}>
                                Our Mission
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, marginBottom: 24, lineHeight: 22 }]}>
                                Ani-Grow is dedicated to empowering farm administrators with modern tools to optimize production, manage resources, and track performance seamlessly from anywhere.
                            </Text>
                            
                            <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8, fontSize: 18 }]}>
                                Contact Us
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, lineHeight: 22 }]}>
                                Have questions or need support? Reach out to our team at support@anigrow.app or visit our website for more information.
                            </Text>
                        </View>
                    </View>

                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function NotificationSettingsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();

    const [pushEnabled, setPushEnabled] = useState(true);
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [marketingEnabled, setMarketingEnabled] = useState(false);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Notifications
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Alerts & Notifications</Text>
                        <Text style={styles.sectionDescription}>Decide how we can stay in touch with you.</Text>

                        <View style={styles.card}>
                            <View style={[styles.row, styles.rowBorder]}>
                                <View style={styles.rowTextContainer}>
                                    <Text style={styles.rowTitle}>Push Notifications</Text>
                                    <Text style={styles.rowDescription}>Receive alerts directly on your device.</Text>
                                </View>
                                <Switch
                                    value={pushEnabled}
                                    onValueChange={setPushEnabled}
                                    trackColor={{ false: colors.stroke, true: colors.primary }}
                                    thumbColor="#FFFFFF"
                                />
                            </View>

                            <View style={[styles.row, styles.rowBorder]}>
                                <View style={styles.rowTextContainer}>
                                    <Text style={styles.rowTitle}>Email Updates</Text>
                                    <Text style={styles.rowDescription}>Get important account updates by email.</Text>
                                </View>
                                <Switch
                                    value={emailEnabled}
                                    onValueChange={setEmailEnabled}
                                    trackColor={{ false: colors.stroke, true: colors.primary }}
                                    thumbColor="#FFFFFF"
                                />
                            </View>

                            <View style={styles.row}>
                                <View style={styles.rowTextContainer}>
                                    <Text style={styles.rowTitle}>Marketing & Offers</Text>
                                    <Text style={styles.rowDescription}>Hear about new features and promotions.</Text>
                                </View>
                                <Switch
                                    value={marketingEnabled}
                                    onValueChange={setMarketingEnabled}
                                    trackColor={{ false: colors.stroke, true: colors.primary }}
                                    thumbColor="#FFFFFF"
                                />
                            </View>
                        </View>
                    </View>

                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

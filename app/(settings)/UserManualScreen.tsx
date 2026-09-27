import React, { useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { Text } from '@/components/Text';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { openUserManual } from '@/lib/userManual';

export default function UserManualScreen() {
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;

    const [isLoading, setIsLoading] = useState(false);

    const handleOpen = async () => {
        setIsLoading(true);
        try {
            await openUserManual();
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={[styles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.stroke }]}>
                <View style={styles.headerSide}>
                    <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                </View>

                <View style={styles.headerTitleContainer}>
                    <Text style={[textStyles.h1, styles.headerTitle, { color: colors.primary }]}>
                        User Manual
                    </Text>
                </View>

                <View style={styles.headerSide} />
            </View>

            <View style={styles.contentContainer}>
                {/* Hero Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
                        <MaterialIcons name="menu-book" size={38} color={colors.primary} />
                    </View>

                    <Text style={[textStyles.h1, styles.cardTitle, { color: colors.text }]}>
                        Ani-Grow™ Official User Manual
                    </Text>

                    <Text style={[styles.refTag, { color: colors.textGrey }]}>
                        Document Ref: DOC-AG-MAN-2026 • Revision 2.5
                    </Text>

                    <Text style={[textStyles.body, styles.cardDescription, { color: colors.textGrey }]}>
                        View the complete poultry & livestock farm admin and hardware setup guide. Covers hardware registration, Wi-Fi pairing, feed scheduling, and smart weighing platform operations.
                    </Text>

                    <TouchableOpacity
                        style={[styles.openButton, { backgroundColor: colors.primary }]}
                        activeOpacity={0.8}
                        onPress={handleOpen}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <MaterialIcons
                                    name={Platform.OS === 'web' ? 'open-in-new' : 'picture-as-pdf'}
                                    size={20}
                                    color="#FFFFFF"
                                />
                                <Text style={styles.openButtonText}>
                                    {Platform.OS === 'web' ? 'Open Manual in Web' : 'Open User Manual'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerSide: {
        width: 44,
        height: 44,
        justifyContent: 'center',
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        textAlign: 'center',
    },
    contentContainer: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    card: {
        width: '100%',
        maxWidth: 440,
        borderRadius: 20,
        borderWidth: 1.5,
        padding: 24,
        alignItems: 'center',
        ...Platform.select({
            web: { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.06)' },
            default: {
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
            }
        })
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 20,
        textAlign: 'center',
        marginBottom: 6,
    },
    refTag: {
        fontSize: 11,
        fontFamily: 'Poppins-Medium',
        marginBottom: 14,
        textAlign: 'center',
    },
    cardDescription: {
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'center',
        marginBottom: 24,
    },
    openButton: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 12,
        gap: 8,
    },
    openButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'Poppins-SemiBold',
    },
});

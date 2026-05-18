import { StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/** Scales horizontal padding so content breathes inward on wide screens */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useAnimalStyles = () => {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);

    return StyleSheet.create({
        // Screen base
        safeArea: {
            flex: 1,
            backgroundColor: colors.bgLight,
        },
        container: {
            flex: 1,
        },
        
        // Headers (from AnimalsScreen)
        headerTopRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 16,
        },
        headerTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        headerContainer: {
            paddingTop: 8,
        },
        headerTextContainer: {
            paddingHorizontal: hPad,
            marginTop: 8,
        },
        headerSubtitle: {
            marginTop: 4,
            marginBottom: 24,
        },
        
        // Cards (from AnimalsScreen)
        sectionTitleRow: {
            paddingHorizontal: hPad,
            marginBottom: 16,
            marginTop: 8,
        },
        gridContainer: {
            paddingHorizontal: hPad,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 16,
        },
        deviceCard: {
            borderRadius: 24,
            borderWidth: 1,
            elevation: 2,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 12,
        },

        // Bottom Bars (from AnimalsScreen)
        bottomBar: {
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 32,
        },
        primaryButton: {
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
        },

        // Animal Details Specific
        bgImageContainer: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 380,
            opacity: 0.15,
        },
        bgImage: {
            width: '100%',
            height: '100%',
        },
        gradientOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 380,
        },
        detailsHeaderRow: {
            paddingHorizontal: hPad,
            paddingTop: Platform.OS === 'android' ? 40 : 20,
            paddingBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
        },
        backButton: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.stroke,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 4,
            elevation: 3,
        },
        scrollContent: {
            paddingHorizontal: hPad,
            paddingBottom: 60,
        },
        detailsSubtitle: {
            marginTop: 12,
            marginBottom: 24,
            lineHeight: 22,
        },

        // Dropdown
        dropdownLabel: {
            marginBottom: 8,
        },
        dropdownContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.inputFill,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 18,
            marginBottom: 24,
        },

        // Insight Card
        insightCard: {
            borderRadius: 20,
            padding: 20,
            marginBottom: 24,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 5,
        },
        insightIconBox: {
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            padding: 8,
            borderRadius: 8,
        },

        // Status Card (Feeders & Weighers)
        statusCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.stroke,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 6,
            elevation: 2,
        },
        statusIconBox: {
            width: 48,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
        },
        feedBarBg: {
            height: 8,
            backgroundColor: colors.stroke,
            borderRadius: 4,
            width: '100%',
            marginTop: 8,
        },
        feedBarFill: {
            height: 8,
            borderRadius: 4,
        }
    });
};

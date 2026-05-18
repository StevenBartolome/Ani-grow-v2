import { StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

/** Scales horizontal padding so content breathes inward on wide screens */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useGuideStyles = () => {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: colors.bgLight,
        },
        container: {
            flex: 1,
        },
        headerContainer: {
            paddingTop: 8,
        },
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
        headerTextContainer: {
            paddingHorizontal: hPad,
            marginTop: 8,
        },
        headerSubtitle: {
            marginTop: 4,
            marginBottom: 24,
        },
        filterContainer: {
            flexDirection: 'row',
            paddingHorizontal: hPad,
            marginBottom: 24,
            gap: 12,
        },
        filterChip: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.stroke,
        },
        filterChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        filterChipText: {
            fontFamily: 'Poppins-Medium',
            fontSize: 13,
            color: colors.textGrey,
        },
        filterChipTextActive: {
            color: colors.onPrimary,
        },
        dayBadge: {
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.primary + '33', // 20% opacity primary
            alignItems: 'center',
            ...Platform.select({
                ios: {
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 10,
                },
                android: {
                    elevation: 4,
                },
            }),
        },
        insightCard: {
            backgroundColor: colors.primary,
            borderRadius: 20,
            padding: 20,
            marginHorizontal: 0,
            marginBottom: 24,
            ...Platform.select({
                ios: {
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                },
                android: {
                    elevation: 6,
                },
            }),
        },
        insightIconBox: {
            padding: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 8,
            marginRight: 12,
        },
    });
};

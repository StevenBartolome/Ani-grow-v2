import { StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

/** Scales horizontal padding so content breathes inward on wide screens */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useAnalyticsStyles = () => {
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
            // Container for header text below the nav bar
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
        sectionTitleRow: {
            paddingHorizontal: hPad,
            marginBottom: 16,
        },
        menuContainer: {
            paddingHorizontal: hPad,
            paddingTop: 8,
        },
        menuCard: {
            backgroundColor: colors.surface,
            borderRadius: 20,
            marginBottom: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.stroke,
            ...Platform.select({
                ios: {
                    shadowColor: colors.text,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.04,
                    shadowRadius: 10,
                },
                android: {
                    elevation: 3,
                },
            }),
        },
        menuIconContainer: {
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: colors.primary + '1A', // 10% opacity primary color
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
        },
        menuContent: {
            flex: 1,
        },
        menuTitle: {
            color: colors.text,
            marginBottom: 4,
        },
        menuSubtitle: {
            color: colors.textGrey,
            fontSize: 12,
            lineHeight: 16,
        },
        pageHeaderContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: hPad,
            paddingTop: 16,
            marginBottom: 24,
        },
        dateContainer: {
            alignItems: 'flex-end',
        },
        titleDayRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: hPad,
            marginBottom: 32,
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
        tabsContainer: {
            flexDirection: 'row',
            backgroundColor: colors.inputFill,
            borderRadius: 12,
            padding: 4,
            marginHorizontal: hPad,
            marginBottom: 16,
        },
        tabItem: {
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        tabItemActive: {
            backgroundColor: colors.primary, // dynamically overridden
        },
        headCountBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            borderWidth: 1,
            alignSelf: 'center',
            marginBottom: 24,
        },
        graphPlaceholder: {
            height: 220,
            marginHorizontal: 0,
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.stroke,
            marginBottom: 32,
            alignItems: 'center',
            justifyContent: 'center',
        },
        insightCard: {
            backgroundColor: colors.primary,
            borderRadius: 20,
            padding: 20,
            marginHorizontal: 0,
            marginBottom: 40,
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

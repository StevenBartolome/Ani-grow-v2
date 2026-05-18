import { StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

/** Mirrors homeStyles responsive padding */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useNotificationStyles = () => {
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

        // ─── Header ─────────────────────────────────────────────────────────────
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 16,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },

        // ─── List ───────────────────────────────────────────────────────────────
        listContent: {
            paddingTop: 16,
            paddingBottom: 100,
            paddingHorizontal: hPad,
        },
        notificationCard: {
            flexDirection: 'row',
            paddingVertical: 16,
            paddingHorizontal: 16,
            backgroundColor: colors.surface,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: colors.stroke,
            marginBottom: 12,
            alignItems: 'flex-start',
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
        },
        iconBox: {
            width: 48,
            height: 48,
            borderRadius: 24,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 16,
        },
        contentContainer: {
            flex: 1,
        },
        titleRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
        },
        unreadDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            marginLeft: 6,
        },
        emptyContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 80,
            paddingHorizontal: hPad,
        }
    });
};

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
        },

        // ─── List ───────────────────────────────────────────────────────────────
        listContent: {
            paddingTop: 8,
            paddingBottom: 100,
            paddingHorizontal: hPad,
        },
        listContainer: {
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.stroke,
            overflow: 'hidden',
        },
        notificationItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 13,
            paddingHorizontal: 14,
        },
        divider: {
            height: 1,
            backgroundColor: colors.stroke,
            marginLeft: 64, // subtle inset divider aligned with text
        },
        iconBox: {
            width: 38,
            height: 38,
            borderRadius: 19,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
        },
        contentContainer: {
            flex: 1,
            justifyContent: 'center',
        },
        titleRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 2,
        },
        unreadDot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.primary,
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

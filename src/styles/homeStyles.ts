import { StyleSheet, useWindowDimensions } from 'react-native';
import { createTheme } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

/** Scales horizontal padding so content breathes inward on wide screens */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useHomeStyles = () => {
    const { colors } = useTheme();
    const theme = createTheme(colors);
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

        // ─── Header ────────────────────────────────────────────────────────────
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
        headerLeft: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        logo: {
            width: 36,
            height: 36,
            marginRight: 10,
        },
        headerRight: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
        },
        iconButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.bgLight,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.stroke,
        },
        profileIcon: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        profileInitial: {
            color: colors.onPrimary,
            fontSize: 16,
            fontFamily: 'Poppins-SemiBold',
        },
        notifBadge: {
            position: 'absolute',
            right: 6,
            top: 6,
            backgroundColor: '#EF4444',
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
        },
        notifBadgeText: {
            color: '#fff',
            fontSize: 9,
            fontFamily: 'Poppins-SemiBold',
        },

        // ─── Greeting ──────────────────────────────────────────────────────────
        greetingContainer: {
            paddingHorizontal: hPad,
            paddingVertical: 24,
        },
        content: {
            flex: 1,
            paddingHorizontal: 0,
        },

        // ─── Info Banner ───────────────────────────────────────────────────────
        infoBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: hPad,
            marginBottom: 24,
            borderRadius: 16,
            padding: 16,
            elevation: 4,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
        },
        infoBannerIconBox: {
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 12,
            padding: 8,
        },

        // ─── Section Titles ────────────────────────────────────────────────────
        sectionTitle: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 18,
            marginBottom: 16,
            paddingHorizontal: hPad,
        },
        sectionHeaderRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: hPad,
            marginBottom: 16,
            marginTop: 8,
        },

        // ─── Alert Carousel ────────────────────────────────────────────────────
        alertCarousel: {
            paddingLeft: hPad,
            paddingRight: 8,
            paddingBottom: 24,
        },
        alertChipCard: {
            width: 160,
            padding: 16,
            borderRadius: 16,
            borderWidth: 1.5,
            marginRight: 12,
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 8 },
        },
        alertChipIconBox: {
            padding: 8,
            borderRadius: 8,
            alignSelf: 'flex-start',
        },

        // ─── Farm State Grid ───────────────────────────────────────────────────
        farmStateGrid: {
            paddingHorizontal: hPad,
            gap: 10,
            marginBottom: 8,
        },
        farmStateRow: {
            flexDirection: 'row',
            gap: 10,
        },
        farmStateCard: {
            flex: 1,
            padding: 14,
            borderRadius: 20,
            borderWidth: 1.5,
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 8 },
        },
        farmStateIconBox: {
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'flex-start',
        },
        farmStateValueRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
        },

        // ─── Quick Actions ─────────────────────────────────────────────────────
        quickActionsCard: {
            marginHorizontal: hPad,
            borderRadius: 20,
            borderWidth: 1.5,
            padding: 20,
            marginBottom: 28,
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 8 },
        },
        quickActionRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
        },
        actionButton: {
            alignItems: 'center',
        },
        actionIconBox: {
            width: 56,
            height: 56,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
        },

        // ─── Legacy (kept for compatibility) ───────────────────────────────────
        livestockCarousel: {
            paddingLeft: 20,
            paddingRight: 8,
            paddingBottom: 24,
        },
        animalCard: {
            width: 240,
            borderRadius: 24,
            padding: 20,
            marginRight: 12,
            borderWidth: 1,
            elevation: 6,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 16,
        },
        animalCardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
        },
        animalIconBox: {
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
        },
        statRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 12,
        },
        alertsContainer: {
            paddingHorizontal: 20,
        },
        alertCard: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            marginBottom: 12,
        },
        alertIconBox: {
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
        },
    });
};
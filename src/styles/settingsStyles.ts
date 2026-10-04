import { StyleSheet, useWindowDimensions } from 'react-native';
import { createTheme } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

/** Mirrors homeStyles responsive padding */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useSettingsStyles = () => {
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

        // ─── Header ─────────────────────────────────────────────────────────────
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 16,
        },

        // ─── Profile ────────────────────────────────────────────────────────────
        profileSection: {
            alignItems: 'center',
            paddingVertical: 32,
            paddingHorizontal: hPad,
        },
        profileAvatar: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            elevation: 4,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
        },
        profileAvatarText: {
            color: colors.onPrimary,
            fontSize: 32,
            fontFamily: 'Poppins-Bold',
        },
        profileName: {
            textAlign: 'center',
            fontSize: 22,
            color: colors.text,
            marginBottom: 4,
        },
        profileEmail: {
            textAlign: 'center',
            fontSize: 14,
            color: colors.textGrey,
            marginBottom: 10,
        },
        profileBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.primary + '15',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: colors.primary + '30',
        },
        profileBadgeText: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 13,
        },

        // ─── Sections & Cards ───────────────────────────────────────────────────
        section: {
            marginTop: 8,
            paddingHorizontal: hPad,
        },
        sectionTitle: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 12,
            color: colors.textGrey,
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginTop: 20,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: colors.stroke,
            overflow: 'hidden',
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
        },

        // ─── Rows ────────────────────────────────────────────────────────────────
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },
        rowNoBorder: {
            borderBottomWidth: 0,
        },
        rowContent: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
        },
        rowRight: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        iconBox: {
            width: 42,
            height: 42,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
        },
        rowTitle: {
            fontFamily: 'Poppins-Medium',
            fontSize: 15,
            color: colors.text,
        },
        rowDescription: {
            fontFamily: 'Poppins-Regular',
            fontSize: 12,
            color: colors.textGrey,
            marginTop: 1,
        },
        rowValue: {
            fontFamily: 'Poppins-Regular',
            fontSize: 14,
            color: colors.textGrey,
        },

        // ─── Logout Button ───────────────────────────────────────────────────────
        logoutButton: {
            marginTop: 32,
            marginHorizontal: hPad,
            backgroundColor: '#FEF2F2',
            borderRadius: 999,
            paddingVertical: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            borderWidth: 1.5,
            borderColor: '#FECACA',
            elevation: 2,
            shadowColor: '#EF4444',
            shadowOpacity: 0.1,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
        },
        logoutText: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 16,
            color: '#EF4444',
        },

        // ─── Logout Modal ────────────────────────────────────────────────────────
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
        },
        modalContainer: {
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.surface,
            borderRadius: 28,
            padding: 28,
            alignItems: 'center',
            elevation: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
        },
        modalIconBox: {
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#FEE2E2',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            borderWidth: 2,
            borderColor: '#FCA5A5',
        },
        modalTitle: {
            fontFamily: 'Poppins-Bold',
            fontSize: 22,
            color: colors.text,
            marginBottom: 8,
            textAlign: 'center',
        },
        modalMessage: {
            fontFamily: 'Poppins-Regular',
            fontSize: 14,
            color: colors.textGrey,
            textAlign: 'center',
            marginBottom: 28,
            lineHeight: 22,
        },
        modalButtonRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: '100%',
            gap: 12,
        },
        modalButton: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
        },
        modalCancelButton: {
            backgroundColor: colors.bgLight,
            borderWidth: 1.5,
            borderColor: colors.stroke,
        },
        modalCancelText: {
            fontFamily: 'Poppins-Medium',
            fontSize: 15,
            color: colors.text,
        },
        modalConfirmButton: {
            backgroundColor: '#EF4444',
            elevation: 2,
            shadowColor: '#EF4444',
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
        },
        modalConfirmText: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 15,
            color: '#FFFFFF',
        },

    });
};
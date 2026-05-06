import { StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useSettingsSubPageStyles = () => {
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
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 16,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },
        section: {
            marginTop: 8,
            paddingHorizontal: hPad,
        },
        sectionTitle: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 12,
            color: colors.textGrey,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginTop: 20,
        },
        sectionDescription: {
            fontFamily: 'Poppins-Regular',
            fontSize: 13,
            color: colors.textGrey,
            marginBottom: 16,
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
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 18,
            paddingHorizontal: 20,
            backgroundColor: colors.surface,
        },
        rowBorder: {
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },
        rowContent: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            flex: 1,
        },
        rowTextContainer: {
            flex: 1,
        },
        rowTitle: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 15,
            color: colors.text,
        },
        rowDescription: {
            fontFamily: 'Poppins-Regular',
            fontSize: 12,
            color: colors.textGrey,
            marginTop: 2,
        },
        inputGroup: {
            paddingTop: 24,
            paddingBottom: 8,
            paddingHorizontal: 20,
        },
        inputLabel: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 13,
            color: colors.text,
            marginBottom: 8,
        },
        input: {
            borderWidth: 1.5,
            borderColor: colors.stroke,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontFamily: 'Poppins-Regular',
            fontSize: 15,
            color: colors.text,
            backgroundColor: colors.bgLight,
        },
        button: {
            backgroundColor: colors.primary,
            borderRadius: 99,
            paddingVertical: 16,
            alignItems: 'center',
            marginTop: 32,
            marginHorizontal: hPad,
            elevation: 3,
            shadowColor: colors.primary,
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
        },
        buttonText: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 16,
            color: '#FFFFFF',
        },
        profileAvatarContainer: {
            alignItems: 'center',
            marginTop: 32,
            marginBottom: 8,
        },
        profileAvatar: {
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: colors.primary + '20',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            borderWidth: 2,
            borderColor: colors.primary,
        },
        profileAvatarText: {
            fontFamily: 'Poppins-Bold',
            fontSize: 36,
            color: colors.primary,
        },
        editAvatarButton: {
            position: 'absolute',
            bottom: 12,
            right: -4,
            backgroundColor: colors.primary,
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: colors.surface,
        },
        langRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 16,
            paddingHorizontal: 20,
            backgroundColor: colors.surface,
        },
        langRowBorder: {
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },
        langRowContent: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
        },
        langRowFlag: {
            fontSize: 28,
        },
        langRowLabel: {
            fontFamily: 'Poppins-SemiBold',
            fontSize: 16,
            color: colors.text,
        },
        langRowSub: {
            fontFamily: 'Poppins-Regular',
            fontSize: 13,
            color: colors.textGrey,
            marginTop: 2,
        },
        langRowCheckArea: {
            width: 24,
            alignItems: 'center',
            justifyContent: 'center',
        },
    });
};

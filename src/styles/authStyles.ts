import { StyleSheet } from 'react-native';
import { createTheme } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export const useAuthStyles = () => {
    const { colors } = useTheme();
    const theme = createTheme(colors);

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: colors.bgLight,
        },
        flex: {
            flex: 1,
        },
        scrollContent: {
            flexGrow: 1,
        },
        container: {
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 32,
            paddingVertical: 24,
            width: '100%',
            maxWidth: 500,
            alignSelf: 'center',
        },

        // Branding
        brandingWrapper: {
            alignItems: 'center',
            marginBottom: 32,
        },
        brandingRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        logo: {
            width: 64,
            height: 64,
        },
        brandName: {
            color: colors.primary,
            fontSize: 36,
            lineHeight: 42,
            marginLeft: 16,
        },
        subtitle: {
            color: colors.textGrey,
            marginTop: 12,
            textAlign: 'center',
            fontSize: 16,
        },

        // Form
        form: {
            width: '100%',
        },
        fieldWrapper: {
            marginBottom: 20,
        },
        fieldLabel: {
            color: colors.primary,
            marginBottom: 8,
            marginLeft: 2,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            backgroundColor: theme.components.input.fill,
            borderRadius: theme.components.input.radius,
            borderWidth: 1.5,
            borderColor: colors.stroke,
            height: 58,
        },
        textInput: {
            flex: 1,
            marginLeft: 12,
            height: '100%',
            color: colors.text,
        },
        lockIcon: {
            paddingHorizontal: 2,
        },
        eyeButton: {
            padding: 8,
        },

        // Forgot Password
        forgotWrapper: {
            alignSelf: 'flex-end',
            marginTop: 12,
            paddingHorizontal: 4,
        },
        forgotText: {
            color: colors.secondary,
            fontSize: 13,
        },

        // Primary Button
        primaryButton: {
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 24,
            backgroundColor: theme.components.button.bg,
            borderRadius: theme.components.button.radius,
            paddingVertical: theme.components.button.paddingV,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 5,
        },
        primaryButtonText: {
            fontSize: 17,
            letterSpacing: 0.5,
            color: theme.components.button.text,
        },

        // Social Button
        socialButton: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 16,
            backgroundColor: colors.surface,
            borderRadius: theme.components.button.radius,
            paddingVertical: theme.components.button.paddingV,
            borderWidth: 1.5,
            borderColor: colors.stroke,
        },
        socialButtonText: {
            fontSize: 16,
            color: colors.text,
            marginLeft: 12,
            fontFamily: 'Poppins-Medium',
        },

        // Bottom auth link row
        authLinkRow: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: 32,
            marginBottom: 32,
        },
        authLinkPrompt: {
            color: colors.textGrey,
        },
        authLinkText: {
            color: colors.primary,
            fontFamily: 'Poppins-SemiBold',
        },
    });
};

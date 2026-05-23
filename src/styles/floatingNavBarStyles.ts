import { StyleSheet, Platform } from 'react-native';
import { createTheme } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export const useFloatingNavBarStyles = () => {
    const { colors } = useTheme();
    const theme = createTheme(colors);

    return StyleSheet.create({
        wrapper: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 140,
            justifyContent: 'flex-end',
            paddingBottom: Platform.OS === 'ios' ? 30 : 24,
        },
        gradient: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 140,
        },
        container: {
            alignSelf: 'center',
            backgroundColor: colors.surface,
            borderRadius: 40,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 22,
            paddingVertical: 18,
            shadowColor: colors.text,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 16,
            elevation: 8,
            borderWidth: 1,
            borderColor: colors.stroke,
            gap: 20,
        },
        navItem: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        icon: {
            width: 24,
            height: 24,
        },
    });
};

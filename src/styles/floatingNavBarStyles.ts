import { StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createTheme } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export const useFloatingNavBarStyles = () => {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const theme = createTheme(colors);

    // If the device has a bottom navigation bar / insets (e.g. Android 3-button navigation or iOS home indicator),
    // float above it safely with slight padding. If insets.bottom is 0 (gesture nav / no 3-button bar), use standard compact float.
    const bottomPadding = insets.bottom > 0
        ? insets.bottom + (Platform.OS === 'ios' ? 6 : 10)
        : (Platform.OS === 'ios' ? 24 : 16);

    const totalHeight = 130 + insets.bottom;

    return StyleSheet.create({
        wrapper: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: totalHeight,
            justifyContent: 'flex-end',
            paddingBottom: bottomPadding,
        },
        gradient: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: totalHeight,
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

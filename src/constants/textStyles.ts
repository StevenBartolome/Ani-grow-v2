import { StyleSheet, TextStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export const useTextStyles = () => {
    const { colors } = useTheme();

    // Base styles — extend these, don't repeat yourself
    const base: TextStyle = { color: colors.text };

    return StyleSheet.create({
        h1: { ...base, fontFamily: 'Poppins-SemiBold', fontSize: 32, color: colors.primary },
        h2: { ...base, fontFamily: 'Poppins-Medium', fontSize: 24, color: colors.primary },
        h3: { ...base, fontFamily: 'Poppins-Medium', fontSize: 18, color: colors.primary },
        appTitle: { ...base, fontFamily: 'Poppins-SemiBold', fontSize: 24, color: colors.primary },
        body: { ...base, fontFamily: 'Poppins-Regular', fontSize: 14 },
        label: { ...base, fontFamily: 'Poppins-Medium', fontSize: 14 },
        btnLabel: { ...base, fontFamily: 'Poppins-SemiBold', fontSize: 16, color: colors.onPrimary },
    });
};

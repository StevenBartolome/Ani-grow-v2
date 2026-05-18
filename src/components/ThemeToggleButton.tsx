import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggleButton() {
    const { isDark, toggleTheme, colors } = useTheme();

    return (
        <TouchableOpacity
            style={[
                styles.button, 
                { 
                    backgroundColor: colors.surface, 
                    borderColor: colors.stroke,
                    shadowColor: colors.text
                }
            ]}
            onPress={toggleTheme}
            activeOpacity={0.8}
        >
            <MaterialCommunityIcons
                name={isDark ? 'weather-night' : 'weather-sunny'}
                size={24}
                color={colors.primary}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 40 : 30,
        right: 20,
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        borderWidth: 1,
        zIndex: 9999, 
    },
});

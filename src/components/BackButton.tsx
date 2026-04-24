import React from 'react';
import { TouchableOpacity, StyleSheet, Platform, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface BackButtonProps {
    onPress: () => void;
    style?: ViewStyle;
}

export function BackButton({ onPress, style }: BackButtonProps) {
    const { colors } = useTheme();

    return (
        <TouchableOpacity
            style={[
                styles.button, 
                { 
                    backgroundColor: colors.surface, 
                    borderColor: colors.stroke,
                    shadowColor: colors.text
                },
                style
            ]}
            onPress={onPress}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <MaterialIcons
                name="arrow-back"
                size={24}
                color={colors.text}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        borderWidth: 1,
        zIndex: 99, 
    },
});

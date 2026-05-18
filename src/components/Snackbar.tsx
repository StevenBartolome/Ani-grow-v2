import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';

export type SnackbarType = 'error' | 'success' | 'info';

interface SnackbarProps {
    visible: boolean;
    message: string;
    type?: SnackbarType;
    onDismiss: () => void;
    duration?: number;
}

export default function Snackbar({
    visible,
    message,
    type = 'error',
    onDismiss,
    duration = 3000,
}: SnackbarProps) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const translateY = useRef(new Animated.Value(100)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();

            const timer = setTimeout(() => {
                hideSnackbar();
            }, duration);

            return () => clearTimeout(timer);
        } else {
            hideSnackbar();
        }
    }, [visible]);

    const hideSnackbar = () => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: 100,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            if (visible) onDismiss();
        });
    };

    const getColors = () => {
        switch (type) {
            case 'error':
                return { color: colors.error, icon: 'alert-circle' as const };
            case 'success':
                return { color: colors.primary, icon: 'check-circle' as const };
            default:
                return { color: colors.textGrey, icon: 'information' as const };
        }
    };

    const styleConfig = getColors();

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity,
                    transform: [{ translateY }],
                    backgroundColor: colors.card,
                    borderColor: colors.stroke,
                    shadowColor: colors.shadow,
                },
            ]}
        >
            <View style={[styles.iconContainer, { backgroundColor: styleConfig.color + '20' }]}>
                <MaterialCommunityIcons name={styleConfig.icon} size={24} color={styleConfig.color} />
            </View>
            <Text style={[textStyles.body, styles.message, { color: colors.text }]}>
                {message}
            </Text>
            <TouchableOpacity onPress={hideSnackbar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textGrey} />
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 6,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
        borderWidth: 1,
        zIndex: 999,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    message: {
        marginLeft: 12,
        flex: 1,
        fontFamily: 'Poppins-Medium',
        fontSize: 14,
    },
    closeButton: {
        padding: 4,
    },
});

import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    LayoutChangeEvent,
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';

export interface AnimalTypeOption {
    key: string;
    label: string;
}

interface AnimalTypePillSwitcherProps {
    selected: string;
    onSelect: (type: any) => void;
    options?: AnimalTypeOption[];
    style?: StyleProp<ViewStyle>;
}

const DEFAULT_OPTIONS: AnimalTypeOption[] = [
    { key: 'chicken', label: 'Chickens' },
    { key: 'pig', label: 'Pigs' },
];

export const AnimalTypePillSwitcher: React.FC<AnimalTypePillSwitcherProps> = ({
    selected,
    onSelect,
    options = DEFAULT_OPTIONS,
    style,
}) => {
    const { colors } = useTheme();
    const [trackWidth, setTrackWidth] = useState(0);

    const selectedIndex = options.findIndex(opt => opt.key === selected);
    const validIndex = selectedIndex >= 0 ? selectedIndex : 0;

    const slideAnim = useRef(new Animated.Value(validIndex)).current;

    useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: validIndex,
            damping: 22,
            stiffness: 240,
            mass: 0.8,
            useNativeDriver: true,
        }).start();
    }, [validIndex, slideAnim]);

    const handleTrackLayout = (e: LayoutChangeEvent) => {
        const { width } = e.nativeEvent.layout;
        setTrackWidth(width);
    };

    const count = options.length || 2;
    const tabWidth = trackWidth > 0 ? trackWidth / count : 0;

    const translateX = slideAnim.interpolate({
        inputRange: options.map((_, i) => i),
        outputRange: options.map((_, i) => i * tabWidth),
    });

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.stroke,
                },
                style,
            ]}
        >
            <View
                style={styles.track}
                onLayout={handleTrackLayout}
            >
                {/* Sliding Active Indicator Pill */}
                {tabWidth > 0 && (
                    <Animated.View
                        style={[
                            styles.activePill,
                            {
                                width: tabWidth,
                                backgroundColor: colors.primary,
                                transform: [{ translateX }],
                            },
                        ]}
                    />
                )}

                {/* Segment Buttons */}
                {options.map((option) => {
                    const isSelected = option.key === selected;
                    return (
                        <TouchableOpacity
                            key={option.key}
                            activeOpacity={0.75}
                            onPress={() => onSelect(option.key)}
                            style={styles.tabButton}
                        >
                            <Text
                                style={[
                                    styles.tabText,
                                    {
                                        color: isSelected ? colors.onPrimary : colors.textGrey,
                                        fontFamily: isSelected ? 'Poppins-SemiBold' : 'Poppins-Medium',
                                    },
                                ]}
                            >
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 999,
        borderWidth: 1,
        padding: 4,
        overflow: 'hidden',
    },
    track: {
        flexDirection: 'row',
        position: 'relative',
        alignItems: 'center',
        width: '100%',
    },
    activePill: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        borderRadius: 999,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    tabText: {
        fontSize: 13,
        textAlign: 'center',
        textTransform: 'capitalize',
    },
});

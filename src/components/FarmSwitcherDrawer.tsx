/**
 * FarmSwitcherDrawer
 *
 * A beautiful bottom-sheet style single-select farm switcher.
 * Allows quick dashboard switching from the header.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    ScrollView,
    TouchableOpacity,
    View,
    Platform,
} from 'react-native';
import { Text } from '@/components/Text';

import { ManagedFarm, useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';

interface Props {
    visible: boolean;
    onClose: () => void;
}

const PALETTE = ['#10B981', '#6C63FF', '#F97316', '#EF4444', '#3B82F6', '#F59E0B'];
const farmColor = (index: number): string => PALETTE[index % PALETTE.length];

export const FarmSwitcherDrawer: React.FC<Props> = ({ visible, onClose }) => {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const {
        managedFarms,
        selectedFarmIds,
        switchToFarm,
    } = useFarmFilter();

    // Slide-up and fade animations
    const slideAnim = useRef(new Animated.Value(400)).current;
    const fadeAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(fadeAnim,  { toValue: 0.5, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(fadeAnim,  { toValue: 0,   duration: 180, useNativeDriver: Platform.OS !== 'web' }),
            ]).start();
        }
    }, [visible]);

    const handleSwitch = (farm: ManagedFarm) => {
        // Perform quick switch
        switchToFarm(farm.id);
        // Animate closed
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(fadeAnim,  { toValue: 0,   duration: 160, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => {
            onClose();
        });
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            {/* Backdrop */}
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: '#000',
                    opacity: fadeAnim,
                }}
            >
                <Pressable style={{ flex: 1 }} onPress={onClose} />
            </Animated.View>

            {/* Drawer sheet */}
            <Animated.View
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: colors.surface,
                    borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    paddingBottom: 40,
                    transform: [{ translateY: slideAnim }],
                    ...Platform.select({
                        web: { boxShadow: '0px -6px 24px rgba(0, 0, 0, 0.15)' },
                        default: {
                            shadowColor: '#000', shadowOpacity: 0.15,
                            shadowRadius: 20, shadowOffset: { width: 0, height: -6 },
                            elevation: 24,
                        }
                    })
                }}
            >
                {/* Drag handle */}
                <View style={{
                    width: 36, height: 4, borderRadius: 2,
                    backgroundColor: colors.stroke,
                    alignSelf: 'center', marginTop: 12, marginBottom: 20,
                }} />

                {/* Header */}
                <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 24, marginBottom: 16,
                }}>
                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                            Switch Active Farm
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                            Select a farm to view its dashboard on the fly
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        activeOpacity={0.7}
                        style={{
                            width: 36, height: 36, borderRadius: 18,
                            backgroundColor: colors.cardFill,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <MaterialIcons name="close" size={18} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={{ height: 1, backgroundColor: colors.stroke, marginHorizontal: 24, marginBottom: 16 }} />

                {/* Scrollable farm list */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: 360 }}
                    contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
                >
                    {managedFarms.map((farm: ManagedFarm, index: number) => {
                        const color = farmColor(index);
                        const isActive = selectedFarmIds.length === 1 && selectedFarmIds[0] === farm.id;

                        return (
                            <Pressable
                                key={farm.id}
                                onPress={() => handleSwitch(farm)}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 14,
                                    backgroundColor: isActive ? color + '10' : colors.cardFill,
                                    borderWidth: 1.5,
                                    borderColor: isActive ? color + '45' : colors.stroke,
                                    borderRadius: 16,
                                    padding: 14,
                                    opacity: pressed ? 0.85 : 1,
                                })}
                            >
                                {/* Farm Letter Avatar */}
                                <View style={{
                                    width: 42, height: 42, borderRadius: 12,
                                    backgroundColor: color + '20',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Text style={[textStyles.h3, { color, fontSize: 18, fontFamily: 'Poppins-Bold' }]}>
                                        {farm.name.charAt(0).toUpperCase()}
                                    </Text>
                                </View>

                                {/* Farm Details */}
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-SemiBold' }]}>
                                            {farm.name}
                                        </Text>
                                        {isActive && (
                                            <View style={{
                                                backgroundColor: color + '20',
                                                borderRadius: 6,
                                                paddingHorizontal: 7, paddingVertical: 2,
                                            }}>
                                                <Text style={[textStyles.label, { color, fontSize: 9 }]}>
                                                    Active
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                                        Farm ID: {farm.id.slice(0, 12)}…
                                    </Text>
                                </View>

                                {/* Switch arrow or check icon */}
                                {isActive ? (
                                    <MaterialIcons name="check-circle" size={20} color={color} />
                                ) : (
                                    <MaterialIcons name="chevron-right" size={20} color={colors.textGrey} />
                                )}
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </Animated.View>
        </Modal>
    );
};

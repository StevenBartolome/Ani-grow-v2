/**
 * FarmFilterDrawer
 *
 * A bottom-sheet style drawer that lets a Farm Admin filter the dashboard
 * by selecting which of their farms to include.
 *
 * Usage:
 *   const [drawerOpen, setDrawerOpen] = useState(false);
 *   <FarmFilterDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
} from 'react-native';
import { Text } from '@/components/Text';

import { ManagedFarm, useFarmFilter } from '@/context/FarmFilterContext';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export const FarmFilterDrawer: React.FC<Props> = ({ visible, onClose }) => {
    const { colors }     = useTheme();
    const textStyles     = useTextStyles();
    const {
        managedFarms,
        selectedFarmIds,
        toggleFarm,
        selectAll,
        clearAll,
    } = useFarmFilter();

    // Slide-up animation
    const slideAnim = useRef(new Animated.Value(400)).current;
    const fadeAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
                Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 400, duration: 240, useNativeDriver: true }),
                Animated.timing(fadeAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    const allSelected = selectedFarmIds.length === managedFarms.length;

    // Farm performance color (placeholder — tie to real metric later)
    const farmColor = (index: number): string => {
        const palette = ['#10B981', '#6C63FF', '#F97316', '#EF4444', '#3B82F6'];
        return palette[index % palette.length];
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            {/* Backdrop */}
            <Animated.View
                style={{ flex: 1, backgroundColor: '#000', opacity: fadeAnim }}
            >
                <Pressable style={{ flex: 1 }} onPress={onClose} />
            </Animated.View>

            {/* Drawer panel */}
            <Animated.View
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: colors.surface,
                    borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    paddingBottom: 36,
                    transform: [{ translateY: slideAnim }],
                    // Shadow
                    shadowColor: '#000', shadowOpacity: 0.18,
                    shadowRadius: 24, shadowOffset: { width: 0, height: -6 },
                    elevation: 20,
                }}
            >
                {/* Handle */}
                <View style={{
                    width: 36, height: 4, borderRadius: 2,
                    backgroundColor: colors.stroke,
                    alignSelf: 'center', marginTop: 12, marginBottom: 20,
                }} />

                {/* Header */}
                <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, marginBottom: 6,
                }}>
                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                            Filter by Farm
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                            {selectedFarmIds.length} of {managedFarms.length} selected
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

                {/* Select All / Clear row */}
                <View style={{
                    flexDirection: 'row', gap: 8,
                    paddingHorizontal: 20, marginBottom: 12,
                }}>
                    <TouchableOpacity
                        onPress={selectAll}
                        activeOpacity={0.75}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            backgroundColor: allSelected ? colors.primary + '15' : colors.cardFill,
                            borderWidth: 1,
                            borderColor: allSelected ? colors.primary + '40' : colors.stroke,
                            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
                        }}
                    >
                        <MaterialIcons
                            name={allSelected ? 'check-box' : 'check-box-outline-blank'}
                            size={15}
                            color={allSelected ? colors.primary : colors.textGrey}
                        />
                        <Text style={[textStyles.label, {
                            color: allSelected ? colors.primary : colors.textGrey,
                            fontSize: 12,
                        }]}>
                            All Farms
                        </Text>
                    </TouchableOpacity>

                    {!allSelected && (
                        <TouchableOpacity
                            onPress={clearAll}
                            activeOpacity={0.75}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                backgroundColor: colors.cardFill,
                                borderWidth: 1, borderColor: colors.stroke,
                                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
                            }}
                        >
                            <MaterialIcons name="clear" size={15} color={colors.textGrey} />
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>
                                Clear
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Divider */}
                <View style={{ height: 1, backgroundColor: colors.stroke, marginHorizontal: 20, marginBottom: 12 }} />

                {/* Farm list */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: 320 }}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
                >
                    {managedFarms.map((farm: ManagedFarm, index: number) => {
                        const isSelected = selectedFarmIds.includes(farm.id);
                        const color      = farmColor(index);

                        return (
                            <Pressable
                                key={farm.id}
                                onPress={() => toggleFarm(farm.id)}
                                style={({ pressed }) => ({
                                    flexDirection: 'row', alignItems: 'center', gap: 14,
                                    backgroundColor: isSelected ? color + '0E' : colors.cardFill,
                                    borderWidth: 1.5,
                                    borderColor: isSelected ? color + '45' : colors.stroke,
                                    borderRadius: 14, padding: 14,
                                    opacity: pressed ? 0.8 : 1,
                                })}
                            >
                                {/* Color dot / farm initial */}
                                <View style={{
                                    width: 38, height: 38, borderRadius: 11,
                                    backgroundColor: color + '20',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Text style={[textStyles.h3, { color, fontSize: 15 }]}>
                                        {farm.name.charAt(0).toUpperCase()}
                                    </Text>
                                </View>

                                {/* Farm name */}
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                        {farm.name}
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 2 }]}>
                                        Farm ID: {farm.id.slice(0, 8)}…
                                    </Text>
                                </View>

                                {/* Checkbox */}
                                <View style={{
                                    width: 22, height: 22, borderRadius: 6,
                                    borderWidth: 2,
                                    borderColor: isSelected ? color : colors.stroke,
                                    backgroundColor: isSelected ? color : 'transparent',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {isSelected && (
                                        <MaterialIcons name="check" size={14} color="#FFF" />
                                    )}
                                </View>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {/* Apply button */}
                <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
                    <TouchableOpacity
                        onPress={onClose}
                        activeOpacity={0.85}
                        style={{
                            backgroundColor: colors.primary,
                            borderRadius: 16, paddingVertical: 15,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 15 }]}>
                            Apply Filter
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Modal>
    );
};

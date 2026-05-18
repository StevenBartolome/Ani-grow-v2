import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { AnimalIcon } from './AnimalIcon';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';

export interface SelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (value: string) => void;
    title: string;
    description: string;
    icon: keyof typeof MaterialIcons.glyphMap | 'pig' | 'chicken';
    options: string[];
    selectedValue: string;
    enableSearch?: boolean;
    requireConfirm?: boolean;
    isCustomIcon?: boolean;
}

export function SelectionModal({
    visible,
    onClose,
    onSelect,
    title,
    description,
    icon,
    options,
    selectedValue,
    enableSearch = false,
    requireConfirm = true,
    isCustomIcon = false,
}: SelectionModalProps) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    const [draftValue, setDraftValue] = useState(selectedValue);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (visible) {
            setDraftValue(selectedValue);
            setSearchQuery('');
        }
    }, [visible, selectedValue]);

    const filteredOptions = enableSearch
        ? options.filter(opt => opt.toLowerCase().includes(searchQuery.toLowerCase()))
        : options;

    const handleOptionPress = (val: string) => {
        if (requireConfirm) {
            setDraftValue(val);
        } else {
            onSelect(val);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>
                    <View style={{ backgroundColor: colors.primary + '1A', width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                        {isCustomIcon ? (
                            <AnimalIcon type={icon as any} size={32} color={colors.primary} />
                        ) : (
                            <MaterialIcons name={icon as any} size={32} color={colors.primary} />
                        )}
                    </View>

                    <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>{title}</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: enableSearch ? 16 : 24 }]}>{description}</Text>

                    {enableSearch && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputFill, borderRadius: 12, paddingHorizontal: 16, height: 48, marginBottom: 16, width: '100%' }}>
                            <MaterialIcons name="search" size={20} color={colors.textGrey} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[textStyles.body, { flex: 1, color: colors.text, marginBottom: 0 }]}
                                placeholder="Search..."
                                placeholderTextColor={colors.textLight}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <MaterialIcons name="close" size={18} color={colors.textGrey} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    <ScrollView 
                        style={{ width: '100%', maxHeight: 350, marginBottom: 24 }} 
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                    >
                        <View style={{ gap: 8, paddingRight: 4, paddingBottom: 4 }}>
                            {filteredOptions.length > 0 ? filteredOptions.map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={{
                                        paddingVertical: 12,
                                        paddingHorizontal: 16,
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: (requireConfirm ? draftValue : selectedValue) === option ? colors.primary : colors.stroke,
                                        backgroundColor: (requireConfirm ? draftValue : selectedValue) === option ? colors.primary + '1A' : colors.surface,
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    onPress={() => handleOptionPress(option)}
                                >
                                    <Text style={[textStyles.body, { color: (requireConfirm ? draftValue : selectedValue) === option ? colors.primary : colors.text }]}>{option}</Text>
                                    {(requireConfirm ? draftValue : selectedValue) === option && <MaterialIcons name="check" size={18} color={colors.primary} />}
                                </TouchableOpacity>
                            )) : (
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginVertical: 16 }]}>No results found.</Text>
                            )}
                        </View>
                    </ScrollView>

                    {requireConfirm ? (
                        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                            <TouchableOpacity
                                style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.primary, opacity: draftValue.trim() ? 1 : 0.5, alignItems: 'center', justifyContent: 'center' }}
                                onPress={() => { if (draftValue.trim()) { onSelect(draftValue); onClose(); } }}
                                activeOpacity={0.7}
                                disabled={!draftValue.trim()}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Update</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={{ width: '100%', height: 48, borderRadius: 24, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                            onPress={onClose}
                            activeOpacity={0.7}
                        >
                            <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Close</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

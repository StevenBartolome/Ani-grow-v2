import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
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
    enableSeeMore?: boolean;
    enableOther?: boolean;
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
    enableSeeMore = false,
    enableOther = false,
}: SelectionModalProps) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    const [draftValue, setDraftValue] = useState(selectedValue);
    const [searchQuery, setSearchQuery] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [customOtherText, setCustomOtherText] = useState('');
    const customInputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            setSearchQuery('');
            setIsExpanded(false);
            
            const isPredefined = options.includes(selectedValue);
            if (selectedValue && !isPredefined && selectedValue !== 'Other' && enableOther) {
                setDraftValue('Other');
                setCustomOtherText(selectedValue);
            } else {
                setDraftValue(selectedValue);
                setCustomOtherText('');
            }
        }
    }, [visible, selectedValue, options, enableOther]);

    const isOtherSelected = (requireConfirm ? draftValue : selectedValue) === 'Other';
    const confirmDisabled = !draftValue.trim() || (draftValue === 'Other' && !customOtherText.trim());

    const baseFiltered = enableSearch
        ? options.filter(opt => opt.toLowerCase().includes(searchQuery.toLowerCase()))
        : options;

    let finalOptions: string[] = [];
    let showSeeMoreButton = false;

    if (enableSeeMore && !searchQuery.trim()) {
        if (isExpanded) {
            finalOptions = [...baseFiltered];
        } else {
            finalOptions = baseFiltered.slice(0, 5);
            if (baseFiltered.length > 5) {
                showSeeMoreButton = true;
            }
        }
    } else {
        finalOptions = [...baseFiltered];
    }

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
                            {finalOptions.length > 0 ? finalOptions.map((option) => (
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
                                !enableOther && <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginVertical: 16 }]}>No results found.</Text>
                            )}

                            {showSeeMoreButton && (
                                <TouchableOpacity
                                    style={{
                                        paddingVertical: 12,
                                        paddingHorizontal: 16,
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        backgroundColor: colors.cardFill,
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        gap: 6
                                    }}
                                    onPress={() => setIsExpanded(true)}
                                >
                                    <MaterialIcons name="expand-more" size={18} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontFamily: 'Poppins-SemiBold' }]}>See More...</Text>
                                </TouchableOpacity>
                            )}

                            {enableOther && (
                                <TouchableOpacity
                                    style={{
                                        paddingVertical: 12,
                                        paddingHorizontal: 16,
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: isOtherSelected ? colors.primary : colors.stroke,
                                        backgroundColor: isOtherSelected ? colors.primary + '1A' : colors.surface,
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    onPress={() => handleOptionPress('Other')}
                                >
                                    <Text style={[textStyles.body, { color: isOtherSelected ? colors.primary : colors.text }]}>Other (Specify)</Text>
                                    {isOtherSelected && <MaterialIcons name="check" size={18} color={colors.primary} />}
                                </TouchableOpacity>
                            )}

                            {/* Inline custom text input when Other is selected */}
                            {enableOther && isOtherSelected && (
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderWidth: 1.5,
                                    borderColor: customOtherText.trim() ? colors.primary : colors.stroke,
                                    borderRadius: 12,
                                    paddingHorizontal: 14,
                                    height: 48,
                                    backgroundColor: colors.inputFill ?? colors.surface,
                                    marginTop: 4,
                                }}>
                                    <MaterialIcons name="edit" size={16} color={colors.textGrey} style={{ marginRight: 8 }} />
                                    <TextInput
                                        ref={customInputRef}
                                        style={[textStyles.body, { flex: 1, color: colors.text }]}
                                        placeholder="Type custom value..."
                                        placeholderTextColor={colors.textLight}
                                        value={customOtherText}
                                        onChangeText={setCustomOtherText}
                                        autoFocus
                                        returnKeyType="done"
                                    />
                                    {customOtherText.length > 0 && (
                                        <TouchableOpacity onPress={() => setCustomOtherText('')}>
                                            <MaterialIcons name="close" size={16} color={colors.textGrey} />
                                        </TouchableOpacity>
                                    )}
                                </View>
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
                                style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.primary, opacity: confirmDisabled ? 0.5 : 1, alignItems: 'center', justifyContent: 'center' }}
                                onPress={() => {
                                    if (!confirmDisabled) {
                                        const finalValue = draftValue === 'Other' ? customOtherText.trim() : draftValue;
                                        onSelect(finalValue);
                                        onClose();
                                    }
                                }}
                                activeOpacity={0.7}
                                disabled={confirmDisabled}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Okay</Text>
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

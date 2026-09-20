import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
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
    const scrollViewRef = useRef<ScrollView>(null);

    const isSearchActive = enableSearch || options.length > 5;

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

            // Auto-scroll to selected item after render
            const selectedIdx = options.indexOf(selectedValue);
            if (selectedIdx > 2) {
                setTimeout(() => {
                    scrollViewRef.current?.scrollTo({
                        y: Math.max(0, (selectedIdx - 1) * 52),
                        animated: true,
                    });
                }, 100);
            }
        }
    }, [visible, selectedValue, options, enableOther]);

    const isOtherSelected = (requireConfirm ? draftValue : selectedValue) === 'Other';
    const confirmDisabled = !draftValue.trim() || (draftValue === 'Other' && !customOtherText.trim());

    const baseFiltered = isSearchActive && searchQuery.trim()
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
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                Keyboard.dismiss();
                onClose();
            }}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => Keyboard.dismiss()}
                    style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {}}
                        style={{
                            backgroundColor: colors.surface,
                            width: '100%',
                            maxWidth: 360,
                            maxHeight: '90%',
                            padding: 24,
                            borderRadius: 24,
                            alignItems: 'center',
                            overflow: 'hidden',
                            position: 'relative',
                        }}
                    >
                        {/* Close button */}
                        <TouchableOpacity
                            style={{ position: 'absolute', top: 16, right: 16, padding: 6, zIndex: 10 }}
                            onPress={() => {
                                Keyboard.dismiss();
                                onClose();
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            activeOpacity={0.7}
                        >
                            <MaterialIcons name="close" size={22} color={colors.textGrey} />
                        </TouchableOpacity>

                        <View style={{ backgroundColor: colors.primary + '1A', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                            {isCustomIcon ? (
                                <AnimalIcon type={icon as any} size={28} color={colors.primary} />
                            ) : (
                                <MaterialIcons name={icon as any} size={28} color={colors.primary} />
                            )}
                        </View>

                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 6, fontSize: 20 }]}>{title}</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: isSearchActive ? 14 : 20 }]}>{description}</Text>

                        {isSearchActive && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputFill, borderRadius: 12, paddingHorizontal: 16, height: 48, marginBottom: 14, width: '100%' }}>
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
                            ref={scrollViewRef}
                            style={{ width: '100%', flexShrink: 1, maxHeight: 350, marginBottom: 20 }} 
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                            keyboardShouldPersistTaps="handled"
                        >
                        <View style={{ gap: 8, paddingRight: 4, paddingBottom: 4 }}>
                            {finalOptions.length > 0 ? finalOptions.map((option, index) => (
                                <TouchableOpacity
                                    key={`${option}-${index}`}
                                    style={{
                                        paddingVertical: 12,
                                        paddingHorizontal: 16,
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: (requireConfirm ? draftValue : selectedValue) === option ? colors.primary : colors.stroke,
                                        backgroundColor: (requireConfirm ? draftValue : selectedValue) === option ? colors.primary + '1A' : colors.surface,
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: 12,
                                    }}
                                    onPress={() => handleOptionPress(option)}
                                >
                                    <Text style={[textStyles.body, { color: (requireConfirm ? draftValue : selectedValue) === option ? colors.primary : colors.text, flex: 1 }]}>{option}</Text>
                                    {(requireConfirm ? draftValue : selectedValue) === option && <MaterialIcons name="check" size={18} color={colors.primary} style={{ marginLeft: 4 }} />}
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
                                onPress={() => {
                                    Keyboard.dismiss();
                                    onClose();
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.primary, opacity: confirmDisabled ? 0.5 : 1, alignItems: 'center', justifyContent: 'center' }}
                                onPress={() => {
                                    if (!confirmDisabled) {
                                        Keyboard.dismiss();
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
                            onPress={() => {
                                Keyboard.dismiss();
                                onClose();
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Close</Text>
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </KeyboardAvoidingView>
    </Modal>
);
}

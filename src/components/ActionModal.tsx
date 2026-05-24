import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';

export type ActionModalType = 'info' | 'confirmation' | 'warning';

interface ActionModalProps {
    visible: boolean;
    type: ActionModalType;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export default function ActionModal({
    visible,
    type,
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    isLoading = false
}: ActionModalProps) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    let iconName: any = 'info';
    let iconColor = colors.primary;
    let confirmBtnColor = colors.primary;

    if (type === 'warning' || type === 'confirmation') {
        iconName = type === 'warning' ? 'warning' : 'help-outline';
        iconColor = type === 'warning' ? colors.error : colors.primary;
        confirmBtnColor = type === 'warning' ? colors.error : colors.primary;
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <Pressable onPress={onCancel} style={{ flex: 1 }}>
                <View style={styles.overlay}>
                    <Pressable>
                        <View style={[
                            styles.modalContainer, 
                            { backgroundColor: colors.surface },
                            Platform.select({
                                web: {
                                    boxShadow: `0px 10px 20px ${colors.shadow || 'rgba(0,0,0,0.1)'}`,
                                },
                                default: {
                                    shadowColor: colors.shadow,
                                    shadowOpacity: 1,
                                }
                            })
                        ]}>
                            
                            {/* Icon Background */}
                            <View style={[styles.iconContainer, { backgroundColor: iconColor + '1A' }]}>
                                <MaterialIcons name={iconName} size={32} color={iconColor} />
                            </View>

                            {/* Texts */}
                            <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8 }]}>
                                {title}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                {message}
                            </Text>

                            {/* Actions - Side by Side */}
                            <View style={styles.actionContainer}>
                                {type !== 'info' && (
                                    <TouchableOpacity 
                                        style={[styles.btn, styles.btnCancel, { backgroundColor: colors.cardFill }]} 
                                        onPress={onCancel}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14, textAlign: 'center' }]}>{cancelText}</Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity 
                                    style={[styles.btn, styles.btnConfirm, { backgroundColor: confirmBtnColor, opacity: isLoading ? 0.8 : 1 }]} 
                                    onPress={onConfirm}
                                    activeOpacity={0.7}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <ActivityIndicator size="small" color={colors.onPrimary} />
                                    ) : (
                                        <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14, textAlign: 'center' }]}>{confirmText}</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                            
                        </View>
                    </Pressable>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        ...Platform.select({
            web: {
                boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.1)',
            },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 10,
            }
        })
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    actionContainer: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
        marginTop: 8,
    },
    btn: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 100, // Very oval shape
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnCancel: {
        // bg comes from inline styles
    },
    btnConfirm: {
        // bg comes from inline styles
    }
});

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';

import * as Crypto from 'expo-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import ActionModal from '@/components/ActionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function ChangePasswordScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('error');

    const showSnackbar = (message: string, type: SnackbarType = 'error') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const [isConfirmModalVisible, setConfirmModalVisible] = useState(false);

    const handleUpdatePassword = () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showSnackbar('Please complete all password fields.');
            return;
        }

        if (newPassword !== confirmPassword) {
            showSnackbar('New passwords do not match.');
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            showSnackbar('Password does not meet complexity requirements.');
            return;
        }

        setConfirmModalVisible(true);
    };

    const confirmUpdate = async () => {
        setIsLoading(true);

        try {
            // Mock UI delay to simulate API call
            await new Promise(resolve => setTimeout(resolve, 1500));

            showSnackbar('Password updated successfully!', 'success');
            setTimeout(() => {
                router.back();
            }, 1500);
        } catch (error: any) {
            console.error("Change Password Error:", error);
            showSnackbar('Failed to update password.');
        } finally {
            setIsLoading(false);
            setConfirmModalVisible(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Change Password
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Security</Text>
                        <Text style={styles.sectionDescription}>Choose a strong, unique password to protect your account.</Text>

                        <View style={[styles.card, { paddingVertical: 8 }]}>
                            <View style={styles.inputGroup}>
                                <FloatingLabelInput
                                    label="Current Password"
                                    icon="lock"
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                    isPassword
                                    backgroundColor={colors.surface}
                                />
                                <View style={{ marginTop: 0 }}>
                                    <FloatingLabelInput
                                        label="New Password"
                                        icon="lock"
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        isPassword
                                        backgroundColor={colors.surface}
                                    />
                                    <Text style={[textStyles.body, { fontSize: 12, color: colors.textGrey, marginTop: -12, marginBottom: 20, marginLeft: 4, lineHeight: 18 }]}>
                                        Passwords must have at least 8 characters and include a mix of uppercase letters, lowercase letters, numbers, and symbols.
                                    </Text>
                                </View>
                                <FloatingLabelInput
                                    label="Confirm New Password"
                                    icon="lock"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    isPassword
                                    backgroundColor={colors.surface}
                                />
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={[styles.button, isLoading && { opacity: 0.7 }]} 
                        activeOpacity={0.8} 
                        onPress={handleUpdatePassword}
                        disabled={isLoading}
                    >
                        <Text style={styles.buttonText}>{isLoading ? 'Updating...' : 'Update Password'}</Text>
                    </TouchableOpacity>

                </ScrollView>
            </View>
            
            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />

            <ActionModal
                visible={isConfirmModalVisible}
                type="confirmation"
                title="Update Password?"
                message="Are you sure you want to change your password?"
                confirmText="Update"
                cancelText="Cancel"
                onConfirm={confirmUpdate}
                onCancel={() => setConfirmModalVisible(false)}
            />
        </SafeAreaView>
    );
}

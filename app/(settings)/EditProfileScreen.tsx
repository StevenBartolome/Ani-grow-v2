import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ScrollView, TouchableOpacity, View, TextInput } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import ActionModal from '@/components/ActionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import { supabase } from '@/lib/supabase';

export default function EditProfileScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isEditingUsername, setIsEditingUsername] = useState(false);

    const { profile, refreshProfile } = useAuth();

    useEffect(() => {
        if (profile) {
            console.log('[EditProfileScreen] Loaded user profile:', {
                firstName: profile.firstName,
                lastName: profile.lastName,
                username: (profile as any).username,
                email: profile.email,
                phone: (profile as any).phone,
                phoneNumber: profile.phoneNumber
            });
            setFirstName(profile.firstName || '');
            setLastName(profile.lastName || '');
            setUsername((profile as any).username || '');
            setEmail(profile.email || '');
            setPhoneNumber(profile.phoneNumber || (profile as any).phone || '');
        }
    }, [profile]);

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

    const handleSave = () => {
        if (!firstName.trim() || !lastName.trim() || !username.trim()) {
            showSnackbar('Please complete all required details.');
            return;
        }
        
        if (firstName.trim().length < 2 || lastName.trim().length < 2) {
            showSnackbar('Names must be at least 2 characters long.');
            return;
        }

        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username.trim())) {
            showSnackbar('Username can only contain letters, numbers, and underscores.');
            return;
        }

        setConfirmModalVisible(true);
    };

    const confirmSave = async () => {
        setConfirmModalVisible(false);
        
        try {
            if (!profile?.uid) throw new Error('User session not found.');

            const currentUsername = username.trim().toLowerCase();
            
            // Check if username is already taken by another user
            const { data: existingUser, error: checkError } = await supabase
                .from('users')
                .select('id')
                .eq('username', currentUsername)
                .maybeSingle();

            if (checkError) throw checkError;
            if (existingUser && existingUser.id !== profile.uid) {
                showSnackbar('Username is already taken by another account.');
                return;
            }



            // Update user record in Supabase 'users' table (name + username only)
            // Email and phone changes go through their dedicated verification screens
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    username: currentUsername,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', profile.uid);

            if (updateError) throw updateError;

            // Trigger context refresh to sync new data immediately
            await refreshProfile();

            showSnackbar('Profile details updated successfully!', 'success');
            setTimeout(() => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/(dashboard)/HomeScreen');
                }
            }, 1500);
        } catch (error: any) {
            console.error("Error updating profile:", error);
            showSnackbar(error?.message || "Failed to update profile.", 'error');
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
                        Edit Profile
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    <View style={styles.profileAvatarContainer}>
                        <View>
                            <View style={styles.profileAvatar}>
                                <Text style={styles.profileAvatarText}>{firstName.charAt(0) || 'A'}</Text>
                            </View>
                            <TouchableOpacity style={styles.editAvatarButton} activeOpacity={0.8}>
                                <MaterialIcons name="camera-alt" size={16} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, justifyContent: 'center' }}>
                            {isEditingUsername ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.primary }}>
                                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 16, marginBottom: 4 }]}>@</Text>
                                        <TextInput 
                                            style={[
                                                textStyles.h2, 
                                                { 
                                                    color: colors.text, 
                                                    fontSize: 16, 
                                                    minWidth: 100, 
                                                    padding: 0, 
                                                    margin: 0, 
                                                    marginBottom: 4,
                                                    borderWidth: 0,
                                                    backgroundColor: 'transparent',
                                                    outlineStyle: 'none'
                                                } as any
                                            ]}
                                            value={username}
                                            onChangeText={setUsername}
                                            autoFocus
                                            onSubmitEditing={() => setIsEditingUsername(false)}
                                            autoCapitalize="none"
                                        />
                                    </View>
                                    <TouchableOpacity 
                                        style={{ marginLeft: 8 }} 
                                        activeOpacity={0.7}
                                        onPress={() => setIsEditingUsername(false)}
                                    >
                                        <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 16 }]}>@{username || 'username'}</Text>
                                    <TouchableOpacity 
                                        style={{ marginLeft: 8 }} 
                                        activeOpacity={0.7}
                                        onPress={() => setIsEditingUsername(true)}
                                    >
                                        <MaterialIcons name="edit" size={16} color={colors.textGrey} />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>

                    {/* Personal Details Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Personal Details</Text>
                        <Text style={styles.sectionDescription}>Update your basic information to stay current.</Text>

                        <View style={[styles.card, { paddingVertical: 8 }]}>
                            <View style={styles.inputGroup}>
                                <FloatingLabelInput
                                    label="First Name"
                                    icon="person"
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    autoCapitalize="words"
                                    backgroundColor={colors.surface}
                                />
                                <FloatingLabelInput
                                    label="Last Name"
                                    icon="person"
                                    value={lastName}
                                    onChangeText={setLastName}
                                    autoCapitalize="words"
                                    backgroundColor={colors.surface}
                                />
                                {/* Phone — read-only, change via dedicated screen */}
                                <View style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    borderRadius: 12, borderWidth: 1, borderColor: colors.stroke,
                                    backgroundColor: colors.cardFill,
                                    paddingHorizontal: 16, paddingVertical: 14,
                                    marginBottom: 8,
                                }}>
                                    <MaterialIcons name="phone" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.body, { fontSize: 11, color: colors.textGrey, marginBottom: 1 }]}>Phone Number</Text>
                                        <Text style={[textStyles.h3, { color: phoneNumber ? colors.text : colors.textGrey, fontSize: 14 }]} translate={false}>
                                            {phoneNumber || 'Not set'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => router.push('/(settings)/ChangePhoneScreen' as any)}
                                        style={{ backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                                    >
                                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 12 }]}>Change</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Account Information Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Account Information</Text>
                        <Text style={styles.sectionDescription}>Email changes require identity verification for security.</Text>

                        <View style={styles.card}>
                            {/* Email — read-only, change via dedicated screen */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                paddingHorizontal: 4, paddingVertical: 8, gap: 12,
                            }}>
                                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="email" size={20} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.body, { fontSize: 11, color: colors.textGrey }]}>Email Address</Text>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginTop: 1 }]} translate={false}>{email || '—'}</Text>
                                </View>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => router.push('/(settings)/ChangeEmailScreen' as any)}
                                    style={{ backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                                >
                                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 12 }]}>Change</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleSave}>
                        <Text style={styles.buttonText}>Save Changes</Text>
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
                title="Save Changes?"
                message="Are you sure you want to update your profile details?"
                confirmText="Save"
                cancelText="Cancel"
                onConfirm={confirmSave}
                onCancel={() => setConfirmModalVisible(false)}
            />
        </SafeAreaView>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

const LANGUAGES = [
  { code: 'en',  flag: '🇺🇸', label: 'English',  sub: 'International' },
  { code: 'fil', flag: '🇵🇭', label: 'Filipino', sub: 'Tagalog' },
] as const;

export default function LanguageScreen() {
    const languageStyles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors, language, setLanguage } = useTheme();
    const router = useRouter();

    const [pendingLanguage, setPendingLanguage] = useState(language);
    const [isSaving, setIsSaving]               = useState(false);

    const hasChanges = pendingLanguage !== language;

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setLanguage(pendingLanguage);
            setIsSaving(false);
            router.back();
        }, 1200); // 1.2s premium, natural transition delay
    };

    return (
        <SafeAreaView style={languageStyles.safeArea}>
            <View style={languageStyles.container}>
                {/* Header */}
                <View style={languageStyles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Language
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={languageStyles.section}>
                        <Text style={languageStyles.sectionTitle}>App Language</Text>
                        <Text style={languageStyles.sectionDescription}>
                            Choose the language you want to use throughout the app.
                        </Text>

                        <View style={languageStyles.card}>
                            {LANGUAGES.map((lang, index) => {
                                const isSelected = pendingLanguage === lang.code;
                                const isLast = index === LANGUAGES.length - 1;

                                return (
                                    <TouchableOpacity
                                        key={lang.code}
                                        activeOpacity={0.7}
                                        style={[
                                            languageStyles.langRow,
                                            !isLast && languageStyles.langRowBorder,
                                        ]}
                                        onPress={() => setPendingLanguage(lang.code)}
                                    >
                                        <View style={languageStyles.langRowContent}>
                                            <Text style={languageStyles.langRowFlag}>{lang.flag}</Text>
                                            <View>
                                                <Text
                                                    translate={false}
                                                    style={[
                                                        languageStyles.langRowLabel,
                                                        isSelected && { color: colors.primary },
                                                    ]}
                                                >
                                                    {lang.label}
                                                </Text>
                                                <Text translate={false} style={languageStyles.langRowSub}>{lang.sub}</Text>
                                            </View>
                                        </View>

                                        <View style={languageStyles.langRowCheckArea}>
                                            {isSelected && (
                                                <MaterialIcons name="check" size={24} color={colors.primary} />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </ScrollView>

                {/* Save Button */}
                <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
                    <TouchableOpacity
                        style={{
                            backgroundColor: hasChanges ? colors.primary : colors.stroke,
                            paddingVertical: 16,
                            borderRadius: 12,
                            alignItems: 'center',
                        }}
                        activeOpacity={0.8}
                        onPress={handleSave}
                        disabled={!hasChanges}
                    >
                        <Text translate={false} style={[textStyles.btnLabel, { color: hasChanges ? '#FFFFFF' : colors.textGrey }]}>
                            Save Changes
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isSaving && (
                <View
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9999,
                    }}
                >
                    <View
                        style={{
                            backgroundColor: colors.surface,
                            padding: 28,
                            borderRadius: 20,
                            alignItems: 'center',
                            gap: 16,
                            width: '80%',
                            maxWidth: 320,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            ...Platform.select({
                                web: { boxShadow: '0px 10px 25px rgba(0, 0, 0, 0.25)' },
                                default: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 8 },
                                    shadowOpacity: 0.25,
                                    shadowRadius: 16,
                                    elevation: 12,
                                },
                            }),
                        }}
                    >
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text
                            translate={false}
                            style={[
                                textStyles.body,
                                {
                                    color: colors.text,
                                    fontSize: 14,
                                    fontFamily: 'Poppins-Medium',
                                    textAlign: 'center',
                                },
                            ]}
                        >
                            {pendingLanguage === 'fil'
                                ? 'Binabago ang wika...'
                                : 'Changing language...'}
                        </Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
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

    const hasChanges = pendingLanguage !== language;

    const handleSave = () => {
        setLanguage(pendingLanguage);
        router.back();
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
        </SafeAreaView>
    );
}

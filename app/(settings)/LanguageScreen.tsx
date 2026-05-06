import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

export default function LanguageScreen() {
    const languageStyles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();

    const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'fil'>('en');

    return (
        <SafeAreaView style={languageStyles.safeArea}>
            <View style={languageStyles.container}>
                {/* Header */}
                <View style={languageStyles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton onPress={() => router.back()} />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Language
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Content */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    <View style={languageStyles.section}>
                        <Text style={languageStyles.sectionTitle}>App Language</Text>
                        <Text style={languageStyles.sectionDescription}>Choose the language you want to use throughout the app.</Text>

                        <View style={languageStyles.card}>
                            {([
                                { code: 'en', flag: '🇺🇸', label: 'English', sub: 'International' },
                                { code: 'fil', flag: '🇵🇭', label: 'Filipino', sub: 'Tagalog' },
                            ] as const).map((lang, index, array) => {
                                const isSelected = selectedLanguage === lang.code;
                                const isLast = index === array.length - 1;
                                
                                return (
                                    <TouchableOpacity
                                        key={lang.code}
                                        activeOpacity={0.7}
                                        style={[
                                            languageStyles.langRow,
                                            !isLast && languageStyles.langRowBorder
                                        ]}
                                        onPress={() => setSelectedLanguage(lang.code)}
                                    >
                                        <View style={languageStyles.langRowContent}>
                                            <Text style={languageStyles.langRowFlag}>{lang.flag}</Text>
                                            <View>
                                                <Text style={[
                                                    languageStyles.langRowLabel,
                                                    isSelected && { color: colors.primary },
                                                ]}>{lang.label}</Text>
                                                <Text style={languageStyles.langRowSub}>{lang.sub}</Text>
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
            </View>
        </SafeAreaView>
    );
}

import React, { useState, useRef, useMemo } from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/Text';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { getManualHtmlWithAnchors, openUserManual } from '@/lib/userManual';

interface ManualCategory {
    id: string;
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    sectionId: string;
}

export default function UserManualScreen() {
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const { colors, language } = useTheme();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const isFilipino = language === 'fil';

    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isPageLoading, setIsPageLoading] = useState(true);

    const webViewRef = useRef<WebView>(null);
    const iframeRef = useRef<any>(null);

    const categories: ManualCategory[] = useMemo(() => [
        { id: 'all', label: isFilipino ? 'Lahat ng Pahina' : 'All Pages', icon: 'auto-stories', sectionId: 'sec-cover' },
        { id: 'overview', label: isFilipino ? 'Pangkalahatan' : 'Overview', icon: 'menu-book', sectionId: 'sec-cover' },
        { id: 'hardware', label: isFilipino ? '1.0 Hardware' : '1.0 Hardware', icon: 'memory', sectionId: 'sec-hardware' },
        { id: 'wifi', label: isFilipino ? '2.0 Wi-Fi' : '2.0 Wi-Fi Setup', icon: 'wifi', sectionId: 'sec-wifi' },
        { id: 'anifeed', label: isFilipino ? '3.0 Pagpapakain' : '3.0 AniFeed', icon: 'restaurant', sectionId: 'sec-anifeed' },
        { id: 'aniweigh', label: isFilipino ? '4.0 Pagtitimbang' : '4.0 AniWeigh', icon: 'scale', sectionId: 'sec-aniweigh' },
        { id: 'troubleshoot', label: isFilipino ? '5.0 Pag-aayos' : '5.0 Troubleshooting', icon: 'help-outline', sectionId: 'sec-troubleshoot' },
    ], [isFilipino]);

    const manualHtml = useMemo(() => getManualHtmlWithAnchors(language), [language]);

    const handleSelectCategory = (cat: ManualCategory) => {
        setActiveCategory(cat.id);

        if (Platform.OS === 'web') {
            try {
                if (iframeRef.current && iframeRef.current.contentWindow) {
                    iframeRef.current.contentWindow.postMessage(
                        JSON.stringify({ type: 'SCROLL_TO', sectionId: cat.sectionId }),
                        '*'
                    );
                }
            } catch (e) {
                console.warn('[UserManual] Web scroll failed:', e);
            }
        } else {
            const js = `
                (function() {
                    try {
                        var targetId = '${cat.sectionId}';
                        if ('${cat.id}' === 'all' || targetId === 'sec-cover') {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        } else {
                            var el = document.getElementById(targetId);
                            if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }
                    } catch(err) {}
                })();
                true;
            `;
            webViewRef.current?.injectJavaScript(js);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await openUserManual(language);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <View style={[styles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.stroke, backgroundColor: colors.surface }]}>
                <View style={styles.headerSide}>
                    <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                </View>

                <View style={styles.headerTitleContainer}>
                    <Text style={[textStyles.h1, styles.headerTitle, { color: colors.primary }]}>
                        {isFilipino ? 'Gabay sa Paggamit' : 'User Manual'}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textGrey }]}>
                        {isFilipino ? 'Opisyal na Gabay sa Hardware at Software' : 'Official Hardware & Software Guide'}
                    </Text>
                </View>

                <View style={styles.headerSideRight}>
                    <TouchableOpacity
                        style={[styles.exportButton, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}
                        activeOpacity={0.7}
                        onPress={handleExport}
                        disabled={isExporting}
                        accessibilityLabel="Download or share PDF manual"
                    >
                        {isExporting ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <MaterialIcons name="picture-as-pdf" size={20} color={colors.primary} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Category Navigation Pills Bar */}
            <View style={[styles.categoriesContainer, { backgroundColor: colors.surface, borderBottomColor: colors.stroke }]}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoriesScrollContent}
                >
                    {categories.map((cat) => {
                        const isActive = activeCategory === cat.id;
                        return (
                            <TouchableOpacity
                                key={cat.id}
                                style={[
                                    styles.categoryPill,
                                    {
                                        backgroundColor: isActive ? colors.primary : colors.bgLight,
                                        borderColor: isActive ? colors.primary : colors.stroke,
                                    },
                                ]}
                                activeOpacity={0.75}
                                onPress={() => handleSelectCategory(cat)}
                            >
                                <MaterialIcons
                                    name={cat.icon}
                                    size={16}
                                    color={isActive ? '#FFFFFF' : colors.textGrey}
                                    style={styles.categoryIcon}
                                />
                                <Text
                                    style={[
                                        styles.categoryText,
                                        {
                                            color: isActive ? '#FFFFFF' : colors.text,
                                            fontFamily: isActive ? 'Poppins-SemiBold' : 'Poppins-Medium',
                                        },
                                    ]}
                                >
                                    {cat.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* In-App Reader Container */}
            <View style={styles.readerContainer}>
                {Platform.OS === 'web' ? (
                    <iframe
                        ref={iframeRef}
                        title="Ani-Grow User Manual"
                        srcDoc={manualHtml}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            backgroundColor: '#f1f5f9',
                        }}
                    />
                ) : (
                    <>
                        <WebView
                            ref={webViewRef}
                            originWhitelist={['*']}
                            source={{ html: manualHtml }}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                            showsVerticalScrollIndicator={true}
                            showsHorizontalScrollIndicator={false}
                            onLoadStart={() => setIsPageLoading(true)}
                            onLoadEnd={() => setIsPageLoading(false)}
                            style={styles.webView}
                            containerStyle={styles.webViewWrapper}
                        />

                        {isPageLoading && (
                            <View style={[styles.loadingOverlay, { backgroundColor: colors.bgLight }]}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[textStyles.body, styles.loadingText, { color: colors.textGrey }]}>
                                    Loading User Manual...
                                </Text>
                            </View>
                        )}
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerSide: {
        width: 40,
        height: 40,
        justifyContent: 'center',
    },
    headerSideRight: {
        width: 40,
        height: 40,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontFamily: 'Poppins-Bold',
        textAlign: 'center',
        lineHeight: 22,
    },
    headerSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
        marginTop: -2,
    },
    exportButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoriesContainer: {
        borderBottomWidth: 1,
        paddingVertical: 10,
    },
    categoriesScrollContent: {
        paddingHorizontal: 16,
        gap: 8,
        alignItems: 'center',
    },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    categoryIcon: {
        marginRight: 6,
    },
    categoryText: {
        fontSize: 12,
    },
    readerContainer: {
        flex: 1,
        position: 'relative',
        backgroundColor: '#cbd5e1',
    },
    webViewWrapper: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    webView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        zIndex: 10,
    },
    loadingText: {
        fontSize: 13,
        fontFamily: 'Poppins-Medium',
    },
});

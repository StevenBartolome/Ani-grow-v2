import React from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';
import { WebView } from 'react-native-webview';

interface ReportPreviewModalProps {
    visible: boolean;
    html: string;
    title?: string;
    onClose: () => void;
    onPrint: () => void;
    isPrinting?: boolean;
}

export function ReportPreviewModal({
    visible,
    html,
    title = 'Document Preview',
    onClose,
    onPrint,
    isPrinting = false,
}: ReportPreviewModalProps) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: '#F3F4F6', paddingTop: insets.top }]}>
                {/* Header Bar */}
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.stroke }]}>
                    <TouchableOpacity
                        onPress={onClose}
                        style={[styles.headerBtn, { backgroundColor: colors.bgLight }]}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="close" size={20} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.titleContainer}>
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                            {title}
                        </Text>
                        <Text style={[styles.headerSub, { color: colors.textGrey }]}>
                            Print Layout Preview (A4)
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={onPrint}
                        disabled={isPrinting}
                        style={[styles.printBtn, { backgroundColor: colors.primary }]}
                        activeOpacity={0.7}
                    >
                        {isPrinting ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <MaterialIcons name="print" size={18} color="#FFFFFF" />
                                <Text style={styles.printBtnText}>Print</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Document View Body */}
                <View style={styles.body}>
                    {Platform.OS === 'web' ? (
                        <iframe
                            srcDoc={html}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                backgroundColor: '#FFFFFF',
                            }}
                            title="Report Preview"
                        />
                    ) : (
                        <WebView
                            originWhitelist={['*']}
                            source={{ html }}
                            style={styles.webView}
                            scalesPageToFit={true}
                            startInLoadingState={true}
                            renderLoading={() => (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                    <Text style={[styles.loadingText, { color: colors.textGrey }]}>
                                        Rendering document preview...
                                    </Text>
                                </View>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        zIndex: 10,
    },
    headerBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
        paddingHorizontal: 12,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 15,
        fontFamily: 'Poppins-Bold',
        fontWeight: 'bold',
    },
    headerSub: {
        fontSize: 11,
        fontFamily: 'Poppins-Regular',
    },
    printBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
    },
    printBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontFamily: 'Poppins-Bold',
        fontWeight: 'bold',
    },
    body: {
        flex: 1,
        backgroundColor: '#E5E7EB',
    },
    webView: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        zIndex: 2,
    },
    loadingText: {
        marginTop: 10,
        fontSize: 12,
        fontFamily: 'Poppins-Medium',
    },
});

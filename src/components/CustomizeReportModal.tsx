import React, { useState, useEffect, useMemo } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';
import { ReportDocument, ReportExportOptions, buildReportHtml } from '@/lib/pdfReport';
import { ReportPreviewModal } from '@/components/ReportPreviewModal';

interface CustomizeReportModalProps {
    visible: boolean;
    document: ReportDocument | null;
    onClose: () => void;
    onExport: (options: ReportExportOptions) => void | Promise<void>;
    isExporting: boolean;
}

export function CustomizeReportModal({
    visible,
    document,
    onClose,
    onExport,
    isExporting,
}: CustomizeReportModalProps) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    const [includeSummary, setIncludeSummary] = useState(true);
    const [includeMeta, setIncludeMeta] = useState(true);
    const [includeCharts, setIncludeCharts] = useState(true);
    const [includeSignatures, setIncludeSignatures] = useState(true);
    const [selectedSections, setSelectedSections] = useState<string[]>([]);

    // Preview Modal state
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');

    // Detect if the document contains any visual charts
    const hasAnyCharts = useMemo(() => {
        if (!document) return false;
        if (document.charts && document.charts.length > 0) return true;
        return document.sections.some(s => !!s.chart);
    }, [document]);

    // Count how many charts exist in total
    const chartCount = useMemo(() => {
        if (!document) return 0;
        let count = (document.charts || []).length;
        document.sections.forEach(s => {
            if (s.chart) count++;
        });
        return count;
    }, [document]);

    // Reset / initialize options whenever a new document is passed or modal opens
    useEffect(() => {
        if (document && visible) {
            setIncludeSummary(true);
            setIncludeMeta(true);
            setIncludeCharts(true);
            setIncludeSignatures(true);
            setSelectedSections(document.sections.map(s => s.heading));
        }
    }, [document, visible]);

    const handleToggleSection = (heading: string) => {
        if (Platform.OS !== 'web') {
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (_) {}
        }
        setSelectedSections(prev => {
            if (prev.includes(heading)) {
                return prev.filter(h => h !== heading);
            }
            return [...prev, heading];
        });
    };

    const handleSelectAll = () => {
        if (Platform.OS !== 'web') {
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (_) {}
        }
        if (!document) return;
        setIncludeSummary(true);
        setIncludeMeta(true);
        setIncludeCharts(true);
        setIncludeSignatures(true);
        setSelectedSections(document.sections.map(s => s.heading));
    };

    const handleDeselectAll = () => {
        if (Platform.OS !== 'web') {
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (_) {}
        }
        setIncludeSummary(false);
        setIncludeMeta(false);
        setIncludeCharts(false);
        setIncludeSignatures(false);
        setSelectedSections([]);
    };

    const currentExportOptions: ReportExportOptions = {
        includeSummary,
        includeMeta,
        includeCharts,
        includeSignatures,
        selectedSectionHeadings: selectedSections,
    };

    const handleOpenPreview = () => {
        if (!document) return;
        if (Platform.OS !== 'web') {
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (_) {}
        }
        const html = buildReportHtml(document, currentExportOptions);
        setPreviewHtml(html);
        setPreviewVisible(true);
    };

    const handleExport = () => {
        if (isExporting || !document) return;
        if (Platform.OS !== 'web') {
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (_) {}
        }
        onExport(currentExportOptions);
    };

    if (!document) return null;

    const allSectionsCount = document.sections.length;
    const selectedSectionsCount = selectedSections.length;

    return (
        <>
            <Modal
                visible={visible && !previewVisible}
                transparent
                animationType="fade"
                onRequestClose={isExporting ? undefined : onClose}
            >
                <View style={styles.backdrop}>
                    <View
                        style={[
                            styles.sheetContainer,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.stroke,
                                maxHeight: '90%',
                                paddingBottom: Math.max(insets.bottom, 16),
                            },
                        ]}
                    >
                        {/* Header */}
                        <View style={[styles.headerRow, { borderBottomColor: colors.stroke }]}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                    <MaterialIcons name="tune" size={20} color={colors.primary} />
                                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                                        Customize Report
                                    </Text>
                                </View>
                                <Text style={[styles.headerSubtitle, { color: colors.textGrey }]} numberOfLines={1}>
                                    {document.reportTitle}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={onClose}
                                disabled={isExporting}
                                style={[styles.closeButton, { backgroundColor: colors.bgLight }]}
                            >
                                <MaterialIcons name="close" size={20} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Quick Selection Toolbar */}
                        <View style={[styles.quickBar, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                            <Text style={[styles.quickBarText, { color: colors.textGrey }]}>
                                {selectedSectionsCount} of {allSectionsCount} sections selected
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity
                                    onPress={handleSelectAll}
                                    disabled={isExporting}
                                    style={[styles.quickActionChip, { backgroundColor: colors.primary + '18' }]}
                                >
                                    <Text style={[styles.quickActionText, { color: colors.primary }]}>Select All</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleDeselectAll}
                                    disabled={isExporting}
                                    style={[styles.quickActionChip, { backgroundColor: colors.surface, borderColor: colors.stroke, borderWidth: 1 }]}
                                >
                                    <Text style={[styles.quickActionText, { color: colors.textGrey }]}>Clear All</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Checklist Content */}
                        <ScrollView
                            showsVerticalScrollIndicator={true}
                            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 14 }}
                        >
                            {/* Core Document Elements */}
                            <View style={styles.groupContainer}>
                                <Text style={[styles.groupTitle, { color: colors.textGrey }]}>
                                    CORE REPORT MODULES
                                </Text>

                                {/* Executive Summary */}
                                {document.summaryText ? (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setIncludeSummary(v => !v)}
                                        style={[
                                            styles.itemRow,
                                            {
                                                backgroundColor: includeSummary ? colors.primary + '0D' : colors.bgLight,
                                                borderColor: includeSummary ? colors.primary + '40' : colors.stroke,
                                            },
                                        ]}
                                    >
                                        <View style={[styles.checkbox, { borderColor: includeSummary ? colors.primary : colors.stroke, backgroundColor: includeSummary ? colors.primary : 'transparent' }]}>
                                            {includeSummary && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={[styles.itemLabel, { color: colors.text }]}>Executive Summary & Narrative</Text>
                                            <Text style={[styles.itemSub, { color: colors.textGrey }]}>Analytical insights and performance overview</Text>
                                        </View>
                                        <MaterialIcons name="short-text" size={20} color={colors.textGrey} />
                                    </TouchableOpacity>
                                ) : null}

                                {/* Facility Specifications */}
                                {document.meta && document.meta.length > 0 ? (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setIncludeMeta(v => !v)}
                                        style={[
                                            styles.itemRow,
                                            {
                                                backgroundColor: includeMeta ? colors.primary + '0D' : colors.bgLight,
                                                borderColor: includeMeta ? colors.primary + '40' : colors.stroke,
                                            },
                                        ]}
                                    >
                                        <View style={[styles.checkbox, { borderColor: includeMeta ? colors.primary : colors.stroke, backgroundColor: includeMeta ? colors.primary : 'transparent' }]}>
                                            {includeMeta && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={[styles.itemLabel, { color: colors.text }]}>Facility & Document Specifications</Text>
                                            <Text style={[styles.itemSub, { color: colors.textGrey }]}>Batch ID, species, dates, housing, and operational telemetry</Text>
                                        </View>
                                        <MaterialIcons name="info-outline" size={20} color={colors.textGrey} />
                                    </TouchableOpacity>
                                ) : null}

                                {/* Visual Charts */}
                                {hasAnyCharts ? (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setIncludeCharts(v => !v)}
                                        style={[
                                            styles.itemRow,
                                            {
                                                backgroundColor: includeCharts ? colors.primary + '0D' : colors.bgLight,
                                                borderColor: includeCharts ? colors.primary + '40' : colors.stroke,
                                            },
                                        ]}
                                    >
                                        <View style={[styles.checkbox, { borderColor: includeCharts ? colors.primary : colors.stroke, backgroundColor: includeCharts ? colors.primary : 'transparent' }]}>
                                            {includeCharts && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={[styles.itemLabel, { color: colors.text }]}>Visual Data Charts</Text>
                                                <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                                                    <Text style={[styles.badgeText, { color: colors.primary }]}>{chartCount} Graph{chartCount === 1 ? '' : 's'}</Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.itemSub, { color: colors.textGrey }]}>Vector growth curves and distribution charts</Text>
                                        </View>
                                        <MaterialIcons name="insert-chart-outlined" size={20} color={colors.primary} />
                                    </TouchableOpacity>
                                ) : null}

                                {/* Signatures & Certification Block */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setIncludeSignatures(v => !v)}
                                    style={[
                                        styles.itemRow,
                                        {
                                            backgroundColor: includeSignatures ? colors.primary + '0D' : colors.bgLight,
                                            borderColor: includeSignatures ? colors.primary + '40' : colors.stroke,
                                        },
                                    ]}
                                >
                                    <View style={[styles.checkbox, { borderColor: includeSignatures ? colors.primary : colors.stroke, backgroundColor: includeSignatures ? colors.primary : 'transparent' }]}>
                                        {includeSignatures && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={[styles.itemLabel, { color: colors.text }]}>Document Authorization & Sign-Off</Text>
                                        <Text style={[styles.itemSub, { color: colors.textGrey }]}>Official certification, review, and signature lines</Text>
                                    </View>
                                    <MaterialIcons name="draw" size={20} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>

                            {/* Report Sections Checklist */}
                            {document.sections && document.sections.length > 0 ? (
                                <View style={styles.groupContainer}>
                                    <Text style={[styles.groupTitle, { color: colors.textGrey }]}>
                                        REPORT SECTIONS & TABLES
                                    </Text>

                                    {document.sections.map((section, idx) => {
                                        const isSelected = selectedSections.includes(section.heading);
                                        const hasTable = !!section.table;
                                        const hasStats = !!section.stats && section.stats.length > 0;
                                        const hasSectionChart = !!section.chart;

                                        return (
                                            <TouchableOpacity
                                                key={section.heading + idx}
                                                activeOpacity={0.7}
                                                onPress={() => handleToggleSection(section.heading)}
                                                style={[
                                                    styles.itemRow,
                                                    {
                                                        backgroundColor: isSelected ? colors.primary + '0D' : colors.bgLight,
                                                        borderColor: isSelected ? colors.primary + '40' : colors.stroke,
                                                    },
                                                ]}
                                            >
                                                <View style={[styles.checkbox, { borderColor: isSelected ? colors.primary : colors.stroke, backgroundColor: isSelected ? colors.primary : 'transparent' }]}>
                                                    {isSelected && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                                                </View>
                                                <View style={{ flex: 1, marginLeft: 10 }}>
                                                    <Text style={[styles.itemLabel, { color: colors.text }]}>
                                                        {`${idx + 1}.0 ${section.heading}`}
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                        {hasStats && (
                                                            <Text style={[styles.chipTag, { color: colors.textGrey }]}>
                                                                {section.stats!.length} KPI metrics
                                                            </Text>
                                                        )}
                                                        {hasTable && (
                                                            <Text style={[styles.chipTag, { color: colors.textGrey }]}>
                                                                Data table ({section.table!.rows.length} rows)
                                                            </Text>
                                                        )}
                                                        {hasSectionChart && (
                                                            <Text style={[styles.chipTag, { color: colors.primary }]}>
                                                                Chart included
                                                            </Text>
                                                        )}
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </ScrollView>

                        {/* Bottom Action Footer */}
                        <View style={[styles.footerRow, { borderTopColor: colors.stroke, backgroundColor: colors.surface }]}>
                            <TouchableOpacity
                                onPress={handleOpenPreview}
                                disabled={isExporting || (!includeSummary && !includeMeta && selectedSections.length === 0)}
                                style={[
                                    styles.previewBtn,
                                    {
                                        borderColor: colors.primary,
                                        backgroundColor: colors.primary + '12',
                                        opacity: (!includeSummary && !includeMeta && selectedSections.length === 0) ? 0.5 : 1,
                                    },
                                ]}
                            >
                                <MaterialIcons name="visibility" size={18} color={colors.primary} />
                                <Text style={[styles.previewBtnText, { color: colors.primary }]}>Preview</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleExport}
                                disabled={isExporting || (!includeSummary && !includeMeta && selectedSections.length === 0)}
                                style={[
                                    styles.exportBtn,
                                    {
                                        backgroundColor: colors.primary,
                                        opacity: isExporting || (!includeSummary && !includeMeta && selectedSections.length === 0) ? 0.6 : 1,
                                    },
                                ]}
                            >
                                {isExporting ? (
                                    <>
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                        <Text style={styles.exportBtnText}>Printing...</Text>
                                    </>
                                ) : (
                                    <>
                                        <MaterialIcons name="print" size={18} color="#FFFFFF" />
                                        <Text style={styles.exportBtnText}>Print / Export</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Quick Document Preview Modal */}
            <ReportPreviewModal
                visible={previewVisible}
                html={previewHtml}
                title={document.reportTitle}
                onClose={() => setPreviewVisible(false)}
                onPrint={async () => {
                    setPreviewVisible(false);
                    handleExport();
                }}
                isPrinting={isExporting}
            />
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        overflow: 'hidden',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 14,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: 'bold',
        fontFamily: 'Poppins-Bold',
    },
    headerSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins-Regular',
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    quickBarText: {
        fontSize: 12,
        fontFamily: 'Poppins-Medium',
    },
    quickActionChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    quickActionText: {
        fontSize: 11,
        fontFamily: 'Poppins-SemiBold',
        fontWeight: '600',
    },
    groupContainer: {
        gap: 8,
    },
    groupTitle: {
        fontSize: 11,
        fontFamily: 'Poppins-Bold',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemLabel: {
        fontSize: 13,
        fontFamily: 'Poppins-SemiBold',
        fontWeight: '600',
    },
    itemSub: {
        fontSize: 11,
        fontFamily: 'Poppins-Regular',
        marginTop: 1,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 10,
        fontFamily: 'Poppins-Bold',
        fontWeight: 'bold',
    },
    chipTag: {
        fontSize: 10.5,
        fontFamily: 'Poppins-Medium',
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 18,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    previewBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1.5,
    },
    previewBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins-SemiBold',
        fontWeight: '600',
    },
    exportBtn: {
        flex: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 14,
    },
    exportBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Poppins-Bold',
        fontWeight: 'bold',
    },
});

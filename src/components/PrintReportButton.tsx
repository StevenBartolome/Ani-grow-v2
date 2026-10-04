// Reusable "Export PDF" header button for every report screen. Drop-in
// replacement for the empty right-side spacer View next to BackButton in
// each report screen's header row — keeps the print action consistent
// everywhere with an interactive checklist modal on what to include.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { exportReportPdf, ReportDocument, ReportExportOptions } from '@/lib/pdfReport';
import { CustomizeReportModal } from '@/components/CustomizeReportModal';

interface PrintReportButtonProps {
    /** Builds the report document at tap-time from the screen's already-computed
     *  state. Return null when there's nothing meaningful to export yet (e.g. no
     *  batch selected, or zero recorded data) — the button will tell the user
     *  instead of generating an empty PDF. */
    buildReport: () => ReportDocument | null;
    /** Message shown when buildReport() returns null. */
    emptyMessage?: string;
    /** Called after a successful export — e.g. to show the screen's own snackbar. */
    onExported?: () => void;
    disabled?: boolean;
}

export function PrintReportButton({ buildReport, emptyMessage, onExported, disabled }: PrintReportButtonProps) {
    const { colors } = useTheme();
    const [isExporting, setIsExporting] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [pendingDoc, setPendingDoc] = useState<ReportDocument | null>(null);

    const handlePress = () => {
        if (disabled || isExporting) return;
        const doc = buildReport();
        if (!doc) {
            Alert.alert('Nothing to Export', emptyMessage || 'Select a batch or date range with recorded data first.');
            return;
        }
        setPendingDoc(doc);
        setModalVisible(true);
    };

    const handleExportWithOptions = async (options: ReportExportOptions) => {
        if (!pendingDoc) return;
        setIsExporting(true);
        const result = await exportReportPdf(pendingDoc, options);
        setIsExporting(false);
        if (!result.ok) {
            Alert.alert('Export Failed', result.error || 'Could not generate the PDF. Please try again.');
        } else {
            setModalVisible(false);
            setPendingDoc(null);
            onExported?.();
        }
    };

    return (
        <View>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePress}
                disabled={disabled || isExporting}
                style={{
                    width: 44, height: 44, borderRadius: 22,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.primary + '14',
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                {isExporting
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <MaterialIcons name="print" size={22} color={colors.primary} />}
            </TouchableOpacity>

            <CustomizeReportModal
                visible={modalVisible}
                document={pendingDoc}
                onClose={() => {
                    if (!isExporting) {
                        setModalVisible(false);
                        setPendingDoc(null);
                    }
                }}
                onExport={handleExportWithOptions}
                isExporting={isExporting}
            />
        </View>
    );
}


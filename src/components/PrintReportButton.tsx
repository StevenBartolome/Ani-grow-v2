// Reusable "Export PDF" header button for every report screen. Drop-in
// replacement for the empty right-side spacer View next to BackButton in
// each report screen's header row — keeps the print action consistent
// everywhere instead of a one-off per screen.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { exportReportPdf, ReportDocument } from '@/lib/pdfReport';

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

    const handlePress = async () => {
        if (disabled || isExporting) return;
        const doc = buildReport();
        if (!doc) {
            Alert.alert('Nothing to Export', emptyMessage || 'Select a batch or date range with recorded data first.');
            return;
        }
        setIsExporting(true);
        const result = await exportReportPdf(doc);
        setIsExporting(false);
        if (!result.ok) {
            Alert.alert('Export Failed', result.error || 'Could not generate the PDF. Please try again.');
        } else {
            onExported?.();
        }
    };

    return (
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
                : <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />}
        </TouchableOpacity>
    );
}

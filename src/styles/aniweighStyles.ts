import { StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/** Mirrors homeStyles responsive padding */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useAniWeighStyles = () => {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: colors.bgLight,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 16,
        },
        headerActions: {
            flexDirection: 'row',
            gap: 12,
        },
        actionButton: {
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
        },
        contentContainer: {
            paddingHorizontal: hPad,
            paddingBottom: 40,
        },
        // ─── Shared Date Picker / Title ──────────────────────────
        titleSection: {
            marginTop: 16,
            marginBottom: 24,
        },
        connectionBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
        },
        connectionDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
        },
        tagsContainer: {
            flexDirection: 'row',
            marginTop: 12,
            gap: 8,
        },
        tag: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
        },
        datePickerContainer: {
            paddingHorizontal: hPad,
            marginBottom: 20,
        },
        datePickerButton: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 16,
            borderWidth: 1,
            backgroundColor: colors.surface,
            borderColor: colors.stroke,
        },
        
        // ─── Shared Stats Card ──────────────────────────────────────
        statsCard: {
            borderRadius: 20,
            borderWidth: 1.5,
            marginBottom: 16, // SegregationRecords uses 16, AniWeighScreen uses 32 natively but we can override or use 16 as base
            backgroundColor: colors.surface,
            borderColor: colors.stroke,
        },
        statsCardLargeBottomMargin: {
            marginBottom: 32,
        },
        statsHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 20,
        },
        statsExpandedContent: {
            padding: 20,
            paddingTop: 0,
            borderTopWidth: 1,
            borderTopColor: colors.stroke,
            marginTop: 4,
        },
        statsVisualBar: {
            flexDirection: 'row',
            height: 12,
            marginTop: 20,
            marginBottom: 24,
            backgroundColor: colors.cardFill,
            borderRadius: 8,
        },
        statsVisualSegment: {
            height: '100%',
        },
        statDetailRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
        },
        statLegend: {
            flexDirection: 'row',
            alignItems: 'flex-start',
        },
        legendDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            marginTop: 4,
            marginRight: 8,
        },
        recordsLink: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: colors.stroke,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
        },

        // ─── AniWeigh Live Scaling Section ──────────────────────────
        liveSection: {
            marginBottom: 24,
        },
        liveCard: {
            borderRadius: 24,
            borderWidth: 1.5,
            padding: 32,
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderColor: colors.stroke,
        },
        liveScaleCircle: {
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: colors.card,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 12,
            elevation: 2,
            marginBottom: 16,
        },
        unitToggle: {
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderRadius: 20,
            marginBottom: 32,
            overflow: 'hidden',
            backgroundColor: colors.bgLight,
            borderColor: colors.stroke,
        },
        liveScaleInnerCircle: {
            width: 156,
            height: 156,
            borderRadius: 78,
            backgroundColor: colors.surface,
            borderWidth: 6,
            alignItems: 'center',
            justifyContent: 'center',
        },
        liveStatsContainer: {
            flexDirection: 'row',
            width: '100%',
            justifyContent: 'space-around',
            alignItems: 'center',
        },
        liveStatItem: {
            alignItems: 'center',
        },
        liveStatDivider: {
            width: 1,
            height: 30,
            backgroundColor: colors.stroke,
        },

        // ─── Logs Section ──────────────────────────────────────────
        logsSection: {
            marginTop: 8,
        },
        logItem: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginBottom: 16,
        },
        logIcon: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
        },
        logContent: {
            flex: 1,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },

        // ─── Modal Overlays ────────────────────────────────────────
        modalOverlay: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
        },
        modalContent: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 1,
            shadowRadius: 20,
            elevation: 10,
            backgroundColor: colors.surface, 
            width: '100%',
            maxWidth: 340, 
            padding: 24, 
            borderRadius: 24, 
            alignItems: 'center'
        },
        iconContainer: {
            width: 64,
            height: 64,
            borderRadius: 32,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
            backgroundColor: colors.primary + '1A'
        },
        inputGroup: {
            marginBottom: 16,
        },
        inputWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 16,
            height: 52,
            borderColor: colors.stroke,
        },
        input: {
            flex: 1,
            fontSize: 15,
            padding: 0,
            height: '100%',
        },
        actionContainer: {
            flexDirection: 'row',
            gap: 12,
            marginTop: 8,
            width: '100%'
        },
        btn: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: 100,
            alignItems: 'center',
            justifyContent: 'center',
        }
    });
};

import { StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useAniFeedStyles = () => {
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
        statsCard: {
            borderRadius: 20,
            borderWidth: 1.5,
            marginBottom: 16,
            backgroundColor: colors.surface,
            borderColor: colors.stroke,
            padding: 20,
        },
        statsHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
        },
        statsRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 12, // Increased padding
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
        },
        undoContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: colors.cardFill,
            padding: 12,
            borderRadius: 12,
            marginTop: 12,
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
        liveScaleInnerCircle: {
            width: 156,
            height: 156,
            borderRadius: 78,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
        },
        liveStatsContainer: {
            flexDirection: 'row',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
        },
        liveStatItem: {
            alignItems: 'center',
            flex: 1,
        },
        liveStatDivider: {
            width: 1,
            height: 30,
            backgroundColor: colors.stroke,
        },
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
        },
        dispenseTimeRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.stroke,
            width: '100%',
        },
        addTimeButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            marginTop: 8,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.primary,
            borderRadius: 12,
            width: '100%',
        }
    });
};

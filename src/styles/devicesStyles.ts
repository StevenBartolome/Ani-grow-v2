import { StyleSheet, useWindowDimensions } from 'react-native';
import { createTheme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

/** Scales horizontal padding so content breathes inward on wide screens */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export const useDevicesStyles = () => {
    const { colors } = useTheme();
    const theme = createTheme(colors);
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: colors.bgLight,
        },
        container: {
            flex: 1,
        },
        headerContainer: {
            // Container for header text below the nav bar
            paddingTop: 8,
        },
        headerTopRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 16,
        },
        headerTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        headerTextContainer: {
            paddingHorizontal: hPad,
            marginTop: 8,
        },
        headerSubtitle: {
            marginTop: 4,
            marginBottom: 24,
        },
        addButton: {
            width: 40,
            height: 40,
            borderRadius: 20, /* Perfect Circle to match BackButton */
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.stroke,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 5,
            shadowColor: colors.text,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
        },
        filterContainer: {
            flexDirection: 'row',
            paddingHorizontal: hPad,
            marginBottom: 24,
            gap: 12,
        },
        filterChip: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.stroke,
        },
        filterChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        filterChipText: {
            fontFamily: 'Poppins-Medium',
            fontSize: 13,
            color: colors.textGrey,
        },
        filterChipTextActive: {
            color: colors.onPrimary,
        },
        sectionTitleRow: {
            paddingHorizontal: hPad,
            marginBottom: 16,
        },
        gridContainer: {
            paddingHorizontal: hPad,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 16,
            paddingBottom: 24,
        },
        deviceCard: {
            width: '47%', // roughly half width with gap
            padding: 16, // Reduced padding
            borderRadius: 20, // Slightly reduced radius to fit smaller size
            borderWidth: 1.5,
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 8 },
            justifyContent: 'space-between',
            gap: 12, // Native spacing between top icon area and bottom text
        },
        deviceCardOffline: {
            opacity: 0.6, // Visual indication of inactivity
            backgroundColor: colors.bgLight,
        },
        deviceIconBox: {
            padding: 10,
            borderRadius: 12,
            alignSelf: 'flex-start',
        },
        deviceIconBoxOffline: {
            backgroundColor: colors.stroke, // gray box background
        },
        deviceStatusDotContainer: {
            padding: 4, // Invisible padding to make the dot pop and align neatly
        },
        deviceStatusDot: {
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: '#fff',
            backgroundColor: '#10B981', // green default
            elevation: 4,
            shadowColor: '#10B981',
            shadowOpacity: 0.5,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
        },
        deviceStatusDotOffline: {
            backgroundColor: '#EF4444', // red
            shadowColor: '#EF4444',
        },
        deviceInfoBottom: {
            marginTop: 4,
        },
        deviceTextOffline: {
            color: colors.textGrey, // Muted text for offline devices
        },

        // ─── AddDeviceScreen Specific Styles ───
        stepContainer: {
            marginTop: 16,
        },
        progressHeader: {
            marginBottom: 32,
        },
        optionsContainer: {
            gap: 16,
        },
        deviceOptionCard: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 20,
            borderRadius: 20,
            borderWidth: 1.5,
        },
        iconBox: {
            width: 56,
            height: 56,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
        },
        optionTextContainer: {
            flex: 1,
            marginRight: 16,
        },
        radioCircle: {
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            alignItems: 'center',
            justifyContent: 'center',
        },
        radioDot: {
            width: 12,
            height: 12,
            borderRadius: 6,
        },
        instructionsContainer: {
            marginTop: 8,
        },
        instructionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 20,
        },
        numberCircle: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
        },
        numberText: {
            color: '#fff',
            fontFamily: 'Poppins-SemiBold',
            fontSize: 14,
        },
        inputContainer: {
            marginTop: 8,
        },
        bottomBar: {
            paddingHorizontal: hPad,
            paddingTop: 16,
            paddingBottom: 32,
        },
        primaryButton: {
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
        }
    });
};

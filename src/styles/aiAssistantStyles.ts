import { Platform, StyleSheet } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIDEBAR_W   = 272;
export const HISTORY_MAX = 100;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAIAssistantStyles = () => {
    const { colors, isDark } = useTheme();

    const sidebarBg = isDark ? '#0f0f0f' : '#f7f7f5';

    return {
        colors,
        isDark,
        sidebarBg,
        styles: StyleSheet.create({
            // ── Root ──────────────────────────────────────────────────────────
            safeArea: {
                flex: 1,
                backgroundColor: colors.bgLight,
            },

            // ── Header (Minimalist) ───────────────────────────────────────────
            header: {
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: colors.bgLight,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.stroke + '60', // Very subtle
            },
            headerIconBtn: {
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 2,
            },
            headerIconBtnRight: {
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 2,
            },
            headerTitleWrap: {
                flex: 1,
                alignItems: 'center',
                gap: 2,
            },
            headerTitle: {
                fontFamily: 'Poppins-Medium',
                fontSize: 15,
                color: colors.text,
                letterSpacing: 0.3,
            },
            headerStatusRow: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
            },
            headerStatusDot: {
                width: 5,
                height: 5,
                borderRadius: 2.5,
            },
            headerStatusText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 10,
                color: colors.textGrey,
                letterSpacing: 0.2,
            },

            // ── Close / back button ────────────────────────────────────────────
            minimizeBtn: {
                width: 34,
                height: 34,
                borderRadius: 17,
                marginLeft: 4,
                alignItems: 'center',
                justifyContent: 'center',
            },

            // ── Messages scroll ────────────────────────────────────────────────
            keyboardAvoid: {
                flex: 1,
            },
            messageList: {
                flexGrow: 1,
                paddingBottom: 24,
            },

            // ── Empty state (Thread Layout) ───────────────────────────────────
            emptyWrap: {
                flex: 1,
                paddingHorizontal: 24,
                paddingTop: '20%',
                alignItems: 'center',
                justifyContent: 'center',
            },
            emptyIconBox: {
                width: 80,
                height: 80,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                borderRadius: 24,
                ...Platform.select({
                    ios: {
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.15,
                        shadowRadius: 16,
                    },
                    android: { elevation: 8 },
                }),
            },
            emptyTitle: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 24,
                color: colors.text,
                textAlign: 'center',
                marginBottom: 8,
                letterSpacing: -0.3,
            },
            emptySubtitle: {
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                color: colors.textGrey,
                textAlign: 'center',
                lineHeight: 22,
                paddingHorizontal: 16,
            },
            
            // ── Suggestion Chips (above Prompt Box) ───────────────────────────
            suggestionScrollWrap: {
                maxHeight: 50,
                marginBottom: 12,
            },
            suggestionScrollContent: {
                paddingHorizontal: 16,
                gap: 8,
            },
            suggestionChip: {
                backgroundColor: isDark ? '#1C1C1E' : colors.surface,
                borderWidth: 1,
                borderColor: colors.stroke,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 8,
                justifyContent: 'center',
            },
            suggestionChipText: {
                fontFamily: 'Poppins-Medium',
                fontSize: 13,
                color: colors.text,
            },

            // ── Conversation list ──────────────────────────────────────────────
            convWrap: {
                paddingTop: 16,
            },

            // ── User Thread (Subtle capsule) ──────────────────────────────────
            userThreadWrap: {
                paddingHorizontal: 16,
                marginBottom: 24,
                alignItems: 'flex-end',
            },
            userThreadCard: {
                backgroundColor: isDark ? '#2A2A2C' : '#F0F0F0',
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 12,
                maxWidth: '85%',
            },
            userThreadText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 15,
                color: colors.text,
                lineHeight: 22,
            },
            threadTimeRight: {
                fontFamily: 'Poppins-Regular',
                fontSize: 10,
                color: colors.textGrey,
                marginTop: 4,
                marginRight: 4,
            },

            // ── Bot Thread (Borderless, flowing text) ─────────────────────────
            botThreadWrap: {
                paddingHorizontal: 16,
                marginBottom: 32,
                flexDirection: 'row',
                gap: 16,
                alignItems: 'flex-start',
            },
            botThreadAvatar: {
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: 'transparent',
                marginTop: 2,
            },
            botThreadContentWrap: {
                flex: 1,
            },
            botThreadHeaderRow: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
            },
            botThreadName: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 14,
                color: colors.text,
            },
            threadTimeLeft: {
                fontFamily: 'Poppins-Regular',
                fontSize: 10,
                color: colors.textGrey,
            },
            botNavWrap: {
                marginTop: 12,
                gap: 8,
            },

            // ── Typing indicator ──────────────────────────────────────────────
            typingWrap: {
                paddingHorizontal: 16,
                marginBottom: 32,
                flexDirection: 'row',
                gap: 16,
                alignItems: 'center',
            },

            // ── MessageActionBar ──────────────────────────────────────────────
            actionBar: {
                flexDirection: 'row',
                gap: 4,
                marginTop: 12,
            },
            actionBarBtn: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: 'transparent',
            },
            actionBarBtnText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 12,
                color: colors.textGrey,
            },

            // ── Date separator ────────────────────────────────────────────────
            dateSepWrap: {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginVertical: 24,
            },
            dateSepText: {
                fontFamily: 'Poppins-Medium',
                fontSize: 11,
                color: colors.textGrey,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
            },

            // ── Scroll-to-bottom FAB ──────────────────────────────────────────
            scrollFab: {
                position: 'absolute',
                right: 16,
                bottom: 120,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.stroke,
                alignItems: 'center',
                justifyContent: 'center',
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                    },
                    android: { elevation: 2 },
                }),
            },

            // ── Unified Prompt Box ────────────────────────────────────────────
            promptBoxContainer: {
                backgroundColor: isDark ? '#1C1C1E' : colors.surface,
                borderWidth: 1,
                borderColor: colors.stroke,
                borderRadius: 20,
                marginHorizontal: 16,
                marginBottom: Platform.OS === 'ios' ? 24 : 16,
                padding: 12,
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: isDark ? 0.3 : 0.04,
                        shadowRadius: 12,
                    },
                    android: { elevation: 3 },
                }),
            },
            promptBoxFocused: {
                borderColor: colors.primary + '80',
            },
            promptInputWrap: {
                minHeight: 40,
                maxHeight: 120,
                marginBottom: 8,
            },
            promptInputField: {
                fontFamily: 'Poppins-Regular',
                fontSize: 15,
                color: colors.text,
                padding: 0,
                margin: 0,
                lineHeight: 22,
            },
            promptToolbar: {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            },
            promptToolsLeft: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
            },
            promptToolBtn: {
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? '#2A2A2C' : '#F0F0F0',
            },
            promptSendBtn: {
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
            },
            promptSendBtnDisabled: {
                backgroundColor: isDark ? '#2A2A2C' : '#E5E5E5',
            },

            // ── Toast ─────────────────────────────────────────────────────────
            toast: {
                position: 'absolute',
                bottom: 120,
                alignSelf: 'center',
                backgroundColor: isDark ? '#1e1e1e' : '#111',
                borderRadius: 24,
                paddingHorizontal: 18,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
            },
            toastText: {
                fontFamily: 'Poppins-Medium',
                fontSize: 13,
                color: '#fff',
            },

            // ── Sidebar drawer (unchanged) ────────────────────────────────────
            sidebarBackdrop: {
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.55)',
                zIndex: 100,
            },
            sidebarPanel: {
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                width: SIDEBAR_W,
                backgroundColor: sidebarBg,
                borderRightWidth: StyleSheet.hairlineWidth,
                borderRightColor: colors.stroke,
                zIndex: 101,
            },

            // ── Markdown ──────────────────────────────────────────────────────
            mdHeading: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 16,
                marginTop: 16,
                marginBottom: 6,
            },
            mdParagraph: {
                fontFamily: 'Poppins-Regular',
                fontSize: 15,
                lineHeight: 24,
                marginTop: 4,
            },
            mdListWrap: {
                marginTop: 8,
                marginBottom: 6,
                gap: 6,
            },
            mdListRow: {
                flexDirection: 'row',
                gap: 10,
            },
            mdListBullet: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 14,
                minWidth: 20,
            },
            mdListItem: {
                flex: 1,
                fontFamily: 'Poppins-Regular',
                fontSize: 15,
                lineHeight: 24,
            },
            mdBulletDot: {
                width: 6,
                height: 6,
                borderRadius: 3,
                marginTop: 9,
            },
            mdHr: {
                height: 1,
                marginVertical: 16,
            },
        }),
    };
};

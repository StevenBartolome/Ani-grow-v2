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

            // ── Header ────────────────────────────────────────────────────────
            header: {
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: colors.surface,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.stroke,
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isDark ? 0.3 : 0.06,
                        shadowRadius: 6,
                    },
                    android: { elevation: 3 },
                }),
            },
            headerIconBtn: {
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 2,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            },
            headerIconBtnRight: {
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 2,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            },
            headerTitleWrap: {
                flex: 1,
                alignItems: 'center',
                gap: 3,
            },
            headerTitle: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 16,
                color: colors.text,
                letterSpacing: 0.2,
            },
            headerStatusRow: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 20,
            },
            headerStatusDot: {
                width: 6,
                height: 6,
                borderRadius: 3,
            },
            headerStatusText: {
                fontFamily: 'Poppins-Medium',
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
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.stroke,
                alignItems: 'center',
                justifyContent: 'center',
            },

            // ── Messages scroll ────────────────────────────────────────────────
            keyboardAvoid: {
                flex: 1,
            },
            messageList: {
                flexGrow: 1,
                paddingBottom: 16,
            },

            // ── Empty state ───────────────────────────────────────────────────
            emptyWrap: {
                flex: 1,
                paddingHorizontal: 28,
                paddingTop: 52,
                alignItems: 'center',
            },
            emptyIconBox: {
                width: 72,
                height: 72,
                borderRadius: 22,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                borderWidth: 3,
                borderColor: colors.primary + '30',
                ...Platform.select({
                    ios: {
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.45,
                        shadowRadius: 20,
                    },
                    android: { elevation: 10 },
                }),
            },
            emptyTitle: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 22,
                color: colors.text,
                textAlign: 'center',
                marginBottom: 10,
                letterSpacing: 0.2,
            },
            emptySubtitle: {
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                color: colors.textGrey,
                textAlign: 'center',
                lineHeight: 22,
                marginBottom: 36,
                paddingHorizontal: 12,
            },
            quickPromptsWrap: {
                width: '100%',
                gap: 10,
            },
            quickPromptItem: {
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.stroke,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isDark ? 0.2 : 0.05,
                        shadowRadius: 4,
                    },
                    android: { elevation: 1 },
                }),
            },
            quickPromptItemPressed: {
                backgroundColor: colors.primary + '12',
                borderColor: colors.primary + '40',
            },
            quickPromptDot: {
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.primary + '70',
            },
            quickPromptText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                color: colors.text,
                flex: 1,
                lineHeight: 20,
            },

            // ── Conversation list ──────────────────────────────────────────────
            convWrap: {
                paddingTop: 8,
            },

            // ── User bubble ───────────────────────────────────────────────────
            userBubbleWrap: {
                paddingHorizontal: 16,
                marginBottom: 2,
                alignItems: 'flex-end',
            },
            userBubble: {
                backgroundColor: colors.primary,
                borderRadius: 18,
                borderTopRightRadius: 4,
                paddingHorizontal: 16,
                paddingVertical: 11,
                maxWidth: '78%',
            },
            userBubbleText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                color: '#fff',
                lineHeight: 21,
            },
            bubbleTime: {
                fontFamily: 'Poppins-Regular',
                fontSize: 10,
                color: colors.textGrey,
                marginTop: 4,
                marginRight: 4,
            },

            // ── Bot message ───────────────────────────────────────────────────
            botMsgWrap: {
                paddingHorizontal: 16,
                marginBottom: 2,
            },
            botAvatarRow: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
            },
            botAvatar: {
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
            },
            botName: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 13,
                color: colors.text,
            },
            botContentWrap: {
                paddingLeft: 34,
            },
            botNavWrap: {
                marginTop: 10,
                gap: 6,
            },
            botMsgTime: {
                fontFamily: 'Poppins-Regular',
                fontSize: 10,
                color: colors.textGrey,
                marginTop: 8,
            },

            // ── Typing indicator ──────────────────────────────────────────────
            typingWrap: {
                paddingHorizontal: 16,
                marginTop: 4,
            },

            // ── NavButton ─────────────────────────────────────────────────────
            navBtn: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: colors.stroke,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 9,
                marginTop: 8,
                alignSelf: 'flex-start',
                backgroundColor: colors.cardFill,
            },
            navBtnText: {
                fontFamily: 'Poppins-Medium',
                fontSize: 13,
                color: colors.primary,
            },

            // ── MessageActionBar ──────────────────────────────────────────────
            actionBar: {
                flexDirection: 'row',
                gap: 4,
                marginTop: 8,
            },
            actionBarBtn: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: colors.stroke,
                borderRadius: 6,
                backgroundColor: colors.surface,
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
                gap: 10,
                marginVertical: 20,
            },
            dateSepLine: {
                flex: 1,
                height: 1,
                backgroundColor: colors.stroke,
            },
            dateSepText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 11,
                color: colors.textGrey,
                letterSpacing: 0.4,
            },

            // ── Scroll-to-bottom FAB ──────────────────────────────────────────
            scrollFab: {
                position: 'absolute',
                right: 16,
                bottom: 80,
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                ...Platform.select({
                    ios: {
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.4,
                        shadowRadius: 8,
                    },
                    android: { elevation: 6 },
                }),
            },

            // ── Input bar ─────────────────────────────────────────────────────
            inputBar: {
                backgroundColor: colors.surface,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.stroke,
                paddingHorizontal: 12,
                paddingVertical: 10,
                paddingBottom: Platform.OS === 'ios' ? 10 : 10,
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 8,
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: -1 },
                        shadowOpacity: isDark ? 0.2 : 0.04,
                        shadowRadius: 4,
                    },
                }),
            },
            inputWrap: {
                flex: 1,
                backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
                borderWidth: 1.5,
                borderColor: colors.stroke,
                borderRadius: 22,
                overflow: 'hidden',
                paddingHorizontal: 16,
                paddingVertical: 10,
                minHeight: 44,
                maxHeight: 130,
                justifyContent: 'center',
            },
            inputWrapFocused: {
                borderColor: colors.primary + '80',
                backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : colors.surface,
            },
            inputField: {
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                color: colors.text,
                padding: 0,
                margin: 0,
            },
            sendBtn: {
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
            },
            sendBtnActive: {
                backgroundColor: colors.primary,
                ...Platform.select({
                    ios: {
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.4,
                        shadowRadius: 8,
                    },
                    android: { elevation: 4 },
                }),
            },
            sendBtnDisabled: {
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            },

            // ── Toast ─────────────────────────────────────────────────────────
            toast: {
                position: 'absolute',
                bottom: 90,
                alignSelf: 'center',
                backgroundColor: isDark ? '#1e1e1e' : '#111',
                borderRadius: 24,
                paddingHorizontal: 18,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.1)',
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 10,
                    },
                    android: { elevation: 8 },
                }),
            },
            toastText: {
                fontFamily: 'Poppins-Medium',
                fontSize: 13,
                color: '#fff',
            },

            // ── Sidebar drawer ────────────────────────────────────────────────
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
                ...Platform.select({
                    ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 4, height: 0 },
                        shadowOpacity: 0.18,
                        shadowRadius: 16,
                    },
                    android: { elevation: 12 },
                }),
            },
            sidebarHeader: {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 16,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.stroke,
            },
            sidebarBrandRow: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
            },
            sidebarBrandIcon: {
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                ...Platform.select({
                    ios: {
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.35,
                        shadowRadius: 6,
                    },
                    android: { elevation: 4 },
                }),
            },
            sidebarBrandTitle: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 16,
                color: colors.text,
                letterSpacing: 0.2,
            },
            sidebarNewChatBtn: {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginHorizontal: 12,
                marginTop: 12,
                marginBottom: 4,
                paddingHorizontal: 14,
                paddingVertical: 13,
                backgroundColor: colors.primary,
                borderRadius: 12,
                ...Platform.select({
                    ios: {
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                    },
                    android: { elevation: 4 },
                }),
            },
            sidebarNewChatText: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 14,
                color: '#fff',
                flex: 1,
            },
            sidebarEmptyText: {
                fontFamily: 'Poppins-Regular',
                fontSize: 13,
                color: colors.textGrey,
                textAlign: 'center',
                lineHeight: 20,
            },
            sidebarGroupLabel: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 10,
                color: colors.textGrey,
                letterSpacing: 1,
                textTransform: 'uppercase',
                paddingHorizontal: 16,
                paddingTop: 18,
                paddingBottom: 6,
            },
            sidebarConvRow: {
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 11,
                marginHorizontal: 8,
                marginBottom: 2,
                borderRadius: 10,
            },
            sidebarConvMeta: {
                flex: 1,
                marginRight: 6,
            },
            sidebarConvActiveDot: {
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: colors.primary,
            },

            // ── Markdown ──────────────────────────────────────────────────────
            mdHeading: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 15,
                marginTop: 12,
                marginBottom: 4,
            },
            mdParagraph: {
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                lineHeight: 22,
                marginTop: 2,
            },
            mdListWrap: {
                marginTop: 6,
                marginBottom: 4,
                gap: 4,
            },
            mdListRow: {
                flexDirection: 'row',
                gap: 8,
            },
            mdListBullet: {
                fontFamily: 'Poppins-SemiBold',
                fontSize: 13,
                minWidth: 18,
            },
            mdListItem: {
                flex: 1,
                fontFamily: 'Poppins-Regular',
                fontSize: 14,
                lineHeight: 21,
            },
            mdBulletDot: {
                width: 5,
                height: 5,
                borderRadius: 3,
                marginTop: 8,
            },
            mdHr: {
                height: 1,
                marginVertical: 10,
            },
        }),
    };
};

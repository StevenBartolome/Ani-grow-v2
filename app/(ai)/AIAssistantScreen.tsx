import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { anibotChat, ChatMessage, NavLink } from '@/lib/ai';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_W   = 272;
const HISTORY_MAX = 100;

const QUICK_PROMPTS = [
    'Give me an overview of my farm',
    'How many animals do I have?',
    'Show my recent health records',
    'What are the latest weight readings?',
    'How much feed was dispensed today?',
    'I want to register new animals',
    'Show mortality records',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
    id: string;
    title: string;
    preview: string;
    createdAt: number;
    updatedAt: number;
}

interface StoredMessage extends ChatMessage {
    ts: number;
    navigation?: NavLink[];
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const convsKey  = (fid: string) => `anibot_convs_${fid}`;
const msgsKey   = (cid: string) => `anibot_msgs_${cid}`;
const legacyKey = (fid: string) => `anibot_history_${fid}`;
const newConvId = () => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const trunc     = (s: string, n: number) => s.length > n ? s.slice(0, n).trimEnd() + '…' : s;

// ─── Grouping ─────────────────────────────────────────────────────────────────

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];

function groupLabel(ts: number) {
    const diff = Math.floor((Date.now() - ts) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff <= 7)  return 'Previous 7 Days';
    if (diff <= 30) return 'Previous 30 Days';
    return new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupConversations(convs: Conversation[]): { label: string; items: Conversation[] }[] {
    const map: Record<string, Conversation[]> = {};
    for (const c of convs) { const l = groupLabel(c.updatedAt); (map[l] ??= []).push(c); }
    const result: { label: string; items: Conversation[] }[] = [];
    for (const l of GROUP_ORDER) if (map[l]) result.push({ label: l, items: map[l] });
    for (const [l, items] of Object.entries(map)) if (!GROUP_ORDER.includes(l)) result.push({ label: l, items });
    return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12(ts: number) {
    const d = new Date(ts), h = d.getHours(), m = d.getMinutes();
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function dateLabel(ts: number) {
    const d = new Date(ts), t = new Date(), y = new Date();
    y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function diffDay(a?: StoredMessage, b?: StoredMessage) {
    if (!a || !b) return true;
    return new Date(a.ts).toDateString() !== new Date(b.ts).toDateString();
}

// ─── MarkdownText ─────────────────────────────────────────────────────────────

function renderInline(raw: string, color: string): React.ReactNode[] {
    return raw.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
            ? <Text key={i} style={{ fontFamily: 'Poppins-SemiBold', color }}>{p.slice(2, -2)}</Text>
            : <Text key={i} style={{ fontFamily: 'Poppins-Regular', color }}>{p}</Text>
    );
}

function MarkdownText({ text, baseColor, dimColor }: { text: string; baseColor: string; dimColor: string }) {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i], t = line.trim();
        if (!t) { i++; continue; }
        if (t.startsWith('# ') || t.startsWith('## ')) {
            nodes.push(<Text key={i} style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: baseColor, marginTop: 12, marginBottom: 4 }}>{t.replace(/^#{1,2} /, '')}</Text>);
            i++; continue;
        }
        if (/^\d+\.\s/.test(t)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s/, '')); i++; }
            nodes.push(
                <View key={`nl${i}`} style={{ marginTop: 6, marginBottom: 4, gap: 4 }}>
                    {items.map((it, j) => (
                        <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                            <Text style={{ fontFamily: 'Poppins-SemiBold', color: dimColor, fontSize: 13, minWidth: 18 }}>{j + 1}.</Text>
                            <Text style={{ flex: 1, fontFamily: 'Poppins-Regular', fontSize: 14, color: baseColor, lineHeight: 21 }}>{renderInline(it, baseColor)}</Text>
                        </View>
                    ))}
                </View>
            );
            continue;
        }
        if (t.startsWith('- ') || t.startsWith('• ')) {
            const items: string[] = [];
            while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('• '))) { items.push(lines[i].trim().replace(/^[-•]\s/, '')); i++; }
            nodes.push(
                <View key={`bl${i}`} style={{ marginTop: 6, marginBottom: 4, gap: 4 }}>
                    {items.map((it, j) => (
                        <View key={j} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dimColor, marginTop: 8 }} />
                            <Text style={{ flex: 1, fontFamily: 'Poppins-Regular', fontSize: 14, color: baseColor, lineHeight: 21 }}>{renderInline(it, baseColor)}</Text>
                        </View>
                    ))}
                </View>
            );
            continue;
        }
        if (t === '---' || t === '___') {
            nodes.push(<View key={i} style={{ height: 1, backgroundColor: dimColor + '40', marginVertical: 10 }} />);
            i++; continue;
        }
        nodes.push(<Text key={i} style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: baseColor, lineHeight: 22, marginTop: 2 }}>{renderInline(t, baseColor)}</Text>);
        i++;
    }
    return <View style={{ gap: 2 }}>{nodes}</View>;
}

// ─── TypingDots ───────────────────────────────────────────────────────────────

function TypingDots({ color }: { color: string }) {
    const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
    useEffect(() => {
        const anims = dots.map((dot, i) => Animated.loop(Animated.sequence([
            Animated.delay(i * 120),
            Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0,  duration: 280, useNativeDriver: true }),
            Animated.delay(560),
        ])));
        anims.forEach(a => a.start());
        return () => anims.forEach(a => a.stop());
    }, []);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}>
            {dots.map((d, i) => <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, transform: [{ translateY: d }] }} />)}
        </View>
    );
}

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({ link }: { link: NavLink }) {
    const router = useRouter();
    const { colors } = useTheme();
    const go = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        link.params && Object.keys(link.params).length > 0
            ? router.push({ pathname: link.route as any, params: link.params })
            : router.push(link.route as any);
    };
    return (
        <TouchableOpacity onPress={go} activeOpacity={0.7} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            borderWidth: 1, borderColor: colors.stroke, borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 9,
            marginTop: 8, alignSelf: 'flex-start',
            backgroundColor: colors.cardFill,
        }}>
            <MaterialIcons name={link.icon as any} size={15} color={colors.primary} />
            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 13, color: colors.primary }}>{link.label}</Text>
            <MaterialIcons name="arrow-forward" size={13} color={colors.primary} />
        </TouchableOpacity>
    );
}

// ─── DateSeparator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey, letterSpacing: 0.4 }}>{label}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.stroke }} />
        </View>
    );
}

// ─── MessageActionBar ─────────────────────────────────────────────────────────

function MessageActionBar({ onCopy, onRegenerate, isVisible }: { onCopy: () => void; onRegenerate?: () => void; isVisible: boolean }) {
    const { colors } = useTheme();
    const opacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(opacity, { toValue: isVisible ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    }, [isVisible]);
    if (!isVisible) return null;
    const Btn = ({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) => (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 6,
            borderWidth: 1, borderColor: colors.stroke, borderRadius: 6,
            backgroundColor: colors.surface,
        }}>
            <MaterialIcons name={icon as any} size={13} color={colors.textGrey} />
            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey }}>{label}</Text>
        </TouchableOpacity>
    );
    return (
        <Animated.View style={{ opacity, flexDirection: 'row', gap: 4, marginTop: 8 }}>
            <Btn label="Copy" icon="content-copy" onPress={onCopy} />
            {onRegenerate && <Btn label="Retry" icon="refresh" onPress={onRegenerate} />}
        </Animated.View>
    );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
    visible: boolean;
    conversations: Conversation[];
    activeId: string | null;
    onClose: () => void;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}

function Sidebar({ visible, conversations, activeId, onClose, onSelect, onNew, onDelete }: SidebarProps) {
    const { colors, isDark } = useTheme();
    const slideX    = useRef(new Animated.Value(-SIDEBAR_W)).current;
    const backdropO = useRef(new Animated.Value(0)).current;
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideX,    { toValue: visible ? 0 : -SIDEBAR_W, duration: 240, useNativeDriver: true }),
            Animated.timing(backdropO, { toValue: visible ? 1 : 0,           duration: 240, useNativeDriver: true }),
        ]).start();
        if (!visible) setDeleteTarget(null);
    }, [visible]);

    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    const groups  = groupConversations(sorted);
    const sidebarBg = isDark ? '#0f0f0f' : '#f7f7f5';

    return (
        <>
            {/* Backdrop */}
            <Animated.View
                pointerEvents={visible ? 'auto' : 'none'}
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    opacity: backdropO,
                    zIndex: 100,
                }}
            >
                <Pressable style={{ flex: 1 }} onPress={onClose} />
            </Animated.View>

            {/* Drawer panel */}
            <Animated.View style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: SIDEBAR_W,
                backgroundColor: sidebarBg,
                borderRightWidth: 1, borderRightColor: colors.stroke,
                transform: [{ translateX: slideX }],
                zIndex: 101,
            }}>
                <SafeAreaView style={{ flex: 1 }}>
                    {/* Drawer header */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 16, paddingVertical: 14,
                        borderBottomWidth: 1, borderBottomColor: colors.stroke,
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{
                                width: 26, height: 26, borderRadius: 7,
                                backgroundColor: colors.primary,
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <MaterialIcons name="smart-toy" size={13} color="#fff" />
                            </View>
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text }}>AniBot</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.6} style={{ padding: 6 }}>
                            <MaterialIcons name="close" size={18} color={colors.textGrey} />
                        </TouchableOpacity>
                    </View>

                    {/* New Chat button */}
                    <TouchableOpacity
                        onPress={() => { onNew(); onClose(); }}
                        activeOpacity={0.75}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            margin: 12,
                            paddingHorizontal: 14, paddingVertical: 12,
                            backgroundColor: colors.primary,
                            borderRadius: 10,
                        }}
                    >
                        <MaterialIcons name="add" size={18} color="#fff" />
                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: '#fff' }}>New Chat</Text>
                    </TouchableOpacity>

                    {/* Conversation list */}
                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                        {conversations.length === 0 ? (
                            <View style={{ paddingHorizontal: 20, paddingTop: 28, alignItems: 'center' }}>
                                <Text style={{
                                    fontFamily: 'Poppins-Regular', fontSize: 13,
                                    color: colors.textGrey, textAlign: 'center', lineHeight: 20,
                                }}>
                                    No conversations yet.{'\n'}Start a new chat above.
                                </Text>
                            </View>
                        ) : (
                            groups.map(group => (
                                <View key={group.label}>
                                    <Text style={{
                                        fontFamily: 'Poppins-SemiBold', fontSize: 10,
                                        color: colors.textGrey, letterSpacing: 0.8,
                                        textTransform: 'uppercase',
                                        paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
                                    }}>
                                        {group.label}
                                    </Text>
                                    {group.items.map(conv => {
                                        const isActive = conv.id === activeId;
                                        const isDel    = deleteTarget === conv.id;
                                        return (
                                            <Pressable
                                                key={conv.id}
                                                onPress={() => { setDeleteTarget(null); onSelect(conv.id); }}
                                                onLongPress={() => setDeleteTarget(isDel ? null : conv.id)}
                                                style={({ pressed }) => ({
                                                    flexDirection: 'row', alignItems: 'center',
                                                    paddingHorizontal: 12, paddingVertical: 10,
                                                    marginHorizontal: 6, marginBottom: 1,
                                                    borderRadius: 8,
                                                    backgroundColor: isActive
                                                        ? colors.primary + '18'
                                                        : pressed ? colors.cardFill + 'aa' : 'transparent',
                                                })}
                                            >
                                                <View style={{ flex: 1, marginRight: 6 }}>
                                                    <Text numberOfLines={1} style={{
                                                        fontFamily: isActive ? 'Poppins-Medium' : 'Poppins-Regular',
                                                        fontSize: 13,
                                                        color: isActive ? colors.primary : colors.text,
                                                    }}>
                                                        {conv.title}
                                                    </Text>
                                                    <Text numberOfLines={1} style={{
                                                        fontFamily: 'Poppins-Regular', fontSize: 11,
                                                        color: colors.textGrey, marginTop: 1,
                                                    }}>
                                                        {conv.preview}
                                                    </Text>
                                                </View>
                                                {isDel ? (
                                                    <TouchableOpacity
                                                        onPress={() => { onDelete(conv.id); setDeleteTarget(null); }}
                                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    >
                                                        <MaterialIcons name="delete" size={17} color={colors.error} />
                                                    </TouchableOpacity>
                                                ) : isActive ? (
                                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                                                ) : null}
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ))
                        )}
                        <View style={{ height: 32 }} />
                    </ScrollView>
                </SafeAreaView>
            </Animated.View>
        </>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AIAssistantScreen() {
    const { colors, isDark } = useTheme();
    const { profile } = useAuth();

    const farmId   = (profile as any)?.farm_id ?? '';
    const userId   = (profile as any)?.uid ?? (profile as any)?.id ?? '';
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? 'Your Farm';

    // ── State ─────────────────────────────────────────────────────────────────
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId]   = useState<string | null>(null);
    const [messages, setMessages]           = useState<StoredMessage[]>([]);
    const [input, setInput]                 = useState('');
    const [isLoading, setIsLoading]         = useState(false);
    const [historyReady, setHistoryReady]   = useState(false);
    const [activeMsg, setActiveMsg]         = useState<number | null>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [copiedToast, setCopiedToast]     = useState(false);
    const [sidebarOpen, setSidebarOpen]     = useState(false);

    const scrollRef       = useRef<ScrollView>(null);
    const atBottom        = useRef(true);
    const toastTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeConvIdRef = useRef<string | null>(null);
    const conversationsRef = useRef<Conversation[]>([]);

    useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);
    useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

    // ── Load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!farmId) return;
        (async () => {
            let convs: Conversation[] = [];
            const convsRaw = await AsyncStorage.getItem(convsKey(farmId));
            if (convsRaw) { try { convs = JSON.parse(convsRaw); } catch {} }

            // Migrate legacy single-conversation history
            if (convs.length === 0) {
                const legacyRaw = await AsyncStorage.getItem(legacyKey(farmId));
                if (legacyRaw) {
                    try {
                        const legacyMsgs: StoredMessage[] = JSON.parse(legacyRaw);
                        if (legacyMsgs.length > 0) {
                            const firstUser = legacyMsgs.find(m => m.role === 'user');
                            const lastMsg   = legacyMsgs[legacyMsgs.length - 1];
                            const id = newConvId();
                            const conv: Conversation = {
                                id,
                                title:     trunc(firstUser?.content ?? 'Previous chat', 40),
                                preview:   trunc(lastMsg.content.replace(/\[NAV:[^\]]+\]/g, '').trim(), 60),
                                createdAt: legacyMsgs[0].ts,
                                updatedAt: lastMsg.ts,
                            };
                            convs = [conv];
                            await AsyncStorage.multiSet([
                                [msgsKey(id), legacyRaw],
                                [convsKey(farmId), JSON.stringify(convs)],
                            ]);
                            await AsyncStorage.removeItem(legacyKey(farmId));
                            setConversations(convs);
                            setActiveConvId(id);
                            setMessages(legacyMsgs);
                            setHistoryReady(true);
                            return;
                        }
                    } catch {}
                }
            }

            setConversations(convs);
            if (convs.length > 0) {
                const most = [...convs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
                setActiveConvId(most.id);
                const raw = await AsyncStorage.getItem(msgsKey(most.id));
                if (raw) { try { setMessages(JSON.parse(raw)); } catch {} }
            }
            setHistoryReady(true);
        })();
    }, [farmId]);

    // ── Scroll ────────────────────────────────────────────────────────────────
    const scrollToBottom = useCallback((animated = true) => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 80);
        setShowScrollBtn(false);
        setActiveMsg(null);
    }, []);

    const onScroll = useCallback((e: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
        const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
        atBottom.current = dist < 60;
        setShowScrollBtn(dist > 140);
    }, []);

    // ── Storage savers ────────────────────────────────────────────────────────
    const saveConvs = useCallback(async (convs: Conversation[]) => {
        await AsyncStorage.setItem(convsKey(farmId), JSON.stringify(convs));
    }, [farmId]);

    const saveMsgs = useCallback(async (cid: string, msgs: StoredMessage[]) => {
        await AsyncStorage.setItem(msgsKey(cid), JSON.stringify(msgs.slice(-HISTORY_MAX)));
    }, []);

    // ── Send ──────────────────────────────────────────────────────────────────
    const send = useCallback(async (text: string, historyOverride?: StoredMessage[]) => {
        const trimmed = text.trim();
        if (!trimmed || isLoading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setActiveMsg(null);

        const base    = historyOverride ?? messages;
        const userMsg: StoredMessage = { role: 'user', content: trimmed, ts: Date.now() };
        const history = [...base, userMsg];
        setMessages(history);
        setInput('');
        setIsLoading(true);
        scrollToBottom();

        // Create conversation on first message
        let convId = activeConvIdRef.current;
        if (!convId) {
            convId = newConvId();
            setActiveConvId(convId);
            const newConv: Conversation = {
                id: convId, title: trunc(trimmed, 40),
                preview: trunc(trimmed, 60), createdAt: Date.now(), updatedAt: Date.now(),
            };
            const updatedConvs = [newConv, ...conversationsRef.current];
            setConversations(updatedConvs);
            await saveConvs(updatedConvs);
        }
        await saveMsgs(convId, history);

        try {
            const apiMsgs = history.map(({ role, content }) => ({ role, content }));
            const reply   = await anibotChat(apiMsgs, { farmId, farmName, userId });
            const botMsg: StoredMessage = {
                role: 'assistant', content: reply.text, ts: Date.now(),
                navigation: reply.navigation.length > 0 ? reply.navigation : undefined,
            };
            const updated = [...history, botMsg];
            setMessages(updated);

            const preview  = trunc(reply.text.replace(/\[NAV:[^\]]+\]/g, '').trim(), 60);
            const fConvId  = convId;
            setConversations(prev => {
                const next = prev.map(c => c.id === fConvId ? { ...c, preview, updatedAt: Date.now() } : c);
                saveConvs(next);
                return next;
            });
            await saveMsgs(fConvId, updated);
        } catch (e: any) {
            const errMsg: StoredMessage = {
                role: 'assistant',
                content: `Something went wrong. ${e?.message ?? 'Please try again.'}`,
                ts: Date.now(),
            };
            const updated = [...history, errMsg];
            setMessages(updated);
            await saveMsgs(convId, updated);
        } finally {
            setIsLoading(false);
            scrollToBottom();
        }
    }, [messages, isLoading, farmId, farmName, userId, scrollToBottom, saveConvs, saveMsgs]);

    // ── Conversation actions ───────────────────────────────────────────────────
    const selectConversation = useCallback(async (id: string) => {
        if (id === activeConvId) { setSidebarOpen(false); return; }
        setActiveConvId(id);
        setMessages([]);
        setActiveMsg(null);
        setSidebarOpen(false);
        const raw = await AsyncStorage.getItem(msgsKey(id));
        if (raw) { try { setMessages(JSON.parse(raw)); } catch {} }
    }, [activeConvId]);

    const startNewChat = useCallback(() => {
        setActiveConvId(null);
        setMessages([]);
        setActiveMsg(null);
        setSidebarOpen(false);
    }, []);

    const deleteConversation = useCallback(async (id: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const updated = conversationsRef.current.filter(c => c.id !== id);
        setConversations(updated);
        await AsyncStorage.removeItem(msgsKey(id));
        await saveConvs(updated);
        if (activeConvIdRef.current === id) {
            if (updated.length > 0) {
                const next = [...updated].sort((a, b) => b.updatedAt - a.updatedAt)[0];
                setActiveConvId(next.id);
                const raw = await AsyncStorage.getItem(msgsKey(next.id));
                setMessages(raw ? JSON.parse(raw) : []);
            } else {
                setActiveConvId(null);
                setMessages([]);
            }
        }
    }, [saveConvs]);

    // ── Regenerate ────────────────────────────────────────────────────────────
    const regenerate = useCallback(() => {
        if (isLoading || messages.length < 2) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const withoutLast = messages.slice(0, -1);
        const lastUser    = [...withoutLast].reverse().find(m => m.role === 'user');
        if (!lastUser) return;
        const before = withoutLast.slice(0, withoutLast.lastIndexOf(lastUser));
        setMessages(before);
        send(lastUser.content, before);
    }, [messages, isLoading, send]);

    // ── Copy ──────────────────────────────────────────────────────────────────
    const copy = useCallback(async (text: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Clipboard.setStringAsync(text);
        setCopiedToast(true);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setCopiedToast(false), 1800);
    }, []);

    if (!historyReady) return null;

    const isEmpty = messages.length === 0;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: colors.surface,
                borderBottomWidth: 1, borderBottomColor: colors.stroke,
            }}>
                {/* Sidebar toggle */}
                <TouchableOpacity
                    onPress={() => setSidebarOpen(true)}
                    activeOpacity={0.6}
                    style={{ padding: 6, borderRadius: 8, marginRight: 4 }}
                >
                    <MaterialIcons name="menu" size={22} color={colors.textGrey} />
                </TouchableOpacity>

                {/* Title */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text }}>
                        AniBot
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{
                            width: 6, height: 6, borderRadius: 3,
                            backgroundColor: isLoading ? colors.warning : '#22c55e',
                        }} />
                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                            {isLoading ? 'Thinking' : farmName}
                        </Text>
                    </View>
                </View>

                {/* New chat (compose) */}
                <TouchableOpacity
                    onPress={startNewChat}
                    activeOpacity={0.6}
                    style={{ padding: 6, borderRadius: 8, marginLeft: 4 }}
                >
                    <MaterialIcons name="edit-note" size={22} color={colors.textGrey} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

                {/* ── Messages ───────────────────────────────────────────────── */}
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
                    showsVerticalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={80}
                    onContentSizeChange={() => { if (atBottom.current) scrollToBottom(false); }}
                    onTouchStart={() => { if (activeMsg !== null) setActiveMsg(null); }}
                >
                    {/* ── Empty state ─────────────────────────────────────────── */}
                    {isEmpty && (
                        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 48, alignItems: 'center' }}>
                            <View style={{
                                width: 52, height: 52, borderRadius: 14,
                                backgroundColor: colors.primary,
                                alignItems: 'center', justifyContent: 'center',
                                marginBottom: 20,
                            }}>
                                <MaterialIcons name="smart-toy" size={28} color="#fff" />
                            </View>
                            <Text style={{
                                fontFamily: 'Poppins-SemiBold', fontSize: 20,
                                color: colors.text, textAlign: 'center', marginBottom: 8,
                            }}>
                                How can I help you today?
                            </Text>
                            <Text style={{
                                fontFamily: 'Poppins-Regular', fontSize: 14,
                                color: colors.textGrey, textAlign: 'center',
                                lineHeight: 21, marginBottom: 36, paddingHorizontal: 8,
                            }}>
                                I have full access to your farm data and can take actions on your behalf.
                            </Text>
                            <View style={{ width: '100%', gap: 8 }}>
                                {QUICK_PROMPTS.map((q, i) => (
                                    <Pressable
                                        key={i}
                                        onPress={() => send(q)}
                                        style={({ pressed }) => ({
                                            backgroundColor: pressed ? colors.cardFill : colors.surface,
                                            borderWidth: 1, borderColor: colors.stroke,
                                            borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13,
                                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                            opacity: pressed ? 0.8 : 1,
                                        })}
                                    >
                                        <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text, flex: 1 }}>
                                            {q}
                                        </Text>
                                        <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* ── Conversation ────────────────────────────────────────── */}
                    {!isEmpty && (
                        <View style={{ paddingTop: 8 }}>
                            {messages.map((msg, idx) => {
                                const isUser    = msg.role === 'user';
                                const isLast    = idx === messages.length - 1;
                                const showDate  = diffDay(messages[idx - 1], msg);
                                const isActive  = activeMsg === idx;
                                const isLastBot = !isUser && isLast && !isLoading;

                                return (
                                    <View key={idx}>
                                        {showDate && <DateSeparator label={dateLabel(msg.ts)} />}

                                        {/* User bubble */}
                                        {isUser && (
                                            <Pressable
                                                onPress={() => setActiveMsg(isActive ? null : idx)}
                                                onLongPress={() => copy(msg.content)}
                                                style={{ paddingHorizontal: 16, marginBottom: 2, alignItems: 'flex-end' }}
                                            >
                                                <View style={{
                                                    backgroundColor: colors.primary,
                                                    borderRadius: 18, borderTopRightRadius: 4,
                                                    paddingHorizontal: 16, paddingVertical: 11,
                                                    maxWidth: '78%',
                                                }}>
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: '#fff', lineHeight: 21 }}>
                                                        {msg.content}
                                                    </Text>
                                                </View>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey, marginTop: 4, marginRight: 4 }}>
                                                    {fmt12(msg.ts)}
                                                </Text>
                                            </Pressable>
                                        )}

                                        {/* Bot message */}
                                        {!isUser && (
                                            <Pressable
                                                onPress={() => setActiveMsg(isActive ? null : idx)}
                                                onLongPress={() => copy(msg.content)}
                                                style={{ paddingHorizontal: 16, marginBottom: 2 }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                    <View style={{
                                                        width: 26, height: 26, borderRadius: 6,
                                                        backgroundColor: colors.primary,
                                                        alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <MaterialIcons name="smart-toy" size={14} color="#fff" />
                                                    </View>
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>
                                                        AniBot
                                                    </Text>
                                                </View>
                                                <View style={{ paddingLeft: 34 }}>
                                                    <MarkdownText text={msg.content} baseColor={colors.text} dimColor={colors.textGrey} />
                                                    {msg.navigation && msg.navigation.length > 0 && (
                                                        <View style={{ marginTop: 10, gap: 6 }}>
                                                            {msg.navigation.map((link, j) => <NavButton key={j} link={link} />)}
                                                        </View>
                                                    )}
                                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey, marginTop: 8 }}>
                                                        {fmt12(msg.ts)}
                                                    </Text>
                                                    <MessageActionBar
                                                        isVisible={isActive}
                                                        onCopy={() => copy(msg.content)}
                                                        onRegenerate={isLastBot ? regenerate : undefined}
                                                    />
                                                </View>
                                            </Pressable>
                                        )}
                                    </View>
                                );
                            })}

                            {/* Typing indicator */}
                            {isLoading && (
                                <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <View style={{
                                            width: 26, height: 26, borderRadius: 6,
                                            backgroundColor: colors.primary,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <MaterialIcons name="smart-toy" size={14} color="#fff" />
                                        </View>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>AniBot</Text>
                                    </View>
                                    <View style={{ paddingLeft: 34 }}>
                                        <TypingDots color={colors.textGrey} />
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>

                {/* Scroll-to-bottom FAB */}
                {showScrollBtn && (
                    <TouchableOpacity
                        onPress={() => scrollToBottom()}
                        activeOpacity={0.85}
                        style={{
                            position: 'absolute', right: 16, bottom: 72,
                            width: 34, height: 34, borderRadius: 17,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            alignItems: 'center', justifyContent: 'center',
                            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: isDark ? 0.4 : 0.1, shadowRadius: 4, elevation: 4,
                        }}
                    >
                        <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.text} />
                    </TouchableOpacity>
                )}

                {/* ── Input bar ───────────────────────────────────────────────── */}
                <View style={{
                    backgroundColor: colors.surface,
                    borderTopWidth: 1, borderTopColor: colors.stroke,
                    paddingHorizontal: 16, paddingVertical: 10,
                    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
                }}>
                    <View style={{
                        flex: 1,
                        backgroundColor: colors.inputFill,
                        borderWidth: 1,
                        borderColor: input.length > 0 ? colors.primary + '60' : colors.stroke,
                        borderRadius: 12, overflow: 'hidden',
                        paddingHorizontal: 14, paddingVertical: 10,
                        minHeight: 44, maxHeight: 130,
                        justifyContent: 'center',
                    }}>
                        <TextInput
                            style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text, padding: 0, margin: 0 }}
                            placeholder="Message AniBot"
                            placeholderTextColor={colors.textGrey}
                            value={input}
                            onChangeText={setInput}
                            multiline
                            returnKeyType="default"
                            blurOnSubmit={false}
                        />
                    </View>
                    <Pressable
                        onPress={() => send(input)}
                        disabled={!input.trim() || isLoading}
                        style={({ pressed }) => ({
                            width: 44, height: 44, borderRadius: 10,
                            backgroundColor: (!input.trim() || isLoading) ? colors.cardFill : colors.primary,
                            alignItems: 'center', justifyContent: 'center',
                            opacity: pressed ? 0.8 : 1,
                        })}
                    >
                        <MaterialIcons
                            name="arrow-upward"
                            size={20}
                            color={(!input.trim() || isLoading) ? colors.textGrey : '#fff'}
                        />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>

            {/* Copied toast */}
            {copiedToast && (
                <View style={{
                    position: 'absolute', bottom: 80, alignSelf: 'center',
                    backgroundColor: colors.text, borderRadius: 20,
                    paddingHorizontal: 16, paddingVertical: 8,
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                }}>
                    <MaterialIcons name="check" size={13} color={colors.surface} />
                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 13, color: colors.surface }}>
                        Copied to clipboard
                    </Text>
                </View>
            )}

            {/* ── Sidebar drawer ────────────────────────────────────────────── */}
            <Sidebar
                visible={sidebarOpen}
                conversations={conversations}
                activeId={activeConvId}
                onClose={() => setSidebarOpen(false)}
                onSelect={selectConversation}
                onNew={startNewChat}
                onDelete={deleteConversation}
            />
        </SafeAreaView>
    );
}

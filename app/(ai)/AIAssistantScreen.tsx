import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from '@/lib/nativeAudio';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTheme } from '@/context/ThemeContext';
import { anibotChat, ChatMessage, NavLink, transcribeAudio } from '@/lib/ai';
import { useAIAssistantStyles, SIDEBAR_W as _SIDEBAR_W, HISTORY_MAX as _HISTORY_MAX } from '@/styles/aiAssistantStyles';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_W = _SIDEBAR_W;
const HISTORY_MAX = _HISTORY_MAX;

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
    imageUri?: string;   // local URI stored for display in user bubbles
}

interface AttachedImage {
    uri: string;
    base64: string;
    mediaType: string;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const convsKey = (fid: string) => `anibot_convs_${fid}`;
const msgsKey = (cid: string) => `anibot_msgs_${cid}`;
const legacyKey = (fid: string) => `anibot_history_${fid}`;
const newConvId = () => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n).trimEnd() + '…' : s;

// ─── Grouping ─────────────────────────────────────────────────────────────────

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];

function groupLabel(ts: number) {
    const diff = Math.floor((Date.now() - ts) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff <= 7) return 'Previous 7 Days';
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
            Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: Platform.OS !== 'web' }),
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
        Animated.timing(opacity, { toValue: isVisible ? 1 : 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start();
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
    const slideX = useRef(new Animated.Value(-SIDEBAR_W)).current;
    const backdropO = useRef(new Animated.Value(0)).current;
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideX, { toValue: visible ? 0 : -SIDEBAR_W, duration: 240, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(backdropO, { toValue: visible ? 1 : 0, duration: 240, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
        if (!visible) setDeleteTarget(null);
    }, [visible]);

    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    const groups = groupConversations(sorted);
    const sidebarBg = isDark ? '#0f0f0f' : '#f7f7f5';

    return (
        <>
            {/* Backdrop */}
            <Animated.View
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    opacity: backdropO,
                    zIndex: 100,
                    pointerEvents: visible ? 'auto' : 'none',
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
                                        const isDel = deleteTarget === conv.id;
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
    const router = useRouter();
    const { styles } = useAIAssistantStyles();

    const handleClose = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.back();
    }, []);

    const farmId = (profile as any)?.farm_id ?? '';
    const userId = (profile as any)?.uid ?? (profile as any)?.id ?? '';
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? 'Your Farm';
    const { managedFarms, isFarmAdmin, isMultiFarm } = useFarmFilter();

    // ── AniBot farm scope (admin-only) ────────────────────────────────────────
    // null = "All Farms", string = specific farm ID
    const [anibotFarmId, setAnibotFarmId] = useState<string | null>(null);

    const anibotActiveFarmId = anibotFarmId ?? managedFarms[0]?.id ?? farmId;
    const anibotActiveFarmIds = anibotFarmId
        ? [anibotFarmId]
        : managedFarms.length > 0 ? managedFarms.map(f => f.id) : [farmId];
    const anibotActiveFarmName = anibotFarmId
        ? (managedFarms.find(f => f.id === anibotFarmId)?.name ?? farmName)
        : isMultiFarm ? 'All Farms' : farmName;

    // ── State ─────────────────────────────────────────────────────────────────
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [historyReady, setHistoryReady] = useState(false);
    const [activeMsg, setActiveMsg] = useState<number | null>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [copiedToast, setCopiedToast] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // ── Image attachment ──────────────────────────────────────────────────────
    const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);

    // ── Voice recording ───────────────────────────────────────────────────────
    const [recording, setRecording] = useState<any>(null);
    const webMediaRecorderRef = useRef<MediaRecorder | null>(null); // ref so stop handler always sees current value
    const webChunksRef = useRef<Blob[]>([]);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0); // 0–1 for waveform indicator

    const scrollRef = useRef<ScrollView>(null);
    const atBottom = useRef(true);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
            if (convsRaw) { try { convs = JSON.parse(convsRaw); } catch { } }

            // Migrate legacy single-conversation history
            if (convs.length === 0) {
                const legacyRaw = await AsyncStorage.getItem(legacyKey(farmId));
                if (legacyRaw) {
                    try {
                        const legacyMsgs: StoredMessage[] = JSON.parse(legacyRaw);
                        if (legacyMsgs.length > 0) {
                            const firstUser = legacyMsgs.find(m => m.role === 'user');
                            const lastMsg = legacyMsgs[legacyMsgs.length - 1];
                            const id = newConvId();
                            const conv: Conversation = {
                                id,
                                title: trunc(firstUser?.content ?? 'Previous chat', 40),
                                preview: trunc(lastMsg.content.replace(/\[NAV:[^\]]+\]/g, '').trim(), 60),
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
                    } catch { }
                }
            }

            setConversations(convs);
            // Always open as a new chat — history is accessible via the sidebar
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
        // Strip blob: imageURIs before persisting — they're session-only on web
        const toSave = Platform.OS === 'web'
            ? msgs.map(m => m.imageUri?.startsWith('blob:') ? { ...m, imageUri: undefined } : m)
            : msgs;
        await AsyncStorage.setItem(msgsKey(cid), JSON.stringify(toSave.slice(-HISTORY_MAX)));
    }, []);

    // ── Image handlers ────────────────────────────────────────────────────────
    const handlePickImage = useCallback(async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.7,
            base64: true,
        });
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setAttachedImage({
                uri: asset.uri,
                base64: asset.base64 ?? '',
                mediaType: asset.mimeType ?? 'image/jpeg',
            });
        }
    }, []);

    const handleTakePhoto = useCallback(async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { return; }
        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.7,
            base64: true,
        });
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setAttachedImage({
                uri: asset.uri,
                base64: asset.base64 ?? '',
                mediaType: asset.mimeType ?? 'image/jpeg',
            });
        }
    }, []);

    // ── Voice handlers ────────────────────────────────────────────────────────
    const stopAudioMeter = useCallback(() => {
        if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
        if (analyserRef.current) { analyserRef.current = null; }
        setAudioLevel(0);
    }, []);

    const handleStartRecording = useCallback(async () => {
        try {
            if (Platform.OS === 'web') {
                const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });

                // Real-time audio level meter via Web Audio API
                try {
                    const audioCtx = new (window as any).AudioContext();
                    const analyser: AnalyserNode = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    audioCtx.createMediaStreamSource(stream).connect(analyser);
                    analyserRef.current = analyser;
                    const dataArr = new Uint8Array(analyser.frequencyBinCount);
                    const tick = () => {
                        analyser.getByteFrequencyData(dataArr);
                        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
                        setAudioLevel(Math.min(1, avg / 60));
                        animFrameRef.current = requestAnimationFrame(tick);
                    };
                    tick();
                } catch { }

                const mimeType = (window as any).MediaRecorder?.isTypeSupported?.('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm';
                const mr = new (window as any).MediaRecorder(stream, { mimeType });
                webChunksRef.current = [];
                mr.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size > 0) webChunksRef.current.push(e.data); };
                mr.onerror = (e: Event) => console.error('[AniBot] MediaRecorder error:', e);
                mr.start(100);
                webMediaRecorderRef.current = mr;
            } else {
                const { status } = await Audio.requestPermissionsAsync();
                if (status !== 'granted') return;
                await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
                const { recording: rec } = await Audio.Recording.createAsync(
                    Audio.RecordingOptionsPresets.HIGH_QUALITY
                );
                setRecording(rec);
            }
            setIsRecording(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {
            console.error('[AniBot] startRecording error', e);
        }
    }, []);

    const handleStopRecording = useCallback(async () => {
        setIsRecording(false);
        stopAudioMeter();
        setIsTranscribing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            if (Platform.OS === 'web') {
                const mr = webMediaRecorderRef.current;
                if (!mr) {
                    // Recording never started (e.g. mic permission denied)
                    setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
                    setIsTranscribing(false);
                    return;
                }

                const recMime = mr.mimeType || 'audio/webm';
                const blob = await new Promise<Blob>((resolve) => {
                    mr.onstop = () => {
                        // Stop all mic tracks to release the mic indicator
                        try { mr.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch { }
                        resolve(new Blob(webChunksRef.current, { type: recMime }));
                    };
                    const state = (mr as any).state as string;
                    if (state === 'recording' || state === 'paused') {
                        // requestData() flushes any buffered audio before stop() fires ondataavailable
                        try { mr.requestData(); } catch { }
                        mr.stop();
                    } else {
                        // Already inactive — resolve with whatever chunks we have
                        try { mr.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch { }
                        resolve(new Blob(webChunksRef.current, { type: recMime }));
                    }
                });
                webMediaRecorderRef.current = null;

                if (blob.size < 200) {
                    // Too short — show fallback
                    setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
                    setIsTranscribing(false);
                    return;
                }

                const cleanMime = blob.type.split(';')[0] || 'audio/webm';
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        const b64 = result?.split(',')[1];
                        if (b64) resolve(b64);
                        else reject(new Error('FileReader: empty result'));
                    };
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(blob);
                });

                const transcript = await transcribeAudio(base64, cleanMime);
                if (transcript) {
                    setInput(prev => prev ? `${prev} ${transcript}` : transcript);
                } else {
                    setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
                }
            } else {
                if (!recording) {
                    setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
                    setIsTranscribing(false);
                    return;
                }
                await recording.stopAndUnloadAsync();
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
                const uri = recording.getURI();
                setRecording(null);
                if (!uri) {
                    setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
                    setIsTranscribing(false);
                    return;
                }
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
                const transcript = await transcribeAudio(base64, 'audio/m4a');
                if (transcript) {
                    setInput(prev => prev ? `${prev} ${transcript}` : transcript);
                } else {
                    setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
                }
            }
        } catch (e) {
            console.error('[AniBot] stopRecording error', e);
            // Always give the user visible feedback on failure
            setInput(prev => prev || '🎤 Voice message (transcription unavailable)');
        } finally {
            setIsTranscribing(false);
        }
    }, [recording, stopAudioMeter]);

    // ── Send ──────────────────────────────────────────────────────────────────
    const send = useCallback(async (text: string, historyOverride?: StoredMessage[]) => {
        const trimmed = text.trim();
        if ((!trimmed && !attachedImage) || isLoading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setActiveMsg(null);

        const base = historyOverride ?? messages;
        const imgSnapshot = attachedImage;       // capture before clearing
        const userMsg: StoredMessage = {
            role: 'user',
            content: trimmed || '📷 [Image attached]',
            ts: Date.now(),
            imageUri: imgSnapshot?.uri,           // stored for display only (no base64)
        };
        const history = [...base, userMsg];
        setMessages(history);
        setInput('');
        setAttachedImage(null);                   // clear attachment
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
            const reply = await anibotChat(apiMsgs, {
                farmId: anibotActiveFarmId,
                farmName: anibotActiveFarmName,
                userId,
                farmIds: anibotActiveFarmIds,
                managedFarms,
                imageData: imgSnapshot?.base64,
                imageMediaType: imgSnapshot?.mediaType,
            });
            const botMsg: StoredMessage = {
                role: 'assistant', content: reply.text, ts: Date.now(),
                navigation: reply.navigation.length > 0 ? reply.navigation : undefined,
            };
            const updated = [...history, botMsg];
            setMessages(updated);

            const preview = trunc(reply.text.replace(/\[NAV:[^\]]+\]/g, '').trim(), 60);
            const fConvId = convId;
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
    }, [messages, isLoading, attachedImage, anibotActiveFarmId, anibotActiveFarmName, anibotActiveFarmIds, managedFarms, userId, scrollToBottom, saveConvs, saveMsgs]);

    // ── Conversation actions ───────────────────────────────────────────────────
    const selectConversation = useCallback(async (id: string) => {
        if (id === activeConvId) { setSidebarOpen(false); return; }
        setActiveConvId(id);
        setMessages([]);
        setActiveMsg(null);
        setSidebarOpen(false);
        const raw = await AsyncStorage.getItem(msgsKey(id));
        if (raw) { try { setMessages(JSON.parse(raw)); } catch { } }
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
        const lastUser = [...withoutLast].reverse().find(m => m.role === 'user');
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
        <SafeAreaView style={styles.safeArea}>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <View style={styles.header}>
                {/* Sidebar toggle */}
                <TouchableOpacity
                    onPress={() => setSidebarOpen(true)}
                    activeOpacity={0.6}
                    style={styles.headerIconBtn}
                >
                    <MaterialIcons name="menu" size={22} color={colors.textGrey} />
                </TouchableOpacity>

                {/* Title + status */}
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>AniBot</Text>
                    <View style={styles.headerStatusRow}>
                        <View style={[
                            styles.headerStatusDot,
                            { backgroundColor: isLoading ? colors.warning : '#22c55e' },
                        ]} />
                        <Text style={styles.headerStatusText}>
                            {isLoading ? 'Thinking…' : anibotActiveFarmName}
                        </Text>
                    </View>
                </View>

                {/* New chat (compose) */}
                <TouchableOpacity
                    onPress={startNewChat}
                    activeOpacity={0.6}
                    style={styles.headerIconBtnRight}
                >
                    <MaterialIcons name="edit-note" size={22} color={colors.textGrey} />
                </TouchableOpacity>

                {/* Close / go back */}
                <TouchableOpacity
                    onPress={handleClose}
                    activeOpacity={0.7}
                    style={styles.minimizeBtn}
                >
                    <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textGrey} />
                </TouchableOpacity>
            </View>

            {/* ── Farm Scope Selector (admin with multiple farms only) ──────── */}
            {isFarmAdmin && isMultiFarm && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{
                        flexGrow: 0,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.stroke,
                        backgroundColor: colors.bg,
                    }}
                    contentContainerStyle={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        gap: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    {/* All Farms chip */}
                    <TouchableOpacity
                        onPress={() => setAnibotFarmId(null)}
                        activeOpacity={0.7}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingHorizontal: 12, paddingVertical: 5,
                            borderRadius: 20,
                            backgroundColor: anibotFarmId === null ? colors.primary : colors.cardFill,
                            borderWidth: 1,
                            borderColor: anibotFarmId === null ? colors.primary : colors.stroke,
                        }}
                    >
                        <MaterialIcons
                            name="domain"
                            size={13}
                            color={anibotFarmId === null ? '#fff' : colors.textGrey}
                        />
                        <Text style={{
                            fontFamily: 'Poppins-Medium', fontSize: 12,
                            color: anibotFarmId === null ? '#fff' : colors.textGrey,
                        }}>All Farms</Text>
                    </TouchableOpacity>

                    {/* Per-farm chips */}
                    {managedFarms.map(farm => {
                        const selected = anibotFarmId === farm.id;
                        return (
                            <TouchableOpacity
                                key={farm.id}
                                onPress={() => setAnibotFarmId(farm.id)}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 5,
                                    paddingHorizontal: 12, paddingVertical: 5,
                                    borderRadius: 20,
                                    backgroundColor: selected ? colors.primary : colors.cardFill,
                                    borderWidth: 1,
                                    borderColor: selected ? colors.primary : colors.stroke,
                                }}
                            >
                                <MaterialIcons
                                    name="agriculture"
                                    size={13}
                                    color={selected ? '#fff' : colors.textGrey}
                                />
                                <Text style={{
                                    fontFamily: 'Poppins-Medium', fontSize: 12,
                                    color: selected ? '#fff' : colors.textGrey,
                                }}>{farm.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >

                {/* ── Messages ───────────────────────────────────────────────── */}
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={80}
                    onContentSizeChange={() => { if (atBottom.current) scrollToBottom(false); }}
                    onTouchStart={() => { if (activeMsg !== null) setActiveMsg(null); }}
                >
                    {/* ── Empty state ─────────────────────────────────────────── */}
                    {isEmpty && (
                        <View style={styles.emptyWrap}>
                            <View style={styles.emptyIconBox}>
                                <MaterialIcons name="smart-toy" size={36} color="#fff" />
                            </View>
                            <Text style={styles.emptyTitle}>How can I help you today?</Text>
                            <Text style={styles.emptySubtitle}>
                                I have full access to your farm data and can take actions on your behalf.
                            </Text>
                            <View style={styles.quickPromptsWrap}>
                                {QUICK_PROMPTS.map((q, i) => (
                                    <Pressable
                                        key={i}
                                        onPress={() => send(q)}
                                        style={({ pressed }) => [
                                            styles.quickPromptItem,
                                            pressed && styles.quickPromptItemPressed,
                                        ]}
                                    >
                                        <View style={styles.quickPromptDot} />
                                        <Text style={styles.quickPromptText}>{q}</Text>
                                        <MaterialIcons name="arrow-forward-ios" size={12} color={colors.primary + '90'} />
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* ── Conversation ────────────────────────────────────────── */}
                    {!isEmpty && (
                        <View style={styles.convWrap}>
                            {messages.map((msg, idx) => {
                                const isUser = msg.role === 'user';
                                const isLast = idx === messages.length - 1;
                                const showDate = diffDay(messages[idx - 1], msg);
                                const isActive = activeMsg === idx;
                                const isLastBot = !isUser && isLast && !isLoading;

                                return (
                                    <View key={idx}>
                                        {showDate && <DateSeparator label={dateLabel(msg.ts)} />}

                                        {/* User bubble */}
                                        {isUser && (
                                            <Pressable
                                                onPress={() => setActiveMsg(isActive ? null : idx)}
                                                onLongPress={() => copy(msg.content)}
                                                style={styles.userBubbleWrap}
                                            >
                                                {msg.imageUri && (
                                                    <Image
                                                        source={{ uri: msg.imageUri }}
                                                        style={{
                                                            width: 180, height: 180,
                                                            borderRadius: 12,
                                                            marginBottom: 6,
                                                            alignSelf: 'flex-end',
                                                        }}
                                                        resizeMode="cover"
                                                    />
                                                )}
                                                {(msg.content !== '📷 [Image attached]' || !msg.imageUri) && (
                                                    <View style={styles.userBubble}>
                                                        <Text style={styles.userBubbleText}>{msg.content}</Text>
                                                    </View>
                                                )}
                                                <Text style={styles.bubbleTime}>{fmt12(msg.ts)}</Text>
                                            </Pressable>
                                        )}

                                        {/* Bot message */}
                                        {!isUser && (
                                            <Pressable
                                                onPress={() => setActiveMsg(isActive ? null : idx)}
                                                onLongPress={() => copy(msg.content)}
                                                style={styles.botMsgWrap}
                                            >
                                                <View style={styles.botAvatarRow}>
                                                    <View style={styles.botAvatar}>
                                                        <MaterialIcons name="smart-toy" size={14} color="#fff" />
                                                    </View>
                                                    <Text style={styles.botName}>AniBot</Text>
                                                </View>
                                                <View style={styles.botContentWrap}>
                                                    <MarkdownText text={msg.content} baseColor={colors.text} dimColor={colors.textGrey} />
                                                    {msg.navigation && msg.navigation.length > 0 && (
                                                        <View style={styles.botNavWrap}>
                                                            {msg.navigation.map((link, j) => <NavButton key={j} link={link} />)}
                                                        </View>
                                                    )}
                                                    <Text style={styles.botMsgTime}>{fmt12(msg.ts)}</Text>
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
                                <View style={styles.typingWrap}>
                                    <View style={styles.botAvatarRow}>
                                        <View style={styles.botAvatar}>
                                            <MaterialIcons name="smart-toy" size={14} color="#fff" />
                                        </View>
                                        <Text style={styles.botName}>AniBot</Text>
                                    </View>
                                    <View style={styles.botContentWrap}>
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
                        style={styles.scrollFab}
                    >
                        <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.text} />
                    </TouchableOpacity>
                )}

                {/* ── Image attachment preview ─────────────────────────────── */}
                {attachedImage && (
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 14, paddingBottom: 8,
                    }}>
                        <View style={{ position: 'relative' }}>
                            <Image
                                source={{ uri: attachedImage.uri }}
                                style={{ width: 64, height: 64, borderRadius: 10 }}
                                resizeMode="cover"
                            />
                            <TouchableOpacity
                                onPress={() => setAttachedImage(null)}
                                style={{
                                    position: 'absolute', top: -6, right: -6,
                                    width: 20, height: 20, borderRadius: 10,
                                    backgroundColor: colors.error,
                                    alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <MaterialIcons name="close" size={13} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <Text style={{
                            fontFamily: 'Poppins-Regular', fontSize: 12,
                            color: colors.textGrey, marginLeft: 10,
                        }}>Image attached</Text>
                    </View>
                )}

                {/* ── Input bar ───────────────────────────────────────────────── */}
                <View style={styles.inputBar}>
                    {/* Camera / Gallery buttons */}
                    <TouchableOpacity
                        onPress={handleTakePhoto}
                        activeOpacity={0.7}
                        style={{
                            width: 36, height: 36, borderRadius: 18,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: colors.cardFill,
                            borderWidth: 1, borderColor: colors.stroke,
                        }}
                    >
                        <MaterialIcons name="photo-camera" size={18} color={colors.textGrey} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handlePickImage}
                        activeOpacity={0.7}
                        style={{
                            width: 36, height: 36, borderRadius: 18,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: colors.cardFill,
                            borderWidth: 1, borderColor: colors.stroke,
                        }}
                    >
                        <MaterialIcons name="image" size={18} color={colors.textGrey} />
                    </TouchableOpacity>

                    {/* Text input */}
                    <View style={[
                        styles.inputWrap,
                        (input.length > 0 || !!attachedImage) && styles.inputWrapFocused,
                        { flex: 1 },
                    ]}>
                        <TextInput
                            style={styles.inputField}
                            placeholder={isTranscribing ? 'Transcribing…' : 'Message AniBot'}
                            placeholderTextColor={colors.textGrey}
                            value={input}
                            onChangeText={setInput}
                            multiline
                            returnKeyType="default"
                            blurOnSubmit={false}
                            editable={!isTranscribing}
                        />
                    </View>

                    {/* Mic button (hold to record) or Send button */}
                    {!input.trim() && !attachedImage ? (
                        <View style={{ alignItems: 'center', gap: 2 }}>
                            {/* Live waveform bars — visible while recording */}
                            {isRecording && (
                                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16, marginBottom: 2 }}>
                                    {[0.5, 0.8, 1.0, 0.8, 0.5].map((m, i) => (
                                        <View key={i} style={{
                                            width: 3,
                                            height: Math.max(3, audioLevel * 16 * m),
                                            backgroundColor: colors.error,
                                            borderRadius: 2,
                                        }} />
                                    ))}
                                </View>
                            )}
                            <TouchableOpacity
                                onPressIn={handleStartRecording}
                                onPressOut={handleStopRecording}
                                activeOpacity={0.8}
                                style={{
                                    width: 40, height: 40, borderRadius: 20,
                                    alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isRecording ? colors.error : colors.cardFill,
                                    borderWidth: 1, borderColor: isRecording ? colors.error : colors.stroke,
                                }}
                            >
                                <MaterialIcons
                                    name={isTranscribing ? 'hourglass-empty' : isRecording ? 'graphic-eq' : 'mic'}
                                    size={20}
                                    color={isRecording ? '#fff' : colors.textGrey}
                                />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <Pressable
                            onPress={() => send(input)}
                            disabled={(!input.trim() && !attachedImage) || isLoading}
                            style={({ pressed }) => [
                                styles.sendBtn,
                                ((!input.trim() && !attachedImage) || isLoading) ? styles.sendBtnDisabled : styles.sendBtnActive,
                                { opacity: pressed ? 0.8 : 1 },
                            ]}
                        >
                            <MaterialIcons
                                name="arrow-upward"
                                size={20}
                                color={((!input.trim() && !attachedImage) || isLoading) ? colors.textGrey : '#fff'}
                            />
                        </Pressable>
                    )}
                </View>
            </KeyboardAvoidingView>

            {/* Copied toast */}
            {copiedToast && (
                <View style={styles.toast}>
                    <MaterialIcons name="check" size={13} color={colors.surface} />
                    <Text style={styles.toastText}>Copied to clipboard</Text>
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

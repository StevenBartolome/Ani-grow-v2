import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Switch,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { AniFeedIcon } from '@/components/AniFeedIcon';
import { AniWeighIcon } from '@/components/AniWeighIcon';
import { Text } from '@/components/Text';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

// ── types ──────────────────────────────────────────────────────

type PermissionKey =
    | 'devices:view' | 'devices:create' | 'devices:edit' | 'devices:delete'
    | 'aniweigh:control' | 'anifeed:dispense' | 'feeds:manage' | 'housing:manage' | 'segregation:manage'
    | 'animals:view' | 'animals:create' | 'animals:edit' | 'animals:delete'
    | 'health:view' | 'health:create' | 'health:edit' | 'vaccine:manage' | 'mortality:manage'
    | 'reports:view' | 'predictions:view' | 'predictions:configure' | 'ai_assistant:use'
    | 'farms:manage' | 'staff:invite' | 'staff:manage_roles' | 'settings:manage';

type Permissions = Partial<Record<PermissionKey, boolean>>;

type InviteRole   = 'caretaker' | 'veterinarian' | 'flockman';
type InviteStatus = 'unused' | 'used' | 'expired';

interface PermissionItem {
    key: PermissionKey;
    label: string;
    icon: string;
}

interface PermissionCategory {
    id: string;
    label: string;
    shortLabel: string;
    icon: string;
    permissions: PermissionItem[];
}

interface InviteCode {
    id: string;
    code: string;
    role: InviteRole;
    permissions: Permissions;
    status: InviteStatus;
    expires_at: string;
    created_at: string;
    used_at: string | null;
}

// ── permission categories ──────────────────────────────────────

const PERMISSION_CATEGORIES: PermissionCategory[] = [
    {
        id: 'devices', label: 'Devices & Hardware', shortLabel: 'Devices', icon: 'devices',
        permissions: [
            { key: 'devices:view',       label: 'View Devices',            icon: 'visibility' },
            { key: 'devices:create',     label: 'Register Devices',        icon: 'add-circle-outline' },
            { key: 'devices:edit',       label: 'Edit Device Settings',    icon: 'tune' },
            { key: 'devices:delete',     label: 'Remove Devices',          icon: 'delete-outline' },
            { key: 'aniweigh:control',   label: 'Remote Scale Control',    icon: 'monitor-weight' },
            { key: 'anifeed:dispense',   label: 'Manual Feed Dispense',    icon: 'restaurant' },
            { key: 'feeds:manage',       label: 'Manage Feeds & Formulas', icon: 'grain' },
            { key: 'housing:manage',     label: 'Manage Housings & Pens',  icon: 'home-work' },
            { key: 'segregation:manage', label: 'Manage Sorting Criteria', icon: 'sort' },
        ],
    },
    {
        id: 'animals', label: 'Animals Management', shortLabel: 'Animals', icon: 'pets',
        permissions: [
            { key: 'animals:view',   label: 'View Animals',       icon: 'visibility' },
            { key: 'animals:create', label: 'Add Animals',         icon: 'add-circle-outline' },
            { key: 'animals:edit',   label: 'Edit Animal Records', icon: 'edit' },
            { key: 'animals:delete', label: 'Archive Animals',     icon: 'archive' },
        ],
    },
    {
        id: 'health', label: 'Health & Medical', shortLabel: 'Health', icon: 'medical-services',
        permissions: [
            { key: 'health:view',      label: 'View Health Records',     icon: 'visibility' },
            { key: 'health:create',    label: 'Create Health Records',   icon: 'add-circle-outline' },
            { key: 'health:edit',      label: 'Edit Health Records',     icon: 'edit' },
            { key: 'vaccine:manage',   label: 'Manage Vaccines & Doses', icon: 'vaccines' },
            { key: 'mortality:manage', label: 'Record Mortalities',      icon: 'remove-circle-outline' },
        ],
    },
    {
        id: 'analytics', label: 'Reports & Analytics', shortLabel: 'Analytics', icon: 'analytics',
        permissions: [
            { key: 'reports:view',          label: 'View Production Reports', icon: 'bar-chart' },
            { key: 'predictions:view',      label: 'View AI Predictions',     icon: 'trending-up' },
            { key: 'predictions:configure', label: 'Configure AI Rules',      icon: 'tune' },
            { key: 'ai_assistant:use',      label: 'Access AI Assistant',     icon: 'chat' },
        ],
    },
    {
        id: 'administration', label: 'Farm & Administration', shortLabel: 'Admin', icon: 'settings',
        permissions: [
            { key: 'farms:manage',       label: 'Manage Farms & Layouts',     icon: 'location-on' },
            { key: 'staff:invite',       label: 'Manage Invite Codes',        icon: 'vpn-key' },
            { key: 'staff:manage_roles', label: 'Manage Roles & Permissions', icon: 'group' },
            { key: 'settings:manage',    label: 'System Configurations',      icon: 'settings' },
        ],
    },
];

const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.key));

// ── role defaults ──────────────────────────────────────────────

const ROLE_DEFAULTS: Record<InviteRole, Permissions> = {
    caretaker: {
        'devices:view': true, 'anifeed:dispense': true, 'feeds:manage': true, 'housing:manage': true,
        'animals:view': true, 'animals:create': true, 'animals:edit': true,
        'health:view': true, 'health:create': true, 'reports:view': true,
    },
    veterinarian: {
        'devices:view': true,
        'animals:view': true, 'animals:edit': true,
        'health:view': true, 'health:create': true, 'health:edit': true, 'vaccine:manage': true, 'mortality:manage': true,
        'reports:view': true, 'predictions:view': true, 'ai_assistant:use': true,
    },
    flockman: {
        'devices:view': true, 'devices:edit': true, 'aniweigh:control': true,
        'anifeed:dispense': true, 'feeds:manage': true, 'housing:manage': true, 'segregation:manage': true,
        'animals:view': true, 'animals:create': true, 'animals:edit': true,
        'health:view': true, 'reports:view': true, 'predictions:view': true,
    },
};

// ── constants ──────────────────────────────────────────────────

const ROLE_LABELS: Record<InviteRole, string> = {
    caretaker: 'Caretaker', veterinarian: 'Veterinarian', flockman: 'Flockman',
};

const ROLE_COLORS: Record<InviteRole, string> = {
    caretaker: '#10B981', veterinarian: '#3B82F6', flockman: '#F59E0B',
};

function generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return code;
}

function formatExpiry(dateStr: string): string {
    const date = new Date(dateStr);
    const now  = new Date();
    const diffMs   = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label    = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    if (diffMs < 0)    return `Expired ${label}`;
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires ${label} (${diffDays}d)`;
}

// ── PermissionCategoryRow sub-component ───────────────────────

interface PermissionCategoryRowProps {
    category: PermissionCategory;
    permissions: Permissions;
    onBatchChange: (updates: Permissions) => void;
    onToggle: (key: PermissionKey, value: boolean) => void;
    colors: any;
}

function PermissionCategoryRow({ category, permissions, onBatchChange, onToggle, colors }: PermissionCategoryRowProps) {
    const [expanded, setExpanded] = useState(false);
    const rotateAnim = useRef(new Animated.Value(0)).current;

    const activeCount = category.permissions.filter(p => permissions[p.key]).length;
    const allActive   = activeCount === category.permissions.length;

    const handleToggleExpand = () => {
        Animated.timing(rotateAnim, {
            toValue: expanded ? 0 : 1,
            duration: 200,
            useNativeDriver: true,
        }).start();
        setExpanded(v => !v);
    };

    const handleSelectAll = () => {
        const next = !allActive;
        const batch: Permissions = {};
        category.permissions.forEach(p => { batch[p.key] = next; });
        onBatchChange(batch);
    };

    const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

    return (
        <View style={{
            borderRadius: 14, overflow: 'hidden',
            borderWidth: 1.5,
            borderColor: activeCount > 0 ? colors.primary + '60' : colors.stroke,
            marginBottom: 8,
        }}>
            {/* Category header */}
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleToggleExpand}
                style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, paddingHorizontal: 14,
                    backgroundColor: activeCount > 0 ? colors.primary + '0D' : colors.bgLight,
                }}
            >
                {category.icon === 'pets' ? (
                    <Image
                        source={require('../../assets/icons/animals-filled.svg')}
                        style={{ width: 20, height: 20 }}
                        contentFit="contain"
                    />
                ) : (
                    <MaterialIcons
                        name={category.icon as any}
                        size={20}
                        color={activeCount > 0 ? colors.primary : colors.textGrey}
                    />
                )}
                <Text style={{
                    flex: 1, fontFamily: 'Poppins-SemiBold', fontSize: 14,
                    color: activeCount > 0 ? colors.text : colors.textGrey,
                }}>
                    {category.label}
                </Text>
                {activeCount > 0 && (
                    <View style={{
                        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
                        backgroundColor: colors.primary + '20',
                    }}>
                        <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 11, color: colors.primary }}>
                            {activeCount}/{category.permissions.length}
                        </Text>
                    </View>
                )}
                {/* Select-all switch */}
                <TouchableOpacity onPress={handleSelectAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Switch
                        value={allActive}
                        onValueChange={handleSelectAll}
                        trackColor={{ false: colors.stroke, true: colors.primary }}
                        thumbColor="#FFFFFF"
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
                </TouchableOpacity>
                <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                    <MaterialIcons name="expand-more" size={20} color={colors.textGrey} />
                </Animated.View>
            </TouchableOpacity>

            {/* Individual permission rows */}
            {expanded && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.stroke }}>
                    {category.permissions.map((p, idx) => {
                        const active  = permissions[p.key] ?? false;
                        const isLast  = idx === category.permissions.length - 1;
                        return (
                            <View
                                key={p.key}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 12,
                                    paddingHorizontal: 14, paddingVertical: 11,
                                    borderBottomWidth: isLast ? 0 : 1,
                                    borderBottomColor: colors.stroke,
                                    backgroundColor: active ? colors.primary + '06' : 'transparent',
                                }}
                            >
                                {p.key === 'aniweigh:control' ? (
                                    <AniWeighIcon size={17} />
                                ) : p.key === 'anifeed:dispense' ? (
                                    <AniFeedIcon size={17} />
                                ) : (
                                    <MaterialIcons name={p.icon as any} size={17} color={active ? colors.primary : colors.textGrey} />
                                )}
                                <Text style={{
                                    flex: 1, fontFamily: 'Poppins-Medium', fontSize: 13,
                                    color: active ? colors.text : colors.textGrey,
                                }}>
                                    {p.label}
                                </Text>
                                <Switch
                                    value={active}
                                    onValueChange={val => onToggle(p.key, val)}
                                    trackColor={{ false: colors.stroke, true: colors.primary }}
                                    thumbColor="#FFFFFF"
                                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                />
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

// ── main component ─────────────────────────────────────────────

export default function InviteCodesScreen() {
    const { colors }    = useTheme();
    const textStyles    = useTextStyles();
    const insets        = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { profile }   = useAuth();
    const farmId        = (profile as any)?.farm_id;
    const userId        = (profile as any)?.id;

    const [codes,      setCodes]      = useState<InviteCode[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [copiedId,   setCopiedId]   = useState<string | null>(null);

    const [modalVisible,  setModalVisible]  = useState(false);
    const [selectedRole,  setSelectedRole]  = useState<InviteRole>('caretaker');
    const [permissions,   setPermissions]   = useState<Permissions>({ ...ROLE_DEFAULTS.caretaker });
    const [generating,    setGenerating]    = useState(false);

    const slideAnim = useRef(new Animated.Value(600)).current;

    useEffect(() => {
        if (modalVisible) {
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideAnim.setValue(600);
        }
    }, [modalVisible]);

    // Auto-fill permissions when role changes
    useEffect(() => {
        setPermissions({ ...ROLE_DEFAULTS[selectedRole] });
    }, [selectedRole]);

    // ── data ────────────────────────────────────────────────────

    const fetchCodes = useCallback(async (isRefresh = false) => {
        if (!farmId) { setLoading(false); return; }
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            await supabase.rpc('expire_stale_invite_codes');
            const { data, error } = await supabase
                .from('invite_codes')
                .select('id, code, role, permissions, status, expires_at, created_at, used_at')
                .eq('farm_id', farmId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            setCodes((data ?? []) as InviteCode[]);
        } catch (err) {
            console.error('[InviteCodesScreen] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [farmId]);

    useEffect(() => { fetchCodes(); }, [fetchCodes]);

    // ── actions ─────────────────────────────────────────────────

    const handleGenerate = async () => {
        if (!farmId || !userId) return;
        setGenerating(true);
        try {
            const code = generateCode();
            const { error } = await supabase
                .from('invite_codes')
                .insert({ code, farm_id: farmId, role: selectedRole, permissions, created_by: userId });
            if (error) throw error;
            setModalVisible(false);
            setSelectedRole('caretaker');
            setPermissions({ ...ROLE_DEFAULTS.caretaker });
            await fetchCodes();
        } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Failed to generate invite code.');
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = async (invite: InviteCode) => {
        await Clipboard.setStringAsync(invite.code);
        setCopiedId(invite.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleExpire = (invite: InviteCode) => {
        Alert.alert('Expire Code', `Expire code ${invite.code}? It will no longer be usable.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Expire', style: 'destructive', onPress: async () => {
                try {
                    const { error } = await supabase.from('invite_codes').update({ status: 'expired' }).eq('id', invite.id);
                    if (error) throw error;
                    await fetchCodes();
                } catch (err: any) {
                    Alert.alert('Error', err?.message ?? 'Failed to expire code.');
                }
            }},
        ]);
    };

    // ── helpers ─────────────────────────────────────────────────

    const getStatusStyle = (status: InviteStatus) => {
        switch (status) {
            case 'unused':  return { bg: colors.primary + '1A',  text: colors.primary,  label: 'Active' };
            case 'used':    return { bg: colors.textGrey + '1A', text: colors.textGrey, label: 'Used' };
            case 'expired': return { bg: '#EF44441A',            text: '#EF4444',       label: 'Expired' };
        }
    };

    const getActiveCategoryChips = (perms: Permissions) =>
        PERMISSION_CATEGORIES.map(cat => ({
            ...cat,
            activeCount: cat.permissions.filter(p => perms[p.key]).length,
        })).filter(cat => cat.activeCount > 0);

    const allPermissionsOn = ALL_PERMISSION_KEYS.every(k => permissions[k]);

    // ── render card ─────────────────────────────────────────────

    const renderCodeCard = (invite: InviteCode) => {
        const statusStyle   = getStatusStyle(invite.status);
        const roleColor     = ROLE_COLORS[invite.role];
        const isCopied      = copiedId === invite.id;
        const canAct        = invite.status === 'unused';
        const categoryChips = getActiveCategoryChips(invite.permissions);

        return (
            <View key={invite.id} style={{
                backgroundColor: colors.surface, borderRadius: 16,
                borderWidth: 1, borderColor: colors.stroke, marginBottom: 12, overflow: 'hidden',
            }}>
                {/* Code + status */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Poppins-Bold', fontSize: 20, color: colors.text, letterSpacing: 2 }}>
                            {invite.code}
                        </Text>
                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                            {formatExpiry(invite.expires_at)}
                        </Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, backgroundColor: statusStyle.bg }}>
                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: statusStyle.text }}>
                            {statusStyle.label}
                        </Text>
                    </View>
                </View>

                {/* Role + permission category chips */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{
                        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100,
                        backgroundColor: roleColor + '1A', borderWidth: 1, borderColor: roleColor + '40',
                    }}>
                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: roleColor }}>
                            {ROLE_LABELS[invite.role]}
                        </Text>
                    </View>
                    {categoryChips.map(cat => (
                        <View key={cat.id} style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100,
                            backgroundColor: colors.bgLight, borderWidth: 1, borderColor: colors.stroke,
                        }}>
                            {cat.icon === 'pets' ? (
                                <Image
                                    source={require('../../assets/icons/animals-filled.svg')}
                                    style={{ width: 11, height: 11 }}
                                    contentFit="contain"
                                />
                            ) : (
                                <MaterialIcons name={cat.icon as any} size={11} color={colors.textGrey} />
                            )}
                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>
                                {cat.shortLabel} {cat.activeCount}/{cat.permissions.length}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Actions */}
                {canAct && (
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.stroke }}>
                        <TouchableOpacity
                            activeOpacity={0.7} onPress={() => handleCopy(invite)}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.stroke }}
                        >
                            <MaterialIcons name={isCopied ? 'check' : 'content-copy'} size={16} color={isCopied ? colors.primary : colors.textGrey} />
                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 13, color: isCopied ? colors.primary : colors.textGrey }}>
                                {isCopied ? 'Copied!' : 'Copy'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.7} onPress={() => handleExpire(invite)}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}
                        >
                            <MaterialIcons name="block" size={16} color="#EF4444" />
                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 13, color: '#EF4444' }}>Expire</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    // ── render ───────────────────────────────────────────────────

    const unusedCodes  = codes.filter(c => c.status === 'unused');
    const usedCodes    = codes.filter(c => c.status === 'used');
    const expiredCodes = codes.filter(c => c.status === 'expired');

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }}>
            {/* Header */}
            <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
            }}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Invite Codes</Text>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { setSelectedRole('caretaker'); setPermissions({ ...ROLE_DEFAULTS.caretaker }); setModalVisible(true); }}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '1A', borderRadius: 12 }}
                >
                    <MaterialIcons name="add" size={24} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchCodes(true)} tintColor={colors.primary} colors={[colors.primary]} />}
            >
                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>Loading invite codes...</Text>
                    </View>
                ) : codes.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 20 }}>
                        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <MaterialIcons name="group-add" size={36} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 8 }]}>No Invite Codes Yet</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Generate a code to invite caretakers, veterinarians, or flockmen to your farm.
                        </Text>
                        <TouchableOpacity activeOpacity={0.8} onPress={() => setModalVisible(true)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 }}>
                            <MaterialIcons name="add" size={20} color="#FFF" />
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: '#FFF' }}>Generate First Code</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {unusedCodes.length > 0 && (
                            <>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                                    Active ({unusedCodes.length})
                                </Text>
                                {unusedCodes.map(renderCodeCard)}
                            </>
                        )}
                        {usedCodes.length > 0 && (
                            <>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: 1, marginTop: unusedCodes.length > 0 ? 8 : 0, marginBottom: 12 }}>
                                    Used ({usedCodes.length})
                                </Text>
                                {usedCodes.map(renderCodeCard)}
                            </>
                        )}
                        {expiredCodes.length > 0 && (
                            <>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: 1, marginTop: (unusedCodes.length + usedCodes.length) > 0 ? 8 : 0, marginBottom: 12 }}>
                                    Expired ({expiredCodes.length})
                                </Text>
                                {expiredCodes.map(renderCodeCard)}
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* ── Generate Code Modal ── */}
            <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <Animated.View style={{
                        backgroundColor: colors.surface,
                        borderTopLeftRadius: 28, borderTopRightRadius: 28,
                        padding: 24, paddingBottom: 40,
                        maxHeight: '92%',
                        transform: [{ translateY: slideAnim }],
                    }}>
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginBottom: 20 }} />

                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 4 }]}>Generate Invite Code</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginBottom: 20 }]}>
                            The code expires in 7 days. Share it with the invited staff member.
                        </Text>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Role picker */}
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text, marginBottom: 10 }}>Role</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                                {(Object.entries(ROLE_LABELS) as [InviteRole, string][]).map(([role, label]) => {
                                    const isActive  = selectedRole === role;
                                    const roleColor = ROLE_COLORS[role];
                                    return (
                                        <TouchableOpacity
                                            key={role} activeOpacity={0.7}
                                            onPress={() => setSelectedRole(role)}
                                            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: isActive ? roleColor : colors.bgLight, borderWidth: 1.5, borderColor: isActive ? roleColor : colors.stroke }}
                                        >
                                            <Text style={{ fontFamily: isActive ? 'Poppins-SemiBold' : 'Poppins-Medium', fontSize: 13, color: isActive ? '#FFF' : colors.textGrey }}>
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Permissions header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.text }}>Permissions</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        const next = allPermissionsOn ? {} : Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true])) as Permissions;
                                        setPermissions(next);
                                    }}
                                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primary + '12' }}
                                >
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.primary }}>
                                        {allPermissionsOn ? 'Clear All' : 'Select All'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Category rows */}
                            {PERMISSION_CATEGORIES.map(cat => (
                                <PermissionCategoryRow
                                    key={cat.id}
                                    category={cat}
                                    permissions={permissions}
                                    onBatchChange={updates => setPermissions(prev => ({ ...prev, ...updates }))}
                                    onToggle={(key, value) => setPermissions(prev => ({ ...prev, [key]: value }))}
                                    colors={colors}
                                />
                            ))}

                            {/* Buttons */}
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                <TouchableOpacity
                                    activeOpacity={0.7} onPress={() => setModalVisible(false)}
                                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: colors.bgLight, borderWidth: 1.5, borderColor: colors.stroke }}
                                >
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 15, color: colors.text }}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    activeOpacity={0.8} onPress={handleGenerate} disabled={generating}
                                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: generating ? colors.primary + '80' : colors.primary }}
                                >
                                    {generating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: '#FFF' }}>Generate</Text>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

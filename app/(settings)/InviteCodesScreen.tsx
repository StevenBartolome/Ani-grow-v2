import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    Switch,
    TouchableOpacity,
    View,
    Animated,
    Platform,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

type InviteRole = 'caretaker' | 'veterinarian' | 'flockman';
type InviteStatus = 'unused' | 'used' | 'expired';

interface Permissions {
    dashboard: boolean;
    devices: boolean;
    animals_guide: boolean;
    health_records: boolean;
    analytics: boolean;
    feeding_control: boolean;
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

const ROLE_LABELS: Record<InviteRole, string> = {
    caretaker: 'Caretaker',
    veterinarian: 'Veterinarian',
    flockman: 'Flockman',
};

const ROLE_COLORS: Record<InviteRole, string> = {
    caretaker: '#10B981',
    veterinarian: '#3B82F6',
    flockman: '#F59E0B',
};

const PERMISSION_LABELS: { key: keyof Permissions; label: string; icon: string }[] = [
    { key: 'dashboard',       label: 'Dashboard',        icon: 'dashboard' },
    { key: 'devices',         label: 'Devices',          icon: 'devices' },
    { key: 'animals_guide',   label: 'Animals Guide',    icon: 'pets' },
    { key: 'health_records',  label: 'Health Records',   icon: 'favorite-border' },
    { key: 'analytics',       label: 'Analytics',        icon: 'bar-chart' },
    { key: 'feeding_control', label: 'Feeding Control',  icon: 'restaurant' },
];

const DEFAULT_PERMISSIONS: Permissions = {
    dashboard: true,
    devices: false,
    animals_guide: false,
    health_records: false,
    analytics: false,
    feeding_control: false,
};

function generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `AGR-${suffix}`;
}

function formatExpiry(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    if (diffMs < 0) return `Expired ${label}`;
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires ${label} (${diffDays}d)`;
}

export default function InviteCodesScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const { profile } = useAuth();
    const farmId = (profile as any)?.farm_id;
    const userId = (profile as any)?.id;

    const [codes, setCodes] = useState<InviteCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedRole, setSelectedRole] = useState<InviteRole>('caretaker');
    const [permissions, setPermissions] = useState<Permissions>({ ...DEFAULT_PERMISSIONS });
    const [generating, setGenerating] = useState(false);

    // ── Animations ────────────────────────────────────────────────────────────
    const slideAnim = useRef(new Animated.Value(600)).current;

    useEffect(() => {
        if (modalVisible) {
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideAnim.setValue(600);
        }
    }, [modalVisible]);

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

    const handleGenerate = async () => {
        if (!farmId || !userId) return;
        setGenerating(true);
        try {
            const code = generateCode();
            const { error } = await supabase
                .from('invite_codes')
                .insert({
                    code,
                    farm_id: farmId,
                    role: selectedRole,
                    permissions,
                    created_by: userId,
                });
            if (error) throw error;
            setModalVisible(false);
            setSelectedRole('caretaker');
            setPermissions({ ...DEFAULT_PERMISSIONS });
            await fetchCodes();
        } catch (err: any) {
            console.error('[InviteCodesScreen] generate error:', err);
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
        Alert.alert(
            'Expire Code',
            `Expire code ${invite.code}? It will no longer be usable.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Expire',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('invite_codes')
                                .update({ status: 'expired' })
                                .eq('id', invite.id);
                            if (error) throw error;
                            await fetchCodes();
                        } catch (err: any) {
                            Alert.alert('Error', err?.message ?? 'Failed to expire code.');
                        }
                    },
                },
            ]
        );
    };

    const togglePermission = (key: keyof Permissions) => {
        setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const getStatusStyle = (status: InviteStatus) => {
        switch (status) {
            case 'unused':  return { bg: colors.primary + '1A',  text: colors.primary,  label: 'Active' };
            case 'used':    return { bg: colors.textGrey + '1A', text: colors.textGrey, label: 'Used' };
            case 'expired': return { bg: '#EF4444' + '1A',       text: '#EF4444',       label: 'Expired' };
        }
    };

    const renderCodeCard = (invite: InviteCode) => {
        const statusStyle = getStatusStyle(invite.status);
        const roleColor = ROLE_COLORS[invite.role];
        const isCopied = copiedId === invite.id;
        const canAct = invite.status === 'unused';

        return (
            <View
                key={invite.id}
                style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    marginBottom: 12,
                    overflow: 'hidden',
                }}
            >
                {/* Top row: code + status */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{
                            fontFamily: 'Poppins-Bold',
                            fontSize: 20,
                            color: colors.text,
                            letterSpacing: 2,
                        }}>
                            {invite.code}
                        </Text>
                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                            {formatExpiry(invite.expires_at)}
                        </Text>
                    </View>
                    <View style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 100,
                        backgroundColor: statusStyle.bg,
                    }}>
                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: statusStyle.text }}>
                            {statusStyle.label}
                        </Text>
                    </View>
                </View>

                {/* Role badge */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 100,
                        backgroundColor: roleColor + '1A',
                        borderWidth: 1,
                        borderColor: roleColor + '40',
                    }}>
                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: roleColor }}>
                            {ROLE_LABELS[invite.role]}
                        </Text>
                    </View>

                    {/* Permission chips */}
                    {PERMISSION_LABELS.filter(p => invite.permissions[p.key]).map(p => (
                        <View key={p.key} style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 100,
                            backgroundColor: colors.bgLight,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                        }}>
                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 10, color: colors.textGrey }}>
                                {p.label}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Action row */}
                {canAct && (
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.stroke }}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => handleCopy(invite)}
                            style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                paddingVertical: 12,
                                borderRightWidth: 1,
                                borderRightColor: colors.stroke,
                            }}
                        >
                            <MaterialIcons
                                name={isCopied ? 'check' : 'content-copy'}
                                size={16}
                                color={isCopied ? colors.primary : colors.textGrey}
                            />
                            <Text style={{
                                fontFamily: 'Poppins-Medium',
                                fontSize: 13,
                                color: isCopied ? colors.primary : colors.textGrey,
                            }}>
                                {isCopied ? 'Copied!' : 'Copy'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => handleExpire(invite)}
                            style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                paddingVertical: 12,
                            }}
                        >
                            <MaterialIcons name="block" size={16} color="#EF4444" />
                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 13, color: '#EF4444' }}>
                                Expire
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const unusedCodes  = codes.filter(c => c.status === 'unused');
    const usedCodes    = codes.filter(c => c.status === 'used');
    const expiredCodes = codes.filter(c => c.status === 'expired');

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>
            {/* Header */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 16,
                backgroundColor: colors.surface,
                borderBottomWidth: 1,
                borderBottomColor: colors.stroke,
            }}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Invite Codes</Text>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                        setSelectedRole('caretaker');
                        setPermissions({ ...DEFAULT_PERMISSIONS });
                        setModalVisible(true);
                    }}
                    style={{
                        width: 44,
                        height: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.primary + '1A',
                        borderRadius: 12,
                    }}
                >
                    <MaterialIcons name="add" size={24} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => fetchCodes(true)}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
            >
                {loading ? (
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 12 }]}>
                            Loading invite codes...
                        </Text>
                    </View>
                ) : codes.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 20 }}>
                        <View style={{
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            backgroundColor: colors.primary + '1A',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                        }}>
                            <MaterialIcons name="group-add" size={36} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 8 }]}>
                            No Invite Codes Yet
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Generate a code to invite caretakers, veterinarians, or flockmen to your farm.
                        </Text>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setModalVisible(true)}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                backgroundColor: colors.primary,
                                paddingHorizontal: 24,
                                paddingVertical: 14,
                                borderRadius: 999,
                            }}
                        >
                            <MaterialIcons name="add" size={20} color="#FFF" />
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: '#FFF' }}>
                                Generate First Code
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {unusedCodes.length > 0 && (
                            <>
                                <Text style={{
                                    fontFamily: 'Poppins-SemiBold',
                                    fontSize: 12,
                                    color: colors.textGrey,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    marginBottom: 12,
                                }}>
                                    Active ({unusedCodes.length})
                                </Text>
                                {unusedCodes.map(renderCodeCard)}
                            </>
                        )}

                        {usedCodes.length > 0 && (
                            <>
                                <Text style={{
                                    fontFamily: 'Poppins-SemiBold',
                                    fontSize: 12,
                                    color: colors.textGrey,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    marginTop: unusedCodes.length > 0 ? 8 : 0,
                                    marginBottom: 12,
                                }}>
                                    Used ({usedCodes.length})
                                </Text>
                                {usedCodes.map(renderCodeCard)}
                            </>
                        )}

                        {expiredCodes.length > 0 && (
                            <>
                                <Text style={{
                                    fontFamily: 'Poppins-SemiBold',
                                    fontSize: 12,
                                    color: colors.textGrey,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    marginTop: (unusedCodes.length + usedCodes.length) > 0 ? 8 : 0,
                                    marginBottom: 12,
                                }}>
                                    Expired ({expiredCodes.length})
                                </Text>
                                {expiredCodes.map(renderCodeCard)}
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Generate Code Modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    justifyContent: 'flex-end',
                }}>
                    <Animated.View style={{
                        backgroundColor: colors.surface,
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        padding: 24,
                        paddingBottom: 40,
                        maxHeight: '85%',
                        transform: [{ translateY: slideAnim }],
                    }}>
                        {/* Modal handle */}
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginBottom: 20 }} />

                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 4 }]}>
                            Generate Invite Code
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginBottom: 24 }]}>
                            The code expires in 7 days. Share it with the invited staff member.
                        </Text>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Role picker */}
                            <Text style={{
                                fontFamily: 'Poppins-SemiBold',
                                fontSize: 13,
                                color: colors.text,
                                marginBottom: 10,
                            }}>
                                Role
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                                {(Object.entries(ROLE_LABELS) as [InviteRole, string][]).map(([role, label]) => {
                                    const isActive = selectedRole === role;
                                    const roleColor = ROLE_COLORS[role];
                                    return (
                                        <TouchableOpacity
                                            key={role}
                                            activeOpacity={0.7}
                                            onPress={() => setSelectedRole(role)}
                                            style={{
                                                flex: 1,
                                                paddingVertical: 10,
                                                borderRadius: 12,
                                                alignItems: 'center',
                                                backgroundColor: isActive ? roleColor : colors.bgLight,
                                                borderWidth: 1.5,
                                                borderColor: isActive ? roleColor : colors.stroke,
                                            }}
                                        >
                                            <Text style={{
                                                fontFamily: isActive ? 'Poppins-SemiBold' : 'Poppins-Medium',
                                                fontSize: 13,
                                                color: isActive ? '#FFF' : colors.textGrey,
                                            }}>
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Permissions */}
                            <Text style={{
                                fontFamily: 'Poppins-SemiBold',
                                fontSize: 13,
                                color: colors.text,
                                marginBottom: 10,
                            }}>
                                Permissions
                            </Text>
                            <View style={{
                                backgroundColor: colors.bgLight,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                overflow: 'hidden',
                                marginBottom: 24,
                            }}>
                                {PERMISSION_LABELS.map((perm, index) => (
                                    <View
                                        key={perm.key}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            paddingHorizontal: 16,
                                            paddingVertical: 12,
                                            borderBottomWidth: index < PERMISSION_LABELS.length - 1 ? 1 : 0,
                                            borderBottomColor: colors.stroke,
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <MaterialIcons name={perm.icon as any} size={20} color={colors.textGrey} />
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 14, color: colors.text }}>
                                                {perm.label}
                                            </Text>
                                        </View>
                                        <Switch
                                            value={permissions[perm.key]}
                                            onValueChange={() => togglePermission(perm.key)}
                                            trackColor={{ false: colors.stroke, true: colors.primary }}
                                            thumbColor="#FFFFFF"
                                        />
                                    </View>
                                ))}
                            </View>

                            {/* Buttons */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setModalVisible(false)}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 14,
                                        borderRadius: 14,
                                        alignItems: 'center',
                                        backgroundColor: colors.bgLight,
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                    }}
                                >
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 15, color: colors.text }}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={handleGenerate}
                                    disabled={generating}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 14,
                                        borderRadius: 14,
                                        alignItems: 'center',
                                        backgroundColor: generating ? colors.primary + '80' : colors.primary,
                                    }}
                                >
                                    {generating ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: '#FFF' }}>
                                            Generate
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

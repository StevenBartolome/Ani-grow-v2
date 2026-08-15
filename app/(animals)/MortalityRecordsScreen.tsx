import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
    ActivityIndicator,
    Modal,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
    Animated,
    PanResponder,
    Easing,
    Platform,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';


// ─── Types ────────────────────────────────────────────────────────────────────

interface MortalityRecord {
    id: string;
    title: string;
    notes: string | null;
    severity: 'low' | 'medium' | 'high';
    record_date: string;
    affected_count: number;
    cause: string;
}

interface BatchInfo {
    id: string;
    name: string;
    animal_type: string;
    estimated_count: number;
    current_count: number;
    sold_count?: number;
    arrival_date: string;
    housing_id: string;
    status: string;
}

interface HousingInfo {
    id: string;
    name: string;
    current_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCause(title: string): string {
    return title.replace(/^Mortality\s*[—-]\s*/i, '').trim() || 'Unknown';
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function mortalityRate(estimated: number, totalDeceased: number): string {
    if (estimated === 0) return '0.0%';
    return ((totalDeceased / estimated) * 100).toFixed(1) + '%';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MortalityRecordsScreen() {
    const { housingId, batchId } = useLocalSearchParams<{ housingId: string; batchId: string }>();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const userId = (profile as any)?.uid || (profile as any)?.id;

    const [batch, setBatch]     = useState<BatchInfo | null>(null);
    const [housing, setHousing] = useState<HousingInfo | null>(null);
    const [records, setRecords] = useState<MortalityRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving]     = useState(false);

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackVisible, setSnackVisible] = useState(false);
    const [snackMsg, setSnackMsg]         = useState('');
    const [snackType, setSnackType]       = useState<SnackbarType>('success');
    const showSnack = (msg: string, type: SnackbarType = 'success') => {
        setSnackMsg(msg); setSnackType(type); setSnackVisible(true);
    };

    // ── Record Deceased modal state ───────────────────────────────────────────
    const [recordVisible, setRecordVisible]           = useState(false);
    const [deceasedNumber, setDeceasedNumber]         = useState('');
    const [deceasedReason, setDeceasedReason]         = useState('Illness');
    const [deceasedOtherReason, setDeceasedOtherReason] = useState('');
    const [reasonModalVisible, setReasonModalVisible] = useState(false);
    const [confirmVisible, setConfirmVisible]         = useState(false);
    const [confirmType, setConfirmType]               = useState<ActionModalType>('warning');

    // ── Animations ──
    const slideRecord = useRef(new Animated.Value(600)).current;
    const panYRecord  = useRef(new Animated.Value(0)).current;
    const closeRecordModalRef = useRef<() => void>(undefined);
    const isScrollAtTopRecord = useRef(true);

    const panRecordResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponderCapture: (_, gestureState) => {
                return gestureState.dy > 10 && isScrollAtTopRecord.current;
            },
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && isScrollAtTopRecord.current;
            },
            onPanResponderGrant: () => {
                panYRecord.setOffset(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panYRecord.setValue(gestureState.dy);
                } else {
                    panYRecord.setValue(gestureState.dy * 0.2);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    Animated.timing(panYRecord, {
                        toValue: 600,
                        duration: 150,
                        easing: Easing.linear,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        slideRecord.setValue(600);
                        panYRecord.setValue(0);
                        closeRecordModalRef.current?.();
                    });
                } else {
                    Animated.spring(panYRecord, {
                        toValue: 0,
                        useNativeDriver: Platform.OS !== 'web',
                        tension: 50,
                        friction: 9,
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        if (recordVisible) {
            isScrollAtTopRecord.current = true; // Reset so swipe always works on fresh open
            panYRecord.setValue(0);
            Animated.spring(slideRecord, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideRecord.setValue(600);
        }
    }, [recordVisible]);

    closeRecordModalRef.current = () => {
        setRecordVisible(false);
        setDeceasedNumber('');
        setDeceasedReason('Illness');
        setDeceasedOtherReason('');
    };

    const handleCloseRecordModal = () => {
        Animated.timing(slideRecord, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeRecordModalRef.current?.();
        });
    };

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!batchId || !housingId) return;
        try {
            const [batchRes, housingRes, recordsRes] = await Promise.all([
                supabase
                    .from('batches')
                    .select('id, name, animal_type, estimated_count, current_count, sold_count, arrival_date, housing_id, status')
                    .eq('id', batchId)
                    .single(),
                supabase
                    .from('housings')
                    .select('id, name, current_count')
                    .eq('id', housingId)
                    .single(),
                supabase
                    .from('health_records')
                    .select('id, title, notes, severity, record_date, affected_count')
                    .eq('batch_id', batchId)
                    .eq('record_type', 'mortality')
                    .is('deleted_at', null)
                    .order('record_date', { ascending: false }),
            ]);

            if (batchRes.data) setBatch(batchRes.data as BatchInfo);
            if (housingRes.data) setHousing(housingRes.data as HousingInfo);
            if (recordsRes.data) {
                setRecords((recordsRes.data as any[]).map(r => ({
                    ...r,
                    cause: extractCause(r.title),
                })));
            }
        } catch (err) {
            console.error('[MortalityRecordsScreen] fetch error:', err);
            showSnack('Failed to load records.', 'error');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [batchId, housingId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); }, [fetchData]);

    // ── Record Deceased ───────────────────────────────────────────────────────
    const handleRecordClick = () => {
        if (!deceasedNumber || parseInt(deceasedNumber, 10) <= 0) {
            showSnack('Enter a valid count.', 'error'); return;
        }
        if (deceasedReason === 'Other' && !deceasedOtherReason.trim()) {
            showSnack('Please specify the reason.', 'error'); return;
        }
        handleCloseRecordModal();
        setConfirmType('warning');
        setConfirmVisible(true);
    };

    const handleConfirm = async () => {
        setIsSaving(true);
        setConfirmVisible(false);
        try {
            const n = parseInt(deceasedNumber, 10);
            const cause = deceasedReason === 'Other'
                ? deceasedOtherReason.trim() || 'Other'
                : deceasedReason;

            // 1 — Insert mortality health record
            const { error: hrErr } = await supabase.from('health_records').insert({
                farm_id:      farmId,
                housing_id:   housingId,
                batch_id:     batchId,
                record_type:  'mortality',
                title:        `Mortality — ${cause}`,
                notes:        `${n} animal(s) deceased. Cause: ${cause}.`,
                severity:     n >= 10 ? 'high' : n >= 3 ? 'medium' : 'low',
                affected_count: n,
                record_date:  new Date().toISOString().split('T')[0],
                medication:   null,
                dosage:       null,
                followup_date: null,
                recorded_by:  userId,
            });
            if (hrErr) throw hrErr;

            // 2 — Recalculate batch current_count from sum of ALL mortality records
            //     This is the source of truth — keeps batch count always in sync
            const { data: allMortality } = await supabase
                .from('health_records')
                .select('affected_count')
                .eq('batch_id', batchId)
                .eq('record_type', 'mortality')
                .is('deleted_at', null);

            const totalDeceased = (allMortality ?? []).reduce(
                (sum: number, r: any) => sum + (r.affected_count ?? 0), 0
            );
            const newCurrentCount = Math.max(0, (batch?.estimated_count ?? 0) - (batch?.sold_count ?? 0) - totalDeceased);

            const { error: bErr } = await supabase
                .from('batches')
                .update({ current_count: newCurrentCount, updated_at: new Date().toISOString() })
                .eq('id', batchId);
            if (bErr) throw bErr;

            // 3 — Recalculate housing current_count from ALL active batches
            const { data: activeBatches } = await supabase
                .from('batches')
                .select('current_count')
                .eq('housing_id', housingId)
                .eq('status', 'active');
            const housingCount = (activeBatches ?? []).reduce(
                (sum: number, b: any) => sum + (b.current_count ?? 0), 0
            );
            await supabase
                .from('housings')
                .update({ current_count: housingCount, updated_at: new Date().toISOString() })
                .eq('id', housingId);

            showSnack(`Recorded ${n} deceased — batch count updated.`);
            setDeceasedNumber('');
            setDeceasedReason('Illness');
            setDeceasedOtherReason('');
            await fetchData();
        } catch (err: any) {
            showSnack(err.message || 'Failed to record.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // ── Derived stats ─────────────────────────────────────────────────────────
    const totalDeceased   = records.reduce((s, r) => s + r.affected_count, 0);
    const mortalityRatePct = mortalityRate(batch?.estimated_count ?? 0, totalDeceased);
    const liveCount       = batch?.current_count ?? Math.max(0, (batch?.estimated_count ?? 0) - (batch?.sold_count ?? 0) - totalDeceased);

    // Cause breakdown
    const causeSummary: Record<string, number> = {};
    for (const r of records) {
        causeSummary[r.cause] = (causeSummary[r.cause] ?? 0) + r.affected_count;
    }
    const causeList = Object.entries(causeSummary)
        .sort((a, b) => b[1] - a[1]);

    const severityColor = (s: string) =>
        s === 'high' ? colors.error : s === 'medium' ? colors.warning : colors.primary;

    const isPig = batch?.animal_type === 'pig';

    // ── Loading ───────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                    <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                </View>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>

            {/* Header */}
            <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 12,
                backgroundColor: colors.surface,
                borderBottomWidth: 1, borderBottomColor: colors.stroke,
            }}>
                <View style={{ width: 40 }}>
                    <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>
                        Mortality Records
                    </Text>
                    {batch && (
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1 }]}>
                            {batch.name}
                        </Text>
                    )}
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            >
                {/* ── Summary Cards ──────────────────────────────────────────── */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    {/* Total Deceased */}
                    <View style={{
                        flex: 1, backgroundColor: colors.error + '10',
                        borderWidth: 1, borderColor: colors.error + '30',
                        borderRadius: 14, padding: 14,
                    }}>
                        <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.error + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <MaterialIcons name="warning" size={18} color={colors.error} />
                        </View>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>Total Deceased</Text>
                        <Text style={[textStyles.h2, { color: colors.error, fontSize: 28, marginTop: 2 }]}>{totalDeceased}</Text>
                    </View>

                    <View style={{ flex: 1, gap: 10 }}>
                        {/* Mortality Rate */}
                        <View style={{
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            borderRadius: 14, padding: 12,
                        }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Mortality Rate</Text>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginTop: 1 }]}>{mortalityRatePct}</Text>
                        </View>
                        {/* Live Heads */}
                        <View style={{
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            borderRadius: 14, padding: 12,
                        }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Live Heads</Text>
                            <Text style={[textStyles.h2, { color: colors.primary, fontSize: 20, marginTop: 1 }]}>{liveCount}</Text>
                        </View>
                    </View>
                </View>

                {/* Batch Numbers Breakdown */}
                <View style={{
                    backgroundColor: colors.surface, borderRadius: 14,
                    borderWidth: 1, borderColor: colors.stroke,
                    padding: 14, marginBottom: 12,
                }}>
                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginBottom: 12 }]}>Batch Numbers</Text>
                    <View style={{ gap: 8 }}>
                        <NumberRow label="Initial Count" value={batch?.estimated_count ?? 0} color={colors.text} textStyles={textStyles} colors={colors} />
                        <View style={{ height: 1, backgroundColor: colors.stroke }} />
                        <NumberRow label="Total Deceased" value={totalDeceased} color={colors.error} textStyles={textStyles} colors={colors} />
                        <NumberRow label="Live Heads" value={liveCount} color={colors.primary} textStyles={textStyles} colors={colors} isBold />
                    </View>
                    {/* Sync indicator */}
                    {batch && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.stroke }}>
                            <MaterialIcons
                                name={liveCount === batch.current_count ? 'check-circle' : 'sync-problem'}
                                size={14}
                                color={liveCount === batch.current_count ? colors.primary : colors.warning}
                            />
                            <Text style={[textStyles.body, { fontSize: 11, color: liveCount === batch.current_count ? colors.primary : colors.warning }]}>
                                {liveCount === batch.current_count
                                    ? 'Records match batch count'
                                    : `Batch count shows ${batch.current_count} — tap refresh to reconcile`}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Cause Breakdown */}
                {causeList.length > 0 && (
                    <View style={{
                        backgroundColor: colors.surface, borderRadius: 14,
                        borderWidth: 1, borderColor: colors.stroke,
                        padding: 14, marginBottom: 12,
                    }}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, marginBottom: 12 }]}>Cause Breakdown</Text>
                        <View style={{ gap: 8 }}>
                            {causeList.map(([cause, count]) => {
                                const pct = totalDeceased > 0 ? (count / totalDeceased) * 100 : 0;
                                return (
                                    <View key={cause}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13 }]}>{cause}</Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                                {count} <Text style={{ color: colors.textGrey, fontSize: 11 }}>({pct.toFixed(0)}%)</Text>
                                            </Text>
                                        </View>
                                        <View style={{ height: 4, backgroundColor: colors.cardFill, borderRadius: 2, overflow: 'hidden' }}>
                                            <View style={{ width: `${pct}%`, height: 4, backgroundColor: colors.error, borderRadius: 2 }} />
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Event Timeline */}
                <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, marginBottom: 10 }]}>
                    All Events ({records.length})
                </Text>

                {records.length === 0 ? (
                    <View style={{
                        backgroundColor: colors.surface, borderRadius: 14,
                        borderWidth: 1, borderColor: colors.stroke,
                        padding: 32, alignItems: 'center',
                    }}>
                        <MaterialIcons name="check-circle-outline" size={40} color={colors.primary} />
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15, marginTop: 12 }]}>No mortality events</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 4, textAlign: 'center' }]}>
                            All animals in this batch are accounted for.
                        </Text>
                    </View>
                ) : (
                    records.map((record, idx) => {
                        const sc = severityColor(record.severity);
                        return (
                            <View
                                key={record.id}
                                style={{
                                    backgroundColor: colors.surface,
                                    borderRadius: 14, borderWidth: 1, borderColor: colors.stroke,
                                    marginBottom: 10, overflow: 'hidden', flexDirection: 'row',
                                }}
                            >
                                {/* Left severity strip */}
                                <View style={{ width: 4, backgroundColor: sc }} />

                                <View style={{ flex: 1, padding: 14 }}>
                                    {/* Top row */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                        <View style={{ flex: 1, marginRight: 12 }}>
                                            {/* Date */}
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginBottom: 4 }]}>
                                                {formatDate(record.record_date)}
                                            </Text>
                                            {/* Cause badge */}
                                            <View style={{
                                                flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
                                                backgroundColor: colors.error + '14',
                                                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                                            }}>
                                                <MaterialIcons name="warning" size={11} color={colors.error} />
                                                <Text style={[textStyles.label, { color: colors.error, fontSize: 12, marginLeft: 4 }]}>
                                                    {record.cause}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Count — prominent */}
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[textStyles.h2, { color: colors.error, fontSize: 28, lineHeight: 32 }]}>
                                                {record.affected_count}
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                                {isPig ? (record.affected_count === 1 ? 'pig' : 'pigs') : (record.affected_count === 1 ? 'bird' : 'birds')}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Severity + notes row */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{
                                            paddingHorizontal: 8, paddingVertical: 3,
                                            backgroundColor: sc + '18', borderRadius: 8,
                                        }}>
                                            <Text style={[textStyles.label, { color: sc, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                                                {record.severity}
                                            </Text>
                                        </View>
                                        {record.notes && (
                                            <Text
                                                numberOfLines={2}
                                                style={[textStyles.body, { color: colors.textGrey, fontSize: 12, flex: 1 }]}
                                            >
                                                {record.notes}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* ── Record Deceased FAB / Bottom Button ───────────────────────── */}
            {batch?.status === 'active' && (
                <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: colors.surface,
                    borderTopWidth: 1, borderTopColor: colors.stroke,
                    paddingHorizontal: 16, paddingVertical: 12,
                    paddingBottom: 28,
                }}>
                    <TouchableOpacity
                        onPress={() => setRecordVisible(true)}
                        activeOpacity={0.85}
                        style={{
                            backgroundColor: colors.error,
                            borderRadius: 14, paddingVertical: 14,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        <MaterialIcons name="add" size={20} color="#fff" />
                        <Text style={[textStyles.h3, { color: '#fff', fontSize: 15 }]}>Record Deceased</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── Record Deceased Modal ────────────────────────────────────── */}
            <Modal visible={recordVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={handleCloseRecordModal}
                    />
                    <Animated.View
                        {...panRecordResponder.panHandlers}
                        style={{
                            backgroundColor: colors.surface,
                            borderTopLeftRadius: 28,
                            borderTopRightRadius: 28,
                            maxHeight: '90%',
                            overflow: 'hidden',
                            transform: [{ translateY: Animated.add(slideRecord, panYRecord) }],
                        }}
                    >
                        {/* Drag handle */}
                        <View style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke }} />
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center', marginTop: 10 }]}>Record Deceased</Text>
                        </View>
                        <ScrollView
                            onScroll={(e) => {
                                isScrollAtTopRecord.current = e.nativeEvent.contentOffset.y <= 0;
                            }}
                            scrollEventThrottle={16}
                            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={{ width: '100%', alignItems: 'center' }}>
                                <View style={{ backgroundColor: colors.error + '1A', padding: 14, borderRadius: 20, marginBottom: 16 }}>
                                    <MaterialIcons name="warning" size={30} color={colors.error} />
                                </View>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 20, fontSize: 13 }]}>
                                    Current live count: <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.primary }}>{liveCount}</Text>
                                </Text>

                                <View style={{ width: '100%' }}>
                                    <FloatingLabelInput
                                        label="Number of Deceased"
                                        icon={isPig ? 'pig' : 'chicken'}
                                        value={deceasedNumber}
                                        onChangeText={t => setDeceasedNumber(t.replace(/[^0-9]/g, ''))}
                                        keyboardType="numeric"
                                        backgroundColor={colors.surface}
                                    />
                                </View>

                                <View style={{ width: '100%', marginBottom: 24 }}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                            borderWidth: 1.5, borderColor: colors.stroke, borderRadius: 30,
                                            paddingHorizontal: 16, height: 58, backgroundColor: colors.surface,
                                        }}
                                        onPress={() => setReasonModalVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <MaterialIcons name="help-outline" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                                            <Text style={[textStyles.body, { color: colors.text }]}>{deceasedReason}</Text>
                                        </View>
                                        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                    </TouchableOpacity>
                                </View>

                                {deceasedReason === 'Other' && (
                                    <View style={{ width: '100%', marginBottom: 8 }}>
                                        <FloatingLabelInput
                                            label="Specific Reason"
                                            icon="edit"
                                            value={deceasedOtherReason}
                                            onChangeText={setDeceasedOtherReason}
                                            backgroundColor={colors.surface}
                                        />
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity
                                        style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                        onPress={handleCloseRecordModal}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ flex: 1, backgroundColor: colors.error, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                        onPress={handleRecordClick}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: '#fff', fontSize: 14 }]}>Record</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>

            {/* Reason Selector */}
            <SelectionModal
                visible={reasonModalVisible}
                onClose={() => setReasonModalVisible(false)}
                onSelect={val => { setDeceasedReason(val); setReasonModalVisible(false); }}
                title="Cause of Death"
                description="Select the primary cause."
                icon="help-outline"
                options={['Illness', 'Injury', 'Predator', 'Unknown', 'Other']}
                selectedValue={deceasedReason}
                enableSearch={false}
                requireConfirm={false}
            />

            {/* Confirm Modal */}
            <ActionModal
                visible={confirmVisible}
                type={confirmType}
                title="Record Deceased?"
                message={`Record ${deceasedNumber} deceased animals (${deceasedReason === 'Other' ? deceasedOtherReason || 'Other' : deceasedReason})? The batch live count will be updated to ${Math.max(0, liveCount - parseInt(deceasedNumber || '0', 10))}.`}
                confirmText={isSaving ? 'Saving...' : 'Record'}
                cancelText="Cancel"
                onConfirm={handleConfirm}
                onCancel={() => setConfirmVisible(false)}
            />

            <Snackbar
                visible={snackVisible}
                message={snackMsg}
                type={snackType}
                onDismiss={() => setSnackVisible(false)}
            />
        </SafeAreaView>
    );
}

// ─── NumberRow ────────────────────────────────────────────────────────────────

function NumberRow({ label, value, color, textStyles, colors, isBold }: any) {
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>{label}</Text>
            <Text style={[textStyles.h3, {
                color,
                fontSize: isBold ? 16 : 14,
                fontFamily: isBold ? 'Poppins-SemiBold' : 'Poppins-Medium',
            }]}>
                {value}
            </Text>
        </View>
    );
}

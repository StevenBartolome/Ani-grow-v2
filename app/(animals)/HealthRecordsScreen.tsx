import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ActivityIndicator, Modal, RefreshControl, ScrollView, Text,
    TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AIInsightCard } from '@/components/AIInsightCard';
import ActionModal from '@/components/ActionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

type RecordType = 'vaccination' | 'treatment' | 'observation' | 'illness' | 'deworming' | 'vitamins' | 'mortality';
type Severity   = 'low' | 'medium' | 'high';

const RECORD_TYPES: Record<RecordType, { label: string; icon: string; color: string; hint: string }> = {
    vaccination: { label: 'Vaccination', icon: 'vaccines',         color: '#27AE60', hint: 'e.g. Newcastle Disease vaccine'        },
    treatment:   { label: 'Treatment',   icon: 'healing',          color: '#2980B9', hint: 'e.g. Antibiotic treatment'             },
    illness:     { label: 'Illness',     icon: 'sick',             color: '#E74C3C', hint: 'e.g. Respiratory infection observed'   },
    observation: { label: 'Observation', icon: 'visibility',       color: '#8E44AD', hint: 'e.g. Abnormal behavior noted'          },
    deworming:   { label: 'Deworming',   icon: 'bug-report',       color: '#E67E22', hint: 'e.g. Monthly deworming routine'        },
    vitamins:    { label: 'Vitamins',    icon: 'medical-services', color: '#16A085', hint: 'e.g. Vitamin B complex supplement'     },
    mortality:   { label: 'Mortality',   icon: 'remove-circle',    color: '#7F1D1D', hint: 'e.g. Animals found dead'               },
};

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; description: string }> = {
    low:    { label: 'Low',    color: '#27AE60', description: 'Minor / routine'   },
    medium: { label: 'Medium', color: '#E67E22', description: 'Needs monitoring'  },
    high:   { label: 'High',   color: '#E74C3C', description: 'Urgent attention'  },
};

const ALL_FILTERS: Array<RecordType | 'all'> = [
    'all', 'vaccination', 'treatment', 'illness', 'observation', 'deworming', 'vitamins', 'mortality',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Batch {
    id: string;
    name: string;
    status: string;
    animal_type: string;
    current_count: number;
}

interface HealthRecord {
    id: string;
    record_type: RecordType;
    title: string;
    notes: string | null;
    severity: Severity;
    record_date: string;
    medication: string | null;
    dosage: string | null;
    affected_count: number | null;
    followup_date: string | null;
    batch_id: string | null;
    created_at: string;
    deleted_at: string | null;
}

const TRASH_DAYS = 30; // auto-purge after this many days

// ─── Helper ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const LabeledField = ({ label, value, color }: { label: string; value: string; color?: string }) => {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey, marginBottom: 3, letterSpacing: 0.5 }}>
                {label}
            </Text>
            <Text style={[textStyles.body, { color: color ?? colors.text, fontSize: 14 }]}>
                {value}
            </Text>
        </View>
    );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HealthRecordsScreen() {
    const { housingId, batchId: paramBatchId } = useLocalSearchParams<{ housingId: string; batchId: string }>();
    const router      = useRouter();
    const { colors }  = useTheme();
    const textStyles  = useTextStyles();
    const styles      = useAnimalStyles();
    const { profile } = useAuth();

    const farmId = (profile as any)?.farm_id;
    const userId = (profile as any)?.uid || (profile as any)?.id;

    // ── Data state ────────────────────────────────────────────────────────────
    const [records,        setRecords]        = useState<HealthRecord[]>([]);
    const [trashedRecords, setTrashedRecords] = useState<HealthRecord[]>([]);
    const [batches,        setBatches]        = useState<Batch[]>([]);
    const [isLoading,      setIsLoading]      = useState(true);

    // ── Trash drawer ──────────────────────────────────────────────────────────
    const [trashVisible,       setTrashVisible]       = useState(false);
    const [trashSeen,          setTrashSeen]          = useState(true);   // true = no badge dot
    const [permanentDeleteId,  setPermanentDeleteId]  = useState<string | null>(null);
    const [permDeleteVisible,  setPermDeleteVisible]  = useState(false);
    const [isPermaDeleting,    setIsPermaDeleting]    = useState(false);
    const [isRestoring,        setIsRestoring]        = useState<string | null>(null);

    // ── Filter ────────────────────────────────────────────────────────────────
    const [filterType,    setFilterType]    = useState<RecordType | 'all'>('all');
    const [filterBatchId, setFilterBatchId] = useState<string | 'all'>(paramBatchId || 'all');

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType,    setSnackbarType]    = useState<SnackbarType>('success');
    const showSnackbar = (msg: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(msg); setSnackbarType(type); setSnackbarVisible(true);
    };

    // ── Detail modal ──────────────────────────────────────────────────────────
    const [detailRecord, setDetailRecord] = useState<HealthRecord | null>(null);

    // ── Delete ────────────────────────────────────────────────────────────────
    const [deleteId,           setDeleteId]           = useState<string | null>(null);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [isDeleting,         setIsDeleting]         = useState(false);

    // ── Add form ──────────────────────────────────────────────────────────────
    const [addVisible,    setAddVisible]    = useState(false);
    const [isSaving,      setIsSaving]      = useState(false);
    const [addBatchId,    setAddBatchId]    = useState(paramBatchId || '');
    const [addType,       setAddType]       = useState<RecordType>('vaccination');
    const [addTitle,      setAddTitle]      = useState('');
    const [addMed,        setAddMed]        = useState('');
    const [addDosage,     setAddDosage]     = useState('');
    const [addAffected,   setAddAffected]   = useState('');
    const [addNotes,      setAddNotes]      = useState('');
    const [addSeverity,   setAddSeverity]   = useState<Severity>('low');
    const [addDate,       setAddDate]       = useState(new Date().toISOString().split('T')[0]);
    const [addFollowup,   setAddFollowup]   = useState('');

    // Pickers
    const [typePickerVisible,     setTypePickerVisible]     = useState(false);
    const [severityPickerVisible, setSeverityPickerVisible] = useState(false);
    const [batchPickerVisible,    setBatchPickerVisible]    = useState(false);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const COLS = 'id, record_type, title, notes, severity, record_date, medication, dosage, affected_count, followup_date, batch_id, created_at, deleted_at';

    const fetchData = useCallback(async () => {
        if (!housingId) return;
        setIsLoading(true);
        try {
            const [batchRes, activeRes, trashRes] = await Promise.all([
                supabase
                    .from('batches')
                    .select('id, name, status, animal_type, current_count')
                    .eq('housing_id', housingId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('health_records')
                    .select(COLS)
                    .eq('housing_id', housingId)
                    .is('deleted_at', null)
                    .order('record_date', { ascending: false }),
                supabase
                    .from('health_records')
                    .select(COLS)
                    .eq('housing_id', housingId)
                    .not('deleted_at', 'is', null)
                    .order('deleted_at', { ascending: false }),
            ]);

            if (batchRes.error)   throw batchRes.error;
            if (activeRes.error)  throw activeRes.error;
            if (trashRes.error)   throw trashRes.error;

            setBatches(batchRes.data ?? []);
            setRecords(activeRes.data ?? []);
            setTrashedRecords(trashRes.data ?? []);
        } catch (err) {
            console.error('[HealthRecords]', err);
            showSnackbar('Failed to load records.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [housingId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, [fetchData]);

    // Sync addBatchId when paramBatchId changes
    useEffect(() => { if (paramBatchId) setAddBatchId(paramBatchId); }, [paramBatchId]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const batchMap = useMemo(() =>
        Object.fromEntries(batches.map(b => [b.id, b])),
    [batches]);

    const activeBatch = useMemo(() =>
        batches.find(b => b.id === paramBatchId) ?? batches.find(b => b.status === 'active') ?? null,
    [batches, paramBatchId]);

    const selectedAddBatch = batches.find(b => b.id === addBatchId) ?? null;

    const filtered = useMemo(() => {
        return records.filter(r => {
            const typeOk  = filterType === 'all' || r.record_type === filterType;
            const batchOk = filterBatchId === 'all' || r.batch_id === filterBatchId;
            return typeOk && batchOk;
        });
    }, [records, filterType, filterBatchId]);

    // ── Add ───────────────────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!addTitle.trim())   { showSnackbar('Please enter a title.', 'error');  return; }
        if (!addBatchId)        { showSnackbar('Please select a batch.', 'error'); return; }
        setIsSaving(true);
        try {
            const { error } = await supabase.from('health_records').insert({
                farm_id:        farmId,
                housing_id:     housingId,
                batch_id:       addBatchId,
                record_type:    addType,
                title:          addTitle.trim(),
                medication:     addMed.trim()      || null,
                dosage:         addDosage.trim()   || null,
                affected_count: addAffected        ? parseInt(addAffected, 10) : null,
                notes:          addNotes.trim()    || null,
                severity:       addSeverity,
                record_date:    addDate,
                followup_date:  addFollowup        || null,
                recorded_by:    userId,
            });
            if (error) throw error;
            showSnackbar('Health record added successfully.');
            setAddVisible(false);
            resetForm();
            await fetchData();
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to save record.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setAddTitle(''); setAddMed(''); setAddDosage('');
        setAddAffected(''); setAddNotes(''); setAddFollowup('');
        setAddType('vaccination'); setAddSeverity('low');
        setAddDate(new Date().toISOString().split('T')[0]);
        if (paramBatchId) setAddBatchId(paramBatchId);
    };

    // ── Soft delete → moves to trash ─────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('health_records')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', deleteId);
            if (error) throw error;
            showSnackbar('Moved to Recently Deleted.');
            setDetailRecord(null);
            setDeleteModalVisible(false); setDeleteId(null);
            setTrashSeen(false);   // show badge dot — new item in trash
            await fetchData();
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to delete.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // ── Restore from trash ────────────────────────────────────────────────────
    const handleRestore = async (id: string) => {
        setIsRestoring(id);
        try {
            const { error } = await supabase
                .from('health_records')
                .update({ deleted_at: null })
                .eq('id', id);
            if (error) throw error;
            showSnackbar('Record restored successfully.');
            await fetchData();
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to restore.', 'error');
        } finally {
            setIsRestoring(null);
        }
    };

    // ── Permanent delete ──────────────────────────────────────────────────────
    const handlePermanentDelete = async () => {
        if (!permanentDeleteId) return;
        setIsPermaDeleting(true);
        try {
            const { error } = await supabase
                .from('health_records')
                .delete()
                .eq('id', permanentDeleteId);
            if (error) throw error;
            showSnackbar('Record permanently deleted.');
            setPermDeleteVisible(false); setPermanentDeleteId(null);
            await fetchData();
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to permanently delete.', 'error');
        } finally {
            setIsPermaDeleting(false);
        }
    };

    // ── Days since deleted ────────────────────────────────────────────────────
    const daysSinceDeleted = (deletedAt: string) => {
        const diff = Date.now() - new Date(deletedAt).getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    };

    const daysLeft = (deletedAt: string) =>
        Math.max(0, TRASH_DAYS - daysSinceDeleted(deletedAt));

    // ── Shared input style ────────────────────────────────────────────────────
    const inputStyle = (active?: boolean) => ({
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.stroke,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.text,
        fontFamily: 'Poppins-Regular' as const,
        fontSize: 14,
        backgroundColor: colors.inputFill,
    });

    const fieldLabel = (text: string) => (
        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey, marginBottom: 6, letterSpacing: 0.5 }}>
            {text}
        </Text>
    );

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea}>

            {/* ── Header ── */}
            <View style={styles.headerTopRow}>
                <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]} numberOfLines={1}>
                        Health Records
                    </Text>
                    {activeBatch && (
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]} numberOfLines={1}>
                            {activeBatch.name} · {activeBatch.animal_type}
                        </Text>
                    )}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    {/* Trash button with badge */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={{
                            width: 44, height: 44, borderRadius: 22,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                        onPress={() => { setTrashVisible(true); setTrashSeen(true); }}
                    >
                        <MaterialIcons
                            name="delete-outline"
                            size={22}
                            color={trashedRecords.length > 0 ? colors.error : colors.textGrey}
                        />
                        {/* Dot only when there are unseen new items */}
                        {trashedRecords.length > 0 && !trashSeen && (
                            <View style={{
                                position: 'absolute', top: 6, right: 6,
                                width: 8, height: 8, borderRadius: 4,
                                backgroundColor: colors.error,
                                borderWidth: 1.5, borderColor: colors.surface,
                            }} />
                        )}
                    </TouchableOpacity>
                    {/* Add button */}
                    <TouchableOpacity
                        activeOpacity={0.85}
                        style={{
                            width: 44, height: 44, borderRadius: 22,
                            backgroundColor: colors.primary,
                            alignItems: 'center', justifyContent: 'center',
                            elevation: 4,
                            shadowColor: colors.primary,
                            shadowOffset: { width: 0, height: 3 },
                            shadowOpacity: 0.35, shadowRadius: 6,
                        }}
                        onPress={() => setAddVisible(true)}
                    >
                        <MaterialIcons name="add" size={24} color={colors.onPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Batch filter row ── */}
            {batches.length > 1 && (
                <View style={{ height: 40, marginBottom: 4 }}>
                    <ScrollView
                        horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center', height: 40 }}
                    >
                        {[{ id: 'all', name: 'All Batches', status: '' } as any, ...batches].map(b => {
                            const sel = filterBatchId === b.id;
                            return (
                                <TouchableOpacity key={b.id} activeOpacity={0.75} onPress={() => setFilterBatchId(b.id)}
                                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1.5, borderColor: sel ? colors.primary : colors.stroke, backgroundColor: sel ? colors.primary + '18' : colors.surface }}>
                                    <Text style={{ fontFamily: sel ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 12, color: sel ? colors.primary : colors.textGrey }}>
                                        {b.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* ── Type filter chips ── */}
            <View style={{ height: 44, marginBottom: 8 }}>
                <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center', height: 44 }}
                >
                    {ALL_FILTERS.map(type => {
                        const isSel = filterType === type;
                        const cfg   = type === 'all' ? null : RECORD_TYPES[type];
                        const activeColor = cfg?.color ?? colors.primary;
                        return (
                            <TouchableOpacity key={type} activeOpacity={0.75} onPress={() => setFilterType(type)}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    paddingHorizontal: 13, paddingVertical: 6,
                                    borderRadius: 18, borderWidth: 1.5,
                                    borderColor: isSel ? activeColor : colors.stroke,
                                    backgroundColor: isSel ? activeColor + '18' : colors.surface,
                                }}>
                                {cfg && <MaterialIcons name={cfg.icon as any} size={13} color={isSel ? activeColor : colors.textGrey} style={{ marginRight: 5 }} />}
                                <Text style={{ fontFamily: isSel ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 12, color: isSel ? activeColor : colors.textGrey }}>
                                    {type === 'all' ? 'All' : cfg!.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* ── AI Health Summary ── */}
            {!isLoading && records.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                    <AIInsightCard
                        title="AI Health Summary"
                        context={{
                            type: 'health',
                            data: {
                                totalRecords: records.length,
                                recentRecords: records.slice(0, 6).map(r => ({
                                    type: r.record_type,
                                    title: r.title,
                                    severity: r.severity,
                                    date: r.record_date,
                                    affectedCount: r.affected_count,
                                    followupDate: r.followup_date,
                                })),
                                typeCounts: Object.fromEntries(
                                    Object.keys(RECORD_TYPES).map(t => [
                                        t,
                                        records.filter(r => r.record_type === t).length,
                                    ])
                                ),
                                highSeverityCount: records.filter(r => r.severity === 'high').length,
                                pendingFollowups: records.filter(r => r.followup_date && new Date(r.followup_date) >= new Date()).length,
                            },
                        }}
                    />
                </View>
            )}

            {/* ── Records list ── */}
            {isLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
            ) : filtered.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
                    <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <MaterialIcons name="medical-services" size={36} color={colors.primary} />
                    </View>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center' }]}>No records yet</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 14, marginTop: 8, lineHeight: 22 }]}>
                        Tap <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.primary }}>+</Text> to log a vaccination, treatment, or observation.
                    </Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: 4 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 4 }}>
                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text }}>
                            {filterType === 'all' ? 'All Records' : RECORD_TYPES[filterType].label}
                        </Text>
                        <View style={{ backgroundColor: colors.cardFill, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.textGrey }}>
                                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
                            </Text>
                        </View>
                    </View>

                    {filtered.map(record => {
                        const cfg       = RECORD_TYPES[record.record_type];
                        const sev       = SEVERITY_CONFIG[record.severity];
                        const batchName = record.batch_id ? batchMap[record.batch_id]?.name ?? '—' : '—';

                        // Compact metadata chip
                        const Chip = ({ icon, label }: { icon: string; label: string }) => (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardFill, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <MaterialIcons name={icon as any} size={10} color={colors.textGrey} />
                                <Text style={{ color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Regular' }}>{label}</Text>
                            </View>
                        );

                        return (
                            <TouchableOpacity
                                key={record.id}
                                activeOpacity={0.85}
                                onPress={() => setDetailRecord(record)}
                                onLongPress={() => { setDeleteId(record.id); setDeleteModalVisible(true); }}
                                style={[
                                    styles.deviceCard,
                                    { backgroundColor: colors.surface, borderColor: colors.stroke, flexDirection: 'row', alignItems: 'stretch', marginBottom: 12, width: '100%', overflow: 'hidden', padding: 0 }
                                ]}
                            >
                                {/* Left accent strip */}
                                <View style={{ width: 4, backgroundColor: cfg.color }} />

                                {/* Icon column */}
                                <View style={{ width: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: cfg.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name={cfg.icon as any} size={21} color={cfg.color} />
                                    </View>
                                </View>

                                {/* Content */}
                                <View style={{ flex: 1, paddingVertical: 14, paddingRight: 4 }}>
                                    {/* Title + severity badge */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text, flex: 1 }} numberOfLines={1}>
                                            {record.title}
                                        </Text>
                                        <View style={{ backgroundColor: sev.color + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8, flexShrink: 0 }}>
                                            <Text style={{ color: sev.color, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>{sev.label}</Text>
                                        </View>
                                    </View>

                                    {/* Type label */}
                                    <Text style={{ color: cfg.color, fontSize: 12, fontFamily: 'Poppins-SemiBold', marginBottom: 8 }}>
                                        {cfg.label}
                                    </Text>

                                    {/* Metadata chips */}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                                        <Chip icon="calendar-today" label={new Date(record.record_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                                        <Chip icon="layers" label={batchName} />
                                        {record.affected_count != null && <Chip icon="pets" label={`${record.affected_count} animals`} />}
                                        {record.medication ? <Chip icon="science" label={record.medication + (record.dosage ? ` · ${record.dosage}` : '')} /> : null}
                                    </View>

                                    {/* Follow-up badge */}
                                    {record.followup_date && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: colors.warning + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
                                            <MaterialIcons name="event" size={11} color={colors.warning} />
                                            <Text style={{ color: colors.warning, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>
                                                Follow-up: {new Date(record.followup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Chevron */}
                                <View style={{ justifyContent: 'center', paddingRight: 14 }}>
                                    <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, textAlign: 'center', marginTop: 4 }]}>
                        Tap to view · Long-press to delete
                    </Text>
                </ScrollView>
            )}

            {/* ════════════ DETAIL MODAL ════════════ */}
            <Modal visible={!!detailRecord} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    {detailRecord && (() => {
                        const cfg = RECORD_TYPES[detailRecord.record_type];
                        const sev = SEVERITY_CONFIG[detailRecord.severity];
                        const batchName = detailRecord.batch_id ? batchMap[detailRecord.batch_id]?.name ?? '—' : '—';
                        const batchType = detailRecord.batch_id ? batchMap[detailRecord.batch_id]?.animal_type ?? '' : '';
                        return (
                            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' }}>
                                {/* Top color strip */}
                                <View style={{ height: 5, backgroundColor: cfg.color, borderTopLeftRadius: 28, borderTopRightRadius: 28 }} />

                                <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                                    {/* Handle */}
                                    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginVertical: 14 }} />

                                    {/* Type icon + title */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                                        <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: cfg.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                            <MaterialIcons name={cfg.icon as any} size={28} color={cfg.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>{detailRecord.title}</Text>
                                            <Text style={{ color: cfg.color, fontFamily: 'Poppins-SemiBold', fontSize: 12, marginTop: 2 }}>{cfg.label}</Text>
                                        </View>
                                        {/* Severity badge */}
                                        <View style={{ backgroundColor: sev.color + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                                            <Text style={{ color: sev.color, fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>{sev.label}</Text>
                                        </View>
                                    </View>

                                    {/* Divider */}
                                    <View style={{ height: 1, backgroundColor: colors.stroke, marginBottom: 20 }} />

                                    {/* Fields */}
                                    <View style={{ flexDirection: 'row', gap: 0 }}>
                                        <View style={{ flex: 1 }}>
                                            <LabeledField label="DATE RECORDED" value={fmtDate(detailRecord.record_date)} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <LabeledField label="SEVERITY" value={`${sev.label} — ${sev.description}`} color={sev.color} />
                                        </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 0 }}>
                                        <View style={{ flex: 1 }}>
                                            <LabeledField label="BATCH" value={batchName} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <LabeledField label="ANIMAL TYPE" value={batchType ? batchType.charAt(0).toUpperCase() + batchType.slice(1) : '—'} />
                                        </View>
                                    </View>

                                    {detailRecord.affected_count != null && (
                                        <LabeledField label="ANIMALS AFFECTED" value={`${detailRecord.affected_count} animals`} />
                                    )}

                                    {detailRecord.medication && (
                                        <View style={{ flexDirection: 'row', gap: 0 }}>
                                            <View style={{ flex: 1 }}>
                                                <LabeledField label="MEDICATION / VACCINE" value={detailRecord.medication} />
                                            </View>
                                            {detailRecord.dosage && (
                                                <View style={{ flex: 1 }}>
                                                    <LabeledField label="DOSAGE" value={detailRecord.dosage} />
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {detailRecord.notes && (
                                        <View style={{ backgroundColor: colors.cardFill, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.textGrey, marginBottom: 6, letterSpacing: 0.5 }}>NOTES</Text>
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 14, lineHeight: 22 }]}>{detailRecord.notes}</Text>
                                        </View>
                                    )}

                                    {detailRecord.followup_date && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.warning + '15', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                                            <MaterialIcons name="event" size={22} color={colors.warning} />
                                            <View>
                                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.warning, marginBottom: 2, letterSpacing: 0.5 }}>FOLLOW-UP SCHEDULED</Text>
                                                <Text style={[textStyles.body, { color: colors.text, fontFamily: 'Poppins-SemiBold', fontSize: 14 }]}>
                                                    {fmtDate(detailRecord.followup_date)}
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* Divider */}
                                    <View style={{ height: 1, backgroundColor: colors.stroke, marginBottom: 20 }} />

                                    {/* Actions */}
                                    <View style={{ flexDirection: 'row', gap: 12 }}>
                                        <TouchableOpacity
                                            style={[styles.primaryButton, { flex: 1, backgroundColor: colors.error + '18', borderWidth: 1.5, borderColor: colors.error }]}
                                            onPress={() => { setDeleteId(detailRecord.id); setDetailRecord(null); setDeleteModalVisible(true); }}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[textStyles.btnLabel, { color: colors.error, fontSize: 14 }]}>Delete</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.primaryButton, { flex: 2, backgroundColor: colors.primary }]}
                                            onPress={() => setDetailRecord(null)}
                                            activeOpacity={0.85}
                                        >
                                            <Text style={[textStyles.btnLabel, { color: colors.onPrimary, fontSize: 14 }]}>Close</Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </View>
                        );
                    })()}
                </View>
            </Modal>

            {/* ════════════ ADD RECORD MODAL ════════════ */}
            <Modal visible={addVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%' }}>
                        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                            {/* Handle */}
                            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginTop: 12, marginBottom: 20 }} />
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center', marginBottom: 20 }]}>Add Health Record</Text>

                            {/* ── Batch selector ── */}
                            {fieldLabel('BATCH *')}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={[inputStyle(!!addBatchId), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }]}
                                onPress={() => setBatchPickerVisible(true)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <MaterialIcons name="layers" size={18} color={addBatchId ? colors.primary : colors.textGrey} />
                                    <Text style={[textStyles.body, { color: selectedAddBatch ? colors.text : colors.textGrey, fontSize: 14 }]} numberOfLines={1}>
                                        {selectedAddBatch ? `${selectedAddBatch.name} (${selectedAddBatch.status})` : 'Select batch…'}
                                    </Text>
                                </View>
                                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            {/* ── Type ── */}
                            {fieldLabel('RECORD TYPE *')}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: RECORD_TYPES[addType].color, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, backgroundColor: RECORD_TYPES[addType].color + '0A' }]}
                                onPress={() => setTypePickerVisible(true)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: RECORD_TYPES[addType].color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name={RECORD_TYPES[addType].icon as any} size={18} color={RECORD_TYPES[addType].color} />
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.text, fontFamily: 'Poppins-SemiBold' }]}>{RECORD_TYPES[addType].label}</Text>
                                </View>
                                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            {/* ── Title ── */}
                            {fieldLabel('TITLE *')}
                            <TextInput
                                style={[inputStyle(!!addTitle), { marginBottom: 14 }]}
                                placeholder={RECORD_TYPES[addType].hint}
                                placeholderTextColor={colors.textGrey}
                                value={addTitle}
                                onChangeText={setAddTitle}
                            />

                            {/* ── Medication + Dosage ── */}
                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                                <View style={{ flex: 1 }}>
                                    {fieldLabel('MEDICATION / VACCINE')}
                                    <TextInput
                                        style={inputStyle(!!addMed)}
                                        placeholder="Drug or vaccine name"
                                        placeholderTextColor={colors.textGrey}
                                        value={addMed}
                                        onChangeText={setAddMed}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    {fieldLabel('DOSAGE')}
                                    <TextInput
                                        style={inputStyle(!!addDosage)}
                                        placeholder="e.g. 0.5ml / head"
                                        placeholderTextColor={colors.textGrey}
                                        value={addDosage}
                                        onChangeText={setAddDosage}
                                    />
                                </View>
                            </View>

                            {/* ── Affected count + Severity ── */}
                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                                <View style={{ flex: 1 }}>
                                    {fieldLabel('ANIMALS AFFECTED')}
                                    <TextInput
                                        style={inputStyle(!!addAffected)}
                                        placeholder={selectedAddBatch ? `Max ${selectedAddBatch.current_count}` : 'Count'}
                                        placeholderTextColor={colors.textGrey}
                                        value={addAffected}
                                        onChangeText={t => setAddAffected(t.replace(/[^0-9]/g, ''))}
                                        keyboardType="numeric"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    {fieldLabel('SEVERITY *')}
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: SEVERITY_CONFIG[addSeverity].color, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: SEVERITY_CONFIG[addSeverity].color + '0A' }]}
                                        onPress={() => setSeverityPickerVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEVERITY_CONFIG[addSeverity].color }} />
                                            <Text style={{ color: SEVERITY_CONFIG[addSeverity].color, fontFamily: 'Poppins-SemiBold', fontSize: 14 }}>
                                                {SEVERITY_CONFIG[addSeverity].label}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textGrey} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* ── Date + Follow-up ── */}
                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                                <View style={{ flex: 1 }}>
                                    {fieldLabel('DATE RECORDED *')}
                                    <TextInput
                                        style={inputStyle(!!addDate)}
                                        value={addDate}
                                        onChangeText={setAddDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.textGrey}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    {fieldLabel('FOLLOW-UP DATE')}
                                    <TextInput
                                        style={inputStyle(!!addFollowup)}
                                        value={addFollowup}
                                        onChangeText={setAddFollowup}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.textGrey}
                                    />
                                </View>
                            </View>

                            {/* ── Notes ── */}
                            {fieldLabel('NOTES')}
                            <TextInput
                                style={[inputStyle(!!addNotes), { marginBottom: 24, minHeight: 80, textAlignVertical: 'top' }]}
                                placeholder="Additional observations or instructions…"
                                placeholderTextColor={colors.textGrey}
                                value={addNotes}
                                onChangeText={setAddNotes}
                                multiline
                            />

                            {/* ── Buttons ── */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { flex: 1, backgroundColor: colors.cardFill }]}
                                    onPress={() => { setAddVisible(false); resetForm(); }}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[textStyles.btnLabel, { color: colors.textGrey }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { flex: 2, backgroundColor: colors.primary }]}
                                    onPress={handleAdd}
                                    activeOpacity={0.85}
                                    disabled={isSaving}
                                >
                                    <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>
                                        {isSaving ? 'Saving…' : 'Save Record'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Type picker ── */}
            <Modal visible={typePickerVisible} transparent animationType="fade">
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 }} activeOpacity={1} onPress={() => setTypePickerVisible(false)}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 320 }}>
                        <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }]}>Select Type</Text>
                        {(Object.entries(RECORD_TYPES) as Array<[RecordType, typeof RECORD_TYPES[RecordType]]>).map(([key, cfg]) => (
                            <TouchableOpacity key={key}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10, borderRadius: 12, backgroundColor: addType === key ? cfg.color + '15' : 'transparent', marginBottom: 2 }}
                                onPress={() => { setAddType(key); setTypePickerVisible(false); }}
                            >
                                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: cfg.color + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <MaterialIcons name={cfg.icon as any} size={17} color={cfg.color} />
                                </View>
                                <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{cfg.label}</Text>
                                {addType === key && <MaterialIcons name="check" size={18} color={cfg.color} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── Severity picker ── */}
            <Modal visible={severityPickerVisible} transparent animationType="fade">
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 }} activeOpacity={1} onPress={() => setSeverityPickerVisible(false)}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 280 }}>
                        <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }]}>Select Severity</Text>
                        {(Object.entries(SEVERITY_CONFIG) as Array<[Severity, typeof SEVERITY_CONFIG[Severity]]>).map(([key, cfg]) => (
                            <TouchableOpacity key={key}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12, backgroundColor: addSeverity === key ? cfg.color + '15' : 'transparent', marginBottom: 2 }}
                                onPress={() => { setAddSeverity(key); setSeverityPickerVisible(false); }}
                            >
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.color, marginRight: 12 }} />
                                <View>
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{cfg.label}</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>{cfg.description}</Text>
                                </View>
                                {addSeverity === key && <MaterialIcons name="check" size={18} color={cfg.color} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── Batch picker ── */}
            <Modal visible={batchPickerVisible} transparent animationType="fade">
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 }} activeOpacity={1} onPress={() => setBatchPickerVisible(false)}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 320 }}>
                        <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }]}>Select Batch</Text>
                        {batches.length === 0 && (
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center' }]}>No batches found for this housing.</Text>
                        )}
                        {batches.map(b => (
                            <TouchableOpacity key={b.id}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10, borderRadius: 12, backgroundColor: addBatchId === b.id ? colors.primary + '15' : 'transparent', marginBottom: 2 }}
                                onPress={() => { setAddBatchId(b.id); setBatchPickerVisible(false); }}
                            >
                                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <MaterialIcons name="layers" size={17} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>{b.name}</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                        {b.status} · {b.current_count} animals
                                    </Text>
                                </View>
                                {addBatchId === b.id && <MaterialIcons name="check" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── Move to trash confirm ── */}
            <ActionModal
                visible={deleteModalVisible}
                type="warning"
                title="Move to Recently Deleted?"
                message={`This record will be moved to Recently Deleted and permanently removed after ${TRASH_DAYS} days. You can restore it any time before then.`}
                confirmText={isDeleting ? 'Moving…' : 'Move to Trash'}
                cancelText="Cancel"
                onConfirm={handleDelete}
                onCancel={() => { setDeleteModalVisible(false); setDeleteId(null); }}
            />

            {/* ── Permanent delete confirm ── */}
            <ActionModal
                visible={permDeleteVisible}
                type="warning"
                title="Delete Forever?"
                message="This record will be permanently removed and cannot be recovered."
                confirmText={isPermaDeleting ? 'Deleting…' : 'Delete Forever'}
                cancelText="Cancel"
                onConfirm={handlePermanentDelete}
                onCancel={() => { setPermDeleteVisible(false); setPermanentDeleteId(null); }}
            />

            {/* ════════════ RECENTLY DELETED DRAWER ════════════ */}
            <Modal visible={trashVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%' }}>
                        {/* Handle */}
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginTop: 12 }} />

                        {/* Drawer header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.stroke }}>
                            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.error + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 17, color: colors.text }}>Recently Deleted</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                    Records are permanently deleted after {TRASH_DAYS} days
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setTrashVisible(false)} activeOpacity={0.7}
                                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons name="close" size={18} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        {/* Trash list */}
                        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                            {trashedRecords.length === 0 ? (
                                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                                    <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                                        <MaterialIcons name="delete-outline" size={32} color={colors.textGrey} style={{ opacity: 0.5 }} />
                                    </View>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.textGrey }}>Trash is empty</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 4 }]}>Deleted records will appear here</Text>
                                </View>
                            ) : (
                                trashedRecords.map(record => {
                                    const cfg   = RECORD_TYPES[record.record_type];
                                    const days  = daysSinceDeleted(record.deleted_at!);
                                    const left  = daysLeft(record.deleted_at!);
                                    const urgent = left <= 3;
                                    return (
                                        <View key={record.id} style={{
                                            backgroundColor: colors.cardFill,
                                            borderRadius: 16, padding: 14,
                                            marginBottom: 10,
                                            borderWidth: 1,
                                            borderColor: urgent ? colors.error + '40' : colors.stroke,
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                        }}>
                                            {/* Icon */}
                                            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: cfg.color + '18', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                                                <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
                                            </View>

                                            {/* Info */}
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text, opacity: 0.75 }} numberOfLines={1}>
                                                    {record.title}
                                                </Text>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: cfg.color, marginTop: 1 }}>
                                                    {cfg.label}
                                                </Text>
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: urgent ? colors.error : colors.textGrey, marginTop: 3 }}>
                                                    {urgent
                                                        ? `⚠ Deleted ${days}d ago · ${left}d left`
                                                        : `Deleted ${days}d ago · ${left}d until permanent deletion`}
                                                </Text>
                                            </View>

                                            {/* Actions */}
                                            <View style={{ gap: 8 }}>
                                                {/* Restore */}
                                                <TouchableOpacity
                                                    activeOpacity={0.8}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                                                    onPress={() => handleRestore(record.id)}
                                                    disabled={isRestoring === record.id}
                                                >
                                                    <MaterialIcons name="restore" size={14} color={colors.primary} />
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.primary }}>
                                                        {isRestoring === record.id ? '…' : 'Restore'}
                                                    </Text>
                                                </TouchableOpacity>
                                                {/* Delete forever */}
                                                <TouchableOpacity
                                                    activeOpacity={0.8}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.error + '15', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                                                    onPress={() => { setPermanentDeleteId(record.id); setPermDeleteVisible(true); }}
                                                >
                                                    <MaterialIcons name="delete-forever" size={14} color={colors.error} />
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.error }}>Forever</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </SafeAreaView>
    );
}

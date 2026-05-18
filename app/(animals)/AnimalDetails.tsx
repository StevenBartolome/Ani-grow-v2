import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimalIcon } from '@/components/AnimalIcon';
import { AIInsightCard } from '@/components/AIInsightCard';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';

interface Housing {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    capacity: number;
    current_count: number;
}

interface Batch {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    estimated_count: number;
    current_count: number;
    arrival_date: string;
    supplier: string | null;
    status: 'active' | 'completed' | 'archived';
}

export default function AnimalDetailsScreen() {
    const { housingId } = useLocalSearchParams<{ housingId: string }>();
    const router = useRouter();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const styles = useAnimalStyles();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const userId = (profile as any)?.uid || (profile as any)?.id;

    const [housing, setHousing] = useState<Housing | null>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const selectedBatch = batches.find(b => b.id === selectedBatchId) ?? null;
    const isPig = housing?.animal_type === 'pig';
    const accentColor = isPig ? ((colors as any).pig ?? '#E67E22') : ((colors as any).chicken ?? '#F1C40F');
    const deceasedCount = selectedBatch
        ? Math.max(0, selectedBatch.estimated_count - selectedBatch.current_count)
        : 0;

    // ── Fetch ─────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!housingId) return;
        setIsLoading(true);
        try {
            const [housingRes, batchRes] = await Promise.all([
                supabase.from('housings').select('id, name, animal_type, capacity, current_count').eq('id', housingId).single(),
                supabase.from('batches').select('id, name, animal_type, estimated_count, current_count, arrival_date, supplier, status')
                    .eq('housing_id', housingId).order('created_at', { ascending: false }),
            ]);

            if (housingRes.error) throw housingRes.error;
            if (batchRes.error) throw batchRes.error;

            setHousing(housingRes.data);
            const batchList = batchRes.data ?? [];
            setBatches(batchList);
            // Auto-select the first active batch, or the latest one
            const activeBatch = batchList.find(b => b.status === 'active');
            setSelectedBatchId(activeBatch?.id ?? batchList[0]?.id ?? null);
        } catch (err) {
            console.error('[AnimalDetails] fetch error:', err);
            showSnackbar('Failed to load data.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [housingId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, [fetchData]);

    // ── Snackbar ──────────────────────────────────────────────────
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // ── Confirm Modal ─────────────────────────────────────────────
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [confirmModalType, setConfirmModalType] = useState<ActionModalType>('confirmation');
    const [confirmModalTitle, setConfirmModalTitle] = useState('');
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmActionType, setConfirmActionType] = useState<'addHeads' | 'deceased' | 'newBatch' | 'completeBatch' | 'archiveBatch' | null>(null);

    // ── Add Heads Modal ───────────────────────────────────────────
    const [addHeadsVisible, setAddHeadsVisible] = useState(false);
    const [addHeadsNumber, setAddHeadsNumber] = useState('');
    const [addHeadsAge, setAddHeadsAge] = useState('');

    // ── Deceased Modal ────────────────────────────────────────────
    const [deceasedVisible, setDeceasedVisible] = useState(false);
    const [deceasedNumber, setDeceasedNumber] = useState('');
    const [deceasedReason, setDeceasedReason] = useState('Illness');
    const [deceasedOtherReason, setDeceasedOtherReason] = useState('');
    const [deceasedReasonModalVisible, setDeceasedReasonModalVisible] = useState(false);

    // ── New Batch Modal ───────────────────────────────────────────
    const [newBatchVisible, setNewBatchVisible] = useState(false);
    const [newBatchName, setNewBatchName] = useState('');
    const [newBatchCount, setNewBatchCount] = useState('');
    const [newBatchSupplier, setNewBatchSupplier] = useState('');

    // ── Batch Selection ───────────────────────────────────────────
    const [batchModalVisible, setBatchModalVisible] = useState(false);
    const batchOptions = batches.map(b => `${b.name} (${b.status === 'active' ? 'Active' : b.status === 'completed' ? 'Completed' : 'Archived'})`);
    const selectedBatchLabel = selectedBatch
        ? `${selectedBatch.name} (${selectedBatch.status === 'active' ? 'Active' : selectedBatch.status === 'completed' ? 'Completed' : 'Archived'})`
        : '';

    // ── Handlers ──────────────────────────────────────────────────
    const handleAddHeadsClick = () => {
        if (!addHeadsNumber) { showSnackbar('Please fill in all fields.', 'error'); return; }
        if (!selectedBatchId) { showSnackbar('No batch selected.', 'error'); return; }
        setAddHeadsVisible(false);
        setConfirmActionType('addHeads');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Confirm Addition');
        setConfirmModalMessage(`Add ${addHeadsNumber} heads to "${selectedBatch?.name}"?`);
        setConfirmModalVisible(true);
    };

    const handleDeceasedClick = () => {
        if (!deceasedNumber) { showSnackbar('Please enter the number of deceased.', 'error'); return; }
        if (deceasedReason === 'Other' && !deceasedOtherReason) { showSnackbar('Please specify the reason.', 'error'); return; }
        if (!selectedBatchId) { showSnackbar('No batch selected.', 'error'); return; }
        setDeceasedVisible(false);
        setConfirmActionType('deceased');
        setConfirmModalType('warning');
        setConfirmModalTitle('Record Deceased?');
        setConfirmModalMessage(`Record ${deceasedNumber} deceased animals in "${selectedBatch?.name}"?`);
        setConfirmModalVisible(true);
    };

    const handleNewBatchClick = () => {
        if (!newBatchName.trim() || !newBatchCount) { showSnackbar('Please fill in batch name and count.', 'error'); return; }
        setNewBatchVisible(false);
        setConfirmActionType('newBatch');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Create New Batch?');
        setConfirmModalMessage(`Start batch "${newBatchName}" with ${newBatchCount} heads in ${housing?.name}?`);
        setConfirmModalVisible(true);
    };

    const handleConfirmAction = async () => {
        setIsSaving(true);
        setConfirmModalVisible(false);
        try {
            if (confirmActionType === 'addHeads' && selectedBatchId) {
                const n = parseInt(addHeadsNumber, 10);
                const { error: bErr } = await supabase
                    .from('batches')
                    .update({ current_count: (selectedBatch?.current_count ?? 0) + n, estimated_count: (selectedBatch?.estimated_count ?? 0) + n, updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (bErr) throw bErr;
                await supabase.from('housings').update({ current_count: (housing?.current_count ?? 0) + n, updated_at: new Date().toISOString() }).eq('id', housingId);
                showSnackbar(`Added ${n} heads successfully.`);
                setAddHeadsNumber(''); setAddHeadsAge('');

            } else if (confirmActionType === 'deceased' && selectedBatchId) {
                const n = parseInt(deceasedNumber, 10);
                const causeOfDeath = deceasedReason === 'Other' ? deceasedOtherReason.trim() || 'Other' : deceasedReason;

                // 1. Insert mortality health record (source of truth)
                const { error: hrErr } = await supabase.from('health_records').insert({
                    batch_id: selectedBatchId,
                    record_type: 'mortality',
                    title: `Mortality — ${causeOfDeath}`,
                    notes: `${n} animal(s) deceased. Cause: ${causeOfDeath}.`,
                    severity: n >= 10 ? 'high' : n >= 3 ? 'medium' : 'low',
                    affected_count: n,
                    record_date: new Date().toISOString().split('T')[0],
                    medication: null,
                    dosage: null,
                    followup_date: null,
                });
                if (hrErr) throw hrErr;

                // 2. Recalculate batch current_count from SUM of all mortality records
                //    This keeps batch count always in sync with health records
                const { data: allMortality } = await supabase
                    .from('health_records')
                    .select('affected_count')
                    .eq('batch_id', selectedBatchId)
                    .eq('record_type', 'mortality')
                    .is('deleted_at', null);

                const totalDeceased = (allMortality ?? []).reduce(
                    (sum: number, r: any) => sum + (r.affected_count ?? 0), 0
                );
                const newCurrentCount = Math.max(0, (selectedBatch?.estimated_count ?? 0) - totalDeceased);

                const { error: bErr } = await supabase
                    .from('batches')
                    .update({ current_count: newCurrentCount, updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (bErr) throw bErr;

                // 3. Recalculate housing current_count from ALL active batches in this housing
                const { data: activeBatches } = await supabase
                    .from('batches')
                    .select('current_count')
                    .eq('housing_id', housingId)
                    .eq('status', 'active');
                const housingCount = (activeBatches ?? []).reduce(
                    (sum: number, b: any) => sum + (b.current_count ?? 0), 0
                );
                await supabase.from('housings').update({
                    current_count: housingCount,
                    updated_at: new Date().toISOString(),
                }).eq('id', housingId);

                showSnackbar(`Recorded ${n} deceased.`);
                setDeceasedNumber(''); setDeceasedReason('Illness'); setDeceasedOtherReason('');

            } else if (confirmActionType === 'newBatch') {
                const count = parseInt(newBatchCount, 10);
                const { data: newBatch, error: bErr } = await supabase
                    .from('batches')
                    .insert({
                        farm_id: farmId,
                        housing_id: housingId,
                        name: newBatchName.trim(),
                        animal_type: housing?.animal_type,
                        estimated_count: count,
                        current_count: count,
                        arrival_date: new Date().toISOString().split('T')[0],
                        supplier: newBatchSupplier.trim() || null,
                        status: 'active',
                        created_by: userId,
                    })
                    .select()
                    .single();
                if (bErr) throw bErr;
                // Update housing count
                await supabase.from('housings').update({ current_count: (housing?.current_count ?? 0) + count, updated_at: new Date().toISOString() }).eq('id', housingId);
                showSnackbar('New batch created successfully.');
                setNewBatchName(''); setNewBatchCount(''); setNewBatchSupplier('');

            } else if (confirmActionType === 'completeBatch' && selectedBatchId) {
                const { error } = await supabase
                    .from('batches')
                    .update({ status: 'completed', updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (error) throw error;
                showSnackbar(`Batch "${selectedBatch?.name}" marked as completed.`);

            } else if (confirmActionType === 'archiveBatch' && selectedBatchId) {
                const { error } = await supabase
                    .from('batches')
                    .update({ status: 'archived', updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (error) throw error;
                showSnackbar(`Batch "${selectedBatch?.name}" archived.`);
            }
            await fetchData();
        } catch (err: any) {
            showSnackbar(err.message || 'Action failed.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={[styles.headerTopRow]}>
                    <View style={{ width: 44, height: 44 }}><BackButton fallbackRoute="/(animals)/AnimalsScreen" /></View>
                    <View style={{ flex: 1 }} />
                    <View style={{ width: 44 }} />
                </View>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
            </SafeAreaView>
        );
    }

    if (!housing) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.headerTopRow}>
                    <View style={{ width: 44, height: 44 }}><BackButton fallbackRoute="/(animals)/AnimalsScreen" /></View>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>Housing</Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[textStyles.body, { color: colors.textGrey }]}>Housing not found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]} numberOfLines={1}>
                    {housing.name}
                </Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: 8 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

                {/* Subtitle */}
                <Text style={[textStyles.body, styles.detailsSubtitle, { color: colors.textGrey, marginTop: 4, marginBottom: 16 }]}>
                    Manage batches and track head counts for this housing.
                </Text>

                {/* Growth button */}
                <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.primaryButton, { backgroundColor: colors.primary, marginBottom: 20, flexDirection: 'row', justifyContent: 'center' }]}
                    onPress={() => router.push({ pathname: '/(animals)/GrowthScreen' as any, params: { housingId, batchId: selectedBatchId ?? '' } })}
                >
                    <MaterialIcons name="show-chart" size={24} color={colors.onPrimary} style={{ marginRight: 8 }} />
                    <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>Growth & Analytics</Text>
                </TouchableOpacity>

                {/* Batch Selector */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[textStyles.label, styles.dropdownLabel, { color: colors.text, marginBottom: 0 }]}>
                        Select batch
                    </Text>
                    <TouchableOpacity onPress={() => setNewBatchVisible(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                        <Text style={[textStyles.label, { color: colors.primary }]}>New Batch</Text>
                    </TouchableOpacity>
                </View>

                {batches.length === 0 ? (
                    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center' }}>
                        <MaterialIcons name="layers" size={28} color={colors.textGrey} />
                        <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 8, textAlign: 'center', fontSize: 13 }]}>
                            No batches yet. Tap "New Batch" to add animals to this housing.
                        </Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={[styles.dropdownContainer, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, marginBottom: 20, paddingVertical: 14 }]}
                        onPress={() => setBatchModalVisible(true)}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialIcons name="layers" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>
                                {selectedBatchLabel || 'Select a batch'}
                            </Text>
                        </View>
                        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                    </TouchableOpacity>
                )}

                {/* Stats */}
                {selectedBatch && (
                    <>
                        <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>Batch Statistics</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                            <StatusCard
                                title="Live Heads"
                                value={String(selectedBatch.current_count)}
                                icon={isPig ? 'pig' : 'chicken'}
                                isCustomIcon
                                bgColor={accentColor + '1A'}
                                iconColor={accentColor}
                            />
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={{ flex: 1, minWidth: '45%' }}
                                onPress={() => router.push({ pathname: '/(animals)/MortalityRecordsScreen' as any, params: { housingId, batchId: selectedBatchId ?? '' } })}
                            >
                                <StatusCard
                                    title="Deceased"
                                    value={String(deceasedCount)}
                                    icon="warning"
                                    bgColor={colors.error + '1A'}
                                    iconColor={colors.error}
                                    showChevron
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Arrival info */}
                        <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, padding: 14, marginBottom: 20 }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 4 }]}>Batch details</Text>
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>
                                Arrived: <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{new Date(selectedBatch.arrival_date).toLocaleDateString()}</Text>
                            </Text>
                            {selectedBatch.supplier && (
                                <Text style={[textStyles.body, { color: colors.text, fontSize: 14, marginTop: 2 }]}>
                                    Supplier: <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{selectedBatch.supplier}</Text>
                                </Text>
                            )}
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 14, marginTop: 2 }]}>
                                Initial count: <Text style={{ fontFamily: 'Poppins-SemiBold' }}>{selectedBatch.estimated_count}</Text>
                            </Text>
                        </View>

                        {/* AI Insight */}
                        <AIInsightCard
                            title="AI Health & Growth Insight"
                            context={{
                                type: 'animal',
                                animalType: housing?.animal_type ?? '',
                                housingName: housing?.name ?? '',
                                data: {
                                    batchName: selectedBatch.name,
                                    animalType: housing?.animal_type,
                                    housingCapacity: housing?.capacity,
                                    liveHeads: selectedBatch.current_count,
                                    initialCount: selectedBatch.estimated_count,
                                    deceasedCount,
                                    mortalityRate: selectedBatch.estimated_count > 0
                                        ? ((deceasedCount / selectedBatch.estimated_count) * 100).toFixed(1) + '%'
                                        : '0%',
                                    arrivalDate: selectedBatch.arrival_date,
                                    supplier: selectedBatch.supplier,
                                    status: selectedBatch.status,
                                },
                            }}
                        />

                        {/* Quick Actions */}
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }}
                                onPress={() => setAddHeadsVisible(true)}
                                disabled={selectedBatch.status !== 'active'}
                            >
                                <MaterialIcons name="add" size={20} color={selectedBatch.status === 'active' ? colors.primary : colors.textGrey} style={{ marginRight: 6 }} />
                                <Text style={[textStyles.h3, { color: selectedBatch.status === 'active' ? colors.primary : colors.textGrey, fontSize: 13 }]}>Add Heads</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }}
                                onPress={() => setDeceasedVisible(true)}
                                disabled={selectedBatch.status !== 'active'}
                            >
                                <MaterialIcons name="warning" size={18} color={selectedBatch.status === 'active' ? colors.error : colors.textGrey} style={{ marginRight: 6 }} />
                                <Text style={[textStyles.h3, { color: selectedBatch.status === 'active' ? colors.error : colors.textGrey, fontSize: 13 }]}>Deceased</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Health Records */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20, elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }}
                            onPress={() => router.push({ pathname: '/(animals)/HealthRecordsScreen' as any, params: { housingId, batchId: selectedBatchId ?? '' } })}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#27AE601A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <MaterialIcons name="medical-services" size={20} color="#27AE60" />
                                </View>
                                <View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>Health Records</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1 }]}>Vaccinations, treatments & observations</Text>
                                </View>
                            </View>
                            <MaterialIcons name="chevron-right" size={22} color={colors.textGrey} />
                        </TouchableOpacity>

                        {/* Batch Status Management */}
                        {selectedBatch.status === 'active' && (
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    style={{ flex: 1, borderWidth: 1.5, borderColor: '#27AE60', borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                                    onPress={() => {
                                        setConfirmActionType('completeBatch');
                                        setConfirmModalType('confirmation');
                                        setConfirmModalTitle('Complete Batch?');
                                        setConfirmModalMessage(`Mark "${selectedBatch.name}" as completed? This means the batch cycle is done (harvested/sold).`);
                                        setConfirmModalVisible(true);
                                    }}
                                >
                                    <MaterialIcons name="check-circle-outline" size={18} color="#27AE60" style={{ marginRight: 6 }} />
                                    <Text style={[textStyles.h3, { color: '#27AE60', fontSize: 13 }]}>Complete</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    style={{ flex: 1, borderWidth: 1.5, borderColor: colors.textGrey, borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                                    onPress={() => {
                                        setConfirmActionType('archiveBatch');
                                        setConfirmModalType('warning');
                                        setConfirmModalTitle('Archive Batch?');
                                        setConfirmModalMessage(`Archive "${selectedBatch.name}"? It will be hidden from active view but records are kept.`);
                                        setConfirmModalVisible(true);
                                    }}
                                >
                                    <MaterialIcons name="archive" size={18} color={colors.textGrey} style={{ marginRight: 6 }} />
                                    <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 13 }]}>Archive</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}

                {/* AniBot placeholder */}
                <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="auto-awesome" size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>AniBot Insight</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                            AI growth projection will appear once batch data is available.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* Batch Selection Modal */}
            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={label => {
                    const idx = batchOptions.indexOf(label);
                    if (idx >= 0) setSelectedBatchId(batches[idx].id);
                    setBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose an active or past batch."
                icon="layers"
                options={batchOptions}
                selectedValue={selectedBatchLabel}
                enableSearch
                requireConfirm={false}
            />

            {/* Add Heads Modal */}
            <Modal visible={addHeadsVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name="add" size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Add Heads</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Enter the number of new animals to add to this batch.
                        </Text>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Number of Heads" icon={isPig ? 'pig' : 'chicken'} value={addHeadsNumber} onChangeText={t => setAddHeadsNumber(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput label="Age in Days (optional)" icon="calendar-today" value={addHeadsAge} onChangeText={t => setAddHeadsAge(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" backgroundColor={colors.surface} />
                        </View>
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setAddHeadsVisible(false)} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={handleAddHeadsClick} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Record Deceased Modal */}
            <Modal visible={deceasedVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.error + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name="warning" size={32} color={colors.error} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Record Deceased</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Enter the count and reason for the deceased animals.
                        </Text>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Number of Deceased" icon={isPig ? 'pig' : 'chicken'} value={deceasedNumber} onChangeText={t => setDeceasedNumber(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%', marginBottom: 28 }}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.stroke, borderRadius: 30, paddingHorizontal: 16, height: 58, backgroundColor: colors.surface }}
                                onPress={() => setDeceasedReasonModalVisible(true)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MaterialIcons name="help-outline" size={20} color={colors.icon} style={{ marginRight: 12 }} />
                                    <Text style={[textStyles.body, { color: colors.text }]}>{deceasedReason}</Text>
                                </View>
                                <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>
                        {deceasedReason === 'Other' && (
                            <View style={{ width: '100%', marginBottom: 8 }}>
                                <FloatingLabelInput label="Specific Reason" icon="edit" value={deceasedOtherReason} onChangeText={setDeceasedOtherReason} backgroundColor={colors.surface} />
                            </View>
                        )}
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setDeceasedVisible(false)} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.error, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={handleDeceasedClick} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: '#FFF', fontSize: 14 }]}>Record</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* New Batch Modal */}
            <Modal visible={newBatchVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name="add-box" size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>New Batch</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Start a new batch of animals for {housing.name}.
                        </Text>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Batch Name" icon="layers" value={newBatchName} onChangeText={setNewBatchName} backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Initial Head Count" icon={isPig ? 'pig' : 'chicken'} value={newBatchCount} onChangeText={t => setNewBatchCount(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput label="Supplier (optional)" icon="store" value={newBatchSupplier} onChangeText={setNewBatchSupplier} backgroundColor={colors.surface} />
                        </View>
                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setNewBatchVisible(false)} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={handleNewBatchClick} activeOpacity={0.7}>
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Deceased Reason Selection */}
            <SelectionModal
                visible={deceasedReasonModalVisible}
                onClose={() => setDeceasedReasonModalVisible(false)}
                onSelect={val => { setDeceasedReason(val); setDeceasedReasonModalVisible(false); }}
                title="Select Reason"
                description="Choose the reason for the deceased animals."
                icon="help-outline"
                options={['Illness', 'Injury', 'Predator', 'Unknown', 'Other']}
                selectedValue={deceasedReason}
                enableSearch={false}
                requireConfirm={false}
            />

            <ActionModal
                visible={confirmModalVisible}
                type={confirmModalType}
                title={confirmModalTitle}
                message={confirmModalMessage}
                confirmText={isSaving ? 'Processing...' : confirmActionType === 'deceased' ? 'Record' : confirmActionType === 'newBatch' ? 'Create' : confirmActionType === 'completeBatch' ? 'Complete' : confirmActionType === 'archiveBatch' ? 'Archive' : 'Add'}
                cancelText="Cancel"
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmModalVisible(false)}
            />

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </SafeAreaView>
    );
}

function StatusCard({ title, value, icon, bgColor, iconColor, isCustomIcon, showChevron }: any) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnimalStyles();
    return (
        <View style={[styles.statusCard, { flex: 1, minWidth: '45%', flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 12 }}>
                <View style={[styles.statusIconBox, { backgroundColor: bgColor, width: 36, height: 36, marginRight: 8, borderRadius: 8 }]}>
                    {isCustomIcon
                        ? <AnimalIcon type={icon} size={20} color={iconColor} />
                        : <MaterialIcons name={icon} size={20} color={iconColor} />
                    }
                </View>
                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, flex: 1 }]} numberOfLines={1}>{title}</Text>
                {showChevron && <MaterialIcons name="chevron-right" size={16} color={colors.textGrey} />}
            </View>
            <Text style={[textStyles.h2, { color: colors.text, fontSize: 24 }]}>{value}</Text>
        </View>
    );
}

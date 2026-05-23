import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, TouchableOpacity, View, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/Text';
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

            const batchList = batchRes.data ?? [];
            setBatches(batchList);

            // Self-healing check for housing count
            const expectedHousingCount = batchList
                .filter((b: any) => b.status === 'active')
                .reduce((sum: number, b: any) => sum + (b.current_count ?? 0), 0);

            if (housingRes.data && housingRes.data.current_count !== expectedHousingCount) {
                console.log(`[Self-Healing] Syncing housing ${housingId} count from ${housingRes.data.current_count} to ${expectedHousingCount}`);
                supabase.from('housings')
                    .update({ current_count: expectedHousingCount })
                    .eq('id', housingId)
                    .then(({ error: uErr }) => {
                        if (uErr) console.error('[Self-Healing] Failed to sync housing:', uErr.message);
                    });
                housingRes.data.current_count = expectedHousingCount;
            }
            setHousing(housingRes.data);
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
    const [confirmActionType, setConfirmActionType] = useState<'addHeads' | 'deceased' | 'newBatch' | 'editBatch' | 'completeBatch' | 'archiveBatch' | null>(null);

    // ── Add Heads Modal ───────────────────────────────────────────
    const [addHeadsVisible, setAddHeadsVisible] = useState(false);
    const [addHeadsNumber, setAddHeadsNumber] = useState('');
    const [addHeadsAge, setAddHeadsAge] = useState('');
    const [addHeadsError, setAddHeadsError] = useState<string | null>(null);

    // ── Deceased Modal ────────────────────────────────────────────
    const [deceasedVisible, setDeceasedVisible] = useState(false);
    const [deceasedNumber, setDeceasedNumber] = useState('');
    const [deceasedReason, setDeceasedReason] = useState('Illness');
    const [deceasedOtherReason, setDeceasedOtherReason] = useState('');
    const [deceasedReasonModalVisible, setDeceasedReasonModalVisible] = useState(false);
    const [deceasedError, setDeceasedError] = useState<string | null>(null);

    // ── New Batch Modal ───────────────────────────────────────────
    const [newBatchVisible, setNewBatchVisible] = useState(false);
    const [newBatchName, setNewBatchName] = useState('');
    const [newBatchCount, setNewBatchCount] = useState('');
    const [newBatchSupplier, setNewBatchSupplier] = useState('');
    const [newBatchCountError, setNewBatchCountError] = useState<string | null>(null);

    // ── Edit Batch Modal ──────────────────────────────────────────
    const [editBatchVisible, setEditBatchVisible] = useState(false);
    const [editBatchName, setEditBatchName] = useState('');
    const [editBatchCount, setEditBatchCount] = useState('');
    const [editBatchSupplier, setEditBatchSupplier] = useState('');
    const [editBatchCountError, setEditBatchCountError] = useState<string | null>(null);

    // ── Batch Selection ───────────────────────────────────────────
    const [batchModalVisible, setBatchModalVisible] = useState(false);
    const batchOptions = batches.map(b => `${b.name} (${b.status === 'active' ? 'Active' : b.status === 'completed' ? 'Completed' : 'Archived'})`);
    const selectedBatchLabel = selectedBatch
        ? `${selectedBatch.name} (${selectedBatch.status === 'active' ? 'Active' : selectedBatch.status === 'completed' ? 'Completed' : 'Archived'})`
        : '';

    // ── Validation Helpers ────────────────────────────────────────
    const validateAddHeads = (val: string) => {
        const maxAddable = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
        if (housing && housing.capacity > 0 && maxAddable <= 0) {
            setAddHeadsError(`Housing is at full capacity (${housing.capacity}/${housing.capacity}).`);
            return false;
        }
        if (!val.trim()) {
            setAddHeadsError('Number of heads is required.');
            return false;
        }
        const num = parseInt(val.trim(), 10);
        if (isNaN(num) || num <= 0) {
            setAddHeadsError('Number of heads must be greater than 0.');
            return false;
        }
        if (housing && housing.capacity > 0) {
            if (num > maxAddable) {
                setAddHeadsError(`Cannot exceed housing capacity (${housing.capacity}). Max addable: ${maxAddable}.`);
                return false;
            }
        }
        setAddHeadsError(null);
        return true;
    };

    const validateDeceased = (val: string) => {
        if (!val.trim()) {
            setDeceasedError('Number of deceased is required.');
            return false;
        }
        const num = parseInt(val.trim(), 10);
        if (isNaN(num) || num <= 0) {
            setDeceasedError('Number of deceased must be greater than 0.');
            return false;
        }
        if (selectedBatch && num > selectedBatch.current_count) {
            setDeceasedError(`Cannot exceed live heads (${selectedBatch.current_count}).`);
            return false;
        }
        setDeceasedError(null);
        return true;
    };

    const validateNewBatchCount = (val: string) => {
        const remaining = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
        if (housing && housing.capacity > 0 && remaining <= 0) {
            setNewBatchCountError(`Housing is at full capacity (${housing.capacity}/${housing.capacity}).`);
            return false;
        }
        if (!val.trim()) {
            setNewBatchCountError('Remaining head count is required.');
            return false;
        }
        const num = parseInt(val.trim(), 10);
        if (isNaN(num) || num <= 0) {
            setNewBatchCountError('Remaining head count must be greater than 0.');
            return false;
        }
        if (housing && housing.capacity > 0 && num > remaining) {
            setNewBatchCountError(`Cannot exceed remaining capacity (${remaining}).`);
            return false;
        }
        setNewBatchCountError(null);
        return true;
    };

    const validateEditBatchCount = (val: string) => {
        if (!selectedBatch) return false;
        if (!val.trim()) {
            setEditBatchCountError('Head count is required.');
            return false;
        }
        const num = parseInt(val.trim(), 10);
        if (isNaN(num) || num <= 0) {
            setEditBatchCountError('Head count must be greater than 0.');
            return false;
        }
        const difference = num - selectedBatch.estimated_count;
        if (housing && housing.capacity > 0 && (housing.current_count + difference) > housing.capacity) {
            setEditBatchCountError(`Exceeds housing capacity (${housing.capacity}). Max allowed: ${housing.capacity - housing.current_count + selectedBatch.estimated_count}.`);
            return false;
        }
        if (selectedBatch.current_count + difference < 0) {
            const deceasedCount = selectedBatch.estimated_count - selectedBatch.current_count;
            setEditBatchCountError(`Must be at least ${deceasedCount} to account for deceased heads.`);
            return false;
        }
        setEditBatchCountError(null);
        return true;
    };

    // ── Handlers ──────────────────────────────────────────────────
    const handleAddHeadsClick = () => {
        const isValid = validateAddHeads(addHeadsNumber);
        if (!isValid) return;
        if (!selectedBatchId) { showSnackbar('No batch selected.', 'error'); return; }
        setAddHeadsVisible(false);
        setConfirmActionType('addHeads');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Confirm Addition');
        setConfirmModalMessage(`Add ${addHeadsNumber} heads to "${selectedBatch?.name}"?`);
        setConfirmModalVisible(true);
    };

    const handleDeceasedClick = () => {
        const isValid = validateDeceased(deceasedNumber);
        if (!isValid) return;
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
        if (!newBatchName.trim()) {
            showSnackbar('Please enter a batch name.', 'error');
            return;
        }
        const isValid = validateNewBatchCount(newBatchCount);
        if (!isValid) return;
        setNewBatchVisible(false);
        setConfirmActionType('newBatch');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Create New Batch?');
        setConfirmModalMessage(`Start batch "${newBatchName}" with ${newBatchCount} heads in ${housing?.name}?`);
        setConfirmModalVisible(true);
    };

    const openEditBatchModal = () => {
        if (!selectedBatch) return;
        setEditBatchName(selectedBatch.name);
        setEditBatchCount(String(selectedBatch.estimated_count));
        setEditBatchSupplier(selectedBatch.supplier ?? '');
        setEditBatchCountError(null);
        setEditBatchVisible(true);
    };

    const handleEditBatchClick = () => {
        if (!selectedBatch) return;
        if (!editBatchName.trim()) {
            showSnackbar('Please enter a batch name.', 'error');
            return;
        }
        const isValid = validateEditBatchCount(editBatchCount);
        if (!isValid) return;
        setEditBatchVisible(false);
        setConfirmActionType('editBatch');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Update Batch?');
        setConfirmModalMessage(`Are you sure you want to update the details for batch "${selectedBatch.name}"?`);
        setConfirmModalVisible(true);
    };

    const handleConfirmAction = async () => {
        setIsSaving(true);
        try {
            if (confirmActionType === 'addHeads' && selectedBatchId) {
                const n = parseInt(addHeadsNumber, 10);
                const { error: bErr } = await supabase
                    .from('batches')
                    .update({ current_count: (selectedBatch?.current_count ?? 0) + n, estimated_count: (selectedBatch?.estimated_count ?? 0) + n, updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (bErr) throw bErr;
                const { error: hErr } = await supabase.from('housings').update({ current_count: (housing?.current_count ?? 0) + n, updated_at: new Date().toISOString() }).eq('id', housingId);
                if (hErr) throw hErr;
                showSnackbar(`Added ${n} heads successfully.`);
                setAddHeadsNumber(''); setAddHeadsAge('');

            } else if (confirmActionType === 'deceased' && selectedBatchId) {
                const n = parseInt(deceasedNumber, 10);
                const causeOfDeath = deceasedReason === 'Other' ? deceasedOtherReason.trim() || 'Other' : deceasedReason;

                // 1. Insert mortality health record (source of truth)
                const { error: hrErr } = await supabase.from('health_records').insert({
                    farm_id: farmId,
                    housing_id: housingId,
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
                    recorded_by: userId,
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

                // 3. Recalculate housing current_count in-memory to avoid race condition/delay
                const otherBatchesCount = batches
                    .filter(b => b.id !== selectedBatchId && b.status === 'active')
                    .reduce((sum: number, b: any) => sum + (b.current_count ?? 0), 0);
                const housingCount = otherBatchesCount + newCurrentCount;

                const { error: hErr } = await supabase.from('housings').update({
                    current_count: housingCount,
                    updated_at: new Date().toISOString(),
                }).eq('id', housingId);
                if (hErr) throw hErr;

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
                const { error: hErr } = await supabase.from('housings').update({ current_count: (housing?.current_count ?? 0) + count, updated_at: new Date().toISOString() }).eq('id', housingId);
                if (hErr) throw hErr;
                showSnackbar('New batch created successfully.');
                setNewBatchName(''); setNewBatchCount(''); setNewBatchSupplier('');

            } else if (confirmActionType === 'editBatch' && selectedBatchId && selectedBatch) {
                const count = parseInt(editBatchCount, 10);
                const difference = count - selectedBatch.estimated_count;
                const newCurrentCount = selectedBatch.current_count + difference;

                const { error: bErr } = await supabase
                    .from('batches')
                    .update({
                        name: editBatchName.trim(),
                        estimated_count: count,
                        current_count: newCurrentCount,
                        supplier: editBatchSupplier.trim() || null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', selectedBatchId);
                if (bErr) throw bErr;

                // Update housing count
                const newHousingCurrentCount = (housing?.current_count ?? 0) + difference;
                const { error: hErr } = await supabase
                    .from('housings')
                    .update({
                        current_count: newHousingCurrentCount,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', housingId);
                if (hErr) throw hErr;

                showSnackbar('Batch details updated successfully.');

            } else if (confirmActionType === 'completeBatch' && selectedBatchId) {
                const { error } = await supabase
                    .from('batches')
                    .update({ status: 'completed', updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (error) throw error;

                // Recalculate housing current_count in-memory (the completed batch is no longer active)
                const otherBatchesCount = batches
                    .filter(b => b.id !== selectedBatchId && b.status === 'active')
                    .reduce((sum: number, b: any) => sum + (b.current_count ?? 0), 0);
                const { error: hErr } = await supabase
                    .from('housings')
                    .update({ current_count: otherBatchesCount, updated_at: new Date().toISOString() })
                    .eq('id', housingId);
                if (hErr) throw hErr;

                showSnackbar(`Batch "${selectedBatch?.name}" marked as completed.`);

            } else if (confirmActionType === 'archiveBatch' && selectedBatchId) {
                const { error } = await supabase
                    .from('batches')
                    .update({ status: 'archived', updated_at: new Date().toISOString() })
                    .eq('id', selectedBatchId);
                if (error) throw error;

                // Recalculate housing current_count in-memory (the archived batch is no longer active)
                const otherBatchesCount = batches
                    .filter(b => b.id !== selectedBatchId && b.status === 'active')
                    .reduce((sum: number, b: any) => sum + (b.current_count ?? 0), 0);
                const { error: hErr } = await supabase
                    .from('housings')
                    .update({ current_count: otherBatchesCount, updated_at: new Date().toISOString() })
                    .eq('id', housingId);
                if (hErr) throw hErr;

                showSnackbar(`Batch "${selectedBatch?.name}" archived.`);
            }
            await fetchData();
        } catch (err: any) {
            showSnackbar(err.message || 'Action failed.', 'error');
        } finally {
            setIsSaving(false);
            setConfirmModalVisible(false);
        }
    };

    const isAddHeadsDisabled = !!(
        addHeadsError ||
        !addHeadsNumber.trim() ||
        (housing && housing.capacity > 0 && (parseInt(addHeadsNumber, 10) > Math.max(0, housing.capacity - housing.current_count) || Math.max(0, housing.capacity - housing.current_count) <= 0))
    );

    const isNewBatchDisabled = !!(
        !newBatchName.trim() ||
        !newBatchCount.trim() ||
        !!newBatchCountError ||
        (housing && housing.capacity > 0 && (parseInt(newBatchCount, 10) > Math.max(0, housing.capacity - housing.current_count) || Math.max(0, housing.capacity - housing.current_count) <= 0))
    );

    const isDeceasedDisabled = !!(
        !deceasedNumber.trim() ||
        !!deceasedError ||
        (deceasedReason === 'Other' && !deceasedOtherReason.trim()) ||
        (selectedBatch && parseInt(deceasedNumber, 10) > selectedBatch.current_count)
    );

    const isEditBatchDisabled = !!(
        !editBatchName.trim() ||
        !editBatchCount.trim() ||
        !!editBatchCountError ||
        (housing && housing.capacity > 0 && selectedBatch && (housing.current_count + (parseInt(editBatchCount, 10) - selectedBatch.estimated_count)) > housing.capacity) ||
        (selectedBatch && (selectedBatch.current_count + (parseInt(editBatchCount, 10) - selectedBatch.estimated_count)) < 0)
    );

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



                {/* Batch Selector */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[textStyles.label, styles.dropdownLabel, { color: colors.text, marginBottom: 0 }]}>
                        Select batch
                    </Text>
                    <TouchableOpacity onPress={() => {
                        setNewBatchName('');
                        setNewBatchCount('');
                        setNewBatchSupplier('');
                        const remaining = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
                        if (housing && housing.capacity > 0 && remaining <= 0) {
                            setNewBatchCountError(`Housing is at full capacity (${housing.capacity}/${housing.capacity}).`);
                        } else {
                            setNewBatchCountError(null);
                        }
                        setNewBatchVisible(true);
                    }} style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={[styles.dropdownContainer, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, paddingVertical: 14, marginBottom: 0 }]}
                            onPress={() => setBatchModalVisible(true)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <MaterialIcons name="layers" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 16, flex: 1 }]} numberOfLines={1}>
                                    {selectedBatchLabel || 'Select a batch'}
                                </Text>
                            </View>
                            <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                        </TouchableOpacity>
                        {selectedBatch && (
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 16,
                                    backgroundColor: colors.surface,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    elevation: 1,
                                    shadowColor: colors.shadow,
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.5,
                                    shadowRadius: 4,
                                }}
                                onPress={openEditBatchModal}
                            >
                                <MaterialIcons name="edit" size={22} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>
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
                                onPress={() => {
                                    setAddHeadsNumber('');
                                    setAddHeadsAge('');
                                    const maxAddable = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
                                    if (housing && housing.capacity > 0 && maxAddable <= 0) {
                                        setAddHeadsError(`Housing is at full capacity (${housing.capacity}/${housing.capacity}).`);
                                    } else {
                                        setAddHeadsError(null);
                                    }
                                    setAddHeadsVisible(true);
                                }}
                                disabled={selectedBatch.status !== 'active'}
                            >
                                <MaterialIcons name="add" size={20} color={selectedBatch.status === 'active' ? colors.primary : colors.textGrey} style={{ marginRight: 6 }} />
                                <Text style={[textStyles.h3, { color: selectedBatch.status === 'active' ? colors.primary : colors.textGrey, fontSize: 13 }]}>Add Heads</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }}
                                onPress={() => {
                                    setDeceasedNumber('');
                                    setDeceasedReason('Illness');
                                    setDeceasedOtherReason('');
                                    setDeceasedError(null);
                                    setDeceasedVisible(true);
                                }}
                                disabled={selectedBatch.status !== 'active'}
                            >
                                <MaterialIcons name="warning" size={18} color={selectedBatch.status === 'active' ? colors.error : colors.textGrey} style={{ marginRight: 6 }} />
                                <Text style={[textStyles.h3, { color: selectedBatch.status === 'active' ? colors.error : colors.textGrey, fontSize: 13 }]}>Deceased</Text>
                            </TouchableOpacity>
                        </View>



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
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 340, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 24, overflow: 'hidden' }}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                                <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                                    <MaterialIcons name="add" size={32} color={colors.primary} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Add Heads</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                    Enter the number of new animals to add to this batch.
                                </Text>

                                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <FloatingLabelInput
                                            label={housing && housing.capacity > 0 ? `Number of Heads (${addHeadsNumber || '0'}/${Math.max(0, housing.capacity - housing.current_count)})` : 'Number of Heads'}
                                            icon={isPig ? 'pig' : 'chicken'}
                                            value={addHeadsNumber}
                                            onChangeText={t => {
                                                const clean = t.replace(/[^0-9]/g, '');
                                                setAddHeadsNumber(clean);
                                                validateAddHeads(clean);
                                            }}
                                            keyboardType="numeric"
                                            backgroundColor={colors.surface}
                                            error={addHeadsError ?? undefined}
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'column', gap: 4, height: 58 }}>
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const maxAddable = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
                                                if (maxAddable <= 0) return;
                                                const current = parseInt(addHeadsNumber || '0', 10);
                                                const next = Math.min(maxAddable, current + 1);
                                                setAddHeadsNumber(String(next));
                                                validateAddHeads(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-up" size={18} color={colors.text} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const maxAddable = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
                                                if (maxAddable <= 0) return;
                                                const current = parseInt(addHeadsNumber || '0', 10);
                                                const next = Math.max(1, current - 1);
                                                setAddHeadsNumber(String(next));
                                                validateAddHeads(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={{ width: '100%', marginBottom: 12 }}>
                                    <FloatingLabelInput label="Age in Days (optional)" icon="calendar-today" value={addHeadsAge} onChangeText={t => setAddHeadsAge(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" backgroundColor={colors.surface} />
                                </View>

                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setAddHeadsVisible(false)} activeOpacity={0.7}>
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: isAddHeadsDisabled ? colors.cardFill : colors.primary,
                                            paddingVertical: 14,
                                            borderRadius: 30,
                                            alignItems: 'center'
                                        }}
                                        onPress={handleAddHeadsClick}
                                        disabled={isAddHeadsDisabled}
                                        activeOpacity={isAddHeadsDisabled ? 1 : 0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: isAddHeadsDisabled ? colors.textGrey : colors.onPrimary, fontSize: 14 }]}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Record Deceased Modal */}
            <Modal visible={deceasedVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 340, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 24, overflow: 'hidden' }}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                                <View style={{ backgroundColor: colors.error + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                                    <MaterialIcons name="warning" size={32} color={colors.error} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Record Deceased</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                    Enter the count and reason for the deceased animals.
                                </Text>

                                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <FloatingLabelInput
                                            label="Number of Deceased"
                                            icon={isPig ? 'pig' : 'chicken'}
                                            value={deceasedNumber}
                                            onChangeText={t => {
                                                const clean = t.replace(/[^0-9]/g, '');
                                                setDeceasedNumber(clean);
                                                validateDeceased(clean);
                                            }}
                                            keyboardType="numeric"
                                            backgroundColor={colors.surface}
                                            error={deceasedError ?? undefined}
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'column', gap: 4, height: 58 }}>
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const current = parseInt(deceasedNumber || '0', 10);
                                                const maxLimit = selectedBatch?.current_count ?? 10000;
                                                const next = Math.min(maxLimit, current + 1);
                                                setDeceasedNumber(String(next));
                                                validateDeceased(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-up" size={18} color={colors.text} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const current = parseInt(deceasedNumber || '0', 10);
                                                const next = Math.max(1, current - 1);
                                                setDeceasedNumber(String(next));
                                                validateDeceased(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
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
                                    <View style={{ width: '100%', marginBottom: 12 }}>
                                        <FloatingLabelInput label="Specific Reason" icon="edit" value={deceasedOtherReason} onChangeText={setDeceasedOtherReason} backgroundColor={colors.surface} />
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setDeceasedVisible(false)} activeOpacity={0.7}>
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: isDeceasedDisabled ? colors.cardFill : colors.error,
                                            paddingVertical: 14,
                                            borderRadius: 30,
                                            alignItems: 'center'
                                        }}
                                        onPress={handleDeceasedClick}
                                        disabled={isDeceasedDisabled}
                                        activeOpacity={isDeceasedDisabled ? 1 : 0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: isDeceasedDisabled ? colors.textGrey : '#FFF', fontSize: 14 }]}>Record</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* New Batch Modal */}
            <Modal visible={newBatchVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 340, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 24, overflow: 'hidden' }}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
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

                                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <FloatingLabelInput
                                            label={housing && housing.capacity > 0 ? `Remaining Head Count (${newBatchCount || '0'}/${Math.max(0, housing.capacity - housing.current_count)})` : 'Remaining Head Count'}
                                            icon={isPig ? 'pig' : 'chicken'}
                                            value={newBatchCount}
                                            onChangeText={t => {
                                                const clean = t.replace(/[^0-9]/g, '');
                                                setNewBatchCount(clean);
                                                validateNewBatchCount(clean);
                                            }}
                                            keyboardType="numeric"
                                            backgroundColor={colors.surface}
                                            error={newBatchCountError ?? undefined}
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'column', gap: 4, height: 58 }}>
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const remaining = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
                                                if (remaining <= 0) return;
                                                const current = parseInt(newBatchCount || '0', 10);
                                                const next = Math.min(remaining, current + 1);
                                                setNewBatchCount(String(next));
                                                validateNewBatchCount(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-up" size={18} color={colors.text} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const remaining = housing && housing.capacity > 0 ? Math.max(0, housing.capacity - housing.current_count) : 999999;
                                                if (remaining <= 0) return;
                                                const current = parseInt(newBatchCount || '0', 10);
                                                const next = Math.max(1, current - 1);
                                                setNewBatchCount(String(next));
                                                validateNewBatchCount(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={{ width: '100%', marginBottom: 12 }}>
                                    <FloatingLabelInput label="Supplier (optional)" icon="store" value={newBatchSupplier} onChangeText={setNewBatchSupplier} backgroundColor={colors.surface} />
                                </View>

                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setNewBatchVisible(false)} activeOpacity={0.7}>
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: isNewBatchDisabled ? colors.cardFill : colors.primary,
                                            paddingVertical: 14,
                                            borderRadius: 30,
                                            alignItems: 'center'
                                        }}
                                        onPress={handleNewBatchClick}
                                        disabled={isNewBatchDisabled}
                                        activeOpacity={isNewBatchDisabled ? 1 : 0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: isNewBatchDisabled ? colors.textGrey : colors.onPrimary, fontSize: 14 }]}>Create</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Edit Batch Modal */}
            <Modal visible={editBatchVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 340, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 24, overflow: 'hidden' }}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                                <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                                    <MaterialIcons name="edit" size={32} color={colors.primary} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Edit Batch</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                    Update batch details for {selectedBatch?.name}.
                                </Text>

                                <View style={{ width: '100%' }}>
                                    <FloatingLabelInput label="Batch Name" icon="layers" value={editBatchName} onChangeText={setEditBatchName} backgroundColor={colors.surface} />
                                </View>

                                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <FloatingLabelInput
                                            label={housing && housing.capacity > 0 ? `Head Count (${editBatchCount || '0'}/${housing.capacity})` : 'Head Count'}
                                            icon={isPig ? 'pig' : 'chicken'}
                                            value={editBatchCount}
                                            onChangeText={t => {
                                                const clean = t.replace(/[^0-9]/g, '');
                                                setEditBatchCount(clean);
                                                validateEditBatchCount(clean);
                                            }}
                                            keyboardType="numeric"
                                            backgroundColor={colors.surface}
                                            error={editBatchCountError ?? undefined}
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'column', gap: 4, height: 58 }}>
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const current = parseInt(editBatchCount || '0', 10);
                                                const next = current + 1;
                                                setEditBatchCount(String(next));
                                                validateEditBatchCount(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-up" size={18} color={colors.text} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                width: 44,
                                                height: 27,
                                                borderRadius: 8,
                                                backgroundColor: colors.cardFill,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                            }}
                                            onPress={() => {
                                                const current = parseInt(editBatchCount || '0', 10);
                                                const next = Math.max(1, current - 1);
                                                setEditBatchCount(String(next));
                                                validateEditBatchCount(String(next));
                                            }}
                                        >
                                            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={{ width: '100%', marginBottom: 12 }}>
                                    <FloatingLabelInput label="Supplier (optional)" icon="store" value={editBatchSupplier} onChangeText={setEditBatchSupplier} backgroundColor={colors.surface} />
                                </View>

                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setEditBatchVisible(false)} activeOpacity={0.7}>
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: isEditBatchDisabled ? colors.cardFill : colors.primary,
                                            paddingVertical: 14,
                                            borderRadius: 30,
                                            alignItems: 'center'
                                        }}
                                        onPress={handleEditBatchClick}
                                        disabled={isEditBatchDisabled}
                                        activeOpacity={isEditBatchDisabled ? 1 : 0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: isEditBatchDisabled ? colors.textGrey : colors.onPrimary, fontSize: 14 }]}>Save</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
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
                confirmText={
                    confirmActionType === 'deceased' ? 'Record' :
                    confirmActionType === 'newBatch' ? 'Create' :
                    confirmActionType === 'editBatch' ? 'Update' :
                    confirmActionType === 'completeBatch' ? 'Complete' :
                    confirmActionType === 'archiveBatch' ? 'Archive' :
                    'Add'
                }
                cancelText="Cancel"
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmModalVisible(false)}
                isLoading={isSaving}
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

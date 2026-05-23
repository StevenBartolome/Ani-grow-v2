import { MaterialIcons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { SelectionModal } from '@/components/SelectionModal';
import { AnimalIcon } from '@/components/AnimalIcon';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';

interface HousingItem {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    capacity: number;
    current_count: number;
    status: string;
}

type FilterType = 'All' | 'Chickens' | 'Pigs';

const ANIMAL_TYPE_LABEL: Record<string, string> = { chicken: 'Chickens', pig: 'Pigs' };
const LABEL_TO_DB: Record<string, string>        = { Chickens: 'chicken', Pigs: 'pig' };

export default function ManageHousingsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const deviceStyles = useDevicesStyles();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const filters: FilterType[] = ['All', 'Chickens', 'Pigs'];

    const [housings, setHousings] = useState<HousingItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // ── Fetch ─────────────────────────────────────────────────────
    const fetchHousings = useCallback(async () => {
        if (!farmId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('housings')
                .select('id, name, animal_type, capacity, current_count, status')
                .eq('farm_id', farmId)
                .order('name', { ascending: true });
            if (error) throw error;
            setHousings(data ?? []);
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to load housings.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    useEffect(() => { fetchHousings(); }, [fetchHousings]);

    const filteredHousings = activeFilter === 'All'
        ? housings
        : housings.filter(h => ANIMAL_TYPE_LABEL[h.animal_type] === activeFilter);

    // ── Modal state (Add / Edit) ──────────────────────────────────
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingHousingId, setEditingHousingId] = useState<string | null>(null);
    const [tempHousingName, setTempHousingName] = useState('');
    const [tempHousingType, setTempHousingType] = useState<'Chickens' | 'Pigs'>('Pigs');
    const [tempCapacity, setTempCapacity] = useState('');
    const [housingTypeModalVisible, setHousingTypeModalVisible] = useState(false);
    const [capacityError, setCapacityError] = useState<string | null>(null);

    // ── Confirmation Modal ────────────────────────────────────────
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [confirmModalType, setConfirmModalType] = useState<ActionModalType>('confirmation');
    const [confirmModalTitle, setConfirmModalTitle] = useState('');
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmAction, setConfirmAction] = useState<'delete' | 'save' | null>(null);
    const [housingToDelete, setHousingToDelete] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // ── Snackbar ──────────────────────────────────────────────────
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const openAddModal = () => {
        setEditingHousingId(null);
        setTempHousingName('');
        setTempHousingType('Pigs');
        setTempCapacity('');
        setCapacityError(null);
        setEditModalVisible(true);
    };

    const openEditModal = (id: string) => {
        const h = housings.find(x => x.id === id);
        if (h) {
            setEditingHousingId(id);
            setTempHousingName(h.name);
            setTempHousingType(ANIMAL_TYPE_LABEL[h.animal_type] as 'Chickens' | 'Pigs');
            setTempCapacity(h.capacity > 0 ? String(h.capacity) : '');
            setCapacityError(null);
            setEditModalVisible(true);
        }
    };

    const confirmDelete = (id: string) => {
        const h = housings.find(x => x.id === id);
        if (h) {
            setHousingToDelete(id);
            setConfirmAction('delete');
            setConfirmModalType('warning');
            setConfirmModalTitle('Delete Housing?');
            setConfirmModalMessage(`Are you sure you want to delete "${h.name}"? All related batches will also be removed.`);
            setConfirmModalVisible(true);
        }
    };

    const validateCapacity = (val: string, type: 'Chickens' | 'Pigs') => {
        if (!val.trim()) {
            setCapacityError('Capacity is required.');
            return false;
        }
        const cap = parseInt(val.trim(), 10);
        if (isNaN(cap)) {
            setCapacityError('Please enter a valid capacity.');
            return false;
        }
        if (cap <= 0) {
            setCapacityError('Capacity must be greater than 0.');
            return false;
        }
        if (type === 'Pigs') {
            if (cap < 1 || cap > 100) {
                setCapacityError('Capacity for Pigs must be between 1 and 100.');
                return false;
            }
        } else if (type === 'Chickens') {
            if (cap < 1 || cap > 500) {
                setCapacityError('Capacity for Chickens must be between 1 and 500.');
                return false;
            }
        }
        setCapacityError(null);
        return true;
    };

    const isSaveDisabled = !!(
        !tempHousingName.trim() ||
        !tempCapacity.trim() ||
        !!capacityError
    );

    const handleSaveClick = () => {
        if (isSaveDisabled) return;
        if (!tempHousingName.trim()) {
            showSnackbar('Please enter a housing name.', 'error');
            return;
        }

        const isValid = validateCapacity(tempCapacity, tempHousingType);
        if (!isValid) return;

        setEditModalVisible(false);
        setConfirmAction('save');
        setConfirmModalType('confirmation');
        setConfirmModalTitle(editingHousingId ? 'Update Housing?' : 'Add Housing?');
        setConfirmModalMessage(`Are you sure you want to ${editingHousingId ? 'update this' : 'add a new'} housing?`);
        setConfirmModalVisible(true);
    };

    const executeAction = async () => {
        setIsSaving(true);
        try {
            if (confirmAction === 'delete' && housingToDelete) {
                const { error } = await supabase
                    .from('housings')
                    .delete()
                    .eq('id', housingToDelete);
                if (error) throw error;
                showSnackbar('Housing deleted successfully.', 'success');
            } else if (confirmAction === 'save') {
                const payload = {
                    name: tempHousingName.trim(),
                    animal_type: LABEL_TO_DB[tempHousingType] as 'chicken' | 'pig',
                    capacity: parseInt(tempCapacity || '0', 10),
                    updated_at: new Date().toISOString(),
                };
                if (editingHousingId) {
                    const { error } = await supabase
                        .from('housings')
                        .update(payload)
                        .eq('id', editingHousingId);
                    if (error) throw error;
                    showSnackbar('Housing updated successfully.', 'success');
                } else {
                    const { error } = await supabase
                        .from('housings')
                        .insert({ ...payload, farm_id: farmId });
                    if (error) throw error;
                    showSnackbar('New housing added successfully.', 'success');
                }
            }
            await fetchHousings();
        } catch (err: any) {
            showSnackbar(err.message || 'Action failed.', 'error');
        } finally {
            setIsSaving(false);
            setConfirmModalVisible(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Manage Housings
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: -8 }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Registered Housings</Text>
                            <TouchableOpacity onPress={openAddModal} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                                <Text style={[textStyles.label, { color: colors.primary }]}>Add New</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.sectionDescription}>List of all physical housings for your livestock.</Text>

                        <View style={[deviceStyles.filterContainer, { marginTop: 12, marginBottom: 16, paddingHorizontal: 0 }]}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {filters.map(filter => (
                                    <TouchableOpacity
                                        key={filter}
                                        activeOpacity={0.7}
                                        onPress={() => setActiveFilter(filter)}
                                        style={[deviceStyles.filterChip, activeFilter === filter && deviceStyles.filterChipActive]}
                                    >
                                        <Text style={[deviceStyles.filterChipText, activeFilter === filter && deviceStyles.filterChipTextActive]}>
                                            {filter}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={[styles.card, { paddingVertical: 8 }]}>
                            {isLoading ? (
                                <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 32 }} />
                            ) : filteredHousings.length === 0 ? (
                                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                                    <MaterialIcons name="home" size={40} color={colors.textGrey} />
                                    <Text style={[textStyles.h3, { color: colors.textGrey, marginTop: 12, fontSize: 15 }]}>No housings yet</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 4, textAlign: 'center' }]}>
                                        Tap "Add New" to register your first housing.
                                    </Text>
                                </View>
                            ) : (
                                filteredHousings.map((housing, index) => (
                                    <View key={housing.id} style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                        paddingVertical: 12, paddingHorizontal: 16,
                                        borderBottomWidth: index < filteredHousings.length - 1 ? 1 : 0,
                                        borderBottomColor: colors.stroke,
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                                <MaterialIcons name="home" size={20} color={colors.primary} />
                                            </View>
                                            <View>
                                                <Text style={[textStyles.h3, { color: colors.text }]}>{housing.name}</Text>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                                    {ANIMAL_TYPE_LABEL[housing.animal_type]} · {housing.current_count}/{housing.capacity > 0 ? housing.capacity : '—'} heads
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <TouchableOpacity onPress={() => openEditModal(housing.id)}>
                                                <MaterialIcons name="edit" size={22} color={colors.textGrey} />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => confirmDelete(housing.id)}>
                                                <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    </View>
                </ScrollView>
            </View>

            {/* Add / Edit Modal */}
            <Modal visible={editModalVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 340, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 24, overflow: 'hidden' }}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                                <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                                    <MaterialIcons name={editingHousingId ? 'edit' : 'add-home'} size={32} color={colors.primary} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>
                                    {editingHousingId ? 'Edit Housing' : 'Add Housing'}
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                    Enter the details for this housing location.
                                </Text>

                                <View style={{ width: '100%' }}>
                                    <FloatingLabelInput label="Housing Name" icon="home" value={tempHousingName} onChangeText={setTempHousingName} backgroundColor={colors.surface} />
                                </View>

                                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <FloatingLabelInput
                                            label="Capacity (heads)"
                                            icon="format-list-numbered"
                                            value={tempCapacity}
                                            onChangeText={t => {
                                                const clean = t.replace(/[^0-9]/g, '');
                                                setTempCapacity(clean);
                                                validateCapacity(clean, tempHousingType);
                                            }}
                                            keyboardType="numeric"
                                            backgroundColor={colors.surface}
                                            error={capacityError ?? undefined}
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
                                                const current = parseInt(tempCapacity || '0', 10);
                                                const maxCap = tempHousingType === 'Pigs' ? 100 : 500;
                                                const next = Math.min(maxCap, current + 1);
                                                setTempCapacity(String(next));
                                                validateCapacity(String(next), tempHousingType);
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
                                                const current = parseInt(tempCapacity || '0', 10);
                                                const next = Math.max(0, current - 1);
                                                setTempCapacity(String(next));
                                                validateCapacity(String(next), tempHousingType);
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
                                        onPress={() => { setEditModalVisible(false); setHousingTypeModalVisible(true); }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <AnimalIcon type={tempHousingType === 'Pigs' ? 'pig' : 'chicken'} size={20} color={colors.icon} style={{ marginRight: 12 }} />
                                            <Text style={[textStyles.body, { color: colors.text }]}>{tempHousingType}</Text>
                                        </View>
                                        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }} onPress={() => setEditModalVisible(false)} activeOpacity={0.7}>
                                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: isSaveDisabled ? colors.cardFill : colors.primary,
                                            paddingVertical: 14,
                                            borderRadius: 30,
                                            alignItems: 'center'
                                        }}
                                        onPress={handleSaveClick}
                                        disabled={isSaveDisabled}
                                        activeOpacity={isSaveDisabled ? 1 : 0.7}
                                    >
                                        <Text style={[textStyles.h3, { color: isSaveDisabled ? colors.textGrey : colors.onPrimary, fontSize: 14 }]}>Save</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            <SelectionModal
                visible={housingTypeModalVisible}
                onClose={() => { setHousingTypeModalVisible(false); setEditModalVisible(true); }}
                onSelect={val => {
                    const newType = val as 'Pigs' | 'Chickens';
                    setTempHousingType(newType);
                    validateCapacity(tempCapacity, newType);
                    setHousingTypeModalVisible(false);
                    setEditModalVisible(true);
                }}
                title="Animal Type"
                description="Select the type of animal for this housing."
                icon={tempHousingType === 'Pigs' ? 'pig' : 'chicken'}
                isCustomIcon
                options={['Pigs', 'Chickens']}
                selectedValue={tempHousingType}
                requireConfirm={false}
                enableSearch={false}
            />

            <ActionModal
                visible={confirmModalVisible}
                type={confirmModalType}
                title={confirmModalTitle}
                message={confirmModalMessage}
                confirmText={confirmAction === 'delete' ? 'Delete' : 'Confirm'}
                cancelText="Cancel"
                onConfirm={executeAction}
                onCancel={() => setConfirmModalVisible(false)}
                isLoading={isSaving}
            />

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </SafeAreaView>
    );
}

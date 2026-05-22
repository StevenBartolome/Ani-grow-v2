import { MaterialIcons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View, Modal } from 'react-native';
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

interface FeedItem {
    id: string;
    name: string;
    brand: string;
    category: string;
    animal_type: 'chicken' | 'pig';
    stock_kg: number;
    supplier: string;
}

type FilterType = 'All' | 'Chickens' | 'Pigs';

const ANIMAL_TYPE_LABEL: Record<string, string> = { chicken: 'Chickens', pig: 'Pigs' };
const LABEL_TO_DB: Record<string, string>        = { Chickens: 'chicken', Pigs: 'pig' };

export default function ManageFeedsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const deviceStyles = useDevicesStyles();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const filters: FilterType[] = ['All', 'Chickens', 'Pigs'];

    const [feeds, setFeeds] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // ── Fetch ─────────────────────────────────────────────────────
    const fetchFeeds = useCallback(async () => {
        if (!farmId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('feeds')
                .select('id, name, brand, category, animal_type, stock_kg, supplier')
                .eq('farm_id', farmId)
                .order('name', { ascending: true });
            if (error) throw error;
            setFeeds(data ?? []);
        } catch (err: any) {
            showSnackbar(err.message || 'Failed to load feeds.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    useEffect(() => { fetchFeeds(); }, [fetchFeeds]);

    const filteredFeeds = activeFilter === 'All'
        ? feeds
        : feeds.filter(f => ANIMAL_TYPE_LABEL[f.animal_type] === activeFilter);

    // ── Modal state ───────────────────────────────────────────────
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
    const [tempFeedName, setTempFeedName] = useState('');
    const [tempFeedBrand, setTempFeedBrand] = useState('');
    const [tempFeedSupplier, setTempFeedSupplier] = useState('');
    const [tempFeedCategory, setTempFeedCategory] = useState('');
    const [tempFeedType, setTempFeedType] = useState<'Pigs' | 'Chickens'>('Pigs');
    const [tempFeedStock, setTempFeedStock] = useState('0');
    const [tempFeedStockError, setTempFeedStockError] = useState<string | null>(null);
    const [tempFeedStockUnit, setTempFeedStockUnit] = useState<'kg' | 'g'>('kg');
    const [feedTypeModalVisible, setFeedTypeModalVisible] = useState(false);

    // ── Confirm Modal ─────────────────────────────────────────────
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [confirmModalType, setConfirmModalType] = useState<ActionModalType>('confirmation');
    const [confirmModalTitle, setConfirmModalTitle] = useState('');
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmAction, setConfirmAction] = useState<'delete' | 'save' | null>(null);
    const [feedToDelete, setFeedToDelete] = useState<string | null>(null);
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
        setEditingFeedId(null);
        setTempFeedName('');
        setTempFeedBrand('');
        setTempFeedSupplier('');
        setTempFeedCategory('');
        setTempFeedType('Pigs');
        setTempFeedStock('');
        setTempFeedStockUnit('kg');
        setTempFeedStockError(null);
        setEditModalVisible(true);
    };

    const openEditModal = (id: string) => {
        const f = feeds.find(x => x.id === id);
        if (f) {
            setEditingFeedId(id);
            setTempFeedName(f.name);
            setTempFeedBrand(f.brand ?? '');
            setTempFeedSupplier(f.supplier ?? '');
            setTempFeedCategory(f.category ?? '');
            setTempFeedType(ANIMAL_TYPE_LABEL[f.animal_type] as 'Pigs' | 'Chickens');
            if (f.stock_kg < 1 && f.stock_kg > 0) {
                setTempFeedStock(String(f.stock_kg * 1000));
                setTempFeedStockUnit('g');
            } else {
                setTempFeedStock(String(f.stock_kg ?? 0));
                setTempFeedStockUnit('kg');
            }
            setTempFeedStockError(null);
            setEditModalVisible(true);
        }
    };

    const confirmDelete = (id: string) => {
        const f = feeds.find(x => x.id === id);
        if (f) {
            setFeedToDelete(id);
            setConfirmAction('delete');
            setConfirmModalType('warning');
            setConfirmModalTitle('Delete Feed?');
            setConfirmModalMessage(`Are you sure you want to delete "${f.name}"?`);
            setConfirmModalVisible(true);
        }
    };

    const validateStock = (val: string) => {
        if (!val.trim()) {
            setTempFeedStockError('Stock is required.');
            return false;
        }
        const num = parseFloat(val.trim());
        if (isNaN(num) || num <= 0) {
            setTempFeedStockError('Stock must be greater than 0.');
            return false;
        }
        setTempFeedStockError(null);
        return true;
    };

    const isSaveDisabled = !!(
        !tempFeedName.trim() ||
        !tempFeedStock.trim() ||
        !!tempFeedStockError ||
        isNaN(parseFloat(tempFeedStock)) ||
        parseFloat(tempFeedStock) <= 0
    );

    const handleSaveClick = () => {
        if (isSaveDisabled) return;
        if (!tempFeedName.trim()) { showSnackbar('Please enter a feed name.', 'error'); return; }
        const isValid = validateStock(tempFeedStock);
        if (!isValid) return;
        setEditModalVisible(false);
        setConfirmAction('save');
        setConfirmModalType('confirmation');
        setConfirmModalTitle(editingFeedId ? 'Update Feed?' : 'Add Feed?');
        setConfirmModalMessage(`Are you sure you want to ${editingFeedId ? 'update this' : 'add a new'} feed?`);
        setConfirmModalVisible(true);
    };

    const executeAction = async () => {
        setIsSaving(true);
        try {
            if (confirmAction === 'delete' && feedToDelete) {
                const { error } = await supabase.from('feeds').delete().eq('id', feedToDelete);
                if (error) throw error;
                showSnackbar('Feed deleted successfully.', 'success');
            } else if (confirmAction === 'save') {
                const stockVal = parseFloat(tempFeedStock) || 0;
                const stockInKg = tempFeedStockUnit === 'g' ? stockVal / 1000 : stockVal;
                const payload = {
                    name:        tempFeedName.trim(),
                    brand:       tempFeedBrand.trim() || null,
                    supplier:    tempFeedSupplier.trim() || null,
                    category:    tempFeedCategory.trim() || null,
                    animal_type: LABEL_TO_DB[tempFeedType] as 'chicken' | 'pig',
                    stock_kg:    stockInKg,
                    updated_at:  new Date().toISOString(),
                };
                if (editingFeedId) {
                    const { error } = await supabase.from('feeds').update(payload).eq('id', editingFeedId);
                    if (error) throw error;
                    showSnackbar('Feed updated successfully.', 'success');
                } else {
                    const { error } = await supabase.from('feeds').insert({ ...payload, farm_id: farmId });
                    if (error) throw error;
                    showSnackbar('New feed added successfully.', 'success');
                }
            }
            await fetchFeeds();
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
                        Manage Feeds
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: -8 }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Available Feeds</Text>
                            <TouchableOpacity onPress={openAddModal} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                                <Text style={[textStyles.label, { color: colors.primary }]}>Add New</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.sectionDescription}>Feed options registered for your farm's livestock.</Text>

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
                            ) : filteredFeeds.length === 0 ? (
                                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                                    <MaterialIcons name="restaurant-menu" size={40} color={colors.textGrey} />
                                    <Text style={[textStyles.h3, { color: colors.textGrey, marginTop: 12, fontSize: 15 }]}>No feeds yet</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 4, textAlign: 'center' }]}>
                                        Tap "Add New" to register your first feed option.
                                    </Text>
                                </View>
                            ) : (
                                filteredFeeds.map((feed, index) => (
                                    <View key={feed.id} style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                        paddingVertical: 12, paddingHorizontal: 16,
                                        borderBottomWidth: index < filteredFeeds.length - 1 ? 1 : 0,
                                        borderBottomColor: colors.stroke,
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                                <MaterialIcons name="restaurant-menu" size={20} color={colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[textStyles.h3, { color: colors.text }]}>{feed.name}</Text>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]} numberOfLines={1}>
                                                    {ANIMAL_TYPE_LABEL[feed.animal_type]}
                                                    {feed.category ? ` · ${feed.category}` : ''}
                                                    {feed.brand ? ` · ${feed.brand}` : ''}
                                                    {` · Stock: ${feed.stock_kg < 1 ? `${feed.stock_kg * 1000} g` : `${feed.stock_kg} kg`}`}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <TouchableOpacity onPress={() => openEditModal(feed.id)}>
                                                <MaterialIcons name="edit" size={22} color={colors.textGrey} />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => confirmDelete(feed.id)}>
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
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name={editingFeedId ? 'edit' : 'restaurant'} size={32} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>
                            {editingFeedId ? 'Edit Feed' : 'Add Feed'}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Enter the details for this feed option.
                        </Text>

                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Feed Name *" icon="restaurant-menu" value={tempFeedName} onChangeText={setTempFeedName} backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Brand" icon="business" value={tempFeedBrand} onChangeText={setTempFeedBrand} backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Supplier / Shop (optional)" icon="store" value={tempFeedSupplier} onChangeText={setTempFeedSupplier} backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%' }}>
                            <FloatingLabelInput label="Category (Starter, Grower, etc.)" icon="category" value={tempFeedCategory} onChangeText={setTempFeedCategory} backgroundColor={colors.surface} />
                        </View>
                        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                            <View style={{ flex: 1 }}>
                                <FloatingLabelInput
                                    label="Stock"
                                    icon="inventory"
                                    value={tempFeedStock}
                                    onChangeText={t => {
                                        const clean = t.replace(/[^0-9.]/g, '');
                                        setTempFeedStock(clean);
                                        validateStock(clean);
                                    }}
                                    keyboardType="decimal-pad"
                                    backgroundColor={colors.surface}
                                    error={tempFeedStockError ?? undefined}
                                />
                            </View>

                            <View
                                style={{
                                    width: 54,
                                    height: 58,
                                    borderRadius: 16,
                                    backgroundColor: colors.cardFill,
                                    borderWidth: 1.5,
                                    borderColor: colors.stroke,
                                    overflow: 'hidden',
                                    flexDirection: 'column',
                                }}
                            >
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        if (tempFeedStockUnit === 'kg') return;
                                        const current = parseFloat(tempFeedStock || '0');
                                        if (!isNaN(current) && current > 0) {
                                            const newStock = Math.round((current / 1000) * 10000) / 10000;
                                            setTempFeedStock(String(newStock));
                                        }
                                        setTempFeedStockUnit('kg');
                                    }}
                                    style={{
                                        flex: 1,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: tempFeedStockUnit === 'kg' ? colors.primary + '20' : 'transparent',
                                    }}
                                >
                                    <Text style={[textStyles.body, { fontSize: 12, color: tempFeedStockUnit === 'kg' ? colors.primary : colors.textGrey, fontFamily: tempFeedStockUnit === 'kg' ? 'Poppins-SemiBold' : 'Poppins-Regular' }]}>
                                        kg
                                    </Text>
                                </TouchableOpacity>

                                <View style={{ height: 1, backgroundColor: colors.stroke, width: '100%' }} />

                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        if (tempFeedStockUnit === 'g') return;
                                        const current = parseFloat(tempFeedStock || '0');
                                        if (!isNaN(current) && current > 0) {
                                            const newStock = Math.round(current * 1000 * 100) / 100;
                                            setTempFeedStock(String(newStock));
                                        }
                                        setTempFeedStockUnit('g');
                                    }}
                                    style={{
                                        flex: 1,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: tempFeedStockUnit === 'g' ? colors.primary + '20' : 'transparent',
                                    }}
                                >
                                    <Text style={[textStyles.body, { fontSize: 12, color: tempFeedStockUnit === 'g' ? colors.primary : colors.textGrey, fontFamily: tempFeedStockUnit === 'g' ? 'Poppins-SemiBold' : 'Poppins-Regular' }]}>
                                        g
                                    </Text>
                                </TouchableOpacity>
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
                                        const current = parseFloat(tempFeedStock || '0');
                                        const step = tempFeedStockUnit === 'g' ? 100 : 1;
                                        const nextVal = isNaN(current) ? step : Math.max(step, current + step);
                                        const next = Math.round(nextVal * 100) / 100;
                                        setTempFeedStock(String(next));
                                        validateStock(String(next));
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
                                        const current = parseFloat(tempFeedStock || '0');
                                        const step = tempFeedStockUnit === 'g' ? 100 : 1;
                                        const nextVal = isNaN(current) ? step : Math.max(step, current - step);
                                        const next = Math.round(nextVal * 100) / 100;
                                        setTempFeedStock(String(next));
                                        validateStock(String(next));
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
                                onPress={() => { setEditModalVisible(false); setFeedTypeModalVisible(true); }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <AnimalIcon type={tempFeedType === 'Pigs' ? 'pig' : 'chicken'} size={20} color={colors.icon} style={{ marginRight: 12 }} />
                                    <Text style={[textStyles.body, { color: colors.text }]}>{tempFeedType}</Text>
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
                    </View>
                </View>
            </Modal>

            <SelectionModal
                visible={feedTypeModalVisible}
                onClose={() => { setFeedTypeModalVisible(false); setEditModalVisible(true); }}
                onSelect={val => { setTempFeedType(val as 'Pigs' | 'Chickens'); setFeedTypeModalVisible(false); setEditModalVisible(true); }}
                title="Animal Type"
                description="Select the type of animal for this feed."
                icon={tempFeedType === 'Pigs' ? 'pig' : 'chicken'}
                isCustomIcon
                options={['Pigs', 'Chickens']}
                selectedValue={tempFeedType}
                requireConfirm={false}
                enableSearch={false}
            />

            <ActionModal
                visible={confirmModalVisible}
                type={confirmModalType}
                title={confirmModalTitle}
                message={confirmModalMessage}
                confirmText={isSaving ? 'Processing...' : confirmAction === 'delete' ? 'Delete' : 'Confirm'}
                cancelText="Cancel"
                onConfirm={executeAction}
                onCancel={() => {
                    setConfirmModalVisible(false);
                    // Re-open the edit modal if we cancelled a save action
                    if (confirmAction === 'save') setEditModalVisible(true);
                }}
            />

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </SafeAreaView>
    );
}

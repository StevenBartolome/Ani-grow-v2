import { MaterialIcons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
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
import { CalendarPickerModal } from '@/components/CalendarPickerModal';
import { AnimalIcon } from '@/components/AnimalIcon';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { COMMON_FEEDS, COMMON_CATEGORIES } from '@/constants/commonFeeds';

interface FeedItem {
    id: string;
    name: string;
    brand: string;
    category: string;
    animal_type: 'chicken' | 'pig';
    stock_kg: number;
    supplier: string;
    date_started: string | null;
    expiry_date: string | null;
}

const DATE_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(s: string): boolean {
    if (!DATE_FORMAT_RE.test(s)) return false;
    const d = new Date(s + 'T00:00:00');
    return !isNaN(d.getTime());
}

function todayDateString(): string {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function daysUntil(dateStr: string): number {
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date(todayDateString() + 'T00:00:00');
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type FilterType = 'All' | 'Chickens' | 'Pigs';

const ANIMAL_TYPE_LABEL: Record<string, string> = { chicken: 'Chickens', pig: 'Pigs' };
const LABEL_TO_DB: Record<string, string>        = { Chickens: 'chicken', Pigs: 'pig' };

const getCategoryKeyword = (cat: string): string => {
    const c = cat.toLowerCase();
    if (c.includes('pre-starter')) return 'pre-starter';
    if (c.includes('booster')) return 'booster';
    if (c.includes('starter')) return 'starter';
    if (c.includes('piglet')) return 'piglet';
    if (c.includes('grower')) return 'grower';
    if (c.includes('finisher')) return 'finisher';
    if (c.includes('layer')) return 'layer';
    if (c.includes('breeder')) return 'breeder';
    if (c.includes('gestating')) return 'gestating';
    if (c.includes('lactating')) return 'lactating';
    if (c.includes('chick crate') || c.includes('chick')) return 'chick';
    return '';
};

const detectBrand = (feedName: string): string => {
    const fn = feedName.toLowerCase();
    const brands = [
        { key: 'b-meg integra', display: 'B-Meg Integra' },
        { key: 'b-meg', display: 'B-Meg' },
        { key: 'purina', display: 'Purina' },
        { key: 'pilmico gallimax', display: 'Pilmico Gallimax' },
        { key: 'pilmico', display: 'Pilmico' },
        { key: 'uno', display: 'Uno' },
        { key: 'hog-gold', display: 'Hog-Gold' },
        { key: 'cj', display: 'CJ' },
        { key: 'thunderbird', display: 'Thunderbird' },
        { key: 'integra', display: 'Integra' },
        { key: 'vitarich', display: 'Vitarich' },
        { key: 'robina', display: 'Robina' },
    ];
    for (const b of brands) {
        if (fn.includes(b.key)) {
            return b.display;
        }
    }
    return '';
};

export default function ManageFeedsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const deviceStyles = useDevicesStyles();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    const [searchQuery, setSearchQuery] = useState('');
    const [filterAnimal, setFilterAnimal] = useState<'all' | 'chicken' | 'pig'>('all');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'low_stock' | 'expiring' | 'expired'>('all');
    const [filtersCollapsed, setFiltersCollapsed] = useState(false);

    const [feeds, setFeeds] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ── Fetch ─────────────────────────────────────────────────────
    const fetchFeeds = useCallback(async () => {
        if (!farmId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('feeds')
                .select('id, name, brand, category, animal_type, stock_kg, supplier, date_started, expiry_date')
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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchFeeds();
        setRefreshing(false);
    }, [fetchFeeds]);

    const availableCategories = useMemo(() => {
        const cats = new Set<string>();
        feeds.forEach(f => {
            if (f.category && f.category.trim()) cats.add(f.category.trim());
        });
        return Array.from(cats).sort();
    }, [feeds]);

    const filteredFeeds = useMemo(() => {
        return feeds.filter(f => {
            // Animal filter
            if (filterAnimal !== 'all' && f.animal_type !== filterAnimal) {
                return false;
            }
            // Category filter
            if (filterCategory !== 'all' && f.category !== filterCategory) {
                return false;
            }
            // Status filter (low stock <= 10kg, expiring <= 7d, expired < 0d)
            if (filterStatus === 'low_stock') {
                if (f.stock_kg > 10) return false;
            } else if (filterStatus === 'expiring') {
                if (!f.expiry_date) return false;
                const d = daysUntil(f.expiry_date);
                if (d < 0 || d > 7) return false;
            } else if (filterStatus === 'expired') {
                if (!f.expiry_date || daysUntil(f.expiry_date) >= 0) return false;
            }
            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = f.name.toLowerCase().includes(q);
                const matchBrand = (f.brand ?? '').toLowerCase().includes(q);
                const matchCat = (f.category ?? '').toLowerCase().includes(q);
                const matchSupplier = (f.supplier ?? '').toLowerCase().includes(q);
                if (!matchName && !matchBrand && !matchCat && !matchSupplier) {
                    return false;
                }
            }
            return true;
        });
    }, [feeds, filterAnimal, filterCategory, filterStatus, searchQuery]);

    const isFiltered = filterAnimal !== 'all' || filterCategory !== 'all' || filterStatus !== 'all' || !!searchQuery.trim();

    const activeFilterSummary = useMemo(() => {
        const parts: string[] = [];
        if (filterAnimal !== 'all') {
            parts.push(filterAnimal === 'pig' ? 'Pigs' : 'Chickens');
        }
        if (filterCategory !== 'all') {
            parts.push(filterCategory);
        }
        if (filterStatus !== 'all') {
            parts.push(
                filterStatus === 'low_stock' ? 'Low Stock' :
                filterStatus === 'expiring' ? 'Expiring Soon' : 'Expired'
            );
        }
        if (searchQuery.trim()) {
            parts.push(`"${searchQuery.trim()}"`);
        }
        if (parts.length === 0) return 'All Feeds';
        return parts.join(' · ');
    }, [filterAnimal, filterCategory, filterStatus, searchQuery]);

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
    const [tempDateStarted, setTempDateStarted] = useState('');
    const [tempExpiryDate, setTempExpiryDate] = useState('');
    const [dateError, setDateError] = useState<string | null>(null);
    const [feedTypeModalVisible, setFeedTypeModalVisible] = useState(false);
    const [feedNameModalVisible, setFeedNameModalVisible] = useState(false);
    const [feedCategoryModalVisible, setFeedCategoryModalVisible] = useState(false);
    const [calendarModalVisible, setCalendarModalVisible] = useState(false);
    const [calendarField, setCalendarField] = useState<'started' | 'expiry' | null>(null);
    const [isCustomFeedName, setIsCustomFeedName] = useState(false);
    const [isCustomCategory, setIsCustomCategory] = useState(false);

    const openCalendarPicker = (field: 'started' | 'expiry') => {
        setCalendarField(field);
        setEditModalVisible(false);
        setCalendarModalVisible(true);
    };

    const closeCalendarPicker = () => {
        setCalendarModalVisible(false);
        setCalendarField(null);
        setEditModalVisible(true);
    };

    const handleDateSelect = (dateStr: string) => {
        if (calendarField === 'started') {
            setTempDateStarted(dateStr);
            validateDates(dateStr, tempExpiryDate);
        } else if (calendarField === 'expiry') {
            setTempExpiryDate(dateStr);
            validateDates(tempDateStarted, dateStr);
        }
        closeCalendarPicker();
    };

    const currentAnimalDb = LABEL_TO_DB[tempFeedType] as 'chicken' | 'pig';
    const categoryOptionsForType = COMMON_CATEGORIES.filter(opt => opt.animalType === currentAnimalDb).map(opt => opt.name);

    let feedOptionsForType = COMMON_FEEDS.filter(opt => opt.animalType === currentAnimalDb).map(opt => opt.name);
    const categoryKeyword = getCategoryKeyword(tempFeedCategory);
    if (categoryKeyword) {
        feedOptionsForType = feedOptionsForType.filter(feedName => {
            const fn = feedName.toLowerCase();
            if (categoryKeyword === 'starter') {
                return fn.includes('starter') && !fn.includes('pre-starter');
            }
            return fn.includes(categoryKeyword);
        });
    }

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
        setTempDateStarted('');
        setTempExpiryDate('');
        setDateError(null);
        setIsCustomFeedName(false);
        setIsCustomCategory(false);
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
            
            const animalTypeDb = f.animal_type;
            setTempFeedType(ANIMAL_TYPE_LABEL[animalTypeDb] as 'Pigs' | 'Chickens');

            // Determine if feed name is custom
            const feedOptions = COMMON_FEEDS.filter(opt => opt.animalType === animalTypeDb).map(opt => opt.name);
            const isCustomName = !feedOptions.includes(f.name);
            setIsCustomFeedName(isCustomName);

            // Determine if category is custom
            const categoryOptions = COMMON_CATEGORIES.filter(opt => opt.animalType === animalTypeDb).map(opt => opt.name);
            const isCustomCat = f.category ? !categoryOptions.includes(f.category) : false;
            setIsCustomCategory(isCustomCat);

            if (f.stock_kg < 1 && f.stock_kg > 0) {
                setTempFeedStock(String(f.stock_kg * 1000));
                setTempFeedStockUnit('g');
            } else {
                setTempFeedStock(String(f.stock_kg ?? 0));
                setTempFeedStockUnit('kg');
            }
            setTempFeedStockError(null);
            setTempDateStarted(f.date_started ?? '');
            setTempExpiryDate(f.expiry_date ?? '');
            setDateError(null);
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

    const validateStock = (val: string): boolean => {
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

    // Dates are completely optional. When provided, validate format and order.
    const validateDates = (started: string, expiry: string): boolean => {
        const s = started.trim();
        const e = expiry.trim();

        if (!s && !e) {
            setDateError(null);
            return true;
        }
        if (s && !isValidDateString(s)) {
            setDateError('Date Started must be in YYYY-MM-DD format.');
            return false;
        }
        if (e && !isValidDateString(e)) {
            setDateError('Expiry Date must be in YYYY-MM-DD format.');
            return false;
        }
        if (s && s > todayDateString()) {
            setDateError('Date Started cannot be in the future.');
            return false;
        }
        if (s && e && e <= s) {
            setDateError('Expiry Date must be after Date Started.');
            return false;
        }
        if (!editingFeedId && e && e <= todayDateString()) {
            setDateError('Expiry Date must be in the future for a newly added feed.');
            return false;
        }
        setDateError(null);
        return true;
    };

    const isSaveDisabled = !!(
        !tempFeedName.trim() ||
        !tempFeedStock.trim() ||
        !!tempFeedStockError ||
        isNaN(parseFloat(tempFeedStock)) ||
        parseFloat(tempFeedStock) <= 0 ||
        !!dateError
    );

    const handleSaveClick = () => {
        if (isSaveDisabled) return;
        if (!tempFeedName.trim()) { showSnackbar('Please enter a feed name.', 'error'); return; }
        const isValid = validateStock(tempFeedStock);
        if (!isValid) return;
        if (!validateDates(tempDateStarted, tempExpiryDate)) return;
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
                    name:         tempFeedName.trim(),
                    brand:        tempFeedBrand.trim() || null,
                    supplier:     tempFeedSupplier.trim() || null,
                    category:     tempFeedCategory.trim() || null,
                    animal_type:  LABEL_TO_DB[tempFeedType] as 'chicken' | 'pig',
                    stock_kg:     stockInKg,
                    date_started: tempDateStarted.trim() || null,
                    expiry_date:  tempExpiryDate.trim() || null,
                    updated_at:   new Date().toISOString(),
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

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: -8 }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Available Feeds</Text>
                            <TouchableOpacity onPress={openAddModal} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                                <Text style={[textStyles.label, { color: colors.primary }]}>Add New</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.sectionDescription}>Feed options registered for your farm's livestock.</Text>

                        {/* ── Search Bar ── */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            height: 44,
                            marginTop: 12,
                            marginBottom: 10,
                        }}>
                            <MaterialIcons name="search" size={20} color={colors.textGrey} style={{ marginRight: 8 }} />
                            <TextInput
                                style={{
                                    flex: 1,
                                    fontFamily: 'Poppins-Regular',
                                    fontSize: 13,
                                    color: colors.text,
                                    paddingVertical: 0,
                                }}
                                placeholder="Search feeds by name, brand, category..."
                                placeholderTextColor={colors.textGrey}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7} style={{ padding: 4 }}>
                                    <MaterialIcons name="close" size={16} color={colors.textGrey} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* ── Collapsible Filters Card (Pill Round Shaped) ── */}
                        <View style={{
                            marginBottom: 14,
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            overflow: 'hidden',
                        }}>
                            {/* Header Toggle */}
                            <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={() => setFiltersCollapsed(prev => !prev)}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 12,
                                    paddingVertical: 10,
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                                    <MaterialIcons name="tune" size={16} color={isFiltered ? colors.primary : colors.textGrey} />
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.text }}>
                                        Filters
                                    </Text>
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: isFiltered ? colors.primary + '18' : colors.cardFill,
                                        paddingHorizontal: 10,
                                        paddingVertical: 3,
                                        borderRadius: 999,
                                        flexShrink: 1,
                                    }}>
                                        <Text style={{ fontFamily: isFiltered ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11, color: isFiltered ? colors.primary : colors.textGrey }} numberOfLines={1}>
                                            {activeFilterSummary}
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    {isFiltered && (
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                setFilterAnimal('all');
                                                setFilterCategory('all');
                                                setFilterStatus('all');
                                                setSearchQuery('');
                                            }}
                                            style={{
                                                paddingHorizontal: 10,
                                                paddingVertical: 3,
                                                borderRadius: 999,
                                                backgroundColor: colors.primary + '12',
                                            }}
                                        >
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 11, color: colors.primary }}>
                                                Reset
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                    <MaterialIcons
                                        name={filtersCollapsed ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
                                        size={20}
                                        color={colors.textGrey}
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* Filter Body: Non-sliding, wrapping pill round shaped */}
                            {!filtersCollapsed && (
                                <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.stroke + '40', gap: 10 }}>
                                    {/* Animal Filter */}
                                    <View>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                            Animal Type
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            {(['all', 'chicken', 'pig'] as const).map(type => {
                                                const sel = filterAnimal === type;
                                                const c = type === 'pig' ? colors.pig : type === 'chicken' ? colors.chicken : colors.primary;
                                                return (
                                                    <TouchableOpacity
                                                        key={type}
                                                        activeOpacity={0.75}
                                                        onPress={() => setFilterAnimal(type)}
                                                        style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 5,
                                                            paddingHorizontal: 14,
                                                            paddingVertical: 6,
                                                            borderRadius: 999,
                                                            borderWidth: 1.5,
                                                            borderColor: sel ? (type === 'all' ? colors.primary : c) : colors.stroke,
                                                            backgroundColor: sel ? (type === 'all' ? colors.primary + '18' : c + '18') : colors.surface,
                                                        }}
                                                    >
                                                        {type !== 'all' && <AnimalIcon type={type} size={12} color={sel ? c : colors.textGrey} />}
                                                        <Text style={{
                                                            fontFamily: sel ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                            fontSize: 11.5,
                                                            color: sel ? (type === 'all' ? colors.primary : c) : colors.textGrey,
                                                        }}>
                                                            {type === 'all' ? 'All Animals' : type === 'pig' ? 'Pigs' : 'Chickens'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Category Filter */}
                                    {availableCategories.length > 0 && (
                                        <View>
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                                Feed Category
                                            </Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                {['all', ...availableCategories].map(cat => {
                                                    const sel = filterCategory === cat;
                                                    return (
                                                        <TouchableOpacity
                                                            key={cat}
                                                            activeOpacity={0.75}
                                                            onPress={() => setFilterCategory(cat)}
                                                            style={{
                                                                paddingHorizontal: 14,
                                                                paddingVertical: 6,
                                                                borderRadius: 999,
                                                                borderWidth: 1.5,
                                                                borderColor: sel ? colors.primary : colors.stroke,
                                                                backgroundColor: sel ? colors.primary + '18' : colors.surface,
                                                            }}
                                                        >
                                                            <Text style={{
                                                                fontFamily: sel ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                                fontSize: 11.5,
                                                                color: sel ? colors.primary : colors.textGrey,
                                                            }}>
                                                                {cat === 'all' ? 'All Categories' : cat}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}

                                    {/* Status Filter */}
                                    <View>
                                        <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                            Stock & Expiry Status
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            {[
                                                { key: 'all', label: 'All Statuses', icon: 'grain', color: colors.primary },
                                                { key: 'low_stock', label: 'Low Stock (≤10kg)', icon: 'inventory', color: colors.warning },
                                                { key: 'expiring', label: 'Expiring Soon (≤7d)', icon: 'event-busy', color: colors.warning },
                                                { key: 'expired', label: 'Expired', icon: 'cancel', color: colors.error },
                                            ].map(item => {
                                                const sel = filterStatus === item.key;
                                                return (
                                                    <TouchableOpacity
                                                        key={item.key}
                                                        activeOpacity={0.75}
                                                        onPress={() => setFilterStatus(item.key as any)}
                                                        style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 5,
                                                            paddingHorizontal: 14,
                                                            paddingVertical: 6,
                                                            borderRadius: 999,
                                                            borderWidth: 1.5,
                                                            borderColor: sel ? item.color : colors.stroke,
                                                            backgroundColor: sel ? item.color + '18' : colors.surface,
                                                        }}
                                                    >
                                                        <MaterialIcons name={item.icon as any} size={13} color={sel ? item.color : colors.textGrey} />
                                                        <Text style={{
                                                            fontFamily: sel ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                            fontSize: 11.5,
                                                            color: sel ? item.color : colors.textGrey,
                                                        }}>
                                                            {item.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* ── Feeds Card List ── */}
                        <View style={[styles.card, { paddingVertical: 4, borderRadius: 16 }]}>
                            {isLoading ? (
                                <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 32 }} />
                            ) : filteredFeeds.length === 0 ? (
                                <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                        <MaterialIcons name="grain" size={28} color={colors.textGrey} />
                                    </View>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>
                                        {isFiltered ? 'No Matching Feeds' : 'No Feeds Yet'}
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: 4, textAlign: 'center', marginBottom: isFiltered ? 14 : 0 }]}>
                                        {isFiltered ? 'Try clearing your search or filter options.' : 'Tap "Add New" to register your first feed option.'}
                                    </Text>
                                    {isFiltered && (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setFilterAnimal('all');
                                                setFilterCategory('all');
                                                setFilterStatus('all');
                                                setSearchQuery('');
                                            }}
                                            activeOpacity={0.75}
                                            style={{
                                                paddingHorizontal: 16,
                                                paddingVertical: 7,
                                                borderRadius: 999,
                                                backgroundColor: colors.primary,
                                            }}
                                        >
                                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 12, color: colors.onPrimary }}>
                                                Clear Filters
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                filteredFeeds.map((feed, index) => {
                                    const isPig = feed.animal_type === 'pig';
                                    const animalColor = isPig ? colors.pig : colors.chicken;
                                    const isExpired = feed.expiry_date ? daysUntil(feed.expiry_date) < 0 : false;
                                    const isExpiring = feed.expiry_date ? (daysUntil(feed.expiry_date) >= 0 && daysUntil(feed.expiry_date) <= 7) : false;
                                    const isLowStock = feed.stock_kg > 0 && feed.stock_kg <= 10;
                                    const isOutOfStock = feed.stock_kg <= 0;

                                    return (
                                        <View key={feed.id} style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            paddingVertical: 12,
                                            paddingHorizontal: 14,
                                            borderBottomWidth: index < filteredFeeds.length - 1 ? 1 : 0,
                                            borderBottomColor: colors.stroke + '60',
                                            gap: 10,
                                        }}>
                                            {/* Left Icon (Animal colored circle) */}
                                            <View style={{
                                                width: 38,
                                                height: 38,
                                                borderRadius: 19,
                                                backgroundColor: animalColor + '16',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                <AnimalIcon type={feed.animal_type} size={18} color={animalColor} />
                                            </View>

                                            {/* Middle Content */}
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                {/* Top Row: Name + Badges */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]} numberOfLines={1}>
                                                        {feed.name}
                                                    </Text>

                                                    {/* Animal Pill */}
                                                    <View style={{
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 1.5,
                                                        borderRadius: 999,
                                                        backgroundColor: animalColor + '14',
                                                    }}>
                                                        <Text style={{ fontFamily: 'Poppins-Medium', color: animalColor, fontSize: 9.5 }}>
                                                            {ANIMAL_TYPE_LABEL[feed.animal_type]}
                                                        </Text>
                                                    </View>

                                                    {/* Expiry Pill */}
                                                    {isExpired && (
                                                        <View style={{ backgroundColor: colors.error + '18', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999 }}>
                                                            <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.error, fontSize: 9.5 }}>EXPIRED</Text>
                                                        </View>
                                                    )}
                                                    {isExpiring && (
                                                        <View style={{ backgroundColor: colors.warning + '18', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999 }}>
                                                            <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.warning, fontSize: 9.5 }}>
                                                                {daysUntil(feed.expiry_date!) === 0 ? 'EXPIRES TODAY' : `${daysUntil(feed.expiry_date!)}D LEFT`}
                                                            </Text>
                                                        </View>
                                                    )}

                                                    {/* Stock Pill Warning */}
                                                    {isOutOfStock && (
                                                        <View style={{ backgroundColor: colors.error + '18', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999 }}>
                                                            <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.error, fontSize: 9.5 }}>OUT OF STOCK</Text>
                                                        </View>
                                                    )}
                                                    {isLowStock && (
                                                        <View style={{ backgroundColor: colors.warning + '18', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999 }}>
                                                            <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.warning, fontSize: 9.5 }}>LOW STOCK</Text>
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Details Row: Category · Brand · Stock */}
                                                <Text style={{ fontFamily: 'Poppins-Regular', color: colors.textGrey, fontSize: 11.5 }} numberOfLines={1}>
                                                    {feed.category ? feed.category : 'General Feed'}
                                                    {feed.brand ? ` · ${feed.brand}` : ''}
                                                    {` · Stock: `}
                                                    <Text style={{ fontFamily: 'Poppins-SemiBold', color: isOutOfStock ? colors.error : isLowStock ? colors.warning : colors.text }}>
                                                        {feed.stock_kg < 1 ? `${feed.stock_kg * 1000} g` : `${feed.stock_kg} kg`}
                                                    </Text>
                                                </Text>
                                            </View>

                                            {/* Right Action Icons */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                                <TouchableOpacity onPress={() => openEditModal(feed.id)} activeOpacity={0.7} style={{ padding: 4 }}>
                                                    <MaterialIcons name="edit" size={20} color={colors.textGrey} />
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => confirmDelete(feed.id)} activeOpacity={0.7} style={{ padding: 4 }}>
                                                    <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    </View>
                </ScrollView>
            </View>

            {/* Add / Edit Modal */}
            <Modal
                visible={editModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    Keyboard.dismiss();
                    setEditModalVisible(false);
                }}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => Keyboard.dismiss()}
                        style={{
                            flex: 1,
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: 20,
                        }}
                    >
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => {}}
                            style={{
                                backgroundColor: colors.surface,
                                width: '100%',
                                maxWidth: 360,
                                maxHeight: '90%',
                                padding: 24,
                                borderRadius: 24,
                                alignItems: 'center',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                        >
                            {/* Close icon button */}
                            <TouchableOpacity
                                style={{ position: 'absolute', top: 16, right: 16, padding: 6, zIndex: 10 }}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setEditModalVisible(false);
                                }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="close" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            <View style={{ backgroundColor: colors.primary + '1A', padding: 14, borderRadius: 22, marginBottom: 12 }}>
                                <MaterialIcons name={editingFeedId ? 'edit' : 'grain'} size={30} color={colors.primary} />
                            </View>
                            <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 6, fontSize: 20 }]}>
                                {editingFeedId ? 'Edit Feed' : 'Add Feed'}
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 16 }]}>
                                Enter the details for this feed option.
                            </Text>

                            <ScrollView 
                                style={{ width: '100%', flexShrink: 1, maxHeight: 380, marginBottom: 16 }}
                                contentContainerStyle={{ paddingHorizontal: 2, paddingTop: 10, paddingBottom: 6 }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                            {/* Animal Type Selector (At Top) */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => {
                                    setEditModalVisible(false);
                                    setFeedTypeModalVisible(true);
                                }}
                                style={{ marginBottom: 20, width: '100%' }}
                            >
                                <View style={{
                                    position: 'absolute',
                                    left: 48,
                                    paddingHorizontal: 4,
                                    zIndex: 10,
                                    backgroundColor: colors.surface,
                                    top: -10,
                                }}>
                                    <Text style={[textStyles.body, {
                                        color: colors.textGrey,
                                        fontSize: 12,
                                        fontFamily: 'Poppins-Medium',
                                    }]}>
                                        Animal Type *
                                    </Text>
                                </View>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderWidth: 1.5,
                                    height: 58,
                                    paddingHorizontal: 16,
                                    borderColor: colors.stroke,
                                    borderRadius: 9999,
                                    backgroundColor: colors.surface,
                                }}>
                                    <AnimalIcon
                                        type={tempFeedType === 'Pigs' ? 'pig' : 'chicken'}
                                        size={20}
                                        color={tempFeedType === 'Pigs' ? colors.pig : colors.chicken}
                                        style={{ width: 24, alignItems: 'center' }}
                                    />
                                    <Text style={[textStyles.body, { flex: 1, marginLeft: 12, color: colors.text }]}>
                                        {tempFeedType}
                                    </Text>
                                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>

                            {/* Category Selector */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => {
                                    setEditModalVisible(false);
                                    setFeedCategoryModalVisible(true);
                                }}
                                style={{ marginBottom: 20, width: '100%' }}
                            >
                                <View style={{
                                    position: 'absolute',
                                    left: 48,
                                    paddingHorizontal: 4,
                                    zIndex: 10,
                                    backgroundColor: colors.surface,
                                    top: -10,
                                }}>
                                    <Text style={[textStyles.body, {
                                        color: colors.textGrey,
                                        fontSize: 12,
                                        fontFamily: 'Poppins-Medium',
                                    }]}>
                                        Category
                                    </Text>
                                </View>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderWidth: 1.5,
                                    height: 58,
                                    paddingHorizontal: 16,
                                    borderColor: colors.stroke,
                                    borderRadius: 9999,
                                    backgroundColor: colors.surface,
                                }}>
                                    <MaterialIcons
                                        name="category"
                                        size={20}
                                        color={colors.icon}
                                        style={{ width: 24, textAlign: 'center' }}
                                    />
                                    <Text style={[textStyles.body, { flex: 1, marginLeft: 12, color: tempFeedCategory ? colors.text : colors.textLight }]} numberOfLines={1}>
                                        {isCustomCategory ? (tempFeedCategory ? `${tempFeedCategory} (Custom)` : 'Custom Category') : (tempFeedCategory || 'Select Category')}
                                    </Text>
                                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>


                            {/* Feed Name Selector */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => {
                                    setEditModalVisible(false);
                                    setFeedNameModalVisible(true);
                                }}
                                style={{ marginBottom: 20, width: '100%' }}
                            >
                                <View style={{
                                    position: 'absolute',
                                    left: 48,
                                    paddingHorizontal: 4,
                                    zIndex: 10,
                                    backgroundColor: colors.surface,
                                    top: -10,
                                }}>
                                    <Text style={[textStyles.body, {
                                        color: colors.textGrey,
                                        fontSize: 12,
                                        fontFamily: 'Poppins-Medium',
                                    }]}>
                                        Feed Name *
                                    </Text>
                                </View>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderWidth: 1.5,
                                    height: 58,
                                    paddingHorizontal: 16,
                                    borderColor: colors.stroke,
                                    borderRadius: 9999,
                                    backgroundColor: colors.surface,
                                }}>
                                    <MaterialIcons
                                        name="grain"
                                        size={20}
                                        color={colors.icon}
                                        style={{ width: 24, textAlign: 'center' }}
                                    />
                                    <Text style={[textStyles.body, { flex: 1, marginLeft: 12, color: tempFeedName ? colors.text : colors.textLight }]} numberOfLines={1}>
                                        {isCustomFeedName ? (tempFeedName ? `${tempFeedName} (Custom)` : 'Custom Feed Name') : (tempFeedName || 'Select Feed Name')}
                                    </Text>
                                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>


                            <View style={{ width: '100%' }}>
                                <FloatingLabelInput label="Brand" icon="business" value={tempFeedBrand} onChangeText={setTempFeedBrand} backgroundColor={colors.surface} />
                            </View>

                            <View style={{ width: '100%' }}>
                                <FloatingLabelInput label="Supplier / Shop (optional)" icon="store" value={tempFeedSupplier} onChangeText={setTempFeedSupplier} backgroundColor={colors.surface} />
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

                            {/* Date Started Field (Calendar Picker) */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => openCalendarPicker('started')}
                                style={{ marginBottom: 20, width: '100%' }}
                            >
                                <View style={{
                                    position: 'absolute',
                                    left: 48,
                                    paddingHorizontal: 4,
                                    zIndex: 10,
                                    backgroundColor: colors.surface,
                                    top: -10,
                                }}>
                                    <Text style={[textStyles.body, {
                                        color: colors.textGrey,
                                        fontSize: 12,
                                        fontFamily: 'Poppins-Medium',
                                    }]}>
                                        Date Started
                                    </Text>
                                </View>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderWidth: 1.5,
                                    height: 58,
                                    paddingHorizontal: 16,
                                    borderColor: colors.stroke,
                                    borderRadius: 9999,
                                    backgroundColor: colors.surface,
                                }}>
                                    <MaterialIcons
                                        name="event"
                                        size={20}
                                        color={tempDateStarted ? colors.primary : colors.icon}
                                        style={{ width: 24, textAlign: 'center' }}
                                    />
                                    <Text style={[textStyles.body, { flex: 1, marginLeft: 12, color: tempDateStarted ? colors.text : colors.textLight }]} numberOfLines={1}>
                                        {tempDateStarted ? new Date(tempDateStarted + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date'}
                                    </Text>
                                    {tempDateStarted ? (
                                        <TouchableOpacity
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                setTempDateStarted('');
                                                validateDates('', tempExpiryDate);
                                            }}
                                            style={{ padding: 4 }}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <MaterialIcons name="close" size={18} color={colors.textGrey} />
                                        </TouchableOpacity>
                                    ) : (
                                        <MaterialIcons name="calendar-today" size={18} color={colors.textGrey} />
                                    )}
                                </View>
                            </TouchableOpacity>

                            {/* Expiry Date Field (Calendar Picker) */}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => openCalendarPicker('expiry')}
                                style={{ marginBottom: 20, width: '100%' }}
                            >
                                <View style={{
                                    position: 'absolute',
                                    left: 48,
                                    paddingHorizontal: 4,
                                    zIndex: 10,
                                    backgroundColor: colors.surface,
                                    top: -10,
                                }}>
                                    <Text style={[textStyles.body, {
                                        color: colors.textGrey,
                                        fontSize: 12,
                                        fontFamily: 'Poppins-Medium',
                                    }]}>
                                        Expiry Date
                                    </Text>
                                </View>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    borderWidth: 1.5,
                                    height: 58,
                                    paddingHorizontal: 16,
                                    borderColor: colors.stroke,
                                    borderRadius: 9999,
                                    backgroundColor: colors.surface,
                                }}>
                                    <MaterialIcons
                                        name="event-busy"
                                        size={20}
                                        color={tempExpiryDate ? colors.primary : colors.icon}
                                        style={{ width: 24, textAlign: 'center' }}
                                    />
                                    <Text style={[textStyles.body, { flex: 1, marginLeft: 12, color: tempExpiryDate ? colors.text : colors.textLight }]} numberOfLines={1}>
                                        {tempExpiryDate ? new Date(tempExpiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date'}
                                    </Text>
                                    {tempExpiryDate ? (
                                        <TouchableOpacity
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                setTempExpiryDate('');
                                                validateDates(tempDateStarted, '');
                                            }}
                                            style={{ padding: 4 }}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <MaterialIcons name="close" size={18} color={colors.textGrey} />
                                        </TouchableOpacity>
                                    ) : (
                                        <MaterialIcons name="calendar-today" size={18} color={colors.textGrey} />
                                    )}
                                </View>
                            </TouchableOpacity>
                            {dateError && (
                                <Text style={[textStyles.body, { color: colors.error, fontSize: 12, marginTop: -8, marginBottom: 12 }]}>
                                    {dateError}
                                </Text>
                            )}
                        </ScrollView>

                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setEditModalVisible(false);
                                }}
                                activeOpacity={0.7}
                            >
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
                                onPress={() => {
                                    Keyboard.dismiss();
                                    handleSaveClick();
                                }}
                                disabled={isSaveDisabled}
                                activeOpacity={isSaveDisabled ? 1 : 0.7}
                            >
                                <Text style={[textStyles.h3, { color: isSaveDisabled ? colors.textGrey : colors.onPrimary, fontSize: 14 }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </Modal>

            <SelectionModal
                visible={feedTypeModalVisible}
                onClose={() => { setFeedTypeModalVisible(false); setEditModalVisible(true); }}
                onSelect={val => {
                    const nextType = val as 'Pigs' | 'Chickens';
                    if (nextType !== tempFeedType) {
                        setTempFeedType(nextType);
                        const nextAnimalTypeDb = nextType === 'Pigs' ? 'pig' : 'chicken';
                        const nextFeedOptions = COMMON_FEEDS.filter(opt => opt.animalType === nextAnimalTypeDb).map(opt => opt.name);
                        const nextCategoryOptions = COMMON_CATEGORIES.filter(opt => opt.animalType === nextAnimalTypeDb).map(opt => opt.name);
                        
                        if (!isCustomFeedName && !nextFeedOptions.includes(tempFeedName)) {
                            setTempFeedName('');
                        }
                        if (!isCustomCategory && tempFeedCategory && !nextCategoryOptions.includes(tempFeedCategory)) {
                            setTempFeedCategory('');
                        }
                    }
                    setFeedTypeModalVisible(false);
                    setEditModalVisible(true);
                }}
                title="Animal Type"
                description="Select the type of animal for this feed."
                icon={tempFeedType === 'Pigs' ? 'pig' : 'chicken'}
                isCustomIcon
                options={['Pigs', 'Chickens']}
                selectedValue={tempFeedType}
                requireConfirm={false}
                enableSearch={false}
            />

            <SelectionModal
                visible={feedNameModalVisible}
                onClose={() => { setEditModalVisible(true); setFeedNameModalVisible(false); }}
                onSelect={val => {
                    const isPredefined = feedOptionsForType.includes(val);
                    setIsCustomFeedName(!isPredefined);
                    setTempFeedName(val);
                    // Auto-fill brand based on selection
                    const brand = detectBrand(val);
                    if (brand) {
                        setTempFeedBrand(brand);
                    }
                    setEditModalVisible(true);
                    setFeedNameModalVisible(false);
                }}
                title="Feed Name"
                description="Select a common feed in the Philippines."
                icon="restaurant-menu"
                options={feedOptionsForType}
                selectedValue={tempFeedName}
                requireConfirm={true}
                enableSearch={true}
                enableSeeMore={true}
                enableOther={true}
            />

            <SelectionModal
                visible={feedCategoryModalVisible}
                onClose={() => { setEditModalVisible(true); setFeedCategoryModalVisible(false); }}
                onSelect={val => {
                    const isPredefined = categoryOptionsForType.includes(val);
                    setIsCustomCategory(!isPredefined);
                    const prevCategory = tempFeedCategory;
                    setTempFeedCategory(val);

                    // Clear selected feed name if it does not match the new category (unless custom)
                    if (val !== prevCategory && !isCustomFeedName && tempFeedName) {
                        const newCategoryKeyword = getCategoryKeyword(val);
                        const fn = tempFeedName.toLowerCase();
                        const matches = newCategoryKeyword === 'starter'
                            ? (fn.includes('starter') && !fn.includes('pre-starter'))
                            : fn.includes(newCategoryKeyword);
                        if (newCategoryKeyword && !matches) {
                            setTempFeedName('');
                        }
                    }
                    setEditModalVisible(true);
                    setFeedCategoryModalVisible(false);
                }}
                title="Feed Category"
                description="Select a feed category."
                icon="category"
                options={categoryOptionsForType}
                selectedValue={tempFeedCategory}
                requireConfirm={true}
                enableSearch={true}
                enableSeeMore={true}
                enableOther={true}
            />

            <CalendarPickerModal
                visible={calendarModalVisible}
                onClose={closeCalendarPicker}
                onSelect={handleDateSelect}
                title={calendarField === 'started' ? 'Select Date Started' : 'Select Expiry Date'}
                selectedDate={calendarField === 'started' ? (tempDateStarted || undefined) : (tempExpiryDate || undefined)}
                minDate={calendarField === 'expiry' ? (tempDateStarted || undefined) : undefined}
                maxDate={calendarField === 'started' ? todayDateString() : undefined}
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

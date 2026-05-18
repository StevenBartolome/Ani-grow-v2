/**
 * FarmsScreen
 *
 * Lets a Farm Admin:
 *  • See all farms they manage
 *  • Tap a farm → switches the dashboard to show that farm only
 *  • Add a new farm (name + address)
 *
 * Accessible from Settings → Farm Administration → My Farms
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter, ManagedFarm } from '@/context/FarmFilterContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';

// ─── Farm color palette ───────────────────────────────────────────────────────
const FARM_COLORS = ['#10B981', '#6C63FF', '#F97316', '#EF4444', '#3B82F6', '#F59E0B'];
const farmColor = (i: number) => FARM_COLORS[i % FARM_COLORS.length];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FarmsScreen() {
    const { profile } = useAuth();
    const userId = (profile as any)?.uid || (profile as any)?.id || '';
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useSettingsSubPageStyles();
    const router = useRouter();

    const {
        managedFarms,
        selectedFarmIds,
        switchToFarm,
        addManagedFarm,
        isLoaded,
    } = useFarmFilter();

    // ── Add-farm modal state ──────────────────────────────────────────────────
    const [addModalOpen, setAddModalOpen]   = useState(false);
    const [newFarmName, setNewFarmName]     = useState('');
    const [saving, setSaving]               = useState(false);

    // ── PSGC location state ───────────────────────────────────────────────────
    interface PsgcItem { code: string; name: string; }
    const [provinces, setProvinces]                   = useState<PsgcItem[]>([]);
    const [cities, setCities]                         = useState<PsgcItem[]>([]);
    const [selectedProvince, setSelectedProvince]     = useState<PsgcItem | null>(null);
    const [selectedCity, setSelectedCity]             = useState<PsgcItem | null>(null);
    const [loadingProvinces, setLoadingProvinces]     = useState(false);
    const [loadingCities, setLoadingCities]           = useState(false);
    // Location picker sheet
    const [pickerOpen, setPickerOpen]   = useState(false);
    const [pickerMode, setPickerMode]   = useState<'province' | 'city'>('province');
    const [pickerSearch, setPickerSearch] = useState('');

    // Load provinces once when modal opens
    useEffect(() => {
        if (!addModalOpen || provinces.length > 0) return;
        setLoadingProvinces(true);
        fetch('https://psgc.gitlab.io/api/provinces.json')
            .then(r => r.json())
            .then((data: PsgcItem[]) => setProvinces([...data].sort((a, b) => a.name.localeCompare(b.name))))
            .catch(() => showSnackbar('Could not load provinces.', 'error'))
            .finally(() => setLoadingProvinces(false));
    }, [addModalOpen]);

    // Load cities when province changes
    useEffect(() => {
        if (!selectedProvince) { setCities([]); setSelectedCity(null); return; }
        setLoadingCities(true);
        setSelectedCity(null);
        fetch(`https://psgc.gitlab.io/api/provinces/${selectedProvince.code}/cities-municipalities.json`)
            .then(r => r.json())
            .then((data: PsgcItem[]) => setCities([...data].sort((a, b) => a.name.localeCompare(b.name))))
            .catch(() => showSnackbar('Could not load cities.', 'error'))
            .finally(() => setLoadingCities(false));
    }, [selectedProvince]);

    const composedLocation = selectedCity && selectedProvince
        ? `${selectedCity.name}, ${selectedProvince.name}`
        : selectedProvince ? selectedProvince.name : '';

    const resetLocation = () => { setSelectedProvince(null); setSelectedCity(null); setCities([]); };

    const openPicker = (mode: 'province' | 'city') => {
        setPickerMode(mode);
        setPickerSearch('');
        setPickerOpen(true);
    };

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType]       = useState<SnackbarType>('success');

    const showSnackbar = (msg: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(msg);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // ── Create new farm ───────────────────────────────────────────────────────
    const handleAddFarm = async () => {
        if (!newFarmName.trim()) {
            showSnackbar('Farm name is required.', 'error');
            return;
        }
        setSaving(true);
        try {
            // 1. Insert into farms table (admin_id kept in sync with web approach)
            const { data: farmData, error: farmErr } = await supabase
                .from('farms')
                .insert({
                    name:     newFarmName.trim(),
                    location: composedLocation || null,
                    address:  composedLocation || null,
                    admin_id: userId,
                })
                .select('id, name')
                .single();

            if (farmErr) throw farmErr;

            // 2. Link in farm_admin_farms (mobile source of truth)
            const { error: linkErr } = await supabase
                .from('farm_admin_farms')
                .upsert(
                    { admin_user_id: userId, farm_id: farmData.id },
                    { onConflict: 'admin_user_id,farm_id' }
                );

            if (linkErr) throw linkErr;

            // 3. Register in context so dashboard reacts immediately
            addManagedFarm({ id: farmData.id, name: farmData.name });

            setAddModalOpen(false);
            setNewFarmName('');
            resetLocation();
            showSnackbar(`"${farmData.name}" added successfully!`);
        } catch (err: any) {
            console.error('[FarmsScreen] addFarm error:', err);
            showSnackbar(err?.message || 'Failed to add farm.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Switch to farm and go back to dashboard ───────────────────────────────
    const handleSwitchFarm = (farm: ManagedFarm) => {
        switchToFarm(farm.id);
        router.replace('/(dashboard)/HomeScreen' as any);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

                {/* ── Header ──────────────────────────────────────────────── */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(settings)/SettingsScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        My Farms
                    </Text>
                    {/* Add farm button */}
                    <TouchableOpacity
                        style={{
                            width: 44, height: 44,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                        activeOpacity={0.7}
                        onPress={() => setAddModalOpen(true)}
                    >
                        <MaterialIcons name="add" size={26} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* ── Content ─────────────────────────────────────────────── */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}
                >
                    {/* Tip banner */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                        backgroundColor: colors.primary + '12',
                        borderRadius: 14, padding: 14, marginBottom: 20,
                        borderWidth: 1, borderColor: colors.primary + '30',
                    }}>
                        <MaterialIcons name="info-outline" size={16} color={colors.primary} style={{ marginTop: 1 }} />
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, flex: 1, lineHeight: 18 }]}>
                            Tap a farm to switch your dashboard to that farm. The farm shown first in the dashboard is your currently active one.
                        </Text>
                    </View>

                    {/* Loading */}
                    {!isLoaded ? (
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : managedFarms.length === 0 ? (
                        /* Empty state */
                        <View style={{
                            alignItems: 'center', justifyContent: 'center',
                            paddingVertical: 60, gap: 12,
                        }}>
                            <View style={{
                                width: 64, height: 64, borderRadius: 18,
                                backgroundColor: colors.primary + '15',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <MaterialIcons name="add-home-work" size={30} color={colors.primary} />
                            </View>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>
                                No Farms Yet
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                                Tap the + button above to add your first farm.
                            </Text>
                        </View>
                    ) : (
                        /* Farm list */
                        <View style={{ gap: 12 }}>
                            {managedFarms.map((farm, index) => {
                                const color     = farmColor(index);
                                const isActive  = selectedFarmIds.length === 1 && selectedFarmIds[0] === farm.id;
                                const isIncluded = selectedFarmIds.includes(farm.id);

                                return (
                                    <Pressable
                                        key={farm.id}
                                        onPress={() => handleSwitchFarm(farm)}
                                        style={({ pressed }) => ({
                                            backgroundColor: isActive ? color + '12' : colors.surface,
                                            borderWidth: 1.5,
                                            borderColor: isActive ? color + '50' : colors.stroke,
                                            borderRadius: 18,
                                            padding: 16,
                                            opacity: pressed ? 0.85 : 1,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 14,
                                        })}
                                    >
                                        {/* Farm initial avatar */}
                                        <View style={{
                                            width: 48, height: 48, borderRadius: 14,
                                            backgroundColor: color + '20',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Text style={[textStyles.h2, { color, fontSize: 20 }]}>
                                                {farm.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>

                                        {/* Info */}
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>
                                                    {farm.name}
                                                </Text>
                                                {isActive && (
                                                    <View style={{
                                                        backgroundColor: color + '20',
                                                        borderRadius: 6,
                                                        paddingHorizontal: 7, paddingVertical: 2,
                                                    }}>
                                                        <Text style={[textStyles.label, { color, fontSize: 10 }]}>
                                                            Active
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 3 }]}>
                                                ID: {farm.id.slice(0, 12)}…
                                            </Text>
                                            {!isIncluded && (
                                                <Text style={[textStyles.body, { color: colors.warning, fontSize: 11, marginTop: 2 }]}>
                                                    Hidden from dashboard filter
                                                </Text>
                                            )}
                                        </View>

                                        {/* Arrow */}
                                        <MaterialIcons
                                            name="chevron-right"
                                            size={22}
                                            color={isActive ? color : colors.textGrey}
                                        />
                                    </Pressable>
                                );
                            })}

                            {/* Add another farm CTA */}
                            <TouchableOpacity
                                onPress={() => setAddModalOpen(true)}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                    gap: 8, paddingVertical: 16,
                                    borderWidth: 1.5, borderColor: colors.stroke,
                                    borderRadius: 18, borderStyle: 'dashed',
                                    marginTop: 4,
                                }}
                            >
                                <MaterialIcons name="add" size={20} color={colors.primary} />
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 14 }]}>
                                    Add Another Farm
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* ── Add Farm Modal ───────────────────────────────────────────── */}
            <Modal visible={addModalOpen} transparent animationType="slide" onRequestClose={() => setAddModalOpen(false)}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <Pressable
                        style={{ flex: 1, backgroundColor: '#00000060' }}
                        onPress={() => { if (!saving) { setAddModalOpen(false); setNewFarmName(''); resetLocation(); } }}
                    />
                    <View style={{
                        backgroundColor: colors.surface,
                        borderTopLeftRadius: 28, borderTopRightRadius: 28,
                        padding: 28, paddingBottom: 48,
                        gap: 16,
                    }}>
                        {/* Handle */}
                        <View style={{
                            width: 36, height: 4, borderRadius: 2,
                            backgroundColor: colors.stroke, alignSelf: 'center',
                            marginBottom: 4,
                        }} />

                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                            Add New Farm
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginTop: -8 }]}>
                            This farm will be added to your admin account and appear on your dashboard.
                        </Text>

                        {/* Farm Name */}
                        <View>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>
                                Farm Name *
                            </Text>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 10,
                                backgroundColor: colors.cardFill,
                                borderWidth: 1.5, borderColor: colors.stroke,
                                borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
                            }}>
                                <MaterialIcons name="home-work" size={18} color={colors.textGrey} />
                                <TextInput
                                    value={newFarmName}
                                    onChangeText={setNewFarmName}
                                    placeholder="e.g. Farm A, North Branch..."
                                    placeholderTextColor={colors.textGrey}
                                    style={[textStyles.body, {
                                        flex: 1, color: colors.text, fontSize: 14,
                                        padding: 0,
                                    }]}
                                    editable={!saving}
                                    autoFocus
                                />
                            </View>
                        </View>

                        {/* Province picker */}
                        <View>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>
                                Province <Text style={{ fontFamily: 'Poppins-Regular' }}>(optional)</Text>
                            </Text>
                            <TouchableOpacity
                                onPress={() => !saving && openPicker('province')}
                                disabled={saving || loadingProvinces}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                    backgroundColor: colors.cardFill,
                                    borderWidth: 1.5, borderColor: colors.stroke,
                                    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <MaterialIcons name="location-on" size={18} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: selectedProvince ? colors.text : colors.textGrey, fontSize: 14 }]} numberOfLines={1}>
                                        {loadingProvinces ? 'Loading provinces...' : selectedProvince?.name || '— Select Province —'}
                                    </Text>
                                </View>
                                <MaterialIcons name={loadingProvinces ? 'sync' : 'expand-more'} size={20} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        {/* City / Municipality picker */}
                        <View>
                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>
                                City / Municipality <Text style={{ fontFamily: 'Poppins-Regular' }}>(optional)</Text>
                            </Text>
                            <TouchableOpacity
                                onPress={() => !saving && selectedProvince && openPicker('city')}
                                disabled={saving || !selectedProvince || loadingCities}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                    backgroundColor: colors.cardFill,
                                    borderWidth: 1.5, borderColor: colors.stroke,
                                    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
                                    opacity: !selectedProvince ? 0.5 : 1,
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <MaterialIcons name="location-city" size={18} color={colors.textGrey} />
                                    <Text style={[textStyles.body, { color: selectedCity ? colors.text : colors.textGrey, fontSize: 14 }]} numberOfLines={1}>
                                        {!selectedProvince ? '— Select a province first —'
                                            : loadingCities ? 'Loading cities...'
                                            : selectedCity?.name || '— Select City / Municipality —'}
                                    </Text>
                                </View>
                                <MaterialIcons name={loadingCities ? 'sync' : 'expand-more'} size={20} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        {/* Location preview */}
                        {composedLocation !== '' && (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                backgroundColor: colors.primary + '0D',
                                borderRadius: 10, padding: 10,
                                borderWidth: 1, borderColor: colors.primary + '25',
                            }}>
                                <MaterialIcons name="place" size={14} color={colors.primary} />
                                <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                    {composedLocation}
                                </Text>
                            </View>
                        )}

                        {/* Buttons */}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                            <TouchableOpacity
                                onPress={() => { setAddModalOpen(false); setNewFarmName(''); resetLocation(); }}
                                disabled={saving}
                                style={{
                                    flex: 1, paddingVertical: 14, borderRadius: 14,
                                    backgroundColor: colors.cardFill,
                                    borderWidth: 1, borderColor: colors.stroke,
                                    alignItems: 'center',
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 14 }]}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleAddFarm}
                                disabled={saving || !newFarmName.trim()}
                                style={{
                                    flex: 2, paddingVertical: 14, borderRadius: 14,
                                    backgroundColor: newFarmName.trim() ? colors.primary : colors.primary + '50',
                                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                                }}
                                activeOpacity={0.85}
                            >
                                {saving
                                    ? <ActivityIndicator size="small" color="#FFF" />
                                    : <>
                                        <MaterialIcons name="add-home-work" size={18} color="#FFF" />
                                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 14 }]}>
                                            Add Farm
                                        </Text>
                                      </>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Location Picker Sheet ────────────────────────────────────── */}
            <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: '#00000060' }} onPress={() => setPickerOpen(false)} />
                <View style={{
                    backgroundColor: colors.surface,
                    borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    height: '75%',
                    paddingTop: 16,
                }}>
                    {/* Handle */}
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginBottom: 12 }} />

                    {/* Title */}
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17, paddingHorizontal: 20, marginBottom: 12 }]}>
                        {pickerMode === 'province' ? 'Select Province' : 'Select City / Municipality'}
                    </Text>

                    {/* Search */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: colors.cardFill,
                        borderWidth: 1.5, borderColor: colors.stroke,
                        borderRadius: 14, marginHorizontal: 20, marginBottom: 8,
                        paddingHorizontal: 14, paddingVertical: 10,
                    }}>
                        <MaterialIcons name="search" size={18} color={colors.textGrey} />
                        <TextInput
                            value={pickerSearch}
                            onChangeText={setPickerSearch}
                            placeholder={`Search ${pickerMode === 'province' ? 'province' : 'city'}...`}
                            placeholderTextColor={colors.textGrey}
                            autoFocus
                            style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 14, padding: 0 }]}
                        />
                        {pickerSearch.length > 0 && (
                            <TouchableOpacity onPress={() => setPickerSearch('')} activeOpacity={0.7}>
                                <MaterialIcons name="close" size={16} color={colors.textGrey} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* List */}
                    <FlatList
                        data={(pickerMode === 'province' ? provinces : cities).filter(item =>
                            item.name.toLowerCase().includes(pickerSearch.toLowerCase())
                        )}
                        keyExtractor={item => item.code}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => {
                            const isSelected = pickerMode === 'province'
                                ? selectedProvince?.code === item.code
                                : selectedCity?.code === item.code;
                            return (
                                <TouchableOpacity
                                    onPress={() => {
                                        if (pickerMode === 'province') {
                                            setSelectedProvince(item);
                                        } else {
                                            setSelectedCity(item);
                                        }
                                        setPickerOpen(false);
                                    }}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                        paddingHorizontal: 20, paddingVertical: 14,
                                        backgroundColor: isSelected ? colors.primary + '0D' : 'transparent',
                                        borderBottomWidth: 1, borderBottomColor: colors.stroke + '50',
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[textStyles.body, { color: isSelected ? colors.primary : colors.text, fontSize: 14, fontFamily: isSelected ? 'Poppins-SemiBold' : 'Poppins-Regular' }]}>
                                        {item.name}
                                    </Text>
                                    {isSelected && <MaterialIcons name="check" size={18} color={colors.primary} />}
                                </TouchableOpacity>
                            );
                        }}
                        ListEmptyComponent={() => (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>No results found.</Text>
                            </View>
                        )}
                    />
                </View>
            </Modal>

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

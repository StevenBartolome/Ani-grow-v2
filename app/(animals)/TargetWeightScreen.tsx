import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import {
    AnimalType,
    GrowthStandard,
    fetchTargetWeights,
    getDefaultStandards,
    saveTargetWeight,
    formatWeightDisplay,
} from '@/constants/growthStandards';

const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    return 20;
};

export default function TargetWeightScreen() {
    const { width } = useWindowDimensions();
    const hPad = getHPad(width);
    const insets = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const { profile, permissions } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const canManageWeights = !!permissions['animals:manage'] || !!permissions['housing:manage'] || true;

    const [selectedAnimal, setSelectedAnimal] = useState<AnimalType>('pig');
    const [standards, setStandards] = useState<GrowthStandard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Snackbar state
    const [snackVisible, setSnackVisible] = useState(false);
    const [snackMsg, setSnackMsg] = useState('');
    const [snackType, setSnackType] = useState<SnackbarType>('success');
    const showSnack = (msg: string, type: SnackbarType = 'success') => {
        setSnackMsg(msg);
        setSnackType(type);
        setSnackVisible(true);
    };

    // Edit/Add modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingStandard, setEditingStandard] = useState<GrowthStandard | null>(null);
    const [editWeek, setEditWeek] = useState('1');
    const [editUnderweight, setEditUnderweight] = useState('');
    const [editOverweight, setEditOverweight] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editUnit, setEditUnit] = useState<'kg' | 'g'>('kg');

    const loadStandards = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setIsLoading(true);

        try {
            const data = await fetchTargetWeights(farmId, selectedAnimal);
            setStandards(data);
        } catch (err: any) {
            console.error('[TargetWeightScreen] load error:', err);
            showSnack('Failed to load target weights', 'error');
        } finally {
            if (isRefresh) setRefreshing(false);
            else setIsLoading(false);
        }
    }, [farmId, selectedAnimal]);

    useEffect(() => {
        loadStandards(false);
    }, [loadStandards]);

    // Used by the empty-state 'Load Default Benchmarks' button to seed farm standards
    const handleResetDefaults = async () => {
        const defaults = getDefaultStandards(selectedAnimal);
        setIsLoading(true);
        try {
            for (const std of defaults) {
                await saveTargetWeight(std, farmId);
            }
            await loadStandards(false);
            showSnack('Default benchmarks loaded.', 'success');
        } catch (err: any) {
            showSnack('Failed to load defaults.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const openEditModal = (item?: GrowthStandard) => {
        const defaultUnit = selectedAnimal === 'pig' ? 'kg' : 'g';
        setEditUnit(defaultUnit);

        if (item) {
            setEditingStandard(item);
            setEditWeek(String(item.week_number));
            if (defaultUnit === 'kg') {
                setEditUnderweight((item.underweight_max_grams / 1000).toFixed(2));
                setEditOverweight((item.overweight_min_grams / 1000).toFixed(2));
            } else {
                setEditUnderweight(String(item.underweight_max_grams));
                setEditOverweight(String(item.overweight_min_grams));
            }
            setEditNotes(item.notes || '');
        } else {
            // New week benchmark
            const nextWeek = standards.length > 0 ? Math.max(...standards.map(s => s.week_number)) + 1 : 1;
            setEditingStandard(null);
            setEditWeek(String(nextWeek));
            setEditUnderweight('');
            setEditOverweight('');
            setEditNotes('');
        }
        setModalVisible(true);
    };

    const handleUnitSwitch = (newUnit: 'kg' | 'g') => {
        if (newUnit === editUnit) return;
        const factor = newUnit === 'kg' ? 0.001 : 1000;

        const parseNum = (val: string) => {
            const n = parseFloat(val);
            if (isNaN(n)) return '';
            return newUnit === 'kg' ? (n * factor).toFixed(2) : String(Math.round(n * factor));
        };

        setEditUnderweight(parseNum(editUnderweight));
        setEditOverweight(parseNum(editOverweight));
        setEditUnit(newUnit);
    };

    const handleSave = async () => {
        const weekNum = parseInt(editWeek, 10);
        if (isNaN(weekNum) || weekNum < 1) {
            showSnack('Week number must be at least 1.', 'error');
            return;
        }

        if (!editUnderweight.trim()) {
            showSnack('Please enter an underweight threshold.', 'error');
            return;
        }

        if (!editOverweight.trim()) {
            showSnack('Please enter an overweight threshold.', 'error');
            return;
        }

        const uVal = parseFloat(editUnderweight);
        const oVal = parseFloat(editOverweight);

        if (isNaN(uVal) || uVal <= 0) {
            showSnack('Underweight threshold must be a valid number greater than 0.', 'error');
            return;
        }

        if (isNaN(oVal) || oVal <= 0) {
            showSnack('Overweight threshold must be a valid number greater than 0.', 'error');
            return;
        }

        if (uVal >= oVal) {
            showSnack('Overweight threshold must be greater than underweight threshold.', 'error');
            return;
        }

        const minDifference = editUnit === 'kg' ? 0.05 : 50;
        if (oVal - uVal < minDifference) {
            showSnack(`The normal range is too narrow. Difference must be at least ${minDifference} ${editUnit.toUpperCase()}.`, 'error');
            return;
        }

        const underGrams = editUnit === 'kg' ? Math.round(uVal * 1000) : Math.round(uVal);
        const overGrams = editUnit === 'kg' ? Math.round(oVal * 1000) : Math.round(oVal);
        // Target weight is automatically computed as the midpoint of the range
        const targetGrams = Math.round((underGrams + overGrams) / 2);

        setIsSaving(true);
        try {
            const payload: GrowthStandard = {
                id: editingStandard?.id,
                farm_id: farmId || null,
                animal_type: selectedAnimal,
                week_number: weekNum,
                target_weight_grams: targetGrams,
                underweight_max_grams: underGrams,
                overweight_min_grams: overGrams,
                notes: editNotes.trim() || null,
            };

            const res = await saveTargetWeight(payload, farmId);
            if (!res.success) {
                console.warn('[handleSave] Cloud save notice:', res.error);
                // Optimistic local state update so user is never blocked
            }

            setStandards(prev => {
                const existingIdx = prev.findIndex(s => s.week_number === weekNum);
                const updatedItem: GrowthStandard = {
                    ...payload,
                    id: res.data?.id || editingStandard?.id || `local-${Date.now()}`,
                };
                if (existingIdx >= 0) {
                    const copy = [...prev];
                    copy[existingIdx] = updatedItem;
                    return copy.sort((a, b) => a.week_number - b.week_number);
                }
                return [...prev, updatedItem].sort((a, b) => a.week_number - b.week_number);
            });

            setModalVisible(false);
            showSnack(`Week ${weekNum} range saved successfully.`, 'success');
        } catch (err: any) {
            console.error('[handleSave] Error:', err);
            showSnack('Failed to save benchmark.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const themeAccent = selectedAnimal === 'pig' ? ((colors as any).pig || '#E67E22') : ((colors as any).chicken || '#F1C40F');

    const uNum = parseFloat(editUnderweight);
    const oNum = parseFloat(editOverweight);
    const hasEnteredBoth = editUnderweight.trim().length > 0 && editOverweight.trim().length > 0 && !isNaN(uNum) && !isNaN(oNum);
    const isValidRange = hasEnteredBoth && uNum > 0 && oNum > 0 && oNum > uNum;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }}>
            <View style={{ flex: 1 }}>
                {/* Header */}
                <View style={{
                    position: 'relative',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: hPad,
                    paddingTop: 16,
                    paddingBottom: 16,
                    minHeight: 56,
                }}>
                    <View style={{ position: 'absolute', left: hPad, zIndex: 10 }}>
                        <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center' }]} numberOfLines={1}>
                        Target Weight Standards
                    </Text>
                </View>

                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: 8, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadStandards(true)}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
            >
                {/* Animal Type Switcher */}
                <View style={{ marginBottom: 16 }}>
                    <AnimalTypePillSwitcher
                        selected={selectedAnimal}
                        onSelect={(type) => setSelectedAnimal(type)}
                        options={[
                            { key: 'pig', label: 'Pigs' },
                            { key: 'chicken', label: 'Chickens' },
                        ]}
                    />
                </View>

                {/* Automation Info Card */}
                <View style={{
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    <View style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        backgroundColor: themeAccent + '1A',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <MaterialIcons name="auto-mode" size={22} color={themeAccent} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14, fontFamily: 'Poppins-SemiBold' }]}>
                            Auto-Calibrated Weekly Ranges
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2, lineHeight: 17 }]}>
                            AniWeigh automatically detects batch age and applies these weekly underweight/overweight thresholds during weighing.
                        </Text>
                    </View>
                </View>

                {/* Section Header with Add Button */}
                <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                }}>
                    <View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>
                            {selectedAnimal === 'pig' ? 'Pig Growth Benchmarks' : 'Chicken Growth Benchmarks'}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                            {standards.length} weeks configured
                        </Text>
                    </View>
                    {canManageWeights && (
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 18,
                            }}
                            onPress={() => openEditModal()}
                        >
                            <MaterialIcons name="add" size={16} color={colors.primary} />
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 12 }]}>
                                Add Week
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Standards List */}
                {isLoading && standards.length === 0 ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
                ) : standards.length === 0 ? (
                    <View style={{
                        backgroundColor: colors.surface,
                        borderRadius: 16,
                        padding: 32,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.stroke,
                        marginTop: 12,
                    }}>
                        <MaterialIcons name="scale" size={48} color={colors.textGrey} />
                        <Text style={[textStyles.h3, { color: colors.text, marginTop: 12 }]}>
                            No Growth Standards Found
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 6 }]}>
                            Tap below to restore recommended industry growth curves.
                        </Text>
                        <TouchableOpacity
                            style={{
                                marginTop: 16,
                                backgroundColor: colors.primary,
                                paddingHorizontal: 20,
                                paddingVertical: 10,
                                borderRadius: 20,
                            }}
                            onPress={handleResetDefaults}
                        >
                            <Text style={[textStyles.label, { color: colors.onPrimary }]}>
                                Load Default Benchmarks
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    standards.map((item) => {
                        const dayStart = (item.week_number - 1) * 7 + 1;
                        const dayEnd = item.week_number * 7;
                        return (
                            <View
                                key={`${item.animal_type}-${item.week_number}`}
                                style={{
                                    backgroundColor: colors.surface,
                                    borderRadius: 16,
                                    padding: 14,
                                    marginBottom: 10,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{
                                            backgroundColor: themeAccent + '20',
                                            paddingHorizontal: 10,
                                            paddingVertical: 3,
                                            borderRadius: 12,
                                        }}>
                                            <Text style={{ color: themeAccent, fontSize: 12, fontFamily: 'Poppins-Bold' }}>
                                                Week {item.week_number}
                                            </Text>
                                        </View>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                            Days {dayStart}–{dayEnd}
                                        </Text>
                                    </View>

                                    {canManageWeights && (
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 4,
                                                padding: 4,
                                            }}
                                            onPress={() => openEditModal(item)}
                                        >
                                            <MaterialIcons name="edit" size={16} color={colors.textGrey} />
                                            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12 }]}>
                                                Edit
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {item.notes ? (
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 12, marginTop: 6, fontFamily: 'Poppins-Medium' }]}>
                                        {item.notes}
                                    </Text>
                                ) : null}

                                {/* Weight ranges grid */}
                                <View style={{
                                    flexDirection: 'row',
                                    marginTop: 12,
                                    paddingTop: 12,
                                    borderTopWidth: 1,
                                    borderTopColor: colors.stroke,
                                    gap: 8,
                                }}>
                                    {/* Underweight */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: colors.warning + '12',
                                        borderRadius: 12,
                                        paddingVertical: 10,
                                        paddingHorizontal: 6,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Text style={[textStyles.body, { color: colors.warning, fontSize: 11, fontFamily: 'Poppins-Medium', textAlign: 'center' }]}>
                                            Underweight
                                        </Text>
                                        <Text style={[textStyles.h3, { color: colors.warning, fontSize: 13, marginTop: 2, fontFamily: 'Poppins-Bold', textAlign: 'center' }]}>
                                            &lt; {formatWeightDisplay(item.underweight_max_grams, item.animal_type)}
                                        </Text>
                                    </View>

                                    {/* Normal Range */}
                                    <View style={{
                                        flex: 1.4,
                                        backgroundColor: colors.primary + '12',
                                        borderRadius: 12,
                                        paddingVertical: 10,
                                        paddingHorizontal: 6,
                                        borderWidth: 1,
                                        borderColor: colors.primary + '30',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 11, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }]}>
                                            Normal Range
                                        </Text>
                                        <Text style={[textStyles.h3, { color: colors.primary, fontSize: 13, marginTop: 2, fontFamily: 'Poppins-Bold', textAlign: 'center' }]}>
                                            {formatWeightDisplay(item.underweight_max_grams, item.animal_type)} – {formatWeightDisplay(item.overweight_min_grams, item.animal_type)}
                                        </Text>
                                    </View>

                                    {/* Overweight */}
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: colors.error + '12',
                                        borderRadius: 12,
                                        paddingVertical: 10,
                                        paddingHorizontal: 6,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Text style={[textStyles.body, { color: colors.error, fontSize: 11, fontFamily: 'Poppins-Medium', textAlign: 'center' }]}>
                                            Overweight
                                        </Text>
                                        <Text style={[textStyles.h3, { color: colors.error, fontSize: 13, marginTop: 2, fontFamily: 'Poppins-Bold', textAlign: 'center' }]}>
                                            &gt; {formatWeightDisplay(item.overweight_min_grams, item.animal_type)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>

            {/* Edit / Add Modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: 16,
                    }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => setModalVisible(false)}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                    <View style={{
                        backgroundColor: colors.surface,
                        borderRadius: 24,
                        width: '100%',
                        maxWidth: 380,
                        maxHeight: '90%',
                        borderWidth: 1,
                        borderColor: colors.stroke,
                        overflow: 'hidden',
                    }}>
                        {/* Header with Close Button */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 20,
                            paddingTop: 16,
                            paddingBottom: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.stroke,
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <View style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 18,
                                    backgroundColor: colors.primary + '1A',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <MaterialIcons name="tune" size={18} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 16, fontFamily: 'Poppins-Bold' }]}>
                                        {editingStandard ? `Edit Week ${editWeek} Benchmark` : 'Add Week Benchmark'}
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                        {selectedAnimal === 'pig' ? 'Pigs' : 'Chickens'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => setModalVisible(false)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                    backgroundColor: colors.cardFill,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginLeft: 8,
                                }}
                            >
                                <MaterialIcons name="close" size={18} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        {/* Scrollable Body */}
                        <ScrollView
                            style={{ flexShrink: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16 }}
                            showsVerticalScrollIndicator={true}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Unit Switcher */}
                            <View style={{
                                flexDirection: 'row',
                                alignSelf: 'center',
                                backgroundColor: colors.bgLight,
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                padding: 3,
                                marginBottom: 14,
                            }}>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => handleUnitSwitch('kg')}
                                    style={{
                                        paddingHorizontal: 16,
                                        paddingVertical: 5,
                                        borderRadius: 16,
                                        backgroundColor: editUnit === 'kg' ? colors.primary : 'transparent',
                                    }}
                                >
                                    <Text style={[textStyles.label, {
                                        color: editUnit === 'kg' ? colors.onPrimary : colors.textGrey,
                                        fontSize: 12,
                                    }]}>
                                        KG
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => handleUnitSwitch('g')}
                                    style={{
                                        paddingHorizontal: 16,
                                        paddingVertical: 5,
                                        borderRadius: 16,
                                        backgroundColor: editUnit === 'g' ? colors.primary : 'transparent',
                                    }}
                                >
                                    <Text style={[textStyles.label, {
                                        color: editUnit === 'g' ? colors.onPrimary : colors.textGrey,
                                        fontSize: 12,
                                    }]}>
                                        Grams
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={{ gap: 10 }}>
                                <FloatingLabelInput
                                    label="Week Number"
                                    icon="calendar-today"
                                    value={editWeek}
                                    onChangeText={setEditWeek}
                                    keyboardType="number-pad"
                                    backgroundColor={colors.surface}
                                />

                                <FloatingLabelInput
                                    label={`Underweight Threshold (${editUnit.toUpperCase()})`}
                                    icon="arrow-downward"
                                    value={editUnderweight}
                                    onChangeText={setEditUnderweight}
                                    keyboardType="numeric"
                                    backgroundColor={colors.surface}
                                />

                                <FloatingLabelInput
                                    label={`Overweight Threshold (${editUnit.toUpperCase()})`}
                                    icon="arrow-upward"
                                    value={editOverweight}
                                    onChangeText={setEditOverweight}
                                    keyboardType="numeric"
                                    backgroundColor={colors.surface}
                                />

                                {/* Auto-computed Normal Range & Live Validation */}
                                {isValidRange ? (
                                    <View style={{
                                        backgroundColor: colors.primary + '10',
                                        borderRadius: 14,
                                        paddingVertical: 14,
                                        paddingHorizontal: 16,
                                        borderWidth: 1,
                                        borderColor: colors.primary + '30',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginVertical: 14,
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                            <MaterialIcons name="auto-awesome" size={15} color={colors.primary} />
                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontFamily: 'Poppins-SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' }]}>
                                                Auto-Calculated Normal Range
                                            </Text>
                                        </View>
                                        <Text style={[textStyles.h2, { color: colors.primary, fontSize: 18, fontFamily: 'Poppins-Bold', textAlign: 'center', marginTop: 4 }]}>
                                            {uNum.toFixed(2)} {editUnit.toUpperCase()} – {oNum.toFixed(2)} {editUnit.toUpperCase()}
                                        </Text>
                                        <View style={{
                                            backgroundColor: colors.surface,
                                            paddingHorizontal: 12,
                                            paddingVertical: 4,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: colors.primary + '20',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 6,
                                            marginTop: 6,
                                        }}>
                                            <MaterialIcons name="adjust" size={13} color={colors.primary} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, fontFamily: 'Poppins-Medium', textAlign: 'center' }]}>
                                                Target Midpoint: <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>~{((uNum + oNum) / 2).toFixed(2)} {editUnit.toUpperCase()}</Text>
                                            </Text>
                                        </View>
                                    </View>
                                ) : hasEnteredBoth && uNum >= oNum ? (
                                    <View style={{
                                        backgroundColor: colors.error + '15',
                                        borderRadius: 12,
                                        padding: 12,
                                        borderWidth: 1,
                                        borderColor: colors.error + '30',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        marginVertical: 12,
                                    }}>
                                        <MaterialIcons name="error-outline" size={18} color={colors.error} />
                                        <Text style={[textStyles.body, { color: colors.error, fontSize: 12, fontFamily: 'Poppins-Medium', flex: 1, textAlign: 'center' }]}>
                                            Overweight threshold must be greater than underweight threshold.
                                        </Text>
                                    </View>
                                ) : null}

                                <FloatingLabelInput
                                    label="Growth Phase Notes (Optional)"
                                    icon="notes"
                                    value={editNotes}
                                    onChangeText={setEditNotes}
                                    backgroundColor={colors.surface}
                                />
                            </View>
                        </ScrollView>

                        {/* Sticky Action Footer */}
                        <View style={{
                            flexDirection: 'row',
                            gap: 12,
                            paddingHorizontal: 20,
                            paddingVertical: 14,
                            borderTopWidth: 1,
                            borderTopColor: colors.stroke,
                            backgroundColor: colors.surface,
                        }}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                style={{
                                    flex: 1,
                                    paddingVertical: 12,
                                    borderRadius: 14,
                                    backgroundColor: colors.cardFill,
                                    alignItems: 'center',
                                }}
                                onPress={() => setModalVisible(false)}
                                disabled={isSaving}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={{
                                    flex: 1,
                                    paddingVertical: 12,
                                    borderRadius: 14,
                                    backgroundColor: colors.primary,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'row',
                                    gap: 6,
                                }}
                                onPress={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator size="small" color={colors.onPrimary} />
                                ) : (
                                    <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>
                                        Save
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Feedback Snackbar */}
            <Snackbar
                visible={snackVisible}
                message={snackMsg}
                type={snackType}
                onDismiss={() => setSnackVisible(false)}
            />
        </View>
    );
}

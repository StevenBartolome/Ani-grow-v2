import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator, Modal, Platform, RefreshControl, ScrollView,
    TextInput, TouchableOpacity, View, Animated, PanResponder, Easing, StyleSheet, Alert, useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { Header } from '@/components/Header';

import { BackButton } from '@/components/BackButton';
import { AIInsightCard } from '@/components/AIInsightCard';
import { useFormDraft } from '@/hooks/useFormDraft';
import ActionModal from '@/components/ActionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnimalStyles } from '@/styles/animalStyles';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notify';
import { scheduleUpcomingVetVisits } from '@/lib/notificationScheduler';
import {
    ILLNESS_SUGGESTIONS, TREATMENT_SUGGESTIONS, VITAMIN_SUGGESTIONS, DEWORMING_SUGGESTIONS
} from '@/constants/healthSuggestions';

// ─── Config ───────────────────────────────────────────────────────────────────

type RecordType = 'vaccination' | 'treatment' | 'observation' | 'illness' | 'deworming' | 'vitamins' | 'mortality';
type Severity = 'low' | 'medium' | 'high';

const RECORD_TYPES: Record<
    RecordType,
    {
        label: string;
        icon: string;
        color: string;
        hint: string;
        showMedication: boolean;
        showDosage: boolean;
        showAffected: boolean;
        showSeverity: boolean;
        showFollowup: boolean;
    }
> = {
    vaccination: {
        label: 'Vaccination',
        icon: 'vaccines',
        color: '#27AE60',
        hint: 'e.g. Newcastle Disease vaccine',
        showMedication: false,
        showDosage: true,
        showAffected: true,
        showSeverity: false,
        showFollowup: false,
    },
    treatment: {
        label: 'Treatment',
        icon: 'healing',
        color: '#2980B9',
        hint: 'e.g. Antibiotic treatment',
        showMedication: true,
        showDosage: true,
        showAffected: true,
        showSeverity: true,
        showFollowup: true,
    },
    illness: {
        label: 'Illness',
        icon: 'sick',
        color: '#E74C3C',
        hint: 'e.g. Respiratory infection observed',
        showMedication: true,
        showDosage: true,
        showAffected: true,
        showSeverity: true,
        showFollowup: true,
    },
    observation: {
        label: 'Observation',
        icon: 'visibility',
        color: '#8E44AD',
        hint: 'e.g. Abnormal behavior noted',
        showMedication: false,
        showDosage: false,
        showAffected: true,
        showSeverity: true,
        showFollowup: true,
    },
    deworming: {
        label: 'Deworming',
        icon: 'bug-report',
        color: '#E67E22',
        hint: 'e.g. Monthly deworming routine',
        showMedication: false,
        showDosage: true,
        showAffected: true,
        showSeverity: false,
        showFollowup: false,
    },
    vitamins: {
        label: 'Vitamins',
        icon: 'medical-services',
        color: '#16A085',
        hint: 'e.g. Vitamin B complex supplement',
        showMedication: false,
        showDosage: true,
        showAffected: false,
        showSeverity: false,
        showFollowup: false,
    },
    mortality: {
        label: 'Mortality',
        icon: 'remove-circle',
        color: '#7F1D1D',
        hint: 'e.g. Animals found dead',
        showMedication: false,
        showDosage: false,
        showAffected: true,
        showSeverity: true,
        showFollowup: false,
    },
};

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; description: string }> = {
    low: { label: 'Low', color: '#27AE60', description: 'Minor / routine' },
    medium: { label: 'Medium', color: '#E67E22', description: 'Needs monitoring' },
    high: { label: 'High', color: '#E74C3C', description: 'Urgent attention' },
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

interface VaccineItem {
    id: string;
    name: string;
    vaccine_type?: string | null;
    species: string;
    dose_per_animal?: number | null;
    unit: string;
    withdrawal_days?: number;
    stock_quantity?: number;
    route?: string | null;
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

const COMMON_VACCINES = [
    // Poultry / Chicken
    'Newcastle Disease - La Sota (Live)',
    'Newcastle Disease - B1 (Live)',
    'Newcastle Disease - Komarov (Killed)',
    'Gumboro / Infectious Bursal Disease (IBD) - Live',
    'Gumboro / Infectious Bursal Disease (IBD) - Killed',
    "Marek's Disease",
    'Infectious Bronchitis (IB) - H120',
    'Infectious Bronchitis (IB) - Massachusetts',
    'Avian Influenza H5N1 (Killed)',
    'Avian Influenza H5N2 (Killed)',
    'Fowl Pox',
    'Fowl Cholera (Pasteurella multocida)',
    'Infectious Laryngotracheitis (ILT)',
    'Egg Drop Syndrome (EDS-76)',
    'Avian Encephalomyelitis (AE)',
    'Mycoplasma Gallisepticum (MG)',
    'Infectious Coryza (IC)',
    // Pigs
    'Hog Cholera / Classical Swine Fever (CSF)',
    'Foot and Mouth Disease (FMD)',
    "Pseudorabies / Aujeszky's Disease",
    'PRRS - Porcine Reproductive & Respiratory Syndrome',
    'Swine Erysipelas',
    'Porcine Parvovirus (PPV)',
    'PCV2 - Porcine Circovirus Type 2',
    'Mycoplasma hyopneumoniae',
    'Actinobacillus pleuropneumoniae (APP)',
    "Haemophilus parasuis / Glässer's Disease",
    'Swine Influenza (SIV)',
    'E. coli / Colibacillosis (Neonatal Diarrhea)',
    'Streptococcus suis',
    'Transmissible Gastroenteritis (TGE)',
    'Bordetella bronchiseptica (Atrophic Rhinitis)',
    // General
    'Rabies',
    'Anthrax',
    'Tetanus',
    'Leptospirosis',
];

const CHICKEN_VACCINE_NAMES = new Set([
    'Newcastle Disease - La Sota (Live)',
    'Newcastle Disease - B1 (Live)',
    'Newcastle Disease - Komarov (Killed)',
    'Gumboro / Infectious Bursal Disease (IBD) - Live',
    'Gumboro / Infectious Bursal Disease (IBD) - Killed',
    "Marek's Disease",
    'Infectious Bronchitis (IB) - H120',
    'Infectious Bronchitis (IB) - Massachusetts',
    'Avian Influenza H5N1 (Killed)',
    'Avian Influenza H5N2 (Killed)',
    'Fowl Pox',
    'Fowl Cholera (Pasteurella multocida)',
    'Infectious Laryngotracheitis (ILT)',
    'Egg Drop Syndrome (EDS-76)',
    'Avian Encephalomyelitis (AE)',
    'Mycoplasma Gallisepticum (MG)',
    'Infectious Coryza (IC)',
]);

const PIG_VACCINE_NAMES = new Set([
    'Hog Cholera / Classical Swine Fever (CSF)',
    'Foot and Mouth Disease (FMD)',
    "Pseudorabies / Aujeszky's Disease",
    'PRRS - Porcine Reproductive & Respiratory Syndrome',
    'Swine Erysipelas',
    'Porcine Parvovirus (PPV)',
    'PCV2 - Porcine Circovirus Type 2',
    'Mycoplasma hyopneumoniae',
    'Actinobacillus pleuropneumoniae (APP)',
    "Haemophilus parasuis / Glässer's Disease",
    'Swine Influenza (SIV)',
    'E. coli / Colibacillosis (Neonatal Diarrhea)',
    'Streptococcus suis',
    'Transmissible Gastroenteritis (TGE)',
    'Bordetella bronchiseptica (Atrophic Rhinitis)',
]);

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

// ─── DatePickerField ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function CalendarPickerOverlay({
    visible, value, onChange, onClose, colors, label,
}: {
    visible: boolean; value: string; onChange: (d: string) => void;
    onClose: () => void; colors: any; label: string;
}) {
    if (!visible) return null;
    const today = new Date();
    const initDate = value ? new Date(value + 'T00:00:00') : today;
    const [viewYear, setViewYear] = useState(initDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(initDate.getMonth());

    useEffect(() => {
        if (visible) {
            const d = value ? new Date(value + 'T00:00:00') : today;
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
        }
    }, [visible, value]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    // Build calendar grid
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    const selectedDate = value ? new Date(value + 'T00:00:00') : null;
    const isSelected = (day: number) =>
        selectedDate &&
        selectedDate.getFullYear() === viewYear &&
        selectedDate.getMonth() === viewMonth &&
        selectedDate.getDate() === day;
    const isToday = (day: number) =>
        today.getFullYear() === viewYear &&
        today.getMonth() === viewMonth &&
        today.getDate() === day;

    const handleDayPress = (day: number) => {
        const mm = String(viewMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        onChange(`${viewYear}-${mm}-${dd}`);
        onClose();
    };

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 1000, elevation: 25 }]}>
            <TouchableOpacity
                activeOpacity={1}
                style={StyleSheet.absoluteFill}
                onPress={onClose}
            />
            <View style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: 28, borderTopRightRadius: 28,
                paddingBottom: 32, paddingHorizontal: 20,
                width: '100%', zIndex: 1001, elevation: 30,
            }}>
                {/* Handle */}
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

                {/* Title */}
                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 17, color: colors.text, textAlign: 'center', marginBottom: 20 }}>
                    {label}
                </Text>

                {/* Month / Year nav */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <TouchableOpacity
                        onPress={prevMonth}
                        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <MaterialIcons name="chevron-left" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 16, color: colors.text }}>
                        {MONTH_NAMES[viewMonth]} {viewYear}
                    </Text>
                    <TouchableOpacity
                        onPress={nextMonth}
                        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <MaterialIcons name="chevron-right" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                {/* Day-of-week headers */}
                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                    {DAY_NAMES.map(d => (
                        <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 12, color: colors.textGrey }}>{d}</Text>
                        </View>
                    ))}
                </View>

                {/* Calendar grid */}
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                    <View key={row} style={{ flexDirection: 'row', marginBottom: 4 }}>
                        {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                            const sel = day !== null && isSelected(day);
                            const tod = day !== null && isToday(day);
                            return (
                                <View key={col} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    {day !== null ? (
                                        <TouchableOpacity
                                            onPress={() => handleDayPress(day)}
                                            activeOpacity={0.75}
                                            style={{
                                                width: 38, height: 38, borderRadius: 19,
                                                alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: sel ? colors.primary : tod ? colors.primary + '18' : 'transparent',
                                                borderWidth: tod && !sel ? 1.5 : 0,
                                                borderColor: colors.primary,
                                            }}
                                        >
                                            <Text style={{
                                                fontFamily: sel ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                fontSize: 14,
                                                color: sel ? '#fff' : tod ? colors.primary : colors.text,
                                            }}>
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : <View style={{ width: 38, height: 38 }} />}
                                </View>
                            );
                        })}
                    </View>
                ))}

                {/* Today shortcut */}
                <TouchableOpacity
                    onPress={() => {
                        const mm = String(today.getMonth() + 1).padStart(2, '0');
                        const dd = String(today.getDate()).padStart(2, '0');
                        onChange(`${today.getFullYear()}-${mm}-${dd}`);
                        onClose();
                    }}
                    style={{ marginTop: 12, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary + '15', alignItems: 'center' }}
                >
                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.primary }}>
                        Today
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function DatePickerField({
    label, value, onPress, required,
}: { label: string; value: string; onPress: () => void; required?: boolean }) {
    const { colors } = useTheme();
    const hasValue = !!value;
    const border = hasValue ? colors.primary : colors.stroke;
    const bg = hasValue ? colors.primary + '0A' : colors.cardFill;

    const displayValue = hasValue
        ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '';

    return (
        <View>
            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.textGrey, marginBottom: 5, letterSpacing: 0.5 }}>
                {label}{required ? ' *' : ''}
            </Text>
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={onPress}
                style={{
                    borderWidth: 1.5, borderColor: border, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12,
                    backgroundColor: bg,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <MaterialIcons name="calendar-today" size={18} color={hasValue ? colors.primary : colors.textGrey} />
                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: hasValue ? colors.text : colors.textGrey }} numberOfLines={1}>
                        {displayValue || 'Select date…'}
                    </Text>
                </View>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textGrey} />
            </TouchableOpacity>
        </View>
    );
}

// ─── VaccinePickerModal (In-Modal Overlay) ────────────────────────────────────

function VaccinePickerModal({
    visible, search, onSearch, onSelect, onClose, colors, vaccineList = [], activeAnimalType,
}: {
    visible: boolean; search: string; onSearch: (s: string) => void;
    onSelect: (vaccine: VaccineItem | string) => void; onClose: () => void; colors: any;
    vaccineList?: VaccineItem[];
    activeAnimalType?: string;
}) {
    if (!visible) return null;

    const normAnimal = (activeAnimalType || '').toLowerCase().trim();
    const isChicken = normAnimal === 'chicken' || normAnimal === 'poultry';
    const isPig = normAnimal === 'pig' || normAnimal === 'swine';

    const list: VaccineItem[] = (vaccineList && vaccineList.length > 0)
        ? vaccineList
        : COMMON_VACCINES.map(v => ({
            id: '',
            name: v,
            species: CHICKEN_VACCINE_NAMES.has(v) ? 'chicken' : PIG_VACCINE_NAMES.has(v) ? 'pig' : 'both',
            unit: 'dose',
            stock_quantity: 0,
            route: 'injection',
            withdrawal_days: 0,
        }));

    // If selected housing/batch is for chickens or pigs, hide not-applicable vaccines, only show matching & both
    const speciesFiltered = list.filter(v => {
        const spec = (v.species || '').toLowerCase().trim();
        if (!spec || spec === 'both' || spec === 'all' || spec === 'general') return true;
        if (isChicken) return spec === 'chicken' || spec === 'poultry';
        if (isPig) return spec === 'pig' || spec === 'swine';
        return true;
    });

    const filtered = speciesFiltered.filter(v => {
        const query = search.toLowerCase();
        return (
            v.name.toLowerCase().includes(query) ||
            (v.species && v.species.toLowerCase().includes(query)) ||
            (v.vaccine_type && v.vaccine_type.toLowerCase().includes(query))
        );
    });

    const isCustomNeeded = search.trim().length > 0 && !speciesFiltered.some(v => v.name.toLowerCase() === search.trim().toLowerCase());

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 1000, elevation: 25 }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 24, width: '100%', zIndex: 1001, elevation: 30 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginTop: 12, marginBottom: 14 }} />
                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 17, color: colors.text, textAlign: 'center', marginBottom: (isChicken || isPig) ? 2 : 12 }}>Select Vaccine</Text>
                {(isChicken || isPig) && (
                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 12, color: colors.textGrey, textAlign: 'center', marginBottom: 12 }}>
                        Showing vaccines for {isChicken ? 'Chickens' : 'Pigs'} & General
                    </Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, marginHorizontal: 20, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, backgroundColor: colors.cardFill }}>
                    <MaterialIcons name="search" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                    <TextInput
                        style={{ flex: 1, fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text }}
                        placeholder="Search vaccine…"
                        placeholderTextColor={colors.textGrey}
                        value={search}
                        onChangeText={onSearch}
                        autoFocus
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => onSearch('')}>
                            <MaterialIcons name="close" size={16} color={colors.textGrey} />
                        </TouchableOpacity>
                    )}
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {isCustomNeeded && (
                        <TouchableOpacity
                            onPress={() => onSelect(search.trim())}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.stroke }}
                        >
                            <MaterialIcons name="add-circle-outline" size={18} color={colors.primary} />
                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 14, color: colors.primary }}>Use "{search.trim()}"</Text>
                        </TouchableOpacity>
                    )}
                    {filtered.map((item, i) => {
                        const specLabel = item.species === 'both' ? 'All Species' : item.species ? item.species.charAt(0).toUpperCase() + item.species.slice(1) : null;
                        const specColor = item.species === 'chicken' ? '#F59E0B' : item.species === 'pig' ? '#F97316' : '#6C63FF';
                        return (
                            <TouchableOpacity
                                key={item.id || i}
                                onPress={() => onSelect(item)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.stroke + '60' }}
                            >
                                <MaterialIcons name="vaccines" size={16} color="#27AE60" />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text }}>{item.name}</Text>
                                    {(item.stock_quantity != null || specLabel) && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                            {specLabel && (
                                                <View style={{ backgroundColor: specColor + '18', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: specColor }}>{specLabel}</Text>
                                                </View>
                                            )}
                                            {item.stock_quantity != null && item.stock_quantity > 0 && (
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                    {item.stock_quantity} {item.unit || 'doses'} in stock
                                                </Text>
                                            )}
                                            {item.dose_per_animal != null && (
                                                <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 11, color: colors.textGrey }}>
                                                    · {item.dose_per_animal} {item.unit || 'dose'}/animal
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                    {filtered.length === 0 && search.length > 0 && (
                        <Text style={{ textAlign: 'center', color: colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 13, marginTop: 20 }}>No match — type above to use custom name</Text>
                    )}
                </ScrollView>
                <TouchableOpacity onPress={onClose} style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.cardFill, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.textGrey }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── SuggestionPickerModal (In-Modal Overlay) ─────────────────────────────────

function SuggestionPickerModal({
    visible, title, options, onSelect, onClose, colors
}: {
    visible: boolean; title: string; options: string[];
    onSelect: (val: string) => void; onClose: () => void; colors: any;
}) {
    if (!visible) return null;

    const [search, setSearch] = useState('');
    const filtered = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 1000, elevation: 25 }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 24, width: '100%', zIndex: 1001, elevation: 30 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, alignSelf: 'center', marginTop: 12, marginBottom: 14 }} />
                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 17, color: colors.text, textAlign: 'center', marginBottom: 12 }}>{title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, marginHorizontal: 20, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, backgroundColor: colors.cardFill }}>
                    <MaterialIcons name="search" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                    <TextInput
                        style={{ flex: 1, fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text }}
                        placeholder="Search..."
                        placeholderTextColor={colors.textGrey}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <MaterialIcons name="close" size={16} color={colors.textGrey} />
                        </TouchableOpacity>
                    )}
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {filtered.map((opt, i) => (
                        <TouchableOpacity
                            key={i}
                            onPress={() => onSelect(opt)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.stroke + '60' }}
                        >
                            <Text style={{ fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text, flex: 1 }}>{opt}</Text>
                        </TouchableOpacity>
                    ))}
                    {filtered.length === 0 && (
                        <Text style={{ textAlign: 'center', color: colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 13, marginTop: 20 }}>No matches found</Text>
                    )}
                </ScrollView>
                <TouchableOpacity onPress={onClose} style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.cardFill, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.textGrey }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Reusable In-Modal Picker Overlays ─────────────────────────────────────────

function BatchPickerOverlay({
    visible, batches, selectedId, onSelect, onClose, colors, textStyles,
}: {
    visible: boolean; batches: Batch[]; selectedId: string;
    onSelect: (id: string) => void; onClose: () => void; colors: any; textStyles: any;
}) {
    if (!visible) return null;
    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 1000, elevation: 25 }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 340, maxHeight: '80%', zIndex: 1001, elevation: 30 }}>
                <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }]}>Select Batch</Text>
                {batches.length === 0 ? (
                    <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', paddingVertical: 16 }]}>No batches found for this housing.</Text>
                ) : (
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {batches.map(b => (
                            <TouchableOpacity
                                key={b.id}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10,
                                    borderRadius: 12, backgroundColor: selectedId === b.id ? colors.primary + '15' : 'transparent', marginBottom: 4
                                }}
                                onPress={() => { onSelect(b.id); onClose(); }}
                            >
                                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <MaterialIcons name="layers" size={18} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 14, fontFamily: selectedId === b.id ? 'Poppins-SemiBold' : 'Poppins-Regular' }]}>{b.name}</Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                        {b.status} · {b.current_count} animals
                                    </Text>
                                </View>
                                {selectedId === b.id && <MaterialIcons name="check" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>
        </View>
    );
}

function TypePickerOverlay({
    visible, selectedType, onSelect, onClose, colors, textStyles,
}: {
    visible: boolean; selectedType: RecordType;
    onSelect: (type: RecordType) => void; onClose: () => void; colors: any; textStyles: any;
}) {
    if (!visible) return null;
    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 1000, elevation: 25 }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 340, maxHeight: '80%', zIndex: 1001, elevation: 30 }}>
                <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }]}>Select Type</Text>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {(Object.entries(RECORD_TYPES) as Array<[RecordType, typeof RECORD_TYPES[RecordType]]>).map(([key, cfg]) => (
                        <TouchableOpacity
                            key={key}
                            style={{
                                flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10,
                                borderRadius: 12, backgroundColor: selectedType === key ? cfg.color + '15' : 'transparent', marginBottom: 4
                            }}
                            onPress={() => { onSelect(key); onClose(); }}
                        >
                            <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: cfg.color + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <MaterialIcons name={cfg.icon as any} size={18} color={cfg.color} />
                            </View>
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 14, fontFamily: selectedType === key ? 'Poppins-SemiBold' : 'Poppins-Regular' }]}>{cfg.label}</Text>
                            {selectedType === key && <MaterialIcons name="check" size={18} color={cfg.color} style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        </View>
    );
}

function SeverityPickerOverlay({
    visible, selectedSeverity, onSelect, onClose, colors, textStyles,
}: {
    visible: boolean; selectedSeverity: Severity;
    onSelect: (sev: Severity) => void; onClose: () => void; colors: any; textStyles: any;
}) {
    if (!visible) return null;
    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 1000, elevation: 25 }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 300, zIndex: 1001, elevation: 30 }}>
                <Text style={[textStyles.h3, { color: colors.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }]}>Select Severity</Text>
                {(Object.entries(SEVERITY_CONFIG) as Array<[Severity, typeof SEVERITY_CONFIG[Severity]]>).map(([key, cfg]) => (
                    <TouchableOpacity
                        key={key}
                        style={{
                            flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10,
                            borderRadius: 12, backgroundColor: selectedSeverity === key ? cfg.color + '15' : 'transparent', marginBottom: 4
                        }}
                        onPress={() => { onSelect(key); onClose(); }}
                    >
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.color, marginRight: 12 }} />
                        <View>
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 14, fontFamily: selectedSeverity === key ? 'Poppins-SemiBold' : 'Poppins-Regular' }]}>{cfg.label}</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>{cfg.description}</Text>
                        </View>
                        {selectedSeverity === key && <MaterialIcons name="check" size={18} color={cfg.color} style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

interface ConfirmationOverlayProps {
    visible: boolean;
    type?: 'confirmation' | 'warning' | 'info';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
    colors: any;
    textStyles: any;
}

function ConfirmationOverlay({
    visible,
    type = 'confirmation',
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    isLoading = false,
    colors,
    textStyles,
}: ConfirmationOverlayProps) {
    if (!visible) return null;

    let iconName: any = 'help-outline';
    let iconColor = colors.primary;
    let confirmBtnColor = colors.primary;

    if (type === 'warning') {
        iconName = 'warning';
        iconColor = colors.error;
        confirmBtnColor = colors.error;
    }

    return (
        <View
            style={[
                StyleSheet.absoluteFillObject,
                {
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                    zIndex: 99999,
                    elevation: 100,
                },
            ]}
        >
            <TouchableOpacity
                activeOpacity={1}
                style={StyleSheet.absoluteFillObject}
                onPress={isLoading ? undefined : onCancel}
            />
            <View
                style={[
                    {
                        width: '100%',
                        maxWidth: 340,
                        borderRadius: 24,
                        padding: 24,
                        alignItems: 'center',
                        backgroundColor: colors.surface,
                        zIndex: 100000,
                        elevation: 101,
                    },
                    Platform.select({
                        web: {
                            boxShadow: `0px 10px 25px ${colors.shadow || 'rgba(0,0,0,0.2)'}`,
                        },
                        default: {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 10 },
                            shadowOpacity: 0.25,
                            shadowRadius: 20,
                            elevation: 20,
                        },
                    }),
                ]}
            >
                {/* Icon Container */}
                <View
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        backgroundColor: iconColor + '1A',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 16,
                    }}
                >
                    <MaterialIcons name={iconName} size={32} color={iconColor} />
                </View>

                {/* Title */}
                <Text
                    style={[
                        textStyles.h2,
                        {
                            color: colors.text,
                            textAlign: 'center',
                            marginBottom: 8,
                            fontSize: 18,
                        },
                    ]}
                >
                    {title}
                </Text>

                {/* Message */}
                <Text
                    style={[
                        textStyles.body,
                        {
                            color: colors.textGrey,
                            textAlign: 'center',
                            marginBottom: 24,
                            fontSize: 13,
                            lineHeight: 18,
                        },
                    ]}
                >
                    {message}
                </Text>

                {/* Actions */}
                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                    <TouchableOpacity
                        style={{
                            flex: 1,
                            paddingVertical: 13,
                            paddingHorizontal: 8,
                            borderRadius: 100,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.cardFill,
                        }}
                        onPress={onCancel}
                        disabled={isLoading}
                        activeOpacity={0.7}
                    >
                        <Text
                            style={[
                                textStyles.h3,
                                {
                                    color: colors.textGrey,
                                    fontSize: 14,
                                    textAlign: 'center',
                                },
                            ]}
                        >
                            {cancelText}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={{
                            flex: 1,
                            paddingVertical: 13,
                            paddingHorizontal: 8,
                            borderRadius: 100,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: confirmBtnColor,
                            opacity: isLoading ? 0.8 : 1,
                        }}
                        onPress={onConfirm}
                        disabled={isLoading}
                        activeOpacity={0.7}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color={colors.onPrimary} />
                        ) : (
                            <Text
                                style={[
                                    textStyles.h3,
                                    {
                                        color: colors.onPrimary,
                                        fontSize: 14,
                                        textAlign: 'center',
                                    },
                                ]}
                            >
                                {confirmText}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

interface HousingSummary {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    current_count: number;
    capacity: number;
    active_batch_name: string | null;
}

const ANIMAL_IMAGES: Record<string, any> = {
    pig: require('../../assets/images/animals/pigs.jpg'),
    chicken: require('../../assets/images/animals/chickens.png'),
};

const affectedLabel = (type: RecordType) => {
    switch (type) {
        case 'vaccination': return 'ANIMALS VACCINATED *';
        case 'treatment': return 'ANIMALS TREATED';
        case 'deworming': return 'ANIMALS DEWORMED';
        case 'mortality': return 'ANIMALS DECEASED *';
        default: return 'ANIMALS AFFECTED';
    }
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HealthRecordsScreen() {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;
    const { housingId, batchId: paramBatchId } = useLocalSearchParams<{ housingId: string; batchId: string }>();
    const router = useRouter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnimalStyles();
    const { profile, permissions, role, isLoading: authLoading } = useAuth();

    const RESTRICTED_ROLES = ['caretaker', 'veterinarian', 'flockman'];

    useEffect(() => {
        if (authLoading || !role) return;
        if (RESTRICTED_ROLES.includes(role) && !permissions['health:view']) {
            router.replace('/(dashboard)/HomeScreen' as any);
        }
    }, [authLoading, role, permissions]);

    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const userId = (profile as any)?.uid || (profile as any)?.id;

    // ── Data state ────────────────────────────────────────────────────────────
    const [records, setRecords] = useState<HealthRecord[]>([]);
    const [trashedRecords, setTrashedRecords] = useState<HealthRecord[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [housingFarmId, setHousingFarmId] = useState<string>(''); // farm_id sourced from housing row
    const [housingAnimalType, setHousingAnimalType] = useState<string>('');
    const [dbVaccines, setDbVaccines] = useState<VaccineItem[]>([]);

    const fetchVaccines = useCallback(async (targetFarm: string) => {
        if (!targetFarm) return;
        try {
            const { data, error } = await supabase
                .from('vaccines')
                .select('id, name, vaccine_type, species, dose_per_animal, unit, withdrawal_days, stock_quantity, route')
                .eq('farm_id', targetFarm)
                .order('name', { ascending: true });
            if (!error && data) {
                setDbVaccines(data);
            }
        } catch (err) {
            console.warn('[HealthRecords] fetchVaccines error:', err);
        }
    }, []);

    useEffect(() => {
        if (farmId) fetchVaccines(farmId);
    }, [farmId, fetchVaccines]);

    // ── Trash drawer ──────────────────────────────────────────────────────────
    const [trashVisible, setTrashVisible] = useState(false);
    const [trashSeen, setTrashSeen] = useState(true);   // true = no badge dot
    const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
    const [permDeleteVisible, setPermDeleteVisible] = useState(false);
    const [isPermaDeleting, setIsPermaDeleting] = useState(false);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);
    const [restoreModalVisible, setRestoreModalVisible] = useState(false);
    const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);

    // ── Filter ────────────────────────────────────────────────────────────────
    const [filterType, setFilterType] = useState<RecordType | 'all'>('all');
    const [filterBatchId, setFilterBatchId] = useState<string | 'all'>(paramBatchId || 'all');
    const [filtersCollapsed, setFiltersCollapsed] = useState(false);

    const isBatchFiltered = filterBatchId !== 'all';
    const isTypeFiltered = filterType !== 'all';
    const isFiltered = isBatchFiltered || isTypeFiltered;

    const activeFilterSummary = useMemo(() => {
        const activeBatch = batches.find(b => b.id === filterBatchId);
        const parts: string[] = [];
        if (isTypeFiltered) {
            parts.push(RECORD_TYPES[filterType as RecordType]?.label || String(filterType));
        }
        if (isBatchFiltered && activeBatch) {
            parts.push(activeBatch.name);
        }
        if (parts.length === 0) {
            return 'All Records';
        }
        return parts.join(' · ');
    }, [isTypeFiltered, filterType, isBatchFiltered, filterBatchId, batches]);

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');
    const showSnackbar = (msg: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(msg); setSnackbarType(type); setSnackbarVisible(true);
    };

    // ── Detail modal ──────────────────────────────────────────────────────────
    const [detailRecord, setDetailRecord] = useState<HealthRecord | null>(null);

    // ── Delete ────────────────────────────────────────────────────────────────
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // ── Add form ──────────────────────────────────────────────────────────────
    const [addVisible, setAddVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [addBatchId, setAddBatchId] = useState(paramBatchId || '');
    const [addType, setAddType] = useState<RecordType>('vaccination');
    const [addTitle, setAddTitle] = useState('');
    const [addMed, setAddMed] = useState('');
    const [addDosage, setAddDosage] = useState('');
    const [addAffected, setAddAffected] = useState('');
    const [addNotes, setAddNotes] = useState('');
    const [addSeverity, setAddSeverity] = useState<Severity>('low');
    const [addDate, setAddDate] = useState(new Date().toISOString().split('T')[0]);
    const [addFollowup, setAddFollowup] = useState('');
    const [vaccineSearch, setVaccineSearch] = useState('');
    const [vaccinePickerVisible, setVaccinePickerVisible] = useState(false);

    // Custom input states for "Other"
    const [customTitle, setCustomTitle] = useState('');
    const [customMed, setCustomMed] = useState('');

    // Picker visibility states
    const [illnessPickerVisible, setIllnessPickerVisible] = useState(false);
    const [treatmentPickerVisible, setTreatmentPickerVisible] = useState(false);
    const [vitaminPickerVisible, setVitaminPickerVisible] = useState(false);
    const [dewormingPickerVisible, setDewormingPickerVisible] = useState(false);
    const [medicationPickerVisible, setMedicationPickerVisible] = useState(false);

    // ── Form Draft Checkpointing ──────────────────────────────────
    const {
        clearDraft,
    } = useFormDraft(
        `health_record_${housingId || 'default'}`,
        {
            addBatchId,
            addType,
            addTitle,
            customTitle,
            addMed,
            customMed,
            addDosage,
            addAffected,
            addNotes,
            addSeverity,
            addDate,
            addFollowup,
        },
        {
            enabled: addVisible,
            onRestore: (draft) => {
                if (draft.addBatchId) setAddBatchId(draft.addBatchId);
                if (draft.addType) setAddType(draft.addType);
                if (draft.addTitle) setAddTitle(draft.addTitle);
                if (draft.customTitle) setCustomTitle(draft.customTitle);
                if (draft.addMed) setAddMed(draft.addMed);
                if (draft.customMed) setCustomMed(draft.customMed);
                if (draft.addDosage) setAddDosage(draft.addDosage);
                if (draft.addAffected) setAddAffected(draft.addAffected);
                if (draft.addNotes) setAddNotes(draft.addNotes);
                if (draft.addSeverity) setAddSeverity(draft.addSeverity);
                if (draft.addDate) setAddDate(draft.addDate);
                if (draft.addFollowup) setAddFollowup(draft.addFollowup);
            },
        }
    );

    // ── Housing Selection State ──
    const [housings, setHousings] = useState<HousingSummary[]>([]);
    const [housingsLoading, setHousingsLoading] = useState(true);

    const [housingsRefreshing, setHousingsRefreshing] = useState(false);

    const fetchHousings = useCallback(async (isRefresh = false) => {
        if (!farmId) { setHousingsLoading(false); return; }
        if (isRefresh) setHousingsRefreshing(true);
        else if (housings.length === 0) setHousingsLoading(true);
        try {
            const { data, error } = await supabase
                .from('housings')
                .select(`
                    id, name, animal_type, current_count, capacity,
                    batches(name, status)
                `)
                .eq('farm_id', farmId)
                .eq('status', 'Active')
                .order('name', { ascending: true });

            if (error) throw error;

            const mapped: HousingSummary[] = (data ?? []).map((h: any) => ({
                id: h.id,
                name: h.name,
                animal_type: h.animal_type,
                current_count: h.current_count,
                capacity: h.capacity,
                active_batch_name: h.batches?.find((b: any) => b.status === 'active')?.name ?? null,
            }));
            setHousings(mapped);
        } catch (err) {
            console.error('[HealthRecordsScreen] fetch housings error:', err);
        } finally {
            if (isRefresh) setHousingsRefreshing(false);
            else setHousingsLoading(false);
        }
    }, [farmId, housings.length]);

    useEffect(() => {
        if (!housingId) {
            fetchHousings();
        }
    }, [housingId, fetchHousings]);

    // ── Animations ────────────────────────────────────────────────────────────
    const slideAdd = useRef(new Animated.Value(600)).current;
    const slideDetail = useRef(new Animated.Value(600)).current;
    const slideTrash = useRef(new Animated.Value(600)).current;
    const slideEdit = useRef(new Animated.Value(600)).current;

    // Pickers (Add form)
    const [typePickerVisible, setTypePickerVisible] = useState(false);
    const [severityPickerVisible, setSeverityPickerVisible] = useState(false);
    const [batchPickerVisible, setBatchPickerVisible] = useState(false);
    const [activeAddCalendar, setActiveAddCalendar] = useState<{
        label: string;
        value: string;
        onChange: (d: string) => void;
    } | null>(null);

    // ── Edit form ─────────────────────────────────────────────────────────────
    const [editVisible, setEditVisible] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [editRecordId, setEditRecordId] = useState<string | null>(null);
    const [editBatchId, setEditBatchId] = useState('');
    const [editType, setEditType] = useState<RecordType>('vaccination');
    const [editTitle, setEditTitle] = useState('');
    const [editMed, setEditMed] = useState('');
    const [editDosage, setEditDosage] = useState('');
    const [editAffected, setEditAffected] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editSeverity, setEditSeverity] = useState<Severity>('low');
    const [editDate, setEditDate] = useState('');
    const [editFollowup, setEditFollowup] = useState('');
    const [editCustomTitle, setEditCustomTitle] = useState('');
    const [editCustomMed, setEditCustomMed] = useState('');

    // Edit pickers
    const [editTypePickerVisible, setEditTypePickerVisible] = useState(false);
    const [editSeverityPickerVisible, setEditSeverityPickerVisible] = useState(false);
    const [editBatchPickerVisible, setEditBatchPickerVisible] = useState(false);
    const [editVaccinePickerVisible, setEditVaccinePickerVisible] = useState(false);
    const [editVaccineSearch, setEditVaccineSearch] = useState('');
    const [editIllnessPickerVisible, setEditIllnessPickerVisible] = useState(false);
    const [editTreatmentPickerVisible, setEditTreatmentPickerVisible] = useState(false);
    const [editVitaminPickerVisible, setEditVitaminPickerVisible] = useState(false);
    const [editDewormingPickerVisible, setEditDewormingPickerVisible] = useState(false);
    const [editMedicationPickerVisible, setEditMedicationPickerVisible] = useState(false);
    const [activeEditCalendar, setActiveEditCalendar] = useState<{
        label: string;
        value: string;
        onChange: (d: string) => void;
    } | null>(null);

    // ── Add Modal Swipe Gesture (Header only) ──
    const closeAddModalRef = useRef<() => void>(undefined);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 0,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    slideAdd.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 100 || gestureState.vy > 0.5) {
                    Animated.timing(slideAdd, {
                        toValue: 600,
                        duration: 180,
                        easing: Easing.in(Easing.cubic),
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        closeAddModalRef.current?.();
                    });
                } else {
                    Animated.timing(slideAdd, {
                        toValue: 0,
                        duration: 180,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: Platform.OS !== 'web',
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        if (addVisible) {
            slideAdd.setValue(600);
            Animated.timing(slideAdd, {
                toValue: 0,
                duration: 250,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: Platform.OS !== 'web',
            }).start();
        }
    }, [addVisible]);

    // ── Detail Modal Swipe Gesture ──
    const panYDetail = useRef(new Animated.Value(0)).current;
    const closeDetailModalRef = useRef<() => void>(undefined);
    const isScrollAtTopDetail = useRef(true);

    const panDetailResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            // Capture phase fires BEFORE the ScrollView child gets a chance to claim —
            // this lets the parent win vertical swipe-down when content is at top.
            onMoveShouldSetPanResponderCapture: (_, gestureState) => {
                return gestureState.dy > 10 && isScrollAtTopDetail.current;
            },
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && isScrollAtTopDetail.current;
            },
            onPanResponderGrant: () => {
                panYDetail.setOffset(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panYDetail.setValue(gestureState.dy);
                } else {
                    panYDetail.setValue(gestureState.dy * 0.2);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    Animated.timing(panYDetail, {
                        toValue: 600,
                        duration: 150,
                        easing: Easing.linear,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        slideDetail.setValue(600);
                        panYDetail.setValue(0);
                        closeDetailModalRef.current?.();
                    });
                } else {
                    Animated.spring(panYDetail, {
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
        if (!!detailRecord) {
            isScrollAtTopDetail.current = true; // Always reset so swipe works on every open
            panYDetail.setValue(0);
            Animated.spring(slideDetail, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideDetail.setValue(600);
        }
    }, [detailRecord]);

    // ── Recently Deleted Swipe Gesture ──
    const panYTrash = useRef(new Animated.Value(0)).current;
    const closeTrashModalRef = useRef<() => void>(undefined);
    const isScrollAtTopTrash = useRef(true);

    const panTrashResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && isScrollAtTopTrash.current;
            },
            onPanResponderGrant: () => {
                panYTrash.setOffset(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panYTrash.setValue(gestureState.dy);
                } else {
                    panYTrash.setValue(gestureState.dy * 0.2);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    Animated.timing(panYTrash, {
                        toValue: 600,
                        duration: 150,
                        easing: Easing.linear,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        slideTrash.setValue(600);
                        panYTrash.setValue(0);
                        closeTrashModalRef.current?.();
                    });
                } else {
                    Animated.spring(panYTrash, {
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
        if (trashVisible) {
            panYTrash.setValue(0);
            Animated.spring(slideTrash, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideTrash.setValue(600);
        }
    }, [trashVisible]);

    // ── Edit Modal Animation ──
    const closeEditModalRef = useRef<() => void>(undefined);

    const panEditResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gs) => gs.dy > 0,
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) {
                    slideEdit.setValue(gs.dy);
                }
            },
            onPanResponderRelease: (_, gs) => {
                if (gs.dy > 100 || gs.vy > 0.5) {
                    Animated.timing(slideEdit, {
                        toValue: 600,
                        duration: 180,
                        easing: Easing.in(Easing.cubic),
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        closeEditModalRef.current?.();
                    });
                } else {
                    Animated.timing(slideEdit, {
                        toValue: 0,
                        duration: 180,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: Platform.OS !== 'web',
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        if (editVisible) {
            slideEdit.setValue(600);
            Animated.timing(slideEdit, {
                toValue: 0,
                duration: 250,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: Platform.OS !== 'web',
            }).start();
        }
    }, [editVisible]);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const COLS = 'id, record_type, title, notes, severity, record_date, medication, dosage, affected_count, followup_date, batch_id, created_at, deleted_at';

    const fetchData = useCallback(async () => {
        if (!housingId) return;
        setIsLoading(true);
        try {
            const [housingRes, batchRes, activeRes, trashRes] = await Promise.all([
                supabase
                    .from('housings')
                    .select('farm_id, animal_type')
                    .eq('id', housingId)
                    .single(),
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

            if (housingRes.error) throw housingRes.error;
            if (batchRes.error) throw batchRes.error;
            if (activeRes.error) throw activeRes.error;
            if (trashRes.error) throw trashRes.error;

            // Store farm_id and animal_type from housing — used for inserts and species filtering
            if (housingRes.data?.farm_id) {
                setHousingFarmId(housingRes.data.farm_id);
                fetchVaccines(housingRes.data.farm_id);
            }
            if (housingRes.data?.animal_type) {
                setHousingAnimalType(housingRes.data.animal_type);
            }
            setBatches(batchRes.data ?? []);
            setRecords(activeRes.data ?? []);
            setTrashedRecords(trashRes.data ?? []);
        } catch (err) {
            console.error('[HealthRecords] fetchData error:', err);
            showSnackbar('Failed to load records.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [housingId, fetchVaccines]);

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
            const typeOk = filterType === 'all' || r.record_type === filterType;
            const batchOk = filterBatchId === 'all' || r.batch_id === filterBatchId;
            return typeOk && batchOk;
        });
    }, [records, filterType, filterBatchId]);

    // Filter suggestions based on selected batch's animal type
    const activeAnimalType = selectedAddBatch?.animal_type || 'all';

    const illnessOptions = useMemo(() => {
        return ILLNESS_SUGGESTIONS.filter(item => item.animalType === activeAnimalType || item.animalType === 'all');
    }, [activeAnimalType]);

    const treatmentOptions = useMemo(() => {
        return TREATMENT_SUGGESTIONS.filter(item => item.animalType === activeAnimalType || item.animalType === 'all');
    }, [activeAnimalType]);

    const vitaminOptions = useMemo(() => {
        return VITAMIN_SUGGESTIONS.filter(item => item.animalType === activeAnimalType || item.animalType === 'all');
    }, [activeAnimalType]);

    const dewormingOptions = useMemo(() => {
        return DEWORMING_SUGGESTIONS.filter(item => item.animalType === activeAnimalType || item.animalType === 'all');
    }, [activeAnimalType]);

    const suggestedMeds = useMemo(() => {
        if (addType === 'treatment') {
            const found = treatmentOptions.find(item => item.name === addTitle);
            return found ? found.commonMedications : [];
        }
        if (addType === 'illness') {
            const found = illnessOptions.find(item => item.name === addTitle);
            return found ? found.commonMedications : [];
        }
        return [];
    }, [addType, addTitle, treatmentOptions, illnessOptions]);

    // ── Form Validations (disable buttons if required fields not filled) ───────
    const finalAddTitle = addTitle === 'Other' ? customTitle.trim() : addTitle.trim();
    const isAddCountExceeded = !!(
        RECORD_TYPES[addType].showAffected &&
        addAffected &&
        selectedAddBatch &&
        parseInt(addAffected, 10) > selectedAddBatch.current_count
    );
    const isAddMortalityInvalid = addType === 'mortality' && (!addAffected || parseInt(addAffected, 10) <= 0);
    const isAddVaccinationInvalid = addType === 'vaccination' && (!addAffected || parseInt(addAffected, 10) < 1);

    const isAddFormValid = !!(
        addBatchId &&
        finalAddTitle &&
        addDate &&
        !isAddCountExceeded &&
        !isAddMortalityInvalid &&
        !isAddVaccinationInvalid
    );

    const finalEditTitle = editTitle === 'Other' ? editCustomTitle.trim() : editTitle.trim();
    const selectedEditBatch = batches.find(b => b.id === editBatchId) ?? null;
    const originalRecord = records.find(r => r.id === editRecordId) ?? null;
    const wasOldMortality = originalRecord?.record_type === 'mortality';
    const oldAffected = (wasOldMortality && originalRecord?.affected_count) ? originalRecord.affected_count : 0;
    const isNewMortality = editType === 'mortality';
    const availableEditCount = selectedEditBatch
        ? selectedEditBatch.current_count + (wasOldMortality && editBatchId === originalRecord?.batch_id ? oldAffected : 0)
        : 0;

    const editAnimalType = selectedEditBatch?.animal_type || 'all';

    const editTreatmentOptions = useMemo(() => {
        return TREATMENT_SUGGESTIONS.filter(item => item.animalType === editAnimalType || item.animalType === 'all');
    }, [editAnimalType]);

    const editIllnessOptions = useMemo(() => {
        return ILLNESS_SUGGESTIONS.filter(item => item.animalType === editAnimalType || item.animalType === 'all');
    }, [editAnimalType]);

    const editVitaminOptions = useMemo(() => {
        return VITAMIN_SUGGESTIONS.filter(item => item.animalType === editAnimalType || item.animalType === 'all');
    }, [editAnimalType]);

    const editDewormingOptions = useMemo(() => {
        return DEWORMING_SUGGESTIONS.filter(item => item.animalType === editAnimalType || item.animalType === 'all');
    }, [editAnimalType]);

    const editSuggestedMeds = useMemo(() => {
        if (editType === 'treatment') {
            const found = editTreatmentOptions.find(item => item.name === editTitle);
            return found ? found.commonMedications : [];
        }
        if (editType === 'illness') {
            const found = editIllnessOptions.find(item => item.name === editTitle);
            return found ? found.commonMedications : [];
        }
        return [];
    }, [editType, editTitle, editTreatmentOptions, editIllnessOptions]);

    const isEditCountExceeded = !!(
        selectedEditBatch &&
        editAffected && (
            isNewMortality
                ? parseInt(editAffected, 10) > availableEditCount
                : (RECORD_TYPES[editType].showAffected && parseInt(editAffected, 10) > selectedEditBatch.current_count)
        )
    );
    const isEditMortalityInvalid = isNewMortality && (!editAffected || parseInt(editAffected, 10) <= 0);
    const isEditVaccinationInvalid = editType === 'vaccination' && (!editAffected || parseInt(editAffected, 10) < 1);

    const isEditFormValid = !!(
        editBatchId &&
        finalEditTitle &&
        editDate &&
        !isEditCountExceeded &&
        !isEditMortalityInvalid &&
        !isEditVaccinationInvalid
    );

    const syncCountsForBatchAndHousing = async (batchId: string | null, targetHousingId: string | null) => {
        if (!batchId || !targetHousingId) return;
        try {
            const { data: batch, error: bFetchErr } = await supabase
                .from('batches')
                .select('estimated_count, sold_count, status')
                .eq('id', batchId)
                .single();
            if (bFetchErr || !batch) {
                console.warn('[syncCounts] Failed to fetch batch:', bFetchErr?.message);
                return;
            }

            const { data: allMortality, error: mErr } = await supabase
                .from('health_records')
                .select('affected_count')
                .eq('batch_id', batchId)
                .eq('record_type', 'mortality')
                .is('deleted_at', null);
            if (mErr) {
                console.warn('[syncCounts] Failed to fetch mortalities:', mErr.message);
                return;
            }

            const totalDeceased = (allMortality ?? []).reduce(
                (sum: number, r: any) => sum + (r.affected_count ?? 0), 0
            );
            const newBatchCount = Math.max(0, (batch.estimated_count ?? 0) - (batch.sold_count ?? 0) - totalDeceased);

            const { error: bErr } = await supabase
                .from('batches')
                .update({ current_count: newBatchCount, updated_at: new Date().toISOString() })
                .eq('id', batchId);
            if (bErr) {
                console.warn('[syncCounts] Failed to update batch count:', bErr.message);
            }

            const { data: activeBatches, error: abErr } = await supabase
                .from('batches')
                .select('id, current_count')
                .eq('housing_id', targetHousingId)
                .eq('status', 'active');
            if (abErr) {
                console.warn('[syncCounts] Failed to fetch active batches for housing:', abErr.message);
                return;
            }

            const housingCount = (activeBatches ?? []).reduce((sum, b) => {
                const count = b.id === batchId && batch.status === 'active' ? newBatchCount : (b.current_count ?? 0);
                return sum + count;
            }, 0);

            const { error: hErr } = await supabase
                .from('housings')
                .update({ current_count: housingCount, updated_at: new Date().toISOString() })
                .eq('id', targetHousingId);
            if (hErr) {
                console.warn('[syncCounts] Failed to update housing count:', hErr.message);
            }
        } catch (err) {
            console.error('[syncCounts] Error:', err);
        }
    };

    // ── Add ───────────────────────────────────────────────────────────────────
    const handleAdd = async () => {
        const finalTitle = addTitle === 'Other' ? customTitle.trim() : addTitle.trim();
        if (!finalTitle) {
            showSnackbar(addType === 'vaccination' ? 'Please select a vaccine.' : 'Please enter a title.', 'error');
            return;
        }
        if (!addBatchId) { showSnackbar('Please select a batch.', 'error'); return; }
        if (!housingId) { showSnackbar('No housing selected.', 'error'); return; }

        // farm_id: prefer the value we fetched from the housing row; fall back to context/profile
        const resolvedFarmId = housingFarmId || activeFarmIds[0] || (profile as any)?.farm_id || null;
        if (!resolvedFarmId) {
            showSnackbar('Could not determine farm. Please try again.', 'error');
            return;
        }

        const currentConfig = RECORD_TYPES[addType];
        if (addType === 'vaccination' && (!addAffected || parseInt(addAffected, 10) < 1)) {
            showSnackbar('Animals vaccinated must be at least 1.', 'error');
            return;
        }
        if (currentConfig.showAffected && addAffected && selectedAddBatch && parseInt(addAffected) > selectedAddBatch.current_count) {
            showSnackbar(`Animals affected (${addAffected}) exceeds available count (${selectedAddBatch.current_count}).`, 'error');
            return;
        }

        setIsSaving(true);
        try {
            // Use session user id for recorded_by — most reliable source
            const { data: { user: sessionUser } } = await supabase.auth.getUser();
            const recordedBy = sessionUser?.id ?? (profile as any)?.id ?? null;

            const finalMed = currentConfig.showMedication
                ? (addMed === 'Other' ? customMed.trim() : addMed.trim())
                : null;

            const payload = {
                farm_id: resolvedFarmId,
                housing_id: housingId,
                batch_id: addBatchId || null,
                record_type: addType,
                title: finalTitle,
                medication: finalMed || null,
                dosage: currentConfig.showDosage ? (addDosage.trim() || null) : null,
                affected_count: currentConfig.showAffected && addAffected ? parseInt(addAffected, 10) : null,
                notes: addNotes.trim() || null,
                severity: currentConfig.showSeverity ? addSeverity : 'low',
                record_date: addDate,
                followup_date: currentConfig.showFollowup && addFollowup ? addFollowup : null,
                recorded_by: recordedBy,
            };

            console.log('[HealthRecords] inserting:', payload);
            const { error } = await supabase.from('health_records').insert(payload);
            if (error) throw error;

            // ── Mortality: deduct from batch and housing current_count ────────────────
            if (addType === 'mortality' && addAffected && addBatchId) {
                await syncCountsForBatchAndHousing(addBatchId, housingId);
            }

            // Sync to vaccination_records for web visibility (best-effort)
            if (addType === 'vaccination') {
                const matchedVaccine = dbVaccines.find(v => v.name.toLowerCase() === finalTitle.toLowerCase());
                supabase.from('vaccination_records').insert({
                    farm_id: resolvedFarmId,
                    batch_id: addBatchId || null,
                    housing_id: housingId,
                    vaccine_id: matchedVaccine?.id || null,
                    vaccine_name: finalTitle,
                    administered_date: addDate,
                    animals_vaccinated: addAffected ? parseInt(addAffected, 10) : (selectedAddBatch ? selectedAddBatch.current_count : null),
                    dose_per_animal: addDosage ? parseFloat(addDosage) : (matchedVaccine?.dose_per_animal ?? null),
                    unit: matchedVaccine?.unit || 'dose',
                    route: matchedVaccine?.route || 'injection',
                    withdrawal_days: matchedVaccine?.withdrawal_days || 0,
                    notes: addNotes.trim() || null,
                }).then(({ error: vErr }) => {
                    if (vErr) console.warn('[HealthRecords] vaccination_records sync failed:', vErr.message);
                });

                if (resolvedFarmId) {
                    createNotification({
                        farmId: resolvedFarmId,
                        category: 'health_alert',
                        type: 'info',
                        title: `New Vaccination: ${finalTitle}`,
                        message: addNotes.trim() || (addAffected ? `${addAffected} animal(s) vaccinated.` : `Administered on ${addDate}.`),
                        actionUrl: `/(animals)/HealthRecordsScreen?housingId=${housingId || ''}`,
                    });
                }
            }

            if (resolvedFarmId) {
                scheduleUpcomingVetVisits([resolvedFarmId]);
            }

            showSnackbar('Health record added successfully.');
            await clearDraft();
            resetForm();
            handleCloseAddModal();
            await fetchData();
        } catch (err: any) {
            console.error('[HealthRecords] insert error:', err);
            showSnackbar(err?.message || 'Failed to save record.', 'error');
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
        setCustomTitle(''); setCustomMed('');
    };

    closeAddModalRef.current = () => {
        setAddVisible(false);
    };

    const handleCloseAddModal = () => {
        Animated.timing(slideAdd, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeAddModalRef.current?.();
        });
    };

    const handleOpenAddModal = () => {
        if (!addBatchId && batches.length > 0) {
            const defaultBatch = batches.find(b => b.status === 'active') || batches[0];
            if (defaultBatch) {
                setAddBatchId(defaultBatch.id);
            }
        }
        setAddVisible(true);
    };

    closeDetailModalRef.current = () => {
        setDetailRecord(null);
    };

    const handleCloseDetailModal = () => {
        Animated.timing(slideDetail, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeDetailModalRef.current?.();
        });
    };

    closeTrashModalRef.current = () => {
        setTrashVisible(false);
        setRestoreModalVisible(false);
        setRestoreTargetId(null);
        setPermDeleteVisible(false);
        setPermanentDeleteId(null);
    };

    const handleCloseTrashModal = () => {
        Animated.timing(slideTrash, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeTrashModalRef.current?.();
        });
    };

    // ── Soft delete → moves to trash ─────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const record = records.find(r => r.id === deleteId);
            const { error } = await supabase
                .from('health_records')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', deleteId);
            if (error) throw error;

            if (record?.record_type === 'mortality' && record.batch_id) {
                await syncCountsForBatchAndHousing(record.batch_id, housingId);
            }

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
            const record = trashedRecords.find(r => r.id === id);
            const { error } = await supabase
                .from('health_records')
                .update({ deleted_at: null })
                .eq('id', id);
            if (error) throw error;

            if (record?.record_type === 'mortality' && record.batch_id) {
                await syncCountsForBatchAndHousing(record.batch_id, housingId);
            }

            showSnackbar('Record restored successfully.');
            setRestoreModalVisible(false);
            setRestoreTargetId(null);
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
            const record = trashedRecords.find(r => r.id === permanentDeleteId);
            const { error } = await supabase
                .from('health_records')
                .delete()
                .eq('id', permanentDeleteId);
            if (error) throw error;

            if (record?.record_type === 'mortality' && record.batch_id) {
                await syncCountsForBatchAndHousing(record.batch_id, housingId);
            }

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

    // ── Edit handlers ─────────────────────────────────────────────────────────
    const handleOpenEdit = (record: HealthRecord) => {
        setEditRecordId(record.id);
        setEditBatchId(record.batch_id ?? '');
        setEditType(record.record_type);
        setEditTitle(record.title);
        setEditMed(record.medication ?? '');
        setEditDosage(record.dosage ?? '');
        setEditAffected(record.affected_count != null ? String(record.affected_count) : '');
        setEditNotes(record.notes ?? '');
        setEditSeverity(record.severity);
        setEditDate(record.record_date);
        setEditFollowup(record.followup_date ?? '');
        setEditCustomTitle('');
        setEditCustomMed('');
        // Close detail modal first, then open edit
        handleCloseDetailModal();
        setTimeout(() => setEditVisible(true), 250);
    };

    closeEditModalRef.current = () => {
        setEditVisible(false);
        setEditRecordId(null);
    };

    const handleCloseEditModal = () => {
        Animated.timing(slideEdit, {
            toValue: 600, duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => closeEditModalRef.current?.());
    };

    const handleUpdate = async () => {
        const finalTitle = editTitle === 'Other' ? editCustomTitle.trim() : editTitle.trim();
        if (!finalTitle) {
            showSnackbar('Please enter a title.', 'error'); return;
        }
        if (!editBatchId) { showSnackbar('Please select a batch.', 'error'); return; }
        if (!editRecordId) return;

        const cfg = RECORD_TYPES[editType];
        const selectedEditBatch = batches.find(b => b.id === editBatchId) ?? null;

        // Retrieve the original record so we know old mortality state
        const originalRecord = records.find(r => r.id === editRecordId) ?? null;
        const wasOldMortality = originalRecord?.record_type === 'mortality';
        const oldAffected = (wasOldMortality && originalRecord?.affected_count) ? originalRecord.affected_count : 0;

        // For the max-count check on mortality edits, add back what was already deducted
        const isNewMortality = editType === 'mortality';
        const availableCount = selectedEditBatch
            ? selectedEditBatch.current_count + (wasOldMortality && editBatchId === originalRecord?.batch_id ? oldAffected : 0)
            : 0;

        if (editType === 'vaccination' && (!editAffected || parseInt(editAffected, 10) < 1)) {
            showSnackbar('Animals vaccinated must be at least 1.', 'error');
            return;
        }
        if (isNewMortality && editAffected && selectedEditBatch && parseInt(editAffected) > availableCount) {
            showSnackbar(`Mortality count (${editAffected}) exceeds available animals (${availableCount}).`, 'error');
            return;
        }
        if (cfg.showAffected && !isNewMortality && editAffected && selectedEditBatch &&
            parseInt(editAffected) > selectedEditBatch.current_count) {
            showSnackbar(`Affected (${editAffected}) exceeds available count (${selectedEditBatch.current_count}).`, 'error');
            return;
        }

        setIsUpdating(true);
        try {
            const finalMed = cfg.showMedication
                ? (editMed === 'Other' ? editCustomMed.trim() : editMed.trim())
                : null;

            const payload = {
                record_type: editType,
                title: finalTitle,
                batch_id: editBatchId || null,
                medication: finalMed || null,
                dosage: cfg.showDosage ? (editDosage.trim() || null) : null,
                affected_count: cfg.showAffected && editAffected ? parseInt(editAffected, 10) : null,
                notes: editNotes.trim() || null,
                severity: cfg.showSeverity ? editSeverity : 'low',
                record_date: editDate,
                followup_date: cfg.showFollowup && editFollowup ? editFollowup : null,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from('health_records')
                .update(payload)
                .eq('id', editRecordId);
            if (error) throw error;

            // Sync counts for old batch and housing
            if (originalRecord?.batch_id) {
                await syncCountsForBatchAndHousing(originalRecord.batch_id, housingId);
            }
            // Sync counts for new batch and housing (if changed)
            if (editBatchId && editBatchId !== originalRecord?.batch_id) {
                await syncCountsForBatchAndHousing(editBatchId, housingId);
            }

            if (farmId) {
                scheduleUpcomingVetVisits([farmId]);
            }

            showSnackbar('Record updated successfully.');
            handleCloseEditModal();
            await fetchData();
        } catch (err: any) {
            showSnackbar(err?.message || 'Failed to update record.', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

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

    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? '';
    const pigColor = (colors as any).pig ?? '#E67E22';
    const chickenColor = (colors as any).chicken ?? '#F1C40F';

    const handleTestHealthPush = () => {
        Alert.alert(
            'Test Health Push Notification',
            'Choose a health alert event to test delivery:',
            [
                {
                    text: 'Mortality Alert',
                    onPress: async () => {
                        await createNotification({
                            farmId: farmId || 'demo-farm',
                            title: 'Mortality Recorded',
                            message: 'Mortality report filed:\n• 2 heads reported in Pen A (Swine)\n• 1 head reported in Coop 1 (Broiler)\n\nTap to inspect Health Records.',
                            type: 'error',
                            category: 'health_alert',
                            actionUrl: '/(animals)/HealthRecordsScreen',
                        });
                        Alert.alert('Push Sent', 'Mortality push alert sent successfully.');
                    },
                },
                {
                    text: 'Scheduled Vet Consultation',
                    onPress: async () => {
                        await createNotification({
                            farmId: farmId || 'demo-farm',
                            title: 'Vet Consultation Today',
                            message: 'Dr. Santos scheduled routine herd inspection for Swine Bay & Poultry Brooder today.',
                            type: 'info',
                            category: 'health_alert',
                            actionUrl: '/(animals)/HealthRecordsScreen',
                        });
                        Alert.alert('Push Sent', 'Vet consultation push alert sent successfully.');
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    if (!housingId) {
        return (
            <View style={[styles.safeArea, { paddingTop: insets.top }]}>
                <View style={styles.container}>
                    {/* Header */}
                    <Header />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: hPad, paddingTop: 8 }}>
                        <View style={{ flex: 1, marginRight: 12, marginTop: 8 }}>
                            <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>Health Records</Text>
                            <Text style={[textStyles.body, styles.headerSubtitle, { color: colors.textGrey, fontSize: 16, marginBottom: 12 }]}>
                                Select a housing to Record vaccinations & treatments
                            </Text>
                        </View>

                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={handleTestHealthPush}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 10,
                                backgroundColor: '#EF4444',
                                borderWidth: 1,
                                borderColor: '#DC2626',
                                elevation: 2,
                                shadowColor: '#EF4444',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.25,
                                shadowRadius: 3,
                            }}
                        >
                            <MaterialIcons name="notifications-active" size={14} color="#FFFFFF" />
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>
                                Test Push
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.container}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={housingsRefreshing}
                                onRefresh={() => fetchHousings(true)}
                                colors={[colors.primary]}
                                tintColor={colors.primary}
                            />
                        }
                    >
                        {/* ── Vaccine Schedules Banner ── */}
                        <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                            <View style={{
                                backgroundColor: colors.surface,
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                padding: 16,
                                ...Platform.select({
                                    web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' },
                                    default: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }
                                })
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 14,
                                        backgroundColor: '#EF444415',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="vaccines" size={24} color="#EF4444" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>
                                            Vaccine Schedules
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 2 }]}>
                                            Plan, track & schedule upcoming vaccinations
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ marginTop: 14 }}>
                                    <TouchableOpacity
                                        onPress={() => router.push('/(health)/VaccineScreen' as any)}
                                        style={{
                                            width: '100%',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 6,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: colors.primary,
                                        }}
                                        activeOpacity={0.85}
                                    >
                                        <MaterialIcons name="vaccines" size={18} color="#FFF" />
                                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 13 }]}>
                                            Manage Vaccines
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        <View style={[styles.sectionTitleRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                            <View>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>Housings</Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                    {housings.length} registered
                                </Text>
                            </View>
                        </View>

                        <View style={styles.gridContainer}>
                            {housingsLoading && housings.length === 0 ? (
                                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32, width: '100%' }} />
                            ) : housings.length === 0 ? (
                                <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, marginTop: 24 }}>
                                    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                        <MaterialIcons name="medical-services" size={36} color={colors.primary} />
                                    </View>
                                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center' }]}>
                                        No housings yet
                                    </Text>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>
                                        Add a housing first in order to track health records.
                                    </Text>
                                </View>
                            ) : (
                                housings.map(housing => {
                                    const isPig = housing.animal_type === 'pig';
                                    const accent = isPig ? pigColor : chickenColor;
                                    const bgColor = accent + '1A';
                                    const imgSrc = ANIMAL_IMAGES[housing.animal_type];

                                    return (
                                        <TouchableOpacity
                                            key={housing.id}
                                            activeOpacity={0.7}
                                            style={[
                                                styles.deviceCard,
                                                { backgroundColor: colors.surface, borderColor: colors.stroke, padding: 0, overflow: 'hidden', width: '100%', marginBottom: 12, flexDirection: 'row', alignItems: 'stretch' }
                                            ]}
                                            onPress={() => router.push({
                                                pathname: '/(animals)/HealthRecordsScreen',
                                                params: { housingId: housing.id },
                                            })}
                                        >
                                            <Image
                                                source={imgSrc}
                                                style={{ width: 110, height: 'auto', minHeight: 110, backgroundColor: bgColor }}
                                                contentFit="cover"
                                            />
                                            <View style={{ flex: 1, padding: 14, justifyContent: 'center' }}>
                                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 17, marginBottom: 6 }]}>
                                                    {housing.name}
                                                </Text>
                                                <View style={{ gap: 4 }}>
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                                        Live heads:{' '}
                                                        <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>
                                                            {housing.current_count}
                                                            {housing.capacity > 0 ? ` / ${housing.capacity}` : ''}
                                                        </Text>
                                                    </Text>

                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                        <View style={{ backgroundColor: accent + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                                            <Text style={{ color: accent, fontSize: 11, fontFamily: 'Poppins-SemiBold', textTransform: 'capitalize' }}>
                                                                {isPig ? 'Pigs' : 'Chickens'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={{ justifyContent: 'center', paddingRight: 12 }}>
                                                <MaterialIcons name="chevron-right" size={24} color={colors.textGrey} />
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </View>
                    </ScrollView>
                </View>

                <FloatingNavBar />
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={[styles.safeArea, { paddingTop: insets.top }]}>

            {/* ── Header ── */}
            <View style={[styles.headerTopRow, { gap: 8 }]}>
                <BackButton fallbackRoute="/(animals)/AnimalsScreen" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]} numberOfLines={1}>
                        Health Records
                    </Text>
                    {activeBatch && (
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]} numberOfLines={1}>
                            {activeBatch.name} · {activeBatch.animal_type}
                        </Text>
                    )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {/* Vaccine Schedules button */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={{
                            width: 38, height: 38, borderRadius: 19,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                        onPress={() => router.push('/(health)/VaccineScreen' as any)}
                    >
                        <MaterialIcons
                            name="vaccines"
                            size={18}
                            color="#EF4444"
                        />
                    </TouchableOpacity>

                    {/* Trash button with badge */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={{
                            width: 38, height: 38, borderRadius: 19,
                            backgroundColor: colors.surface,
                            borderWidth: 1, borderColor: colors.stroke,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                        onPress={() => { setTrashVisible(true); setTrashSeen(true); }}
                    >
                        <MaterialIcons
                            name="delete-outline"
                            size={20}
                            color={trashedRecords.length > 0 ? colors.error : colors.textGrey}
                        />
                        {/* Dot only when there are unseen new items */}
                        {trashedRecords.length > 0 && !trashSeen && (
                            <View style={{
                                position: 'absolute', top: 5, right: 5,
                                width: 7, height: 7, borderRadius: 3.5,
                                backgroundColor: colors.error,
                                borderWidth: 1.5, borderColor: colors.surface,
                            }} />
                        )}
                    </TouchableOpacity>
                    {/* Add button */}
                    <TouchableOpacity
                        activeOpacity={0.85}
                        style={{
                            width: 38, height: 38, borderRadius: 19,
                            backgroundColor: colors.primary,
                            alignItems: 'center', justifyContent: 'center',
                            ...Platform.select({
                                web: {
                                    boxShadow: `0px 3px 6px ${colors.primary}59`,
                                },
                                default: {
                                    elevation: 4,
                                    shadowColor: colors.primary,
                                    shadowOffset: { width: 0, height: 3 },
                                    shadowOpacity: 0.35, shadowRadius: 6,
                                }
                            })
                        }}
                        onPress={handleOpenAddModal}
                    >
                        <MaterialIcons name="add" size={22} color={colors.onPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Collapsible Wrapping Filters (Pill Round Shaped) ── */}
            <View style={{
                marginHorizontal: 20,
                marginBottom: 10,
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
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: isFiltered ? colors.primary + '18' : colors.cardFill,
                            paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
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
                                    setFilterType('all');
                                    setFilterBatchId('all');
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

                {/* Body: wrapped multi-line chips (pill round shaped), no sliding */}
                {!filtersCollapsed && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.stroke + '40' }}>
                        {/* Batch Filter Row */}
                        {batches.length > 1 && (
                            <View style={{ marginBottom: 10 }}>
                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                    Batch
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {[{ id: 'all', name: 'All Batches', status: '' } as any, ...batches].map(b => {
                                        const sel = filterBatchId === b.id;
                                        return (
                                            <TouchableOpacity
                                                key={b.id}
                                                activeOpacity={0.75}
                                                onPress={() => setFilterBatchId(b.id)}
                                                style={{
                                                    paddingHorizontal: 14,
                                                    paddingVertical: 6,
                                                    borderRadius: 999,
                                                    borderWidth: 1.5,
                                                    borderColor: sel ? colors.primary : colors.stroke,
                                                    backgroundColor: sel ? colors.primary + '18' : colors.surface,
                                                }}
                                            >
                                                <Text style={{ fontFamily: sel ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11.5, color: sel ? colors.primary : colors.textGrey }}>
                                                    {b.name}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Record Type Filter Row */}
                        <View>
                            <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                Record Type
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {ALL_FILTERS.map(type => {
                                    const isSel = filterType === type;
                                    const cfg = type === 'all' ? null : RECORD_TYPES[type];
                                    const activeColor = cfg?.color ?? colors.primary;
                                    return (
                                        <TouchableOpacity
                                            key={type}
                                            activeOpacity={0.75}
                                            onPress={() => setFilterType(type)}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                paddingHorizontal: 14,
                                                paddingVertical: 6,
                                                borderRadius: 999,
                                                borderWidth: 1.5,
                                                borderColor: isSel ? activeColor : colors.stroke,
                                                backgroundColor: isSel ? activeColor + '18' : colors.surface,
                                            }}
                                        >
                                            {cfg && (
                                                <MaterialIcons
                                                    name={cfg.icon as any}
                                                    size={13}
                                                    color={isSel ? activeColor : colors.textGrey}
                                                    style={{ marginRight: 5 }}
                                                />
                                            )}
                                            <Text style={{ fontFamily: isSel ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11.5, color: isSel ? activeColor : colors.textGrey }}>
                                                {type === 'all' ? 'All Types' : cfg!.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </View>
                )}
            </View>

            {/* ── Content ── */}
            {isLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
            ) : records.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
                    <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <MaterialIcons name="medical-services" size={36} color={colors.primary} />
                    </View>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center' }]}>No records yet</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 14, marginTop: 8, lineHeight: 22 }]}>
                        Tap <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.primary }}>+</Text> to log a vaccination, treatment, or observation.
                    </Text>
                    <TouchableOpacity
                        style={[styles.primaryButton, { marginTop: 18, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                        onPress={handleOpenAddModal}
                        activeOpacity={0.85}
                    >
                        <MaterialIcons name="add" size={20} color={colors.onPrimary} />
                        <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>Add Record</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
                    <AIInsightCard
                        title="AI Health Summary"
                        variant="blue"
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

                    <View style={{ height: 16 }} />

                    {filtered.length === 0 ? (
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                <MaterialIcons name="filter-list-off" size={28} color={colors.primary} />
                            </View>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 16, textAlign: 'center' }]}>No matching records</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 13, marginTop: 6, lineHeight: 20 }]}>
                                Try changing your filters or select a different batch.
                            </Text>
                        </View>
                    ) : (
                        <>
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
                                const cfg = RECORD_TYPES[record.record_type];
                                const sev = SEVERITY_CONFIG[record.severity];
                                const batchName = record.batch_id ? batchMap[record.batch_id]?.name ?? '—' : '—';

                                // Compact metadata chip
                                const Chip = ({ icon, label }: { icon: string; label: string }) => (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardFill, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                        {icon === 'pets' ? (
                                            <Image
                                                source={require('../../assets/icons/animals-filled.svg')}
                                                style={{ width: 12, height: 12 }}
                                                contentFit="contain"
                                            />
                                        ) : (
                                            <MaterialIcons name={icon as any} size={10} color={colors.textGrey} />
                                        )}
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
                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text, flex: 1 }}>
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
                        </>
                    )}
                </ScrollView>
            )}

            {/* ════════════ DETAIL MODAL ════════════ */}
            <Modal visible={!!detailRecord} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={handleCloseDetailModal}
                    />
                    {detailRecord && (() => {
                        const cfg = RECORD_TYPES[detailRecord.record_type];
                        const sev = SEVERITY_CONFIG[detailRecord.severity];
                        const batchName = detailRecord.batch_id ? batchMap[detailRecord.batch_id]?.name ?? '—' : '—';
                        const batchType = detailRecord.batch_id ? batchMap[detailRecord.batch_id]?.animal_type ?? '' : '';
                        return (
                            <Animated.View
                                {...panDetailResponder.panHandlers}
                                style={{
                                    backgroundColor: colors.surface,
                                    borderTopLeftRadius: 28,
                                    borderTopRightRadius: 28,
                                    maxHeight: '85%',
                                    overflow: 'hidden',
                                    transform: [{ translateY: Animated.add(slideDetail, panYDetail) }],
                                }}
                            >
                                {/* Close X button at top right */}
                                <TouchableOpacity
                                    onPress={handleCloseDetailModal}
                                    style={{
                                        position: 'absolute',
                                        top: 16,
                                        right: 20,
                                        padding: 4,
                                        zIndex: 10,
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons name="close" size={24} color={colors.textGrey} />
                                </TouchableOpacity>

                                {/* Drag handle — no color strip */}
                                <View style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                                    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke }} />
                                </View>
                                {/* Type icon + title row (with paddingRight reserved for close button) */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 24, paddingRight: 52, paddingBottom: 14 }}>
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

                                <ScrollView
                                    onScroll={(e) => {
                                        isScrollAtTopDetail.current = e.nativeEvent.contentOffset.y <= 0;
                                    }}
                                    scrollEventThrottle={16}
                                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }}
                                    showsVerticalScrollIndicator={false}
                                >

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
                                            style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary + '18', borderWidth: 1.5, borderColor: colors.primary }]}
                                            onPress={() => handleOpenEdit(detailRecord)}
                                            activeOpacity={0.85}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <MaterialIcons name="edit" size={16} color={colors.primary} />
                                                <Text style={[textStyles.btnLabel, { color: colors.primary, fontSize: 14 }]}>Edit</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </Animated.View>
                        );
                    })()}
                </View>
            </Modal>

            {/* ════════════ ADD RECORD MODAL ════════════ */}
            <Modal visible={addVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={handleCloseAddModal}
                    />
                    <Animated.View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', transform: [{ translateY: slideAdd }] }}>
                        {/* Draggable Header */}
                        <View {...panResponder.panHandlers} style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, marginBottom: 10 }} />
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center' }]}>Add Health Record</Text>
                        </View>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }}
                            showsVerticalScrollIndicator={false}
                        >

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

                            {/* ── Title / Vaccine Name ── */}
                            {fieldLabel(
                                addType === 'vaccination' ? 'VACCINE NAME *' :
                                    addType === 'vitamins' ? 'VITAMIN NAME *' :
                                        addType === 'deworming' ? 'DEWORMER NAME *' :
                                            'TITLE *'
                            )}
                            {addType === 'vaccination' ? (
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    style={[inputStyle(!!addTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }]}
                                    onPress={() => { setVaccineSearch(addTitle); setVaccinePickerVisible(true); }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                        <MaterialIcons name="vaccines" size={18} color={addTitle ? '#27AE60' : colors.textGrey} />
                                        <Text style={{ color: addTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                            {addTitle || 'Select vaccine…'}
                                        </Text>
                                    </View>
                                    <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                </TouchableOpacity>
                            ) : addType === 'treatment' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[inputStyle(!!addTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                        onPress={() => setTreatmentPickerVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="healing" size={18} color={addTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: addTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {addTitle === 'Other' ? 'Other / Custom Treatment' : (addTitle || 'Select treatment…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {addTitle === 'Other' && (
                                        <TextInput
                                            style={[inputStyle(!!customTitle), { marginTop: 8 }]}
                                            placeholder="Type custom treatment..."
                                            placeholderTextColor={colors.textGrey}
                                            value={customTitle}
                                            onChangeText={setCustomTitle}
                                        />
                                    )}
                                </View>
                            ) : addType === 'illness' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[inputStyle(!!addTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                        onPress={() => setIllnessPickerVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="sick" size={18} color={addTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: addTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {addTitle === 'Other' ? 'Other / Custom Illness' : (addTitle || 'Select illness…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {addTitle === 'Other' && (
                                        <TextInput
                                            style={[inputStyle(!!customTitle), { marginTop: 8 }]}
                                            placeholder="Type custom illness..."
                                            placeholderTextColor={colors.textGrey}
                                            value={customTitle}
                                            onChangeText={setCustomTitle}
                                        />
                                    )}
                                </View>
                            ) : addType === 'vitamins' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[inputStyle(!!addTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                        onPress={() => setVitaminPickerVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="medical-services" size={18} color={addTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: addTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {addTitle === 'Other' ? 'Other / Custom Vitamin' : (addTitle || 'Select vitamin…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {addTitle === 'Other' && (
                                        <TextInput
                                            style={[inputStyle(!!customTitle), { marginTop: 8 }]}
                                            placeholder="Type custom vitamin..."
                                            placeholderTextColor={colors.textGrey}
                                            value={customTitle}
                                            onChangeText={setCustomTitle}
                                        />
                                    )}
                                </View>
                            ) : addType === 'deworming' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[inputStyle(!!addTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                        onPress={() => setDewormingPickerVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="bug-report" size={18} color={addTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: addTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {addTitle === 'Other' ? 'Other / Custom Dewormer' : (addTitle || 'Select dewormer…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {addTitle === 'Other' && (
                                        <TextInput
                                            style={[inputStyle(!!customTitle), { marginTop: 8 }]}
                                            placeholder="Type custom dewormer..."
                                            placeholderTextColor={colors.textGrey}
                                            value={customTitle}
                                            onChangeText={setCustomTitle}
                                        />
                                    )}
                                </View>
                            ) : (
                                <TextInput
                                    style={[inputStyle(!!addTitle), { marginBottom: 14 }]}
                                    placeholder={RECORD_TYPES[addType].hint}
                                    placeholderTextColor={colors.textGrey}
                                    value={addTitle}
                                    onChangeText={setAddTitle}
                                />
                            )}

                            {/* ── Medication (conditional) ── */}
                            {RECORD_TYPES[addType].showMedication && (
                                <View style={{ marginBottom: 14 }}>
                                    {fieldLabel('MEDICATION')}
                                    {addTitle !== 'Other' && suggestedMeds.length > 0 ? (
                                        <View>
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                style={[inputStyle(!!addMed), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                                onPress={() => setMedicationPickerVisible(true)}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                    <MaterialIcons name="science" size={18} color={addMed ? colors.primary : colors.textGrey} />
                                                    <Text style={{ color: addMed ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                        {addMed === 'Other' ? 'Other / Custom Medication' : (addMed || 'Select medication…')}
                                                    </Text>
                                                </View>
                                                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                            </TouchableOpacity>
                                            {addMed === 'Other' && (
                                                <TextInput
                                                    style={[inputStyle(!!customMed), { marginTop: 8 }]}
                                                    placeholder="Type custom medication..."
                                                    placeholderTextColor={colors.textGrey}
                                                    value={customMed}
                                                    onChangeText={setCustomMed}
                                                />
                                            )}
                                        </View>
                                    ) : (
                                        <TextInput
                                            style={inputStyle(!!customMed)}
                                            placeholder="Drug name"
                                            placeholderTextColor={colors.textGrey}
                                            value={customMed}
                                            onChangeText={setCustomMed}
                                        />
                                    )}
                                </View>
                            )}

                            {/* ── Dosage (conditional) ── */}
                            {RECORD_TYPES[addType].showDosage && (
                                <View style={{ marginBottom: 14 }}>
                                    {fieldLabel('DOSAGE PER ANIMAL (ml)')}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: addDosage ? colors.primary : colors.stroke, borderRadius: 14, backgroundColor: addDosage ? colors.primary + '0A' : colors.cardFill, overflow: 'hidden' }}>
                                        <TextInput
                                            style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text }}
                                            placeholder="0.00"
                                            placeholderTextColor={colors.textGrey}
                                            value={addDosage}
                                            onChangeText={t => setAddDosage(t.replace(/[^0-9.]/g, ''))}
                                            keyboardType="decimal-pad"
                                        />
                                        <View style={{ paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.cardFill, borderLeftWidth: 1, borderLeftColor: colors.stroke }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.textGrey }}>ml</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* ── Affected count + Severity (conditional) ── */}
                            {(RECORD_TYPES[addType].showAffected || RECORD_TYPES[addType].showSeverity) && (
                                <View style={{ flexDirection: (RECORD_TYPES[addType].showAffected && RECORD_TYPES[addType].showSeverity) ? 'row' : 'column', gap: 12, marginBottom: 14 }}>
                                    {RECORD_TYPES[addType].showAffected && (
                                        <View style={{ flex: 1 }}>
                                            {fieldLabel(affectedLabel(addType))}
                                            <TextInput
                                                style={[
                                                    inputStyle(!!addAffected),
                                                    (selectedAddBatch != null && addAffected !== '' && parseInt(addAffected, 10) > selectedAddBatch.current_count) ||
                                                    (addType === 'vaccination' && addAffected !== '' && parseInt(addAffected, 10) < 1)
                                                        ? { borderColor: colors.error, backgroundColor: colors.error + '0A' }
                                                        : {},
                                                ]}
                                                placeholder={selectedAddBatch ? `Min 1, Max ${selectedAddBatch.current_count}` : 'Min 1'}
                                                placeholderTextColor={colors.textGrey}
                                                value={addAffected}
                                                onChangeText={t => setAddAffected(t.replace(/[^0-9]/g, ''))}
                                                keyboardType="numeric"
                                            />
                                            {selectedAddBatch != null && addAffected !== '' && parseInt(addAffected, 10) > selectedAddBatch.current_count && (
                                                <Text style={{ color: colors.error, fontSize: 10, fontFamily: 'Poppins-Regular', marginTop: 3 }}>
                                                    {'Exceeds ' + selectedAddBatch.current_count + ' available'}
                                                </Text>
                                            )}
                                            {addType === 'vaccination' && addAffected !== '' && parseInt(addAffected, 10) < 1 && (
                                                <Text style={{ color: colors.error, fontSize: 10, fontFamily: 'Poppins-Regular', marginTop: 3 }}>
                                                    Minimum 1 animal vaccinated
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                    {RECORD_TYPES[addType].showSeverity && (
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
                                    )}
                                </View>
                            )}

                            {/* ── Date + Follow-up ── */}
                            {RECORD_TYPES[addType].showFollowup ? (
                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                                    <View style={{ flex: 1 }}>
                                        <DatePickerField
                                            label="DATE RECORDED"
                                            value={addDate}
                                            onPress={() => setActiveAddCalendar({
                                                label: 'Date Recorded',
                                                value: addDate,
                                                onChange: setAddDate,
                                            })}
                                            required
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <DatePickerField
                                            label="FOLLOW-UP DATE"
                                            value={addFollowup}
                                            onPress={() => setActiveAddCalendar({
                                                label: 'Follow-up Date',
                                                value: addFollowup,
                                                onChange: setAddFollowup,
                                            })}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={{ marginBottom: 14 }}>
                                    <DatePickerField
                                        label="DATE RECORDED"
                                        value={addDate}
                                        onPress={() => setActiveAddCalendar({
                                            label: 'Date Recorded',
                                            value: addDate,
                                            onChange: setAddDate,
                                        })}
                                        required
                                    />
                                </View>
                            )}

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
                                    onPress={handleCloseAddModal}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[textStyles.btnLabel, { color: colors.textGrey }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.primaryButton,
                                        {
                                            flex: 2,
                                            backgroundColor: (!isAddFormValid || isSaving) ? colors.stroke : colors.primary,
                                            opacity: (!isAddFormValid || isSaving) ? 0.6 : 1,
                                        },
                                    ]}
                                    onPress={handleAdd}
                                    activeOpacity={0.85}
                                    disabled={!isAddFormValid || isSaving}
                                >
                                    <Text style={[textStyles.btnLabel, { color: (!isAddFormValid || isSaving) ? colors.textGrey : colors.onPrimary }]}>
                                        {isSaving ? 'Saving…' : 'Save Record'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>

                    {/* ── In-Modal Overlays (Rendered inside same modal to prevent stacking freeze on mobile) ── */}
                    <BatchPickerOverlay
                        visible={batchPickerVisible}
                        batches={batches}
                        selectedId={addBatchId}
                        onSelect={(id) => setAddBatchId(id)}
                        onClose={() => setBatchPickerVisible(false)}
                        colors={colors}
                        textStyles={textStyles}
                    />
                    <TypePickerOverlay
                        visible={typePickerVisible}
                        selectedType={addType}
                        onSelect={(t) => { setAddType(t); setAddTitle(''); setCustomTitle(''); setAddMed(''); setCustomMed(''); }}
                        onClose={() => setTypePickerVisible(false)}
                        colors={colors}
                        textStyles={textStyles}
                    />
                    <SeverityPickerOverlay
                        visible={severityPickerVisible}
                        selectedSeverity={addSeverity}
                        onSelect={(s) => setAddSeverity(s)}
                        onClose={() => setSeverityPickerVisible(false)}
                        colors={colors}
                        textStyles={textStyles}
                    />
                    <VaccinePickerModal
                        visible={vaccinePickerVisible}
                        search={vaccineSearch}
                        onSearch={setVaccineSearch}
                        vaccineList={dbVaccines}
                        activeAnimalType={selectedAddBatch?.animal_type || housingAnimalType || activeBatch?.animal_type}
                        onSelect={selected => {
                            const name = typeof selected === 'string' ? selected : selected.name;
                            setAddTitle(name);
                            if (typeof selected !== 'string') {
                                if (selected.dose_per_animal != null && !addDosage) {
                                    setAddDosage(String(selected.dose_per_animal));
                                }
                            }
                            setVaccinePickerVisible(false);
                            setVaccineSearch('');
                        }}
                        onClose={() => { setVaccinePickerVisible(false); setVaccineSearch(''); }}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={treatmentPickerVisible}
                        title="Select Treatment"
                        options={treatmentOptions.map(t => t.name).concat('Other')}
                        onSelect={val => { setAddTitle(val); setCustomTitle(''); setAddMed(''); setCustomMed(''); setTreatmentPickerVisible(false); }}
                        onClose={() => setTreatmentPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={illnessPickerVisible}
                        title="Select Illness"
                        options={illnessOptions.map(i => i.name).concat('Other')}
                        onSelect={val => { setAddTitle(val); setCustomTitle(''); setAddMed(''); setCustomMed(''); setIllnessPickerVisible(false); }}
                        onClose={() => setIllnessPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={vitaminPickerVisible}
                        title="Select Vitamin"
                        options={vitaminOptions.map(v => v.name).concat('Other')}
                        onSelect={val => { setAddTitle(val); setCustomTitle(''); setVitaminPickerVisible(false); }}
                        onClose={() => setVitaminPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={dewormingPickerVisible}
                        title="Select Dewormer"
                        options={dewormingOptions.map(d => d.name).concat('Other')}
                        onSelect={val => { setAddTitle(val); setCustomTitle(''); setDewormingPickerVisible(false); }}
                        onClose={() => setDewormingPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={medicationPickerVisible}
                        title="Select Medication"
                        options={suggestedMeds.concat('Other')}
                        onSelect={val => { setAddMed(val); setCustomMed(''); setMedicationPickerVisible(false); }}
                        onClose={() => setMedicationPickerVisible(false)}
                        colors={colors}
                    />
                    {activeAddCalendar && (
                        <CalendarPickerOverlay
                            visible={true}
                            label={activeAddCalendar.label}
                            value={activeAddCalendar.value}
                            onChange={activeAddCalendar.onChange}
                            onClose={() => setActiveAddCalendar(null)}
                            colors={colors}
                        />
                    )}
                </View>
            </Modal>

            {/* ════════════ EDIT RECORD MODAL ════════════ */}
            <Modal visible={editVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={handleCloseEditModal}
                    />
                    <Animated.View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', transform: [{ translateY: slideEdit }] }}>
                        <View {...panEditResponder.panHandlers} style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stroke, marginBottom: 10 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialIcons name="edit" size={20} color={colors.primary} />
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center' }]}>Edit Health Record</Text>
                            </View>
                        </View>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* ── Batch selector ── */}
                            {fieldLabel('BATCH *')}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={[inputStyle(!!editBatchId), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }]}
                                onPress={() => setEditBatchPickerVisible(true)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <MaterialIcons name="layers" size={18} color={editBatchId ? colors.primary : colors.textGrey} />
                                    <Text style={[textStyles.body, { color: batches.find(b => b.id === editBatchId) ? colors.text : colors.textGrey, fontSize: 14 }]} numberOfLines={1}>
                                        {batches.find(b => b.id === editBatchId) ? `${batches.find(b => b.id === editBatchId)!.name} (${batches.find(b => b.id === editBatchId)!.status})` : 'Select batch…'}
                                    </Text>
                                </View>
                                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            {/* ── Type ── */}
                            {fieldLabel('RECORD TYPE *')}
                            <TouchableOpacity
                                activeOpacity={0.8}
                                style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: RECORD_TYPES[editType].color, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, backgroundColor: RECORD_TYPES[editType].color + '0A' }]}
                                onPress={() => setEditTypePickerVisible(true)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: RECORD_TYPES[editType].color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                        <MaterialIcons name={RECORD_TYPES[editType].icon as any} size={18} color={RECORD_TYPES[editType].color} />
                                    </View>
                                    <Text style={[textStyles.body, { color: colors.text, fontFamily: 'Poppins-SemiBold' }]}>{RECORD_TYPES[editType].label}</Text>
                                </View>
                                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                            </TouchableOpacity>

                            {/* ── Title / Vaccine ── */}
                            {fieldLabel(
                                editType === 'vaccination' ? 'VACCINE NAME *' :
                                    editType === 'vitamins' ? 'VITAMIN NAME *' :
                                        editType === 'deworming' ? 'DEWORMER NAME *' :
                                            'TITLE *'
                            )}
                            {editType === 'vaccination' ? (
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    style={[inputStyle(!!editTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }]}
                                    onPress={() => { setEditVaccineSearch(editTitle); setEditVaccinePickerVisible(true); }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                        <MaterialIcons name="vaccines" size={18} color={editTitle ? '#27AE60' : colors.textGrey} />
                                        <Text style={{ color: editTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                            {editTitle || 'Select vaccine…'}
                                        </Text>
                                    </View>
                                    <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                </TouchableOpacity>
                            ) : editType === 'treatment' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity activeOpacity={0.8} style={[inputStyle(!!editTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setEditTreatmentPickerVisible(true)}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="healing" size={18} color={editTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: editTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {editTitle === 'Other' ? 'Other / Custom Treatment' : (editTitle || 'Select treatment…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {editTitle === 'Other' && (
                                        <TextInput style={[inputStyle(!!editCustomTitle), { marginTop: 8 }]} placeholder="Type custom treatment..." placeholderTextColor={colors.textGrey} value={editCustomTitle} onChangeText={setEditCustomTitle} />
                                    )}
                                </View>
                            ) : editType === 'illness' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity activeOpacity={0.8} style={[inputStyle(!!editTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setEditIllnessPickerVisible(true)}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="sick" size={18} color={editTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: editTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {editTitle === 'Other' ? 'Other / Custom Illness' : (editTitle || 'Select illness…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {editTitle === 'Other' && (
                                        <TextInput style={[inputStyle(!!editCustomTitle), { marginTop: 8 }]} placeholder="Type custom illness..." placeholderTextColor={colors.textGrey} value={editCustomTitle} onChangeText={setEditCustomTitle} />
                                    )}
                                </View>
                            ) : editType === 'vitamins' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity activeOpacity={0.8} style={[inputStyle(!!editTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setEditVitaminPickerVisible(true)}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="medical-services" size={18} color={editTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: editTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {editTitle === 'Other' ? 'Other / Custom Vitamin' : (editTitle || 'Select vitamin…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {editTitle === 'Other' && (
                                        <TextInput style={[inputStyle(!!editCustomTitle), { marginTop: 8 }]} placeholder="Type custom vitamin..." placeholderTextColor={colors.textGrey} value={editCustomTitle} onChangeText={setEditCustomTitle} />
                                    )}
                                </View>
                            ) : editType === 'deworming' ? (
                                <View style={{ marginBottom: 14 }}>
                                    <TouchableOpacity activeOpacity={0.8} style={[inputStyle(!!editTitle), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setEditDewormingPickerVisible(true)}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                            <MaterialIcons name="bug-report" size={18} color={editTitle ? colors.primary : colors.textGrey} />
                                            <Text style={{ color: editTitle ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                {editTitle === 'Other' ? 'Other / Custom Dewormer' : (editTitle || 'Select dewormer…')}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                    </TouchableOpacity>
                                    {editTitle === 'Other' && (
                                        <TextInput style={[inputStyle(!!editCustomTitle), { marginTop: 8 }]} placeholder="Type custom dewormer..." placeholderTextColor={colors.textGrey} value={editCustomTitle} onChangeText={setEditCustomTitle} />
                                    )}
                                </View>
                            ) : (
                                <TextInput
                                    style={[inputStyle(!!editTitle), { marginBottom: 14 }]}
                                    placeholder={RECORD_TYPES[editType].hint}
                                    placeholderTextColor={colors.textGrey}
                                    value={editTitle}
                                    onChangeText={setEditTitle}
                                />
                            )}

                            {/* ── Medication ── */}
                            {RECORD_TYPES[editType].showMedication && (
                                <View style={{ marginBottom: 14 }}>
                                    {fieldLabel('MEDICATION')}
                                    {editTitle !== 'Other' && editSuggestedMeds.length > 0 ? (
                                        <View>
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                style={[inputStyle(!!editMed), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                                onPress={() => setEditMedicationPickerVisible(true)}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                    <MaterialIcons name="science" size={18} color={editMed ? colors.primary : colors.textGrey} />
                                                    <Text style={{ color: editMed ? colors.text : colors.textGrey, fontFamily: 'Poppins-Regular', fontSize: 14 }} numberOfLines={1}>
                                                        {editMed === 'Other' ? 'Other / Custom Medication' : (editMed || 'Select medication…')}
                                                    </Text>
                                                </View>
                                                <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textGrey} />
                                            </TouchableOpacity>
                                            {editMed === 'Other' && (
                                                <TextInput style={[inputStyle(!!editCustomMed), { marginTop: 8 }]} placeholder="Type custom medication..." placeholderTextColor={colors.textGrey} value={editCustomMed} onChangeText={setEditCustomMed} />
                                            )}
                                        </View>
                                    ) : (
                                        <TextInput style={inputStyle(!!editCustomMed)} placeholder="Drug name" placeholderTextColor={colors.textGrey} value={editCustomMed} onChangeText={setEditCustomMed} />
                                    )}
                                </View>
                            )}

                            {/* ── Dosage ── */}
                            {RECORD_TYPES[editType].showDosage && (
                                <View style={{ marginBottom: 14 }}>
                                    {fieldLabel('DOSAGE PER ANIMAL (ml)')}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: editDosage ? colors.primary : colors.stroke, borderRadius: 14, backgroundColor: editDosage ? colors.primary + '0A' : colors.cardFill, overflow: 'hidden' }}>
                                        <TextInput
                                            style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Poppins-Regular', fontSize: 14, color: colors.text }}
                                            placeholder="0.00" placeholderTextColor={colors.textGrey}
                                            value={editDosage}
                                            onChangeText={t => setEditDosage(t.replace(/[^0-9.]/g, ''))}
                                            keyboardType="decimal-pad"
                                        />
                                        <View style={{ paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.cardFill, borderLeftWidth: 1, borderLeftColor: colors.stroke }}>
                                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.textGrey }}>ml</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* ── Affected + Severity ── */}
                            {(RECORD_TYPES[editType].showAffected || RECORD_TYPES[editType].showSeverity) && (
                                <View style={{ flexDirection: (RECORD_TYPES[editType].showAffected && RECORD_TYPES[editType].showSeverity) ? 'row' : 'column', gap: 12, marginBottom: 14 }}>
                                    {RECORD_TYPES[editType].showAffected && (
                                        <View style={{ flex: 1 }}>
                                            {fieldLabel(affectedLabel(editType))}
                                            <TextInput
                                                style={[
                                                    inputStyle(!!editAffected),
                                                    (isEditCountExceeded || (editType === 'vaccination' && editAffected !== '' && parseInt(editAffected, 10) < 1))
                                                        ? { borderColor: colors.error, backgroundColor: colors.error + '0A' }
                                                        : {},
                                                ]}
                                                placeholder={batches.find(b => b.id === editBatchId) ? `Min 1, Max ${batches.find(b => b.id === editBatchId)!.current_count}` : 'Min 1'}
                                                placeholderTextColor={colors.textGrey}
                                                value={editAffected}
                                                onChangeText={t => setEditAffected(t.replace(/[^0-9]/g, ''))}
                                                keyboardType="numeric"
                                            />
                                            {editType === 'vaccination' && editAffected !== '' && parseInt(editAffected, 10) < 1 && (
                                                <Text style={{ color: colors.error, fontSize: 10, fontFamily: 'Poppins-Regular', marginTop: 3 }}>
                                                    Minimum 1 animal vaccinated
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                    {RECORD_TYPES[editType].showSeverity && (
                                        <View style={{ flex: 1 }}>
                                            {fieldLabel('SEVERITY *')}
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: SEVERITY_CONFIG[editSeverity].color, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: SEVERITY_CONFIG[editSeverity].color + '0A' }]}
                                                onPress={() => setEditSeverityPickerVisible(true)}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEVERITY_CONFIG[editSeverity].color }} />
                                                    <Text style={{ color: SEVERITY_CONFIG[editSeverity].color, fontFamily: 'Poppins-SemiBold', fontSize: 14 }}>{SEVERITY_CONFIG[editSeverity].label}</Text>
                                                </View>
                                                <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textGrey} />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* ── Date + Follow-up ── */}
                            {RECORD_TYPES[editType].showFollowup ? (
                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                                    <View style={{ flex: 1 }}>
                                        <DatePickerField
                                            label="DATE RECORDED"
                                            value={editDate}
                                            onPress={() => setActiveEditCalendar({
                                                label: 'Date Recorded',
                                                value: editDate,
                                                onChange: setEditDate,
                                            })}
                                            required
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <DatePickerField
                                            label="FOLLOW-UP DATE"
                                            value={editFollowup}
                                            onPress={() => setActiveEditCalendar({
                                                label: 'Follow-up Date',
                                                value: editFollowup,
                                                onChange: setEditFollowup,
                                            })}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={{ marginBottom: 14 }}>
                                    <DatePickerField
                                        label="DATE RECORDED"
                                        value={editDate}
                                        onPress={() => setActiveEditCalendar({
                                            label: 'Date Recorded',
                                            value: editDate,
                                            onChange: setEditDate,
                                        })}
                                        required
                                    />
                                </View>
                            )}

                            {/* ── Notes ── */}
                            {fieldLabel('NOTES')}
                            <TextInput
                                style={[inputStyle(!!editNotes), { marginBottom: 24, minHeight: 80, textAlignVertical: 'top' }]}
                                placeholder="Additional observations or instructions…"
                                placeholderTextColor={colors.textGrey}
                                value={editNotes}
                                onChangeText={setEditNotes}
                                multiline
                            />

                            {/* ── Buttons ── */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { flex: 1, backgroundColor: colors.cardFill }]}
                                    onPress={handleCloseEditModal}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[textStyles.btnLabel, { color: colors.textGrey }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.primaryButton,
                                        {
                                            flex: 2,
                                            backgroundColor: (!isEditFormValid || isUpdating) ? colors.stroke : colors.primary,
                                            opacity: (!isEditFormValid || isUpdating) ? 0.6 : 1,
                                        },
                                    ]}
                                    onPress={handleUpdate}
                                    activeOpacity={0.85}
                                    disabled={!isEditFormValid || isUpdating}
                                >
                                    <Text style={[textStyles.btnLabel, { color: (!isEditFormValid || isUpdating) ? colors.textGrey : colors.onPrimary }]}>
                                        {isUpdating ? 'Saving…' : 'Update Record'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>

                    {/* ── In-Modal Overlays for Edit ── */}
                    <BatchPickerOverlay
                        visible={editBatchPickerVisible}
                        batches={batches}
                        selectedId={editBatchId}
                        onSelect={(id) => setEditBatchId(id)}
                        onClose={() => setEditBatchPickerVisible(false)}
                        colors={colors}
                        textStyles={textStyles}
                    />
                    <TypePickerOverlay
                        visible={editTypePickerVisible}
                        selectedType={editType}
                        onSelect={(t) => { setEditType(t); setEditTitle(''); setEditCustomTitle(''); setEditMed(''); setEditCustomMed(''); }}
                        onClose={() => setEditTypePickerVisible(false)}
                        colors={colors}
                        textStyles={textStyles}
                    />
                    <SeverityPickerOverlay
                        visible={editSeverityPickerVisible}
                        selectedSeverity={editSeverity}
                        onSelect={(s) => setEditSeverity(s)}
                        onClose={() => setEditSeverityPickerVisible(false)}
                        colors={colors}
                        textStyles={textStyles}
                    />
                    <VaccinePickerModal
                        visible={editVaccinePickerVisible}
                        search={editVaccineSearch}
                        onSearch={setEditVaccineSearch}
                        vaccineList={dbVaccines}
                        activeAnimalType={batches.find(b => b.id === editBatchId)?.animal_type || housingAnimalType || activeBatch?.animal_type}
                        onSelect={selected => {
                            const name = typeof selected === 'string' ? selected : selected.name;
                            setEditTitle(name);
                            if (typeof selected !== 'string') {
                                if (selected.dose_per_animal != null && !editDosage) {
                                    setEditDosage(String(selected.dose_per_animal));
                                }
                            }
                            setEditVaccinePickerVisible(false);
                            setEditVaccineSearch('');
                        }}
                        onClose={() => { setEditVaccinePickerVisible(false); setEditVaccineSearch(''); }}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={editTreatmentPickerVisible}
                        title="Select Treatment"
                        options={editTreatmentOptions.map(t => t.name).concat('Other')}
                        onSelect={val => { setEditTitle(val); setEditCustomTitle(''); setEditMed(''); setEditCustomMed(''); setEditTreatmentPickerVisible(false); }}
                        onClose={() => setEditTreatmentPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={editIllnessPickerVisible}
                        title="Select Illness"
                        options={editIllnessOptions.map(i => i.name).concat('Other')}
                        onSelect={val => { setEditTitle(val); setEditCustomTitle(''); setEditMed(''); setEditCustomMed(''); setEditIllnessPickerVisible(false); }}
                        onClose={() => setEditIllnessPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={editVitaminPickerVisible}
                        title="Select Vitamin"
                        options={editVitaminOptions.map(v => v.name).concat('Other')}
                        onSelect={val => { setEditTitle(val); setEditCustomTitle(''); setEditVitaminPickerVisible(false); }}
                        onClose={() => setEditVitaminPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={editDewormingPickerVisible}
                        title="Select Dewormer"
                        options={editDewormingOptions.map(d => d.name).concat('Other')}
                        onSelect={val => { setEditTitle(val); setEditCustomTitle(''); setEditDewormingPickerVisible(false); }}
                        onClose={() => setEditDewormingPickerVisible(false)}
                        colors={colors}
                    />
                    <SuggestionPickerModal
                        visible={editMedicationPickerVisible}
                        title="Select Medication"
                        options={editSuggestedMeds.concat('Other')}
                        onSelect={val => { setEditMed(val); setCustomMed(''); setEditMedicationPickerVisible(false); }}
                        onClose={() => setEditMedicationPickerVisible(false)}
                        colors={colors}
                    />
                    {activeEditCalendar && (
                        <CalendarPickerOverlay
                            visible={true}
                            label={activeEditCalendar.label}
                            value={activeEditCalendar.value}
                            onChange={activeEditCalendar.onChange}
                            onClose={() => setActiveEditCalendar(null)}
                            colors={colors}
                        />
                    )}
                </View>
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

            {/* ════════════ RECENTLY DELETED DRAWER ════════════ */}
            <Modal visible={trashVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={handleCloseTrashModal}
                    />
                    <Animated.View {...panTrashResponder.panHandlers} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%', transform: [{ translateY: Animated.add(slideTrash, panYTrash) }] }}>
                        {/* Draggable Header */}
                        <View style={{ width: '100%' }}>
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
                                <TouchableOpacity onPress={handleCloseTrashModal} activeOpacity={0.7}
                                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}>
                                    <MaterialIcons name="close" size={18} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Trash list */}
                        <ScrollView
                            onScroll={(e) => {
                                isScrollAtTopTrash.current = e.nativeEvent.contentOffset.y <= 0;
                            }}
                            scrollEventThrottle={16}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 36 }}
                            showsVerticalScrollIndicator={false}
                        >
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
                                    const cfg = RECORD_TYPES[record.record_type];
                                    const days = daysSinceDeleted(record.deleted_at!);
                                    const left = daysLeft(record.deleted_at!);
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
                                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text, opacity: 0.75 }}>
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
                                                    onPress={() => {
                                                        setRestoreTargetId(record.id);
                                                        setRestoreModalVisible(true);
                                                    }}
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
                    </Animated.View>

                    {/* Confirmation Overlays - rendered inside modal to ensure they appear on top in mobile */}
                    <ConfirmationOverlay
                        visible={restoreModalVisible}
                        type="confirmation"
                        title="Restore Record?"
                        message="This record will be restored back to your active health records."
                        confirmText={isRestoring ? 'Restoring…' : 'Restore'}
                        cancelText="Cancel"
                        isLoading={!!isRestoring}
                        onConfirm={() => {
                            if (restoreTargetId) handleRestore(restoreTargetId);
                        }}
                        onCancel={() => {
                            if (!isRestoring) {
                                setRestoreModalVisible(false);
                                setRestoreTargetId(null);
                            }
                        }}
                        colors={colors}
                        textStyles={textStyles}
                    />

                    <ConfirmationOverlay
                        visible={permDeleteVisible}
                        type="warning"
                        title="Delete Forever?"
                        message="This record will be permanently removed and cannot be recovered."
                        confirmText={isPermaDeleting ? 'Deleting…' : 'Delete Forever'}
                        cancelText="Cancel"
                        isLoading={isPermaDeleting}
                        onConfirm={handlePermanentDelete}
                        onCancel={() => {
                            if (!isPermaDeleting) {
                                setPermDeleteVisible(false);
                                setPermanentDeleteId(null);
                            }
                        }}
                        colors={colors}
                        textStyles={textStyles}
                    />
                </View>
            </Modal>

            <Snackbar visible={snackbarVisible} message={snackbarMessage} type={snackbarType} onDismiss={() => setSnackbarVisible(false)} />
        </View>
    );
}

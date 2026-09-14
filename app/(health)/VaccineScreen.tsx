/**
 * VaccineScreen
 *
 * Vaccination Schedule & Planner screen:
 *   - View upcoming, overdue, and completed vaccination schedules
 *   - Filter schedules by status (All, Overdue, Pending, Completed)
 *   - Add vaccination schedules for real housings from database
 *   - Uses exact same flow & pill-shaped form inputs as ManageHousingsScreen (using SelectionModal, single active modal with fade)
 *   - Circular floating add button
 *   - Mark schedules as completed
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActionModal from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import { SelectionModal } from '@/components/SelectionModal';
import { useFormDraft } from '@/hooks/useFormDraft';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notify';
import { scheduleUpcomingVaccinations } from '@/lib/notificationScheduler';
import { useVaccineStyles } from '@/styles/vaccineStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaccineItem {
    id: string;
    name: string;
    vaccine_type?: string;
    species: string;
    route?: string;
    dose_per_animal?: number;
    unit?: string;
}

interface VaccinationSchedule {
    id: string;
    farm_id?: string;
    vaccine_id?: string;
    vaccine_name: string;
    scheduled_date: string;
    housing_id?: string;
    housing?: { id: string; name: string; animal_type?: string } | null;
    status: 'pending' | 'completed' | 'overdue' | 'cancelled';
    interval_days?: number;
    notes?: string;
}

interface HousingItem {
    id: string;
    farm_id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    capacity: number;
    current_count: number;
    status: string;
    batches?: {
        id: string;
        name: string;
        current_count: number;
        status: string;
    }[];
}

type ScheduleFilter = 'all' | 'pending' | 'overdue' | 'completed';

// ─── Calendar Helpers ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const TODAY = new Date().toISOString().split('T')[0];

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysUntil = (dateStr: string): number => {
    const now = new Date(TODAY);
    const target = new Date(dateStr + 'T00:00:00');
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
};

const scheduleColor = (status: string, date: string): string => {
    if (status === 'completed') return '#10B981';
    if (status === 'cancelled') return '#6B7280';
    if (status === 'overdue' || daysUntil(date) < 0) return '#EF4444';
    if (daysUntil(date) <= 2) return '#F97316';
    return '#3B82F6';
};

// ─── Screen Component ─────────────────────────────────────────────────────────

export default function VaccineScreen() {
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useVaccineStyles();
    const router = useRouter();

    const primaryFarmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    // ── Data ──────────────────────────────────────────────────────────────────
    const [schedules, setSchedules]       = useState<VaccinationSchedule[]>([]);
    const [vaccineList, setVaccineList]   = useState<VaccineItem[]>([]);
    const [housings, setHousings]         = useState<HousingItem[]>([]);
    const [isLoading, setIsLoading]       = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [filter, setFilter]             = useState<ScheduleFilter>('all');

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackVisible, setSnackVisible] = useState(false);
    const [snackMessage, setSnackMessage] = useState('');
    const [snackType, setSnackType]       = useState<SnackbarType>('success');
    const showSnack = (msg: string, type: SnackbarType = 'success') => {
        setSnackMessage(msg);
        setSnackType(type);
        setSnackVisible(true);
    };

    // ── Modal State: Main Add Schedule ────────────────────────────────────────
    const [showSchModal, setShowSchModal]               = useState(false);
    const [schHousingId, setSchHousingId]               = useState('');
    const [schHousingName, setSchHousingName]           = useState('');
    const [schVaccineId, setSchVaccineId]               = useState('');
    const [schVaccineName, setSchVaccineName]           = useState('');
    const [schDate, setSchDate]                         = useState(TODAY);
    const [schInterval, setSchInterval]                 = useState('');
    const [schNotes, setSchNotes]                       = useState('');
    const [savingSch, setSavingSch]                     = useState(false);

    // ── Form Draft Checkpointing ──────────────────────────────────
    const {
        clearDraft,
    } = useFormDraft(
        `vaccine_schedule_${primaryFarmId || 'farm'}`,
        { schHousingId, schHousingName, schVaccineId, schVaccineName, schDate, schInterval, schNotes },
        {
            enabled: showSchModal,
            onRestore: (draft) => {
                if (draft.schHousingId) setSchHousingId(draft.schHousingId);
                if (draft.schHousingName) setSchHousingName(draft.schHousingName);
                if (draft.schVaccineId) setSchVaccineId(draft.schVaccineId);
                if (draft.schVaccineName) setSchVaccineName(draft.schVaccineName);
                if (draft.schDate) setSchDate(draft.schDate);
                if (draft.schInterval) setSchInterval(draft.schInterval);
                if (draft.schNotes) setSchNotes(draft.schNotes);
            },
        }
    );

    // ── Search & Filter State ─────────────────────────────────────────────────
    const [searchQuery, setSearchQuery]                 = useState('');
    const [selectedFilterDate, setSelectedFilterDate]   = useState<string | null>(null);
    const [filterHousingId, setFilterHousingId]         = useState<string>('all');
    const [filtersCollapsed, setFiltersCollapsed]       = useState(true);
    const [showCalendar, setShowCalendar]               = useState(false);

    // ── Single Active Sub-Modals (Same Exact Pattern as ManageHousingsScreen) ──
    const [vaccineModalVisible, setVaccineModalVisible] = useState(false);
    const [housingModalVisible, setHousingModalVisible] = useState(false);
    const [dateModalVisible, setDateModalVisible]       = useState(false);

    // ── Delete Confirmation Modal ────────────────────────────────────────────
    const [deleteModalVisible, setDeleteModalVisible]   = useState(false);
    const [scheduleToDelete, setScheduleToDelete]       = useState<VaccinationSchedule | null>(null);
    const [isDeleting, setIsDeleting]                   = useState(false);

    // Date Modal Calendar State
    const todayObj = new Date();
    const [calYear, setCalYear]   = useState(todayObj.getFullYear());
    const [calMonth, setCalMonth] = useState(todayObj.getMonth());

    // On-Page Interactive Calendar State
    const [pageCalYear, setPageCalYear]   = useState(todayObj.getFullYear());
    const [pageCalMonth, setPageCalMonth] = useState(todayObj.getMonth());

    // ─────────────────────────────────────────────────────────────────────────
    // Database Queries
    // ─────────────────────────────────────────────────────────────────────────

    const loadHousings = useCallback(async () => {
        if (!primaryFarmId) return;
        const { data, error } = await supabase
            .from('housings')
            .select('id, farm_id, name, animal_type, capacity, current_count, status, batches(id, name, current_count, status)')
            .in('farm_id', activeFarmIds)
            .eq('status', 'Active')
            .order('name', { ascending: true });
        if (!error && data) {
            setHousings(data as any);
        }
    }, [activeFarmIds, primaryFarmId]);

    const loadVaccines = useCallback(async () => {
        if (!primaryFarmId) return;
        const { data, error } = await supabase
            .from('vaccines')
            .select('id, name, vaccine_type, species, route, dose_per_animal, unit')
            .in('farm_id', activeFarmIds)
            .order('name', { ascending: true });
        if (!error) setVaccineList(data || []);
    }, [activeFarmIds, primaryFarmId]);

    const loadSchedules = useCallback(async () => {
        if (!primaryFarmId) return;
        // Mark overdue schedules in database before fetching
        await supabase
            .from('vaccination_schedules')
            .update({ status: 'overdue' })
            .in('farm_id', activeFarmIds)
            .eq('status', 'pending')
            .lt('scheduled_date', TODAY);

        const { data, error } = await supabase
            .from('vaccination_schedules')
            .select('*, housings(id, name, animal_type)')
            .in('farm_id', activeFarmIds)
            .neq('status', 'cancelled')
            .order('scheduled_date', { ascending: true });
        if (!error) setSchedules(data || []);
    }, [activeFarmIds, primaryFarmId]);

    const vaccinesLoadedRef = React.useRef(false);

    const loadAll = useCallback(async (isSilent = false) => {
        if (!isSilent && !vaccinesLoadedRef.current) {
            setIsLoading(true);
        }
        await Promise.all([loadSchedules(), loadVaccines(), loadHousings()]);
        vaccinesLoadedRef.current = true;
        setIsLoading(false);
    }, [loadSchedules, loadVaccines, loadHousings]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([loadSchedules(), loadVaccines(), loadHousings()]);
        setRefreshing(false);
    }, [loadSchedules, loadVaccines, loadHousings]);

    useFocusEffect(
        useCallback(() => {
            loadAll(true);
        }, [loadAll])
    );

    // Live Supabase Realtime channel for vaccines & schedules
    useEffect(() => {
        if (!activeFarmIds.length) return;
        let debounceTimer: any = null;
        const triggerSync = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadAll(true);
            }, 300);
        };

        const channel = supabase
            .channel(`vaccine-live-${activeFarmIds.join('-')}-${Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccines' }, triggerSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccination_schedules' }, triggerSync)
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [activeFarmIds, loadAll]);

    // ─────────────────────────────────────────────────────────────────────────
    // Actions & Form Validation
    // ─────────────────────────────────────────────────────────────────────────

    const handleCloseSchModal = () => {
        setShowSchModal(false);
    };

    /** Add a scheduled vaccination with input validation */
    const handleAddSchedule = async () => {
        // Validation: Vaccine Selection
        if (!schVaccineId) {
            showSnack('Please select a vaccine.', 'error');
            return;
        }

        // Validation: Scheduled Date
        if (!schDate || !/^\d{4}-\d{2}-\d{2}$/.test(schDate)) {
            showSnack('Please select a valid scheduled date.', 'error');
            return;
        }

        // Validation: Repeat interval (numbers only & positive)
        let intervalNum: number | null = null;
        if (schInterval.trim()) {
            const parsed = parseInt(schInterval.trim(), 10);
            if (isNaN(parsed) || parsed <= 0) {
                showSnack('Repeat interval must be a valid positive number of days.', 'error');
                return;
            }
            intervalNum = parsed;
        }

        setSavingSch(true);
        try {
            const vaccineItem = vaccineList.find(v => v.id === schVaccineId);
            const selectedHousing = housings.find(h => h.id === schHousingId);
            const activeBatch = selectedHousing?.batches?.find(b => b.status === 'active');

            const { error } = await supabase.from('vaccination_schedules').insert({
                farm_id:        primaryFarmId,
                housing_id:     schHousingId || null,
                batch_id:       activeBatch?.id || null,
                vaccine_id:     schVaccineId,
                vaccine_name:   vaccineItem?.name || schVaccineName || 'Unknown',
                scheduled_date: schDate,
                interval_days:  intervalNum,
                status:         'pending',
                notes:          schNotes.trim() || null,
            });

            if (error) throw error;

            if (primaryFarmId) {
                createNotification({
                    farmId: primaryFarmId,
                    category: 'health_alert',
                    type: 'info',
                    title: `Vaccine Scheduled: ${vaccineItem?.name || schVaccineName || 'Vaccination'}`,
                    message: `Scheduled for ${schDate}${selectedHousing ? ` in ${selectedHousing.name}` : ''}.`,
                    actionUrl: '/(health)/VaccineScreen',
                });
                scheduleUpcomingVaccinations([primaryFarmId]);
            }

            await clearDraft();
            resetSchForm();
            handleCloseSchModal();
            showSnack('Vaccine schedule added successfully!');
            loadSchedules();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to add schedule.', 'error');
        } finally {
            setSavingSch(false);
        }
    };

    /** Mark a scheduled vaccination as completed */
    const handleMarkDone = async (schedule: VaccinationSchedule) => {
        try {
            const { error } = await supabase
                .from('vaccination_schedules')
                .update({ status: 'completed' })
                .eq('id', schedule.id);

            if (error) throw error;
            if (schedule.farm_id) {
                createNotification({
                    farmId: schedule.farm_id,
                    category: 'health_alert',
                    type: 'success',
                    title: `Vaccination Completed: ${schedule.vaccine_name}`,
                    message: `Marked as completed on ${TODAY}.`,
                    actionUrl: '/(health)/VaccineScreen',
                });
                scheduleUpcomingVaccinations([schedule.farm_id]);
            }
            showSnack(`Marked "${schedule.vaccine_name}" as completed!`);
            loadSchedules();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to update schedule status.', 'error');
        }
    };

    /** Revert / Undo a completed vaccination schedule back to pending/overdue */
    const handleUndoComplete = async (schedule: VaccinationSchedule) => {
        try {
            const revertedStatus = schedule.scheduled_date < TODAY ? 'overdue' : 'pending';
            const { error } = await supabase
                .from('vaccination_schedules')
                .update({ status: revertedStatus })
                .eq('id', schedule.id);

            if (error) throw error;
            showSnack(`Reopened "${schedule.vaccine_name}" as ${revertedStatus}!`);
            loadSchedules();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to undo completion.', 'error');
        }
    };

    /** Open delete confirmation modal */
    const confirmDeleteSchedule = (schedule: VaccinationSchedule) => {
        setScheduleToDelete(schedule);
        setDeleteModalVisible(true);
    };

    /** Execute delete action from ActionModal */
    const executeDeleteSchedule = async () => {
        if (!scheduleToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('vaccination_schedules')
                .delete()
                .eq('id', scheduleToDelete.id);

            if (error) throw error;
            setDeleteModalVisible(false);
            setScheduleToDelete(null);
            showSnack('Schedule deleted successfully.');
            loadSchedules();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to delete schedule.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const resetSchForm = () => {
        setSchHousingId('');
        setSchHousingName('');
        setSchVaccineId('');
        setSchVaccineName('');
        setSchDate(TODAY);
        setSchInterval('');
        setSchNotes('');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Calendar Helpers & Dots Calculation
    // ─────────────────────────────────────────────────────────────────────────

    /** Retrieve colored dots for a given date indicating scheduled vaccine statuses */
    const getDateScheduleDots = (year: number, month: number, day: number) => {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dateKey = `${year}-${mm}-${dd}`;
        const daySchedules = schedules.filter(s => s.scheduled_date === dateKey);
        if (daySchedules.length === 0) return [];

        const dotColors: string[] = [];
        const hasOverdue   = daySchedules.some(s => s.status === 'overdue' || (s.status === 'pending' && daysUntil(s.scheduled_date) < 0));
        const hasDueSoon   = daySchedules.some(s => s.status === 'pending' && daysUntil(s.scheduled_date) <= 2 && daysUntil(s.scheduled_date) >= 0);
        const hasPending   = daySchedules.some(s => s.status === 'pending' && daysUntil(s.scheduled_date) > 2);
        const hasCompleted = daySchedules.some(s => s.status === 'completed');

        if (hasOverdue) dotColors.push('#EF4444');
        if (hasDueSoon) dotColors.push('#F97316');
        if (hasPending && !hasDueSoon) dotColors.push('#3B82F6');
        if (hasCompleted) dotColors.push('#10B981');

        return dotColors.slice(0, 3);
    };

    // Date Modal Calendar Handlers
    const openDatePickerModal = () => {
        const initDate = schDate ? new Date(schDate + 'T00:00:00') : new Date();
        setCalYear(initDate.getFullYear());
        setCalMonth(initDate.getMonth());
        setShowSchModal(false);
        setDateModalVisible(true);
    };

    const prevCalMonth = () => {
        if (calMonth === 0) {
            setCalMonth(11);
            setCalYear(y => y - 1);
        } else {
            setCalMonth(m => m - 1);
        }
    };

    const nextCalMonth = () => {
        if (calMonth === 11) {
            setCalMonth(0);
            setCalYear(y => y + 1);
        } else {
            setCalMonth(m => m + 1);
        }
    };

    const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
    const daysInCalMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const calCells: (number | null)[] = [
        ...Array(firstDayIndex).fill(null),
        ...Array.from({ length: daysInCalMonth }, (_, i) => i + 1),
    ];
    while (calCells.length % 7 !== 0) calCells.push(null);

    const selectedCalDate = schDate ? new Date(schDate + 'T00:00:00') : null;

    // Page Calendar Handlers
    const prevPageCalMonth = () => {
        if (pageCalMonth === 0) {
            setPageCalMonth(11);
            setPageCalYear(y => y - 1);
        } else {
            setPageCalMonth(m => m - 1);
        }
    };

    const nextPageCalMonth = () => {
        if (pageCalMonth === 11) {
            setPageCalMonth(0);
            setPageCalYear(y => y + 1);
        } else {
            setPageCalMonth(m => m + 1);
        }
    };

    const pageCalFirstDayIndex = new Date(pageCalYear, pageCalMonth, 1).getDay();
    const pageDaysInCalMonth = new Date(pageCalYear, pageCalMonth + 1, 0).getDate();
    const pageCalCells: (number | null)[] = [
        ...Array(pageCalFirstDayIndex).fill(null),
        ...Array.from({ length: pageDaysInCalMonth }, (_, i) => i + 1),
    ];
    while (pageCalCells.length % 7 !== 0) pageCalCells.push(null);

    // ─────────────────────────────────────────────────────────────────────────
    // Counts & Filtered Schedules
    // ─────────────────────────────────────────────────────────────────────────

    const overdueCount = schedules.filter(s => s.status === 'overdue').length;
    const dueSoonCount = schedules.filter(s => s.status === 'pending' && daysUntil(s.scheduled_date) <= 3 && daysUntil(s.scheduled_date) >= 0).length;
    const pendingCount = schedules.filter(s => s.status === 'pending').length;
    const completedCount = schedules.filter(s => s.status === 'completed').length;

    const isStatusFiltered  = filter !== 'all';
    const isHousingFiltered = filterHousingId !== 'all';
    const isDateFiltered    = !!selectedFilterDate;
    const isSearchFiltered  = !!searchQuery.trim();
    const isFiltered        = isStatusFiltered || isHousingFiltered || isDateFiltered || isSearchFiltered;

    const activeFilterSummary = useMemo(() => {
        const parts: string[] = [];
        if (isStatusFiltered) {
            parts.push(filter.charAt(0).toUpperCase() + filter.slice(1));
        }
        if (isHousingFiltered) {
            const foundHousing = housings.find(h => h.id === filterHousingId);
            if (foundHousing) parts.push(foundHousing.name);
        }
        if (isDateFiltered) {
            parts.push(formatDate(selectedFilterDate!));
        }
        if (isSearchFiltered) {
            parts.push(`"${searchQuery.trim()}"`);
        }
        if (parts.length === 0) {
            return 'All Schedules';
        }
        return parts.join(' · ');
    }, [isStatusFiltered, filter, isHousingFiltered, filterHousingId, isDateFiltered, selectedFilterDate, isSearchFiltered, searchQuery, housings]);

    const filteredSchedules = schedules.filter(sch => {
        // Status filter
        if (filter === 'overdue' && sch.status !== 'overdue') return false;
        if (filter === 'pending' && sch.status !== 'pending') return false;
        if (filter === 'completed' && sch.status !== 'completed') return false;

        // Housing filter
        if (filterHousingId !== 'all' && sch.housing_id !== filterHousingId) return false;

        // Calendar date filter
        if (selectedFilterDate && sch.scheduled_date !== selectedFilterDate) return false;

        // Search text filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchVaccine = sch.vaccine_name?.toLowerCase().includes(q);
            const matchHousing = sch.housing?.name?.toLowerCase().includes(q);
            const matchAnimal  = sch.housing?.animal_type?.toLowerCase().includes(q);
            const matchNotes   = sch.notes?.toLowerCase().includes(q);
            const matchDate    = sch.scheduled_date?.includes(q);
            if (!matchVaccine && !matchHousing && !matchAnimal && !matchNotes && !matchDate) {
                return false;
            }
        }

        return true;
    });

    const dateDisplayValue = schDate
        ? new Date(schDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Select Scheduled Date';

    const isSaveDisabled = savingSch || !schVaccineId || !schDate;

    const handleTestVaccinePush = async () => {
        try {
            let farmName = 'Farm';
            if (primaryFarmId) {
                const { data: f } = await supabase.from('farms').select('name').eq('id', primaryFarmId).single();
                if (f?.name) farmName = f.name;
            }
            await createNotification({
                farmId: primaryFarmId || 'demo-farm',
                farmName,
                title: 'Vaccination Due Today',
                message: 'Vaccination scheduled for both species:\n• Pigs: Mycoplasma & Circovirus (Pen A)\n• Chickens: Newcastle Disease (Coop 1)\n\nTap to view Vaccine Planner.',
                type: 'warning',
                category: 'health_alert',
                actionUrl: '/(health)/VaccineScreen',
            });
            Alert.alert('Push Notification Sent', 'Vaccine due push notification for both species sent successfully.');
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to dispatch test notification.');
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(animals)/HealthRecordsScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Vaccines
                    </Text>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleTestVaccinePush}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
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

                {/* Search Bar & Calendar Toggle */}
                <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <View style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.surface,
                        borderRadius: 24,
                        borderWidth: 1.5,
                        borderColor: colors.stroke,
                        paddingHorizontal: 14,
                        height: 46,
                    }}>
                        <MaterialIcons name="search" size={20} color={colors.textGrey} style={{ marginRight: 8 }} />
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search vaccine, housing, notes..."
                            placeholderTextColor={colors.textGrey}
                            style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 13, padding: 0 }]}
                        />
                        {searchQuery ? (
                            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <MaterialIcons name="close" size={18} color={colors.textGrey} />
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    <TouchableOpacity
                        onPress={() => setShowCalendar(prev => !prev)}
                        style={{
                            height: 46,
                            paddingHorizontal: 14,
                            borderRadius: 24,
                            backgroundColor: showCalendar ? colors.primary + '18' : colors.surface,
                            borderWidth: 1.5,
                            borderColor: showCalendar ? colors.primary : colors.stroke,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                        }}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="calendar-month" size={20} color={showCalendar ? colors.primary : colors.textGrey} />
                        <Text style={[textStyles.label, { color: showCalendar ? colors.primary : colors.textGrey, fontSize: 12 }]}>
                            Calendar
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* On-Page Interactive Calendar View */}
                {showCalendar && (
                    <View style={{
                        marginHorizontal: 20,
                        marginTop: 2,
                        marginBottom: 12,
                        backgroundColor: colors.surface,
                        borderRadius: 20,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: colors.stroke,
                        ...Platform.select({
                            web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' },
                            default: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 }
                        })
                    }}>
                        {/* Month Navigation */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <TouchableOpacity
                                onPress={prevPageCalMonth}
                                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <MaterialIcons name="chevron-left" size={20} color={colors.text} />
                            </TouchableOpacity>

                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 14, color: colors.text }}>
                                    {MONTH_NAMES[pageCalMonth]} {pageCalYear}
                                </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        setPageCalYear(todayObj.getFullYear());
                                        setPageCalMonth(todayObj.getMonth());
                                        const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
                                        const dd = String(todayObj.getDate()).padStart(2, '0');
                                        setSelectedFilterDate(`${todayObj.getFullYear()}-${mm}-${dd}`);
                                    }}
                                    style={{
                                        paddingHorizontal: 9,
                                        paddingVertical: 4,
                                        borderRadius: 12,
                                        backgroundColor: colors.cardFill,
                                    }}
                                >
                                    <Text style={[textStyles.label, { fontSize: 10, color: colors.textGrey }]}>Today</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={nextPageCalMonth}
                                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <MaterialIcons name="chevron-right" size={20} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Days of week */}
                        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                            {DAY_NAMES.map(d => (
                                <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.textGrey }}>{d}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Calendar Grid */}
                        {Array.from({ length: pageCalCells.length / 7 }, (_, row) => (
                            <View key={row} style={{ flexDirection: 'row', marginBottom: 2 }}>
                                {pageCalCells.slice(row * 7, row * 7 + 7).map((day, col) => {
                                    if (day === null) {
                                        return <View key={col} style={{ flex: 1, height: 36 }} />;
                                    }

                                    const mm = String(pageCalMonth + 1).padStart(2, '0');
                                    const dd = String(day).padStart(2, '0');
                                    const dateKey = `${pageCalYear}-${mm}-${dd}`;

                                    const isSelected = selectedFilterDate === dateKey;
                                    const isToday = todayObj.getFullYear() === pageCalYear &&
                                        todayObj.getMonth() === pageCalMonth &&
                                        todayObj.getDate() === day;
                                    const dots = getDateScheduleDots(pageCalYear, pageCalMonth, day);

                                    return (
                                        <View key={col} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setSelectedFilterDate(prev => prev === dateKey ? null : dateKey);
                                                }}
                                                activeOpacity={0.7}
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 18,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: isSelected ? colors.primary : isToday ? colors.primary + '18' : dots.length > 0 ? colors.cardFill : 'transparent',
                                                    borderWidth: isToday && !isSelected ? 1.5 : 0,
                                                    borderColor: colors.primary,
                                                }}
                                            >
                                                <Text style={{
                                                    fontFamily: isSelected || isToday ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                    fontSize: 12,
                                                    color: isSelected ? '#FFF' : isToday ? colors.primary : colors.text,
                                                    marginBottom: dots.length > 0 ? 2 : 0,
                                                }}>
                                                    {day}
                                                </Text>
                                                {dots.length > 0 && (
                                                    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                                                        {dots.map((dotColor, dotIdx) => (
                                                            <View
                                                                key={dotIdx}
                                                                style={{
                                                                    width: 4,
                                                                    height: 4,
                                                                    borderRadius: 2,
                                                                    backgroundColor: isSelected ? '#FFF' : dotColor,
                                                                }}
                                                            />
                                                        ))}
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                        ))}

                        {/* Legend / Dots guide */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.stroke }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Overdue</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F97316' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Due Soon</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Pending</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Done</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Active Date Filter Chip Banner */}
                {selectedFilterDate && (
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginHorizontal: 20,
                        marginTop: 2,
                        marginBottom: 4,
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 12,
                        backgroundColor: colors.primary + '15',
                        borderWidth: 1,
                        borderColor: colors.primary + '30',
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MaterialIcons name="filter-alt" size={16} color={colors.primary} />
                            <Text style={[textStyles.body, { color: colors.primary, fontSize: 12, fontFamily: 'Poppins-Medium' }]}>
                                Date: {formatDate(selectedFilterDate)}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setSelectedFilterDate(null)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 11 }]}>Clear Date</Text>
                            <MaterialIcons name="close" size={14} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                )}

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
                                        setFilter('all');
                                        setFilterHousingId('all');
                                        setSelectedFilterDate(null);
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

                    {/* Body: wrapped multi-line chips (pill round shaped), no sliding */}
                    {!filtersCollapsed && (
                        <View style={{ paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.stroke + '40' }}>
                            {/* Housing Filter Row */}
                            {housings.length > 0 && (
                                <View style={{ marginBottom: 10 }}>
                                    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                        Housing / Pen
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                        {[{ id: 'all', name: 'All Housings' } as any, ...housings].map(h => {
                                            const isSel = filterHousingId === h.id;
                                            return (
                                                <TouchableOpacity
                                                    key={h.id}
                                                    activeOpacity={0.75}
                                                    onPress={() => setFilterHousingId(h.id)}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        paddingHorizontal: 14,
                                                        paddingVertical: 6,
                                                        borderRadius: 999,
                                                        borderWidth: 1.5,
                                                        borderColor: isSel ? colors.primary : colors.stroke,
                                                        backgroundColor: isSel ? colors.primary + '18' : colors.surface,
                                                    }}
                                                >
                                                    <MaterialIcons
                                                        name="home"
                                                        size={13}
                                                        color={isSel ? colors.primary : colors.textGrey}
                                                        style={{ marginRight: 5 }}
                                                    />
                                                    <Text style={{ fontFamily: isSel ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11.5, color: isSel ? colors.primary : colors.textGrey }}>
                                                        {h.name}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* Status Filter Row */}
                            <View>
                                <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 10, color: colors.textGrey, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                                    Schedule Status
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {[
                                        { id: 'all', label: `All (${schedules.length})`, icon: null, color: colors.primary },
                                        ...(overdueCount > 0 ? [{ id: 'overdue', label: `Overdue (${overdueCount})`, icon: 'error', color: '#EF4444' }] : []),
                                        { id: 'pending', label: `Pending (${pendingCount})`, icon: 'schedule', color: '#3B82F6' },
                                        ...(completedCount > 0 ? [{ id: 'completed', label: `Completed (${completedCount})`, icon: 'check-circle', color: '#10B981' }] : []),
                                    ].map(st => {
                                        const isSel = filter === st.id;
                                        return (
                                            <TouchableOpacity
                                                key={st.id}
                                                activeOpacity={0.75}
                                                onPress={() => setFilter(st.id as any)}
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    paddingHorizontal: 14,
                                                    paddingVertical: 6,
                                                    borderRadius: 999,
                                                    borderWidth: 1.5,
                                                    borderColor: isSel ? st.color : colors.stroke,
                                                    backgroundColor: isSel ? st.color + '18' : colors.surface,
                                                }}
                                            >
                                                {st.icon && (
                                                    <MaterialIcons
                                                        name={st.icon as any}
                                                        size={13}
                                                        color={isSel ? st.color : colors.textGrey}
                                                        style={{ marginRight: 5 }}
                                                    />
                                                )}
                                                <Text style={{ fontFamily: isSel ? 'Poppins-SemiBold' : 'Poppins-Regular', fontSize: 11.5, color: isSel ? st.color : colors.textGrey }}>
                                                    {st.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                    )}
                </View>

                {/* Schedules List */}
                {isLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={colors.primary}
                                colors={[colors.primary]}
                            />
                        }
                    >
                        {filteredSchedules.length === 0 ? (
                            <View style={styles.emptyState}>
                                <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '15' }]}>
                                    <MaterialIcons name="event" size={32} color={colors.primary} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>
                                    {filter === 'all' ? 'No Schedules Yet' : `No ${filter} Schedules`}
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center', maxWidth: 260 }]}>
                                    {filter === 'all' ? 'Tap the + button below to schedule upcoming vaccinations.' : 'Try changing your filter to view other schedules.'}
                                </Text>
                            </View>
                        ) : (
                            filteredSchedules.map(sch => {
                                const color       = scheduleColor(sch.status, sch.scheduled_date);
                                const d           = daysUntil(sch.scheduled_date);
                                const isCompleted = sch.status === 'completed';
                                const isOverdue   = sch.status === 'overdue' || (!isCompleted && d < 0);

                                const dLabel = isCompleted ? 'Completed'
                                    : isOverdue ? `${Math.abs(d)}d overdue`
                                    : d === 0 ? 'Due Today'
                                    : d === 1 ? 'Due Tomorrow'
                                    : `Due in ${d} days`;

                                const statusBg = isCompleted ? '#10B98115'
                                    : isOverdue ? '#EF444415'
                                    : d <= 2 ? '#F9731615'
                                    : '#3B82F615';

                                const statusBorder = isCompleted ? '#10B98130'
                                    : isOverdue ? '#EF444430'
                                    : d <= 2 ? '#F9731630'
                                    : '#3B82F630';

                                return (
                                    <View
                                        key={sch.id}
                                        style={[
                                            styles.card,
                                            {
                                                backgroundColor: colors.surface,
                                                borderColor: isOverdue ? '#EF444435' : colors.stroke,
                                            }
                                        ]}
                                    >
                                        {/* Top Row: Icon, Vaccine Title & Status Pill */}
                                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                                            <View
                                                style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 14,
                                                    backgroundColor: color + '15',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                <MaterialIcons
                                                    name={isCompleted ? 'check-circle' : 'vaccines'}
                                                    size={24}
                                                    color={color}
                                                />
                                            </View>

                                            <View style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                                                <Text
                                                    style={[
                                                        textStyles.h3,
                                                        {
                                                            color: colors.text,
                                                            fontSize: 16,
                                                            textDecorationLine: isCompleted ? 'line-through' : 'none',
                                                            opacity: isCompleted ? 0.75 : 1,
                                                        }
                                                    ]}
                                                >
                                                    {sch.vaccine_name}
                                                </Text>
                                                {sch.housing?.animal_type ? (
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, textTransform: 'capitalize' }]}>
                                                        {sch.housing.animal_type} Vaccination
                                                    </Text>
                                                ) : null}
                                            </View>

                                            {/* Status Pill */}
                                            <View
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: 12,
                                                    backgroundColor: statusBg,
                                                    borderWidth: 1,
                                                    borderColor: statusBorder,
                                                }}
                                            >
                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                                                <Text style={[textStyles.label, { color, fontSize: 11 }]}>
                                                    {dLabel}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Info Badges Row: Date, Housing Location, Repeat Cadence */}
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                                            {/* Scheduled Date */}
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 5,
                                                backgroundColor: colors.cardFill,
                                                paddingHorizontal: 10,
                                                paddingVertical: 5,
                                                borderRadius: 8,
                                            }}>
                                                <MaterialIcons name="calendar-today" size={13} color={colors.primary} />
                                                <Text style={[textStyles.body, { color: colors.text, fontSize: 12, fontFamily: 'Poppins-Medium' }]}>
                                                    {formatDate(sch.scheduled_date)}
                                                </Text>
                                            </View>

                                            {/* Housing / Pen */}
                                            {sch.housing?.name ? (
                                                <View style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    backgroundColor: colors.cardFill,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: 8,
                                                }}>
                                                    <MaterialIcons name="home" size={14} color={colors.textGrey} />
                                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 12 }]}>
                                                        {sch.housing.name}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <View style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    backgroundColor: colors.cardFill,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: 8,
                                                }}>
                                                    <MaterialIcons name="public" size={14} color={colors.textGrey} />
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                                        Farm-wide
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Recurrence Interval */}
                                            {sch.interval_days ? (
                                                <View style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    backgroundColor: colors.cardFill,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: 8,
                                                }}>
                                                    <MaterialIcons name="repeat" size={13} color={colors.textGrey} />
                                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                                        Every {sch.interval_days}d
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>

                                        {/* Notes container if present */}
                                        {sch.notes ? (
                                            <View
                                                style={{
                                                    marginTop: 10,
                                                    backgroundColor: colors.cardFill,
                                                    borderRadius: 10,
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 8,
                                                    flexDirection: 'row',
                                                    alignItems: 'flex-start',
                                                    gap: 6,
                                                }}
                                            >
                                                <MaterialIcons name="sticky-note-2" size={15} color={colors.textGrey} style={{ marginTop: 1 }} />
                                                <Text style={[textStyles.body, { color: colors.text, fontSize: 12, flex: 1 }]}>
                                                    {sch.notes}
                                                </Text>
                                            </View>
                                        ) : null}

                                        {/* Action Footer */}
                                        <View style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginTop: 14,
                                            paddingTop: 12,
                                            borderTopWidth: 1,
                                            borderTopColor: colors.stroke,
                                            gap: 10,
                                        }}>
                                            {isCompleted ? (
                                                <>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                                        <MaterialIcons name="check-circle" size={16} color="#10B981" />
                                                        <Text style={[textStyles.body, { color: '#10B981', fontSize: 12, fontFamily: 'Poppins-Medium' }]}>
                                                            Completed
                                                        </Text>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <TouchableOpacity
                                                            onPress={() => handleUndoComplete(sch)}
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                gap: 5,
                                                                paddingHorizontal: 14,
                                                                paddingVertical: 7,
                                                                borderRadius: 20,
                                                                backgroundColor: colors.cardFill,
                                                                borderWidth: 1,
                                                                borderColor: colors.stroke,
                                                            }}
                                                            activeOpacity={0.7}
                                                        >
                                                            <MaterialIcons name="undo" size={15} color={colors.text} />
                                                            <Text style={[textStyles.label, { color: colors.text, fontSize: 12 }]}>
                                                                Undo
                                                            </Text>
                                                        </TouchableOpacity>

                                                        <TouchableOpacity
                                                            onPress={() => confirmDeleteSchedule(sch)}
                                                            style={{
                                                                padding: 7,
                                                                borderRadius: 20,
                                                                backgroundColor: '#EF444415',
                                                                borderWidth: 1,
                                                                borderColor: '#EF444430',
                                                            }}
                                                            activeOpacity={0.7}
                                                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                        >
                                                            <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </>
                                            ) : (
                                                <>
                                                    <TouchableOpacity
                                                        onPress={() => handleMarkDone(sch)}
                                                        style={{
                                                            flex: 1,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: 6,
                                                            paddingVertical: 10,
                                                            backgroundColor: '#10B981',
                                                            borderRadius: 20,
                                                            ...Platform.select({
                                                                web: { boxShadow: '0px 2px 6px rgba(16,185,129,0.3)' },
                                                                default: { elevation: 2, shadowColor: '#10B981', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }
                                                            })
                                                        }}
                                                        activeOpacity={0.8}
                                                    >
                                                        <MaterialIcons name="check" size={18} color="#FFF" />
                                                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 13, fontFamily: 'Poppins-SemiBold' }]}>
                                                            Mark as Completed
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        onPress={() => confirmDeleteSchedule(sch)}
                                                        style={{
                                                            padding: 10,
                                                            borderRadius: 20,
                                                            backgroundColor: colors.cardFill,
                                                            borderWidth: 1,
                                                            borderColor: colors.stroke,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                        activeOpacity={0.7}
                                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                    >
                                                        <MaterialIcons name="delete-outline" size={18} color={colors.textGrey} />
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>
                )}

                {/* Circular Floating Action Add Button */}
                <TouchableOpacity
                    style={[
                        styles.fab,
                        {
                            backgroundColor: colors.primary,
                            width: 56,
                            height: 56,
                            borderRadius: 28,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...Platform.select({
                                web: { boxShadow: `0px 4px 12px ${colors.primary}66` },
                                default: { elevation: 6, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 }
                            })
                        }
                    ]}
                    onPress={() => setShowSchModal(true)}
                    activeOpacity={0.85}
                >
                    <MaterialIcons name="add" size={28} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* ── Main Add Schedule Modal (Same exact structure & design as ManageHousingsScreen) ── */}
            <Modal visible={showSchModal} transparent animationType="fade" onRequestClose={handleCloseSchModal}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%', maxWidth: 340, maxHeight: '90%' }}
                    >
                        <View style={{ backgroundColor: colors.surface, width: '100%', borderRadius: 24, padding: 24, overflow: 'hidden' }}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                                {/* Top Icon */}
                                <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                                    <MaterialIcons name="event" size={32} color={colors.primary} />
                                </View>

                                {/* Title & Subtitle */}
                                <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>
                                    Add Vaccine Schedule
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                                    Enter details for this vaccination schedule.
                                </Text>

                                {/* Pill-Shaped Form Fields */}
                                <View style={{ width: '100%', gap: 14 }}>

                                    {/* Vaccine Pill Selector */}
                                    <View style={{ width: '100%' }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                                borderRadius: 30,
                                                paddingHorizontal: 16,
                                                height: 58,
                                                backgroundColor: colors.surface,
                                            }}
                                            onPress={() => {
                                                setShowSchModal(false);
                                                setVaccineModalVisible(true);
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                <MaterialIcons name="vaccines" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                                                <Text style={[textStyles.body, { color: schVaccineName ? colors.text : colors.textGrey }]} numberOfLines={1}>
                                                    {schVaccineName || 'Select Vaccine *'}
                                                </Text>
                                            </View>
                                            <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Housing Pill Selector */}
                                    <View style={{ width: '100%' }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                                borderRadius: 30,
                                                paddingHorizontal: 16,
                                                height: 58,
                                                backgroundColor: colors.surface,
                                            }}
                                            onPress={() => {
                                                setShowSchModal(false);
                                                setHousingModalVisible(true);
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                <MaterialIcons name="home" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                                                <Text style={[textStyles.body, { color: schHousingName ? colors.text : colors.textGrey }]} numberOfLines={1}>
                                                    {schHousingName || 'Housing / Pen (optional)'}
                                                </Text>
                                            </View>
                                            <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Scheduled Date Pill Selector */}
                                    <View style={{ width: '100%' }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                borderWidth: 1.5,
                                                borderColor: colors.stroke,
                                                borderRadius: 30,
                                                paddingHorizontal: 16,
                                                height: 58,
                                                backgroundColor: colors.surface,
                                            }}
                                            onPress={openDatePickerModal}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                <MaterialIcons name="calendar-today" size={18} color={colors.primary} style={{ marginRight: 12 }} />
                                                <Text style={[textStyles.body, { color: schDate ? colors.text : colors.textGrey }]} numberOfLines={1}>
                                                    {dateDisplayValue}
                                                </Text>
                                            </View>
                                            <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Repeat Every (days) Pill Input */}
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        borderRadius: 30,
                                        paddingHorizontal: 16,
                                        height: 58,
                                        backgroundColor: colors.surface,
                                    }}>
                                        <MaterialIcons name="repeat" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                                        <TextInput
                                            value={schInterval}
                                            onChangeText={(t) => {
                                                const clean = t.replace(/[^0-9]/g, '');
                                                setSchInterval(clean);
                                            }}
                                            placeholder="Repeat Every (days) — optional"
                                            placeholderTextColor={colors.textGrey}
                                            keyboardType="number-pad"
                                            maxLength={4}
                                            style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 14, padding: 0 }]}
                                        />
                                        {schInterval ? (
                                            <TouchableOpacity onPress={() => setSchInterval('')}>
                                                <MaterialIcons name="close" size={18} color={colors.textGrey} />
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>

                                    {/* Notes / Instructions Pill Input */}
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderWidth: 1.5,
                                        borderColor: colors.stroke,
                                        borderRadius: 30,
                                        paddingHorizontal: 16,
                                        height: 58,
                                        backgroundColor: colors.surface,
                                        marginBottom: 10,
                                    }}>
                                        <MaterialIcons name="notes" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                                        <TextInput
                                            value={schNotes}
                                            onChangeText={setSchNotes}
                                            placeholder="Notes / instructions — optional"
                                            placeholderTextColor={colors.textGrey}
                                            style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 14, padding: 0 }]}
                                        />
                                    </View>
                                </View>

                                {/* Bottom Action Buttons */}
                                <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            backgroundColor: colors.cardFill,
                                            paddingVertical: 14,
                                            borderRadius: 30,
                                            alignItems: 'center',
                                        }}
                                        onPress={handleCloseSchModal}
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
                                            alignItems: 'center',
                                            flexDirection: 'row',
                                            justifyContent: 'center',
                                            gap: 6,
                                        }}
                                        onPress={handleAddSchedule}
                                        disabled={isSaveDisabled}
                                        activeOpacity={isSaveDisabled ? 1 : 0.7}
                                    >
                                        {savingSch ? (
                                            <ActivityIndicator size="small" color="#FFF" />
                                        ) : (
                                            <Text style={[textStyles.h3, { color: isSaveDisabled ? colors.textGrey : colors.onPrimary, fontSize: 14 }]}>
                                                Save
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ── Selection Modal: Vaccine (Native AniGrow SelectionModal) ── */}
            <SelectionModal
                visible={vaccineModalVisible}
                onClose={() => {
                    setVaccineModalVisible(false);
                    setShowSchModal(true);
                }}
                onSelect={val => {
                    const item = vaccineList.find(v => v.name === val);
                    if (item) {
                        setSchVaccineId(item.id);
                        setSchVaccineName(item.name);
                    }
                    setVaccineModalVisible(false);
                    setShowSchModal(true);
                }}
                title="Select Vaccine"
                description="Choose a registered vaccine for this schedule."
                icon="vaccines"
                options={Array.from(new Set(vaccineList.map(v => v.name).filter(Boolean)))}
                selectedValue={schVaccineName}
                requireConfirm={false}
                enableSearch={true}
            />

            {/* ── Selection Modal: Housing (Native AniGrow SelectionModal) ── */}
            <SelectionModal
                visible={housingModalVisible}
                onClose={() => {
                    setHousingModalVisible(false);
                    setShowSchModal(true);
                }}
                onSelect={val => {
                    if (val === '— None / Farm-wide —') {
                        setSchHousingId('');
                        setSchHousingName('');
                    } else {
                        const h = housings.find(x => x.name === val);
                        if (h) {
                            setSchHousingId(h.id);
                            setSchHousingName(h.name);
                        }
                    }
                    setHousingModalVisible(false);
                    setShowSchModal(true);
                }}
                title="Select Housing / Pen"
                description="Choose the housing location for this vaccination schedule."
                icon="home"
                options={['— None / Farm-wide —', ...Array.from(new Set(housings.map(h => h.name).filter(Boolean)))]}
                selectedValue={schHousingName || '— None / Farm-wide —'}
                requireConfirm={false}
                enableSearch={false}
            />

            {/* ── Single Active Calendar Modal (Transitions back seamlessly to Add Schedule) ── */}
            <Modal
                visible={dateModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setDateModalVisible(false);
                    setShowSchModal(true);
                }}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{
                        backgroundColor: colors.surface,
                        width: '100%',
                        maxWidth: 340,
                        borderRadius: 24,
                        padding: 24,
                        overflow: 'hidden',
                    }}>
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 14, fontSize: 18 }]}>
                            Select Scheduled Date
                        </Text>

                        {/* Month & Year Navigation */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <TouchableOpacity
                                onPress={prevCalMonth}
                                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <MaterialIcons name="chevron-left" size={22} color={colors.text} />
                            </TouchableOpacity>
                            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 15, color: colors.text }}>
                                {MONTH_NAMES[calMonth]} {calYear}
                            </Text>
                            <TouchableOpacity
                                onPress={nextCalMonth}
                                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <MaterialIcons name="chevron-right" size={22} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Day-of-week headers */}
                        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                            {DAY_NAMES.map(d => (
                                <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                                    <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: colors.textGrey }}>{d}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Calendar grid */}
                        {Array.from({ length: calCells.length / 7 }, (_, row) => (
                            <View key={row} style={{ flexDirection: 'row', marginBottom: 4 }}>
                                {calCells.slice(row * 7, row * 7 + 7).map((day, col) => {
                                    if (day === null) {
                                        return <View key={col} style={{ flex: 1, height: 36 }} />;
                                    }

                                    const isSelected = selectedCalDate &&
                                        selectedCalDate.getFullYear() === calYear &&
                                        selectedCalDate.getMonth() === calMonth &&
                                        selectedCalDate.getDate() === day;
                                    const isToday = todayObj.getFullYear() === calYear &&
                                        todayObj.getMonth() === calMonth &&
                                        todayObj.getDate() === day;
                                    const dots = getDateScheduleDots(calYear, calMonth, day);

                                    return (
                                        <View key={col} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    const mm = String(calMonth + 1).padStart(2, '0');
                                                    const dd = String(day).padStart(2, '0');
                                                    setSchDate(`${calYear}-${mm}-${dd}`);
                                                    setDateModalVisible(false);
                                                    setShowSchModal(true);
                                                }}
                                                activeOpacity={0.75}
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 18,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: isSelected ? colors.primary : isToday ? colors.primary + '18' : dots.length > 0 ? colors.cardFill : 'transparent',
                                                    borderWidth: isToday && !isSelected ? 1.5 : 0,
                                                    borderColor: colors.primary,
                                                }}
                                            >
                                                <Text style={{
                                                    fontFamily: isSelected || isToday ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                    fontSize: 12,
                                                    color: isSelected ? '#fff' : isToday ? colors.primary : colors.text,
                                                    marginBottom: dots.length > 0 ? 2 : 0,
                                                }}>
                                                    {day}
                                                </Text>
                                                {dots.length > 0 && (
                                                    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                                                        {dots.map((dotColor, dotIdx) => (
                                                            <View
                                                                key={dotIdx}
                                                                style={{
                                                                    width: 4,
                                                                    height: 4,
                                                                    borderRadius: 2,
                                                                    backgroundColor: isSelected ? '#FFF' : dotColor,
                                                                }}
                                                            />
                                                        ))}
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                        ))}

                        {/* Legend / Dots guide */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.stroke }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Overdue</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F97316' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Due Soon</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Pending</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                                <Text style={{ fontSize: 10, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>Done</Text>
                            </View>
                        </View>

                        {/* Action Buttons: Cancel & Today */}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity
                                onPress={() => {
                                    setDateModalVisible(false);
                                    setShowSchModal(true);
                                }}
                                style={{ flex: 1, paddingVertical: 14, borderRadius: 30, backgroundColor: colors.cardFill, alignItems: 'center' }}
                            >
                                <Text style={[textStyles.h3, { fontSize: 13, color: colors.textGrey }]}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
                                    const dd = String(todayObj.getDate()).padStart(2, '0');
                                    setSchDate(`${todayObj.getFullYear()}-${mm}-${dd}`);
                                    setDateModalVisible(false);
                                    setShowSchModal(true);
                                }}
                                style={{ flex: 1, paddingVertical: 14, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center' }}
                            >
                                <Text style={[textStyles.h3, { fontSize: 13, color: colors.onPrimary }]}>
                                    Today
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── Delete Confirmation ActionModal (Same exact modal as ManageHousingsScreen) ── */}
            <ActionModal
                visible={deleteModalVisible}
                type="warning"
                title="Delete Schedule?"
                message={
                    scheduleToDelete
                        ? `Are you sure you want to delete the schedule for "${scheduleToDelete.vaccine_name}"? This action cannot be undone.`
                        : 'Are you sure you want to delete this schedule?'
                }
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={executeDeleteSchedule}
                onCancel={() => {
                    if (!isDeleting) {
                        setDeleteModalVisible(false);
                        setScheduleToDelete(null);
                    }
                }}
                isLoading={isDeleting}
            />

            <Snackbar
                visible={snackVisible}
                message={snackMessage}
                type={snackType}
                onDismiss={() => setSnackVisible(false)}
            />
        </SafeAreaView>
    );
}

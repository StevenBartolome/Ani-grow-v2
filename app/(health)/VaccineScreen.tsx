/**
 * VaccineScreen
 *
 * Three-tab vaccine management screen:
 *   Records   — full vaccination history with withdrawal tracking
 *   Schedule  — upcoming & overdue vaccinations
 *   Inventory — vaccine stock, low-stock & expiry alerts
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
    Animated,
    PanResponder,
    Easing,
} from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useVaccineStyles } from '@/styles/vaccineStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'records' | 'schedule' | 'inventory';

interface VaccineItem {
    id: string;
    name: string;
    vaccine_type?: string;
    species: string;
    stock_quantity: number;
    unit: string;
    dose_per_animal?: number;
    withdrawal_days: number;
    reorder_threshold: number;
    storage_temp?: string;
    route: string;
}

interface VaccinationRecord {
    id: string;
    vaccine_name: string;
    administered_date: string;
    housing_id?: string;
    housing?: { name: string } | null;
    animals_vaccinated?: number;
    total_dose_used?: number;
    unit: string;
    lot_number?: string;
    withdrawal_end_date?: string;
    administered_by?: string;
    notes?: string;
}

interface VaccinationSchedule {
    id: string;
    vaccine_id?: string;
    vaccine_name: string;
    scheduled_date: string;
    housing_id?: string;
    housing?: { name: string } | null;
    status: 'pending' | 'completed' | 'overdue' | 'cancelled';
    interval_days?: number;
    notes?: string;
}

interface BatchOption {
    id: string;
    housing_id: string;
    housing_name: string;
    species: string;
    current_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0];

const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

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

const withdrawalLabel = (endDate?: string): { label: string; color: string } => {
    if (!endDate) return { label: 'No withdrawal', color: '#6B7280' };
    const days = daysUntil(endDate);
    if (days <= 0) return { label: 'Cleared for sale', color: '#10B981' };
    return { label: `${days}d withdrawal left`, color: '#F59E0B' };
};

const scheduleColor = (status: string, date: string): string => {
    if (status === 'completed') return '#10B981';
    if (status === 'cancelled') return '#6B7280';
    if (status === 'overdue' || daysUntil(date) < 0) return '#EF4444';
    if (daysUntil(date) <= 2) return '#F97316';
    return '#3B82F6';
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function VaccineScreen() {
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useVaccineStyles();
    const router = useRouter();

    const primaryFarmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const userName = (profile as any)?.displayName || (profile as any)?.firstName || 'Admin';

    // ── Tabs ──────────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<Tab>('records');

    // ── Data ──────────────────────────────────────────────────────────────────
    const [records, setRecords]       = useState<VaccinationRecord[]>([]);
    const [schedules, setSchedules]   = useState<VaccinationSchedule[]>([]);
    const [inventory, setInventory]   = useState<VaccineItem[]>([]);
    const [batches, setBatches]       = useState<BatchOption[]>([]);
    const [isLoading, setIsLoading]   = useState(true);

    // ── Snackbar ──────────────────────────────────────────────────────────────
    const [snackVisible, setSnackVisible]   = useState(false);
    const [snackMessage, setSnackMessage]   = useState('');
    const [snackType, setSnackType]         = useState<SnackbarType>('success');
    const showSnack = (msg: string, type: SnackbarType = 'success') => {
        setSnackMessage(msg); setSnackType(type); setSnackVisible(true);
    };

    // ── Modal: Log Vaccination ────────────────────────────────────────────────
    const [showRecModal, setShowRecModal] = useState(false);
    const [recBatchId,  setRecBatchId]    = useState('');
    const [recVaccineId, setRecVaccineId] = useState('');
    const [recDate,     setRecDate]       = useState(TODAY);
    const [recAnimals,  setRecAnimals]    = useState('');
    const [recDose,     setRecDose]       = useState('');
    const [recLot,      setRecLot]        = useState('');
    const [recExpiry,   setRecExpiry]     = useState('');
    const [recBy,       setRecBy]         = useState(userName);
    const [recNotes,    setRecNotes]      = useState('');
    const [savingRec,   setSavingRec]     = useState(false);

    // ── Modal: Add Schedule ───────────────────────────────────────────────────
    const [showSchModal, setShowSchModal] = useState(false);
    const [schBatchId,  setSchBatchId]    = useState('');
    const [schVaccineId, setSchVaccineId] = useState('');
    const [schDate,     setSchDate]       = useState(TODAY);
    const [schInterval, setSchInterval]   = useState('');
    const [schNotes,    setSchNotes]      = useState('');
    const [savingSch,   setSavingSch]     = useState(false);

    // ── Modal: Add Vaccine Inventory ──────────────────────────────────────────
    const [showInvModal, setShowInvModal] = useState(false);
    const [invName,       setInvName]       = useState('');
    const [invType,       setInvType]       = useState('');
    const [invSpecies,    setInvSpecies]    = useState<'chicken' | 'pig' | 'both'>('both');
    const [invStock,      setInvStock]      = useState('');
    const [invUnit,       setInvUnit]       = useState<'dose' | 'ml' | 'vial'>('dose');
    const [invDose,       setInvDose]       = useState('');
    const [invWithdrawal, setInvWithdrawal] = useState('0');
    const [invReorder,    setInvReorder]    = useState('10');
    const [invRoute,      setInvRoute]      = useState('injection');
    const [invTemp,       setInvTemp]       = useState('');
    const [invNotes,      setInvNotes]      = useState('');
    const [savingInv,     setSavingInv]     = useState(false);

    // ── Animations for Log Vaccination Modal ──
    const slideRec = useRef(new Animated.Value(600)).current;
    const panYRec = useRef(new Animated.Value(0)).current;
    const closeRecModalRef = useRef<() => void>(undefined);
    const isScrollAtTopRec = useRef(true);

    const panRecResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && isScrollAtTopRec.current;
            },
            onPanResponderGrant: () => {
                panYRec.setOffset(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panYRec.setValue(gestureState.dy);
                } else {
                    panYRec.setValue(gestureState.dy * 0.2);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    Animated.timing(panYRec, {
                        toValue: 600,
                        duration: 150,
                        easing: Easing.linear,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        slideRec.setValue(600);
                        panYRec.setValue(0);
                        closeRecModalRef.current?.();
                    });
                } else {
                    Animated.spring(panYRec, {
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
        if (showRecModal) {
            panYRec.setValue(0);
            Animated.spring(slideRec, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideRec.setValue(600);
        }
    }, [showRecModal]);

    closeRecModalRef.current = () => {
        setShowRecModal(false);
        resetRecForm();
    };

    const handleCloseRecModal = () => {
        Animated.timing(slideRec, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeRecModalRef.current?.();
        });
    };

    // ── Animations for Add Schedule Modal ──
    const slideSch = useRef(new Animated.Value(600)).current;
    const panYSch = useRef(new Animated.Value(0)).current;
    const closeSchModalRef = useRef<() => void>(undefined);
    const isScrollAtTopSch = useRef(true);

    const panSchResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && isScrollAtTopSch.current;
            },
            onPanResponderGrant: () => {
                panYSch.setOffset(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panYSch.setValue(gestureState.dy);
                } else {
                    panYSch.setValue(gestureState.dy * 0.2);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    Animated.timing(panYSch, {
                        toValue: 600,
                        duration: 150,
                        easing: Easing.linear,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        slideSch.setValue(600);
                        panYSch.setValue(0);
                        closeSchModalRef.current?.();
                    });
                } else {
                    Animated.spring(panYSch, {
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
        if (showSchModal) {
            panYSch.setValue(0);
            Animated.spring(slideSch, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideSch.setValue(600);
        }
    }, [showSchModal]);

    closeSchModalRef.current = () => {
        setShowSchModal(false);
        resetSchForm();
    };

    const handleCloseSchModal = () => {
        Animated.timing(slideSch, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeSchModalRef.current?.();
        });
    };

    // ── Animations for Add Vaccine Modal ──
    const slideInv = useRef(new Animated.Value(600)).current;
    const panYInv = useRef(new Animated.Value(0)).current;
    const closeInvModalRef = useRef<() => void>(undefined);
    const isScrollAtTopInv = useRef(true);

    const panInvResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && isScrollAtTopInv.current;
            },
            onPanResponderGrant: () => {
                panYInv.setOffset(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panYInv.setValue(gestureState.dy);
                } else {
                    panYInv.setValue(gestureState.dy * 0.2);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    Animated.timing(panYInv, {
                        toValue: 600,
                        duration: 150,
                        easing: Easing.linear,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start(() => {
                        slideInv.setValue(600);
                        panYInv.setValue(0);
                        closeInvModalRef.current?.();
                    });
                } else {
                    Animated.spring(panYInv, {
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
        if (showInvModal) {
            panYInv.setValue(0);
            Animated.spring(slideInv, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 50, friction: 9 }).start();
        } else {
            slideInv.setValue(600);
        }
    }, [showInvModal]);

    closeInvModalRef.current = () => {
        setShowInvModal(false);
        resetInvForm();
    };

    const handleCloseInvModal = () => {
        Animated.timing(slideInv, {
            toValue: 600,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
            closeInvModalRef.current?.();
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Data loading
    // ─────────────────────────────────────────────────────────────────────────

    const loadBatches = useCallback(async () => {
        if (!primaryFarmId) return;
        const { data } = await supabase
            .from('batches')
            .select('id, housing_id, species, current_count, housings(name)')
            .in('farm_id', activeFarmIds)
            .eq('status', 'active');
        setBatches((data || []).map((b: any) => ({
            id: b.id,
            housing_id: b.housing_id,
            housing_name: b.housings?.name || 'Unknown',
            species: b.species,
            current_count: b.current_count || 0,
        })));
    }, [activeFarmIds, primaryFarmId]);

    const loadRecords = useCallback(async () => {
        if (!primaryFarmId) return;
        const { data, error } = await supabase
            .from('vaccination_records')
            .select('*, housings(name)')
            .in('farm_id', activeFarmIds)
            .order('administered_date', { ascending: false })
            .limit(100);
        if (!error) setRecords(data || []);
    }, [activeFarmIds, primaryFarmId]);

    const loadSchedules = useCallback(async () => {
        if (!primaryFarmId) return;
        // Mark overdue before fetching
        await supabase
            .from('vaccination_schedules')
            .update({ status: 'overdue' })
            .in('farm_id', activeFarmIds)
            .eq('status', 'pending')
            .lt('scheduled_date', TODAY);

        const { data, error } = await supabase
            .from('vaccination_schedules')
            .select('*, housings(name)')
            .in('farm_id', activeFarmIds)
            .neq('status', 'cancelled')
            .order('scheduled_date', { ascending: true });
        if (!error) setSchedules(data || []);
    }, [activeFarmIds, primaryFarmId]);

    const loadInventory = useCallback(async () => {
        if (!primaryFarmId) return;
        const { data, error } = await supabase
            .from('vaccines')
            .select('*')
            .in('farm_id', activeFarmIds)
            .order('name', { ascending: true });
        if (!error) setInventory(data || []);
    }, [activeFarmIds, primaryFarmId]);

    const loadAll = useCallback(async () => {
        setIsLoading(true);
        await Promise.all([loadRecords(), loadSchedules(), loadInventory(), loadBatches()]);
        setIsLoading(false);
    }, [loadRecords, loadSchedules, loadInventory, loadBatches]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ─────────────────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────────────────

    /** Log a vaccination event */
    const handleLogVaccination = async () => {
        if (!recVaccineId) { showSnack('Select a vaccine.', 'error'); return; }
        if (!recDate)      { showSnack('Enter the date.', 'error'); return; }
        setSavingRec(true);
        try {
            const vaccineItem = inventory.find(v => v.id === recVaccineId);
            const batch       = batches.find(b => b.id === recBatchId);
            const animals     = parseInt(recAnimals) || batch?.current_count || 0;
            const dose        = parseFloat(recDose)  || vaccineItem?.dose_per_animal || 0;
            const totalDose   = animals && dose ? animals * dose : undefined;
            const wdDays      = vaccineItem?.withdrawal_days || 0;
            const wdEnd       = wdDays > 0 ? addDays(recDate, wdDays) : undefined;

            const { error: recErr } = await supabase.from('vaccination_records').insert({
                farm_id:             primaryFarmId,
                batch_id:            recBatchId || null,
                housing_id:          batch?.housing_id || null,
                vaccine_id:          recVaccineId,
                vaccine_name:        vaccineItem?.name || 'Unknown',
                administered_date:   recDate,
                administered_by:     recBy || null,
                animals_vaccinated:  animals || null,
                dose_per_animal:     dose || null,
                total_dose_used:     totalDose || null,
                unit:                vaccineItem?.unit || 'dose',
                lot_number:          recLot || null,
                expiry_date:         recExpiry || null,
                withdrawal_days:     wdDays,
                withdrawal_end_date: wdEnd || null,
                route:               vaccineItem?.route || null,
                notes:               recNotes || null,
            });
            if (recErr) throw recErr;

            // Deduct from stock
            if (totalDose && vaccineItem) {
                await supabase
                    .from('vaccines')
                    .update({ stock_quantity: Math.max(0, vaccineItem.stock_quantity - totalDose) })
                    .eq('id', recVaccineId);
            }

            handleCloseRecModal();
            showSnack('Vaccination logged successfully!');
            loadRecords(); loadInventory();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to log vaccination.', 'error');
        } finally {
            setSavingRec(false);
        }
    };

    /** Add a scheduled vaccination */
    const handleAddSchedule = async () => {
        if (!schVaccineId) { showSnack('Select a vaccine.', 'error'); return; }
        if (!schDate)      { showSnack('Select a date.', 'error'); return; }
        setSavingSch(true);
        try {
            const vaccineItem = inventory.find(v => v.id === schVaccineId);
            const batch       = batches.find(b => b.id === schBatchId);
            const { error } = await supabase.from('vaccination_schedules').insert({
                farm_id:       primaryFarmId,
                batch_id:      schBatchId || null,
                housing_id:    batch?.housing_id || null,
                vaccine_id:    schVaccineId,
                vaccine_name:  vaccineItem?.name || 'Unknown',
                scheduled_date: schDate,
                interval_days: schInterval ? parseInt(schInterval) : null,
                status:        'pending',
                notes:         schNotes || null,
            });
            if (error) throw error;
            handleCloseSchModal();
            showSnack('Schedule added!');
            loadSchedules();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to add schedule.', 'error');
        } finally {
            setSavingSch(false);
        }
    };

    /** Mark a scheduled vaccination as done — opens log form pre-filled */
    const handleMarkDone = async (schedule: VaccinationSchedule) => {
        // Pre-fill log form from schedule
        setRecVaccineId(schedule.vaccine_id || '');
        setRecDate(TODAY);
        setRecNotes(schedule.notes || '');
        setShowRecModal(true);
        // Also update schedule status
        await supabase
            .from('vaccination_schedules')
            .update({ status: 'completed' })
            .eq('id', schedule.id);
        loadSchedules();
    };

    /** Add vaccine to inventory */
    const handleAddVaccine = async () => {
        if (!invName.trim()) { showSnack('Vaccine name is required.', 'error'); return; }
        setSavingInv(true);
        try {
            const { error } = await supabase.from('vaccines').insert({
                farm_id:           primaryFarmId,
                name:              invName.trim(),
                vaccine_type:      invType || null,
                species:           invSpecies,
                stock_quantity:    parseFloat(invStock) || 0,
                unit:              invUnit,
                dose_per_animal:   parseFloat(invDose) || null,
                withdrawal_days:   parseInt(invWithdrawal) || 0,
                reorder_threshold: parseFloat(invReorder) || 10,
                route:             invRoute,
                storage_temp:      invTemp || null,
                notes:             invNotes || null,
            });
            if (error) throw error;
            handleCloseInvModal();
            showSnack(`"${invName}" added to inventory!`);
            loadInventory();
        } catch (err: any) {
            showSnack(err?.message || 'Failed to add vaccine.', 'error');
        } finally {
            setSavingInv(false);
        }
    };

    // ── Form reset helpers ────────────────────────────────────────────────────
    const resetRecForm = () => { setRecBatchId(''); setRecVaccineId(''); setRecDate(TODAY); setRecAnimals(''); setRecDose(''); setRecLot(''); setRecExpiry(''); setRecBy(userName); setRecNotes(''); };
    const resetSchForm = () => { setSchBatchId(''); setSchVaccineId(''); setSchDate(TODAY); setSchInterval(''); setSchNotes(''); };
    const resetInvForm = () => { setInvName(''); setInvType(''); setInvSpecies('both'); setInvStock(''); setInvUnit('dose'); setInvDose(''); setInvWithdrawal('0'); setInvReorder('10'); setInvRoute('injection'); setInvTemp(''); setInvNotes(''); };

    // ─────────────────────────────────────────────────────────────────────────
    // Render helpers
    // ─────────────────────────────────────────────────────────────────────────

    const lowStockCount  = inventory.filter(v => v.stock_quantity <= v.reorder_threshold).length;
    const overdueCount   = schedules.filter(s => s.status === 'overdue').length;
    const dueSoonCount   = schedules.filter(s => s.status === 'pending' && daysUntil(s.scheduled_date) <= 3).length;

    const renderTab = (id: Tab, label: string, badge?: number) => (
        <TouchableOpacity
            key={id}
            style={[styles.tabItem, activeTab === id && styles.tabItemActive]}
            onPress={() => setActiveTab(id)}
            activeOpacity={0.7}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[textStyles.label, {
                    fontSize: 12,
                    color: activeTab === id ? colors.text : colors.textGrey,
                    fontFamily: activeTab === id ? 'Poppins-SemiBold' : 'Poppins-Regular',
                }]}>
                    {label}
                </Text>
                {!!badge && (
                    <View style={{ backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                        <Text style={{ color: '#FFF', fontSize: 9, fontFamily: 'Poppins-Bold' }}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );

    const BatchSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <View>
            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>Batch / Housing (optional)</Text>
            <TouchableOpacity style={styles.selectRow} activeOpacity={0.7}
                onPress={() => {
                    // Cycle through batches or show a simple alert picker
                    const opts = [{ id: '', label: '— None —' }, ...batches.map(b => ({ id: b.id, label: `${b.housing_name} (${b.species}, ${b.current_count})` }))];
                    const currentIdx = opts.findIndex(o => o.id === value);
                    const next = opts[(currentIdx + 1) % opts.length];
                    onChange(next.id);
                }}
            >
                <Text style={[textStyles.body, { color: value ? colors.text : colors.textGrey, fontSize: 14 }]}>
                    {value ? batches.find(b => b.id === value)
                        ? `${batches.find(b => b.id === value)!.housing_name} (${batches.find(b => b.id === value)!.current_count})`
                        : '—' : '— Select batch —'}
                </Text>
                <MaterialIcons name="expand-more" size={20} color={colors.textGrey} />
            </TouchableOpacity>
        </View>
    );

    const VaccineSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <View>
            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>Vaccine *</Text>
            <TouchableOpacity style={[styles.selectRow, { borderColor: value ? colors.stroke : '#EF4444' + '60' }]} activeOpacity={0.7}
                onPress={() => {
                    const opts = [{ id: '', label: '— Select vaccine —' }, ...inventory.map(v => ({ id: v.id, label: `${v.name} (${v.stock_quantity} ${v.unit})` }))];
                    const currentIdx = opts.findIndex(o => o.id === value);
                    const next = opts[(currentIdx + 1) % opts.length];
                    onChange(next.id);
                }}
            >
                <Text style={[textStyles.body, { color: value ? colors.text : colors.textGrey, fontSize: 14 }]}>
                    {value ? inventory.find(v => v.id === value)?.name || '—' : '— Select vaccine —'}
                </Text>
                <MaterialIcons name="expand-more" size={20} color={colors.textGrey} />
            </TouchableOpacity>
            {inventory.length === 0 && (
                <Text style={[textStyles.body, { color: '#F59E0B', fontSize: 11, marginTop: 4 }]}>
                    No vaccines in inventory. Add one in the Inventory tab first.
                </Text>
            )}
        </View>
    );

    const FormInput = ({ label, value, onChange, placeholder, keyboardType = 'default', editable = true }: any) => (
        <View>
            <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>{label}</Text>
            <View style={styles.inputRow}>
                <TextInput
                    value={value} onChangeText={onChange}
                    placeholder={placeholder} placeholderTextColor={colors.textGrey}
                    keyboardType={keyboardType} editable={editable}
                    style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 14, padding: 0 }]}
                />
            </View>
        </View>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Tab content
    // ─────────────────────────────────────────────────────────────────────────

    const RecordsTab = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}>
            {records.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '15' }]}>
                        <MaterialIcons name="vaccines" size={30} color={colors.primary} />
                    </View>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>No Records Yet</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                        Tap + to log your first vaccination.
                    </Text>
                </View>
            ) : records.map(rec => {
                const wd = withdrawalLabel(rec.withdrawal_end_date);
                return (
                    <View key={rec.id} style={styles.card}>
                        <View style={styles.cardRow}>
                            <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                                <MaterialIcons name="vaccines" size={20} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{rec.vaccine_name}</Text>
                                {rec.housing && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{rec.housing.name}</Text>
                                )}
                            </View>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{formatDate(rec.administered_date)}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {rec.animals_vaccinated != null && (
                                <View style={[styles.chip, { backgroundColor: colors.primary + '12' }]}>
                                    <MaterialIcons name="pets" size={12} color={colors.primary} />
                                    <Text style={[textStyles.label, { color: colors.primary, fontSize: 11 }]}>{rec.animals_vaccinated} animals</Text>
                                </View>
                            )}
                            {rec.total_dose_used != null && (
                                <View style={[styles.chip, { backgroundColor: '#6C63FF' + '12' }]}>
                                    <MaterialIcons name="science" size={12} color="#6C63FF" />
                                    <Text style={[textStyles.label, { color: '#6C63FF', fontSize: 11 }]}>{rec.total_dose_used} {rec.unit} used</Text>
                                </View>
                            )}
                            <View style={[styles.chip, { backgroundColor: wd.color + '12' }]}>
                                <MaterialIcons name="timer" size={12} color={wd.color} />
                                <Text style={[textStyles.label, { color: wd.color, fontSize: 11 }]}>{wd.label}</Text>
                            </View>
                        </View>

                        {(rec.lot_number || rec.administered_by) && (
                            <View style={{ marginTop: 8, gap: 2 }}>
                                {rec.lot_number && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>Lot: {rec.lot_number}</Text>
                                )}
                                {rec.administered_by && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>By: {rec.administered_by}</Text>
                                )}
                            </View>
                        )}
                    </View>
                );
            })}
        </ScrollView>
    );

    const ScheduleTab = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}>
            {schedules.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={[styles.emptyIcon, { backgroundColor: '#3B82F6' + '15' }]}>
                        <MaterialIcons name="event" size={30} color="#3B82F6" />
                    </View>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>No Schedule Yet</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                        Tap + to plan upcoming vaccinations.
                    </Text>
                </View>
            ) : schedules.map(sch => {
                const color  = scheduleColor(sch.status, sch.scheduled_date);
                const d      = daysUntil(sch.scheduled_date);
                const dLabel = sch.status === 'completed' ? 'Done'
                    : sch.status === 'overdue' ? `${Math.abs(d)}d overdue`
                    : d === 0 ? 'Today!'
                    : d === 1 ? 'Tomorrow'
                    : `In ${d} days`;
                return (
                    <View key={sch.id} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: color }]}>
                        <View style={styles.cardRow}>
                            <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
                                <MaterialIcons name="event" size={20} color={color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{sch.vaccine_name}</Text>
                                {sch.housing && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{sch.housing.name}</Text>
                                )}
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>{formatDate(sch.scheduled_date)}</Text>
                                <View style={[styles.chip, { backgroundColor: color + '15' }]}>
                                    <Text style={[textStyles.label, { color, fontSize: 10 }]}>{dLabel}</Text>
                                </View>
                            </View>
                        </View>

                        {sch.interval_days && (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 6 }]}>
                                🔁 Recurring every {sch.interval_days} days
                            </Text>
                        )}

                        {sch.status === 'pending' || sch.status === 'overdue' ? (
                            <TouchableOpacity
                                onPress={() => handleMarkDone(sch)}
                                style={{
                                    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                    gap: 6, paddingVertical: 9,
                                    backgroundColor: '#10B981' + '12',
                                    borderRadius: 10, borderWidth: 1, borderColor: '#10B981' + '30',
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="check-circle" size={16} color="#10B981" />
                                <Text style={[textStyles.label, { color: '#10B981', fontSize: 12 }]}>Mark as Done</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                );
            })}
        </ScrollView>
    );

    const InventoryTab = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}>
            {lowStockCount > 0 && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: '#F59E0B' + '12',
                    borderRadius: 14, padding: 14, marginHorizontal: 20, marginBottom: 12,
                    borderWidth: 1, borderColor: '#F59E0B' + '30',
                }}>
                    <MaterialIcons name="warning" size={16} color="#F59E0B" />
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, flex: 1 }]}>
                        <Text style={{ color: '#F59E0B', fontFamily: 'Poppins-SemiBold' }}>{lowStockCount} vaccine{lowStockCount > 1 ? 's' : ''}</Text> below reorder threshold.
                    </Text>
                </View>
            )}
            {inventory.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={[styles.emptyIcon, { backgroundColor: '#10B981' + '15' }]}>
                        <MaterialIcons name="medication" size={30} color="#10B981" />
                    </View>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 17 }]}>No Vaccines</Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center' }]}>
                        Tap + to add vaccines to your inventory.
                    </Text>
                </View>
            ) : inventory.map((vax, idx) => {
                const isLow    = vax.stock_quantity <= vax.reorder_threshold;
                const color    = isLow ? '#EF4444' : '#10B981';
                const specColor = vax.species === 'chicken' ? '#F59E0B' : vax.species === 'pig' ? '#F97316' : '#6C63FF';
                return (
                    <View key={vax.id} style={[styles.card, isLow && { borderColor: '#EF4444' + '40' }]}>
                        <View style={styles.cardRow}>
                            <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
                                <MaterialIcons name="medication" size={20} color={color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>{vax.name}</Text>
                                {vax.vaccine_type && (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>{vax.vaccine_type}</Text>
                                )}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[textStyles.h3, { color: isLow ? '#EF4444' : colors.text, fontSize: 18 }]}>
                                    {vax.stock_quantity}
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>{vax.unit}</Text>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            <View style={[styles.chip, { backgroundColor: specColor + '12' }]}>
                                <Text style={[textStyles.label, { color: specColor, fontSize: 11 }]}>
                                    {vax.species === 'both' ? 'Chicken & Pig' : vax.species.charAt(0).toUpperCase() + vax.species.slice(1)}
                                </Text>
                            </View>
                            <View style={[styles.chip, { backgroundColor: '#F59E0B' + '12' }]}>
                                <MaterialIcons name="timer" size={12} color="#F59E0B" />
                                <Text style={[textStyles.label, { color: '#F59E0B', fontSize: 11 }]}>{vax.withdrawal_days}d withdrawal</Text>
                            </View>
                            <View style={[styles.chip, { backgroundColor: colors.primary + '12' }]}>
                                <Text style={[textStyles.label, { color: colors.primary, fontSize: 11 }]}>{vax.route}</Text>
                            </View>
                            {isLow && (
                                <View style={[styles.chip, { backgroundColor: '#EF4444' + '12' }]}>
                                    <MaterialIcons name="warning" size={12} color="#EF4444" />
                                    <Text style={[textStyles.label, { color: '#EF4444', fontSize: 11 }]}>Low stock</Text>
                                </View>
                            )}
                        </View>

                        {vax.storage_temp && (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 8 }]}>
                                🌡 Store at {vax.storage_temp}
                            </Text>
                        )}
                    </View>
                );
            })}
        </ScrollView>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    const fabAction = activeTab === 'records'   ? () => setShowRecModal(true)
                    : activeTab === 'schedule'  ? () => setShowSchModal(true)
                    : () => setShowInvModal(true);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

                {/* Header */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(dashboard)/HomeScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Vaccines
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                {/* Summary chips */}
                {!isLoading && (overdueCount > 0 || dueSoonCount > 0 || lowStockCount > 0) && (
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12, flexWrap: 'wrap' }}>
                        {overdueCount > 0 && (
                            <View style={[styles.chip, { backgroundColor: '#EF4444' + '12', paddingHorizontal: 10, paddingVertical: 6 }]}>
                                <MaterialIcons name="error" size={14} color="#EF4444" />
                                <Text style={[textStyles.label, { color: '#EF4444', fontSize: 12 }]}>{overdueCount} Overdue</Text>
                            </View>
                        )}
                        {dueSoonCount > 0 && (
                            <View style={[styles.chip, { backgroundColor: '#F97316' + '12', paddingHorizontal: 10, paddingVertical: 6 }]}>
                                <MaterialIcons name="schedule" size={14} color="#F97316" />
                                <Text style={[textStyles.label, { color: '#F97316', fontSize: 12 }]}>{dueSoonCount} Due Soon</Text>
                            </View>
                        )}
                        {lowStockCount > 0 && (
                            <View style={[styles.chip, { backgroundColor: '#F59E0B' + '12', paddingHorizontal: 10, paddingVertical: 6 }]}>
                                <MaterialIcons name="warning" size={14} color="#F59E0B" />
                                <Text style={[textStyles.label, { color: '#F59E0B', fontSize: 12 }]}>{lowStockCount} Low Stock</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Tab Bar */}
                <View style={styles.tabBar}>
                    {renderTab('records',   'Records')}
                    {renderTab('schedule',  'Schedule', overdueCount + dueSoonCount || undefined)}
                    {renderTab('inventory', 'Inventory', lowStockCount || undefined)}
                </View>

                {/* Tab Content */}
                {isLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : activeTab === 'records'   ? <RecordsTab />
                  : activeTab === 'schedule'  ? <ScheduleTab />
                  : <InventoryTab />}

                {/* FAB */}
                <TouchableOpacity
                    style={[styles.fab, { backgroundColor: colors.primary }]}
                    onPress={fabAction}
                    activeOpacity={0.85}
                >
                    <MaterialIcons name="add" size={26} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* ── Log Vaccination Modal ─────────────────────────────────────── */}
            <Modal visible={showRecModal} transparent animationType="fade" onRequestClose={handleCloseRecModal}>
                <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={() => !savingRec && handleCloseRecModal()}
                    />
                    <Animated.View {...panRecResponder.panHandlers} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', transform: [{ translateY: Animated.add(slideRec, panYRec) }] }}>
                        {/* Draggable Header */}
                        <View style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                            <View style={styles.modalHandle} />
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center', marginTop: 4 }]}>Log Vaccination</Text>
                        </View>
                        <ScrollView
                            onScroll={(e) => {
                                isScrollAtTopRec.current = e.nativeEvent.contentOffset.y <= 0;
                            }}
                            scrollEventThrottle={16}
                            contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 60, gap: 16 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <VaccineSelect value={recVaccineId} onChange={v => {
                                setRecVaccineId(v);
                                const item = inventory.find(i => i.id === v);
                                if (item?.dose_per_animal) setRecDose(String(item.dose_per_animal));
                            }} />
                            <BatchSelect value={recBatchId} onChange={v => {
                                setRecBatchId(v);
                                const b = batches.find(x => x.id === v);
                                if (b) setRecAnimals(String(b.current_count));
                            }} />
                            <FormInput label="Date *" value={recDate} onChange={setRecDate} placeholder="YYYY-MM-DD" />
                            <FormInput label="Animals Vaccinated" value={recAnimals} onChange={setRecAnimals} placeholder="e.g. 120" keyboardType="numeric" />
                            <FormInput label="Dose per Animal" value={recDose} onChange={setRecDose} placeholder="e.g. 1" keyboardType="decimal-pad" />
                            <FormInput label="Lot Number" value={recLot} onChange={setRecLot} placeholder="e.g. LOT2024-001" />
                            <FormInput label="Vaccine Expiry Date" value={recExpiry} onChange={setRecExpiry} placeholder="YYYY-MM-DD" />
                            <FormInput label="Administered By" value={recBy} onChange={setRecBy} placeholder="Name or staff ID" />
                            <FormInput label="Notes" value={recNotes} onChange={setRecNotes} placeholder="Optional remarks..." />

                            {/* Withdrawal preview */}
                            {recDate && recVaccineId && (() => {
                                const vax = inventory.find(v => v.id === recVaccineId);
                                if (!vax || vax.withdrawal_days === 0) return null;
                                const endDate = addDays(recDate, vax.withdrawal_days);
                                return (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#F59E0B' + '10', borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B' + '30' }}>
                                        <MaterialIcons name="timer" size={16} color="#F59E0B" />
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, flex: 1 }]}>
                                            Withdrawal ends <Text style={{ color: '#F59E0B', fontFamily: 'Poppins-SemiBold' }}>{formatDate(endDate)}</Text> ({vax.withdrawal_days} days)
                                        </Text>
                                    </View>
                                );
                            })()}

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                <TouchableOpacity onPress={handleCloseRecModal} disabled={savingRec}
                                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.cardFill, borderWidth: 1, borderColor: colors.stroke, alignItems: 'center' }}
                                    activeOpacity={0.7}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleLogVaccination} disabled={savingRec || !recVaccineId}
                                    style={{ flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: recVaccineId ? colors.primary : colors.primary + '50', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                                    activeOpacity={0.85}>
                                    {savingRec ? <ActivityIndicator size="small" color="#FFF" /> : <>
                                        <MaterialIcons name="vaccines" size={18} color="#FFF" />
                                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 14 }]}>Log Vaccination</Text>
                                    </>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Add Schedule Modal ────────────────────────────────────────── */}
            <Modal visible={showSchModal} transparent animationType="fade" onRequestClose={handleCloseSchModal}>
                <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={() => !savingSch && handleCloseSchModal()}
                    />
                    <Animated.View {...panSchResponder.panHandlers} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', transform: [{ translateY: Animated.add(slideSch, panYSch) }] }}>
                        {/* Draggable Header */}
                        <View style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                            <View style={styles.modalHandle} />
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center', marginTop: 4 }]}>Add Vaccine Schedule</Text>
                        </View>
                        <ScrollView
                            onScroll={(e) => {
                                isScrollAtTopSch.current = e.nativeEvent.contentOffset.y <= 0;
                            }}
                            scrollEventThrottle={16}
                            contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 60, gap: 16 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <VaccineSelect value={schVaccineId} onChange={setSchVaccineId} />
                            <BatchSelect  value={schBatchId}   onChange={setSchBatchId} />
                            <FormInput label="Scheduled Date *" value={schDate} onChange={setSchDate} placeholder="YYYY-MM-DD" />
                            <FormInput label="Repeat Every (days)" value={schInterval} onChange={setSchInterval} placeholder="Leave blank for one-time" keyboardType="numeric" />
                            <FormInput label="Notes" value={schNotes} onChange={setSchNotes} placeholder="Optional..." />

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                <TouchableOpacity onPress={handleCloseSchModal} disabled={savingSch}
                                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.cardFill, borderWidth: 1, borderColor: colors.stroke, alignItems: 'center' }}
                                    activeOpacity={0.7}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleAddSchedule} disabled={savingSch || !schVaccineId}
                                    style={{ flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: schVaccineId ? colors.primary : colors.primary + '50', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                                    activeOpacity={0.85}>
                                    {savingSch ? <ActivityIndicator size="small" color="#FFF" /> : <>
                                        <MaterialIcons name="event" size={18} color="#FFF" />
                                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 14 }]}>Add Schedule</Text>
                                    </>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Add Vaccine (Inventory) Modal ─────────────────────────────── */}
            <Modal visible={showInvModal} transparent animationType="fade" onRequestClose={handleCloseInvModal}>
                <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={() => !savingInv && handleCloseInvModal()}
                    />
                    <Animated.View {...panInvResponder.panHandlers} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', transform: [{ translateY: Animated.add(slideInv, panYInv) }] }}>
                        {/* Draggable Header */}
                        <View style={{ paddingVertical: 14, alignItems: 'center', width: '100%' }}>
                            <View style={styles.modalHandle} />
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, textAlign: 'center', marginTop: 4 }]}>Add Vaccine</Text>
                        </View>
                        <ScrollView
                            onScroll={(e) => {
                                isScrollAtTopInv.current = e.nativeEvent.contentOffset.y <= 0;
                            }}
                            scrollEventThrottle={16}
                            contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 60, gap: 16 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <FormInput label="Vaccine Name *" value={invName} onChange={setInvName} placeholder="e.g. Newcastle Disease Vaccine" />
                            <FormInput label="Type / Category" value={invType} onChange={setInvType} placeholder="e.g. Live Attenuated, Killed" />

                            {/* Species */}
                            <View>
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 8 }]}>Species</Text>
                                <View style={styles.segmentBar}>
                                    {(['chicken', 'pig', 'both'] as const).map(s => (
                                        <TouchableOpacity key={s} onPress={() => setInvSpecies(s)}
                                            style={[styles.segmentBtn, { borderColor: invSpecies === s ? colors.primary : colors.stroke, backgroundColor: invSpecies === s ? colors.primary + '15' : 'transparent' }]}
                                            activeOpacity={0.7}>
                                            <Text style={[textStyles.label, { color: invSpecies === s ? colors.primary : colors.textGrey, fontSize: 12 }]}>
                                                {s === 'both' ? 'Both' : s.charAt(0).toUpperCase() + s.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <FormInput label="Initial Stock" value={invStock} onChange={setInvStock} placeholder="e.g. 100" keyboardType="numeric" />

                            {/* Unit */}
                            <View>
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 8 }]}>Unit</Text>
                                <View style={styles.segmentBar}>
                                    {(['dose', 'ml', 'vial'] as const).map(u => (
                                        <TouchableOpacity key={u} onPress={() => setInvUnit(u)}
                                            style={[styles.segmentBtn, { borderColor: invUnit === u ? colors.primary : colors.stroke, backgroundColor: invUnit === u ? colors.primary + '15' : 'transparent' }]}
                                            activeOpacity={0.7}>
                                            <Text style={[textStyles.label, { color: invUnit === u ? colors.primary : colors.textGrey, fontSize: 12 }]}>{u}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <FormInput label="Dose per Animal" value={invDose} onChange={setInvDose} placeholder="e.g. 1" keyboardType="decimal-pad" />
                            <FormInput label="Withdrawal Days" value={invWithdrawal} onChange={setInvWithdrawal} placeholder="Days before safe for sale" keyboardType="numeric" />
                            <FormInput label="Reorder Alert Threshold" value={invReorder} onChange={setInvReorder} placeholder="e.g. 10" keyboardType="numeric" />

                            {/* Route */}
                            <View>
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 12, marginBottom: 8 }]}>Route of Administration</Text>
                                <View style={styles.segmentBar}>
                                    {['injection', 'oral', 'spray', 'eye_drop'].map(r => (
                                        <TouchableOpacity key={r} onPress={() => setInvRoute(r)}
                                            style={[styles.segmentBtn, { borderColor: invRoute === r ? colors.primary : colors.stroke, backgroundColor: invRoute === r ? colors.primary + '15' : 'transparent' }]}
                                            activeOpacity={0.7}>
                                            <Text style={[textStyles.label, { color: invRoute === r ? colors.primary : colors.textGrey, fontSize: 12 }]}>
                                                {r === 'eye_drop' ? 'Eye Drop' : r.charAt(0).toUpperCase() + r.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <FormInput label="Storage Temperature" value={invTemp} onChange={setInvTemp} placeholder="e.g. 2–8 °C" />
                            <FormInput label="Notes" value={invNotes} onChange={setInvNotes} placeholder="Optional..." />

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                <TouchableOpacity onPress={handleCloseInvModal} disabled={savingInv}
                                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.cardFill, borderWidth: 1, borderColor: colors.stroke, alignItems: 'center' }}
                                    activeOpacity={0.7}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleAddVaccine} disabled={savingInv || !invName.trim()}
                                    style={{ flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: invName.trim() ? colors.primary : colors.primary + '50', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                                    activeOpacity={0.85}>
                                    {savingInv ? <ActivityIndicator size="small" color="#FFF" /> : <>
                                        <MaterialIcons name="medication" size={18} color="#FFF" />
                                        <Text style={[textStyles.label, { color: '#FFF', fontSize: 14 }]}>Add Vaccine</Text>
                                    </>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>

            <Snackbar
                visible={snackVisible}
                message={snackMessage}
                type={snackType}
                onDismiss={() => setSnackVisible(false)}
            />
        </SafeAreaView>
    );
}
